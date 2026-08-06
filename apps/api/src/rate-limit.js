/**
 * 제출 빈도 제한 (docs/TECHNICAL.md §7.3).
 *
 * **큐 앞단에서 차단한다.** 채점 자원이 유한하므로, 큐에 들어간 뒤 거르면 이미 늦다.
 *
 * Redis 의 TTL 을 그대로 쓴다. 만료 정리를 따로 짤 필요가 없고, 카운터가 프로세스
 * 메모리에 있으면 API 를 재시작할 때마다 제한이 풀린다.
 */

import { RATE_LIMITS } from '@mlca/shared';

/**
 * @typedef {object} RateDecision
 * @property {boolean} allowed
 * @property {number} [retryAfterSeconds]
 * @property {'problem'|'minute'} [scope]
 */

/**
 * @param {import('ioredis').Redis} redis
 */
export function createRateLimiter(redis) {
  return {
    /**
     * @param {{ ownerKey: string, problemId: string, isAnonymous: boolean }} input
     * @returns {Promise<RateDecision>}
     */
    async check(input) {
      const limits = input.isAnonymous ? RATE_LIMITS.anon : RATE_LIMITS.user;

      // 분당 상한을 먼저 본다. 문제별 쿨다운만 보면 문제를 바꿔 가며 무한히 넣을 수 있다.
      const minuteKey = `rl:min:${input.ownerKey}`;
      const used = await redis.incr(minuteKey);
      if (used === 1) await redis.expire(minuteKey, 60);

      if (used > limits.perMinute) {
        const ttl = await redis.ttl(minuteKey);
        return { allowed: false, scope: 'minute', retryAfterSeconds: Math.max(1, ttl) };
      }

      const problemKey = `rl:sub:${input.ownerKey}:${input.problemId}`;
      const cooldownSeconds = Math.ceil(limits.perProblemMs / 1000);
      const acquired = await redis.set(problemKey, '1', 'EX', cooldownSeconds, 'NX');

      if (acquired === null) {
        const ttl = await redis.ttl(problemKey);
        return { allowed: false, scope: 'problem', retryAfterSeconds: Math.max(1, ttl) };
      }

      return { allowed: true };
    },
  };
}
