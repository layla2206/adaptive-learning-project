-- ========================================================================
-- RAG retrieval: cosine-similarity chunk search over the pgvector column
-- already declared on chunks.embedding (vector(768), complete_setup.sql).
-- Run this once in the Supabase SQL editor — there's no migration runner in
-- this project, same as every other file in backend/supabase/.
-- ========================================================================

-- chunks has no course_id of its own (only topic_id, which can be null for
-- untagged uploads), so course scoping has to join through documents.
DROP FUNCTION IF EXISTS match_chunks(vector(768), varchar(10), varchar(10), int);

CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(768),
    match_course_id varchar(10) DEFAULT NULL,
    match_topic_id varchar(10) DEFAULT NULL,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    chunk_id varchar(15),
    document_id varchar(10),
    chunk_text text,
    page_number int,
    document_title varchar(255),
    location int,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.chunk_id,
        c.document_id,
        c.chunk_text,
        c.page_number,
        d.file_name AS document_title,
        c.page_number AS location,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM chunks c
    JOIN documents d ON d.document_id = c.document_id
    WHERE (match_course_id IS NULL OR d.course_id = match_course_id)
      AND (match_topic_id IS NULL OR c.topic_id = match_topic_id)
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count;
$$;

-- Same dev_allow_all posture as the rest of this schema — the anon key (used
-- by both the Next.js proxy and the FastAPI backend) needs EXECUTE to call
-- this via supabase.rpc(...).
GRANT EXECUTE ON FUNCTION match_chunks(vector(768), varchar(10), varchar(10), int) TO anon, authenticated;