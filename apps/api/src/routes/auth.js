/**
 * 인증 라우트 (docs/TECHNICAL.md §7.1·§8).
 *
 * 로그인·가입 시 쿠키에 익명 세션이 있으면 **로그인 트랜잭션 안에서** 승계한다.
 * 쿠키를 먼저 지우면 이력이 유실된다 (RUNBOOK 29번).
 */

import { ANON_PROBLEM_LIMIT } from '@mlca/shared';

import { mergeAnonIntoUser } from '../auth/merge.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { ANON_COOKIE, SESSION_COOKIE, cookieOptions } from '../auth/session.js';
import { distinctProblemCount, findAnonSession } from '../db/anon.js';
import { createUser, exists, findByEmail, findById } from '../db/users.js';
import { userView } from '../serialize.js';

const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ config: import('../config.js').ApiConfig, sessions: ReturnType<typeof import('../auth/session.js').createSessionStore> }} deps
 */
export function registerAuthRoutes(app, deps) {
  const { config, sessions } = deps;

  /**
   * 로그인 성공 처리 — 승계 후 세션 발급, 그다음에야 익명 쿠키를 지운다.
   * @param {import('fastify').FastifyReply} reply
   * @param {import('fastify').FastifyRequest} request
   * @param {{ id: string, email: string, handle: string }} user
   */
  async function completeLogin(reply, request, user) {
    const anonSessionId = request.auth?.anonSessionId ?? null;

    let merged = { movedSubmissions: 0, solvedAdded: 0 };
    if (anonSessionId) {
      merged = await mergeAnonIntoUser({ anonSessionId, userId: user.id });
    }

    const sessionId = await sessions.create(user.id);
    reply.setCookie(SESSION_COOKIE, sessionId, cookieOptions(config));

    // 승계가 끝난 뒤에 지운다. 순서가 뒤집히면 이력이 고아가 된다.
    if (anonSessionId) reply.clearCookie(ANON_COOKIE, { path: '/' });

    return { user: userView(user), merged };
  }

  app.post('/api/auth/register', async (request, reply) => {
    const body = /** @type {Record<string, unknown>} */ (request.body ?? {});
    const email = String(body['email'] ?? '').trim().toLowerCase();
    const handle = String(body['handle'] ?? '').trim();
    const password = String(body['password'] ?? '');

    if (!EMAIL_PATTERN.test(email)) {
      return reply.code(400).send({ code: 'INVALID_EMAIL', message: '이메일 형식이 올바르지 않습니다.' });
    }
    if (!HANDLE_PATTERN.test(handle)) {
      return reply
        .code(400)
        .send({ code: 'INVALID_HANDLE', message: '핸들은 영문·숫자·밑줄 3~20자입니다.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return reply
        .code(400)
        .send({ code: 'WEAK_PASSWORD', message: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` });
    }

    // 어느 쪽이 중복인지 알려주지 않는다. 알려주면 계정 목록을 확인하는 통로가 된다.
    if (await exists({ email, handle })) {
      return reply
        .code(409)
        .send({ code: 'ALREADY_EXISTS', message: '이미 사용 중인 이메일 또는 핸들입니다.' });
    }

    const user = await createUser({ email, handle, passwordHash: await hashPassword(password) });
    return reply.code(201).send(await completeLogin(reply, request, user));
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = /** @type {Record<string, unknown>} */ (request.body ?? {});
    const email = String(body['email'] ?? '').trim().toLowerCase();
    const password = String(body['password'] ?? '');

    const user = await findByEmail(email);

    // 사용자가 없어도 검증을 건너뛰지 않는다 — 응답 시간 차이로 계정 존재 여부가 드러난다.
    const ok = user
      ? await verifyPassword(user.password_hash, password)
      : await verifyPassword('$argon2id$v=19$m=65536,t=3,p=4$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', password);

    if (!user || !ok) {
      return reply
        .code(401)
        .send({ code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    return reply.send(await completeLogin(reply, request, user));
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await sessions.destroy(request.auth?.sessionId ?? null);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const userId = request.auth?.userId ?? null;

    if (userId) {
      const user = await findById(userId);
      if (user) return reply.send({ authenticated: true, user: userView(user) });
    }

    const anonSessionId = request.auth?.anonSessionId ?? null;
    const session = anonSessionId ? await findAnonSession(anonSessionId) : null;
    const used = session ? await distinctProblemCount(session.id) : 0;

    return reply.send({
      authenticated: false,
      user: null,
      anonymous: {
        solved_count: used,
        limit: ANON_PROBLEM_LIMIT,
        remaining: Math.max(0, ANON_PROBLEM_LIMIT - used),
      },
    });
  });
}
