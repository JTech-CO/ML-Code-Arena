/**
 * Fastify 인스턴스 조립.
 *
 * 테스트는 `app.inject()` 로 네트워크 없이 라우트를 두드린다. 그래서 `buildServer` 가
 * 의존성을 인자로 받고 자기 안에서 만들지 않는다 — 테스트가 Redis·큐를 갈아끼울 수 있어야 한다.
 */

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';

import { SOURCE_MAX_BYTES } from '@mlca/shared';

import { SESSION_COOKIE, ANON_COOKIE, readSignedCookie } from './auth/session.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerContentRoutes } from './routes/content.js';
import { registerStreamRoutes } from './routes/stream.js';
import { registerSubmissionRoutes } from './routes/submissions.js';

/**
 * 요청 본문 상한. 제출 본문은 `source` 외에 slug·language 를 포함하고 JSON 이스케이프로
 * 부풀 수 있으므로 여유를 둔다. `source` 자체의 검증은 제출 라우트가 한다.
 */
const BODY_LIMIT_BYTES = SOURCE_MAX_BYTES + 8 * 1024;

/**
 * @typedef {object} RequestAuth
 * @property {string|null} sessionId
 * @property {string|null} userId
 * @property {string|null} anonSessionId
 */

/**
 * @param {{
 *   config: import('./config.js').ApiConfig,
 *   sessions: ReturnType<typeof import('./auth/session.js').createSessionStore>,
 *   queue: import('bullmq').Queue,
 *   rateLimiter: ReturnType<typeof import('./rate-limit.js').createRateLimiter>,
 *   stream: ReturnType<typeof import('./sse/stream.js').createSubmissionStream>,
 *   logger?: boolean,
 * }} deps
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function buildServer(deps) {
  const app = Fastify({
    logger: deps.logger ?? true,
    bodyLimit: BODY_LIMIT_BYTES,
  });

  await app.register(cookie, { secret: deps.config.sessionSecret });
  await app.register(cors, {
    origin: deps.config.corsOrigins,
    // 세션 쿠키가 오가야 하므로 자격증명을 허용한다. 그래서 origin 은 반드시
    // 명시 목록이어야 한다 — `true`(반사)로 두면 어떤 사이트에서도 인증된 요청이 된다.
    credentials: true,
  });

  app.decorateRequest('auth', null);

  /**
   * 매 요청의 신원을 정한다.
   *
   * 서명이 깨진 쿠키는 없는 것으로 취급한다. 클라이언트가 보낸 본문·헤더의 어떤 값도
   * 신원이나 카운트로 쓰지 않는다 (INV-9).
   */
  app.addHook('preHandler', async (request) => {
    const sessionId = readSignedCookie(request, SESSION_COOKIE);
    const userId = await deps.sessions.read(sessionId);
    const anonSessionId = readSignedCookie(request, ANON_COOKIE);

    request.auth = /** @type {RequestAuth} */ ({
      sessionId,
      userId,
      // 로그인 상태면 익명 신원은 소유자 판단에 쓰지 않는다. 단 승계를 위해 값은 남긴다.
      anonSessionId,
    });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  registerAuthRoutes(app, { config: deps.config, sessions: deps.sessions });
  registerSubmissionRoutes(app, {
    config: deps.config,
    queue: deps.queue,
    rateLimiter: deps.rateLimiter,
  });
  registerContentRoutes(app);
  registerStreamRoutes(app, { stream: deps.stream });

  return app;
}
