-- Seed default Instructor
INSERT INTO instructors (instructor_id, name, email) 
VALUES ('inst-1', 'Dr. Elena Marsh', 'elena.marsh@example.edu')
ON CONFLICT (instructor_id) DO NOTHING;

-- Seed default Course — single-subject prototype scope: cs201 is the only
-- course the AI model integration runs against for now.
INSERT INTO courses (course_id, course_name, instructor_id) VALUES
('cs201', 'Data Structures & Algorithms', 'inst-1')
ON CONFLICT (course_id) DO NOTHING;

-- Seed default Topics for cs201
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name, sort_order) VALUES
('top-cs-1', 'cs201', 'Graph Traversal (BFS/DFS)', 'Breadth & Depth First Search', 1),
('top-cs-2', 'cs201', 'Dynamic Programming', 'Memoization and Tabulation', 2),
('top-cs-3', 'cs201', 'Hashing & Collision Handling', 'Hash Tables & Chaining', 3),
('top-cs-4', 'cs201', 'Tree Balancing', 'AVL & Red-Black Trees', 4)
ON CONFLICT (topic_id) DO NOTHING;
