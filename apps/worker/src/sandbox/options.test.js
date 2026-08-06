/**
 * 격리 옵션 회귀 가드 (INV-4).
 *
 * 컨테이너를 띄우지 않고도 지킬 수 있는 것이 있다. **플래그가 사라지지 않았는지**다.
 * 누군가 디버깅하다 `--network=none` 을 지우고 되돌리는 것을 잊으면, 그 사실은
 * Docker 가 있는 곳에서만 드러난다. 여기서 막으면 커밋 시점에 드러난다.
 *
 * 실제로 격리가 **작동하는지**는 컨테이너 안에서 확인해야 한다 —
 * `tools/judge-fixtures.js` 의 커널 상태 프로브가 그 몫이다.
 * 플래그를 넘겼다는 사실과 필터가 걸려 있다는 사실은 다른 명제다.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXECUTION_LIMITS } from '@mlca/shared';

import {
  buildIsolationProbeArgs,
  buildMakeCasesArgs,
  buildPidsProbeArgs,
  buildRunArgs,
  buildUnitTestArgs,
} from './options.js';

const TARGET = {
  containerName: 'mlca-judge-test',
  judgeDir: '/tmp/work/sub-1',
  runnerDir: '/tmp/repo/judge/runner',
};

/**
 * 사용자 코드를 실행하는 모든 경로. 여기 전부에 격리가 걸려야 한다.
 * @type {[string, () => string[]][]}
 */
const UNTRUSTED_BUILDERS = [
  ['buildRunArgs', () => buildRunArgs(TARGET)],
  ['buildIsolationProbeArgs', () => buildIsolationProbeArgs({ containerName: 'p' })],
  ['buildPidsProbeArgs', () => buildPidsProbeArgs({ containerName: 'p' })],
];

test('채점 실행에 필수 격리 플래그가 전부 붙는다', () => {
  const args = buildRunArgs(TARGET);

  for (const flag of [
    '--network=none',
    '--read-only',
    `--memory=${EXECUTION_LIMITS.memoryMb}m`,
    `--memory-swap=${EXECUTION_LIMITS.memoryMb}m`,
    '--cpus=1.0',
    `--pids-limit=${EXECUTION_LIMITS.pidsLimit}`,
    '--user=65534:65534',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
  ]) {
    assert.ok(args.includes(flag), `${flag} 가 빠졌다`);
  }
});

test('tmpfs 가 noexec·nosuid 로 걸리고 크기 상한이 있다', () => {
  const tmpfs = buildRunArgs(TARGET).find((arg) => arg.startsWith('--tmpfs='));
  assert.ok(tmpfs, '--tmpfs 가 없다');
  assert.match(tmpfs, /noexec/);
  assert.match(tmpfs, /nosuid/);
  assert.match(tmpfs, new RegExp(`size=${EXECUTION_LIMITS.tmpfsMb}m`));
});

test('마운트가 전부 읽기 전용이다', () => {
  const args = buildRunArgs(TARGET);
  const mounts = args.filter((_, index) => args[index - 1] === '-v');

  assert.equal(mounts.length, 2, '마운트는 제출 디렉터리와 러너 둘뿐이어야 한다');
  for (const mount of mounts) {
    assert.ok(mount.endsWith(':ro'), `읽기 전용이 아니다: ${mount}`);
  }
});

test('러너는 제출 디렉터리와 다른 볼륨에 붙는다', () => {
  const args = buildRunArgs(TARGET);
  assert.ok(args.some((arg) => arg.endsWith(':/judge:ro')));
  assert.ok(args.some((arg) => arg.endsWith(':/opt/mlca/runner:ro')));
  // 러너가 /judge 안에 있으면 제출 디렉터리를 만드는 쪽에서 변조 경로가 생긴다.
  assert.ok(!args.some((arg) => arg.includes(':/judge/runner')));
});

test('메모리와 swap 상한이 같다 — 스왑으로 상한을 우회하지 못한다', () => {
  const args = buildRunArgs(TARGET);
  const memory = args.find((arg) => arg.startsWith('--memory='));
  const swap = args.find((arg) => arg.startsWith('--memory-swap='));
  assert.equal(memory?.split('=')[1], swap?.split('=')[1]);
});

test('컨테이너 시간 상한이 러너 자신의 상한보다 길다', () => {
  // 컨테이너의 timeout 이 먼저 죽이면 러너가 깨끗한 JSON 을 낼 기회가 없어지고,
  // 판정 근거가 사라져 TLE 가 IE 로 잘못 분류된다.
  const timeLimitMs = 10_000;
  const args = buildRunArgs({ ...TARGET, timeLimitMs });
  const seconds = Number(args[args.indexOf('timeout') + 3]);

  assert.ok(Number.isInteger(seconds), 'timeout 초가 정수가 아니다');
  assert.ok(seconds > timeLimitMs / 1000, `컨테이너 상한 ${seconds}s 가 러너 상한보다 짧다`);
});

test('러너 진입점이 마운트된 러너 경로를 가리킨다', () => {
  const args = buildRunArgs(TARGET);
  assert.deepEqual(args.slice(-2), ['python', '/opt/mlca/runner/runner.py']);
});

test('위험한 플래그가 어떤 경로에도 없다', () => {
  // 편의를 위한 우회가 곧 보안 사고가 된다 (CLAUDE.md). 케이스 생성 경로도 함께 본다.
  const FORBIDDEN = [
    '--privileged',
    '--network=host',
    '--network=bridge',
    '--security-opt=seccomp=unconfined',
    '--security-opt=apparmor=unconfined',
    '--pid=host',
    '--ipc=host',
    '--userns=host',
    '-v/var/run/docker.sock:/var/run/docker.sock',
  ];

  /** @type {[string, () => string[]][]} */
  const builders = [
    ...UNTRUSTED_BUILDERS,
    [
      'buildMakeCasesArgs',
      () => buildMakeCasesArgs({ containerName: 'c', problemDir: '/p', runnerDir: '/r' }),
    ],
    [
      'buildUnitTestArgs',
      () => buildUnitTestArgs({ containerName: 'c', runnerDir: '/r', testsDir: '/t' }),
    ],
  ];

  for (const [name, build] of builders) {
    const joined = build().join(' ');
    for (const flag of FORBIDDEN) {
      assert.ok(!joined.includes(flag), `${name} 에 ${flag} 가 있다`);
    }
    assert.ok(!joined.includes('--cap-add'), `${name} 에 --cap-add 가 있다`);
  }
});

test('사용자 코드를 실행하는 모든 경로가 네트워크를 끊고 비특권으로 돈다', () => {
  for (const [name, build] of UNTRUSTED_BUILDERS) {
    const args = build();
    assert.ok(args.includes('--network=none'), `${name} 에 --network=none 이 없다`);
    assert.ok(args.includes('--user=65534:65534'), `${name} 이 root 로 돈다`);
    assert.ok(args.includes('--cap-drop=ALL'), `${name} 에 --cap-drop=ALL 이 없다`);
  }
});

test('케이스 생성은 문제 디렉터리에 쓰지만 네트워크는 여전히 끊는다', () => {
  // 케이스 생성이 외부를 타면 기대값의 재현성이 사라진다 (INV-10).
  const args = buildMakeCasesArgs({ containerName: 'c', problemDir: '/p', runnerDir: '/r' });
  assert.ok(args.includes('--network=none'));
  assert.ok(args.some((arg) => arg.endsWith(':/problem')), '문제 디렉터리는 쓰기 가능해야 한다');
  assert.ok(args.some((arg) => arg.endsWith(':/opt/mlca/runner:ro')));
});

test('컨테이너 이름이 제출마다 달라질 수 있게 인자로 들어온다', () => {
  // 이름이 고정이면 두 번째 제출이 첫 번째 컨테이너와 충돌한다 (INV-8).
  const a = buildRunArgs({ ...TARGET, containerName: 'mlca-judge-a' });
  const b = buildRunArgs({ ...TARGET, containerName: 'mlca-judge-b' });
  assert.ok(a.includes('mlca-judge-a'));
  assert.ok(b.includes('mlca-judge-b'));
});

test('Windows 경로가 슬래시로 정규화된다', () => {
  const args = buildRunArgs({ ...TARGET, judgeDir: 'C:\\work\\sub-1', runnerDir: 'C:\\repo\\runner' });
  const mounts = args.filter((_, index) => args[index - 1] === '-v');
  for (const mount of mounts) {
    assert.ok(!mount.includes('\\'), `역슬래시가 남았다: ${mount}`);
  }
});
