import os
import uuid
import time
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import boto3
from supabase import create_client, Client
import PyPDF2
from google import genai

# Load .env.local from the parent directory
load_dotenv(dotenv_path="../.env.local")

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
    
    return text

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

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Generates embeddings using Google Gemini text-embedding-004."""
    if not texts:
        return []
    
    # Gemini batchEmbedContents analog using Python SDK
    results = []
    BATCH_SIZE = 50
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        # In genai SDK, embed_content can take a list of strings
        response = gemini_client.models.embed_content(
            model='text-embedding-004',
            contents=batch
        )
        # Response contains embeddings list
        for emb in response.embeddings:
            results.append(emb.values)
            
    return results


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
        unique_id = f"doc-{str(uuid.uuid4())[:8]}"
        
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
            "documentId": unique_id,
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

@app.get("/profile/{student_id}")
async def get_student_profile(student_id: str):
    try:
        # Fetch enrolled courses
        enrolls = supabase.table("enrollments").select("course_id").eq("student_id", student_id).execute()
        if not enrolls.data:
            return {"subjects": [], "userProfile": {"name": "Student", "streakDays": 0, "totalXp": 0, "week": []}}

        course_ids = [e["course_id"] for e in enrolls.data]
        
        # Fetch courses
        courses_res = supabase.table("courses").select("*").in_("course_id", course_ids).execute()
        
        # Fetch topics for these courses
        topics_res = supabase.table("topics").select("*").in_("course_id", course_ids).execute()
        
        # Fetch student mastery profiles
        profiles_res = supabase.table("student_profiles").select("*").eq("student_id", student_id).execute()
        profile_map = {p["topic_id"]: p for p in profiles_res.data} if profiles_res.data else {}
        
        subjects = []
        for course in courses_res.data:
            course_topics = [t for t in topics_res.data if t["course_id"] == course["course_id"]]
            
            topics_out = []
            for t in course_topics:
                sp = profile_map.get(t["topic_id"])
                pct = float(sp["mastery_percent"]) if sp and sp.get("mastery_percent") else 0
                state = "locked"
                if pct > 90:
                    state = "mastered"
                elif pct > 0 or sp:
                    state = "in-progress"
                    
                topics_out.append({
                    "id": t["topic_id"],
                    "name": t["topic_name"],
                    "state": state,
                    "progressPct": pct
                })
                
            subjects.append({
                "id": course["course_id"],
                "name": course["course_name"],
                "summary": "Generated summary...",
                "building": "citadel", # Mock for now
                "topics": topics_out
            })
            
        # Basic student info
        student_res = supabase.table("students").select("*").eq("student_id", student_id).execute()
        student_name = student_res.data[0]["name"] if student_res.data else "Student"

        # Return identical structure to data.ts
        return {
            "subjects": subjects,
            "userProfile": {
                "name": student_name,
                "streakDays": 1,
                "totalXp": 100,
                "week": [
                    {"label": "M", "state": "done"},
                    {"label": "T", "state": "done"},
                    {"label": "W", "state": "done"},
                    {"label": "T", "state": "done"},
                    {"label": "F", "state": "today"},
                    {"label": "S", "state": "upcoming"},
                    {"label": "S", "state": "upcoming"}
                ]
            }
        }
    except Exception as e:
        print("Get Profile Error:", e)
        raise HTTPException(status_code=500, detail=str(e))

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
