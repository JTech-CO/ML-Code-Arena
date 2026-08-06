-- 집계 규칙을 뷰로 고정한다.
--
-- `IE` 는 채점 인프라 장애이지 사용자 책임이 아니므로 정답률·랭킹에서 제외된다
-- (docs/TECHNICAL.md §4.3). 이 규칙을 각 호출부가 WHERE 절로 반복하면 언젠가 한 곳이
-- 빠지고, 빠진 곳은 아무도 모른다. 뷰에 한 번 적으면 빠질 자리가 없다.

-- 큐 대기 시간 측정을 위한 전이 시각.
-- §6.1 은 created_at·judged_at 만 두었으나, 그 둘로는 "접수 → 채점 시작" 지연을
-- 측정할 수 없다. 운영 지표(§13.2 대기 시간 P95)에도 필요하다.
ALTER TABLE submissions ADD COLUMN judging_at timestamptz;

-- 문제별 정답률 ------------------------------------------------------------
CREATE VIEW problem_stats AS
SELECT
  p.id   AS problem_id,
  p.slug AS slug,
  count(s.id) FILTER (WHERE s.verdict IS NOT NULL AND s.verdict <> 'IE') AS judged_count,
  count(s.id) FILTER (WHERE s.verdict = 'AC')                            AS accepted_count,
  count(s.id) FILTER (WHERE s.verdict = 'IE')                            AS excluded_count,
  round(
    100.0 * count(s.id) FILTER (WHERE s.verdict = 'AC')
    / NULLIF(count(s.id) FILTER (WHERE s.verdict IS NOT NULL AND s.verdict <> 'IE'), 0),
    1
  ) AS acceptance_rate
FROM problems p
LEFT JOIN submissions s ON s.problem_id = p.id
GROUP BY p.id, p.slug;

COMMENT ON VIEW problem_stats IS
  'IE 는 분자·분모 어디에도 들어가지 않는다. excluded_count 는 그 사실을 눈으로 확인하기 위한 것이다.';

-- 사용자 랭킹 --------------------------------------------------------------
-- solved 는 최초 AC 에만 삽입되므로 IE 는 구조적으로 들어올 수 없다.
CREATE VIEW user_ranking AS
SELECT
  u.id     AS user_id,
  u.handle AS handle,
  count(sv.problem_id) AS solved_count,
  max(sv.first_ac_at)  AS last_solved_at
FROM users u
LEFT JOIN solved sv ON sv.user_id = u.id
GROUP BY u.id, u.handle;
