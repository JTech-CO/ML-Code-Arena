/**
 * API 진입점.
 *
 * 채점은 여기서 하지 않는다. 제출을 접수해 큐에 넣을 뿐이고, 컨테이너를 만드는 것은
 * 워커 몫이다 (docs/FILE_TREE.md §2).
 */

import process from 'node:process';

import { createSessionStore } from './auth/session.js';
import { loadConfig } from './config.js';
import { closePool, getPool } from './db/pool.js';
import { createJudgeQueue, createRedis } from './queue/producer.js';
import { createRateLimiter } from './rate-limit.js';
import { buildServer } from './server.js';
import { createSubmissionStream } from './sse/stream.js';

const config = loadConfig(process.env);

getPool(config.databaseUrl);

const redis = createRedis(config.redisUrl);
const queue = createJudgeQueue(redis);
const stream = createSubmissionStream({
  databaseUrl: config.databaseUrl,
  logger: { error: (message) => console.error(`[api] ${message}`) },
});

const app = await buildServer({
  config,
  sessions: createSessionStore(redis),
  queue,
  rateLimiter: createRateLimiter(redis),
  stream,
});

await stream.start();

/** @param {NodeJS.Signals} signal */
async function shutdown(signal) {
  app.log.info(`${signal} 수신 — 종료한다`);
  try {
    await app.close();
    await stream.close();
    await queue.close();
    await redis.quit();
    await closePool();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
