-- Per-topic sub-idea breakdown (e.g. Stacks -> array-based implementation,
-- isFull/isEmpty checks, push/pop) so instructor insights can show which
-- specific idea inside a topic students are stuck on, not just overall
-- topic mastery. Prototype-stage: generated automatically (lazily, one
-- Gemini call) the first time a topic is actually needed -- no instructor
-- review/publish step. See main.py's get_or_generate_subideas().
CREATE TABLE IF NOT EXISTS topic_subideas (
    subidea_id VARCHAR(20) PRIMARY KEY,
    topic_id VARCHAR(10) NOT NULL REFERENCES topics(topic_id) ON DELETE CASCADE,
    idea_index INT NOT NULL,
    label VARCHAR(150) NOT NULL,
    description TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id, idea_index)
);
ALTER TABLE topic_subideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_allow_all_topic_subideas ON topic_subideas;
CREATE POLICY dev_allow_all_topic_subideas ON topic_subideas FOR ALL USING (true) WITH CHECK (true);

-- Per-sub-idea understanding score (0-100), derived from the SAME Gemini
-- call that grades a student's "explain in your own words" mastery-check
-- submission -- no extra Gemini cost, no separate quiz step. One row per
-- (student, topic, sub-idea, mastery-check attempt). Deliberately separate
-- from mastery_checks/student_answers: this is supplementary instructor-
-- facing instrumentation, not part of the pass/fail mastery gate those
-- tables drive.
CREATE TABLE IF NOT EXISTS subidea_scores (
    score_id VARCHAR(20) PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES students(student_id),
    topic_id VARCHAR(10) NOT NULL REFERENCES topics(topic_id),
    subidea_id VARCHAR(20) NOT NULL REFERENCES topic_subideas(subidea_id),
    mastery_id VARCHAR(15) REFERENCES mastery_checks(mastery_id),
    score DECIMAL(5,2) NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE subidea_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_allow_all_subidea_scores ON subidea_scores;
CREATE POLICY dev_allow_all_subidea_scores ON subidea_scores FOR ALL USING (true) WITH CHECK (true);
