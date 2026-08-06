/**
 * Redis 연결과 큐 인스턴스 (ADR-0001).
 *
 * 큐 이름은 `@mlca/shared` 의 `QUEUE_NAMES` 단일 출처를 쓴다. API 와 워커가 다른
 * 문자열을 쓰면 제출이 `PENDING` 에서 멈추고, 그 증상은 원인을 짐작하기 어렵다
 * (RUNBOOK 20번).
 */

import { Queue, Worker } from 'bullmq';
// ioredis 6 은 ESM 네이티브라 default export 가 모듈 네임스페이스로 잡힌다.
// 명명 import 는 v5·v6 양쪽에서 동일하게 동작한다.
import { Redis } from 'ioredis';

import { QUEUE_NAMES, QUEUE_PREFIX } from '@mlca/shared';

/**
 * BullMQ 는 블로킹 명령(BRPOPLPUSH 등)을 쓰므로 재시도 상한이 없어야 한다.
 * `maxRetriesPerRequest: null` 을 주지 않으면 BullMQ 가 기동 시 거부한다.
 * @param {string} [url]
 * @returns {Redis}
 */
export function createRedis(url) {
  return new Redis(url ?? process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
  });
}

/**
 * 채점 작업의 재시도 정책.
 *
 * **`IE` 에만 적용된다.** `WA`·`TLE` 를 재시도하면 사용자 코드가 여러 번 실행되어
 * 자원이 낭비되고 통계가 오염된다. 워커는 `IE` 일 때만 예외를 던져 재시도를 유발하고,
 * 나머지 판정은 정상 완료로 처리한다.
 */
export const JOB_OPTIONS = Object.freeze({
  attempts: 3, // 최초 1회 + 자동 재시도 2회
  backoff: Object.freeze({ type: 'fixed', delay: 500 }),
  removeOnComplete: Object.freeze({ age: 3600, count: 1000 }),
  removeOnFail: Object.freeze({ age: 86_400 }),
});

/** `JOB_OPTIONS.attempts` 와 같은 값. 워커가 마지막 시도인지 판단할 때 쓴다. */
export const MAX_ATTEMPTS = JOB_OPTIONS.attempts;

/**
 * 큐 생산자. API(M3)와 개발 CLI 가 쓴다.
 * @param {{ connection: Redis, name?: string }} options
 * @returns {Queue}
 */
export function createQueue(options) {
  return new Queue(options.name ?? QUEUE_NAMES.fast, {
    connection: options.connection,
    prefix: QUEUE_PREFIX,
  });
}

/**
 * 큐 소비자.
 * @param {{ connection: Redis, concurrency: number, name?: string, processor: (job: any) => Promise<any> }} options
 * @returns {Worker}
 */
export function createWorker(options) {
  return new Worker(options.name ?? QUEUE_NAMES.fast, options.processor, {
    connection: options.connection,
    prefix: QUEUE_PREFIX,
    concurrency: options.concurrency,
    // 워커가 죽으면 작업이 JUDGING 상태로 고아가 된다. BullMQ 가 락 만료를 감지해
    // 회수하도록 stalled 검사를 켜 둔다. 채점은 최대 10초이므로 30초면 충분히 보수적이다.
    stalledInterval: 30_000,
    maxStalledCount: 2,
  });
}
