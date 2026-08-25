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

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[dict]:
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
            last_space = chunk_str.rfind(' ')
            last_newline = chunk_str.rfind('\n')
            split_point = max(last_space, last_newline)
            if split_point > chunk_size // 2:  # Don't split too early
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
