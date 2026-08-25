-- Creates the one fixed admin account. There's no self-service admin
-- signup (matches the "no invite tokens, admin accounts aren't
-- self-registered" pattern used for instructors) — this is the only way
-- an admin user gets created.
--
-- Login: admin@tutor.local / BabO0nRICR8
-- Change the password after first login by generating a new bcrypt hash
-- (12 rounds) and re-running this as an UPDATE instead of INSERT.

INSERT INTO users (email, password_hash, role, is_verified)
VALUES (
    'admin@tutor.local',
    '$2b$12$MGqDjb3t5EDTc3R/0axjB.D2IeHg86h1HJqEnukLx6WAaCSGQRJqm',
    'admin',
    true
)
ON CONFLICT (email) DO NOTHING;
