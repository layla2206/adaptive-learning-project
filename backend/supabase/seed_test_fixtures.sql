-- Dedicated E2E test student for tests/e2e/ -- kept fully separate from real
-- seeded demo data (Amara/Diego in auth_schema.sql) and from any real
-- student created during manual testing, so the automated suite never reads
-- or clobbers someone's actual test data.
--
-- Password hash below is bcrypt("E2eTestPass123!", 12 rounds) -- generated
-- via this project's own bcryptjs dependency to match hashPassword()'s exact
-- convention (src/lib/authPassword.ts). Used only by
-- tests/e2e/helpers/auth.ts's loginViaUI() for the one spec that drives the
-- real login form; every other spec seeds a session directly (same JWT
-- shortcut every ad hoc script this session has used) and never needs this
-- password at all.

INSERT INTO roster (student_id, name, email, course_id) VALUES
('TEST0001', 'E2E Test Student', 'e2e.test.student@example.edu', 'cs301')
ON CONFLICT (student_id, course_id) DO NOTHING;

INSERT INTO students (name, email) VALUES
('E2E Test Student', 'e2e.test.student@example.edu')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (email, password_hash, role, is_verified, student_id)
SELECT 'e2e.test.student@example.edu', '$2b$12$GuMhE2dHVheVtLP.29J6yuLEifD9fCeLC7aIggdR0chIEhTOZ.sLq', 'student', true, student_id
FROM students WHERE email = 'e2e.test.student@example.edu'
ON CONFLICT (email) DO NOTHING;

INSERT INTO enrollments (enrollment_id, student_id, course_id)
SELECT 'e2etest001', student_id, 'cs301'
FROM students WHERE email = 'e2e.test.student@example.edu'
ON CONFLICT (student_id, course_id) DO NOTHING;
