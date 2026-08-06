/**
 * 익명 세션 (docs/TECHNICAL.md §8.2, ADR-0005, INV-9).
 *
 * **한도 카운트는 서버에서만 계산한다.** 클라이언트가 보낸 어떤 값도 쓰지 않는다.
 * 그리고 카운터 컬럼조차 신뢰하지 않고 **제출 이력에서 직접 센다** — 카운터는
 * 갱신을 한 번 놓치면 조용히 틀어지지만, 이력은 제출과 함께 남으므로 틀어질 수 없다.
 *
 * 이 제한의 목적은 방어가 아니라 가입 유도다 (ADR-0005). 쿠키 삭제·시크릿 창으로
 * 우회 가능하며 그것은 설계상 수용된 비용이다.
 */

import { getPool } from './pool.js';

/**
 * @param {{ ipHash: Buffer, uaHash: Buffer }} input
 * @returns {Promise<string>} 익명 세션 ID
 */
export async function createAnonSession(input) {
  const result = await getPool().query(
    `INSERT INTO anon_sessions (ip_hash, ua_hash) VALUES ($1, $2) RETURNING id`,
    [input.ipHash, input.uaHash],
  );
  return result.rows[0].id;
}

/**
 * @param {string|null} id
 * @returns {Promise<{ id: string, merged_user_id: string|null }|null>}
 */
export async function findAnonSession(id) {
  if (!id) return null;
  const result = await getPool().query(
    `SELECT id, merged_user_id FROM anon_sessions WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * 이 익명 세션이 **손댄 고유 문제 수**. 제출 횟수가 아니다.
 * 같은 문제에 여러 번 제출해도 1로 센다 (docs/TECHNICAL.md §8.2).
 *
 * @param {string} anonSessionId
 * @returns {Promise<number>}
 */
export async function distinctProblemCount(anonSessionId) {
  const result = await getPool().query(
    `SELECT count(DISTINCT problem_id)::int AS n
       FROM submissions WHERE anon_session_id = $1`,
    [anonSessionId],
  );
  return result.rows[0]?.n ?? 0;
}

/**
 * 이 익명 세션이 이 문제에 이미 제출한 적이 있는가.
 * 있으면 새 문제가 아니므로 한도를 소진하지 않는다.
 *
 * @param {string} anonSessionId
 * @param {string} problemId
 * @returns {Promise<boolean>}
 */
export async function hasAttempted(anonSessionId, problemId) {
  const result = await getPool().query(
    `SELECT 1 FROM submissions WHERE anon_session_id = $1 AND problem_id = $2 LIMIT 1`,
    [anonSessionId, problemId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * 표시용 카운터를 이력과 맞춘다. 판단에는 쓰지 않는다 — 이력이 정본이다.
 * @param {string} anonSessionId
 * @returns {Promise<void>}
 */
export async function syncSolvedCount(anonSessionId) {
  await getPool().query(
    `UPDATE anon_sessions
        SET solved_count = (SELECT count(DISTINCT problem_id)
                              FROM submissions WHERE anon_session_id = $1)
      WHERE id = $1`,
    [anonSessionId],
  );
}
