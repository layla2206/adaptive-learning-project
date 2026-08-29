-- Real-world kind of uploaded file. Nullable, no CHECK constraint -- matches
-- this project's existing convention for app-validated string fields
-- (mistake_tag, format_used, retry_attempts.result all work this way).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(30);

-- Session discriminator so a peer-buddy chat can never collide with the
-- mastery loop's (student_id, topic_id)-keyed session lookup. Every existing
-- row backfills to 'mastery_loop', so every current call site (which doesn't
-- know this column exists) keeps behaving identically.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_type VARCHAR(20) NOT NULL DEFAULT 'mastery_loop';

-- One row per student+topic+type, upserted on regenerate -- matches the
-- "one cached row, refreshed" pattern instructor_topic_suggestions already
-- uses, and is the quota-safe default (revisiting never re-spends a call).
CREATE TABLE IF NOT EXISTS generated_practice_content (
    student_id UUID NOT NULL REFERENCES students(student_id),
    topic_id VARCHAR(10) NOT NULL REFERENCES topics(topic_id),
    content_type VARCHAR(20) NOT NULL, -- 'practice_assignment' | 'quiz'
    reference_document_id VARCHAR(10) REFERENCES documents(document_id),
    payload JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, topic_id, content_type)
);
ALTER TABLE generated_practice_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_allow_all_generated_practice_content ON generated_practice_content;
CREATE POLICY dev_allow_all_generated_practice_content ON generated_practice_content FOR ALL USING (true) WITH CHECK (true);
