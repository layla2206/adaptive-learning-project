import os
import uuid
import time
import math
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import boto3
from supabase import create_client, Client
import PyPDF2
from google import genai
from google.genai import types
from answer_generation import generate_answer
from citations import map_chunk, map_citations

# Load .env from the parent directory — this repo keeps real config in
# .env (not .env.local, which doesn't exist here), so point dotenv at that.
load_dotenv(dotenv_path="../.env")

app = FastAPI(title="Adaptive Learning Backend API")

# Allow requests from the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


def generate_grounded_answer(question: str, chunks: List[dict]) -> str:
    """Generate an answer using the production Gemini client and retrieved context."""
    return generate_answer(question, chunks, gemini_client)


def parse_document(file_bytes: bytes, file_type: str) -> str:
    """Extracts text from PDF or raw text files."""
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


def _normalize(vector: List[float]) -> List[float]:
    """gemini-embedding-001 requires manual L2 normalization when requesting a
    non-default (non-3072) output_dimensionality — unlike gemini-embedding-2,
    it doesn't do this for you."""
    norm = math.sqrt(sum(x * x for x in vector))
    if norm == 0:
        return vector
    return [x / norm for x in vector]


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
    BATCH_SIZE = 50
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        response = gemini_client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=batch,
            config=types.EmbedContentConfig(
                output_dimensionality=EMBEDDING_DIMENSIONS,
                task_type=task_type,
            ),
        )
        for emb in response.embeddings:
            results.append(_normalize(emb.values))

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
        import re
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
            "file_type": extension.replace(".", "") or "file"
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
    r2Key: str

@app.delete("/upload")
async def delete_document(req: DeleteRequest):
    try:
        doc_id = req.documentId[:10]
        
        # 1. Delete chunks
        supabase.table("chunks").delete().eq("document_id", doc_id).execute()
        
        # 2. Delete document
        supabase.table("documents").delete().eq("document_id", doc_id).execute()
        
        # 3. Delete from R2
        s3_client.delete_object(Bucket=r2_bucket_name, Key=req.r2Key)
        
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
        
        # Call Gemini to generate 2 MCQ questions
        prompt = f"""
        Based on the following educational content, generate 2 multiple-choice diagnostic questions to test a student's understanding.
        Return ONLY a JSON array of objects with the exact following schema, nothing else (no markdown blocks, no intro):
        [
          {{
            "question_text": "The question here?",
            "options": ["A", "B", "C", "D"],
            "correct_answer": "A",
            "difficulty": "Medium"
          }}
        ]
        
        Content:
        {context_text}
        """
        
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
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
        topic_id = None
        
        results_to_insert = []
        for ans in req.answers:
            # Check answer
            q_res = supabase.table("diagnostic_questions").select("*").eq("question_id", ans.question_id).single().execute()
            if not q_res.data:
                continue
                
            q_data = q_res.data
            topic_id = q_data["topic_id"]
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
            
        # Update profile
        if topic_id and total > 0:
            score_pct = (correct_count / total) * 100
            level = "Beginner"
            if score_pct == 100:
                level = "Advanced"
            elif score_pct > 0:
                level = "Intermediate"
                
            supabase.table("student_profiles").upsert({
                "student_id": req.student_id,
                "topic_id": topic_id,
                "mastery_percent": score_pct,
                "level": level
            }).execute()
            
        return {"success": True, "score": f"{correct_count}/{total}"}
    except Exception as e:
        print("Submit Diagnostic Error:", e)
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# DEV PHASE 2: ADAPTIVE LOOP API
# ==========================================

SESSION_TTL_HOURS = 4
MASTERY_PASS_THRESHOLD = 70


def short_id(prefix: str, length: int = 15) -> str:
    return f"{prefix}{uuid.uuid4().hex}"[:length]


def level_for_mastery(score: float) -> str:
    if score == 100:
        return "Advanced"
    if score > 0:
        return "Intermediate"
    return "Beginner"


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


def get_or_create_session(student_id: str, topic_id: str, session_id: Optional[str] = None) -> str:
    if session_id:
        existing = supabase.table("sessions").select("session_id").eq("session_id", session_id).eq("student_id", student_id).maybe_single().execute()
        if existing.data:
            return session_id

    latest = (
        supabase.table("sessions")
        .select("session_id, started_at")
        .eq("student_id", student_id)
        .eq("topic_id", topic_id)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    if latest.data:
        started_at = latest.data[0].get("started_at")
        if started_at:
            try:
                started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                if started.tzinfo is None:
                    started = started.replace(tzinfo=timezone.utc)
                age_hours = (datetime.now(timezone.utc) - started).total_seconds() / 3600
                if age_hours < SESSION_TTL_HOURS:
                    return latest.data[0]["session_id"]
            except (TypeError, ValueError):
                pass

    new_session_id = short_id("ses")
    supabase.table("sessions").insert({
        "session_id": new_session_id,
        "student_id": student_id,
        "topic_id": topic_id,
    }).execute()
    return new_session_id


def append_session_message(session_id: str, sender: str, text: str):
    supabase.table("session_messages").insert({
        "message_id": short_id("msg", 20),
        "session_id": session_id,
        "sender": sender,
        "message_text": text,
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


def format_session_context(messages: List[dict]) -> str:
    if not messages:
        return "No prior conversation context."
    return "\n".join(f"{message.get('sender', 'unknown')}: {message.get('message_text', '')}" for message in messages)


class MasteryCheckRequest(BaseModel):
    student_id: str
    topic_id: str
    session_id: Optional[str] = None
    explanation: Optional[str] = None
    solution: Optional[str] = None


@app.post("/mastery/check")
async def check_mastery(req: MasteryCheckRequest):
    explanation = req.explanation.strip() if req.explanation else None
    solution = req.solution.strip() if req.solution else None
    if not explanation and not solution:
        raise HTTPException(status_code=400, detail="At least one of explanation or solution is required")

    try:
        session_id = get_or_create_session(req.student_id, req.topic_id, req.session_id)
        chunks_res = supabase.table("chunks").select("chunk_text").eq("topic_id", req.topic_id).limit(8).execute()
        if not chunks_res.data:
            raise HTTPException(status_code=422, detail="No learning content found for this topic")

        recent_messages = get_recent_session_messages(session_id)
        checks = (
            supabase.table("mastery_checks")
            .select("mastery_id", count="exact", head=True)
            .eq("student_id", req.student_id)
            .eq("topic_id", req.topic_id)
            .execute()
        )
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
Return ONLY strict JSON with this exact shape:
{{"explain_score": 0, "solve_score": null, "feedback": "1-2 sentences to the student", "mistake_tag": "concept_confusion|calculation_error|incomplete|off_topic|none"}}

Learning content:
{chr(10).join(chunk["chunk_text"] for chunk in chunks_res.data)}

Prior conversation context:
{format_session_context(recent_messages)}

Student submissions:
{chr(10).join(f"{label}: {text}" for _, label, text in submissions)}"""

        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
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
            "question_text": label,
            "student_answer": text,
            "score": explain_score if score_field == "explain_score" else solve_score,
            "mistake_tag": mistake_tag,
        } for score_field, label, text in submissions]
        supabase.table("student_answers").insert(answer_rows).execute()
        supabase.table("mastery_checks").insert({
            "mastery_id": short_id("mst"),
            "student_id": req.student_id,
            "topic_id": req.topic_id,
            "attempt_number": attempt_number,
            "explain_score": explain_score,
            "solve_score": solve_score,
            "overall_mastery": overall_mastery,
            "passed": passed,
        }).execute()
        supabase.table("student_profiles").upsert({
            "student_id": req.student_id,
            "topic_id": req.topic_id,
            "mastery_percent": overall_mastery,
            "level": level_for_mastery(overall_mastery),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        pending = (
            supabase.table("retry_attempts")
            .select("retry_id")
            .eq("student_id", req.student_id)
            .eq("topic_id", req.topic_id)
            .is_("result", "null")
            .order("attempted_at", desc=True)
            .limit(1)
            .execute()
        )
        if pending.data:
            supabase.table("retry_attempts").update({"result": "Passed" if passed else "Failed"}).eq("retry_id", pending.data[0]["retry_id"]).execute()
        append_session_message(session_id, "ai", feedback)
        return {
            "sessionId": session_id,
            "overallMastery": overall_mastery,
            "passed": passed,
            "feedback": feedback,
            "explainScore": explain_score,
            "solveScore": solve_score,
        }
    except HTTPException:
        raise
    except Exception as exc:
        print("Mastery Check Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to evaluate mastery") from exc


class RetryGenerateRequest(BaseModel):
    student_id: str
    topic_id: str
    session_id: Optional[str] = None


@app.post("/retry/generate")
async def generate_retry(req: RetryGenerateRequest):
    try:
        session_id = get_or_create_session(req.student_id, req.topic_id, req.session_id)
        retries = (
            supabase.table("retry_attempts")
            .select("retry_id", count="exact", head=True)
            .eq("student_id", req.student_id)
            .eq("topic_id", req.topic_id)
            .execute()
        )
        attempt_number = (retries.count or 0) + 1
        format_used = "Worked Example" if attempt_number % 2 == 1 else "Hands-on Task"
        chunks_res = (
            supabase.table("chunks")
            .select("chunk_id, document_id, chunk_text, page_number, documents(file_name)")
            .eq("topic_id", req.topic_id)
            .limit(8)
            .execute()
        )
        if not chunks_res.data:
            raise HTTPException(status_code=422, detail="No learning content found for this topic")

        chunks = []
        for chunk in chunks_res.data:
            document = chunk.get("documents") or {}
            chunks.append(map_chunk({
                **chunk,
                "document_title": document.get("file_name"),
            }))

        format_instruction = (
            "Produce a fully worked, step-by-step example solved using the topic's method."
            if format_used == "Worked Example"
            else "Produce a short guided exercise for the student to attempt, explaining the underlying idea first."
        )
        prompt = f"""Create a retry intervention for the topic using only the learning content below.
Format: {format_used}. {format_instruction}
Return ONLY strict JSON: {{"content": "...", "citedChunkIds": ["chunk_id", ...]}}
Only cite chunk IDs included below.

Learning content:
{chr(10).join(f"[{chunk['chunk_id']}] {chunk['chunk_text']}" for chunk in chunks)}"""
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        generated = parse_gemini_json(response)
        content = generated.get("content")
        cited_ids = generated.get("citedChunkIds", [])
        valid_ids = {chunk["chunk_id"] for chunk in chunks}
        if not isinstance(content, str) or not content.strip() or not isinstance(cited_ids, list):
            raise HTTPException(status_code=502, detail="AI returned invalid retry content")
        cited_ids = [chunk_id for chunk_id in cited_ids if isinstance(chunk_id, str) and chunk_id in valid_ids]
        citations = map_citations(chunks, cited_ids)
        supabase.table("retry_attempts").insert({
            "retry_id": short_id("rty"),
            "student_id": req.student_id,
            "topic_id": req.topic_id,
            "attempt_number": attempt_number,
            "format_used": format_used,
            "result": None,
        }).execute()
        append_session_message(session_id, "ai", content)
        return {
            "sessionId": session_id,
            "format": format_used,
            "content": content,
            "citedChunkIds": cited_ids,
            "chunks": chunks,
            "citations": citations,
        }
    except HTTPException:
        raise
    except Exception as exc:
        print("Retry Generation Error:", exc)
        raise HTTPException(status_code=500, detail="Unable to generate retry content") from exc
