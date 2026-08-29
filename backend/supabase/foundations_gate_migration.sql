-- Adds session/concept scoping to diagnostic_questions so the new
-- per-concept "Foundations Gate" (top-sort1's replacement for the old
-- fallback diagnostic question) can find "the pending question for this
-- concept in this session" server-side, without the client ever holding or
-- echoing back correct_answer. Additive and backward-compatible, same
-- pattern as session_history_migration.sql: existing rows get NULL in both
-- new columns and are unaffected.
ALTER TABLE diagnostic_questions ADD COLUMN IF NOT EXISTS session_id VARCHAR(15) REFERENCES sessions(session_id);
ALTER TABLE diagnostic_questions ADD COLUMN IF NOT EXISTS concept_id VARCHAR(30);
