import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANON_PROBLEM_LIMIT,
  API_ERROR_CODES,
  COMPARE_DEFAULTS,
  EXECUTION_LIMITS,
  JUDGE_MODES,
  LANGUAGES,
  PHASE1_TIERS,
  SOURCE_MAX_BYTES,
  SUBMISSION_STATUSES,
  isSubmissionStatus,
} from './index.js';

test('Phase 1 범위 상수가 백서 §2.1 과 일치한다', () => {
  assert.deepEqual([...LANGUAGES], ['python']);
  assert.deepEqual([...JUDGE_MODES], ['tolerance']);
  assert.deepEqual([...PHASE1_TIERS], [1, 2, 4, 5]);
  assert.equal(ANON_PROBLEM_LIMIT, 10);
});

test('실행 제한이 백서 §5.2 와 일치한다', () => {
  assert.equal(EXECUTION_LIMITS.wallClockMs, 10_000);
  assert.equal(EXECUTION_LIMITS.memoryMb, 512);
  assert.equal(EXECUTION_LIMITS.pidsLimit, 64);
  assert.equal(EXECUTION_LIMITS.tmpfsMb, 64);
  assert.equal(EXECUTION_LIMITS.outputBytes, 1024 * 1024);
  assert.equal(SOURCE_MAX_BYTES, 64 * 1024);
});

test('CPU 시간 상한이 벽시계보다 짧다 — sleep 회피 차단 전제', () => {
  assert.ok(
    EXECUTION_LIMITS.cpuMs < EXECUTION_LIMITS.wallClockMs,
    'CPU 상한이 벽시계 이상이면 sleep 으로 시간 제한을 회피할 수 있다',
  );
});

test('비교 기본값이 백서 §4.1.1 과 일치한다', () => {
  assert.deepEqual({ ...COMPARE_DEFAULTS }, { rtol: 1e-5, atol: 1e-8, equalNan: false });
});

test('제출 상태와 API 오류 코드가 백서 §6.1 · §7.2 와 일치한다', () => {
  assert.deepEqual([...SUBMISSION_STATUSES], ['PENDING', 'JUDGING', 'DONE']);
  assert.deepEqual(
    [...API_ERROR_CODES],
    ['SOURCE_TOO_LARGE', 'ANON_LIMIT_REACHED', 'RATE_LIMITED', 'PROBLEM_NOT_FOUND'],
  );
});

test('isSubmissionStatus 는 판정 코드를 상태로 오인하지 않는다', () => {
  for (const status of SUBMISSION_STATUSES) {
    assert.ok(isSubmissionStatus(status));
  }
  for (const bad of ['AC', 'pending', '', null, undefined]) {
    assert.equal(isSubmissionStatus(bad), false, `${String(bad)} 를 상태로 오인했다`);
  }
});
