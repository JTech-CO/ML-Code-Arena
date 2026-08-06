/** 제출 생성·조회. 소유자는 로그인 사용자이거나 익명 세션이거나 정확히 하나다. */

import { getPool } from './pool.js';

/**
 * @param {{ problemId: string, userId: string|null, anonSessionId: string|null, language: string, source: string }} input
 * @returns {Promise<{ id: string, created_at: Date }>}
 */
export async function createSubmission(input) {
  const result = await getPool().query(
    `INSERT INTO submissions (problem_id, user_id, anon_session_id, language, source, status)
     VALUES ($1, $2, $3, $4, $5, 'PENDING')
     RETURNING id, created_at`,
    [input.problemId, input.userId, input.anonSessionId, input.language, input.source],
  );
  return result.rows[0];
}

/**
 * @param {string} id
 * @returns {Promise<Record<string, any>|null>}
 */
export async function findById(id) {
  const result = await getPool().query(
    `SELECT s.id, s.status, s.verdict, s.runtime_ms, s.memory_mb, s.failed_case_seq,
            s.detail, s.created_at, s.judged_at, s.user_id, s.anon_session_id,
            p.slug AS problem_slug, u.handle
       FROM submissions s
       JOIN problems p ON p.id = s.problem_id
       LEFT JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * 최근 제출 목록. 익명 제출은 포함하지 않는다 — 목록은 공개 화면이다.
 * @param {{ limit?: number }} [filter]
 * @returns {Promise<Record<string, any>[]>}
 */
export async function listRecent(filter = {}) {
  const result = await getPool().query(
    `SELECT s.id, s.status, s.verdict, s.runtime_ms, s.memory_mb, s.created_at,
            p.slug AS problem_slug, u.handle
       FROM submissions s
       JOIN problems p ON p.id = s.problem_id
       JOIN users u ON u.id = s.user_id
      WHERE s.user_id IS NOT NULL
      ORDER BY s.created_at DESC
      LIMIT $1`,
    [Math.min(filter.limit ?? 50, 200)],
  );
  return result.rows;
}

/**
 * 큐 대기 순번. 아직 채점이 시작되지 않은 제출 중 몇 번째인지 센다.
 *
 * `apps/worker` 에도 같은 정의가 있다. 경계 규칙상 두 앱은 서로를 import 할 수 없어
 * 코드가 두 벌이다 (INV-3). 정의가 갈라지면 CLI 와 API 가 다른 순번을 말하게 되므로
 * 한쪽을 고치면 다른 쪽도 고친다.
 *
 * @param {string} submissionId
 * @returns {Promise<number>}
 */
export async function queuePosition(submissionId) {
  const result = await getPool().query(
    `SELECT count(*)::int AS ahead
       FROM submissions
      WHERE status = 'PENDING'
        AND created_at < (SELECT created_at FROM submissions WHERE id = $1)`,
    [submissionId],
  );
  return (result.rows[0]?.ahead ?? 0) + 1;
}
