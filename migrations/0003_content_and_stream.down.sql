DROP TRIGGER IF EXISTS submissions_judged_notify ON submissions;
DROP FUNCTION IF EXISTS notify_submission_judged();
DROP INDEX IF EXISTS submissions_anon_problem_idx;
DROP TABLE IF EXISTS problem_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS concept_problem_links;
DROP TABLE IF EXISTS concepts;
