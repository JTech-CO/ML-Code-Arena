/**
 * IP·UA 해시 (docs/TECHNICAL.md §6.3).
 *
 * **원본 IP 를 저장하지 않는다.** 익명 사용자 식별에는 해시로 충분하고, 원본을 들고
 * 있으면 유출 시 잃을 것이 커진다. 키는 `IP_HASH_SECRET` 이며 `SESSION_SECRET` 과
 * 반드시 다르다 — 같으면 세션 유출이 곧 IP 역산이 된다.
 */

import { createHmac } from 'node:crypto';

/**
 * @param {string} secret
 * @param {string} value
 * @returns {Buffer}
 */
export function hmac(secret, value) {
  return createHmac('sha256', secret).update(value).digest();
}

/**
 * 요청에서 클라이언트 IP 를 뽑는다.
 *
 * 프록시 헤더를 **신뢰하지 않는다.** `X-Forwarded-For` 는 클라이언트가 임의로 보낼 수
 * 있어, 그대로 쓰면 익명 식별을 헤더 하나로 흔들 수 있다 (INV-9). 리버스 프록시 뒤에
 * 배치할 때는 Fastify 의 `trustProxy` 를 명시적으로 켜서 신뢰 범위를 정한다 — M7 몫이다.
 *
 * @param {{ ip: string }} request
 * @returns {string}
 */
export function clientIp(request) {
  return request.ip ?? '0.0.0.0';
}
