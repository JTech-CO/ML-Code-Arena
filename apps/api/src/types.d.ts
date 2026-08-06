/**
 * Fastify 요청에 붙는 신원 정보.
 *
 * `preHandler` 훅이 매 요청마다 채운다. 클라이언트가 보낸 값은 여기 들어오지 않는다 —
 * 서명이 검증된 쿠키에서만 나온다 (INV-9).
 */
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      /** 로그인 세션 ID. Redis 키의 일부이며 응답에 실리지 않는다 */
      sessionId: string | null;
      /** 로그인 사용자 ID. 없으면 비로그인 */
      userId: string | null;
      /** 익명 세션 ID. 로그인 상태에서도 승계를 위해 남아 있을 수 있다 */
      anonSessionId: string | null;
    } | null;
  }
}
