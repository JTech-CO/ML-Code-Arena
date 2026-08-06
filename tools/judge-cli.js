/**
 * 로컬 채점 CLI — M1 은 HTTP 도 DB 도 없이 이것만으로 완결되어야 한다.
 *
 *   node tools/judge-cli.js --prepare --problem l2norm
 *   node tools/judge-cli.js --problem l2norm --source judge/fixtures/submissions/ac.py
 *   node tools/judge-cli.js --problem l2norm --source ... --expect AC
 *
 * 격리 옵션은 여기서 정하지 않는다. `apps/worker/src/sandbox/options.js` 한 곳에서만
 * 조립한다 (HARNESS.md §4.3). CLI 와 큐 워커의 격리가 달라지면 로컬에서 통과한 것이
 * 운영에서 다르게 돈다.
 *
 * **INV-5**: 이 파일은 기대값을 읽지도, 출력하지도 않는다. 러너가 내준 것만 옮긴다.
 */

import { randomUUID } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkDaemon, docker, removeContainer } from '../apps/worker/src/sandbox/docker.js';
import { buildMakeCasesArgs } from '../apps/worker/src/sandbox/options.js';
import { runInSandbox } from '../apps/worker/src/sandbox/run.js';
import {
  buildSpec,
  cleanWorkDir,
  countCases,
  prepareWorkDir,
} from '../apps/worker/src/sandbox/workdir.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RUNNER_DIR = path.join(ROOT, 'judge', 'runner');
const DEFAULT_WORK_ROOT = path.join(ROOT, '.judge-work');

const USAGE = `사용법:
  node tools/judge-cli.js --problem <slug> --source <파일> [옵션]
  node tools/judge-cli.js --prepare --problem <slug>

옵션:
  --problem <slug>     문제 슬러그. problems/ 와 judge/fixtures/problems/ 에서 찾는다
  --source <파일>      제출 소스 경로
  --prepare            reference.py 로 케이스·기대값을 생성한다 (INV-10)
  --cases-dir <경로>   케이스 디렉터리를 직접 지정한다
  --expect <판정>      기대 판정과 다르면 종료 코드 1
  --image <태그>       채점 이미지 (기본 mlca-python:3.11)
  --work-dir <경로>    제출 작업 디렉터리 루트 (기본 .judge-work)
  --json               러너 출력 원문을 그대로 낸다
  --keep               작업 디렉터리를 지우지 않는다`;

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

/** @param {string} target */
async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * 문제 디렉터리를 찾는다. `problems/<NNNN-slug>` 규약과 픽스처를 모두 본다.
 * @param {string} slug
 * @returns {Promise<string>}
 */
async function resolveProblemDir(slug) {
  const fixture = path.join(ROOT, 'judge', 'fixtures', 'problems', slug);
  if (await exists(path.join(fixture, 'problem.json'))) return fixture;

  const problemsRoot = path.join(ROOT, 'problems');
  if (await exists(problemsRoot)) {
    const entries = await readdir(problemsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === slug || entry.name.replace(/^\d+-/, '') === slug) {
        const candidate = path.join(problemsRoot, entry.name);
        if (await exists(path.join(candidate, 'problem.json'))) return candidate;
      }
    }
  }

  throw new Error(`문제를 찾을 수 없다: ${slug}`);
}

/**
 * 케이스 생성 컨테이너를 돌린다 (INV-10).
 * @param {string} problemDir
 * @param {string|undefined} image
 */
async function prepareCases(problemDir, image) {
  const containerName = `mlca-mkcases-${randomUUID()}`;
  try {
    const created = await docker(
      buildMakeCasesArgs({
        containerName,
        problemDir,
        runnerDir: RUNNER_DIR,
        ...(image === undefined ? {} : { image }),
      }),
      { timeoutMs: 120_000 },
    );
    if (created.code !== 0) {
      throw new Error(`케이스 생성 컨테이너를 만들 수 없다: ${created.stderr.trim()}`);
    }

    const waited = await docker(['wait', containerName], { timeoutMs: 300_000 });
    const logs = await docker(['logs', containerName], { timeoutMs: 60_000 });
    const exitCode = Number.parseInt(waited.stdout.trim(), 10);

    if (exitCode !== 0) {
      throw new Error(`케이스 생성 실패 (exit=${exitCode})\n${logs.stderr.trim()}`);
    }
    return logs.stdout.trim();
  } finally {
    await removeContainer(containerName);
  }
}

/** @param {import('@mlca/shared').RunnerOutput|null} output */
function describeCases(output) {
  if (!output || !Array.isArray(output.cases)) return '';
  const passed = output.cases.filter((item) => item.verdict === 'AC').length;
  return `${passed}/${output.cases.length} 통과`;
}

/**
 * 사람이 읽는 결과. 러너가 준 값만 옮긴다 — 여기서 새로 만드는 정보는 없다 (INV-5).
 * @param {import('../apps/worker/src/sandbox/run.js').SandboxResult} result
 */
function report(result) {
  const output = result.output;
  const lines = [`판정      ${result.verdict}`];

  if (output) {
    lines.push(`케이스    ${describeCases(output)}`);
    lines.push(`시간      ${output.total_runtime_ms}ms    메모리  ${output.peak_memory_mb}MB`);
  }

  const failed = output?.cases?.find((item) => item.verdict !== 'AC');
  if (failed) {
    lines.push('', `실패      케이스 ${failed.index}`);
    const detail = /** @type {Record<string, any>} */ (failed.detail ?? {});
    if (detail['reason']) lines.push(`사유      ${detail['reason']}`);
    if (detail['expected_shape']) {
      lines.push(`기대 shape (${detail['expected_shape'].join(', ')})`);
    }
    if (detail['actual_shape']) {
      lines.push(`실제 shape (${detail['actual_shape'].join(', ')})`);
    }
    if (detail['expected_type']) {
      lines.push(`기대 타입  ${detail['expected_type']}    실제 타입  ${detail['actual_type']}`);
    }
    if (detail['message']) lines.push(`메시지    ${detail['message']}`);
  }

  const top = /** @type {Record<string, any>} */ (output?.['detail'] ?? {});
  if (Array.isArray(top['violations'])) {
    lines.push('', '위반');
    for (const violation of top['violations']) {
      lines.push(`  ${violation.rule} (${violation.line}행) — ${violation.message}`);
    }
  } else if (top['message']) {
    lines.push('', `메시지    ${top['message']}${top['line'] ? ` (${top['line']}행)` : ''}`);
  }

  if (result.error) lines.push('', `내부 오류  ${result.error}`);
  lines.push('', `컨테이너  ${result.containerId.slice(0, 12) || '(생성 실패)'}`);

  return lines.join('\n');
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags['help'] || (!flags['problem'] && !flags['prepare'])) {
    console.log(USAGE);
    return;
  }

  const daemon = await checkDaemon();
  if (!daemon.ok) {
    console.error(`Docker 데몬에 연결할 수 없다: ${daemon.message}`);
    console.error('Docker Desktop 을 켠 뒤 다시 실행할 것. 격리 없이 채점하지 않는다 (INV-4).');
    process.exitCode = 2;
    return;
  }

  const slug = String(flags['problem']);
  const problemDir = await resolveProblemDir(slug);
  const image = typeof flags['image'] === 'string' ? flags['image'] : undefined;

  if (flags['prepare']) {
    const manifest = await prepareCases(problemDir, image);
    console.log(manifest);
    return;
  }

  if (typeof flags['source'] !== 'string') {
    console.error('--source 가 필요하다.');
    process.exitCode = 2;
    return;
  }

  const problem = JSON.parse(await readFile(path.join(problemDir, 'problem.json'), 'utf8'));
  const casesDir =
    typeof flags['cases-dir'] === 'string'
      ? path.resolve(ROOT, flags['cases-dir'])
      : path.join(problemDir, 'cases');

  if (!(await exists(casesDir))) {
    console.error(`케이스가 없다: ${casesDir}`);
    console.error(`먼저 생성할 것:  node tools/judge-cli.js --prepare --problem ${slug}`);
    process.exitCode = 2;
    return;
  }

  // 케이스가 0건이면 러너의 케이스 루프가 한 번도 돌지 않는다. 러너도 이를 `IE` 로
  // 끊지만, 여기서 먼저 끊어야 사용자가 무엇을 해야 하는지 알 수 있다.
  const caseCount = await countCases(casesDir);
  if (caseCount === 0) {
    console.error(`케이스가 0건이다: ${casesDir}`);
    console.error(`다시 생성할 것:  node tools/judge-cli.js --prepare --problem ${slug}`);
    process.exitCode = 2;
    return;
  }

  const source = await readFile(path.resolve(ROOT, flags['source']), 'utf8');
  const submissionId = randomUUID();
  const workRoot =
    typeof flags['work-dir'] === 'string' ? path.resolve(ROOT, flags['work-dir']) : DEFAULT_WORK_ROOT;

  const judgeDir = await prepareWorkDir({
    root: workRoot,
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

    if (flags['json']) {
      console.log(
        JSON.stringify(
          {
            verdict: result.verdict,
            container_id: result.containerId,
            oom_killed: result.oomKilled,
            exit_code: result.exitCode,
            output: result.output,
            error: result.error,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`문제      ${slug}`);
      console.log(`제출      ${flags['source']}`);
      console.log('');
      console.log(report(result));
    }

    if (typeof flags['expect'] === 'string' && result.verdict !== flags['expect']) {
      console.error(`\n기대 판정 ${flags['expect']} 와 다르다: ${result.verdict}`);
      process.exitCode = 1;
    }
  } finally {
    if (!flags['keep']) await cleanWorkDir(judgeDir);
  }
}

await main();
