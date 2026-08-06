/**
 * 채점 워커 진입점.
 *
 * 워커는 사용자 코드를 **직접 실행하지 않는다.** 큐에서 제출 ID 를 꺼내 격리 컨테이너를
 * 만들고, 결과를 DB 에 기록하고, 컨테이너를 지운다 (docs/TECHNICAL.md §3.3).
 * 이 전제가 깨지면 Docker 소켓 접근이 곧 호스트 루트 권한이 된다.
 */

import process from 'node:process';

import { queueLabel, VERDICT } from '@mlca/shared';

import { loadConfig } from './config.js';
import { createRedis, createWorker } from './consumer/connection.js';
import { createJudgeProcessor } from './consumer/judge-processor.js';
import { closePool } from './result/db.js';
import { recordResult } from './result/submissions.js';

const config = loadConfig(process.env);
const connection = createRedis();

const worker = createWorker({
  connection,
  concurrency: config.concurrency,
  name: config.queues.fast,
  processor: createJudgeProcessor({ image: config.judgeImage }),
});

worker.on('failed', (job, error) => {
  const attemptsMade = job?.attemptsMade ?? 0;
  console.error(`[worker] 실패 job=${job?.id} 시도=${attemptsMade}: ${error?.message}`);
});

worker.on('error', (error) => {
  console.error(`[worker] 큐 오류: ${error.message}`);
});

/**
 * 마지막 안전망 — BullMQ 가 재시도를 모두 소진했는데도 제출이 `DONE` 이 아니면
 * `IE` 로 확정한다. 여기까지 오면 프로세서가 결과를 못 쓴 것이고, 그대로 두면
 * 사용자에게 영원히 "채점 중"으로 보인다.
 */
worker.on('failed', async (job) => {
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  const submissionId = job.data?.submission_id;
  if (!submissionId) return;
  try {
    await recordResult({ submissionId, verdict: VERDICT.IE, output: null });
    console.error(`[worker] ${submissionId} 재시도 소진 → IE 확정`);
  } catch (error) {
    console.error(`[worker] IE 확정 실패 ${submissionId}: ${String(error)}`);
  }
});

console.log(
  `[worker] 기동 — 큐=${queueLabel(config.queues.fast)} 동시성=${config.concurrency} 이미지=${config.judgeImage}`,
);

/** @param {NodeJS.Signals} signal */
async function shutdown(signal) {
  console.log(`[worker] ${signal} 수신 — 진행 중 작업을 마치고 종료한다`);
  try {
    await worker.close();
    await connection.quit();
    await closePool();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
