-- 콘텐츠 테이블 + SSE 알림 트리거 (docs/TECHNICAL.md §6.1·§7.4).

-- 유형 설명 -----------------------------------------------------------------
CREATE TABLE concepts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       varchar(64) UNIQUE NOT NULL,
  title      text NOT NULL,
  tier       smallint NOT NULL,
  body_md    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT concepts_tier_range CHECK (tier BETWEEN 1 AND 9)
);

-- 개념 ↔ 문제 양방향 링크
CREATE TABLE concept_problem_links (
  concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  problem_id uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  relation   text NOT NULL,
  PRIMARY KEY (concept_id, problem_id),

  CONSTRAINT concept_problem_relation CHECK (relation IN ('prerequisite', 'practice'))
);

-- 태그 ----------------------------------------------------------------------
CREATE TABLE tags (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(32) UNIQUE NOT NULL
);

CREATE TABLE problem_tags (
  problem_id uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, tag_id)
);

-- 익명 한도 계산용 인덱스 ----------------------------------------------------
-- 익명 한도는 **고유 문제 수**다 (docs/TECHNICAL.md §8.2). 카운터 컬럼을 신뢰하지 않고
-- 제출 이력에서 직접 세므로(INV-9), 그 질의가 인덱스를 타야 한다.
CREATE INDEX submissions_anon_problem_idx ON submissions (anon_session_id, problem_id)
  WHERE anon_session_id IS NOT NULL;

-- SSE 알림 ------------------------------------------------------------------
-- 채점 완료를 API 가 알아야 SSE 로 흘려보낼 수 있다. 워커가 직접 발행하지 않고
-- **트리거로 거는 이유**는 두 가지다.
--   1. 결과 쓰기와 같은 트랜잭션이라, 결과가 커밋됐는데 알림이 빠지는 경우가 없다.
--   2. apps/api 와 apps/worker 는 서로를 import 할 수 없다 (INV-3). DB 가 둘의 접점이다.
--
-- 페이로드는 **제출 ID 하나**다. 판정 상세를 실어 보내면 NOTIFY 크기 상한(8000바이트)에
-- 걸릴 수 있고, 무엇보다 알림 경로가 또 하나의 노출 경로가 된다 (INV-5).
-- API 가 ID 로 다시 조회해 노출 가능한 형태로 만든다.
CREATE FUNCTION notify_submission_judged() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'DONE' AND (OLD.status IS DISTINCT FROM 'DONE') THEN
    PERFORM pg_notify('submission_judged', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submissions_judged_notify
  AFTER UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_submission_judged();
