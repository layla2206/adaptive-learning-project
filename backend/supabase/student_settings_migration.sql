-- Item 17 (full profile richness): global per-student settings.
--
-- Deliberately NOT reusing student_profiles.preferred_format -- that column
-- is per-topic (PK is student_id,topic_id) and unread anywhere in main.py.
-- A global "favorite explanation format" setting shouldn't require picking a
-- topic, so it gets its own column on students instead. Named
-- preferred_explanation_format (not preferred_format) to avoid ever being
-- confused with the dead per-topic column.
ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_explanation_format VARCHAR(50);

-- Self-reported prior courses, free text, captured but not consumed
-- elsewhere yet. Stored as a native array so PostgREST/supabase-js hands the
-- frontend a plain JS string array with no delimiter-parsing on either side.
ALTER TABLE students ADD COLUMN IF NOT EXISTS prior_courses TEXT[];

-- answered_at becomes load-bearing for real date math for the first time
-- (weak-area trend now compares this week vs last week) -- fix the same
-- bare-TIMESTAMP-drops-UTC bug already fixed on otp_tokens and on
-- instructor_topic_suggestions.generated_at this session, before anything
-- reads it.
ALTER TABLE student_answers ALTER COLUMN answered_at TYPE TIMESTAMPTZ USING answered_at AT TIME ZONE 'UTC';

-- No RLS changes: students and student_answers are pre-existing Tier-1
-- tables that already carry dev_allow_all policies from initial setup.
-- ALTER TABLE ADD COLUMN doesn't need new policies (only brand-new tables do).