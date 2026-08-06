/**
 * 명세 조립 — 문제 정의가 침묵한 값은 공유 상수를 따라야 한다.
 *
 * 같은 숫자가 두 곳에 있으면 한쪽만 바뀌는 순간 격리 전제가 갈라진다.
 * 여기서 확인하는 것은 "문제가 값을 안 주면 무엇을 쓰는가"다.
 */

import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { EXECUTION_LIMITS } from '@mlca/shared';

import { buildSpec, countCases } from './workdir.js';

test('문제가 침묵하면 공유 상수를 쓴다', () => {
  const spec = buildSpec({ entrypoint: 'solve' }, 3);

  assert.equal(spec.time_limit_ms, EXECUTION_LIMITS.wallClockMs);
  assert.equal(spec.cpu_time_limit_ms, EXECUTION_LIMITS.cpuMs);
  assert.equal(spec.memory_limit_mb, EXECUTION_LIMITS.memoryMb);
  assert.equal(spec.output_limit_bytes, EXECUTION_LIMITS.outputBytes);
  assert.equal(spec.case_count, 3);
});

test('CPU 상한은 문제가 덮어쓰지 않는 한 벽시계보다 짧다', () => {
  const spec = buildSpec({ entrypoint: 'solve' }, 1);
  assert.ok(
    spec.cpu_time_limit_ms < spec.time_limit_ms,
    'CPU 상한이 벽시계 이상이면 sleep 으로 시간 제한을 회피할 수 있다',
  );
});

test('출력 상한은 문제가 덮어쓸 수 없다', () => {
  // 로그 폭탄 방어는 문제별 재량이 아니다.
  const spec = buildSpec({ entrypoint: 'solve', output_limit_bytes: 999_999_999 }, 1);
  assert.equal(spec.output_limit_bytes, EXECUTION_LIMITS.outputBytes);
});

test('문제가 준 시간·메모리 상한은 존중한다', () => {
  const spec = buildSpec({ entrypoint: 'solve', time_limit_ms: 5000, memory_limit_mb: 256 }, 1);
  assert.equal(spec.time_limit_ms, 5000);
  assert.equal(spec.memory_limit_mb, 256);
});

test('제한과 비교 옵션이 빠져도 객체로 채워진다', () => {
  // 러너의 spec 로더가 객체를 기대한다. null 이 가면 IE 가 난다.
  const spec = buildSpec({ entrypoint: 'solve' }, 0);
  assert.deepEqual(spec.restrictions, {});
  assert.deepEqual(spec.compare_options, {});
});

test('countCases 는 case_NN.json 만 센다', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mlca-cases-'));
  const files = [
    'case_00.json',
    'case_01.json',
    'case_00.npz',
    'case_01.npz',
    'expect_00.json',
    'expect_00.npz',
    'manifest.json',
    'case_2.json',
  ];
  await Promise.all(files.map((name) => writeFile(path.join(dir, name), '{}', 'utf8')));

  // npz·expect·manifest 를 함께 세면 러너가 없는 케이스를 읽으려다 IE 를 낸다.
  assert.equal(await countCases(dir), 2);
});
