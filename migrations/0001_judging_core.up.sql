-- 채점 파이프라인이 결과를 기록하는 데 필요한 스키마.
-- docs/TECHNICAL.md §6.1 을 그대로 옮긴 것이다. 손으로 바꾸지 않는다 — 백서를 먼저 고친다.
--
-- 이 마이그레이션이 다루지 않는 것: concepts · tags · testcases.
-- 콘텐츠 계열이라 M3·M6 에서 추가한다.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 사용자 -----------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  password_hash text NOT NULL,                    -- argon2id (M3)
  handle        varchar(20) UNIQUE NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);

-- 익명 세션 ---------------------------------------------------------------
-- 원본 IP 를 저장하지 않는다. 익명 사용자 식별에는 해시로 충분하고
-- 개인정보 보관 위험을 줄인다 (docs/TECHNICAL.md §6.3).
CREATE TABLE anon_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash        bytea NOT NULL,                  -- HMAC-SHA256
  ua_hash        bytea NOT NULL,
  solved_count   int NOT NULL DEFAULT 0,          -- 고유 문제 기준 (INV-9)
  merged_user_id uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 문제 --------------------------------------------------------------------
CREATE TABLE problems (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              varchar(64) UNIQUE NOT NULL,
  title             text NOT NULL,
  tier              smallint NOT NULL,
  difficulty        smallint NOT NULL,
  judge_mode        text NOT NULL DEFAULT 'tolerance',
  allowed_languages text[] NOT NULL DEFAULT ARRAY['python'],
  entrypoint        varchar(40) NOT NULL,
  time_limit_ms     int NOT NULL DEFAULT 10000,
  memory_limit_mb   int NOT NULL DEFAULT 512,
  restrictions      jsonb NOT NULL,               -- ADR-0002: 필수다
  compare_options   jsonb NOT NULL DEFAULT '{}'::jsonb,
  statement_md      text NOT NULL DEFAULT '',
  is_published      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT problems_tier_range CHECK (tier BETWEEN 1 AND 9),
  CONSTRAINT problems_difficulty_range CHECK (difficulty BETWEEN 1 AND 5)
);

-- 제출 --------------------------------------------------------------------
CREATE TABLE submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id      uuid NOT NULL REFERENCES problems(id),
  user_id         uuid REFERENCES users(id),
  anon_session_id uuid REFERENCES anon_sessions(id),
  language        text NOT NULL,
  source          text NOT NULL,
  status          text NOT NULL DEFAULT 'PENDING',
  verdict         text,
  runtime_ms      int,
  memory_mb       int,
  failed_case_seq int,
  detail          jsonb,
  attempts        int NOT NULL DEFAULT 0,         -- IE 자동 재시도 횟수
  created_at      timestamptz NOT NULL DEFAULT now(),
  judged_at       timestamptz,

  -- 로그인 사용자이거나 익명 세션이거나, 정확히 하나다.
  CONSTRAINT submissions_owner CHECK (num_nonnulls(user_id, anon_session_id) = 1),
  CONSTRAINT submissions_status CHECK (status IN ('PENDING', 'JUDGING', 'DONE')),
  CONSTRAINT submissions_verdict CHECK (
    verdict IS NULL OR verdict IN ('AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'FBD', 'IE')
  ),
  -- DONE 이면 판정이 있어야 한다. 판정 없는 DONE 은 워커가 결과를 못 쓴 것이고,
  -- 그 상태가 남으면 사용자에게 영원히 "채점 중"으로 보인다.
  CONSTRAINT submissions_done_has_verdict CHECK (status <> 'DONE' OR verdict IS NOT NULL)
);

-- 해결 기록 (랭킹 집계용 비정규화) ------------------------------------------
-- 랭킹 페이지가 매 요청마다 전체 제출을 집계하는 비용을 피한다 (docs/TECHNICAL.md §6.3).
CREATE TABLE solved (
  user_id     uuid NOT NULL REFERENCES users(id),
  problem_id  uuid NOT NULL REFERENCES problems(id),
  first_ac_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, problem_id)
);

-- 인덱스 (docs/TECHNICAL.md §6.2) -------------------------------------------
CREATE INDEX submissions_problem_created_idx ON submissions (problem_id, created_at DESC);
CREATE INDEX submissions_user_created_idx ON submissions (user_id, created_at DESC);
CREATE INDEX submissions_pending_idx ON submissions (status) WHERE status <> 'DONE';
CREATE INDEX problems_tier_difficulty_idx ON problems (tier, difficulty) WHERE is_published;
