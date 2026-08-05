import Fastify from 'fastify';

import { SOURCE_MAX_BYTES } from '@mlca/shared';

/**
 * 요청 본문 상한. 제출 본문은 `source` 외에 `problem_slug`·`language` 를 포함하고
 * JSON 이스케이프로 부풀 수 있으므로 여유를 둔다.
 * `source` 자체의 64KB 검증(`SOURCE_TOO_LARGE`)은 M3 의 제출 라우트가 담당한다.
 */
const BODY_LIMIT_BYTES = SOURCE_MAX_BYTES + 8 * 1024;

/**
 * Fastify 인스턴스를 조립한다. 라우트는 M3 에서 `src/routes/` 로 등록한다.
 * @param {{ logger?: boolean }} [options]
 * @returns {import('fastify').FastifyInstance}
 */
export function buildServer(options = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: BODY_LIMIT_BYTES,
  });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
