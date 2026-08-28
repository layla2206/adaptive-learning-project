"""
One-off backfill: finds documents.rows with no chunks (uploaded before the
gemini-embedding-001 fix, or before match_chunks existed) and re-runs the
same parse -> chunk -> embed pipeline /upload uses, reusing main.py's
functions directly rather than duplicating them.

documents never stored its R2 key, so each file is located by listing the
course's R2 prefix and matching the sanitized filename suffix — same
sanitization /upload applies at write time.

Run from backend/, with the venv active:
    ../.venv/Scripts/python.exe scripts/reembed_missing_chunks.py [--dry-run]
"""
import sys
import os
import re
import time
import uuid
import argparse
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.genai.errors import ClientError  # noqa: E402
from main import supabase, s3_client, r2_bucket_name, parse_document, chunk_text, generate_embeddings  # noqa: E402

# Free-tier Gemini embedding quota is 100 requests/minute, on a rolling
# window — one 60s backoff isn't always enough (a doc needing 2-3 batches,
# or one that lands right at the window boundary, can still be over quota
# after a single retry). Keep retrying with the same backoff until the
# window actually clears rather than giving up after one attempt.
THROTTLE_SECONDS = 2
RATE_LIMIT_BACKOFF_SECONDS = 60
MAX_RATE_LIMIT_RETRIES = 8


def embed_with_backoff(texts):
    for attempt in range(MAX_RATE_LIMIT_RETRIES + 1):
        try:
            return generate_embeddings(texts)
        except ClientError as e:
            if e.code != 429 or attempt == MAX_RATE_LIMIT_RETRIES:
                raise
            print(f"      rate limited — waiting {RATE_LIMIT_BACKOFF_SECONDS}s before retrying (attempt {attempt + 1}/{MAX_RATE_LIMIT_RETRIES})...")
            time.sleep(RATE_LIMIT_BACKOFF_SECONDS)


def sanitize(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", name)


def find_r2_key(course_id: str, file_name: str) -> Optional[str]:
    sanitized = sanitize(file_name)
    prefix = f"courses/{course_id}/"
    resp = s3_client.list_objects_v2(Bucket=r2_bucket_name, Prefix=prefix)
    for obj in resp.get("Contents", []):
        if obj["Key"].endswith(sanitized):
            return obj["Key"]
    return None


def main(dry_run: bool = False):
    docs = supabase.table("documents").select("document_id, course_id, topic_id, file_name, file_type").execute().data or []
    chunked_ids = {c["document_id"] for c in (supabase.table("chunks").select("document_id").execute().data or [])}
    missing = [d for d in docs if d["document_id"] not in chunked_ids]

    print(f"{len(docs)} documents total, {len(missing)} missing chunks.\n")

    ok, skipped = 0, 0
    for doc in missing:
        label = f"{doc['document_id']} ({doc['file_name']})"

        key = find_r2_key(doc["course_id"], doc["file_name"])
        if not key:
            print(f"SKIP  {label} — no matching object found in R2 under courses/{doc['course_id']}/")
            skipped += 1
            continue

        try:
            obj = s3_client.get_object(Bucket=r2_bucket_name, Key=key)
            file_bytes = obj["Body"].read()
        except Exception as e:
            print(f"SKIP  {label} — R2 fetch failed: {e}")
            skipped += 1
            continue

        try:
            extracted_text = parse_document(file_bytes, doc["file_type"] or "")
        except Exception as e:
            print(f"SKIP  {label} — parse failed: {e}")
            skipped += 1
            continue

        if not extracted_text:
            print(f"SKIP  {label} — no extractable text")
            skipped += 1
            continue

        chunks = chunk_text(extracted_text)
        if not chunks:
            print(f"SKIP  {label} — chunker produced nothing")
            skipped += 1
            continue

        if dry_run:
            print(f"WOULD EMBED  {label} — {len(chunks)} chunks")
            ok += 1
            continue

        texts = [c["text"] for c in chunks]
        embeddings = embed_with_backoff(texts)
        chunk_records = [
            {
                "chunk_id": str(uuid.uuid4())[:15],
                "document_id": doc["document_id"],
                "topic_id": doc["topic_id"],
                "page_number": c["pageNumber"],
                "chunk_text": c["text"],
                "embedding": embeddings[i],
            }
            for i, c in enumerate(chunks)
        ]
        supabase.table("chunks").insert(chunk_records).execute()
        print(f"OK    {label} — {len(chunk_records)} chunks")
        ok += 1
        time.sleep(THROTTLE_SECONDS)

    print(f"\nDone. {ok} embedded, {skipped} skipped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Report what would happen without writing chunks")
    args = parser.parse_args()
    main(dry_run=args.dry_run)