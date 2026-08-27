import os
import math
import logging
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client, Client
from citations import map_chunk

# Needed in case this file is run standalone (not via main.py, which already
# calls load_dotenv). This repo keeps real config in .env, not .env.local.
load_dotenv(dotenv_path="../.env")

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

# Must match backend/main.py's generate_embeddings/embed_query — same model,
# same output width as the chunks.embedding vector(768) column, and the same
# manual L2 normalization gemini-embedding-001 requires for non-3072 output.
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


def _normalize(vector: List[float]) -> List[float]:
    norm = math.sqrt(sum(x * x for x in vector))
    if norm == 0:
        return vector
    return [x / norm for x in vector]


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
        # 1. Convert the student's query into a vector. RETRIEVAL_QUERY (not
        # SEMANTIC_SIMILARITY) is required here — gemini-embedding-001 is an
        # asymmetric model, and chunks were embedded with RETRIEVAL_DOCUMENT
        # (see generate_embeddings in main.py). Mismatched task_types degrade
        # retrieval quality even though both would technically run.
        embed_response = gemini_client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=query,
            config=types.EmbedContentConfig(
                output_dimensionality=EMBEDDING_DIMENSIONS,
                task_type="RETRIEVAL_QUERY",
            ),
        )
        query_vector = _normalize(embed_response.embeddings[0].values)

    except Exception as e:
        logger.error(f"Embedding failed for query (len={len(query)}): {e}")
        return []

    try:
        # 2. Search Supabase for the closest chunks to the vector, via the
        # match_chunks() RPC defined in backend/supabase/rag_retrieval.sql.
        # chunks has no course_id column of its own (only topic_id) — the SQL
        # function joins through documents to scope by course.
        rpc_params = {
            "query_embedding": query_vector,
            "match_count": top_k,
            "match_topic_id": topic_id,
            "match_course_id": course_id,
        }
        res = supabase.rpc("match_chunks", rpc_params).execute()
        return [map_chunk(chunk) for chunk in (res.data or [])]

    except Exception as e:
        logger.error(f"Supabase retrieval RPC failed (topic={topic_id}, course={course_id}): {e}")
        return []