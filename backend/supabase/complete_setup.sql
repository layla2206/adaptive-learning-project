-- ========================================================================
-- COMPLETE TIER 1 SCHEMA + SEED DATA + RLS POLICIES FOR SUPABASE
-- ========================================================================

-- Enable vector extension for embeddings (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. instructors
CREATE TABLE IF NOT EXISTS instructors (
    instructor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. courses
CREATE TABLE IF NOT EXISTS courses (
    course_id VARCHAR(10) PRIMARY KEY,
    course_name VARCHAR(100) NOT NULL,
    instructor_id UUID NOT NULL,
    summary TEXT,
    building VARCHAR(20) NOT NULL DEFAULT 'citadel',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    FOREIGN KEY (instructor_id) REFERENCES instructors(instructor_id)
);

-- 3. topics
CREATE TABLE IF NOT EXISTS topics (
    topic_id VARCHAR(10) PRIMARY KEY,
    course_id VARCHAR(10) NOT NULL,
    topic_name VARCHAR(100) NOT NULL,
    subtopic_name VARCHAR(100),
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (course_id) REFERENCES courses(course_id)
);

-- 4. documents
CREATE TABLE IF NOT EXISTS documents (
    document_id VARCHAR(10) PRIMARY KEY,
    instructor_id UUID NOT NULL,
    course_id VARCHAR(10) NOT NULL,
    topic_id VARCHAR(10),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(20),
    lecture_number INT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instructor_id) REFERENCES instructors(instructor_id),
    FOREIGN KEY (course_id) REFERENCES courses(course_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

-- 5. chunks (RAG CHUNKS for retrieval + citations)
CREATE TABLE IF NOT EXISTS chunks (
    chunk_id VARCHAR(15) PRIMARY KEY,
    document_id VARCHAR(10) NOT NULL,
    topic_id VARCHAR(10),
    page_number INT,
    chunk_text TEXT NOT NULL,
    embedding vector(768),
    FOREIGN KEY (document_id) REFERENCES documents(document_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

-- 6. students
CREATE TABLE IF NOT EXISTS students (
    student_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. enrollments (student <-> course)
CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_id VARCHAR(10) PRIMARY KEY,
    student_id UUID NOT NULL,
    course_id VARCHAR(10) NOT NULL,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (course_id) REFERENCES courses(course_id),
    UNIQUE (student_id, course_id)
);

-- 8. student_profiles (per topic)
CREATE TABLE IF NOT EXISTS student_profiles (
    student_id UUID NOT NULL,
    topic_id VARCHAR(10) NOT NULL,
    level VARCHAR(20), -- Beginner / Intermediate / Advanced
    mastery_percent DECIMAL(5,2) DEFAULT 0,
    weak_area VARCHAR(100),
    preferred_format VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, topic_id),
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

-- 9. diagnostic_questions
CREATE TABLE IF NOT EXISTS diagnostic_questions (
    question_id VARCHAR(10) PRIMARY KEY,
    topic_id VARCHAR(10) NOT NULL,
    question_text TEXT NOT NULL,
    difficulty VARCHAR(20), -- Easy / Medium / Hard
    correct_answer TEXT NOT NULL,
    question_type VARCHAR(20) DEFAULT 'MCQ',
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

-- 10. diagnostic_results
CREATE TABLE IF NOT EXISTS diagnostic_results (
    result_id VARCHAR(15) PRIMARY KEY,
    student_id UUID NOT NULL,
    question_id VARCHAR(10) NOT NULL,
    student_answer TEXT,
    is_correct BOOLEAN,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (question_id) REFERENCES diagnostic_questions(question_id)
);

-- 11. sessions (conversation memory)
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(15) PRIMARY KEY,
    student_id UUID NOT NULL,
    topic_id VARCHAR(10),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

-- 12. session_messages
CREATE TABLE IF NOT EXISTS session_messages (
    message_id VARCHAR(20) PRIMARY KEY,
    session_id VARCHAR(15) NOT NULL,
    sender VARCHAR(10) NOT NULL, -- 'student' or 'ai'
    message_text TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- 13. student_answers (mastery-check attempts)
CREATE TABLE IF NOT EXISTS student_answers (
    answer_id VARCHAR(15) PRIMARY KEY,
    student_id UUID NOT NULL,
    topic_id VARCHAR(10) NOT NULL,
    session_id VARCHAR(15),
    question_text TEXT,
    student_answer TEXT,
    score DECIMAL(5,2),
    mistake_tag VARCHAR(50), -- e.g. concept_confusion, calculation_error
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- 14. answer_citations (link AI answers -> RAG chunks used)
CREATE TABLE IF NOT EXISTS answer_citations (
    citation_id VARCHAR(15) PRIMARY KEY,
    answer_id VARCHAR(15) NOT NULL,
    chunk_id VARCHAR(15) NOT NULL,
    FOREIGN KEY (answer_id) REFERENCES student_answers(answer_id),
    FOREIGN KEY (chunk_id) REFERENCES chunks(chunk_id)
);

-- 15. mastery_checks
CREATE TABLE IF NOT EXISTS mastery_checks (
    mastery_id VARCHAR(15) PRIMARY KEY,
    student_id UUID NOT NULL,
    topic_id VARCHAR(10) NOT NULL,
    attempt_number INT NOT NULL,
    explain_score DECIMAL(5,2),
    solve_score DECIMAL(5,2),
    overall_mastery DECIMAL(5,2),
    passed BOOLEAN,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

-- 16. retry_attempts (RE-EXPLAIN ATTEMPTS)
CREATE TABLE IF NOT EXISTS retry_attempts (
    retry_id VARCHAR(15) PRIMARY KEY,
    student_id UUID NOT NULL,
    topic_id VARCHAR(10) NOT NULL,
    attempt_number INT NOT NULL,
    format_used VARCHAR(50) NOT NULL,
    result VARCHAR(20),
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

-- 17. xp_log (append-only XP ledger — total XP, streak, and the weekly
-- calendar are all derived from this at query time)
CREATE TABLE IF NOT EXISTS xp_log (
    xp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    topic_id VARCHAR(10),
    amount INT NOT NULL,
    reason VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

-- ========================================================================
-- SEED DATA
-- ========================================================================

-- Demo Instructor (Using specific UUID so foreign keys work reliably) —
-- Layla, whose real uploaded/embedded content this course actually has.
INSERT INTO instructors (instructor_id, name, email)
VALUES ('d2d34482-2043-4312-9918-2fb7b1cc263d', 'Layla', 'laila.khaled.04@gmail.com')
ON CONFLICT (instructor_id) DO NOTHING;

-- Demo Course — single-subject prototype scope: cs301 is the only course
-- the AI model integration runs against (cs201 was the earlier placeholder
-- and has been retired).
INSERT INTO courses (course_id, course_name, instructor_id) VALUES
('cs301', 'Data Structures & Algorithms', 'd2d34482-2043-4312-9918-2fb7b1cc263d')
ON CONFLICT (course_id) DO NOTHING;

-- Demo Topics — only the one topic real content has actually been tagged
-- against so far.
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name, sort_order) VALUES
('top-hash1', 'cs301', 'Hash Tables', 'Hashing & Collision Handling', 1)
ON CONFLICT (topic_id) DO NOTHING;

-- ========================================================================
-- RLS POLICIES (Development Access)
-- ========================================================================
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
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'dev_allow_all_' || t, t);
            EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);', 'dev_allow_all_' || t, t);
        END IF;
    END LOOP;
END $$;
