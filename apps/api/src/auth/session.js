/**
 * 세션 — 서버 측 상태 + 서명 쿠키 (ADR-0004).
 *
 * JWT 를 쓰지 않는다. Phase 1 은 단일 인스턴스라 무상태성의 이득이 실현되지 않고,
 * 세션 무효화(로그아웃·비밀번호 변경)를 JWT 로 하려면 결국 블랙리스트라는 서버 상태를
 * 따로 만들게 된다.
 *
 * 저장소는 Redis 다. TTL 이 내장돼 있어 만료 정리를 따로 짤 필요가 없고,
 * 어차피 큐 때문에 이미 떠 있다.
 */

import { randomBytes } from 'node:crypto';

/** 로그인 세션 쿠키. */
export const SESSION_COOKIE = 'mlca_session';
/** 익명 세션 쿠키. 로그인 세션과 별개로 유지된다 — 승계 때 둘 다 필요하다. */
export const ANON_COOKIE = 'mlca_anon';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 2주

/**
 * 쿠키 공통 속성 (docs/TECHNICAL.md §8.1).
 * `SameSite=Lax` 는 최상위 내비게이션에는 쿠키를 붙이되 교차 사이트 POST 는 막는다.
 * @param {{ isProduction: boolean }} config
 */
export function cookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: /** @type {'lax'} */ ('lax'),
    path: '/',
    signed: true,
    maxAge: SESSION_TTL_SECONDS,
  };
}

/**
 * @param {import('ioredis').Redis} redis
 */
export function createSessionStore(redis) {
  return {
    /**
     * @param {string} userId
     * @returns {Promise<string>} 세션 ID
     */
    async create(userId) {
      const id = randomBytes(32).toString('base64url');
      await redis.set(`sess:${id}`, userId, 'EX', SESSION_TTL_SECONDS);
      return id;
    },

    /**
     * @param {string|null|undefined} id
     * @returns {Promise<string|null>} 사용자 ID
     */
    async read(id) {
      if (!id) return null;
      return redis.get(`sess:${id}`);
    },

    /**
     * @param {string|null|undefined} id
     * @returns {Promise<void>}
     */
    async destroy(id) {
      if (!id) return;
      await redis.del(`sess:${id}`);
    },
  };
}

/**
 * 서명 쿠키를 읽어 검증된 값만 돌려준다.
 *
 * 서명이 깨진 쿠키는 **없는 것으로 취급한다.** 위조된 세션 ID 로 남의 세션을 가리키거나,
 * 익명 세션 ID 를 바꿔 한도를 우회하는 경로를 막는다 (INV-9).
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {string} name
 * @returns {string|null}
 */
export function readSignedCookie(request, name) {
  const raw = request.cookies?.[name];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}
