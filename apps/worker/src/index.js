/**
 * 채점 워커 진입점.
 *
 * M0 에서는 설정 로드만 확인한다. 큐 소비(`src/consumer/`)·컨테이너 실행(`src/sandbox/`)·
 * 결과 기록(`src/result/`)은 M1·M2 에서 구현한다.
 *
 * 워커는 사용자 코드를 직접 실행하지 않는다. 오직 컨테이너 생성만 담당한다
 * (docs/TECHNICAL.md §3.3).
 */

import { loadConfig } from './config.js';

const config = loadConfig(process.env);

console.log(
  '[worker] M0 스캐폴딩 — 큐 소비는 M2 에서 구현한다.',
  JSON.stringify({
    judgeImage: config.judgeImage,
    concurrency: config.concurrency,
    queues: config.queues,
  }),
);
