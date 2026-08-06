/**
 * 구조 불변식 — **워커는 사용자 코드를 실행하지 않는다** (M7 DoD 9).
 *
 * 이 명제가 배포 설계 전체를 떠받친다. 워커는 `docker` 그룹 소속이고 그것은 사실상
 * 호스트 루트 권한이다 (ADR-0007). 워커가 사용자 코드를 조금이라도 실행하는 순간,
 * 임의의 제출이 호스트 루트가 된다 — 격리 컨테이너를 아무리 잠가도 소용없다.
 *
 * 문서와 주석으로 적어 둔 규칙은 지켜지는지 아무도 확인하지 않는다. 그래서 검사로 둔다.
 * 여기서 막는 것은 "무심코 추가되는 실행 경로"이며, 작정하고 우회하는 코드가 아니다 —
 * 그런 코드는 리뷰가 막아야 한다.
 */

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));

/** 프로세스를 만드는 유일한 파일. 여기 말고 다른 곳에 생기면 안 된다. */
const SPAWN_OWNER = path.join('sandbox', 'docker.js');

/** @returns {Promise<string[]>} */
async function sourceFiles(dir = SRC) {
  /** @type {string[]} */
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) found.push(full);
  }
  return found;
}

test('프로세스 생성은 sandbox/docker.js 한 곳에서만 한다', async () => {
  const offenders = [];

  for (const file of await sourceFiles()) {
    const source = await readFile(file, 'utf8');
    if (!/from ['"]node:child_process['"]/.test(source)) continue;
    if (file.endsWith(SPAWN_OWNER)) continue;
    offenders.push(path.relative(SRC, file));
  }

  assert.deepEqual(
    offenders,
    [],
    `child_process 를 쓰는 파일이 늘었다. 실행 경로가 하나여야 감사가 가능하다: ${offenders.join(', ')}`,
  );
});

test('워커가 실행하는 바이너리는 docker 뿐이다', async () => {
  const source = await readFile(path.join(SRC, SPAWN_OWNER), 'utf8');

  // `spawn(...)` 의 첫 인자를 전부 모은다.
  const targets = [...source.matchAll(/\bspawn\s*\(\s*([^,)]+)/g)].map((match) =>
    (match[1] ?? '').trim(),
  );

  assert.ok(targets.length > 0, 'spawn 호출을 찾지 못했다 — 검사가 무의미해졌다');
  assert.deepEqual(
    [...new Set(targets)],
    ["'docker'"],
    `docker 외의 것을 실행한다: ${targets.join(', ')}. 사용자 코드는 컨테이너 안에서만 돈다`,
  );
});

test('워커 소스에 동적 코드 실행 경로가 없다', async () => {
  // 제출 원문은 파일로 써서 컨테이너에 마운트될 뿐, 워커 프로세스 안에서 값이 되어서는
  // 안 된다. `vm`·`eval`·`new Function` 은 그 값을 코드로 바꾸는 통로다.
  const patterns = [
    { name: 'eval(', regex: /\beval\s*\(/ },
    { name: 'new Function(', regex: /\bnew\s+Function\s*\(/ },
    { name: "import 'node:vm'", regex: /from ['"]node:vm['"]/ },
    { name: 'require("vm")', regex: /require\(['"]vm['"]\)/ },
  ];

  /** @type {string[]} */
  const offenders = [];
  for (const file of await sourceFiles()) {
    const source = await readFile(file, 'utf8');
    for (const pattern of patterns) {
      if (pattern.regex.test(source)) offenders.push(`${path.relative(SRC, file)}: ${pattern.name}`);
    }
  }

  assert.deepEqual(offenders, [], `동적 실행 경로가 있다: ${offenders.join(', ')}`);
});

test('제출 원문이 워커 프로세스에서 import 되지 않는다', async () => {
  // 작업 디렉터리에 쓰는 파일명. 이 이름이 import·require 의 인자로 등장하면
  // 워커가 사용자 코드를 자기 안으로 들여오는 것이다.
  const offenders = [];
  for (const file of await sourceFiles()) {
    const source = await readFile(file, 'utf8');
    if (/(?:import|require)\s*\(\s*[^)]*solution/i.test(source)) {
      offenders.push(path.relative(SRC, file));
    }
  }
  assert.deepEqual(offenders, [], `solution 을 적재하는 코드가 있다: ${offenders.join(', ')}`);
});
