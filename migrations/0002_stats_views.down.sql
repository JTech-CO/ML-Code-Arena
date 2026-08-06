DROP VIEW IF EXISTS user_ranking;
DROP VIEW IF EXISTS problem_stats;
ALTER TABLE submissions DROP COLUMN IF EXISTS judging_at;
