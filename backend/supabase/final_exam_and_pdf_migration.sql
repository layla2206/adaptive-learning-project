-- Extends generated_practice_content for multi-lecture quizzes, final_exam,
-- and PDF output (see feature plan: multi-lecture quizzes / final exam / PDF).
--
-- The cache key changes from (student_id, topic_id, content_type) to
-- (student_id, content_type, topic_ids), where topic_ids is a sorted,
-- comma-joined string of every topic_id the generated content covers --
-- one topic for practice_assignment, several for a multi-lecture quiz, every
-- topic in the course for final_exam. Plain app-validated TEXT field rather
-- than a Postgres array PK, matching this table's own existing convention
-- (see practice_and_quiz_migration.sql's comment on document_type / etc.).

ALTER TABLE generated_practice_content ADD COLUMN IF NOT EXISTS topic_ids TEXT;
UPDATE generated_practice_content SET topic_ids = topic_id WHERE topic_ids IS NULL;
ALTER TABLE generated_practice_content ALTER COLUMN topic_ids SET NOT NULL;

ALTER TABLE generated_practice_content DROP CONSTRAINT IF EXISTS generated_practice_content_pkey;
ALTER TABLE generated_practice_content DROP CONSTRAINT IF EXISTS generated_practice_content_topic_id_fkey;
ALTER TABLE generated_practice_content DROP COLUMN IF EXISTS topic_id;
ALTER TABLE generated_practice_content ADD PRIMARY KEY (student_id, content_type, topic_ids);

-- R2 object keys for the two rendered PDFs (questions-only, answer-key-only)
-- -- nullable so an existing cached row without them yet gets backfilled by
-- /practice/generate on next read, rather than needing a data migration.
ALTER TABLE generated_practice_content ADD COLUMN IF NOT EXISTS questions_pdf_key VARCHAR(255);
ALTER TABLE generated_practice_content ADD COLUMN IF NOT EXISTS answer_key_pdf_key VARCHAR(255);

-- 'exam' is a new document_type value alongside 'practice_assignment'/'quiz'
-- -- documents.document_type is already an unconstrained VARCHAR(30) with no
-- CHECK constraint (see practice_and_quiz_migration.sql), so no DDL needed
-- here; only the app-level allowlists in the frontend change.
