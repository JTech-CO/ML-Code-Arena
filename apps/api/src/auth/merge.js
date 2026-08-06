/**
 * 계정 승계 — 익명 제출 이력을 계정으로 옮긴다 (docs/TECHNICAL.md §8.3).
 *
 * 이 기능은 전환율에 직접 영향을 준다. "지금 가입하면 지금까지 푼 기록이 그대로
 * 유지됩니다"가 성립하려면 승계가 실제로 정확해야 한다.
 *
 * **단일 트랜잭션이다.** 중간에 실패하면 전부 롤백된다. 제출은 옮겼는데 `solved` 를
 * 못 채우면 사용자는 푼 문제가 랭킹에 안 잡히는 상태로 남는다.
 *
 * **쿠키 삭제보다 먼저 실행한다.** 순서가 뒤집히면 익명 세션 ID 를 잃어 이력이
 * 영영 고아가 된다 (RUNBOOK 29번).
 */

import { withTransaction } from '../db/pool.js';

/**
 * @param {{ anonSessionId: string, userId: string }} input
 * @returns {Promise<{ movedSubmissions: number, solvedAdded: number }>}
 */
export async function mergeAnonIntoUser(input) {
  return withTransaction(async (client) => {
    // 이미 승계된 세션은 다시 옮기지 않는다. 두 번 로그인해도 결과가 같아야 한다.
    const session = await client.query(
      `SELECT merged_user_id FROM anon_sessions WHERE id = $1 FOR UPDATE`,
      [input.anonSessionId],
    );
    if (session.rowCount === 0 || session.rows[0].merged_user_id) {
      return { movedSubmissions: 0, solvedAdded: 0 };
    }

    const moved = await client.query(
      `UPDATE submissions
          SET user_id = $1, anon_session_id = NULL
        WHERE anon_session_id = $2`,
      [input.userId, input.anonSessionId],
    );

    // 옮겨온 제출까지 포함해 최초 AC 를 다시 계산한다.
    // ON CONFLICT DO NOTHING 이므로 이미 있는 기록은 시각이 바뀌지 않는다.
    const solved = await client.query(
      `INSERT INTO solved (user_id, problem_id, first_ac_at)
       SELECT $1, problem_id, MIN(created_at)
         FROM submissions
        WHERE user_id = $1 AND verdict = 'AC'
        GROUP BY problem_id
       ON CONFLICT (user_id, problem_id) DO NOTHING`,
      [input.userId],
    );

    await client.query(`UPDATE anon_sessions SET merged_user_id = $1 WHERE id = $2`, [
      input.userId,
      input.anonSessionId,
    ]);

    return {
      movedSubmissions: moved.rowCount ?? 0,
      solvedAdded: solved.rowCount ?? 0,
    };
  });
}
