-- ========================================================================
-- Adds real backing for student progress (streak/XP/mastery), course
-- descriptive metadata, and lecture tagging — replacing what used to be
-- hardcoded frontend mock data. Safe to re-run (IF NOT EXISTS throughout).
-- Run after tier1_schema.sql/complete_setup.sql and auth_schema.sql.
-- ========================================================================

-- 1. topics.sort_order — deterministic lecture ordering. The milestone path
--    and "first topic unlocked by default" rule both depend on this instead
--    of an incidental id/insertion order.
ALTER TABLE topics ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

UPDATE topics SET sort_order = 1 WHERE topic_id = 'top-cs-1' AND sort_order = 0;
UPDATE topics SET sort_order = 2 WHERE topic_id = 'top-cs-2' AND sort_order = 0;
UPDATE topics SET sort_order = 3 WHERE topic_id = 'top-cs-3' AND sort_order = 0;
UPDATE topics SET sort_order = 4 WHERE topic_id = 'top-cs-4' AND sort_order = 0;

-- 2. courses.summary / courses.building — descriptive/presentational
--    metadata about a course (blurb + milestone-palace theme). Not a stat,
--    just content that used to live in a frontend mock array.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS building VARCHAR(20) NOT NULL DEFAULT 'citadel';

UPDATE courses
SET summary = 'From arrays to graphs — build the intuition, not just the syntax.'
WHERE course_id = 'cs201' AND summary IS NULL;

-- 3. documents.lecture_number — the lecture an uploaded file is tagged
--    against, set by the instructor after upload. Previously only ever
--    lived in page-local React state (lost on refresh).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS lecture_number INT;

-- 4. xp_log — append-only ledger of XP awards. Total XP, the weekly
--    calendar, and the current streak are all derived from this at query
--    time rather than stored as separately-maintained counters.
CREATE TABLE IF NOT EXISTS xp_log (
    xp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(student_id),
    topic_id VARCHAR(10) REFERENCES topics(topic_id),
    amount INT NOT NULL,
    reason VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_log_student_id ON xp_log(student_id);

-- ========================================================================
-- RLS — same dev_allow_all pattern as the rest of the project (anon key,
-- all writes go through Next.js API routes).
-- ========================================================================
ALTER TABLE xp_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_allow_all_xp_log ON xp_log;
CREATE POLICY dev_allow_all_xp_log ON xp_log FOR ALL USING (true) WITH CHECK (true);
