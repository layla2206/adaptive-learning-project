-- Seed default Instructor
INSERT INTO instructors (instructor_id, name, email)
VALUES ('d2d34482-2043-4312-9918-2fb7b1cc263d', 'Layla', 'laila.khaled.04@gmail.com')
ON CONFLICT (instructor_id) DO NOTHING;

-- Seed default Course — single-subject prototype scope: cs301 is the only
-- course the AI model integration runs against for now (the one with real
-- uploaded/embedded RAG content — cs201 was the earlier placeholder and has
-- been retired).
INSERT INTO courses (course_id, course_name, instructor_id) VALUES
('cs301', 'Data Structures & Algorithms', 'd2d34482-2043-4312-9918-2fb7b1cc263d')
ON CONFLICT (course_id) DO NOTHING;

-- Seed default Topics for cs301 — only the one topic real content has
-- actually been tagged against so far.
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name, sort_order) VALUES
('top-hash1', 'cs301', 'Hash Tables', 'Hashing & Collision Handling', 1)
ON CONFLICT (topic_id) DO NOTHING;
