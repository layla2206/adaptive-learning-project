-- Run this once against the auth_schema.sql tables you already created.
-- They were created with plain TIMESTAMP columns, which drop their UTC
-- marker on the way out through PostgREST — a JS `new Date(...)` on the
-- client then parses the value as local time instead of UTC. On a UTC+3
-- machine that makes every fresh OTP/verification token look already
-- expired (confirmed while testing student sign-up: a 66-second-old OTP
-- read back as expired).
--
-- The existing values were always intended as UTC (that's what the app
-- sent), so reinterpreting them AT TIME ZONE 'UTC' recovers the correct
-- instant without shifting any data.

ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE otp_tokens ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE otp_tokens ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE email_verifications ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE email_verifications ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
