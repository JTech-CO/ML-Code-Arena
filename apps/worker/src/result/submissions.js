/**
 * 제출 상태 전이와 결과 영속화.
 *
 * 상태는 `PENDING` → `JUDGING` → `DONE` 한 방향으로만 간다 (docs/TECHNICAL.md §6.1).
 *
 * **모든 쓰기가 멱등하다.** 워커가 채점 도중 죽으면 BullMQ 가 같은 작업을 다시 준다.
 * 그때 결과 행을 새로 만들면 제출 하나에 결과가 둘이 된다. 그래서 결과는 항상
 * 제출 행 자체를 UPDATE 하고, `solved` 는 ON CONFLICT DO NOTHING 으로 넣는다.
 */

import { getPool, withTransaction } from './db.js';

/**
 * @typedef {object} ClaimedSubmission
 * @property {string} id
 * @property {string} source
 * @property {string} problemSlug
 * @property {string} entrypoint
 * @property {number} timeLimitMs
 * @property {Record<string, unknown>} restrictions
 * @property {Record<string, unknown>} compareOptions
 * @property {string|null} userId
 * @property {number} attempts 이번 시도를 포함한 누적 시도 횟수
 */

/**
 * 채점을 시작한다고 표시하고 채점에 필요한 정보를 가져온다.
 *
 * 이미 `DONE` 인 제출은 `null` 을 돌려준다 — 재처리 시 이미 끝난 작업을 다시 채점하지
 * 않기 위해서다(DoD 3). `PENDING` 이 아니라 `DONE` 이 아닌 것을 잡는 이유는, 워커가
 * 죽어 `JUDGING` 으로 남은 고아를 다시 집어야 하기 때문이다.
 *
 * @param {string} submissionId
 * @returns {Promise<ClaimedSubmission|null>}
 */
export async function claimForJudging(submissionId) {
  const result = await getPool().query(
    `UPDATE submissions s
        SET status     = 'JUDGING',
            judging_at = COALESCE(s.judging_at, now()),
            attempts   = s.attempts + 1
      WHERE s.id = $1
        AND s.status <> 'DONE'
      RETURNING s.id, s.source, s.user_id, s.attempts, s.problem_id`,
    [submissionId],
  );

  const row = result.rows[0];
  if (!row) return null;

  const problem = await getPool().query(
    `SELECT slug, entrypoint, time_limit_ms, restrictions, compare_options
       FROM problems WHERE id = $1`,
    [row.problem_id],
  );

  const p = problem.rows[0];
  if (!p) throw new Error(`제출 ${submissionId} 의 문제를 찾을 수 없다`);

  return {
    id: row.id,
    source: row.source,
    problemSlug: p.slug,
    entrypoint: p.entrypoint,
    timeLimitMs: p.time_limit_ms,
    restrictions: p.restrictions ?? {},
    compareOptions: p.compare_options ?? {},
    userId: row.user_id,
    attempts: row.attempts,
  };
}

/**
 * 사용자에게 노출 가능한 상세만 골라 담는다 (INV-5).
 * 러너가 이미 기대값을 배제하고 주지만, 저장 시점에도 통째로 넣지 않고 형태를 고정한다.
 *
 * @param {import('@mlca/shared').RunnerOutput|null} output
 * @returns {Record<string, unknown>|null}
 */
function buildDetail(output) {
  if (!output) return null;

  const failing = Array.isArray(output.cases)
    ? output.cases.find((item) => item.verdict !== 'AC')
    : undefined;
  const top = output.detail ?? null;

  if (!failing?.detail && !top) return null;
  return { ...(top ?? {}), ...(failing?.detail ?? {}) };
}

/**
 * @param {import('@mlca/shared').RunnerOutput|null} output
 * @returns {number|null}
 */
function firstFailedCase(output) {
  if (!output || !Array.isArray(output.cases)) return null;
  const failing = output.cases.find((item) => item.verdict !== 'AC');
  return failing ? failing.index : null;
}

/** `ie_reason` 은 운영 로그다. 무한정 길어지면 행이 비대해지므로 자른다. */
const IE_REASON_MAX = 500;

/**
 * 채점 결과를 확정한다. 같은 제출에 여러 번 호출해도 결과가 같다.
 *
 * `ieReason` 은 **API 로 나가지 않는다** — `submissions.ie_reason` 은 `serialize.js`
 * 통과 목록 밖이다 (migration 0005). 여기 담기는 것은 도커·러너가 낸 실패 사유이며,
 * 이것이 없으면 알림이 "IE 3%"까지만 말하고 왜인지는 말하지 못한다
 * (docs/TECHNICAL.md §13.1).
 *
 * @param {{ submissionId: string, verdict: import('@mlca/shared').Verdict, output: import('@mlca/shared').RunnerOutput|null, ieReason?: string|null }} input
 * @returns {Promise<void>}
 */
export async function recordResult(input) {
  await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE submissions
          SET status          = 'DONE',
              verdict         = $2,
              runtime_ms      = $3,
              memory_mb       = $4,
              failed_case_seq = $5,
              detail          = $6,
              ie_reason       = $7,
              judged_at       = now()
        WHERE id = $1
        RETURNING user_id, problem_id, created_at`,
      [
        input.submissionId,
        input.verdict,
        input.output?.total_runtime_ms ?? null,
        input.output?.peak_memory_mb ?? null,
        firstFailedCase(input.output),
        buildDetail(input.output),
        input.verdict === 'IE' ? (input.ieReason ?? '원인 미상').slice(0, IE_REASON_MAX) : null,
      ],
    );

    const row = updated.rows[0];
    if (!row) return;

    // 최초 AC 에만 기록한다. 익명 제출은 user_id 가 없으므로 랭킹에 들어가지 않는다.
    if (input.verdict === 'AC' && row.user_id) {
      await client.query(
        `INSERT INTO solved (user_id, problem_id, first_ac_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, problem_id) DO NOTHING`,
        [row.user_id, row.problem_id, row.created_at],
      );
    }
  });
}

/**
 * 큐 대기 순번. 아직 채점이 시작되지 않은 제출 중 몇 번째인지 센다.
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
