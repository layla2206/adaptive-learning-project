-- Caches the AI-phrased teaching suggestion for a stuck topic on the
-- instructor dashboard, one row per topic (a fresh "Generate insight" click
-- overwrites it). Generation only ever happens from an instructor clicking
-- "Generate insight" / "Refresh insight" -- never automatically on a
-- dashboard load. stat_snapshot records exactly which mistake-tag counts the
-- cached text was generated from, so a later request can detect "nothing
-- changed since last time" and skip a redundant Gemini call instead of
-- burning free-tier quota re-phrasing the same numbers.
CREATE TABLE IF NOT EXISTS instructor_topic_suggestions (
    topic_id VARCHAR(10) PRIMARY KEY,
    suggestion_text TEXT NOT NULL,
    stat_snapshot JSONB NOT NULL,
    generated_by UUID,
    -- TIMESTAMPTZ, not TIMESTAMP -- a bare TIMESTAMP silently drops its UTC
    -- marker on the way out through PostgREST, so `new Date(...)` on the
    -- client parses it as local time instead of UTC (see the same note on
    -- otp_tokens in auth_schema.sql, where this already bit the OTP-expiry
    -- check once).
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE,
    FOREIGN KEY (generated_by) REFERENCES instructors(instructor_id)
);
ALTER TABLE instructor_topic_suggestions ALTER COLUMN generated_at TYPE TIMESTAMPTZ USING generated_at AT TIME ZONE 'UTC';

-- Matches this project's existing dev_allow_all convention (see
-- complete_setup.sql / auth_schema.sql) -- without this, newer Supabase
-- projects enable RLS by default on table creation with no policy at all,
-- which silently rejects every insert/upsert via the anon key.
ALTER TABLE instructor_topic_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_allow_all_instructor_topic_suggestions ON instructor_topic_suggestions;
CREATE POLICY dev_allow_all_instructor_topic_suggestions ON instructor_topic_suggestions FOR ALL USING (true) WITH CHECK (true);
