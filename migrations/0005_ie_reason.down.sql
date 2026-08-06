DROP INDEX IF EXISTS submissions_ie_recent_idx;
ALTER TABLE submissions DROP COLUMN IF EXISTS ie_reason;
