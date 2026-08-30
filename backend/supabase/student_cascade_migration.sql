-- This migration adds ON DELETE CASCADE to all foreign keys referencing the students table.
-- This ensures that when a student account is deleted (e.g. from the Supabase Dashboard),
-- all related records (enrollments, progress, chat sessions, etc.) are automatically cleaned up
-- instead of throwing foreign key constraint errors.

-- 1. enrollments
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_student_id_fkey;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 2. student_profiles
ALTER TABLE public.student_profiles DROP CONSTRAINT IF EXISTS student_profiles_student_id_fkey;
ALTER TABLE public.student_profiles ADD CONSTRAINT student_profiles_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 3. diagnostic_results
ALTER TABLE public.diagnostic_results DROP CONSTRAINT IF EXISTS diagnostic_results_student_id_fkey;
ALTER TABLE public.diagnostic_results ADD CONSTRAINT diagnostic_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 4. sessions
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_student_id_fkey;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 5. student_answers
ALTER TABLE public.student_answers DROP CONSTRAINT IF EXISTS student_answers_student_id_fkey;
ALTER TABLE public.student_answers ADD CONSTRAINT student_answers_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 6. mastery_checks
ALTER TABLE public.mastery_checks DROP CONSTRAINT IF EXISTS mastery_checks_student_id_fkey;
ALTER TABLE public.mastery_checks ADD CONSTRAINT mastery_checks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 7. retry_attempts
ALTER TABLE public.retry_attempts DROP CONSTRAINT IF EXISTS retry_attempts_student_id_fkey;
ALTER TABLE public.retry_attempts ADD CONSTRAINT retry_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 8. xp_log (gamification)
ALTER TABLE public.xp_log DROP CONSTRAINT IF EXISTS xp_log_student_id_fkey;
ALTER TABLE public.xp_log ADD CONSTRAINT xp_log_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 9. generated_practice_content
ALTER TABLE public.generated_practice_content DROP CONSTRAINT IF EXISTS generated_practice_content_student_id_fkey;
ALTER TABLE public.generated_practice_content ADD CONSTRAINT generated_practice_content_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

-- 10. users (from auth_schema.sql)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_student_id_fkey;
ALTER TABLE public.users ADD CONSTRAINT users_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;
