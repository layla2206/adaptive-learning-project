-- Seed default Instructor
INSERT INTO instructors (instructor_id, name, email) 
VALUES ('inst-1', 'Dr. Elena Marsh', 'elena.marsh@example.edu')
ON CONFLICT (instructor_id) DO NOTHING;

-- Seed default Courses
INSERT INTO courses (course_id, course_name, instructor_id) VALUES
('cs201', 'Data Structures & Algorithms', 'inst-1'),
('math210', 'Calculus II', 'inst-1'),
('math240', 'Linear Algebra', 'inst-1'),
('chem150', 'Organic Chemistry I', 'inst-1')
ON CONFLICT (course_id) DO NOTHING;

-- Seed default Topics for cs201
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name) VALUES
('top-cs-1', 'cs201', 'Graph Traversal (BFS/DFS)', 'Breadth & Depth First Search'),
('top-cs-2', 'cs201', 'Dynamic Programming', 'Memoization and Tabulation'),
('top-cs-3', 'cs201', 'Hashing & Collision Handling', 'Hash Tables & Chaining'),
('top-cs-4', 'cs201', 'Tree Balancing', 'AVL & Red-Black Trees')
ON CONFLICT (topic_id) DO NOTHING;

-- Seed default Topics for math210
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name) VALUES
('top-m2-1', 'math210', 'Series Convergence Tests', 'Ratio & Root Tests'),
('top-m2-2', 'math210', 'Integration by Parts', 'Techniques of Integration'),
('top-m2-3', 'math210', 'Related Rates', 'Derivatives in Real Applications')
ON CONFLICT (topic_id) DO NOTHING;

-- Seed default Topics for math240
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name) VALUES
('top-la-1', 'math240', 'Eigenvalues & Eigenvectors', 'Diagonalization & Transformations'),
('top-la-2', 'math240', 'Vector Spaces', 'Span, Basis, and Dimension')
ON CONFLICT (topic_id) DO NOTHING;

-- Seed default Topics for chem150
INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name) VALUES
('top-ch-1', 'chem150', 'Reaction Mechanisms', 'Electrophilic Addition'),
('top-ch-2', 'chem150', 'Stereochemistry', 'Chirality & Enantiomers')
ON CONFLICT (topic_id) DO NOTHING;
