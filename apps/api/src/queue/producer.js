/**
 * 채점 큐 생산자.
 *
 * `apps/worker` 의 큐 코드를 재사용하지 않는다 — 두 앱은 서로를 import 할 수 없다
 * (INV-3). 공유되는 것은 계약뿐이며 `packages/shared` 의 `QUEUE_PREFIX`·`QUEUE_NAMES` 다.
 * 그 상수가 갈라지면 제출이 `PENDING` 에서 멈춘다 (RUNBOOK 20번).
 */

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { QUEUE_NAMES, QUEUE_PREFIX } from '@mlca/shared';

/**
 * 워커의 재시도 정책과 같은 값이어야 한다. 생산자가 정하는 값이므로 여기 둔다.
 * `IE` 에만 재시도가 적용되는 판단은 워커가 한다 — 여기서는 시도 상한만 정한다.
 */
export const JOB_OPTIONS = Object.freeze({
  attempts: 3,
  backoff: Object.freeze({ type: 'fixed', delay: 500 }),
  removeOnComplete: Object.freeze({ age: 3600, count: 1000 }),
  removeOnFail: Object.freeze({ age: 86_400 }),
});

/**
 * @param {string} [url]
 * @returns {Redis}
 */
export function createRedis(url) {
  return new Redis(url ?? process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
  });
}

/**
 * @param {import('ioredis').Redis} connection
 * @returns {Queue}
 */
export function createJudgeQueue(connection) {
  return new Queue(QUEUE_NAMES.fast, { connection, prefix: QUEUE_PREFIX });
}

/**
 * 채점 작업을 넣는다. 페이로드는 제출 ID 하나다 (`JudgeJob`).
 * @param {Queue} queue
 * @param {string} submissionId
 * @returns {Promise<void>}
 */
export async function enqueueJudge(queue, submissionId) {
  await queue.add('judge', { submission_id: submissionId }, JOB_OPTIONS);
}
