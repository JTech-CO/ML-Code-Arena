/**
 * Phase 1 계약 상수 — docs/TECHNICAL.md 에서 이미 고정된 값만 담는다.
 *
 * 여기에 없는 값을 앱에서 하드코딩하지 않는다. 같은 수치가 두 곳에 있으면
 * 한쪽만 바뀌는 순간 격리 옵션·제한·오차 기준이 갈라진다.
 */

/**
 * 지원 언어. Phase 1 은 Python 단독 (docs/TECHNICAL.md §2.1).
 * @type {readonly ['python']}
 */
export const LANGUAGES = Object.freeze(['python']);

/** @typedef {'python'} Language */

/**
 * 채점 모드. `structural` 은 독립 모드가 아니라 `tolerance` 의 선행 단계다
 * (ADR-0002). 따라서 목록에는 `tolerance` 만 존재한다.
 * @type {readonly ['tolerance']}
 */
export const JUDGE_MODES = Object.freeze(['tolerance']);

/** @typedef {'tolerance'} JudgeMode */

/**
 * 제출 상태 전이 (docs/TECHNICAL.md §6.1, ADR-0001).
 * @type {readonly ['PENDING', 'JUDGING', 'DONE']}
 */
export const SUBMISSION_STATUSES = Object.freeze(['PENDING', 'JUDGING', 'DONE']);

/** @typedef {'PENDING'|'JUDGING'|'DONE'} SubmissionStatus */

/**
 * 채점 컨테이너 실행 제한 (docs/TECHNICAL.md §5.2).
 *
 * 이 값은 격리의 일부다. 디버깅 편의로 완화하지 않는다.
 * 실제 `docker run` 플래그는 M1 에서 워커의 단일 상수 모듈이 이 값을 읽어 조립한다
 * (HARNESS.md §4.3).
 */
export const EXECUTION_LIMITS = Object.freeze({
  /** 벽시계 시간 상한 */
  wallClockMs: 10_000,
  /** CPU 시간 상한. 벽시계보다 짧게 두어 sleep 회피를 차단한다 */
  cpuMs: 8_000,
  /** 메모리 상한 */
  memoryMb: 512,
  /** 프로세스 수 상한. fork bomb 방어 */
  pidsLimit: 64,
  /** 컨테이너 `/tmp` 크기 상한. 디스크 고갈 방어 */
  tmpfsMb: 64,
  /** 출력 크기 상한. 초과 시 절단 후 `RE` */
  outputBytes: 1024 * 1024,
});

/** 제출 소스 코드 크기 상한 (docs/TECHNICAL.md §5.4, §7.2). */
export const SOURCE_MAX_BYTES = 64 * 1024;

/**
 * `tolerance` 비교 기본값 (docs/TECHNICAL.md §4.1.1).
 * 문제별 `compare_options` 로 오버라이드할 수 있다.
 */
export const COMPARE_DEFAULTS = Object.freeze({
  rtol: 1e-5,
  atol: 1e-8,
  equalNan: false,
});

/**
 * 비로그인 사용자가 풀 수 있는 **고유 문제** 수 (docs/TECHNICAL.md §8.2).
 * 카운트는 서버에서만 증가한다 (INV-9).
 */
export const ANON_PROBLEM_LIMIT = 10;

/**
 * 제출 빈도 제한 (docs/TECHNICAL.md §7.3). 큐 앞단에서 차단한다.
 */
export const RATE_LIMITS = Object.freeze({
  user: Object.freeze({ perProblemMs: 10_000, perMinute: 12 }),
  anon: Object.freeze({ perProblemMs: 30_000, perMinute: 4 }),
});

/**
 * API 오류 코드 (docs/TECHNICAL.md §7.2).
 * @type {readonly ['SOURCE_TOO_LARGE', 'ANON_LIMIT_REACHED', 'RATE_LIMITED', 'PROBLEM_NOT_FOUND']}
 */
export const API_ERROR_CODES = Object.freeze([
  'SOURCE_TOO_LARGE',
  'ANON_LIMIT_REACHED',
  'RATE_LIMITED',
  'PROBLEM_NOT_FOUND',
]);

/** @typedef {'SOURCE_TOO_LARGE'|'ANON_LIMIT_REACHED'|'RATE_LIMITED'|'PROBLEM_NOT_FOUND'} ApiErrorCode */

/**
 * 채점 큐 키 네임스페이스 (ADR-0001).
 *
 * BullMQ 는 큐 **이름**에 `:` 를 금지한다 — 내부 Redis 키 구분자이기 때문이다.
 * 그래서 `judge:fast` 를 이름 하나로 쓰지 않고 접두사와 이름으로 나눈다.
 * 실제 Redis 키는 `judge:fast:*` 가 되어 ADR-0001 이 적은 것과 같아진다.
 */
export const QUEUE_PREFIX = 'judge';

/**
 * 큐 이름. API 와 워커가 같은 문자열을 써야 한다.
 * 불일치는 "제출이 PENDING 에서 멈춤"으로 나타난다 (RUNBOOK 20번).
 */
export const QUEUE_NAMES = Object.freeze({
  fast: 'fast',
  slow: 'slow',
});

/**
 * 로그·표시용 전체 이름. Redis 키 네임스페이스와 같은 모양이다.
 * @param {string} name
 * @returns {string}
 */
export function queueLabel(name) {
  return `${QUEUE_PREFIX}:${name}`;
}

/** 커리큘럼 단계 범위. Phase 1 은 이 중 1·2·4·5 만 출제한다 (docs/TECHNICAL.md §11). */
export const TIER_RANGE = Object.freeze({ min: 1, max: 9 });

/** @type {readonly number[]} */
export const PHASE1_TIERS = Object.freeze([1, 2, 4, 5]);

/** 정적 난이도 범위 (docs/TECHNICAL.md §6.1). */
export const DIFFICULTY_RANGE = Object.freeze({ min: 1, max: 5 });

/** 워커 동시성 기본값. 단일 노드 코어 수 기준 (docs/TECHNICAL.md §12). */
export const WORKER_CONCURRENCY_DEFAULT = 4;

/** 채점 컨테이너 이미지 기본 태그 (docs/ENVIRONMENT.md §3). */
export const JUDGE_IMAGE_DEFAULT = 'mlca-python:3.11';

/**
 * 임의의 값이 제출 상태인지 판별한다.
 * @param {unknown} value
 * @returns {value is SubmissionStatus}
 */
export function isSubmissionStatus(value) {
  return (
    typeof value === 'string' &&
    SUBMISSION_STATUSES.includes(/** @type {SubmissionStatus} */ (value))
  );
}
