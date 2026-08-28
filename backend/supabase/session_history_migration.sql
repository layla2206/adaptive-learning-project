-- Adds structured metadata (tag, citations, diagram) to session_messages so a
-- reloaded page can rebuild the tutor's chat bubbles exactly as they were
-- shown, not just plain text. Additive and backward-compatible: existing rows
-- get NULL metadata and just render as untagged bubbles when resumed.
ALTER TABLE session_messages ADD COLUMN IF NOT EXISTS metadata JSONB;