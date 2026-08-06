/**
 * 격리 옵션 **단일 상수 모듈** (docs/TECHNICAL.md §5.1, HARNESS.md §4.3).
 *
 * `docker run` 플래그는 이 파일에만 있다. 여러 곳에 흩어지면 하나를 놓치고,
 * 놓친 하나가 곧 격리 구멍이 된다. 로컬 CLI(`tools/judge-cli.js`)와 큐 워커가
 * 같은 함수를 쓴다 — 두 경로의 격리가 달라지는 일이 없어야 한다.
 *
 * **이 파일의 값을 디버깅 편의로 완화하는 것은 레드라인이다** (INV-4).
 * 격리를 풀어야 채점이 되는 상황은 설정 문제가 아니라 설계 문제이며 STOP 대상이다.
 */

import path from 'node:path';

import { EXECUTION_LIMITS, JUDGE_IMAGE_DEFAULT } from '@mlca/shared';

/** 컨테이너 이름 접두사. 고아 컨테이너를 찾아 지울 때 쓴다. */
export const CONTAINER_NAME_PREFIX = 'mlca-judge-';

/**
 * 러너가 자기 시간 제한(SIGALRM)으로 깨끗한 JSON 을 내놓을 여유.
 * 컨테이너의 `timeout` 이 먼저 죽이면 출력이 없어 판정 근거가 사라진다.
 */
const TIMEOUT_GRACE_SECONDS = 2;

/**
 * Docker 인자로 넘길 호스트 경로를 정규화한다.
 * Windows 의 역슬래시 경로는 Docker Desktop 에서 파싱이 갈리므로 슬래시로 통일한다.
 * @param {string} hostPath
 * @returns {string}
 */
function toMountPath(hostPath) {
  return path.resolve(hostPath).split(path.sep).join('/');
}

/**
 * @typedef {object} SandboxTarget
 * @property {string} containerName 컨테이너 이름 (제출당 고유)
 * @property {string} judgeDir 호스트의 제출 작업 디렉터리. solution.py·spec.json·cases/
 * @property {string} runnerDir 호스트의 러너 디렉터리 (`judge/runner`)
 * @property {string} [image] 채점 이미지 태그
 * @property {number} [timeLimitMs] 벽시계 상한. 기본은 공유 상수
 */

/**
 * `docker run` 인자 배열을 조립한다.
 *
 * 붙이지 않은 것 하나를 밝혀 둔다: `--security-opt=seccomp=...` 는 넣지 않는다.
 * Docker 는 값을 주지 않으면 **기본 seccomp 프로파일을 적용**하고, 유효한 값은
 * 프로파일 경로 또는 `unconfined` 뿐이다. `seccomp=default` 라는 리터럴은 버전에 따라
 * 거부된다. 기본값이 실제로 걸려 있는지는 `verifyIsolation()` 이 컨테이너 안에서 확인한다.
 *
 * @param {SandboxTarget} target
 * @returns {string[]}
 */
export function buildRunArgs(target) {
  const timeLimitMs = target.timeLimitMs ?? EXECUTION_LIMITS.wallClockMs;
  const timeoutSeconds = Math.ceil(timeLimitMs / 1000) + TIMEOUT_GRACE_SECONDS;

  return [
    'run',
    '--detach',
    '--name',
    target.containerName,

    // INV-4 — 네트워크 완전 차단. Phase 1 에 외부 데이터셋이 없으므로 예외가 없다.
    '--network=none',

    // 루트 파일시스템 읽기 전용. 쓸 수 있는 곳은 아래 tmpfs 하나뿐이다.
    '--read-only',
    `--tmpfs=/tmp:rw,noexec,nosuid,size=${EXECUTION_LIMITS.tmpfsMb}m`,

    // 메모리. swap 을 같은 값으로 두어야 스왑으로 상한을 우회하지 못한다.
    `--memory=${EXECUTION_LIMITS.memoryMb}m`,
    `--memory-swap=${EXECUTION_LIMITS.memoryMb}m`,
    '--cpus=1.0',

    // fork bomb 방어.
    `--pids-limit=${EXECUTION_LIMITS.pidsLimit}`,

    // 권한 최소화.
    '--user=65534:65534',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',

    // 제출물과 러너를 각각 읽기 전용으로 붙인다. 러너를 제출 디렉터리에 복사하지
    // 않으므로 제출별 작업 디렉터리에는 사용자 유래 파일과 케이스만 남는다.
    '-v',
    `${toMountPath(target.judgeDir)}:/judge:ro`,
    '-v',
    `${toMountPath(target.runnerDir)}:/opt/mlca/runner:ro`,

    '--workdir=/judge',
    target.image ?? JUDGE_IMAGE_DEFAULT,

    // 러너 자신의 SIGALRM 이 먼저 울리고, 이건 마지막 안전망이다.
    // numpy 의 C 루프처럼 파이썬 시그널이 늦게 도는 구간을 여기서 끊는다.
    'timeout',
    '-s',
    'KILL',
    String(timeoutSeconds),
    'python',
    '/opt/mlca/runner/runner.py',
  ];
}

/**
 * 케이스 생성 컨테이너의 인자 (INV-10).
 *
 * 채점과 달리 문제 디렉터리에 **써야** 하므로 읽기 전용이 아니다. 대신 여기서 도는 것은
 * 사용자 코드가 아니라 우리가 작성한 `generator.py`·`reference.py` 다. 그럼에도 네트워크는
 * 똑같이 끊는다 — 케이스 생성이 외부를 타면 재현성이 사라진다.
 *
 * @param {{ containerName: string, problemDir: string, runnerDir: string, image?: string }} target
 * @returns {string[]}
 */
export function buildMakeCasesArgs(target) {
  return [
    'run',
    '--detach',
    '--name',
    target.containerName,
    '--network=none',
    `--memory=${EXECUTION_LIMITS.memoryMb}m`,
    `--memory-swap=${EXECUTION_LIMITS.memoryMb}m`,
    '--cpus=1.0',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '-v',
    `${toMountPath(target.problemDir)}:/problem`,
    '-v',
    `${toMountPath(target.runnerDir)}:/opt/mlca/runner:ro`,
    '--user=65534:65534',
    '--workdir=/problem',
    target.image ?? JUDGE_IMAGE_DEFAULT,
    'python',
    '/opt/mlca/runner/make_cases.py',
  ];
}

/**
 * `--pids-limit` 이 실제로 무는지 확인하는 명령 (docs/TECHNICAL.md §5.2).
 *
 * 무한 fork 가 아니라 **상한까지만 시도하는 유계 루프**를 돈다. 상한이 걸려 있으면
 * 성공 횟수가 pids-limit 근처에서 멈추고, 안 걸려 있으면 시도 횟수만큼 성공한다.
 * 무한 fork bomb 을 실제로 돌리지 않고도 같은 것을 증명한다.
 *
 * @param {{ containerName: string, image?: string, attempts?: number }} target
 * @returns {string[]}
 */
export function buildPidsProbeArgs(target) {
  const attempts = target.attempts ?? 400;
  return [
    'run',
    '--detach',
    '--name',
    target.containerName,
    '--network=none',
    '--read-only',
    `--tmpfs=/tmp:rw,noexec,nosuid,size=${EXECUTION_LIMITS.tmpfsMb}m`,
    `--memory=${EXECUTION_LIMITS.memoryMb}m`,
    `--memory-swap=${EXECUTION_LIMITS.memoryMb}m`,
    '--cpus=1.0',
    `--pids-limit=${EXECUTION_LIMITS.pidsLimit}`,
    '--user=65534:65534',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    target.image ?? JUDGE_IMAGE_DEFAULT,
    'timeout',
    '-s',
    'KILL',
    '20',
    'python',
    '-c',
    [
      'import json, os, sys, time',
      'spawned = 0',
      `for _ in range(${attempts}):`,
      '    try:',
      '        pid = os.fork()',
      '    except OSError:',
      '        break',
      '    if pid == 0:',
      '        time.sleep(30)',
      '        os._exit(0)',
      '    spawned += 1',
      `print(json.dumps({"spawned": spawned, "attempts": ${attempts}}))`,
      'sys.stdout.flush()',
      'os._exit(0)',
    ].join('\n'),
  ];
}

/**
 * 러너 순수 로직 단위 테스트를 컨테이너 안에서 돌린다.
 *
 * 호스트에서도 돌릴 수 있지만(빠른 반복용), **정본은 이쪽**이다. 채점이 실제로 도는
 * numpy 버전과 같은 곳에서 확인해야 한다. 호스트 numpy 가 다르면 통과가 통과를
 * 보장하지 않는다.
 *
 * `fixturesDir` 를 `/opt/mlca/fixtures` 에 붙이는 이유: 테스트가 문제 정의를 읽어
 * "기준 구현이 자기 문제의 제한을 통과하는가"를 확인한다. 호스트에서는
 * `judge/tests` -> `judge/fixtures`, 컨테이너에서는 `/opt/mlca/tests` -> `/opt/mlca/fixtures`
 * 로 같은 상대 경로가 성립하도록 맞췄다.
 *
 * `problemsDir` 도 같은 이유로 `/opt/problems` 다. 테스트가 저장소 루트 기준으로
 * `../../problems` 를 보므로, 컨테이너에서 `/opt/mlca/tests` 의 세 단계 위가 `/opt` 가
 * 되도록 맞춘 것이다. 이 검사가 픽스처에만 걸리면 M6 의 문제 30개는 빠진다.
 *
 * @param {{ containerName: string, runnerDir: string, testsDir: string, fixturesDir: string, problemsDir?: string, image?: string }} target
 * @returns {string[]}
 */
export function buildUnitTestArgs(target) {
  return [
    'run',
    '--detach',
    '--name',
    target.containerName,
    '--network=none',
    '--read-only',
    '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
    `--memory=${EXECUTION_LIMITS.memoryMb}m`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '-v',
    `${toMountPath(target.runnerDir)}:/opt/mlca/runner:ro`,
    '-v',
    `${toMountPath(target.testsDir)}:/opt/mlca/tests:ro`,
    '-v',
    `${toMountPath(target.fixturesDir)}:/opt/mlca/fixtures:ro`,
    ...(target.problemsDir ? ['-v', `${toMountPath(target.problemsDir)}:/opt/problems:ro`] : []),
    '--user=65534:65534',
    '--workdir=/tmp',
    target.image ?? JUDGE_IMAGE_DEFAULT,
    'python',
    '-m',
    'unittest',
    'discover',
    '-s',
    '/opt/mlca/tests',
    '-p',
    'test_*.py',
    '-v',
  ];
}

/**
 * 케이스의 기대값을 문자열로 뽑는다. **INV-5 게이트 전용**이다 (M1 DoD 7).
 *
 * 기대값이 사용자에게 새는지 확인하려면 먼저 기대값이 어떤 문자열인지 알아야 한다.
 * 이 명령의 출력은 검사 스크립트 안에서만 쓰이고 사용자에게 가는 경로가 없다.
 *
 * @param {{ containerName: string, casesDir: string, runnerDir: string, image?: string }} target
 * @returns {string[]}
 */
export function buildExpectDumpArgs(target) {
  return [
    'run',
    '--detach',
    '--name',
    target.containerName,
    '--network=none',
    '--read-only',
    '--tmpfs=/tmp:rw,noexec,nosuid,size=16m',
    `--memory=${EXECUTION_LIMITS.memoryMb}m`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '-v',
    `${toMountPath(target.casesDir)}:/cases:ro`,
    '-v',
    `${toMountPath(target.runnerDir)}:/opt/mlca/runner:ro`,
    '--user=65534:65534',
    target.image ?? JUDGE_IMAGE_DEFAULT,
    'python',
    '-c',
    [
      'import json, sys',
      'sys.path.insert(0, "/opt/mlca/runner")',
      'import numpy as np, codec',
      'from pathlib import Path',
      'values = set()',
      'for stem in sorted(Path("/cases").glob("expect_*.json")):',
      '    obj = codec.load(stem, stem.with_suffix(".npz"))',
      '    flat = np.asarray(obj).ravel() if isinstance(obj, np.ndarray) else np.asarray([obj]).ravel()',
      '    for v in flat.tolist()[:40]:',
      '        if isinstance(v, float):',
      '            values.add(repr(v))',
      '            for nd in (6, 8, 10):',
      '                values.add(f"{v:.{nd}f}")',
      'print(json.dumps(sorted(values)))',
    ].join('\n'),
  ];
}

/**
 * 컨테이너 안에서 격리가 실제로 걸려 있는지 확인하는 명령.
 * 설정을 읽는 것이 아니라 **커널이 보고하는 상태**를 읽는다 (INV-4).
 *
 * @param {{ containerName: string, image?: string }} target
 * @returns {string[]}
 */
export function buildIsolationProbeArgs(target) {
  return [
    'run',
    '--detach',
    '--name',
    target.containerName,
    '--network=none',
    '--read-only',
    `--tmpfs=/tmp:rw,noexec,nosuid,size=${EXECUTION_LIMITS.tmpfsMb}m`,
    `--memory=${EXECUTION_LIMITS.memoryMb}m`,
    `--memory-swap=${EXECUTION_LIMITS.memoryMb}m`,
    '--cpus=1.0',
    `--pids-limit=${EXECUTION_LIMITS.pidsLimit}`,
    '--user=65534:65534',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    target.image ?? JUDGE_IMAGE_DEFAULT,
    'python',
    '-c',
    [
      'import json,os,socket',
      'seccomp=[l.split()[1] for l in open("/proc/self/status") if l.startswith("Seccomp:")]',
      'caps=[l.split()[1] for l in open("/proc/self/status") if l.startswith("CapEff:")]',
      'nnp=[l.split()[1] for l in open("/proc/self/status") if l.startswith("NoNewPrivs:")]',
      'ifaces=os.listdir("/sys/class/net")',
      'try:',
      '    socket.create_connection(("1.1.1.1",53),timeout=2); net="reachable"',
      'except Exception as e:',
      '    net=type(e).__name__',
      'try:',
      '    open("/etc/probe","w"); rootrw=True',
      'except Exception:',
      '    rootrw=False',
      'print(json.dumps({"seccomp":seccomp,"capEff":caps,"noNewPrivs":nnp,'
        + '"interfaces":ifaces,"network":net,"rootWritable":rootrw,"uid":os.getuid()}))',
    ].join('\n'),
  ];
}
