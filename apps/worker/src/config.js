/**
 * 워커 설정 로드. 환경변수 목록은 docs/ENVIRONMENT.md §3.
 *
 * 큐 이름과 이미지 태그는 `@mlca/shared` 의 상수를 기본값으로 쓴다.
 * API 와 워커가 다른 큐 이름을 쓰면 제출이 `PENDING` 에서 멈춘다 (RUNBOOK 20번).
 */

import { JUDGE_IMAGE_DEFAULT, QUEUE_NAMES, WORKER_CONCURRENCY_DEFAULT } from '@mlca/shared';

/**
 * @typedef {object} WorkerConfig
 * @property {string} judgeImage 채점 컨테이너 이미지 태그
 * @property {number} concurrency 동시 채점 수
 * @property {{ fast: string, slow: string }} queues 소비할 큐 이름
 * @property {string} nodeEnv
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {WorkerConfig}
 */
export function loadConfig(env) {
  const rawConcurrency = env['WORKER_CONCURRENCY'] ?? String(WORKER_CONCURRENCY_DEFAULT);
  const concurrency = Number.parseInt(rawConcurrency, 10);

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`WORKER_CONCURRENCY 값이 올바르지 않습니다: ${rawConcurrency}`);
  }

  return {
    judgeImage: env['JUDGE_IMAGE'] ?? JUDGE_IMAGE_DEFAULT,
    concurrency,
    queues: { fast: QUEUE_NAMES.fast, slow: QUEUE_NAMES.slow },
    nodeEnv: env['NODE_ENV'] ?? 'development',
  };
}
