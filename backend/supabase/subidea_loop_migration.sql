-- Restructures the mastery loop from "one explanation + one check for the
-- whole topic" into "one self-contained explain/check/hint/retry mini-loop
-- per sub-idea, sequenced one after another." See main.py's per-sub-idea
-- /mastery/check, /retry/generate, and /topic/progress.

-- mastery_checks/student_answers/retry_attempts now scope per sub-idea, not
-- just per topic -- attempt_number, hint counts, and retry format cycling
-- all reset per sub-idea. Nullable: a topic with no sub-idea list yet (rare
-- -- get_or_generate_subideas runs lazily on first use) falls back to the
-- old topic-wide behavior with subidea_id left null.
ALTER TABLE mastery_checks ADD COLUMN IF NOT EXISTS subidea_id VARCHAR(20) REFERENCES topic_subideas(subidea_id);
ALTER TABLE student_answers ADD COLUMN IF NOT EXISTS subidea_id VARCHAR(20) REFERENCES topic_subideas(subidea_id);
ALTER TABLE retry_attempts ADD COLUMN IF NOT EXISTS subidea_id VARCHAR(20) REFERENCES topic_subideas(subidea_id);

-- Superseded by real per-sub-idea mastery_checks rows -- that grading
-- enrichment only existed as an approximation because the loop wasn't
-- per-sub-idea yet.
DROP TABLE IF EXISTS subidea_scores;

-- Authoritative "where is this student right now" for exact resume -- one
-- row per (student, topic), updated on every real stage transition
-- (explanation shown, check submitted, hint given, retry shown/submitted).
-- Resume reads this directly instead of inferring a stage from the last
-- session_messages tag, which proved fragile (a runaway follow-up answer
-- was once mistaken for a second completed explanation).
CREATE TABLE IF NOT EXISTS topic_progress (
    student_id UUID NOT NULL REFERENCES students(student_id),
    topic_id VARCHAR(10) NOT NULL REFERENCES topics(topic_id),
    subidea_index INT NOT NULL DEFAULT 0,
    stage VARCHAR(20) NOT NULL DEFAULT 'explain', -- 'explain' | 'check' | 'retry' | 'retry_check' | 'done'
    hints_used INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, topic_id)
);
ALTER TABLE topic_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_allow_all_topic_progress ON topic_progress;
CREATE POLICY dev_allow_all_topic_progress ON topic_progress FOR ALL USING (true) WITH CHECK (true);
