-- 1. Seed demo Instructor
INSERT INTO instructors (instructor_id, name, email)
VALUES ('d2d34482-2043-4312-9918-2fb7b1cc263d', 'Layla', 'laila.khaled.04@gmail.com')
ON CONFLICT (instructor_id) DO NOTHING;

-- 2. Seed demo Course — single-subject prototype scope: cs301 is the only
-- course the AI model integration runs against for now (the one with real
-- uploaded/embedded RAG content — cs201 was the earlier placeholder and has
-- been retired).
INSERT INTO courses (course_id, course_name, instructor_id) VALUES
('cs301', 'Data Structures & Algorithms', 'd2d34482-2043-4312-9918-2fb7b1cc263d')
ON CONFLICT (course_id) DO NOTHING;

-- 3. Seed demo Topics — only the one topic real content has actually been
-- tagged against so far. Add more here as more of the uploaded lecture set
-- gets tagged to topics.
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name, sort_order) VALUES
('top-hash1', 'cs301', 'Hash Tables', 'Hashing & Collision Handling', 1)
ON CONFLICT (topic_id) DO NOTHING;

-- 4. Enable Development RLS Policies (Allow Read & Write from App)
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'instructors', 'courses', 'topics', 'documents', 'chunks', 
        'students', 'enrollments', 'student_profiles', 'diagnostic_questions', 
        'diagnostic_results', 'sessions', 'session_messages', 'student_answers', 
        'answer_citations', 'mastery_checks', 'retry_attempts', 'xp_log'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'dev_allow_all_' || t, t);
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);', 'dev_allow_all_' || t, t);
    END LOOP;
END $$;
