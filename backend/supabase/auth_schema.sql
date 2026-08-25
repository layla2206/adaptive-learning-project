-- ========================================================================
-- AUTH SCHEMA — run this in the Supabase SQL editor after tier1_schema.sql
-- (or complete_setup.sql). Adds auth on top of the existing students /
-- instructors / enrollments tables — it does not replace them.
-- ========================================================================

-- 1. users — the auth table. One row per login-capable account, optionally
--    linked to the existing domain tables (students / instructors).
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
    is_verified BOOLEAN NOT NULL DEFAULT true,
    student_id UUID REFERENCES students(student_id),
    instructor_id UUID REFERENCES instructors(instructor_id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. roster — pre-approved student list, keyed by the school-issued ID
--    students type in at sign-up. NOTE: roster.student_id is that human
--    -readable ID string (e.g. "S10293") — it is NOT the same as the UUID
--    students.student_id used everywhere else in the schema. One row per
--    (student, course) pair so a student can appear against several courses.
CREATE TABLE IF NOT EXISTS roster (
    roster_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    course_id VARCHAR(10) NOT NULL REFERENCES courses(course_id),
    UNIQUE (student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_roster_student_id ON roster(student_id);

-- 3. otp_tokens — sign-up OTP codes, scoped to a roster student_id.
-- NOTE: expires_at/created_at are TIMESTAMPTZ, not TIMESTAMP. A bare
-- TIMESTAMP column silently drops its UTC marker on the way out through
-- PostgREST, so a JS `new Date(...)` on the client parses it as local time
-- instead of UTC — on a UTC+3 machine that makes every fresh OTP look
-- already expired. TIMESTAMPTZ round-trips correctly.
CREATE TABLE IF NOT EXISTS otp_tokens (
    otp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_tokens_student_id ON otp_tokens(student_id);

-- 4. email_verifications — first-sign-in verification for admin-created
--    instructor accounts. Same TIMESTAMPTZ note as otp_tokens above.
CREATE TABLE IF NOT EXISTS email_verifications (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================================================================
-- RLS — matches the dev_allow_all pattern used in complete_setup.sql.
-- WIDE OPEN: fine for this dev/demo Supabase project since all writes go
-- through Next.js API routes using the anon key. Before any real deploy,
-- replace these with real policies (or move privileged writes to a
-- service-role key) — the anon key currently has full read/write here.
-- ========================================================================
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['users', 'roster', 'otp_tokens', 'email_verifications'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'dev_allow_all_' || t, t);
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);', 'dev_allow_all_' || t, t);
    END LOOP;
END $$;

-- ========================================================================
-- SEED — a few roster rows so the sign-up flow is testable end to end.
-- ========================================================================
INSERT INTO roster (student_id, name, email, course_id) VALUES
('S10293', 'Amara Osei', 'amara.osei@example.edu', 'cs201'),
('S10293', 'Amara Osei', 'amara.osei@example.edu', 'math210'),
('S20481', 'Diego Fuentes', 'diego.fuentes@example.edu', 'cs201')
ON CONFLICT (student_id, course_id) DO NOTHING;
