import os
import logging
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv
from google import genai
from supabase import create_client, Client

# Needed in case this file is run standalone (not via main.py, which already
# calls load_dotenv)
load_dotenv(dotenv_path="../.env.local")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("retrieve")

supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
gemini_api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("Missing Supabase credentials in environment.")
if not gemini_api_key:
    raise ValueError("Missing Gemini API key in environment.")

supabase: Client = create_client(supabase_url, supabase_key)
gemini_client = genai.Client(api_key=gemini_api_key)


async def retrieve_context(
    query: str,
    topic_id: Optional[str] = None,
    course_id: Optional[str] = None,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Takes the student's free-response answer, converts it into a vector,
    and retrieves the closest matching chunks from the course content
    stored in Supabase.

    - If topic_id/course_id are omitted, filtering is skipped (the SQL
      function must treat NULL as "no filter", not as plain equality).
    """
    if not query or not query.strip():
        return []

    try:
        # 1. Convert the student's answer into a vector
        # SEMANTIC_SIMILARITY is used because we're comparing an answer
        # against reference content, not doing a plain text search
        embed_response = gemini_client.models.embed_content(
            model="text-embedding-004",
            contents=query,
            config={"task_type": "SEMANTIC_SIMILARITY"},
        )
        query_vector = embed_response.embeddings[0].values

    except Exception as e:
        logger.error(f"Embedding failed for query (len={len(query)}): {e}")
        return []

    try:
        # 2. Search Supabase for the closest chunks to the vector
        rpc_params = {
            "query_embedding": query_vector,
            "match_count": top_k,
            "filter_topic_id": topic_id,
            "filter_course_id": course_id,
        }
        res = supabase.rpc("match_chunks", rpc_params).execute()
        return res.data or []

    except Exception as e:
        logger.error(f"Supabase retrieval RPC failed (topic={topic_id}, course={course_id}): {e}")
        return []
    
    
    
    
    
"""-- CREATE OR REPLACE FUNCTION match_chunks (
--   query_embedding vector(768),
--   match_count int DEFAULT 5,
--   filter_topic_id text DEFAULT NULL,
--   filter_course_id text DEFAULT NULL
-- )
-- RETURNS TABLE (
--   chunk_id text,
--   document_id text,
--   topic_id text,
--   course_id text,
--   chunk_text text,
--   similarity float
-- )
-- LANGUAGE plpgsql
-- AS $$
-- BEGIN
--   RETURN QUERY
--   SELECT
--     chunks.chunk_id,
--     chunks.document_id,
--     chunks.topic_id,
--     chunks.course_id,
--     chunks.chunk_text,
--     1 - (chunks.embedding <=> query_embedding) AS similarity
--   FROM chunks
--   WHERE (filter_topic_id IS NULL OR chunks.topic_id = filter_topic_id)
--     AND (filter_course_id IS NULL OR chunks.course_id = filter_course_id)
--   ORDER BY chunks.embedding <=> query_embedding
--   LIMIT match_count;
-- END;
-- $$;"""