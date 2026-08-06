/**
 * M2 게이트 하네스 — 제출 N건을 큐에 넣고 수렴·동시성·지연·잔존물을 관측한다.
 *
 *   node --env-file-if-exists=.env tools/bench-submit.js --count 20 --concurrency 20
 *   node --env-file-if-exists=.env tools/bench-submit.js --induce-ie
 *
 * 워커는 **별도로 떠 있어야 한다** (`pnpm dev:worker`). 이 도구는 생산자일 뿐이다.
 * 한 프로세스에서 생산과 소비를 다 하면 동시성 관측이 무의미해진다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createQueue, createRedis, JOB_OPTIONS } from '../apps/worker/src/consumer/connection.js';
import { closePool, getPool } from '../apps/worker/src/result/db.js';
import { docker } from '../apps/worker/src/sandbox/docker.js';
import { resolveProblemDir } from '../apps/worker/src/sandbox/problem-dir.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
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
 * 벤치용 사용자. `solved` 기록 경로까지 태우려면 로그인 사용자가 있어야 한다.
 *
 * 해시는 **진짜 argon2id** 다. 자리표시자를 넣으면 "DB 에 약한 해시가 없다"는 명제가
 * 이 도구 하나 때문에 깨진다(M3 DoD 9). 스키마의 CHECK 제약도 거부한다.
 * 이 계정으로 로그인하는 경로는 없으므로 원문 비밀번호는 의미가 없다.
 * @returns {Promise<string>}
 */
const BENCH_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$ZlOgs3o70id7E3jd9q8W7Q$3/upbSK7mdVpz85MMUwCWepqUdQNM56tUl1IQdvB0zw';

async function ensureUser() {
  const result = await getPool().query(
    `INSERT INTO users (email, password_hash, handle)
     VALUES ('bench@local', $1, 'bench')
     ON CONFLICT (email) DO UPDATE SET last_seen_at = now()
     RETURNING id`,
    [BENCH_PASSWORD_HASH],
  );
  return result.rows[0].id;
}

/**
 * 문제 정의를 DB 에 올린다. M6 의 problem-sync 가 할 일을 최소 형태로 대신한다.
 * @param {string} slug
 * @returns {Promise<string>}
 */
async function ensureProblem(slug) {
  const dir = await resolveProblemDir(slug, ROOT);
  const problem = JSON.parse(await readFile(path.join(dir, 'problem.json'), 'utf8'));

  const result = await getPool().query(
    `INSERT INTO problems (slug, title, tier, difficulty, entrypoint,
                           time_limit_ms, memory_limit_mb, restrictions, compare_options, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
     ON CONFLICT (slug) DO UPDATE
        SET restrictions = EXCLUDED.restrictions,
            compare_options = EXCLUDED.compare_options,
            entrypoint = EXCLUDED.entrypoint
     RETURNING id`,
    [
      problem.slug,
      problem.title,
      problem.tier,
      problem.difficulty,
      problem.entrypoint,
      problem.time_limit_ms ?? 10000,
      problem.memory_limit_mb ?? 512,
      problem.restrictions ?? {},
      problem.compare_options ?? {},
    ],
  );
  return result.rows[0].id;
}

/**
 * 디렉터리가 없는 문제를 만든다. 워커가 `IE` 로 떨어지고 재시도가 도는 경로를 시험한다.
 * @returns {Promise<string>}
 */
async function ensureBrokenProblem() {
  const result = await getPool().query(
    `INSERT INTO problems (slug, title, tier, difficulty, entrypoint, restrictions, is_published)
     VALUES ('ie-missing-cases', '케이스 없는 문제 (IE 재시도 시험용)', 1, 1, 'solve', '{}'::jsonb, false)
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title
     RETURNING id`,
  );
  return result.rows[0].id;
}

/**
 * 실행 중인 채점 컨테이너 수를 표본으로 계속 센다 (DoD 2).
 * `docker ps` 를 보는 것은 워커의 자기 보고가 아니라 **외부 관측**이기 때문이다.
 */
function startContainerSampler() {
  const state = { max: 0, samples: 0, stopped: false };

  const loop = async () => {
    while (!state.stopped) {
      try {
        const result = await docker(
          ['ps', '--filter', 'name=mlca-judge-', '--format', '{{.Names}}'],
          { timeoutMs: 10_000 },
        );
        const running = result.stdout.split('\n').filter((line) => line.trim()).length;
        state.max = Math.max(state.max, running);
        state.samples += 1;
      } catch {
        // 표본 하나를 놓쳐도 관측은 계속한다.
      }
    }
  };

  void loop();
  return {
    stop() {
      state.stopped = true;
      return { max: state.max, samples: state.samples };
    },
  };
}

/**
 * @param {number[]} values
 * @param {number} p 0~100
 * @returns {number}
 */
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const induceIe = Boolean(flags['induce-ie']);
  const count = induceIe ? Number(flags['count'] ?? 1) : Number(flags['count'] ?? 20);
  const slug = String(flags['problem'] ?? 'l2norm');
  const sourceFile = String(
    flags['source'] ?? path.join('judge', 'fixtures', 'submissions', 'ac.py'),
  );
  const timeoutMs = Number(flags['timeout'] ?? 180_000);
  const paced = Boolean(flags['paced']);
  const inflight = Number(flags['inflight'] ?? 2);

  const source = await readFile(path.resolve(ROOT, sourceFile), 'utf8');
  const userId = await ensureUser();
  const problemId = induceIe ? await ensureBrokenProblem() : await ensureProblem(slug);

  const connection = createRedis();
  const queue = createQueue({ connection });

  console.log(
    `제출 ${count}건 투입 — 문제=${induceIe ? 'ie-missing-cases' : slug} 소스=${sourceFile}`,
  );

  const enqueueStart = Date.now();

  /** @returns {Promise<string>} */
  const submitOne = async () => {
    const inserted = await getPool().query(
      `INSERT INTO submissions (problem_id, user_id, language, source, status)
       VALUES ($1, $2, 'python', $3, 'PENDING') RETURNING id`,
      [problemId, userId, source],
    );
    const id = inserted.rows[0].id;
    await queue.add('judge', { submission_id: id }, JOB_OPTIONS);
    return id;
  };

  /** @type {string[]} */
  let ids;

  if (paced) {
    // DoD 6 은 "큐 비적체" 조건을 명시한다. 한꺼번에 넣으면 뒤쪽 제출의 대기 시간은
    // 채점 시작 지연이 아니라 **앞선 제출을 기다린 시간**이라 측정 대상이 아니다.
    // 미완료 건수를 동시성보다 낮게 유지해 항상 남는 용량이 있게 한다.
    ids = [];
    for (let index = 0; index < count; index += 1) {
      while (ids.length > 0) {
        const pending = await getPool().query(
          `SELECT count(*)::int AS n FROM submissions WHERE id = ANY($1) AND status <> 'DONE'`,
          [ids],
        );
        if (pending.rows[0].n < inflight) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      ids.push(await submitOne());
    }
  } else {
    // 전부 한 번에 넣는다. 순차로 넣으면 적체가 안 생겨 동시성 상한을 관측할 수 없다.
    ids = await Promise.all(Array.from({ length: count }, () => submitOne()));
  }

  console.log(
    `투입 완료 ${Date.now() - enqueueStart}ms — ${paced ? `비적체(동시 ${inflight}건 이하)` : '일괄'} / 수렴 대기`,
  );

  const sampler = startContainerSampler();
  const waitStart = Date.now();
  let done = 0;

  while (Date.now() - waitStart < timeoutMs) {
    const result = await getPool().query(
      `SELECT count(*)::int AS done FROM submissions WHERE id = ANY($1) AND status = 'DONE'`,
      [ids],
    );
    done = result.rows[0].done;
    if (done === ids.length) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const containers = sampler.stop();
  const elapsed = Date.now() - waitStart;

  const rows = await getPool().query(
    `SELECT id, status, verdict, attempts,
            extract(epoch FROM (judging_at - created_at)) * 1000 AS queue_ms,
            extract(epoch FROM (judged_at - created_at)) * 1000  AS total_ms
       FROM submissions WHERE id = ANY($1)`,
    [ids],
  );

  const queueDelays = rows.rows
    .map((row) => Number(row.queue_ms))
    .filter((value) => Number.isFinite(value));

  /** @type {Record<string, number>} */
  const verdicts = {};
  for (const row of rows.rows) {
    const key = row.verdict ?? `(${row.status})`;
    verdicts[key] = (verdicts[key] ?? 0) + 1;
  }

  const leftover = await docker(['ps', '-a', '--filter', 'name=mlca-judge-', '--format', '{{.Names}}'], {
    timeoutMs: 15_000,
  });
  const leftoverCount = leftover.stdout.split('\n').filter((line) => line.trim()).length;

  const stats = await getPool().query(
    `SELECT slug, judged_count, accepted_count, excluded_count, acceptance_rate
       FROM problem_stats WHERE problem_id = $1`,
    [problemId],
  );

  console.log('');
  console.log(`수렴        ${done}/${ids.length}  (${elapsed}ms)`);
  console.log(`판정 분포   ${JSON.stringify(verdicts)}`);
  console.log(`최대 시도   ${Math.max(...rows.rows.map((row) => row.attempts))}`);
  console.log(
    `큐 지연     P50 ${Math.round(percentile(queueDelays, 50))}ms  P95 ${Math.round(
      percentile(queueDelays, 95),
    )}ms  max ${Math.round(Math.max(0, ...queueDelays))}ms`,
  );
  console.log(`동시 컨테이너 최대 ${containers.max}  (표본 ${containers.samples}회)`);
  console.log(`잔존 컨테이너 ${leftoverCount}`);
  if (stats.rows[0]) {
    const s = stats.rows[0];
    console.log(
      `집계        judged=${s.judged_count} accepted=${s.accepted_count} ` +
        `IE제외=${s.excluded_count} 정답률=${s.acceptance_rate ?? '-'}%`,
    );
  }

  await queue.close();
  await connection.quit();
  await closePool();

  const converged = done === ids.length;
  if (!converged) {
    console.error(`\n수렴 실패: ${ids.length - done}건이 DONE 에 도달하지 못했다`);
    process.exitCode = 1;
  }
}

await main();
