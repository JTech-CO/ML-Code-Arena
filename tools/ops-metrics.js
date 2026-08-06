/**
 * 운영 지표 수집 + `IE` 경보 (docs/TECHNICAL.md §13.2, M7 DoD 5·6).
 *
 *   node --env-file-if-exists=.env tools/ops-metrics.js
 *   node --env-file-if-exists=.env tools/ops-metrics.js --json --window 1h
 *   node --env-file-if-exists=.env tools/ops-metrics.js --check      # cron 용
 *
 * **왜 `/metrics` 엔드포인트가 아닌가.** 지표는 판정 분포와 전환율을 담는다. 그것을
 * 공개 HTTP 표면에 두면 인증을 붙여야 하고, 인증이 붙은 엔드포인트는 언젠가 인증이
 * 풀린다. 1인 운영에서는 호스트에서 도는 cron 하나면 충분하고, 노출면이 0 이다.
 *
 * **경보의 정의**(DoD 6): `IE` 비율이 임계를 넘으면 세 가지가 동시에 일어난다.
 *   1. stderr 에 `ALERT` 로 시작하는 줄  — journald 가 잡는다
 *   2. `ALERT_WEBHOOK_URL` 이 있으면 POST — 사람에게 닿는 경로
 *   3. 종료 코드 1                      — cron·systemd 가 실패로 인식한다
 * 셋 다 있는 이유는 하나만 두면 그 하나가 조용히 끊겼을 때 아무도 모르기 때문이다.
 */

import process from 'node:process';

import { QUEUE_NAMES, queueLabel, VERDICTS } from '@mlca/shared';

import { createQueue, createRedis } from '../apps/worker/src/consumer/connection.js';
import { closePool, getPool } from '../apps/worker/src/result/db.js';

/** `IE` 비율 임계 (docs/TECHNICAL.md §13.2). 넘으면 인프라 이상 신호다. */
const IE_ALERT_RATIO = 0.005;

/** 표본이 이보다 적으면 비율을 신뢰하지 않는다. 1건 중 1건 IE 는 100% 지만 신호가 아니다. */
const MIN_SAMPLE = 20;

const USAGE = `사용법:
  node tools/ops-metrics.js [옵션]

옵션:
  --window <기간>   집계 구간. 30m · 6h · 7d 형식 (기본 24h)
  --json            JSON 한 줄로 낸다. 로그 수집기용
  --check           경보만 판정한다. 임계 초과 시 종료 코드 1
  --threshold <수>  IE 경보 임계 비율 (기본 0.005)`;

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

/**
 * `24h` → Postgres interval 문자열. 형식을 좁게 잡아 임의 문자열이 SQL 로 가지 않게 한다.
 * @param {string} window
 * @returns {string}
 */
function toInterval(window) {
  const match = /^(\d{1,5})(m|h|d)$/.exec(window);
  if (!match) throw new Error(`--window 형식이 올바르지 않다: ${window} (예: 30m · 24h · 7d)`);
  const unit = { m: 'minutes', h: 'hours', d: 'days' }[match[2] ?? 'h'];
  return `${match[1]} ${unit}`;
}

/**
 * 지표 1 — 큐 대기 길이와 대기 시간.
 *
 * 길이는 Redis 가 원본이다(아직 꺼내지지 않은 작업). 대기 시간은 DB 가 원본이다
 * (`created_at` → `judging_at`). 둘을 한 곳에서 읽으면 하나가 거짓말할 때 알 수 없다.
 *
 * @param {import('pg').Pool} pool
 * @param {string} interval
 */
async function queueMetrics(pool, interval) {
  const connection = createRedis();
  try {
    const queue = createQueue({ connection, name: QUEUE_NAMES.fast });
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    await queue.close();

    const delay = await pool.query(
      `SELECT count(*)::int AS judged,
              percentile_disc(0.5) WITHIN GROUP (
                ORDER BY extract(epoch FROM (judging_at - created_at)) * 1000) AS p50_ms,
              percentile_disc(0.95) WITHIN GROUP (
                ORDER BY extract(epoch FROM (judging_at - created_at)) * 1000) AS p95_ms
         FROM submissions
        WHERE judging_at IS NOT NULL
          AND created_at > now() - $1::interval`,
      [interval],
    );

    const stuck = await pool.query(
      `SELECT count(*)::int AS n FROM submissions
        WHERE status <> 'DONE' AND created_at < now() - interval '5 minutes'`,
    );

    const row = delay.rows[0] ?? {};
    return {
      queue_label: queueLabel(QUEUE_NAMES.fast),
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      // 5분 넘게 DONE 이 아닌 제출. 큐가 멈췄는지 보는 가장 빠른 신호다.
      stuck_over_5min: stuck.rows[0]?.n ?? 0,
      wait_p50_ms: row.p50_ms === null ? null : Math.round(Number(row.p50_ms)),
      wait_p95_ms: row.p95_ms === null ? null : Math.round(Number(row.p95_ms)),
      sample: row.judged ?? 0,
    };
  } finally {
    await connection.quit();
  }
}

/**
 * 지표 2 — 판정 분포와 `IE` 비율.
 *
 * `IE` 는 분모에서 빼지 않는다. `problem_stats` 뷰는 정답률을 낼 때 빼지만
 * (사용자 책임이 아니므로), 여기서는 **`IE` 가 얼마나 나는지가 관측 대상**이다.
 *
 * @param {import('pg').Pool} pool
 * @param {string} interval
 */
async function verdictMetrics(pool, interval) {
  const rows = await pool.query(
    `SELECT verdict, count(*)::int AS n
       FROM submissions
      WHERE verdict IS NOT NULL AND judged_at > now() - $1::interval
      GROUP BY verdict`,
    [interval],
  );

  /** @type {Record<string, number>} */
  const distribution = {};
  for (const verdict of VERDICTS) distribution[verdict] = 0;
  for (const row of rows.rows) distribution[row.verdict] = row.n;

  const total = Object.values(distribution).reduce((sum, n) => sum + n, 0);
  const ie = distribution['IE'] ?? 0;

  // IE 사유별 집계. 비율만 알려 주는 경보는 무엇을 고쳐야 하는지 말하지 않는다.
  const reasons = await pool.query(
    `SELECT coalesce(left(ie_reason, 80), '(사유 없음)') AS reason, count(*)::int AS n
       FROM submissions
      WHERE verdict = 'IE' AND judged_at > now() - $1::interval
      GROUP BY 1 ORDER BY n DESC LIMIT 5`,
    [interval],
  );

  return {
    total,
    distribution,
    ie_count: ie,
    ie_ratio: total > 0 ? ie / total : 0,
    ie_reasons: reasons.rows.map((row) => ({ reason: row.reason, count: row.n })),
  };
}

/**
 * 지표 3 — 워커 실패율.
 *
 * `attempts > 1` 은 한 번 이상 재시도됐다는 뜻이다. `IE` 로 확정되지 않았어도
 * 재시도가 늘고 있으면 인프라가 흔들리는 중이다 — 판정 분포보다 먼저 움직인다.
 *
 * @param {import('pg').Pool} pool
 * @param {string} interval
 */
async function workerMetrics(pool, interval) {
  const rows = await pool.query(
    `SELECT count(*)::int AS judged,
            count(*) FILTER (WHERE attempts > 1)::int AS retried,
            max(attempts)::int AS max_attempts
       FROM submissions
      WHERE status = 'DONE' AND judged_at > now() - $1::interval`,
    [interval],
  );

  const row = rows.rows[0] ?? {};
  const judged = row.judged ?? 0;
  return {
    judged,
    retried: row.retried ?? 0,
    retry_ratio: judged > 0 ? (row.retried ?? 0) / judged : 0,
    max_attempts: row.max_attempts ?? 0,
  };
}

/**
 * 지표 4 — 익명 → 가입 전환율.
 *
 * 승계(`merged_user_id`)가 곧 전환이다. 익명 한도를 마찰로 둔 결정(ADR-0005)이
 * 실제로 가입으로 이어지는지 보는 유일한 숫자다.
 *
 * @param {import('pg').Pool} pool
 * @param {string} interval
 */
async function conversionMetrics(pool, interval) {
  const rows = await pool.query(
    `SELECT count(*)::int AS sessions,
            count(*) FILTER (WHERE merged_user_id IS NOT NULL)::int AS converted,
            count(*) FILTER (WHERE solved_count > 0)::int AS engaged
       FROM anon_sessions
      WHERE created_at > now() - $1::interval`,
    [interval],
  );

  const row = rows.rows[0] ?? {};
  const sessions = row.sessions ?? 0;
  const engaged = row.engaged ?? 0;
  return {
    sessions,
    engaged,
    converted: row.converted ?? 0,
    // 전체가 아니라 **한 문제라도 푼 세션** 대비로 본다. 목록만 보고 떠난 방문자까지
    // 분모에 넣으면 한도 설계가 잘 도는지가 트래픽 구성에 묻힌다.
    conversion_ratio: engaged > 0 ? (row.converted ?? 0) / engaged : 0,
  };
}

/**
 * 경보를 실제로 내보낸다. 세 경로가 모두 독립이다 — 하나가 막혀도 나머지가 남는다.
 * @param {{ ratio: number, threshold: number, metrics: Record<string, any> }} alert
 */
async function raiseAlert(alert) {
  const percent = (alert.ratio * 100).toFixed(2);
  const limit = (alert.threshold * 100).toFixed(2);
  const top = alert.metrics['verdicts'].ie_reasons[0];

  const message =
    `ALERT IE 비율 ${percent}% > 임계 ${limit}% ` +
    `(${alert.metrics['verdicts'].ie_count}/${alert.metrics['verdicts'].total}건, ` +
    `구간 ${alert.metrics['window']})` +
    (top ? ` — 최다 사유: ${top.reason} (${top.count}건)` : '');

  console.error(message);

  const webhook = process.env['ALERT_WEBHOOK_URL'];
  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: message, metrics: alert.metrics }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        console.error(`ALERT 웹훅 응답 ${response.status} — 경보가 사람에게 닿지 않았다`);
      }
    } catch (error) {
      console.error(`ALERT 웹훅 실패: ${String(error)} — 경보가 사람에게 닿지 않았다`);
    }
  }
}

/** @param {Record<string, any>} m */
function printHuman(m) {
  const pct = (/** @type {number} */ value) => `${(value * 100).toFixed(2)}%`;
  const q = m['queue'];
  const v = m['verdicts'];
  const w = m['worker'];
  const c = m['conversion'];

  console.log(`구간 ${m['window']}  ·  ${m['collected_at']}`);
  console.log('');
  console.log('큐        대기 %d  진행 %d  지연 %d  실패 %d', q.waiting, q.active, q.delayed, q.failed);
  console.log(
    `          대기시간 P50 ${q.wait_p50_ms ?? '-'}ms  P95 ${q.wait_p95_ms ?? '-'}ms  (표본 ${q.sample})`,
  );
  if (q.stuck_over_5min > 0) {
    console.log(`          ! 5분 넘게 미완료 ${q.stuck_over_5min}건`);
  }
  console.log('');

  const shown = Object.entries(v.distribution).filter(([, n]) => Number(n) > 0);
  console.log(`판정      ${shown.map(([k, n]) => `${k} ${n}`).join('  ') || '(없음)'}`);
  console.log(`          IE ${v.ie_count}/${v.total} = ${pct(v.ie_ratio)}  (임계 ${pct(m['ie_threshold'])})`);
  for (const item of v.ie_reasons) console.log(`            ${item.count}회  ${item.reason}`);
  console.log('');

  console.log(`워커      완료 ${w.judged}  재시도 ${w.retried} (${pct(w.retry_ratio)})  최대시도 ${w.max_attempts}`);
  console.log('');
  console.log(
    `익명      세션 ${c.sessions}  풀이시작 ${c.engaged}  가입전환 ${c.converted} (${pct(c.conversion_ratio)})`,
  );
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags['help']) {
    console.log(USAGE);
    return;
  }

  const window = typeof flags['window'] === 'string' ? flags['window'] : '24h';
  const interval = toInterval(window);
  const threshold =
    typeof flags['threshold'] === 'string' ? Number.parseFloat(flags['threshold']) : IE_ALERT_RATIO;

  const pool = getPool();

  try {
    const [queue, verdicts, worker, conversion] = await Promise.all([
      queueMetrics(pool, interval),
      verdictMetrics(pool, interval),
      workerMetrics(pool, interval),
      conversionMetrics(pool, interval),
    ]);

    const metrics = {
      collected_at: new Date().toISOString(),
      window,
      ie_threshold: threshold,
      queue,
      verdicts,
      worker,
      conversion,
    };

    if (flags['json']) {
      console.log(JSON.stringify(metrics));
    } else if (!flags['check']) {
      printHuman(metrics);
    }

    // 표본이 적으면 비율이 요동친다. 경보가 늑대소년이 되면 아무도 안 본다.
    const enough = verdicts.total >= MIN_SAMPLE;
    if (enough && verdicts.ie_ratio > threshold) {
      await raiseAlert({ ratio: verdicts.ie_ratio, threshold, metrics });
      process.exitCode = 1;
    } else if (!flags['json'] && !flags['check']) {
      console.log('');
      console.log(
        enough
          ? '경보 없음 — IE 비율이 임계 이하'
          : `경보 판정 보류 — 표본 ${verdicts.total}건 (최소 ${MIN_SAMPLE}건)`,
      );
    }
  } finally {
    await closePool();
  }
}

await main().catch((error) => {
  console.error(String(error));
  process.exitCode = 2;
});
