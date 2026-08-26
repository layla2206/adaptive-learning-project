-- 1. Seed demo Instructor
INSERT INTO instructors (instructor_id, name, email) 
VALUES ('inst-1', 'Dr. Elena Marsh', 'elena.marsh@example.edu')
ON CONFLICT (instructor_id) DO NOTHING;

-- 2. Seed demo Course — single-subject prototype scope: cs201 is the only
-- course the AI model integration runs against for now.
INSERT INTO courses (course_id, course_name, instructor_id) VALUES
('cs201', 'Data Structures & Algorithms', 'inst-1')
ON CONFLICT (course_id) DO NOTHING;

-- 3. Seed demo Topics
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name, sort_order) VALUES
('top-cs-1', 'cs201', 'Graph Traversal (BFS/DFS)', 'Breadth & Depth First Search', 1),
('top-cs-2', 'cs201', 'Dynamic Programming', 'Memoization and Tabulation', 2),
('top-cs-3', 'cs201', 'Hashing & Collision Handling', 'Hash Tables & Chaining', 3),
('top-cs-4', 'cs201', 'Tree Balancing', 'AVL & Red-Black Trees', 4)
ON CONFLICT (topic_id) DO NOTHING;

-- 4. Enable Development RLS Policies (Allow Read & Write from App)
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'instructors', 'courses', 'topics', 'documents', 'chunks', 
        'students', 'enrollments', 'student_profiles', 'diagnostic_questions', 
        'diagnostic_results', 'sessions', 'session_messages', 'student_answers', 
        'answer_citations', 'mastery_checks', 'retry_attempts'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'dev_allow_all_' || t, t);
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);', 'dev_allow_all_' || t, t);
    END LOOP;
END $$;
