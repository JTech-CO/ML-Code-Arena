/**
 * SSE 지속성 확인 (M7 DoD 4) — 프록시 뒤에서 연결이 끊기지 않는지 본다.
 *
 *   node tools/sse-soak.js --url http://localhost/api/stream/submissions --minutes 6
 *
 * **왜 별도 도구인가.** 프록시 버퍼링 문제는 기능 테스트로 안 잡힌다. 이벤트 하나를
 * 주고받는 것은 버퍼가 차든 말든 성공하고, 문제는 **아무 일도 없는 몇 분**에 드러난다
 * (RUNBOOK 27번). 그래서 재현 조건이 "오래 조용히 열어 두기"다.
 *
 * 판정 기준 셋:
 *   - 연결이 한 번도 끊기지 않았다 (재연결 0회)
 *   - 하트비트 주석이 15초 간격으로 계속 도착했다 — 버퍼링되면 뭉쳐서 온다
 *   - 하트비트 사이 최대 간격이 임계 이하다
 */

import process from 'node:process';

/** 서버 하트비트 주기 (apps/api/src/routes/stream.js). */
const HEARTBEAT_MS = 15_000;

/** 이보다 오래 조용하면 버퍼링되고 있다고 본다. 주기의 3배. */
const MAX_SILENCE_MS = HEARTBEAT_MS * 3;

/**
 * @param {string[]} argv
 * @returns {Record<string, string|boolean>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[token.slice(2)] = next;
      index += 1;
    } else {
      flags[token.slice(2)] = true;
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const url =
    typeof flags['url'] === 'string' ? flags['url'] : 'http://localhost/api/stream/submissions';
  const minutes = Number.parseFloat(String(flags['minutes'] ?? '6'));
  const durationMs = minutes * 60_000;

  console.log(`SSE 지속성 확인  ${url}  ${minutes}분`);
  console.log('');

  const started = Date.now();
  /** @type {number[]} */
  const gaps = [];
  let frames = 0;
  let events = 0;
  let reconnects = 0;
  let lastAt = started;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), durationMs);

  try {
    const response = await fetch(url, {
      headers: { accept: 'text/event-stream' },
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`연결 실패: HTTP ${response.status}`);
    }

    // 프록시가 압축을 걸면 하트비트가 압축 블록에 갇힌다. 헤더로 먼저 확인한다.
    const encoding = response.headers.get('content-encoding');
    const buffering = response.headers.get('x-accel-buffering');
    console.log(`  content-type      ${response.headers.get('content-type')}`);
    console.log(`  content-encoding  ${encoding ?? '(없음)'}`);
    console.log(`  x-accel-buffering ${buffering ?? '(없음)'}`);
    console.log('');

    if (encoding) {
      console.error(`  ! 압축이 걸려 있다 (${encoding}) — 하트비트가 뭉칠 수 있다`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        // 서버·프록시가 스트림을 닫았다. 시간이 남았다면 그 자체가 실패다.
        reconnects += 1;
        break;
      }

      const now = Date.now();
      const chunk = decoder.decode(value, { stream: true });

      for (const line of chunk.split('\n')) {
        if (line.startsWith(':')) {
          frames += 1;
          gaps.push(now - lastAt);
          lastAt = now;
          const elapsed = ((now - started) / 1000).toFixed(0);
          process.stdout.write(`\r  ${elapsed}s 경과 · 하트비트 ${frames}회 · 이벤트 ${events}건   `);
        } else if (line.startsWith('event:')) {
          events += 1;
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error(`\n연결 오류: ${String(error)}`);
      process.exitCode = 1;
      return;
    }
  } finally {
    clearTimeout(timer);
  }

  const elapsed = Date.now() - started;
  // 마지막 하트비트 이후 지금까지도 침묵 구간이다.
  gaps.push(Date.now() - lastAt);
  const maxGap = Math.max(...gaps);

  console.log('');
  console.log('');
  console.log(`지속       ${(elapsed / 1000).toFixed(0)}s  (목표 ${minutes * 60}s)`);
  console.log(`하트비트   ${frames}회  (기대 약 ${Math.floor(elapsed / HEARTBEAT_MS)}회)`);
  console.log(`최대 침묵  ${(maxGap / 1000).toFixed(1)}s  (임계 ${MAX_SILENCE_MS / 1000}s)`);
  console.log(`재연결     ${reconnects}회`);

  /** @type {string[]} */
  const failures = [];
  if (reconnects > 0) failures.push(`스트림이 ${reconnects}회 끊겼다`);
  if (elapsed < durationMs - 2000) failures.push(`목표 시간 전에 끝났다 (${(elapsed / 1000).toFixed(0)}s)`);
  if (maxGap > MAX_SILENCE_MS) failures.push(`침묵 ${(maxGap / 1000).toFixed(1)}s > ${MAX_SILENCE_MS / 1000}s — 버퍼링 의심`);
  if (frames === 0) failures.push('하트비트가 한 번도 오지 않았다');

  console.log('');
  if (failures.length > 0) {
    console.error('게이트 실패');
    for (const line of failures) console.error(`  - ${line}`);
    process.exitCode = 1;
  } else {
    console.log('게이트 통과 — 끊김 없음 · 하트비트 정상 간격');
  }
}

await main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
