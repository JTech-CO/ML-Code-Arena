/**
 * 응답 직렬화 — **INV-5 의 관문**.
 *
 * DB 행을 그대로 내보내지 않는다. 나갈 수 있는 필드를 여기서 화이트리스트로 고정한다.
 * 통과 목록 방식이라, 러너나 스키마에 새 필드가 생겨도 여기 적지 않는 한 밖으로 나가지
 * 않는다. 차단 목록이었다면 새 필드가 기본으로 노출되고, 그 사실은 아무도 모른다.
 *
 * 특히 `source`(제출 원문)와 `password_hash` 는 어떤 응답에도 실리지 않는다.
 */

/** 판정 상세에서 내보내도 되는 키. 값이 아니라 **형태**만이다 (docs/TECHNICAL.md §4.2.3). */
const ALLOWED_DETAIL_KEYS = Object.freeze([
  'reason',
  'expected_shape',
  'actual_shape',
  'expected_type',
  'actual_type',
  'expected_dtype',
  'actual_dtype',
  'expected_length',
  'actual_length',
  'expected_key_count',
  'actual_key_count',
  'at',
  'message',
  'line',
  'limit_ms',
  'limit_mb',
  'kind',
]);

/**
 * @param {unknown} detail
 * @returns {Record<string, unknown>|null}
 */
export function sanitizeDetail(detail) {
  if (!detail || typeof detail !== 'object') return null;

  const source = /** @type {Record<string, unknown>} */ (detail);
  /** @type {Record<string, unknown>} */
  const out = {};

  for (const key of ALLOWED_DETAIL_KEYS) {
    if (source[key] !== undefined) out[key] = source[key];
  }

  // `FBD` 의 위반 목록은 구조가 있어 따로 정제한다. 사용자가 무엇을 고쳐야 하는지
  // 알려면 필요하고(docs/TECHNICAL.md §4.3), 규칙 이름과 문장은 기대값과 무관하다.
  if (Array.isArray(source['violations'])) {
    out['violations'] = source['violations'].map((item) => ({
      rule: item?.rule ?? '',
      message: item?.message ?? '',
      line: item?.line ?? 0,
    }));
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * 제출 단건 응답 (docs/TECHNICAL.md §7.2).
 * @param {Record<string, any>} row
 */
export function submissionView(row) {
  return {
    id: row.id,
    problem_slug: row.problem_slug,
    handle: row.handle ?? null,
    status: row.status,
    verdict: row.verdict ?? null,
    runtime_ms: row.runtime_ms ?? null,
    memory_mb: row.memory_mb ?? null,
    failed_case_seq: row.failed_case_seq ?? null,
    detail: sanitizeDetail(row.detail),
    created_at: row.created_at,
    judged_at: row.judged_at ?? null,
  };
}

/**
 * SSE 스트림 이벤트 (docs/TECHNICAL.md §7.4).
 * 익명 제출은 애초에 스트림에 오르지 않지만, 여기서도 핸들 없는 행은 만들지 않는다.
 * @param {Record<string, any>} row
 */
export function streamEvent(row) {
  return {
    id: row.id,
    handle: row.handle,
    problem: row.problem_slug,
    verdict: row.verdict,
    runtime_ms: row.runtime_ms ?? null,
  };
}

/**
 * 제한을 사용자에게 보여줄 형태로. 제한 칩이 이 값을 쓴다 (docs/DESIGN.md §6.4).
 * @param {Record<string, any>|null|undefined} restrictions
 */
function restrictionView(restrictions) {
  if (!restrictions || typeof restrictions !== 'object') return null;
  return {
    allowed_imports: restrictions['allowed_imports'] ?? null,
    forbidden_imports: restrictions['forbidden_imports'] ?? null,
    forbidden_attributes: restrictions['forbidden_attributes'] ?? null,
    forbidden_builtins: restrictions['forbidden_builtins'] ?? null,
    required_entrypoint: restrictions['required_entrypoint'] ?? null,
  };
}

/** @param {Record<string, any>} row */
export function problemSummary(row) {
  return {
    slug: row.slug,
    title: row.title,
    tier: row.tier,
    difficulty: row.difficulty,
    restrictions: restrictionView(row.restrictions),
    judged_count: Number(row.judged_count ?? 0),
    accepted_count: Number(row.accepted_count ?? 0),
    acceptance_rate: row.acceptance_rate === null ? null : Number(row.acceptance_rate),
  };
}

/** @param {Record<string, any>} row */
export function problemDetail(row) {
  return {
    ...problemSummary(row),
    judge_mode: row.judge_mode,
    allowed_languages: row.allowed_languages,
    entrypoint: row.entrypoint,
    time_limit_ms: row.time_limit_ms,
    memory_limit_mb: row.memory_limit_mb,
    compare_options: row.compare_options ?? {},
    statement_md: row.statement_md ?? '',
  };
}

/** @param {{ id: string, email: string, handle: string }} user */
export function userView(user) {
  return { id: user.id, email: user.email, handle: user.handle };
}
