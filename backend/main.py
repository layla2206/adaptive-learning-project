import os
import re
import uuid
import time
import math
import threading
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import boto3
from supabase import create_client, Client
import PyPDF2
import httpx
from google import genai
from google.genai import types
from google.genai.errors import ClientError, ServerError
from answer_generation import generate_answer, generate_structured_explanation, AnswerGenerationError, NO_CONTEXT_ANSWER
from citations import map_chunk, map_citations
from retrieval import retrieve_context
from pdf_generation import render_questions_pdf, render_answer_key_pdf

# Load .env from the parent directory — this repo keeps real config in
# .env (not .env.local, which doesn't exist here), so point dotenv at that.
load_dotenv(dotenv_path="../.env")

app = FastAPI(title="Adaptive Learning Backend API")

# The Next.js API routes proxy to this backend server-to-server (see e.g.
# src/app/api/query/route.ts's FASTAPI_URL fetch), which isn't subject to
# CORS at all -- browsers only enforce it on requests they issue themselves.
# This middleware only matters if something ever calls this API directly
# from a browser (a future admin tool, local testing against a deployed
# backend, etc). ALLOWED_ORIGINS is a comma-separated list -- unset locally
# defaults to the Next.js dev server; set it on Render once the Vercel
# domain is known so this never needs another code change.
allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,https://adaptive-learning-project.onrender.com").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def health_check():
    """Minimal liveness probe for Render's health check -- confirms the
    process is up and answering, not that any downstream dependency
    (Supabase, Gemini, R2) is reachable."""
    return {"status": "ok"}

# Initialize Supabase
supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
if not supabase_url or not supabase_key:
    raise ValueError("Missing Supabase credentials in environment.")
supabase: Client = create_client(supabase_url, supabase_key)

# Initialize Cloudflare R2 via boto3
r2_account_id = os.environ.get("CLOUDFLARE_R2_ACCOUNT_ID")
r2_access_key = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID")
r2_secret_key = os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
r2_bucket_name = os.environ.get("CLOUDFLARE_R2_BUCKET_NAME", "adaptive-learning-files")
r2_endpoint = os.environ.get("CLOUDFLARE_R2_ENDPOINT", f"https://{r2_account_id}.r2.cloudflarestorage.com")

s3_client = boto3.client(
    "s3",
    endpoint_url=r2_endpoint,
    aws_access_key_id=r2_access_key,
    aws_secret_access_key=r2_secret_key,
    region_name="auto",
)

# Initialize Gemini
gemini_api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if not gemini_api_key:
    raise ValueError("Missing Gemini API Key in environment.")
gemini_client = genai.Client(api_key=gemini_api_key)

# Test-only seam: when MOCK_GEMINI=1, every generate_content call below is
# intercepted here and answered from a canned fixture instead of the real
# API -- this project has exhausted its shared free-tier quota multiple
# times already, so the E2E suite (tests/e2e/) must never call the real
# Gemini API. Off by default; normal dev/deploy behavior is unchanged.
#
# Most call sites read response.text through parse_gemini_json() (below);
# generate_answer() in answer_generation.py reads response.text directly as
# plain prose instead (no JSON). Either way one object with a .text
# attribute is enough, matched by a marker substring unique to each
# endpoint's own prompt. Add one more (marker, fixture) pair here for each
# new golden-path test that needs a real Gemini call mocked -- no other code
# needs to change.
#
# NOTE: "explain_score" is NOT a usable marker on its own -- that JSON key
# is in /mastery/check's schema instruction on every call regardless of
# which field was actually submitted. The real signal is which submission
# label appears in the prompt's "Student submissions:" section.
MOCK_GEMINI = os.environ.get("MOCK_GEMINI") == "1"

_MOCK_GEMINI_FIXTURES = [
    # /foundations/generate's schema ALSO contains "correct_answer" (each of
    # its 4 questions has that field, same as the diagnostic schema below) --
    # matching is first-hit-wins over this whole list, so its marker must be
    # checked before the generic '"correct_answer"' entry or it silently gets
    # the diagnostic fixture's 2-item array instead of the 4 items
    # /foundations/generate hard-requires (len(questions_data) != 4 -> 502).
    # Same reasoning for quiz-mode /practice/generate just below it.
    ("in this exact order:", '[{"question_text": "Mock foundations Q1?", "options": ["A", "B", "C", "D"], "correct_answer": "A"}, {"question_text": "Mock foundations Q2?", "options": ["A", "B", "C", "D"], "correct_answer": "B"}, {"question_text": "Mock foundations Q3?", "options": ["A", "B", "C", "D"], "correct_answer": "C"}, {"question_text": "Mock foundations Q4?", "options": ["A", "B", "C", "D"], "correct_answer": "D"}]'),
    ("Write multiple-choice questions.", '[{"question_text": "Mock quiz Q1?", "options": ["A", "B", "C", "D"], "correct_answer": "A", "difficulty": "Medium"}, {"question_text": "Mock quiz Q2?", "options": ["A", "B", "C", "D"], "correct_answer": "B", "difficulty": "Medium"}, {"question_text": "Mock quiz Q3?", "options": ["A", "B", "C", "D"], "correct_answer": "C", "difficulty": "Medium"}, {"question_text": "Mock quiz Q4?", "options": ["A", "B", "C", "D"], "correct_answer": "D", "difficulty": "Medium"}, {"question_text": "Mock quiz Q5?", "options": ["A", "B", "C", "D"], "correct_answer": "A", "difficulty": "Medium"}]'),
    # final_exam's schema_instructions text diverges from quiz's right after
    # "Write multiple-choice questions" (quiz ends the sentence there; this
    # one continues "...for a comprehensive final exam covering..."), so it
    # needs its own marker rather than falling through to quiz's or the
    # generic '"correct_answer"' diagnostic fixture below.
    ("comprehensive final exam", '[{"question_text": "Mock final exam Q1?", "options": ["A", "B", "C", "D"], "correct_answer": "A", "difficulty": "Medium"}, {"question_text": "Mock final exam Q2?", "options": ["A", "B", "C", "D"], "correct_answer": "B", "difficulty": "Medium"}, {"question_text": "Mock final exam Q3?", "options": ["A", "B", "C", "D"], "correct_answer": "C", "difficulty": "Medium"}]'),
    ("Break the topic below into its real sub-ideas", '[{"label": "Mock Sub-idea 1", "description": "Covers the first mock mechanism."}, {"label": "Mock Sub-idea 2", "description": "Covers the second mock mechanism."}, {"label": "Mock Sub-idea 3", "description": "Covers the third mock mechanism."}, {"label": "Mock Sub-idea 4", "description": "Covers the fourth mock mechanism."}]'),
    ('"correct_answer"', '[{"question_text": "Mock diagnostic question 1?", "options": ["A", "B", "C", "D"], "correct_answer": "A", "difficulty": "Medium"}, {"question_text": "Mock diagnostic question 2?", "options": ["A", "B", "C", "D"], "correct_answer": "B", "difficulty": "Medium"}]'),
    ("Write open-ended, worked-style problems", '[{"question_text": "Mock practice question 1?", "difficulty": "Medium", "model_answer": "Mock worked solution, step by step."}, {"question_text": "Mock practice question 2?", "difficulty": "Medium", "model_answer": "Mock worked solution, step by step."}]'),
    ('got a basic question about "', '{"explanation": "Mock foundations explanation for testing."}'),
    ("You are playing a fellow student", '{"reply": "Mock peer-buddy reply for testing."}'),
    ('"suggestion":', '{"suggestion": "Mock teaching suggestion for testing."}'),
    ('"citedChunkIds"', '{"content": "Mock retry content for automated testing.", "citedChunkIds": []}'),
    ('"hint":', '{"hint": "Mock hint: think about what happens when two keys map to the same slot."}'),
    ("Explain in your own words:", '{"explain_score": 40, "solve_score": null, "feedback": "Mock feedback: needs more detail.", "mistake_tag": "incomplete"}'),
    ("Solve end-to-end:", '{"explain_score": null, "solve_score": 85, "feedback": "Mock feedback: well done.", "mistake_tag": "none"}'),
    ("Answer the user's question using only the learning content below.", "Mock grounded explanation for automated testing, covering the topic's key mechanism."),
]


class _MockGeminiResponse:
    def __init__(self, text: str):
        self.text = text


class _MockGeminiEmbedding:
    def __init__(self, values: list):
        self.values = values


class _MockEmbedContentResponse:
    def __init__(self, embeddings: list):
        self.embeddings = embeddings


class _MockGeminiModels:
    def generate_content(self, *, model, contents, config=None):
        for marker, fixture in _MOCK_GEMINI_FIXTURES:
            if marker in contents:
                return _MockGeminiResponse(fixture)
        raise RuntimeError(
            f"MOCK_GEMINI: no fixture matches this prompt (add one to _MOCK_GEMINI_FIXTURES): {contents[:200]}"
        )

    def embed_content(self, *, model, contents, config=None):
        # /upload's ingestion pipeline (generate_embeddings -> _embed_batch)
        # is the one Gemini call site that doesn't go through
        # parse_gemini_json()'s .text convention -- it reads
        # response.embeddings[].values instead. One fixed-length fake vector
        # per input string is enough: _normalize() just needs *some* nonzero
        # 768-dim vector (768 == EMBEDDING_DIMENSIONS below) to run its real
        # math unchanged, and no test asserts on the actual values.
        return _MockEmbedContentResponse([_MockGeminiEmbedding([0.01] * 768) for _ in contents])


class _MockGeminiClient:
    models = _MockGeminiModels()


if MOCK_GEMINI:
    gemini_client = _MockGeminiClient()


def generate_grounded_answer(question: str, chunks: List[dict]) -> str:
    """Generate an answer using the production Gemini client and retrieved context."""
    return generate_answer(question, chunks, gemini_client)


def parse_document(file_bytes: bytes, file_type: str) -> str:
    """Extracts text from PDF, Office docs, or raw text files."""
    text = ""
    file_type = file_type.lower().replace(".", "")

    if file_type == "pdf":
        from io import BytesIO
        reader = PyPDF2.PdfReader(BytesIO(file_bytes))
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    elif file_type in ["txt", "md", "csv", "json"]:
        text = file_bytes.decode("utf-8")
    elif file_type == "docx":
        from io import BytesIO
        import zipfile
        import xml.etree.ElementTree as ET
        try:
            with zipfile.ZipFile(BytesIO(file_bytes)) as zf:
                xml_content = zf.read('word/document.xml')
                tree = ET.fromstring(xml_content)
                for node in tree.iter():
                    if node.tag.endswith('}t') and node.text:
                        text += node.text + " "
        except Exception as e:
            raise ValueError(f"Failed to parse docx: {e}")
    elif file_type == "pptx":
        from io import BytesIO
        import zipfile
        import xml.etree.ElementTree as ET
        try:
            with zipfile.ZipFile(BytesIO(file_bytes)) as zf:
                for item in zf.namelist():
                    if item.startswith('ppt/slides/slide') and item.endswith('.xml'):
                        xml_content = zf.read(item)
                        tree = ET.fromstring(xml_content)
                        for node in tree.iter():
                            if node.tag.endswith('}t') and node.text:
                                text += node.text + " "
        except Exception as e:
            raise ValueError(f"Failed to parse pptx: {e}")
    else:
        raise ValueError(f"Unsupported file type for parsing: {file_type}")

    # PyPDF2 occasionally emits embedded null characters from certain PDF
    # font/encoding quirks -- Postgres text columns reject those outright
    # ("unsupported Unicode escape sequence"), which would otherwise crash
    # the chunk insert after embeddings have already been generated.
    return text.replace(chr(0), "")

def chunk_text(text: str, chunk_size: int = 600, overlap: int = 100) -> List[dict]:
    """Splits text into chunks with sliding window overlap."""
    if not text:
        return []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk_str = text[start:end]
        
        # Adjust end to the nearest space or newline if not at the end of the text
        if end < len(text):
            last_double_newline = chunk_str.rfind('\n\n')
            last_newline = chunk_str.rfind('\n')
            last_space = chunk_str.rfind(' ')
            
            # Paragraph and header aware: prioritize \n\n, then \n, then space
            if last_double_newline > chunk_size // 2:
                split_point = last_double_newline
            elif last_newline > chunk_size // 2:
                split_point = last_newline
            elif last_space > chunk_size // 2:
                split_point = last_space
            else:
                split_point = -1

            if split_point != -1:
                end = start + split_point
                chunk_str = text[start:end]
                
        chunks.append({"text": chunk_str.strip(), "pageNumber": 1})
        start = end - overlap
        
    return chunks

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
EMBEDDING_BATCH_SIZE = 50

# Free-tier embedding quota is enforced per-minute (and per-day) — one 60s
# backoff isn't always enough for the window to actually clear, so keep
# retrying with the same backoff rather than giving up after one attempt.
EMBEDDING_RATE_LIMIT_BACKOFF_SECONDS = 60
EMBEDDING_MAX_RATE_LIMIT_RETRIES = 8

# Separate from quota: the connection itself can drop mid-request (observed:
# httpx.ConnectError / "Connection reset by peer") with nothing to do with
# rate limits. Short backoff, since there's no window to wait out.
EMBEDDING_NETWORK_RETRY_SECONDS = 5
EMBEDDING_MAX_NETWORK_RETRIES = 5


def _normalize(vector: List[float]) -> List[float]:
    """gemini-embedding-001 requires manual L2 normalization when requesting a
    non-default (non-3072) output_dimensionality — unlike gemini-embedding-2,
    it doesn't do this for you."""
    norm = math.sqrt(sum(x * x for x in vector))
    if norm == 0:
        return vector
    return [x / norm for x in vector]


def _embed_batch(batch: List[str], task_type: str) -> List[List[float]]:
    """Embeds one batch, retrying just this batch on a 429 or a dropped
    connection — a later batch failing must not force re-submitting earlier
    batches that already succeeded (that was silently multiplying quota
    usage: a 3-batch document failing on batch 3 used to retry all 3
    batches, every retry)."""
    rate_limit_attempt = 0
    network_attempt = 0
    while True:
        try:
            response = gemini_client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=batch,
                config=types.EmbedContentConfig(
                    output_dimensionality=EMBEDDING_DIMENSIONS,
                    task_type=task_type,
                ),
            )
            return [_normalize(emb.values) for emb in response.embeddings]
        except ClientError as e:
            if e.code != 429 or rate_limit_attempt == EMBEDDING_MAX_RATE_LIMIT_RETRIES:
                raise
            rate_limit_attempt += 1
            print(
                f"      embedding rate limited — waiting {EMBEDDING_RATE_LIMIT_BACKOFF_SECONDS}s "
                f"before retrying this batch (attempt {rate_limit_attempt}/{EMBEDDING_MAX_RATE_LIMIT_RETRIES})..."
            )
            time.sleep(EMBEDDING_RATE_LIMIT_BACKOFF_SECONDS)
        except httpx.TransportError as e:
            if network_attempt == EMBEDDING_MAX_NETWORK_RETRIES:
                raise
            network_attempt += 1
            print(
                f"      connection error ({e}) — waiting {EMBEDDING_NETWORK_RETRY_SECONDS}s "
                f"before retrying this batch (attempt {network_attempt}/{EMBEDDING_MAX_NETWORK_RETRIES})..."
            )
            time.sleep(EMBEDDING_NETWORK_RETRY_SECONDS)


def generate_embeddings(texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> List[List[float]]:
    """Generates embeddings using Google Gemini gemini-embedding-001.

    task_type is asymmetric: chunks stored for retrieval must use
    RETRIEVAL_DOCUMENT, and the incoming question at query time must use
    RETRIEVAL_QUERY — see embed_query() below.
    """
    if not texts:
        return []

    # Gemini batchEmbedContents analog using Python SDK
    results = []
    for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[i:i + EMBEDDING_BATCH_SIZE]
        results.extend(_embed_batch(batch, task_type))

    return results


def embed_query(text: str) -> List[float]:
    """Embeds a single incoming question for retrieval against match_chunks."""
    return generate_embeddings([text], task_type="RETRIEVAL_QUERY")[0]


@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    courseId: str = Form("cs201"),
    instructorId: str = Form("550e8400-e29b-41d4-a716-446655440000"),
    topicId: Optional[str] = Form(None)
):
    try:
        file_bytes = await file.read()
        filename = file.filename or "unknown"
        extension = filename[filename.rfind("."):] if "." in filename else ""
        
        timestamp = int(time.time() * 1000)
        unique_id = f"doc-{str(uuid.uuid4())[:6]}"
        
        # Sanitize filename for R2 key
        sanitized_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
        r2_key = f"courses/{courseId}/{timestamp}-{sanitized_name}"
        
        # 1. Upload to Cloudflare R2
        s3_client.put_object(
            Bucket=r2_bucket_name,
            Key=r2_key,
            Body=file_bytes,
            ContentType=file.content_type or "application/octet-stream",
            Metadata={
                "originalname": filename,
                "courseid": courseId,
                "documentid": unique_id
            }
        )
        
        # 2. Save Document record to Supabase
        db_doc = {
            "document_id": unique_id[:10],
            "instructor_id": instructorId,
            "course_id": courseId,
            "topic_id": topicId,
            "file_name": filename,
            "file_type": extension.replace(".", "") or "file",
            "r2_key": r2_key
        }
        
        doc_response = supabase.table("documents").insert(db_doc).execute()
        
        # 3. Document Parsing
        extracted_text = ""
        try:
            extracted_text = parse_document(file_bytes, extension)
        except Exception as e:
            print(f"Warning: Could not extract text from document: {e}")
            
        chunks_inserted = 0
        
        # 4. Chunking & 5. Embeddings
        if extracted_text:
            chunks = chunk_text(extracted_text)
            if chunks:
                try:
                    texts = [c["text"] for c in chunks]
                    embeddings = generate_embeddings(texts)
                    
                    chunk_records = []
                    for i, chunk in enumerate(chunks):
                        chunk_records.append({
                            "chunk_id": str(uuid.uuid4())[:15],
                            "document_id": unique_id[:10],
                            "topic_id": topicId,
                            "page_number": chunk["pageNumber"],
                            "chunk_text": chunk["text"],
                            "embedding": embeddings[i]
                        })
                    
                    # Batch insert chunks
                    chunk_res = supabase.table("chunks").insert(chunk_records).execute()
                    chunks_inserted = len(chunk_res.data) if chunk_res.data else len(chunk_records)
                except Exception as e:
                    print(f"Error during embedding/chunk insertion: {e}")

        return {
            "success": True,
            "documentId": unique_id[:10],
            "fileName": filename,
            "r2Key": r2_key,
            "fileType": extension.replace(".", ""),
            "chunksInserted": chunks_inserted
        }
        
    except Exception as e:
        print("Upload Error:", e)
        raise HTTPException(status_code=500, detail=str(e))


class DeleteRequest(BaseModel):
    documentId: str

@app.delete("/upload")
async def delete_document(req: DeleteRequest):
    try:
        doc_id = req.documentId[:10]
        
        # 1. Get R2 Key
        doc_res = supabase.table("documents").select("r2_key").eq("document_id", doc_id).maybe_single().execute()
        
        # 2. Delete document (chunks are deleted via ON DELETE CASCADE)
        supabase.table("documents").delete().eq("document_id", doc_id).execute()
        
        # 3. Delete from R2
        # .maybe_single() returns None (not a response with data=None) when the
        # document_id doesn't match any row -- guard both.
        if doc_res and doc_res.data and doc_res.data.get("r2_key"):
            s3_client.delete_object(Bucket=r2_bucket_name, Key=doc_res.data["r2_key"])
        
        return {"success": True}
    except Exception as e:
        print("Delete Error:", e)
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# DEV C: LEARNER PROFILE API
# ==========================================
#
# GET /profile/{student_id} used to live here, but it duplicated
# src/app/api/student/dashboard (Next.js) with a diverging and partly
# hardcoded implementation (fixed streakDays/totalXp/week, a "Generated
# summary..." placeholder, mastery state computed with a different
# threshold). That's now the one real implementation, shared with
# src/app/api/profile/[studentId] via buildStudentProfile() in
# src/lib/studentProgress.ts — don't re-add a second one here.

class ProfileUpdateRequest(BaseModel):
    student_id: str
    topic_id: str
    mastery_percent: float
    level: str

@app.post("/profile/update")
async def update_profile(req: ProfileUpdateRequest):
    try:
        data = {
            "student_id": req.student_id,
            "topic_id": req.topic_id,
            "mastery_percent": req.mastery_percent,
            "level": req.level
        }
        # Upsert
        res = supabase.table("student_profiles").upsert(data).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        print("Update Profile Error:", e)
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# DEV C: DIAGNOSTIC QUIZ API
# ==========================================
import json

class DiagnosticGenerateReq(BaseModel):
    topic_id: str
    student_id: str

@app.post("/diagnostic/generate")
async def generate_diagnostic(req: DiagnosticGenerateReq):
    try:
        # Fetch some chunks for this topic (simple pseudo-random retrieval)
        chunks_res = supabase.table("chunks").select("chunk_text").eq("topic_id", req.topic_id).limit(5).execute()

        if not chunks_res.data:
            return {"error": "No content found for this topic to generate questions."}

        context_text = "\n\n".join([c["chunk_text"] for c in chunks_res.data])

        # Topics are strictly linear by sort_order (see computeTopics() in
        # src/lib/studentProgress.ts -- a topic only unlocks once the one
        # before it is mastered), so "the preceding topic" is unambiguous.
        # Pulling a little of its content lets the quiz test whether the
        # student has the foundation this topic assumes, not just recall of
        # this topic's own slides in isolation.
        prereq_chunks_text = None
        topic_row = supabase.table("topics").select("course_id, sort_order").eq("topic_id", req.topic_id).maybe_single().execute()
        if topic_row and topic_row.data:
            prev_topic = (
                supabase.table("topics")
                .select("topic_id")
                .eq("course_id", topic_row.data["course_id"])
                .lt("sort_order", topic_row.data["sort_order"])
                .order("sort_order", desc=True)
                .limit(1)
                .execute()
            )
            if prev_topic.data:
                prereq_res = (
                    supabase.table("chunks")
                    .select("chunk_text")
                    .eq("topic_id", prev_topic.data[0]["topic_id"])
                    .limit(3)
                    .execute()
                )
                if prereq_res.data:
                    prereq_chunks_text = "\n\n".join(c["chunk_text"] for c in prereq_res.data)

        if prereq_chunks_text:
            prereq_section = f"""
        Prerequisite content (from the previous topic):
        {prereq_chunks_text}
        """
            prereq_instruction = (
                "At least one question must test whether the student can connect the "
                "prerequisite content above to this topic, not just recall this topic in isolation."
            )
        else:
            # First topic in the course (or its predecessor has no embedded
            # content yet) has nothing to pull a prerequisite from -- still
            # probe the basic programming fundamentals this topic assumes,
            # using general knowledge instead of retrieved content.
            prereq_section = ""
            prereq_instruction = (
                "At least one question must test basic foundational programming concepts "
                "(such as variables and array indexing) that this topic assumes. This "
                "question must be fully self-contained and must NOT reference, quote, or "
                "assume the student has seen any specific algorithm, code snippet, or "
                "'provided implementation' from the current topic content below -- invent "
                "a plain, generic example instead (e.g. a small unrelated array), since the "
                "student has not been taught this topic yet and will not see that content "
                "alongside the question."
            )

        # Call Gemini to generate 2 MCQ questions
        prompt = f"""
        Based on the following educational content, generate 2 multiple-choice diagnostic questions to test a student's understanding.
        Each question must target one specific named mechanism, behavior, or comparison from the content -- not general understanding.
        Bad: "What do you know about hash tables?" or "Which statement about hash tables is true?"
        Better: "What happens when two keys hash to the same index in a hash table?" -- it names one specific mechanism (collisions) instead of inviting a general summary.
        No question may reference, quote, or assume the student has seen any specific code snippet, diagram, or "the provided implementation" unless that exact code is fully reproduced within the question text itself -- the diagnostic UI only ever shows question text and options, never source content.
        {prereq_instruction}
        Return ONLY a JSON array of objects with the exact following schema, nothing else (no markdown blocks, no intro):
        [
          {{
            "question_text": "The question here?",
            "options": ["A", "B", "C", "D"],
            "correct_answer": "A",
            "difficulty": "Medium"
          }}
        ]
        {prereq_section}
        Current topic content:
        {context_text}
        """
        
        response = gemini_client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config={'response_mime_type': 'application/json'}
        )
        
        # Parse JSON
        questions_data = json.loads(response.text)
        
        # Save to DB and format for frontend
        saved_questions = []
        frontend_questions = []
        
        for q in questions_data:
            q_id = f"q-{str(uuid.uuid4())[:6]}"
            db_record = {
                "question_id": q_id,
                "topic_id": req.topic_id,
                "question_text": json.dumps({"text": q["question_text"], "options": q["options"]}),
                "difficulty": q.get("difficulty", "Medium"),
                "correct_answer": q["correct_answer"],
                "question_type": "MCQ"
            }
            supabase.table("diagnostic_questions").insert(db_record).execute()
            
            frontend_questions.append({
                "question_id": q_id,
                "text": q["question_text"],
                "options": q["options"]
            })
            
        return {"success": True, "questions": frontend_questions}
    except HTTPException:
        raise
    except ClientError as exc:
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
        raise HTTPException(status_code=502, detail="AI request failed") from exc
    except Exception as e:
        print("Generate Diagnostic Error:", e)
        raise HTTPException(status_code=500, detail=str(e))

class AnswerSubmission(BaseModel):
    question_id: str
    student_answer: str
    
class DiagnosticSubmitReq(BaseModel):
    student_id: str
    answers: List[AnswerSubmission]

@app.post("/diagnostic/submit")
async def submit_diagnostic(req: DiagnosticSubmitReq):
    try:
        correct_count = 0
        total = len(req.answers)

        results_to_insert = []
        for ans in req.answers:
            # Check answer. .single() raises (PGRST116) on zero rows instead
            # of returning empty data, so a stale/unknown question_id would
            # crash the whole submission with a 500 instead of just being
            # skipped -- .maybe_single() returns None itself on no match, so
            # both that and its .data must be guarded.
            q_res = supabase.table("diagnostic_questions").select("*").eq("question_id", ans.question_id).maybe_single().execute()
            if not q_res or not q_res.data:
                continue

            q_data = q_res.data
            is_correct = (ans.student_answer.strip().lower() == q_data["correct_answer"].strip().lower())
            
            if is_correct:
                correct_count += 1
                
            results_to_insert.append({
                "result_id": f"res-{str(uuid.uuid4())[:6]}",
                "student_id": req.student_id,
                "question_id": ans.question_id,
                "student_answer": ans.student_answer,
                "is_correct": is_correct
            })
            
        if results_to_insert:
            supabase.table("diagnostic_results").insert(results_to_insert).execute()

        # Deliberately no student_profiles write here -- this is the low-stakes
        # warm-up, not real progress (see the topic page's "Starting Point"
        # framing). It used to upsert mastery_percent/level straight from the
        # raw score with no monotonicity guard, unlike every other
        # progress-writing path in this file -- a bad warm-up score could
        # silently erase real mastery a student had already earned via
        # /mastery/check. The score is still returned below for the
        # in-the-moment "Starting Point" summary; it just never gets persisted.

        return {"success": True, "score": f"{correct_count}/{total}"}
    except Exception as e:
        print("Submit Diagnostic Error:", e)
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# DEV PHASE 2: ADAPTIVE LOOP API
# ==========================================

SESSION_TTL_HOURS = 4
MASTERY_PASS_THRESHOLD = 70
MAX_HINT_ATTEMPTS = 2


def short_id(prefix: str, length: int = 15) -> str:
    return f"{prefix}{uuid.uuid4().hex}"[:length]


def level_for_mastery(score: float) -> str:
    if score == 100:
        return "Advanced"
    if score > 0:
        return "Intermediate"
    return "Beginner"


def renumber_inline_citations(text: str, chunks: List[dict]):
    """Gemini cites chunks inline by their real chunk_id (e.g. "[4d5b6eda-0153-4]"),
    but the frontend only recognizes single-digit markers like [1]/[2] and matches
    them against citation.mark exactly (see renderCite in the topic page) -- so the
    text and the citation list have to be renumbered together, not independently.
    Shared by /query and /retry/generate's prose formats.

    A bracket can also carry more than one id for a single claim -- e.g.
    "[4d5b6eda-0153-4, 6810e066-0ef2-4]" -- despite every prompt's example only
    ever showing one. Matching only a bracket that is EXACTLY one known id
    used to leave that whole bracket (real UUIDs and all) untouched in the
    text shown to the student -- confirmed live, not just theoretical."""
    known_ids = {chunk.get("chunk_id") for chunk in chunks}
    cited_ids_in_order = []
    for raw in re.findall(r"\[([^\[\]]+)\]", text):
        for candidate in raw.split(","):
            candidate = candidate.strip()
            if candidate in known_ids and candidate not in cited_ids_in_order:
                cited_ids_in_order.append(candidate)

    citations = map_citations(chunks, cited_ids_in_order)
    mark_by_id = {original_id: citation["mark"] for citation, original_id in zip(citations, cited_ids_in_order)}

    def _replace_bracket(match: re.Match) -> str:
        ids = [part.strip() for part in match.group(1).split(",")]
        marks = [mark_by_id[i] for i in ids if i in mark_by_id]
        return "".join(marks) if marks else match.group(0)

    rewritten = re.sub(r"\[([^\[\]]+)\]", _replace_bracket, text)

    return rewritten, citations


def parse_gemini_json(response) -> dict:
    try:
        parsed = json.loads(response.text)
    except (TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="AI returned an invalid evaluation")
    return parsed


def score_value(value, field_name: str) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HTTPException(status_code=502, detail=f"AI returned an invalid {field_name}")
    return max(0, min(100, float(value)))


def find_active_session(student_id: str, topic_id: str, session_type: str = "mastery_loop") -> Optional[str]:
    """Most recent session for this student+topic+type, if it's still within the TTL.
    session_type defaults to the mastery loop's own kind so every pre-existing
    caller (mastery/query/retry/foundations) keeps only ever seeing its own
    sessions -- a peer-buddy chat passes session_type="peer_buddy" instead so
    the two kinds can never collide for the same (student, topic)."""
    latest = (
        supabase.table("sessions")
        .select("session_id, started_at")
        .eq("student_id", student_id)
        .eq("topic_id", topic_id)
        .eq("session_type", session_type)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    if not latest.data:
        return None
    started_at = latest.data[0].get("started_at")
    if not started_at:
        return None
    try:
        started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - started).total_seconds() / 3600
        if age_hours < SESSION_TTL_HOURS:
            return latest.data[0]["session_id"]
    except (TypeError, ValueError):
        pass
    return None


_session_creation_locks_guard = threading.Lock()
_session_creation_locks: dict[tuple, threading.Lock] = {}


def _session_creation_lock(student_id: str, topic_id: str, session_type: str) -> threading.Lock:
    """One lock per (student, topic, session_type) triple -- serializes only
    concurrent get_or_create_session calls that would actually race each
    other (e.g. a double-click, a retried network request, two open tabs),
    without blocking unrelated students/topics. In-process only, same
    single-process-deployment tradeoff as rateLimit.ts's in-memory limiter --
    doesn't share state across multiple uvicorn workers, which this project
    doesn't run."""
    key = (student_id, topic_id, session_type)
    with _session_creation_locks_guard:
        lock = _session_creation_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _session_creation_locks[key] = lock
        return lock


def get_or_create_session(student_id: str, topic_id: str, session_id: Optional[str] = None, session_type: str = "mastery_loop") -> str:
    if session_id:
        existing = (
            supabase.table("sessions")
            .select("session_id")
            .eq("session_id", session_id)
            .eq("student_id", student_id)
            .eq("session_type", session_type)
            .maybe_single()
            .execute()
        )
        # .maybe_single() returns None (not a response with data=None) when the
        # session_id doesn't match any row -- e.g. an expired/stale client-held
        # id, or (now that sessions carry a type) a real session_id of the
        # WRONG type for this call -- either way this must be reachable
        # without crashing, not just the common case.
        if existing and existing.data:
            return session_id

    # find_active_session + insert is a check-then-act -- without this lock,
    # two near-simultaneous calls for the same (student, topic, session_type)
    # with no session_id (e.g. a double-click) can both see "no active
    # session" and each insert their own row, splitting the conversation
    # across two sessions. Confirmed as a real race (test_concurrency.py)
    # before this lock existed, not just a theoretical one.
    with _session_creation_lock(student_id, topic_id, session_type):
        active = find_active_session(student_id, topic_id, session_type)
        if active:
            return active

        new_session_id = short_id("ses")
        supabase.table("sessions").insert({
            "session_id": new_session_id,
            "student_id": student_id,
            "topic_id": topic_id,
            "session_type": session_type,
        }).execute()
        return new_session_id


def append_session_message(session_id: str, sender: str, text: str, metadata: Optional[dict] = None):
    supabase.table("session_messages").insert({
        "message_id": short_id("msg", 20),
        "session_id": session_id,
        "sender": sender,
        "message_text": text,
        "metadata": metadata,
    }).execute()


def get_recent_session_messages(session_id: str, limit: int = 10) -> List[dict]:
    messages = (
        supabase.table("session_messages")
        .select("sender, message_text, timestamp")
        .eq("session_id", session_id)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(messages.data or []))


def get_session_cited_chunk_ids(session_id: str, subidea_id: Optional[str] = None) -> List[str]:
    """Every chunk_id ever cited to this student in this session for a given
    sub-idea, in first-seen order -- the source-of-truth set for grading, so
    /mastery/check never contradicts content /query actually showed for that
    sub-idea's explanation. Reuses session_messages.metadata.citations
    (already stored by /query and /retry/generate) rather than
    re-retrieving, which is what let grading silently pull a different slice
    of the topic's chunks than the student was ever shown. subidea_id=None
    falls back to every citation in the session (topics with no sub-idea
    breakdown yet)."""
    query = supabase.table("session_messages").select("metadata").eq("session_id", session_id).eq("sender", "ai")
    if subidea_id:
        query = query.eq("metadata->>subideaId", subidea_id)
    rows = query.execute()
    ids: List[str] = []
    seen = set()
    for row in rows.data or []:
        for citation in (row.get("metadata") or {}).get("citations") or []:
            chunk_id = citation.get("chunk_id")
            if chunk_id and chunk_id not in seen:
                seen.add(chunk_id)
                ids.append(chunk_id)
    return ids


def format_session_context(messages: List[dict]) -> str:
    if not messages:
        return "No prior conversation context."
    return "\n".join(f"{message.get('sender', 'unknown')}: {message.get('message_text', '')}" for message in messages)


def get_topic_progress(student_id: str, topic_id: str) -> dict:
    """Authoritative "where is this student right now" for a topic -- one
    row per (student, topic), read directly rather than inferred from
    session_messages tags (proven fragile: a runaway follow-up answer was
    once mistaken for a second completed explanation). Defaults to the
    start state if /query's full-explanation call hasn't created one yet
    (e.g. /mastery/check called cold)."""
    res = (
        supabase.table("topic_progress")
        .select("subidea_index, stage, hints_used")
        .eq("student_id", student_id)
        .eq("topic_id", topic_id)
        .maybe_single()
        .execute()
    )
    if res and res.data:
        return res.data
    return {"subidea_index": 0, "stage": "explain", "hints_used": 0}


def set_topic_progress(student_id: str, topic_id: str, subidea_index: int, stage: str, hints_used: int) -> None:
    supabase.table("topic_progress").upsert({
        "student_id": student_id,
        "topic_id": topic_id,
        "subidea_index": subidea_index,
        "stage": stage,
        "hints_used": hints_used,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


def recompute_topic_mastery(student_id: str, topic_id: str) -> tuple:
    """Averages each RESOLVED sub-idea's latest overall_mastery into one
    topic-level mastery_percent, and reports whether every sub-idea has been
    resolved (passed OR its retry-check was submitted, win or lose -- the
    "advance anyway on final failure" rule means a sub-idea resolves without
    necessarily being passed). Topics with no sub-idea breakdown fall back
    to the single topic-wide mastery_checks row, matching pre-sub-idea
    behavior exactly."""
    rows = (
        supabase.table("mastery_checks")
        .select("subidea_id, overall_mastery, passed, solve_score, checked_at")
        .eq("student_id", student_id)
        .eq("topic_id", topic_id)
        .order("checked_at")
        .execute()
    ).data or []
    if not rows:
        return 0.0, False

    # Read-only: whether to average per sub-idea depends on whether a
    # breakdown already exists, not on generating one right now as a side
    # effect of computing a stat.
    subideas = get_existing_subideas(topic_id)
    if not subideas:
        latest = rows[-1]
        return float(latest["overall_mastery"]), bool(latest["passed"])

    latest_resolved_by_subidea: dict = {}
    for row in rows:
        sid = row.get("subidea_id")
        if not sid:
            continue
        resolved = row["passed"] or row.get("solve_score") is not None
        if resolved:
            latest_resolved_by_subidea[sid] = row  # chronological order -- last write wins

    if not latest_resolved_by_subidea:
        return 0.0, False
    avg = sum(float(r["overall_mastery"]) for r in latest_resolved_by_subidea.values()) / len(latest_resolved_by_subidea)
    all_resolved = len(latest_resolved_by_subidea) >= len(subideas)
    return avg, all_resolved


def generate_hint(chunks: List[dict], student_answer: str, feedback: str) -> Optional[str]:
    """Best-effort: a Gemini/JSON failure here should fall through to the normal
    reveal flow rather than fail a request whose score/feedback already succeeded."""
    try:
        prompt = f"""The student's explanation of the topic below fell short. Write ONE short leading
question (1-2 sentences) that nudges them toward what they're missing, grounded only in the
learning content below. Do NOT reveal the answer, the missing term, or the concept directly --
ask a question that makes them work it out themselves.

Return ONLY strict JSON: {{"hint": "..."}}

Learning content:
{chr(10).join(chunk["chunk_text"] for chunk in chunks)}

Student's explanation:
{student_answer}

Why it fell short:
{feedback}"""
        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        hint_data = parse_gemini_json(response)
        hint_text = hint_data.get("hint")
        if isinstance(hint_text, str) and hint_text.strip():
            return hint_text.strip()
    except Exception as exc:
        print("Hint Generation Error:", exc)
    return None


class MasteryCheckRequest(BaseModel):
    student_id: str
    topic_id: str
    session_id: Optional[str] = None
    explanation: Optional[str] = None
    solution: Optional[str] = None
    # The sub-idea this check is for. Required once a topic has a sub-idea
    # breakdown (essentially always -- get_or_generate_subideas runs lazily
    # on first use); left null only for the rare topic with no content yet,
    # which falls back to the old topic-wide behavior.
    subidea_id: Optional[str] = None


@app.post("/mastery/check")
async def check_mastery(req: MasteryCheckRequest):
    explanation = req.explanation.strip() if req.explanation else None
    solution = req.solution.strip() if req.solution else None
    if not explanation and not solution:
        raise HTTPException(status_code=400, detail="At least one of explanation or solution is required")

    try:
        session_id = get_or_create_session(req.student_id, req.topic_id, req.session_id)
        # Grade against the exact chunks this student was actually shown for
        # THIS sub-idea (via /query's or /retry/generate's citations) --
        # falling back to an arbitrary topic-wide fetch only when there's no
        # prior Explain to anchor to (e.g. mastery/check called cold). Grading
        # against a fresh, independent fetch used to let the AI reject
        # wording the app itself had just used, since the two calls could
        # easily land on different chunks.
        cited_chunk_ids = get_session_cited_chunk_ids(session_id, req.subidea_id)
        if cited_chunk_ids:
            chunks_res = supabase.table("chunks").select("chunk_text").in_("chunk_id", cited_chunk_ids).execute()
        else:
            chunks_res = supabase.table("chunks").select("chunk_text").eq("topic_id", req.topic_id).limit(500).execute()
        if not chunks_res.data:
            raise HTTPException(status_code=422, detail="No learning content found for this topic")

        recent_messages = get_recent_session_messages(session_id)
        checks_query = (
            supabase.table("mastery_checks")
            .select("mastery_id", count="exact", head=True)
            .eq("student_id", req.student_id)
            .eq("topic_id", req.topic_id)
        )
        if req.subidea_id:
            checks_query = checks_query.eq("subidea_id", req.subidea_id)
        checks = checks_query.execute()
        attempt_number = (checks.count or 0) + 1
        submissions = []
        if explanation:
            submissions.append(("explain_score", "Explain in your own words", explanation))
        if solution:
            submissions.append(("solve_score", "Solve end-to-end", solution))

        prompt = f"""Evaluate the student's submitted response(s) for the topic below.
Use the learning content as the only source of truth. Judge correctness and completeness only against it.
If an answer is not addressed by the source material, say so rather than inventing an external standard of correctness.
Score only fields that were submitted; return null for the other score.
explain_score and solve_score MUST be integers on a 0-100 scale, where 0 means completely wrong or missing and 100 means fully correct and complete. Never use a 0-1 scale.
Return ONLY strict JSON with this exact shape:
{{"explain_score": 0-100, "solve_score": 0-100, "feedback": "1-2 sentences to the student", "mistake_tag": "concept_confusion|calculation_error|incomplete|off_topic|none"}}

Learning content:
{chr(10).join(chunk["chunk_text"] for chunk in chunks_res.data)}

Prior conversation context:
{format_session_context(recent_messages)}

Student submissions:
{chr(10).join(f"{label}: {text}" for _, label, text in submissions)}"""

        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        evaluation = parse_gemini_json(response)
        explain_score = score_value(evaluation.get("explain_score"), "explain_score") if explanation else None
        solve_score = score_value(evaluation.get("solve_score"), "solve_score") if solution else None
        scores = [score for score in (explain_score, solve_score) if score is not None]
        if not scores:
            raise HTTPException(status_code=502, detail="AI did not score the submitted response")
        feedback = evaluation.get("feedback")
        mistake_tag = evaluation.get("mistake_tag", "none")
        if not isinstance(feedback, str) or not feedback.strip():
            raise HTTPException(status_code=502, detail="AI returned invalid feedback")
        if mistake_tag not in {"concept_confusion", "calculation_error", "incomplete", "off_topic", "none"}:
            mistake_tag = "none"

        overall_mastery = sum(scores) / len(scores)
        passed = overall_mastery >= MASTERY_PASS_THRESHOLD
        answer_rows = [{
            "answer_id": short_id("ans"),
            "student_id": req.student_id,
            "topic_id": req.topic_id,
            "session_id": session_id,
            "subidea_id": req.subidea_id,
            "question_text": label,
            "student_answer": text,
            "score": explain_score if score_field == "explain_score" else solve_score,
            "mistake_tag": mistake_tag,
        } for score_field, label, text in submissions]
        supabase.table("student_answers").insert(answer_rows).execute()
        mastery_id = short_id("mst")
        supabase.table("mastery_checks").insert({
            "mastery_id": mastery_id,
            "student_id": req.student_id,
            "topic_id": req.topic_id,
            "subidea_id": req.subidea_id,
            "attempt_number": attempt_number,
            "explain_score": explain_score,
            "solve_score": solve_score,
            "overall_mastery": overall_mastery,
            "passed": passed,
        }).execute()

        # A retry-check submission (has `solution`) always resolves this
        # sub-idea -- win or lose, the student advances to the next one
        # rather than being blocked. Only a first-pass failure
        # (`explanation` only) with hints/retry still available stays on
        # the same sub-idea.
        is_retry_check = bool(solution)

        topic_mastery_percent, _all_resolved = recompute_topic_mastery(req.student_id, req.topic_id)
        weak_area = mistake_tag if (not passed and mistake_tag != "none") else None
        supabase.table("student_profiles").upsert({
            "student_id": req.student_id,
            "topic_id": req.topic_id,
            "mastery_percent": topic_mastery_percent,
            "level": level_for_mastery(topic_mastery_percent),
            "weak_area": weak_area,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        pending_query = (
            supabase.table("retry_attempts")
            .select("retry_id")
            .eq("student_id", req.student_id)
            .eq("topic_id", req.topic_id)
            .is_("result", "null")
            .order("attempted_at", desc=True)
            .limit(1)
        )
        if req.subidea_id:
            pending_query = pending_query.eq("subidea_id", req.subidea_id)
        pending = pending_query.execute()
        if pending.data:
            supabase.table("retry_attempts").update({"result": "Passed" if passed else "Failed"}).eq("retry_id", pending.data[0]["retry_id"]).execute()

        hint_text = None
        hints_used = None
        advanced = False
        topic_done = False

        # Progress bookkeeping only applies to a sub-idea-scoped check -- a
        # legacy/cold call with no subidea_id has no sub-idea context to
        # advance from, and skipping this avoids an unrelated Gemini call
        # (generating a sub-idea breakdown just to count sub-ideas) as a
        # surprising side effect of grading.
        if req.subidea_id:
            progress = get_topic_progress(req.student_id, req.topic_id)
            subideas = get_or_generate_subideas(req.topic_id)

            if is_retry_check or passed:
                # Advance regardless of outcome on a retry-check (the
                # "advance anyway" rule) -- a failed retry-check is still
                # recorded above via mastery_checks(passed=false), which is
                # what makes it show as a gap in instructor insights.
                next_index = progress["subidea_index"] + 1
                if subideas and next_index < len(subideas):
                    set_topic_progress(req.student_id, req.topic_id, next_index, "explain", 0)
                    advanced = True
                else:
                    set_topic_progress(req.student_id, req.topic_id, progress["subidea_index"], "done", 0)
                    topic_done = True
            else:
                prior_hints = progress["hints_used"]
                if prior_hints < MAX_HINT_ATTEMPTS:
                    hint_text = generate_hint(chunks_res.data, explanation, feedback)
                    if hint_text:
                        hints_used = prior_hints + 1
                        set_topic_progress(req.student_id, req.topic_id, progress["subidea_index"], "check", hints_used)
                if not hint_text:
                    # Hints exhausted (or hint generation failed) -- the
                    # frontend moves to /retry/generate next.
                    set_topic_progress(req.student_id, req.topic_id, progress["subidea_index"], "retry", prior_hints)
        elif not passed:
            # Legacy/no-subidea-context path -- no persisted hint counter to
            # check against, so just offer one hint attempt.
            hint_text = generate_hint(chunks_res.data, explanation, feedback)
            if hint_text:
                hints_used = 1

        subidea_metadata = {"subideaId": req.subidea_id} if req.subidea_id else {}
        if hint_text:
            append_session_message(session_id, "ai", f"{feedback}\n\n{hint_text}", metadata={
                "tag": "Hint",
                "hintsUsed": hints_used,
                "maxHints": MAX_HINT_ATTEMPTS,
                **subidea_metadata,
            })
        else:
            feedback_tag = "Result" if (is_retry_check or passed) else "Feedback"
            append_session_message(session_id, "ai", feedback, metadata={"tag": feedback_tag, **subidea_metadata})

        return {
            "sessionId": session_id,
            "overallMastery": overall_mastery,
            "passed": passed,
            "feedback": feedback,
            "explainScore": explain_score,
            "solveScore": solve_score,
            "hint": hint_text,
            "hintsUsed": hints_used,
            "maxHints": MAX_HINT_ATTEMPTS if hint_text else None,
            "advanced": advanced,
            "topicDone": topic_done,
            "topicMasteryPercent": topic_mastery_percent,
        }
    except HTTPException:
        raise
    except ClientError as exc:
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
        raise HTTPException(status_code=502, detail="AI request failed") from exc
    except Exception as exc:
        print("Mastery Check Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to evaluate mastery") from exc


class RetryGenerateRequest(BaseModel):
    student_id: str
    topic_id: str
    session_id: Optional[str] = None
    # The sub-idea being retried -- scopes both the format-cycling attempt
    # count and the content itself to just this one sub-idea, not the whole
    # topic. See generate_answer's docstring for why unscoped content
    # generation goes wrong (same failure mode as the follow-up bug).
    subidea_id: Optional[str] = None


RETRY_FORMATS = ["Worked Example", "Hands-on Task", "Analogy", "Diagram", "Mind Map"]
RETRY_DIAGRAM_FORMATS = {"Diagram", "Mind Map"}

RETRY_FORMAT_INSTRUCTIONS = {
    "Worked Example": "Produce a fully worked, step-by-step example solved using the topic's method.",
    "Hands-on Task": "Produce a short guided exercise for the student to attempt, explaining the underlying idea first.",
    "Analogy": "Explain the concept through a clear, relatable real-world analogy, then explicitly connect each part of the analogy back to the actual mechanism.",
    "Diagram": (
        "Produce ONLY a Mermaid flowchart (the whole \"content\" string must be valid Mermaid syntax, "
        "starting with \"graph TD\" or \"graph LR\", nothing else — no prose, no markdown code fences) "
        "showing the key steps, states, or relationships in the topic."
    ),
    "Mind Map": (
        "Produce ONLY a Mermaid mind map (the whole \"content\" string must be valid Mermaid syntax, "
        "starting with \"mindmap\", nothing else — no prose, no markdown code fences) breaking the topic "
        "down into its key concepts and sub-concepts."
    ),
}


@app.post("/retry/generate")
async def generate_retry(req: RetryGenerateRequest):
    try:
        session_id = get_or_create_session(req.student_id, req.topic_id, req.session_id)
        retries_query = (
            supabase.table("retry_attempts")
            .select("retry_id", count="exact", head=True)
            .eq("student_id", req.student_id)
            .eq("topic_id", req.topic_id)
        )
        if req.subidea_id:
            retries_query = retries_query.eq("subidea_id", req.subidea_id)
        retries = retries_query.execute()
        attempt_number = (retries.count or 0) + 1

        # The sub-idea's own already-generated explanation (heading+body),
        # if there is one -- anchors the retry content to just this
        # mechanism instead of the whole topic, same technique as the
        # follow-up fix (generate_answer's current_section param).
        current_section_text = None
        current_section_heading = None
        if req.subidea_id:
            section_res = (
                supabase.table("session_messages")
                .select("metadata, message_text")
                .eq("session_id", session_id)
                .eq("sender", "ai")
                .eq("metadata->>subideaId", req.subidea_id)
                .eq("metadata->>tag", "Grounded Explanation")
                .order("timestamp")
                .limit(1)
                .execute()
            )
            if section_res.data:
                row = section_res.data[0]
                heading = (row.get("metadata") or {}).get("heading")
                current_section_text = f"{heading}\n\n{row['message_text']}" if heading else row["message_text"]
                current_section_heading = heading
        pref_res = (
            supabase.table("students")
            .select("preferred_explanation_format")
            .eq("student_id", req.student_id)
            .maybe_single()
            .execute()
        )
        # .maybe_single() returns None (not a response with data=None) when zero
        # rows match, in the installed supabase-py version -- guard both.
        preferred_format = pref_res.data.get("preferred_explanation_format") if pref_res and pref_res.data else None
        formats = RETRY_FORMATS
        if preferred_format in RETRY_FORMATS:
            idx = RETRY_FORMATS.index(preferred_format)
            formats = RETRY_FORMATS[idx:] + RETRY_FORMATS[:idx]
        format_used = formats[(attempt_number - 1) % len(formats)]
        is_diagram_format = format_used in RETRY_DIAGRAM_FORMATS
        # Retrieved via real semantic search, anchored on the sub-idea's own
        # label (the heading fetched above) -- same fix as the /query
        # follow-up path, and for the same two reasons: a raw LIMIT fetch is
        # an arbitrary, possibly-irrelevant slice of the topic, and a wide
        # enough LIMIT to reliably cover the right content is slow enough to
        # risk the same timeout the follow-up path hit. top_k few
        # semantically-relevant chunks solves both at once.
        # Falls back to the old direct topic-scoped fetch when there's no
        # label to anchor on (no subidea_id / no prior explanation found yet)
        # or retrieval comes back empty (embedding/RPC failure).
        chunks = []
        if current_section_heading:
            chunks = await retrieve_context(current_section_heading, topic_id=req.topic_id, top_k=15)
        if not chunks:
            chunks_res = (
                supabase.table("chunks")
                .select("chunk_id, document_id, chunk_text, page_number, documents(file_name)")
                .eq("topic_id", req.topic_id)
                .limit(40)
                .execute()
            )
            if not chunks_res.data:
                raise HTTPException(status_code=422, detail="No learning content found for this topic")

            for chunk in chunks_res.data:
                document = chunk.get("documents") or {}
                chunks.append(map_chunk({
                    **chunk,
                    "document_title": document.get("file_name"),
                }))

        format_instruction = RETRY_FORMAT_INSTRUCTIONS[format_used]
        citation_instruction = (
            "Do not reference chunk IDs inside the Mermaid syntax itself -- list any sources used in citedChunkIds only."
            if is_diagram_format
            else (
                "Cite supporting claims inline in the content using the chunk's ID in brackets "
                "immediately after the claim it supports, for example [chunk-id]. Only cite chunk "
                "IDs included below."
            )
        )
        section_block = (
            f"""
You are re-explaining ONLY this specific sub-idea, which the student already saw explained once in a
way that didn't land -- do not cover any other part of the topic:
\"\"\"
{current_section_text}
\"\"\"
"""
            if current_section_text else ""
        )
        prompt = f"""Create a retry intervention using only the learning content below.
Format: {format_used}. {format_instruction}
Return ONLY strict JSON: {{"content": "...", "citedChunkIds": ["chunk_id", ...]}}
{citation_instruction}
{section_block}
Learning content:
{chr(10).join(f"[{chunk['chunk_id']}] {chunk['chunk_text']}" for chunk in chunks)}"""
        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        generated = parse_gemini_json(response)
        content = generated.get("content")
        cited_ids = generated.get("citedChunkIds", [])
        valid_ids = {chunk["chunk_id"] for chunk in chunks}
        if not isinstance(content, str) or not content.strip() or not isinstance(cited_ids, list):
            raise HTTPException(status_code=502, detail="AI returned invalid retry content")

        if is_diagram_format:
            # Models routinely ignore "no code fences" instructions and wrap
            # output in ```mermaid ... ``` anyway -- strip that defensively
            # rather than hand the fence markers to the Mermaid renderer.
            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else ""
            if content.endswith("```"):
                content = content.rsplit("```", 1)[0]
            content = content.strip()
            if not content:
                raise HTTPException(status_code=502, detail="AI returned an empty diagram")

        if is_diagram_format:
            cited_ids = [chunk_id for chunk_id in cited_ids if isinstance(chunk_id, str) and chunk_id in valid_ids]
            citations = map_citations(chunks, cited_ids)
        else:
            # Prose formats cite inline (see citation_instruction above); the same
            # renumbering /query uses keeps the text and the citations list in sync,
            # rather than relying on the model's separate citedChunkIds field.
            content, citations = renumber_inline_citations(content, chunks)
            cited_ids = [c["chunk_id"] for c in citations]
        supabase.table("retry_attempts").insert({
            "retry_id": short_id("rty"),
            "student_id": req.student_id,
            "topic_id": req.topic_id,
            "subidea_id": req.subidea_id,
            "attempt_number": attempt_number,
            "format_used": format_used,
            "result": None,
        }).execute()
        retry_metadata = {
            "tag": format_used,
            "isDiagram": is_diagram_format,
            "diagram": content if is_diagram_format else None,
            "citations": citations,
        }
        if req.subidea_id:
            retry_metadata["subideaId"] = req.subidea_id
        append_session_message(session_id, "ai", content, metadata=retry_metadata)
        return {
            "sessionId": session_id,
            "format": format_used,
            "isDiagram": is_diagram_format,
            "content": content,
            "citedChunkIds": cited_ids,
            "chunks": chunks,
            "citations": citations,
        }
    except HTTPException:
        raise
    except ClientError as exc:
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
        raise HTTPException(status_code=502, detail="AI request failed") from exc
    except Exception as exc:
        print("Retry Generation Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to generate retry content") from exc


# ==========================================
# FOUNDATIONS GATE (top-sort1 only)
# ==========================================
# Sorting Algorithms is the only topic with no real preceding topic to pull a
# prerequisite from (every other topic already gets a working prerequisite
# question by pulling chunks from its real predecessor, inside
# generate_diagnostic() above). Bubble/Selection/Insertion Sort are this
# lecture's own content, not prerequisites for it -- the real prerequisites
# are fundamentals the lecture assumes but never teaches. This is a small,
# hardcoded, human-verified list (matching cs301_topic_taxonomy.sql's own
# "verify against real content, don't invent" convention) rather than
# something re-derived by an LLM call each time -- these are course-invariant
# fundamentals, and quota is too scarce to spend deriving something static.
#
# No retry loop on a wrong answer (deliberate, quota-driven): one explanation,
# then the student advances to the next concept regardless. A retry-until-
# correct design was considered and rejected -- worst case for one student's
# one pass would be 9-13 of the whole project's 20 daily generate_content
# calls; this way it's at most 1 (batch) + 4 (one explanation per concept) = 5.

FOUNDATIONS_SERVER_ERROR_BACKOFF_SECONDS = 2
FOUNDATIONS_MAX_SERVER_ERROR_RETRIES = 2


def _generate_content_with_retry(prompt: str):
    """gemini-3.6-flash occasionally returns a transient 503 (model
    overload) with nothing to do with our own quota -- observed clearing on
    an immediate retry. A couple of short-backoff retries here is safe and
    distinct from the embedding path's 429 handling above: a 429 IS our own
    quota and must never be retried (see EMBEDDING_MAX_RATE_LIMIT_RETRIES's
    comment), but a 503 ServerError is Gemini's own transient overload."""
    attempt = 0
    while True:
        try:
            return gemini_client.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
        except ServerError:
            if attempt == FOUNDATIONS_MAX_SERVER_ERROR_RETRIES:
                raise
            attempt += 1
            time.sleep(FOUNDATIONS_SERVER_ERROR_BACKOFF_SECONDS)


FOUNDATIONS_GATE_TOPIC_ID = "top-sort1"
FOUNDATIONS_CONCEPTS = [
    {"concept_id": "variables", "label": "Variables & Assignment"},
    {"concept_id": "arrays", "label": "Arrays & Indexing"},
    {"concept_id": "comparing", "label": "Comparing Two Values"},
    {"concept_id": "swapping", "label": "Swapping Two Values"},
]


class FoundationsGenerateReq(BaseModel):
    student_id: str
    topic_id: str
    session_id: Optional[str] = None


@app.post("/foundations/generate")
async def generate_foundations(req: FoundationsGenerateReq):
    if req.topic_id != FOUNDATIONS_GATE_TOPIC_ID:
        return {"error": "Foundations gate not configured for this topic."}

    try:
        session_id = get_or_create_session(req.student_id, req.topic_id, req.session_id)

        concept_list = "\n".join(f"{i + 1}. {c['label']}" for i, c in enumerate(FOUNDATIONS_CONCEPTS))
        prompt = f"""Generate one multiple-choice question for each of the following {len(FOUNDATIONS_CONCEPTS)} basic programming concepts, in this exact order:
{concept_list}

Each question must be fully self-contained and generic -- do NOT reference any specific course, lecture, sorting algorithm, or "the provided implementation." Invent a plain, unrelated example for each (e.g. a small generic array or two arbitrary variables).
Return ONLY a JSON array of exactly {len(FOUNDATIONS_CONCEPTS)} objects, in the same order as the list above, with this exact schema, nothing else (no markdown blocks, no intro):
[
  {{
    "question_text": "The question here?",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "A"
  }}
]"""

        response = _generate_content_with_retry(prompt)
        questions_data = json.loads(response.text)
        if not isinstance(questions_data, list) or len(questions_data) != len(FOUNDATIONS_CONCEPTS):
            raise HTTPException(status_code=502, detail="AI did not return the expected number of questions")

        frontend_questions = []
        for concept, q in zip(FOUNDATIONS_CONCEPTS, questions_data):
            question_id = f"q-{str(uuid.uuid4())[:6]}"
            supabase.table("diagnostic_questions").insert({
                "question_id": question_id,
                "topic_id": req.topic_id,
                "session_id": session_id,
                "concept_id": concept["concept_id"],
                "question_text": json.dumps({"text": q["question_text"], "options": q["options"]}),
                "correct_answer": q["correct_answer"],
                "question_type": "FOUNDATIONS_MCQ",
            }).execute()
            frontend_questions.append({
                "question_id": question_id,
                "concept_id": concept["concept_id"],
                "concept_label": concept["label"],
                "concept_index": len(frontend_questions),
                "text": q["question_text"],
                "options": q["options"],
            })

        first = frontend_questions[0]
        append_session_message(session_id, "ai", first["text"], metadata={
            "tag": "Foundations Question",
            "questionId": first["question_id"],
            "conceptId": first["concept_id"],
            "conceptLabel": first["concept_label"],
            "conceptIndex": 0,
            "totalConcepts": len(FOUNDATIONS_CONCEPTS),
            "questionText": first["text"],
            "options": first["options"],
        })

        return {"sessionId": session_id, "questions": frontend_questions}
    except HTTPException:
        raise
    except ClientError as exc:
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
        raise HTTPException(status_code=502, detail="AI request failed") from exc
    except Exception as exc:
        print("Foundations Generate Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to generate foundations questions") from exc


def _foundations_next_payload(session_id: str, next_index: int) -> dict:
    """Zero-Gemini-cost bookkeeping shared by /foundations/answer's correct
    branch and /foundations/advance: reveal the next concept's already-
    generated question, or signal completion."""
    if next_index >= len(FOUNDATIONS_CONCEPTS):
        append_session_message(session_id, "ai", "Foundations cleared.", metadata={
            "tag": "Foundations Complete",
            "clearedConcepts": len(FOUNDATIONS_CONCEPTS),
        })
        return {"correct": True, "done": True}

    concept = FOUNDATIONS_CONCEPTS[next_index]
    q_res = (
        supabase.table("diagnostic_questions")
        .select("question_id, question_text")
        .eq("session_id", session_id)
        .eq("concept_id", concept["concept_id"])
        .maybe_single()
        .execute()
    )
    if not q_res or not q_res.data:
        raise HTTPException(status_code=500, detail="Next foundations question not found")

    parsed = json.loads(q_res.data["question_text"])
    next_question = {
        "question_id": q_res.data["question_id"],
        "concept_id": concept["concept_id"],
        "concept_label": concept["label"],
        "concept_index": next_index,
        "text": parsed["text"],
        "options": parsed["options"],
    }
    append_session_message(session_id, "ai", next_question["text"], metadata={
        "tag": "Foundations Question",
        "questionId": next_question["question_id"],
        "conceptId": next_question["concept_id"],
        "conceptLabel": next_question["concept_label"],
        "conceptIndex": next_index,
        "totalConcepts": len(FOUNDATIONS_CONCEPTS),
        "questionText": next_question["text"],
        "options": next_question["options"],
    })
    return {"correct": True, "done": False, "next": next_question}


class FoundationsAnswerReq(BaseModel):
    student_id: str
    topic_id: str
    session_id: str
    question_id: str
    concept_index: int
    student_answer: str


@app.post("/foundations/answer")
async def answer_foundations(req: FoundationsAnswerReq):
    try:
        q_res = supabase.table("diagnostic_questions").select("correct_answer, concept_id").eq("question_id", req.question_id).single().execute()
        if not q_res.data:
            raise HTTPException(status_code=404, detail="Question not found")

        is_correct = req.student_answer.strip().lower() == q_res.data["correct_answer"].strip().lower()
        supabase.table("diagnostic_results").insert({
            "result_id": f"res-{str(uuid.uuid4())[:6]}",
            "student_id": req.student_id,
            "question_id": req.question_id,
            "student_answer": req.student_answer,
            "is_correct": is_correct,
        }).execute()

        if is_correct:
            return _foundations_next_payload(req.session_id, req.concept_index + 1)

        concept = FOUNDATIONS_CONCEPTS[req.concept_index]
        prompt = f"""A student just got a basic question about "{concept['label']}" wrong. Write a short, clear
explanation (2-4 sentences) of this concept from first principles, generic and self-contained --
do NOT reference any specific course, lecture, or algorithm.
Return ONLY strict JSON: {{"explanation": "..."}}"""
        response = _generate_content_with_retry(prompt)
        explanation = parse_gemini_json(response).get("explanation")
        if not isinstance(explanation, str) or not explanation.strip():
            raise HTTPException(status_code=502, detail="AI returned invalid explanation")

        append_session_message(req.session_id, "ai", explanation, metadata={
            "tag": "Foundations Explanation",
            "conceptId": concept["concept_id"],
            "conceptLabel": concept["label"],
            "conceptIndex": req.concept_index,
            "totalConcepts": len(FOUNDATIONS_CONCEPTS),
        })
        return {"correct": False, "explanation": explanation}
    except HTTPException:
        raise
    except ClientError as exc:
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
        raise HTTPException(status_code=502, detail="AI request failed") from exc
    except Exception as exc:
        print("Foundations Answer Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to check foundations answer") from exc


class FoundationsAdvanceReq(BaseModel):
    student_id: str
    topic_id: str
    session_id: str
    concept_index: int


@app.post("/foundations/advance")
async def advance_foundations(req: FoundationsAdvanceReq):
    try:
        return _foundations_next_payload(req.session_id, req.concept_index + 1)
    except HTTPException:
        raise
    except Exception as exc:
        print("Foundations Advance Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to advance foundations gate") from exc


# ==========================================
# TOPIC SUB-IDEA BREAKDOWN (auto-generated, once per topic)
# ==========================================
# Breaks a topic into its real sub-ideas (e.g. Stacks -> array-based
# implementation, isFull/isEmpty checks, push/pop) so per-sub-idea
# understanding can be tracked instead of one opaque topic-level mastery
# percent. Prototype-stage: generated lazily and used immediately the first
# time a topic is actually needed (its first full explanation, or a cold
# mastery-check with no prior explain) -- no instructor review/publish
# step. One Gemini call per topic, ever; every later call just re-reads the
# stored rows.

SUBIDEA_MIN_COUNT = 4
SUBIDEA_MAX_COUNT = 8


def get_existing_subideas(topic_id: str) -> List[dict]:
    """Read-only lookup -- never triggers generation. Used wherever "does
    this topic currently have a sub-idea breakdown" matters but generating
    one as a side effect would be surprising (e.g. computing an aggregate
    stat shouldn't spend a Gemini call)."""
    existing = (
        supabase.table("topic_subideas")
        .select("subidea_id, label")
        .eq("topic_id", topic_id)
        .order("idea_index")
        .execute()
    )
    return existing.data or []


def get_or_generate_subideas(topic_id: str) -> List[dict]:
    existing = get_existing_subideas(topic_id)
    if existing:
        return existing

    # The full topic's chunks, not an arbitrary slice -- a sub-idea list
    # drawn from only part of the material can name sub-ideas the full
    # explanation (which now also sees the whole topic, see /query) has no
    # trouble grounding, but a list drawn from a DIFFERENT partial slice
    # than the explanation sees is what caused sub-ideas with no real
    # grounding at all. Same limit as the explanation's own fetch.
    chunks_res = supabase.table("chunks").select("chunk_text").eq("topic_id", topic_id).limit(500).execute()
    if not chunks_res.data:
        return []  # No content yet to break down -- callers treat this the same as "no sub-ideas".

    prompt = f"""Break the topic below into its real sub-ideas -- the distinct mechanisms, checks, or
operations a student actually has to understand, not a generic outline. For example, for a "Stacks"
topic: array-based implementation, isFull/isEmpty checks, push/pop operations -- not "Introduction" or
"Summary".
Each sub-idea MUST be something the content below explicitly names, defines, or walks through as its
own topic -- not a category or comparison you infer by grouping unrelated pieces together (e.g. do NOT
invent a label like "Internal vs. External X" just because the content happens to mention both an
internal detail and an external interface somewhere; only do that if the content itself explicitly
draws that comparison). Every sub-idea will later be explained on its own, strictly grounded in this
same content, so a label the content doesn't actually support produces a broken explanation.
Return ONLY a JSON array of {SUBIDEA_MIN_COUNT}-{SUBIDEA_MAX_COUNT} objects, ordered the way a student
would naturally encounter them, with this exact schema, nothing else (no markdown blocks, no intro):
[
  {{"label": "A short, specific sub-idea name (a few words)", "description": "One sentence on what it covers"}}
]

Learning content:
{chr(10).join(c['chunk_text'] for c in chunks_res.data)}"""

    try:
        response = _generate_content_with_retry(prompt)
        items = json.loads(response.text)
    except Exception as exc:
        print("Subidea Generate Error:", exc)
        return []  # Best-effort -- a topic just stays untagged rather than failing the caller's real request.

    if not isinstance(items, list) or not (SUBIDEA_MIN_COUNT <= len(items) <= SUBIDEA_MAX_COUNT):
        return []
    valid_items = [
        item for item in items
        if isinstance(item, dict) and isinstance(item.get("label"), str) and item["label"].strip()
    ]
    if len(valid_items) != len(items):
        return []

    rows = [{
        "subidea_id": short_id("sub", 20),
        "topic_id": topic_id,
        "idea_index": i,
        "label": item["label"].strip(),
        "description": item["description"].strip() if isinstance(item.get("description"), str) else None,
    } for i, item in enumerate(valid_items)]
    supabase.table("topic_subideas").insert(rows).execute()
    return [{"subidea_id": r["subidea_id"], "label": r["label"]} for r in rows]


# ==========================================
# ON-DEMAND PRACTICE ASSIGNMENTS, QUIZZES & FINAL EXAMS
# ==========================================
# Student-initiated extra practice, separate from the Diagnose -> Explain ->
# Check -> Retry mastery loop. The instructor's own uploaded practice
# assignment/quiz/exam for a topic (or course, for final_exam) is used ONLY
# as a style/structure reference -- never served as-is -- so the model
# writes genuinely new questions in the same format instead of a copy. Same
# shared-spec-dict pattern RETRY_FORMATS already uses for prose vs. Mermaid
# formats.
#
# practice_assignment stays single-lecture. quiz and final_exam both aggregate
# content across a list of topic_ids -- quiz's list is student-chosen
# (checked in the Mastered Hub), final_exam's is auto-resolved to every topic
# in the course. Caching key is (student_id, content_type, topic_ids) where
# topic_ids is a sorted, comma-joined string -- a plain app-validated field,
# matching this table's existing convention, rather than an array PK.

PRACTICE_CONTENT_SPECS = {
    "practice_assignment": {
        "reference_document_type": "practice_assignment",
        "label": "Practice Assignment",
        "count": 4,
        "schema_instructions": """Write open-ended, worked-style problems (not multiple-choice).
Return ONLY a JSON array of exactly 4 objects with this exact schema, nothing else (no markdown blocks, no intro):
[
  {
    "question_text": "The problem statement here.",
    "difficulty": "Easy" | "Medium" | "Hard",
    "model_answer": "A complete worked solution, explained step by step."
  }
]""",
    },
    "quiz": {
        "reference_document_type": "quiz",
        "label": "Quiz",
        "count": 5,
        "schema_instructions": """Write a MIX of question types, the way a real instructor's quiz would --
do not make every question multiple-choice. Use "multiple_choice" for concept checks, "short_answer" for
questions that need a written explanation, and "code" for questions where the lecture content involves
programming, algorithms, or data structures (write one where the content supports it).
Return ONLY a JSON array of exactly 5 objects with this exact schema, nothing else (no markdown blocks, no intro):
[
  {
    "question_type": "multiple_choice" | "short_answer" | "code",
    "question_text": "The question here. For a code question, state the coding task precisely (inputs, expected output/behavior).",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "For multiple_choice: the exact text of the correct option. For short_answer: the expected answer. For code: a correct example solution (include code).",
    "difficulty": "Easy" | "Medium" | "Hard"
  }
]
Omit the "options" field entirely for "short_answer" and "code" questions -- only "multiple_choice" questions have options.""",
    },
    "final_exam": {
        "reference_document_type": "exam",
        # Falls back to the course's quiz reference if the instructor hasn't
        # uploaded a real past exam -- better than failing outright.
        "fallback_reference_document_type": "quiz",
        "label": "Final Exam",
        "count": 15,
        "schema_instructions": """Write a MIX of question types for a comprehensive final exam covering the
whole course, the way a real instructor's exam would -- do not make every question multiple-choice. Use
"multiple_choice" for concept checks, "short_answer" for questions that need a written explanation, and "code"
for questions where the course content involves programming, algorithms, or data structures (include several
where the content supports it).
Return ONLY a JSON array of exactly 15 objects with this exact schema, nothing else (no markdown blocks, no intro):
[
  {
    "question_type": "multiple_choice" | "short_answer" | "code",
    "question_text": "The question here. For a code question, state the coding task precisely (inputs, expected output/behavior).",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "For multiple_choice: the exact text of the correct option. For short_answer: the expected answer. For code: a correct example solution (include code).",
    "difficulty": "Easy" | "Medium" | "Hard"
  }
]
Omit the "options" field entirely for "short_answer" and "code" questions -- only "multiple_choice" questions have options.""",
    },
}


_QUIZ_QUESTION_TYPES = ("multiple_choice", "short_answer", "code")


def _validate_practice_payload(content_type: str, questions) -> None:
    if not isinstance(questions, list) or not questions:
        raise HTTPException(status_code=502, detail="AI did not return a valid question list")
    for q in questions:
        if not isinstance(q, dict) or not isinstance(q.get("question_text"), str) or not q["question_text"].strip():
            raise HTTPException(status_code=502, detail="AI returned a malformed question")
        if content_type in ("quiz", "final_exam"):
            if q.get("question_type") not in _QUIZ_QUESTION_TYPES:
                raise HTTPException(status_code=502, detail="AI returned a question with an invalid question_type")
            if not isinstance(q.get("correct_answer"), str) or not q["correct_answer"].strip():
                raise HTTPException(status_code=502, detail="AI returned a malformed quiz question")
            if q["question_type"] == "multiple_choice" and (not isinstance(q.get("options"), list) or not q.get("options")):
                raise HTTPException(status_code=502, detail="AI returned a malformed multiple-choice question")
        else:
            if not isinstance(q.get("model_answer"), str) or not q["model_answer"].strip():
                raise HTTPException(status_code=502, detail="AI returned a malformed practice question")


class PracticeGenerateReq(BaseModel):
    student_id: str
    topic_ids: List[str] = []
    course_id: Optional[str] = None
    content_type: str
    force_regenerate: bool = False


def _sanitize_r2_key_part(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", value)


def _generated_pdf_keys(student_id: str, content_type: str, topic_ids_key: str) -> tuple[str, str]:
    scope = _sanitize_r2_key_part(topic_ids_key)
    base = f"generated-content/{student_id}/{content_type}-{scope}"
    return f"{base}-questions.pdf", f"{base}-answer_key.pdf"


def _render_and_store_pdfs(content_type: str, label: str, course_id: str, title: str, questions: list, student_id: str, topic_ids_key: str) -> tuple[str, str]:
    """Renders both PDFs from already-generated question payload and uploads
    them to R2 -- shared by the fresh-generation path and the legacy-cache
    backfill path (a cached row from before PDF support existed)."""
    eyebrow = f"{label} · {course_id.upper()}"
    questions_pdf = render_questions_pdf(content_type, eyebrow, title, questions)
    answer_key_pdf = render_answer_key_pdf(content_type, eyebrow, title, questions)

    questions_key, answer_key_key = _generated_pdf_keys(student_id, content_type, topic_ids_key)
    s3_client.put_object(Bucket=r2_bucket_name, Key=questions_key, Body=questions_pdf, ContentType="application/pdf")
    s3_client.put_object(Bucket=r2_bucket_name, Key=answer_key_key, Body=answer_key_pdf, ContentType="application/pdf")
    return questions_key, answer_key_key


def _presign_pdf_url(key: str) -> str:
    return s3_client.generate_presigned_url("get_object", Params={"Bucket": r2_bucket_name, "Key": key}, ExpiresIn=3600)


@app.post("/practice/generate")
async def generate_practice_content(req: PracticeGenerateReq):
    spec = PRACTICE_CONTENT_SPECS.get(req.content_type)
    if not spec:
        raise HTTPException(status_code=400, detail="Unknown content_type")

    try:
        if req.content_type == "final_exam":
            if not req.course_id:
                raise HTTPException(status_code=400, detail="course_id is required for final_exam")
            course_topics = supabase.table("topics").select("topic_id, topic_name").eq("course_id", req.course_id).execute()
            if not course_topics.data:
                raise HTTPException(status_code=422, detail="This course has no topics yet")
            topic_ids = [t["topic_id"] for t in course_topics.data]
            topic_rows = course_topics.data
            course_id = req.course_id
        else:
            if not req.topic_ids:
                raise HTTPException(status_code=400, detail="topic_ids is required")
            topic_ids = req.topic_ids
            topic_rows = supabase.table("topics").select("topic_id, topic_name, course_id").in_("topic_id", topic_ids).execute().data or []
            if not topic_rows:
                raise HTTPException(status_code=422, detail="No matching topics found")
            course_id = topic_rows[0]["course_id"]

        topic_ids_key = ",".join(sorted(topic_ids))
        topic_names = [t["topic_name"] for t in topic_rows]
        course_res = supabase.table("courses").select("course_name").eq("course_id", course_id).maybe_single().execute()
        course_name = course_res.data["course_name"] if course_res and course_res.data else course_id
        title = f"{course_name} Final Exam" if req.content_type == "final_exam" else ", ".join(topic_names)

        existing = None
        if not req.force_regenerate:
            existing = (
                supabase.table("generated_practice_content")
                .select("payload, generated_at, questions_pdf_key, answer_key_pdf_key")
                .eq("student_id", req.student_id)
                .eq("content_type", req.content_type)
                .eq("topic_ids", topic_ids_key)
                .maybe_single()
                .execute()
            )
            existing = existing.data if existing else None

        if existing:
            questions = existing["payload"]
            questions_pdf_key = existing.get("questions_pdf_key")
            answer_key_pdf_key = existing.get("answer_key_pdf_key")
            if not questions_pdf_key or not answer_key_pdf_key:
                questions_pdf_key, answer_key_pdf_key = _render_and_store_pdfs(
                    req.content_type, spec["label"], course_id, title, questions, req.student_id, topic_ids_key
                )
                supabase.table("generated_practice_content").update({
                    "questions_pdf_key": questions_pdf_key,
                    "answer_key_pdf_key": answer_key_pdf_key,
                }).eq("student_id", req.student_id).eq("content_type", req.content_type).eq("topic_ids", topic_ids_key).execute()
            return {
                "cached": True,
                "questionCount": len(questions),
                "generatedAt": existing["generated_at"],
                "questionsPdfUrl": _presign_pdf_url(questions_pdf_key),
                "answerKeyPdfUrl": _presign_pdf_url(answer_key_pdf_key),
            }

        ref_docs_query = supabase.table("documents").select("document_id")
        if req.content_type == "final_exam":
            ref_docs = ref_docs_query.eq("course_id", course_id).eq("document_type", spec["reference_document_type"]).execute()
            if not ref_docs.data:
                ref_docs = (
                    supabase.table("documents")
                    .select("document_id")
                    .eq("course_id", course_id)
                    .eq("document_type", spec["fallback_reference_document_type"])
                    .execute()
                )
        else:
            ref_docs = ref_docs_query.in_("topic_id", topic_ids).eq("document_type", spec["reference_document_type"]).execute()
        if not ref_docs.data:
            return {"error": f"No instructor {req.content_type.replace('_', ' ')} material found yet."}

        ref_ids = [d["document_id"] for d in ref_docs.data]
        ref_chunks = supabase.table("chunks").select("chunk_text").in_("document_id", ref_ids).limit(10).execute()

        # Cap chunks per topic as the selection grows, so a multi-lecture
        # quiz or a whole-course final exam doesn't balloon the prompt.
        per_topic_cap = max(2, 8 // len(topic_ids))
        lecture_chunks = []
        for topic_id in topic_ids:
            # Client-side filter rather than a `.not_.in_()` chain -- simpler
            # and avoids yet another supabase-py version quirk to work around.
            # Fetch the topic's whole chunk set (bounded generously) before
            # filtering out the reference doc's chunks -- filtering after a
            # small `per_topic_cap * 3` page let a large reference document
            # (e.g. a full graded PDF) fill the entire page and starve out
            # every real lecture chunk, wrongly raising 422 below.
            topic_chunks = (
                supabase.table("chunks")
                .select("chunk_text, document_id")
                .eq("topic_id", topic_id)
                .limit(500)
                .execute()
            )
            filtered = [c for c in (topic_chunks.data or []) if c["document_id"] not in ref_ids][:per_topic_cap]
            lecture_chunks.extend(filtered)
        if not lecture_chunks:
            raise HTTPException(status_code=422, detail="No lecture content found for these topics")

        prompt = f"""Study the STYLE REFERENCE below to learn this course's question types, structure, and
difficulty -- do NOT reuse its actual questions, wording, or scenarios. Write genuinely new questions
in the same style, testing the LECTURE CONTENT below, not the style reference's own content.
{spec['schema_instructions']}

Style reference (structure/difficulty guide only -- do not copy):
{chr(10).join(c['chunk_text'] for c in (ref_chunks.data or []))}

Lecture content the new questions must actually test:
{chr(10).join(c['chunk_text'] for c in lecture_chunks)}"""

        response = _generate_content_with_retry(prompt)
        questions = json.loads(response.text)
        _validate_practice_payload(req.content_type, questions)

        questions_pdf_key, answer_key_pdf_key = _render_and_store_pdfs(
            req.content_type, spec["label"], course_id, title, questions, req.student_id, topic_ids_key
        )

        generated_at = datetime.now(timezone.utc).isoformat()
        supabase.table("generated_practice_content").upsert({
            "student_id": req.student_id,
            "topic_ids": topic_ids_key,
            "content_type": req.content_type,
            "reference_document_id": ref_ids[0],
            "payload": questions,
            "generated_at": generated_at,
            "questions_pdf_key": questions_pdf_key,
            "answer_key_pdf_key": answer_key_pdf_key,
        }).execute()

        return {
            "cached": False,
            "questionCount": len(questions),
            "generatedAt": generated_at,
            "questionsPdfUrl": _presign_pdf_url(questions_pdf_key),
            "answerKeyPdfUrl": _presign_pdf_url(answer_key_pdf_key),
        }
    except HTTPException:
        raise
    except ClientError as exc:
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
        raise HTTPException(status_code=502, detail="AI request failed") from exc
    except Exception as exc:
        print("Practice Generate Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to generate practice content") from exc


# ==========================================
# PEER-EXPLANATION BUDDY (post-mastery only)
# ==========================================
# The Feynman technique: an AI persona plays a fellow student who hasn't
# understood the lecture yet, and the real student has to explain it. Grounded
# in the same topic content the mastery loop uses (plain chunk fetch, no
# embed_content -- the persona has no per-turn search query, it just needs
# fixed "this topic's content" every turn), but deliberately NOT another
# formal Explain screen -- no citations, casual tone, gentle probing instead
# of direct correction. Capped per session (not per topic -- see
# MAX_PEER_BUDDY_TURNS) since this is a genuinely repeatable, revisitable
# activity, not a one-shot check.

MAX_PEER_BUDDY_TURNS = 6


class PeerBuddyMessageReq(BaseModel):
    student_id: str
    topic_id: str
    session_id: Optional[str] = None
    student_message: str


@app.post("/peer-buddy/message")
async def peer_buddy_message(req: PeerBuddyMessageReq):
    try:
        session_id = get_or_create_session(req.student_id, req.topic_id, req.session_id, session_type="peer_buddy")

        prior_turns = (
            supabase.table("session_messages")
            .select("message_id", count="exact", head=True)
            .eq("session_id", session_id)
            .eq("sender", "student")
            .execute()
        ).count or 0

        append_session_message(session_id, "student", req.student_message)

        if prior_turns >= MAX_PEER_BUDDY_TURNS:
            closer = "Okay, I think I've got it now — thanks for walking me through it!"
            append_session_message(session_id, "ai", closer, metadata={"tag": "Peer Buddy", "capped": True})
            return {"sessionId": session_id, "reply": closer, "capped": True}

        chunks_res = supabase.table("chunks").select("chunk_text").eq("topic_id", req.topic_id).limit(8).execute()
        recent = get_recent_session_messages(session_id)
        prompt = f"""You are playing a fellow student who has NOT yet learned this topic and is a little
confused. Stay in character: casual, curious, short follow-up questions, never lecture back, never
cite sources or say "according to the text." If the real student's explanation is wrong or
incomplete, gently probe instead of correcting directly (e.g. "wait, does that mean X always
happens?") -- ground your confusion and follow-ups in the real content below, don't invent unrelated
tangents.
Return ONLY strict JSON: {{"reply": "..."}}

Topic content (privately known to you -- never quote or cite it):
{chr(10).join(c["chunk_text"] for c in (chunks_res.data or []))}

Conversation so far:
{format_session_context(recent)}"""

        response = _generate_content_with_retry(prompt)
        reply = parse_gemini_json(response).get("reply")
        if not isinstance(reply, str) or not reply.strip():
            raise HTTPException(status_code=502, detail="AI returned an invalid reply")

        append_session_message(session_id, "ai", reply.strip(), metadata={"tag": "Peer Buddy"})
        return {"sessionId": session_id, "reply": reply.strip(), "capped": prior_turns + 1 >= MAX_PEER_BUDDY_TURNS}
    except HTTPException:
        raise
    except ClientError as exc:
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
        raise HTTPException(status_code=502, detail="AI request failed") from exc
    except Exception as exc:
        print("Peer Buddy Message Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to get a reply") from exc


class PeerBuddyHistoryReq(BaseModel):
    student_id: str
    topic_id: str


@app.post("/peer-buddy/history")
async def peer_buddy_history(req: PeerBuddyHistoryReq):
    try:
        session_id = find_active_session(req.student_id, req.topic_id, session_type="peer_buddy")
        if not session_id:
            return {"sessionId": None, "messages": []}

        messages_res = (
            supabase.table("session_messages")
            .select("sender, message_text, metadata, timestamp")
            .eq("session_id", session_id)
            .order("timestamp")
            .execute()
        )
        messages = [
            {
                "sender": row["sender"],
                "text": row["message_text"],
                **(row.get("metadata") or {}),
            }
            for row in (messages_res.data or [])
        ]
        return {"sessionId": session_id, "messages": messages}
    except Exception as exc:
        print("Peer Buddy History Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to load peer buddy history") from exc


class QueryRequest(BaseModel):
    student_id: str
    course_id: str
    topic_id: str
    question: str
    session_id: Optional[str] = None
    # True only for the one-time "explain this topic from the ground up"
    # request, called once right after Diagnose. Generates ALL of the
    # topic's sub-idea sections in one Gemini call (see
    # generate_structured_explanation) and persists one session_messages row
    # per sub-idea -- the per-sub-idea explain/check/hint/retry loop then
    # sequences through them one at a time. Never called again for the same
    # topic/session -- resume reads the already-generated sections back via
    # /topic/resume instead of regenerating them.
    full_explanation: bool = False
    # Only meaningful on a follow-up call (full_explanation=False): the
    # subideaId of the sub-idea currently on screen. Absent/invalid is fine
    # -- the follow-up is just tagged untagged rather than rejected.
    subidea_id: Optional[str] = None
    # Only meaningful on a follow-up call: the heading+body of the current
    # sub-idea's section, so generate_answer can anchor a vague "explain
    # more"/"why" to that section instead of the whole topic. See
    # generate_answer's docstring for the runaway-answer bug this prevents.
    current_section_text: Optional[str] = None


@app.post("/query")
async def query_content(req: QueryRequest):
    t0 = time.perf_counter()
    try:
        session_id = get_or_create_session(req.student_id, req.topic_id, req.session_id)
        t1 = time.perf_counter()
        if req.full_explanation:
            # One-time "explain this topic from the ground up" call -- this
            # now has to cover the WHOLE topic across every sub-idea, not
            # just whatever's most relevant to one narrow question, so it
            # pulls the topic's full chunk set directly (same as
            # get_or_generate_subideas and the follow-up branch below)
            # rather than retrieve_context's embedding-similarity top-K
            # search. top_k defaults to 5 there -- fine for a single
            # follow-up question, but on a topic with 100+ chunks it starved
            # most sub-ideas of any grounding at all, producing "I don't
            # have enough context" for sub-ideas whose content just didn't
            # happen to be among the 5 closest matches to the generic
            # "explain this from the ground up" query.
            chunks_res = (
                supabase.table("chunks")
                .select("chunk_id, chunk_text, document_id, page_number")
                .eq("topic_id", req.topic_id)
                .limit(500)
                .execute()
            )
            chunks = [map_chunk(c) for c in (chunks_res.data or [])]
        else:
            # Follow-up question about content the student was just shown for
            # this topic (e.g. "explain more", "why") -- retrieved via real
            # semantic search (retrieve_context) instead of an arbitrary
            # unordered slice of the topic's chunks. Anchored on the current
            # sub-idea's own label (not the follow-up's own wording, which is
            # often vague/pronoun-heavy -- "why", "explain more") combined
            # with the question, so the top-K result stays on-topic even when
            # the question alone wouldn't embed near anything useful. This
            # also fixes the earlier latency problem for free: top_k few
            # chunks is inherently far cheaper per prompt than any fixed
            # LIMIT wide enough to reliably include the right content, so
            # there's no more tension between "wide enough to be relevant"
            # and "narrow enough to stay fast" (a live 502 on a 24s-plus
            # request came from exactly that tension). generate_answer's
            # current_section param remains the primary fix for "explain
            # again"-style follow-ups (the section's own text, always
            # available and always relevant) -- this fetch is supplementary
            # grounding for follow-ups that reach beyond the current section.
            #
            # Falls back to a direct topic-scoped fetch if retrieval comes
            # back empty (embedding/RPC failure, or no sub-idea context to
            # anchor on yet) so a transient retrieval failure doesn't regress
            # to "no context".
            subidea_label = None
            if req.subidea_id:
                subidea_label = next(
                    (s["label"] for s in get_existing_subideas(req.topic_id) if s["subidea_id"] == req.subidea_id),
                    None,
                )
            retrieval_query = f"{subidea_label}: {req.question}" if subidea_label else req.question
            chunks = await retrieve_context(retrieval_query, topic_id=req.topic_id, course_id=req.course_id, top_k=15)
            if not chunks:
                chunks_res = (
                    supabase.table("chunks")
                    .select("chunk_id, chunk_text, document_id, page_number")
                    .eq("topic_id", req.topic_id)
                    .limit(40)
                    .execute()
                )
                chunks = [map_chunk(c) for c in (chunks_res.data or [])]
        t2 = time.perf_counter()
        print(f"      /query timing -- get_or_create_session={t1 - t0:.2f}s fetch_chunks={t2 - t1:.2f}s")

        try:
            if req.full_explanation:
                subideas = get_or_generate_subideas(req.topic_id)
                structured = generate_structured_explanation(req.question, chunks, gemini_client, subideas=subideas)
            else:
                # Prior turns (the original explanation, earlier follow-ups)
                # so a meta-reference like "explain more" or "why" resolves
                # to something -- without this the model has the topic's
                # content but no idea what "more" means and (correctly, per
                # its own prompt instructions) says it lacks context.
                recent = get_recent_session_messages(session_id)
                conversation_context = format_session_context(recent) if recent else None
                raw_answer = generate_answer(
                    req.question,
                    chunks,
                    gemini_client,
                    conversation_context=conversation_context,
                    current_section=req.current_section_text,
                )
            print(f"      /query timing -- generate_answer={time.perf_counter() - t2:.2f}s")
        except AnswerGenerationError as exc:
            # generate_answer()/generate_structured_explanation() (answer_generation.py)
            # catch every exception from their own Gemini call -- including a 429 --
            # and re-wrap it as a generic AnswerGenerationError, same as every other
            # endpoint used to do before this session's quota-handling fix. The
            # original ClientError survives as __cause__, so unwrap it here
            # rather than always answering 502.
            if isinstance(exc.__cause__, ClientError) and exc.__cause__.code == 429:
                raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        t3 = time.perf_counter()

        if req.full_explanation:
            if structured == NO_CONTEXT_ANSWER:
                append_session_message(session_id, "student", req.question)
                append_session_message(session_id, "ai", NO_CONTEXT_ANSWER, metadata={"tag": "Grounded Explanation", "citations": []})
                return {"sessionId": session_id, "sections": [], "noContext": True}

            append_session_message(session_id, "student", req.question)
            sections_out = []
            for i, s in enumerate(structured["sections"]):
                # Renumbered independently per section (not across the whole
                # explanation) -- each sub-idea is now its own self-contained
                # mini-lesson, so its citation markers restart at [1].
                body, citations = renumber_inline_citations(s["body"], chunks)
                metadata = {
                    "tag": "Grounded Explanation",
                    "heading": s["heading"],
                    "citations": citations,
                    "subideaId": s["subideaId"],
                    "subideaIndex": i,
                    "checkQuestion": s["checkQuestion"],
                    "solveSteps": s["solveSteps"],
                }
                append_session_message(session_id, "ai", body, metadata=metadata)
                sections_out.append({
                    "heading": s["heading"],
                    "body": body,
                    "citations": citations,
                    "subideaId": s["subideaId"],
                    "checkQuestion": s["checkQuestion"],
                    "solveSteps": s["solveSteps"],
                })

            supabase.table("topic_progress").upsert({
                "student_id": req.student_id,
                "topic_id": req.topic_id,
                "subidea_index": 0,
                "stage": "explain",
                "hints_used": 0,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()

            print(f"      /query timing -- append_messages={time.perf_counter() - t3:.2f}s total={time.perf_counter() - t0:.2f}s")
            return {"sessionId": session_id, "sections": sections_out}

        # Follow-up path (unchanged shape from before, just always tagged).
        if raw_answer == NO_CONTEXT_ANSWER or not chunks:
            append_session_message(session_id, "student", req.question)
            append_session_message(session_id, "ai", raw_answer, metadata={"tag": "Grounded Explanation", "citations": [], "isFollowUp": True})
            print(f"      /query timing -- append_messages={time.perf_counter() - t3:.2f}s total={time.perf_counter() - t0:.2f}s")
            return {"sessionId": session_id, "answer": raw_answer, "citations": []}

        answer, citations = renumber_inline_citations(raw_answer, chunks)

        metadata = {"tag": "Grounded Explanation", "citations": citations, "isFollowUp": True}
        student_metadata = None
        if req.subidea_id:
            # Validate against the topic's known set rather than trusting
            # the client outright -- a stale/invalid id (e.g. the topic's
            # sub-idea list changed mid-session) is dropped rather than
            # mis-tagging the follow-up.
            valid_subidea_ids = {s["subidea_id"] for s in get_existing_subideas(req.topic_id)}
            if req.subidea_id in valid_subidea_ids:
                metadata["subideaId"] = req.subidea_id
                student_metadata = {"subideaId": req.subidea_id}
        append_session_message(session_id, "student", req.question, metadata=student_metadata)
        append_session_message(session_id, "ai", answer, metadata=metadata)
        print(f"      /query timing -- append_messages={time.perf_counter() - t3:.2f}s total={time.perf_counter() - t0:.2f}s")
        return {"sessionId": session_id, "answer": answer, "citations": citations}
    except HTTPException:
        raise
    except Exception as exc:
        print("Query Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to answer the question") from exc


class SessionHistoryRequest(BaseModel):
    student_id: str
    topic_id: str


@app.post("/session/history")
async def session_history(req: SessionHistoryRequest):
    try:
        session_id = find_active_session(req.student_id, req.topic_id)
        if not session_id:
            return {"sessionId": None, "messages": []}

        messages_res = (
            supabase.table("session_messages")
            .select("message_text, metadata, timestamp")
            .eq("session_id", session_id)
            .eq("sender", "ai")
            .order("timestamp")
            .execute()
        )
        messages = [
            {
                "text": row["message_text"],
                **(row.get("metadata") or {}),
            }
            for row in (messages_res.data or [])
        ]
        return {"sessionId": session_id, "messages": messages}
    except Exception as exc:
        print("Session History Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to load session history") from exc


class TopicResumeRequest(BaseModel):
    student_id: str
    topic_id: str


@app.post("/topic/resume")
async def topic_resume(req: TopicResumeRequest):
    """Everything the topic page needs to land back exactly where a student
    left off: which sub-idea, which stage, how many hints already used, the
    already-generated sections (so a resume never re-triggers Gemini), and
    the current sub-idea's own chat transcript (each sub-idea's
    conversation is scoped to itself, not shown mixed with the others).
    Reads topic_progress directly rather than inferring a stage from the
    last session_messages tag -- that inference proved fragile (a runaway
    follow-up answer was once mistaken for a second completed explanation).

    Deliberately not TTL-gated like find_active_session/SESSION_TTL_HOURS --
    a student returning after a long break must still resume exactly, not
    get silently dropped into a fresh session because the TTL lapsed."""
    try:
        progress = get_topic_progress(req.student_id, req.topic_id)
        # Read-only -- a status check must never spend a Gemini call as a
        # side effect. If Explain hasn't run yet, there's nothing to resume
        # into anyway (sections comes back empty, same as today).
        subideas = get_existing_subideas(req.topic_id)

        latest_session = (
            supabase.table("sessions")
            .select("session_id")
            .eq("student_id", req.student_id)
            .eq("topic_id", req.topic_id)
            .eq("session_type", "mastery_loop")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        session_id = latest_session.data[0]["session_id"] if latest_session.data else None

        empty = {
            "sessionId": session_id,
            "subideaIndex": progress["subidea_index"],
            "stage": progress["stage"],
            "hintsUsed": progress["hints_used"],
            "totalSubideas": len(subideas),
            "sections": [],
            "currentMessages": [],
        }
        if not session_id:
            return empty

        rows = (
            supabase.table("session_messages")
            .select("sender, message_text, metadata, timestamp")
            .eq("session_id", session_id)
            .order("timestamp")
            .execute()
        ).data or []

        # The original per-sub-idea explanation rows, in generation order --
        # NOT follow-ups, hints, or retries, which share the "Grounded
        # Explanation"/other tags but aren't the base explanation content.
        sections = [
            {
                "heading": (row.get("metadata") or {}).get("heading"),
                "body": row["message_text"],
                "citations": (row.get("metadata") or {}).get("citations") or [],
                "subideaId": (row.get("metadata") or {}).get("subideaId"),
                "checkQuestion": (row.get("metadata") or {}).get("checkQuestion"),
                "solveSteps": (row.get("metadata") or {}).get("solveSteps"),
            }
            for row in rows
            if row["sender"] == "ai"
            and (row.get("metadata") or {}).get("tag") == "Grounded Explanation"
            and not (row.get("metadata") or {}).get("isFollowUp")
        ]

        current_subidea_id = (
            subideas[progress["subidea_index"]]["subidea_id"]
            if subideas and progress["subidea_index"] < len(subideas)
            else None
        )
        current_messages = [
            {"sender": row["sender"], "text": row["message_text"], **(row.get("metadata") or {})}
            for row in rows
            if current_subidea_id and (row.get("metadata") or {}).get("subideaId") == current_subidea_id
        ]

        return {
            "sessionId": session_id,
            "subideaIndex": progress["subidea_index"],
            "stage": progress["stage"],
            "hintsUsed": progress["hints_used"],
            "totalSubideas": len(subideas),
            "sections": sections,
            "currentMessages": current_messages,
        }
    except Exception as exc:
        print("Topic Resume Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to load topic progress") from exc


class MistakeTagStat(BaseModel):
    tag: str
    label: str
    count: int


class InstructorInsightRequest(BaseModel):
    instructor_id: str
    topic_id: str
    topic_name: str
    stuck_count: int
    mistake_breakdown: List[MistakeTagStat]


@app.post("/instructor/insight/generate")
async def generate_instructor_insight(req: InstructorInsightRequest):
    if not req.mistake_breakdown:
        raise HTTPException(status_code=422, detail="No mistake-tag data available for this topic yet")

    stat_snapshot = [stat.model_dump() for stat in req.mistake_breakdown]

    try:
        existing = (
            supabase.table("instructor_topic_suggestions")
            .select("suggestion_text, stat_snapshot, generated_at")
            .eq("topic_id", req.topic_id)
            .maybe_single()
            .execute()
        )
        # .maybe_single() returns None (not a response with data=None) when zero
        # rows match, in the installed supabase-py version -- guard both.
        if existing and existing.data and existing.data.get("stat_snapshot") == stat_snapshot:
            # Nothing has changed since the cached suggestion was generated --
            # serve it back rather than spending a Gemini call to re-derive
            # the exact same phrasing.
            return {
                "topicId": req.topic_id,
                "suggestionText": existing.data["suggestion_text"],
                "generatedAt": existing.data["generated_at"],
                "statSnapshot": stat_snapshot,
            }

        breakdown_lines = "\n".join(
            f"- {stat.label}: {stat.count} of {req.stuck_count} stuck students"
            for stat in req.mistake_breakdown
        )
        prompt = f"""You are helping a college instructor understand why students are stuck on one
topic, based on real mistake-pattern data drawn from their explanations.

Topic: {req.topic_name}
Stuck students (2+ retry attempts, not yet mastered): {req.stuck_count}
Most common mistake types among those students, most frequent first:
{breakdown_lines}

Write ONE short, concrete, actionable sentence (max 30 words) telling the instructor what to
do about this before their next class session. Name the specific misunderstanding you infer
from the topic and mistake type -- do not just restate the numbers. Do not hedge ("might",
"could", "may want to") -- phrase it as a direct recommendation. Do not repeat the raw counts;
the instructor already sees those separately.

Return ONLY strict JSON: {{"suggestion": "..."}}"""

        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        parsed = parse_gemini_json(response)
        suggestion = parsed.get("suggestion")
        if not isinstance(suggestion, str) or not suggestion.strip():
            raise HTTPException(status_code=502, detail="AI returned an invalid suggestion")
        suggestion = suggestion.strip()
        generated_at = datetime.now(timezone.utc).isoformat()

        supabase.table("instructor_topic_suggestions").upsert({
            "topic_id": req.topic_id,
            "suggestion_text": suggestion,
            "stat_snapshot": stat_snapshot,
            "generated_by": req.instructor_id,
            "generated_at": generated_at,
        }).execute()

        return {
            "topicId": req.topic_id,
            "suggestionText": suggestion,
            "generatedAt": generated_at,
            "statSnapshot": stat_snapshot,
        }
    except HTTPException:
        raise
    except ClientError as exc:
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Gemini quota exceeded for today -- try again later") from exc
        raise HTTPException(status_code=502, detail="AI request failed") from exc
    except Exception as exc:
        print("Instructor Insight Generation Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to generate teaching insight") from exc
