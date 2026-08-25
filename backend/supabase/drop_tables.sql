-- Run this in the Supabase SQL Editor to drop the old Tier 1 tables BEFORE re-running complete_setup.sql

DROP TABLE IF EXISTS retry_attempts CASCADE;
DROP TABLE IF EXISTS mastery_checks CASCADE;
DROP TABLE IF EXISTS answer_citations CASCADE;
DROP TABLE IF EXISTS student_answers CASCADE;
DROP TABLE IF EXISTS session_messages CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS diagnostic_results CASCADE;
DROP TABLE IF EXISTS diagnostic_questions CASCADE;
DROP TABLE IF EXISTS student_profiles CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS chunks CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS instructors CASCADE;
