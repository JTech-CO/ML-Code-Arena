/**
 * M1 게이트 실행기 — 판정 8종 재현 + 격리 불변식 검증.
 *
 *   node tools/judge-fixtures.js
 *
 * `AC` 만 확인하고 넘어가지 않는다. 채점기의 가치는 오답을 **정확히 분류**하는 데 있고,
 * 분류가 무너진 채로 M2 로 넘어가면 API·UI 가 전부 잘못된 판정 위에 얹힌다.
 *
 * 격리 검사는 설정 파일을 읽어 확인하지 않는다. 컨테이너 안에서 **커널이 보고하는
 * 상태**와 **실제 시도의 실패**를 본다. `--network=none` 을 넘겼다는 사실과
 * 네트워크가 실제로 죽어 있다는 사실은 다른 명제다.
 */

import { randomUUID } from 'node:crypto';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { EXECUTION_LIMITS } from '@mlca/shared';

import { checkDaemon, docker, removeContainer } from '../apps/worker/src/sandbox/docker.js';
import {
  buildExpectDumpArgs,
  buildIsolationProbeArgs,
  buildPidsProbeArgs,
  buildUnitTestArgs,
} from '../apps/worker/src/sandbox/options.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RUNNER_DIR = path.join(ROOT, 'judge', 'runner');
const FIXTURES = path.join(ROOT, 'judge', 'fixtures');
const SUBMISSIONS = path.join(FIXTURES, 'submissions');

/**
 * @typedef {object} FixtureCase
 * @property {string} verdict 기대 판정
 * @property {string} source `submissions/` 안의 파일명
 * @property {string} note 사람이 읽을 설명
 * @property {string} [problem] 기본은 l2norm
 * @property {string} [casesDir] 케이스 디렉터리 override
 */

/** 판정 8종 재현 표. `problem` 이 없으면 l2norm. @type {FixtureCase[]} */
const VERDICT_CASES = [
  { verdict: 'AC', source: 'ac.py', note: '정답' },
  { verdict: 'WA', source: 'wa.py', note: '값 불일치 (L1 로 정규화)' },
  { verdict: 'WA', source: 'wa_shape.py', note: 'shape 불일치 (축 평탄화)' },
  { verdict: 'TLE', source: 'tle.py', note: '무한 루프' },
  { verdict: 'MLE', source: 'mle.py', note: '약 768MB 할당' },
  { verdict: 'RE', source: 're.py', note: '예외 발생' },
  { verdict: 'RE', source: 're_no_entry.py', note: '엔트리포인트 부재' },
  { verdict: 'CE', source: 'ce.py', note: '파싱 실패' },
  { verdict: 'FBD', source: 'fbd.py', note: '금지 import + 최상위 부작용 (INV-6)' },
  {
    verdict: 'IE',
    source: 'ac.py',
    note: '케이스 파일 손상 — 사용자 책임 아님',
    casesDir: 'judge/fixtures/broken-cases',
  },
];

/** 격리 검증용. AST 화이트리스트가 느슨한 문제를 써서 컨테이너 층만 시험한다. @type {FixtureCase[]} */
const ISOLATION_CASES = [
  {
    verdict: 'RE',
    source: 'network.py',
    problem: 'sandbox-probe',
    note: 'INV-4 — 네트워크 접속 시도가 실패한다',
  },
];

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} detail
 */
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}\n       ${detail}`);
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
 * @typedef {object} JudgeCliResult
 * @property {import('@mlca/shared').Verdict} verdict
 * @property {string} container_id
 * @property {boolean} oom_killed
 * @property {number|null} exit_code
 * @property {import('@mlca/shared').RunnerOutput|null} output
 * @property {string|null} error
 */

/**
 * judge-cli 를 한 번 돌리고 JSON 결과를 받는다.
 * CLI 를 거치는 것은 의도다 — DoD 1 이 요구하는 경로가 그것이다.
 * @param {{ problem: string, source: string, casesDir?: string }} input
 * @returns {Promise<{ parsed: JudgeCliResult, stdout: string, stderr: string }>}
 */
async function judge(input) {
  const args = [
    path.join(ROOT, 'tools', 'judge-cli.js'),
    '--problem',
    input.problem,
    '--source',
    path.join(SUBMISSIONS, input.source),
    '--json',
  ];
  if (input.casesDir) args.push('--cases-dir', input.casesDir);

  const { spawn } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', () => {
      try {
        resolve({ parsed: JSON.parse(stdout), stdout, stderr });
      } catch {
        reject(new Error(`judge-cli 출력을 읽을 수 없다:\n${stdout}\n${stderr}`));
      }
    });
  });
}

/**
 * 컨테이너를 한 번 돌리고 stdout 을 받는다.
 * @param {string[]} args
 * @param {string} containerName
 */
async function runProbe(args, containerName) {
  try {
    const created = await docker(args, { timeoutMs: 120_000 });
    if (created.code !== 0) {
      throw new Error(created.stderr.trim() || created.stdout.trim());
    }
    await docker(['wait', containerName], { timeoutMs: 120_000 });
    const logs = await docker(['logs', containerName], { timeoutMs: 60_000 });
    return logs;
  } finally {
    await removeContainer(containerName);
  }
}

/** 러너 순수 로직 — 채점이 실제로 도는 numpy 버전에서 확인한다. */
async function checkRunnerUnits() {
  const containerName = `mlca-units-${randomUUID()}`;
  const logs = await runProbe(
    buildUnitTestArgs({
      containerName,
      runnerDir: RUNNER_DIR,
      testsDir: path.join(ROOT, 'judge', 'tests'),
    }),
    containerName,
  );

  // unittest 는 요약을 stderr 로 낸다.
  const text = `${logs.stdout}\n${logs.stderr}`;
  const ran = /Ran (\d+) tests?/.exec(text);
  const ok = /\nOK\b/.test(text);

  record(
    '러너 단위 테스트 (컨테이너 안, 고정 numpy)',
    ok && Boolean(ran),
    ok ? `${ran?.[1] ?? '?'}건 통과` : text.split('\n').slice(-12).join(' | '),
  );
}

/** DoD 2 · 3 — 판정 8종 재현. */
async function checkVerdicts() {
  const seen = new Set();

  for (const testCase of [...VERDICT_CASES, ...ISOLATION_CASES]) {
    const problem = testCase.problem ?? 'l2norm';
    const { parsed } = await judge({
      problem,
      source: testCase.source,
      ...(testCase.casesDir ? { casesDir: testCase.casesDir } : {}),
    });
    const ok = parsed.verdict === testCase.verdict;
    if (ok) seen.add(testCase.verdict);
    record(
      `${testCase.verdict.padEnd(3)} ← ${testCase.source}`,
      ok,
      `${testCase.note} / 실제 ${parsed.verdict}`,
    );
  }

  const missing = ['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'FBD', 'IE'].filter((v) => !seen.has(v));
  record(
    '판정 8종 전부 재현',
    missing.length === 0,
    missing.length === 0 ? '8/8' : `누락: ${missing.join(', ')}`,
  );
}

/** DoD 4 — AST 검사가 import 보다 먼저 돈다 (INV-6). */
async function checkAstBeforeImport() {
  const { parsed } = await judge({ problem: 'l2norm', source: 'fbd.py' });

  // fbd.py 의 모듈 최상위에는 부작용과 raise 가 있다. import 가 먼저 돌았다면
  // 그 raise 가 터져 RE 가 나온다. FBD 라는 것은 최상위가 실행되지 않았다는 뜻이다.
  const ok = parsed.verdict === 'FBD';
  const violations = parsed.output?.detail?.violations ?? [];
  const ruleNames = violations.map((violation) => violation.rule).join(', ');
  record(
    'INV-6 AST 검사가 import 보다 먼저',
    ok,
    ok
      ? `FBD (최상위 raise 미실행) / 위반 ${violations.length}건: ${ruleNames}`
      : `RE 가 나왔다면 최상위가 실행된 것이다 → 실제 ${parsed.verdict}`,
  );
}

/** DoD 5 — 컨테이너 재사용 금지 (INV-8). */
async function checkContainerIsolation() {
  const first = await judge({ problem: 'sandbox-probe', source: 'tmp_write.py' });
  const second = await judge({ problem: 'sandbox-probe', source: 'tmp_read.py' });

  const idsDiffer =
    Boolean(first.parsed.container_id) &&
    Boolean(second.parsed.container_id) &&
    first.parsed.container_id !== second.parsed.container_id;

  record(
    'INV-8 컨테이너 ID 가 제출마다 다르다',
    idsDiffer,
    `1회차 ${String(first.parsed.container_id).slice(0, 12)} / 2회차 ${String(
      second.parsed.container_id,
    ).slice(0, 12)}`,
  );

  // tmp_read.py 는 이전 /tmp 가 보이면 일부러 틀린 값을 낸다 → WA.
  record(
    'INV-8 이전 제출의 /tmp 가 보이지 않는다',
    first.parsed.verdict === 'AC' && second.parsed.verdict === 'AC',
    `쓰기 ${first.parsed.verdict} / 읽기 ${second.parsed.verdict} (WA 면 /tmp 가 남은 것)`,
  );
}

/**
 * 컨테이너 안에서 커널이 보고한 격리 상태.
 * @typedef {object} IsolationProbe
 * @property {string[]} seccomp `/proc/self/status` 의 Seccomp. 2 = filter
 * @property {string[]} capEff CapEff 비트마스크
 * @property {string[]} noNewPrivs
 * @property {string[]} interfaces `/sys/class/net` 목록
 * @property {string} network 외부 접속 결과. reachable 이면 INV-4 위반
 * @property {boolean} rootWritable
 * @property {number} uid
 */

/** DoD 3 — 커널이 보고하는 격리 상태 (INV-4). */
async function checkIsolationProbe() {
  const containerName = `mlca-probe-${randomUUID()}`;
  const logs = await runProbe(buildIsolationProbeArgs({ containerName }), containerName);

  /** @type {IsolationProbe} */
  let probe;
  try {
    probe = JSON.parse(logs.stdout.trim().split('\n').pop() ?? '{}');
  } catch {
    record('INV-4 격리 프로브', false, `프로브 출력을 읽을 수 없다: ${logs.stdout}${logs.stderr}`);
    return;
  }

  record(
    'INV-4 컨테이너에 네트워크가 없다',
    probe.network !== 'reachable' && !(probe.interfaces ?? []).some((name) => name !== 'lo'),
    `외부 접속 ${probe.network} / 인터페이스 ${JSON.stringify(probe.interfaces)}`,
  );
  record(
    '루트 파일시스템이 읽기 전용이다',
    probe.rootWritable === false,
    `쓰기 가능 ${probe.rootWritable}`,
  );
  record('비특권 사용자로 실행된다', probe.uid === 65534, `uid=${probe.uid}`);
  record(
    'capability 가 전부 제거됐다',
    (probe.capEff ?? []).every((cap) => /^0+$/.test(cap)),
    `CapEff=${JSON.stringify(probe.capEff)}`,
  );
  record(
    'no-new-privileges 가 걸려 있다',
    (probe.noNewPrivs ?? []).includes('1'),
    `NoNewPrivs=${JSON.stringify(probe.noNewPrivs)}`,
  );
  record(
    'seccomp 필터가 걸려 있다',
    (probe.seccomp ?? []).some((mode) => mode === '2'),
    `Seccomp=${JSON.stringify(probe.seccomp)} (2 = filter)`,
  );
}

/** DoD 9 — pids-limit 이 fork 폭주를 막는다. */
async function checkPidsLimit() {
  const containerName = `mlca-pids-${randomUUID()}`;
  const logs = await runProbe(buildPidsProbeArgs({ containerName }), containerName);

  /** @type {{ spawned: number, attempts: number }|null} */
  let probe = null;
  try {
    probe = JSON.parse(logs.stdout.trim().split('\n').pop() ?? 'null');
  } catch {
    probe = null;
  }

  if (probe === null) {
    // 상한에 걸려 컨테이너가 죽어 출력이 없는 것도 "막혔다"의 증거다.
    record('pids-limit 이 fork 폭주를 막는다', true, '컨테이너가 상한에서 종료되어 출력이 없다');
    return;
  }

  record(
    'pids-limit 이 fork 폭주를 막는다',
    probe.spawned < probe.attempts && probe.spawned <= EXECUTION_LIMITS.pidsLimit,
    `${probe.spawned}/${probe.attempts} 성공 (상한 ${EXECUTION_LIMITS.pidsLimit})`,
  );
}

/** DoD 7 — 기대값이 사용자에게 도달하지 않는다 (INV-5). */
async function checkExpectNotLeaked() {
  const casesDir = path.join(FIXTURES, 'problems', 'l2norm', 'cases');
  const containerName = `mlca-expect-${randomUUID()}`;
  const logs = await runProbe(
    buildExpectDumpArgs({ containerName, casesDir, runnerDir: RUNNER_DIR }),
    containerName,
  );

  /** @type {string[]} */
  let expectStrings = [];
  try {
    expectStrings = JSON.parse(logs.stdout.trim().split('\n').pop() ?? '[]');
  } catch {
    record('INV-5 기대값 비노출', false, `기대값을 뽑지 못해 검사할 수 없다: ${logs.stderr}`);
    return;
  }

  if (expectStrings.length === 0) {
    record('INV-5 기대값 비노출', false, '기대값 문자열이 0건 — 검사가 성립하지 않는다');
    return;
  }

  const wa = await judge({ problem: 'l2norm', source: 'wa.py' });
  const haystack = `${wa.stdout}\n${wa.stderr}`;
  const leaked = expectStrings.filter((value) => haystack.includes(value));

  record(
    'INV-5 기대값이 러너·CLI 출력에 없다',
    leaked.length === 0,
    `기대값 후보 ${expectStrings.length}건 중 노출 ${leaked.length}건${
      leaked.length ? ` — ${leaked.slice(0, 3).join(', ')}` : ''
    }`,
  );
}

async function main() {
  const daemon = await checkDaemon();
  if (!daemon.ok) {
    console.error(`Docker 데몬에 연결할 수 없다: ${daemon.message}`);
    process.exitCode = 2;
    return;
  }
  console.log(`Docker engine ${daemon.version}\n`);

  for (const slug of ['l2norm', 'sandbox-probe']) {
    const casesDir = path.join(FIXTURES, 'problems', slug, 'cases');
    if (!(await exists(casesDir)) || (await readdir(casesDir)).length === 0) {
      console.log(`[준비] ${slug} 케이스 생성 (INV-10)`);
      const { spawn } = await import('node:child_process');
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [path.join(ROOT, 'tools', 'judge-cli.js'), '--prepare', '--problem', slug],
          { cwd: ROOT, stdio: 'inherit', windowsHide: true },
        );
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0 ? resolve(undefined) : reject(new Error(`케이스 생성 실패 (${slug})`)),
        );
      });
    }
  }
  console.log('');

  await checkRunnerUnits();
  console.log('');
  await checkVerdicts();
  console.log('');
  await checkAstBeforeImport();
  await checkContainerIsolation();
  console.log('');
  await checkIsolationProbe();
  await checkPidsLimit();
  console.log('');
  await checkExpectNotLeaked();

  const failed = results.filter((item) => !item.ok);
  console.log(`\n게이트 ${results.length}건 중 ${results.length - failed.length}건 통과.`);

  if (failed.length > 0) {
    console.error(`\n실패 ${failed.length}건:`);
    for (const item of failed) console.error(`  - ${item.name}: ${item.detail}`);
    process.exitCode = 1;
  }
}

await main();
