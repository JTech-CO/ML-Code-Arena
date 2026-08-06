/**
 * 전 문제 일괄 채점 — 문제집이 실제로 성립하는지 보는 게이트.
 *
 *   node tools/batch-judge.js --source reference   전부 AC 여야 한다
 *   node tools/batch-judge.js --source bypass      전부 FBD 여야 한다
 *
 * **왜 두 방향을 다 보는가.** 기준 구현이 `AC` 를 받는 것만 확인하면 "제한이 너무
 * 느슨한 문제"가 그대로 통과한다. 라이브러리 한 줄 풀이가 `FBD` 를 받는 것만 확인하면
 * "제한이 너무 빡빡해 정답도 막는 문제"가 통과한다. 두 방향이 모두 성립해야 제한이
 * 의도한 자리에 걸린 것이다 (ADR-0002).
 *
 * 채점 경로는 `tools/judge-cli.js` 와 완전히 같다 — 같은 격리, 같은 러너, 같은 spec.
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkDaemon } from '../apps/worker/src/sandbox/docker.js';
import { runInSandbox } from '../apps/worker/src/sandbox/run.js';
import { buildSpec, cleanWorkDir, countCases, prepareWorkDir } from '../apps/worker/src/sandbox/workdir.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROBLEMS_ROOT = path.join(ROOT, 'problems');
const RUNNER_DIR = path.join(ROOT, 'judge', 'runner');
const WORK_ROOT = path.join(ROOT, '.judge-work');

/** 어떤 소스가 어떤 판정을 받아야 하는가. */
const SOURCES = Object.freeze({
  reference: { file: 'reference.py', expect: 'AC' },
  bypass: { file: 'bypass.py', expect: 'FBD' },
});

const USAGE = `사용법:
  node tools/batch-judge.js --source reference   기준 구현 — 전부 AC 기대
  node tools/batch-judge.js --source bypass      우회 샘플 — 전부 FBD 기대

옵션:
  --source <이름>       reference | bypass
  --problem <slug>      한 문제만
  --concurrency <수>    동시 채점 수 (기본 3)
  --image <태그>        채점 이미지`;

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
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

/**
 * @param {string} problemDir
 * @param {string} sourceFile
 * @param {string|undefined} image
 */
async function judgeOne(problemDir, sourceFile, image) {
  const problem = JSON.parse(await readFile(path.join(problemDir, 'problem.json'), 'utf8'));
  const casesDir = path.join(problemDir, 'cases');
  const caseCount = await countCases(casesDir);

  if (caseCount === 0) {
    return {
      verdict: 'IE',
      note: '케이스가 없다 — node tools/problem-sync.js --all 먼저',
      output: null,
    };
  }

  const source = await readFile(path.join(problemDir, sourceFile), 'utf8');
  const submissionId = randomUUID();
  const judgeDir = await prepareWorkDir({
    root: WORK_ROOT,
    submissionId,
    source,
    spec: buildSpec(problem, caseCount),
    casesDir,
  });

  try {
    const result = await runInSandbox({
      judgeDir,
      runnerDir: RUNNER_DIR,
      submissionId,
      ...(image === undefined ? {} : { image }),
      timeLimitMs: problem.time_limit_ms,
    });
    return { verdict: result.verdict, note: result.error ?? '', output: result.output };
  } finally {
    await cleanWorkDir(judgeDir);
  }
}

/**
 * 판정이 기대와 다를 때 무엇이 어긋났는지 한 줄로 만든다.
 * 러너가 내준 것만 옮긴다 — 기대값은 여기 오지 않는다 (INV-5).
 * @param {import('@mlca/shared').RunnerOutput|null} output
 */
function describe(output) {
  if (!output) return '';

  const top = /** @type {Record<string, any>} */ (output['detail'] ?? {});
  if (Array.isArray(top['violations'])) {
    return top['violations'].map((item) => `${item.rule}:${item.message}`).join(' / ');
  }
  if (top['message']) return String(top['message']);

  const failed = output.cases?.find((item) => item.verdict !== 'AC');
  if (!failed) return '';
  const detail = /** @type {Record<string, any>} */ (failed.detail ?? {});
  const parts = [`케이스 ${failed.index}`, failed.verdict];
  if (detail['reason']) parts.push(String(detail['reason']));
  if (detail['message']) parts.push(String(detail['message']));
  return parts.join(' ');
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<any>} worker
 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function pump() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(/** @type {T} */ (items[index]), index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, pump));
  return results;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const sourceName = typeof flags['source'] === 'string' ? flags['source'] : '';
  const source = SOURCES[/** @type {keyof typeof SOURCES} */ (sourceName)];

  if (flags['help'] || !source) {
    console.log(USAGE);
    if (!flags['help']) process.exitCode = 2;
    return;
  }

  const daemon = await checkDaemon();
  if (!daemon.ok) {
    console.error(`Docker 데몬에 연결할 수 없다: ${daemon.message}`);
    process.exitCode = 2;
    return;
  }

  const { readdir } = await import('node:fs/promises');
  const entries = (await readdir(PROBLEMS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();

  const targets =
    typeof flags['problem'] === 'string'
      ? entries.filter((name) => name.replace(/^\d{4}-/, '') === flags['problem'])
      : entries;

  if (targets.length === 0) {
    console.error('채점할 문제가 없다.');
    process.exitCode = 2;
    return;
  }

  const image = typeof flags['image'] === 'string' ? flags['image'] : undefined;
  const concurrency = Number.parseInt(String(flags['concurrency'] ?? '3'), 10) || 3;

  console.log(`${source.file} · ${targets.length}문제 · 기대 ${source.expect} · 동시 ${concurrency}\n`);

  const started = Date.now();
  const results = await mapLimit(targets, concurrency, async (dirName) => {
    const problemDir = path.join(PROBLEMS_ROOT, dirName);
    try {
      const outcome = await judgeOne(problemDir, source.file, image);
      const ok = outcome.verdict === source.expect;
      const detail = ok ? '' : `${describe(outcome.output)} ${outcome.note}`.trim();
      console.log(
        `  ${ok ? ' ' : '!'} ${dirName.padEnd(34)} ${outcome.verdict.padEnd(4)}` +
          (detail ? `  ${detail}` : ''),
      );
      return { dirName, verdict: outcome.verdict, ok, detail };
    } catch (error) {
      const detail = String(error).split('\n')[0] ?? '';
      console.log(`  ! ${dirName.padEnd(34)} ----  ${detail}`);
      return { dirName, verdict: '----', ok: false, detail };
    }
  });

  const passed = results.filter((item) => item.ok).length;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log('');
  console.log(`${passed}/${results.length} 이 ${source.expect} · ${seconds}s`);

  if (passed !== results.length) {
    console.error('\n어긋난 문제');
    for (const item of results.filter((entry) => !entry.ok)) {
      console.error(`  ${item.dirName}  ${item.verdict}  ${item.detail}`);
    }
    process.exitCode = 1;
  }
}

await main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
