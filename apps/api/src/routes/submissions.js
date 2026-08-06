/**
 * 제출 라우트 (docs/TECHNICAL.md §7.2·§7.3·§8.2).
 *
 * 제출은 항상 비동기다 (ADR-0001). `202 Accepted` 로 접수하고 채점은 큐가 맡는다.
 */

import { ANON_PROBLEM_LIMIT, SOURCE_MAX_BYTES } from '@mlca/shared';

import { clientIp, hmac } from '../auth/ip.js';
import { ANON_COOKIE, cookieOptions } from '../auth/session.js';
import {
  createAnonSession,
  distinctProblemCount,
  findAnonSession,
  hasAttempted,
  syncSolvedCount,
} from '../db/anon.js';
import { findBySlug } from '../db/problems.js';
import { createSubmission, findById, listRecent, queuePosition } from '../db/submissions.js';
import { enqueueJudge } from '../queue/producer.js';
import { submissionView } from '../serialize.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   config: import('../config.js').ApiConfig,
 *   queue: import('bullmq').Queue,
 *   rateLimiter: ReturnType<typeof import('../rate-limit.js').createRateLimiter>,
 * }} deps
 */
export function registerSubmissionRoutes(app, deps) {
  const { config, queue, rateLimiter } = deps;

  /**
   * 익명 세션을 확보한다. 없거나 서명이 깨졌으면 **새로 만든다**.
   *
   * 위조된 쿠키가 새 세션을 받는 것은 쿠키를 지운 것과 같다 — ADR-0005 가 수용한
   * 우회 경로다. 중요한 것은 위조로 **남의 세션을 가리키거나 카운트를 낮출 수 없다**는
   * 점이다. 카운트는 항상 서버가 제출 이력에서 센다 (INV-9).
   *
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @returns {Promise<string>}
   */
  async function ensureAnonSession(request, reply) {
    const current = request.auth?.anonSessionId ?? null;
    if (current) {
      const session = await findAnonSession(current);
      // 이미 계정으로 승계된 세션은 재사용하지 않는다.
      if (session && !session.merged_user_id) return session.id;
    }

    const id = await createAnonSession({
      ipHash: hmac(config.ipHashSecret, clientIp(request)),
      uaHash: hmac(config.ipHashSecret, request.headers['user-agent'] ?? ''),
    });
    reply.setCookie(ANON_COOKIE, id, cookieOptions(config));
    if (request.auth) request.auth.anonSessionId = id;
    return id;
  }

  app.post('/api/submissions', async (request, reply) => {
    const body = /** @type {Record<string, unknown>} */ (request.body ?? {});
    const slug = String(body['problem_slug'] ?? '');
    const language = String(body['language'] ?? 'python');
    const source = typeof body['source'] === 'string' ? body['source'] : '';

    // 크기 검사가 먼저다. I/O 없이 거를 수 있는 것을 DB 조회 뒤로 미룰 이유가 없다.
    if (Buffer.byteLength(source, 'utf8') > SOURCE_MAX_BYTES) {
      return reply
        .code(400)
        .send({ code: 'SOURCE_TOO_LARGE', message: `소스는 ${SOURCE_MAX_BYTES / 1024}KB 를 넘을 수 없습니다.` });
    }
    if (!source.trim()) {
      return reply.code(400).send({ code: 'SOURCE_TOO_LARGE', message: '소스가 비어 있습니다.' });
    }

    const problem = await findBySlug(slug);
    if (!problem || !problem.is_published) {
      return reply.code(404).send({ code: 'PROBLEM_NOT_FOUND', message: '문제를 찾을 수 없습니다.' });
    }
    if (!problem.allowed_languages.includes(language)) {
      return reply
        .code(400)
        .send({ code: 'PROBLEM_NOT_FOUND', message: '이 문제에서 지원하지 않는 언어입니다.' });
    }

    const userId = request.auth?.userId ?? null;
    const anonSessionId = userId ? null : await ensureAnonSession(request, reply);

    // 빈도 제한이 익명 한도보다 먼저다. 한도 검사를 먼저 두면 한도에 걸린 요청이
    // 제한 없이 DB 를 두드릴 수 있다 (docs/TECHNICAL.md §7.3 — 큐 앞단 차단).
    const decision = await rateLimiter.check({
      ownerKey: userId ?? `anon:${anonSessionId}`,
      problemId: problem.id,
      isAnonymous: !userId,
    });
    if (!decision.allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(decision.retryAfterSeconds ?? 10))
        .send({
          code: 'RATE_LIMITED',
          message:
            decision.scope === 'problem'
              ? '같은 문제에 너무 자주 제출했습니다. 잠시 후 다시 시도하세요.'
              : '제출이 너무 잦습니다. 잠시 후 다시 시도하세요.',
        });
    }

    // 익명 한도는 **고유 문제 수**다. 이미 손댄 문제면 한도를 소진하지 않는다.
    if (anonSessionId) {
      const alreadyAttempted = await hasAttempted(anonSessionId, problem.id);
      if (!alreadyAttempted) {
        const used = await distinctProblemCount(anonSessionId);
        if (used >= ANON_PROBLEM_LIMIT) {
          return reply.code(403).send({
            code: 'ANON_LIMIT_REACHED',
            message: `비로그인 상태에서는 ${ANON_PROBLEM_LIMIT}문제까지 풀 수 있습니다. 가입하면 지금까지 푼 기록이 그대로 유지됩니다.`,
            solved_count: used,
            limit: ANON_PROBLEM_LIMIT,
          });
        }
      }
    }

    const submission = await createSubmission({
      problemId: problem.id,
      userId,
      anonSessionId,
      language,
      source,
    });

    await enqueueJudge(queue, submission.id);
    if (anonSessionId) await syncSolvedCount(anonSessionId);

    return reply.code(202).send({
      submission_id: submission.id,
      status: 'PENDING',
      queue_position: await queuePosition(submission.id),
    });
  });

  app.get('/api/submissions/:id', async (request, reply) => {
    const params = /** @type {{ id: string }} */ (request.params);
    const row = await findById(params.id);
    if (!row) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: '제출을 찾을 수 없습니다.' });
    }
    return reply.send(submissionView(row));
  });

  app.get('/api/submissions', async (request, reply) => {
    const query = /** @type {{ limit?: string }} */ (request.query ?? {});
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const rows = await listRecent({ limit: Number.isFinite(limit) ? limit : 50 });
    return reply.send({ submissions: rows.map(submissionView) });
  });
}
