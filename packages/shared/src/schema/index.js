/**
 * 계약 스키마 타입 — 러너 출력과 API 응답의 형태를 한 곳에 고정한다.
 *
 * 여기 정의는 docs/TECHNICAL.md §4.2.3 · §7.2 를 그대로 옮긴 것이다.
 * **M1(채점 러너)이 이 계약의 원점**이므로, 러너 구현이 확정되면 M1 에서
 * 이 파일과 대조하고 어긋나면 백서와 함께 갱신한다 (docs/README.md 갱신 규칙).
 *
 * INV-5: 기대값(expect)은 이 스키마 어디에도 실리지 않는다.
 * `WA` 피드백은 shape 까지만 노출한다 (docs/TECHNICAL.md §4.2.3).
 *
 * 다른 모듈의 타입은 `import('...')` 인라인 형태로 참조한다.
 * `@typedef` 로 별칭을 만들면 barrel 의 `export *` 에서 이름이 충돌한다.
 */

/**
 * 스키마 버전. 러너 출력 형태가 바뀌면 올리고 워커에서 대조한다.
 */
export const RUNNER_OUTPUT_SCHEMA_VERSION = 1;

/**
 * `WA` 케이스의 노출 가능한 상세. 기대값 자체는 담지 않는다 (INV-5).
 * @typedef {object} CaseDetail
 * @property {number[]} [expected_shape] 기대 shape. 값이 아니라 형태만
 * @property {number[]} [actual_shape] 실제 shape
 */

/**
 * 케이스 1건의 채점 결과.
 * @typedef {object} CaseResult
 * @property {number} index 케이스 순번 (0-based)
 * @property {import('../verdict/index.js').Verdict} verdict 케이스 판정
 * @property {number} runtime_ms 케이스 실행 시간. 러너 내부 기준으로 측정한다
 * @property {CaseDetail} [detail] 실패 케이스의 노출 가능한 상세
 */

/**
 * 러너가 stdout 에 단일 라인 JSON 으로 출력하는 결과 (docs/TECHNICAL.md §4.2.3).
 * @typedef {object} RunnerOutput
 * @property {import('../verdict/index.js').Verdict} verdict 최종 판정
 * @property {CaseResult[]} cases 케이스별 결과
 * @property {number} total_runtime_ms 전체 실행 시간
 * @property {number} peak_memory_mb 피크 메모리
 * @property {string|null} error 인프라 오류 메시지. 사용자 코드 오류는 여기 담지 않는다
 */

/**
 * 제출 요청 본문 (docs/TECHNICAL.md §7.2).
 * @typedef {object} SubmissionRequest
 * @property {string} problem_slug
 * @property {import('../constants/index.js').Language} language
 * @property {string} source 원문. `SOURCE_MAX_BYTES` 이하
 */

/**
 * 제출 접수 응답 (202 Accepted).
 * @typedef {object} SubmissionAccepted
 * @property {string} submission_id
 * @property {import('../constants/index.js').SubmissionStatus} status
 * @property {number} queue_position
 */

/**
 * 제출 조회 응답. 채점 완료 전에는 판정 관련 필드가 null 이다.
 * @typedef {object} SubmissionView
 * @property {string} id
 * @property {string} problem_slug
 * @property {import('../constants/index.js').SubmissionStatus} status
 * @property {import('../verdict/index.js').Verdict|null} verdict
 * @property {number|null} runtime_ms
 * @property {number|null} memory_mb
 * @property {number|null} failed_case_seq 최초 실패 케이스 순번
 * @property {CaseDetail|null} detail
 */

/**
 * SSE `submission` 이벤트 페이로드 (docs/TECHNICAL.md §7.4).
 * 익명 사용자의 제출은 스트림에 싣지 않는다.
 * @typedef {object} SubmissionStreamEvent
 * @property {string} id
 * @property {string} handle
 * @property {string} problem
 * @property {import('../verdict/index.js').Verdict} verdict
 * @property {number} runtime_ms
 */

/**
 * API 오류 응답.
 * @typedef {object} ApiError
 * @property {import('../constants/index.js').ApiErrorCode} code
 * @property {string} message 사용자에게 보여줄 문장. 기대값을 담지 않는다 (INV-5)
 */
