/**
 * 개발용 시드 — 랭킹 화면을 볼 만큼의 계정과 해결 기록을 넣는다.
 *
 *   node --env-file-if-exists=.env tools/seed-dev.js
 *
 * **문제와 개념은 여기서 만들지 않는다.** M6 부터 그것은 `problems/` 의 파일이 원본이고
 * `pnpm problems:sync` 가 적재한다. 두 곳에서 문제를 만들면 어느 쪽이 진짜인지 알 수
 * 없어지고, 시드가 적재된 정의를 덮어쓰는 사고가 난다.
 *
 * 여기 남은 것은 **랭킹 화면의 표본**뿐이다. 랭킹은 여러 사용자의 해결 기록이 있어야
 * 정렬·동점·빈 상태를 확인할 수 있는데, 그 데이터를 실제 제출로 만들려면 계정마다
 * 수십 번 채점을 돌려야 한다.
 *
 * 비밀번호 해시는 실제 argon2id 형식이어야 한다 — DB 가 `CHECK` 로 막는다(0004).
 * 형식만 맞는 가짜 값을 넣지 않는 이유는, 그러면 이 계정으로 로그인할 수 없어
 * 랭킹 외의 화면을 확인할 때 계정을 또 만들어야 하기 때문이다.
 */

import { closePool, getPool } from '../apps/worker/src/result/db.js';

/**
 * `dev-password` 의 argon2id 해시 (M3 파라미터: m=19456, t=2, p=1).
 *
 * 시크릿이 아니다 — 공개 저장소에 있는 개발용 고정값이며 운영 DB 에는 이 시드를
 * 돌리지 않는다. 비밀번호가 `dev-password` 라는 것도 여기 적어 둔다.
 */
const DEV_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$+mD+8Y7veXSJrszM2Atjvg$czw6iloMjUcBRJcIstW7zCVje3FsDWxRhXGwqvjuP/Q';

/** 해결한 문제 수가 서로 달라야 순위가 갈린다. 동점도 하나 만든다. */
const ACCOUNTS = [
  { handle: 'annotator', email: 'annotator@example.com', solves: 22 },
  { handle: 'gradient', email: 'gradient@example.com', solves: 17 },
  { handle: 'tensorless', email: 'tensorless@example.com', solves: 17 },
  { handle: 'eigenfan', email: 'eigenfan@example.com', solves: 9 },
  { handle: 'newcomer', email: 'newcomer@example.com', solves: 1 },
  { handle: 'lurker', email: 'lurker@example.com', solves: 0 },
];

async function main() {
  const pool = getPool();

  const problems = await pool.query(
    `SELECT id FROM problems WHERE is_published ORDER BY tier, difficulty, slug`,
  );

  if (problems.rows.length === 0) {
    console.error('공개된 문제가 없다. 먼저 적재할 것:  pnpm problems:sync');
    process.exitCode = 1;
    return;
  }

  for (const account of ACCOUNTS) {
    const inserted = await pool.query(
      `INSERT INTO users (email, password_hash, handle)
       VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET handle = EXCLUDED.handle
       RETURNING id`,
      [account.email, DEV_PASSWORD_HASH, account.handle],
    );
    const userId = inserted.rows[0].id;

    // 앞쪽 문제부터 푼 것으로 둔다. 난이도 순이라 실제 사용자의 진행과 비슷한 모양이 된다.
    const solved = problems.rows.slice(0, Math.min(account.solves, problems.rows.length));

    await pool.query(`DELETE FROM solved WHERE user_id = $1`, [userId]);
    for (const [index, problem] of solved.entries()) {
      await pool.query(
        `INSERT INTO solved (user_id, problem_id, first_ac_at)
         VALUES ($1,$2, now() - make_interval(hours => $3))
         ON CONFLICT DO NOTHING`,
        [userId, problem.id, solved.length - index],
      );
    }
  }

  const counts = await pool.query(
    `SELECT (SELECT count(*) FROM problems WHERE is_published)::int AS problems,
            (SELECT count(*) FROM concepts)::int AS concepts,
            (SELECT count(*) FROM users)::int AS users,
            (SELECT count(*) FROM solved)::int AS solved`,
  );

  console.log(`시드 완료 — ${JSON.stringify(counts.rows[0])}`);
  console.log('계정 비밀번호는 모두 dev-password 다.');
  await closePool();
}

await main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
