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
 * `WA` 케이스의 노출 가능한 상세. **기대값 자체는 담지 않는다** (INV-5).
 *
 * 여기 담기는 것은 형태(shape·길이·키 개수)와 타입 이름까지다. shape 노출은
 * 백서 §4.2.3 이 명시한 예외이며, ML 입문자의 최다 오류가 축 실수이므로
 * 교육적 가치가 크고 정답 수치를 알려주지 않는다.
 *
 * @typedef {object} CaseDetail
 * @property {string} [reason] 사유 코드. shape_mismatch · value_mismatch · type_mismatch 등
 * @property {number[]} [expected_shape] 기대 shape. 값이 아니라 형태만
 * @property {number[]} [actual_shape] 실제 shape
 * @property {string} [expected_type] 기대 타입 **이름**
 * @property {string} [actual_type] 실제 타입 이름
 * @property {string} [expected_dtype] `require_dtype` 이 걸린 문제에서만
 * @property {string} [actual_dtype]
 * @property {number} [expected_length] list/tuple 길이
 * @property {number} [actual_length]
 * @property {number} [expected_key_count] dict 키 개수. 키 **이름**은 정답의 일부일 수 있어 담지 않는다
 * @property {number} [actual_key_count]
 * @property {number} [at] 중첩 구조에서 어긋난 위치
 */

/**
 * `FBD` 가 보고하는 위반 1건. 어떤 규칙을 어겼는지 반드시 명시한다 (docs/TECHNICAL.md §4.3).
 * 침묵하는 오답은 학습을 방해한다.
 * @typedef {object} RunnerViolation
 * @property {string} rule
 * @property {string} message 사용자에게 그대로 보이는 문장
 * @property {number} line
 */

/**
 * 케이스와 무관한 판정 상세. `CE`·`FBD`·`TLE`·`MLE` 처럼 특정 케이스에 매달 수 없는
 * 판정에 쓴다.
 *
 * 백서 §4.2.3 의 예시에는 없던 필드다. M1 에서 러너를 구현하며 확정했다 —
 * `FBD` 가 어떤 규칙을 어겼는지 말하지 못하면 §4.3 의 요구를 지킬 수 없고,
 * `CE` 가 몇 행인지 말하지 못하면 사용자가 고칠 수 없다.
 *
 * @typedef {object} RunnerDetail
 * @property {RunnerViolation[]} [violations] `FBD`
 * @property {string} [message] `CE`·`RE`
 * @property {number} [line] `CE`
 * @property {number} [limit_ms] `TLE`
 * @property {number} [limit_mb] `MLE`
 * @property {string} [kind] `TLE` 세부. `cpu` 면 CPU 시간 상한
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
 * @property {number} total_runtime_ms 케이스 실행 시간의 합. 컨테이너 기동 시간은 포함하지 않는다
 * @property {number} peak_memory_mb 피크 메모리
 * @property {string|null} error 인프라 오류 메시지. 사용자 코드 오류는 여기 담지 않는다
 * @property {RunnerDetail} [detail] 케이스에 매달 수 없는 판정 상세
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
