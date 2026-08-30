"""Tests for POST/DELETE /upload -- the document ingestion pipeline (R2
storage, text parsing, chunking, embedding, and chunk persistence) that had
zero test coverage before this pass. Uses the real dev R2 bucket and
Supabase project (matching this whole suite's convention) with embeddings
mocked via mock_embeddings so this costs zero Gemini quota."""

import io
import uuid
from typing import Optional

from main import supabase


def _upload_txt(client, seeded_topic, seeded_instructor_id, text: str, filename: Optional[str] = None):
    filename = filename or f"pytest-upload-{uuid.uuid4().hex[:6]}.txt"
    return client.post(
        "/upload",
        files={"file": (filename, io.BytesIO(text.encode()), "text/plain")},
        data={
            "courseId": seeded_topic["course_id"],
            "instructorId": seeded_instructor_id,
            "topicId": seeded_topic["topic_id"],
        },
    )


def test_upload_chunks_and_embeds_a_text_file(client, mock_embeddings, seeded_topic, seeded_instructor_id):
    text = "Hash tables map keys to buckets using a hash function. " * 40
    res = _upload_txt(client, seeded_topic, seeded_instructor_id, text)
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["chunksInserted"] > 0
    document_id = body["documentId"]

    try:
        chunks = (
            supabase.table("chunks")
            .select("chunk_id, embedding, topic_id")
            .eq("document_id", document_id)
            .execute()
        )
        assert len(chunks.data) == body["chunksInserted"]
        assert all(c["topic_id"] == seeded_topic["topic_id"] for c in chunks.data)
        assert all(c["embedding"] is not None for c in chunks.data)
    finally:
        client.request("DELETE", "/upload", json={"documentId": document_id})


def test_upload_unsupported_file_type_still_succeeds_with_zero_chunks(client, mock_embeddings, seeded_topic, seeded_instructor_id):
    """parse_document() raises ValueError for an unrecognized extension, but
    upload_document() swallows that (main.py's own comment: "Warning: Could
    not extract text...") and still creates the document record -- a missing
    lecture PDF's text extraction failing shouldn't crash the whole upload."""
    res = client.post(
        "/upload",
        files={"file": ("pytest-unsupported.xyz", io.BytesIO(b"binary-ish content"), "application/octet-stream")},
        data={
            "courseId": seeded_topic["course_id"],
            "instructorId": seeded_instructor_id,
            "topicId": seeded_topic["topic_id"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    try:
        assert body["success"] is True
        assert body["chunksInserted"] == 0
    finally:
        client.request("DELETE", "/upload", json={"documentId": body["documentId"]})


def test_upload_missing_file_returns_422(client, seeded_topic, seeded_instructor_id):
    res = client.post(
        "/upload",
        data={
            "courseId": seeded_topic["course_id"],
            "instructorId": seeded_instructor_id,
            "topicId": seeded_topic["topic_id"],
        },
    )
    assert res.status_code == 422


def test_delete_cascades_chunks_and_removes_the_document(client, mock_embeddings, seeded_topic, seeded_instructor_id):
    # Uploads real content into the shared live topic (this suite's whole
    # convention -- see conftest.py's seeded_topic docstring), so the DELETE
    # below MUST run even if an assertion above it fails, or this text stays
    # stranded in real course content forever. Confirmed as a real incident,
    # not a hypothetical one: a prior run without this try/finally left three
    # of these uploads (plus two "Pytest Empty Topic" rows from a different
    # fixture's own interrupted teardown) live in top-hash1, and a student
    # asking about Hash Tables got this exact BST filler text back.
    text = "Binary search trees keep left children smaller and right children larger. " * 30
    upload_res = _upload_txt(client, seeded_topic, seeded_instructor_id, text)
    document_id = upload_res.json()["documentId"]
    try:
        assert upload_res.json()["chunksInserted"] > 0

        delete_res = client.request("DELETE", "/upload", json={"documentId": document_id})
        assert delete_res.status_code == 200
        assert delete_res.json()["success"] is True

        doc_row = supabase.table("documents").select("document_id").eq("document_id", document_id).execute()
        assert doc_row.data == []
        chunk_rows = supabase.table("chunks").select("chunk_id").eq("document_id", document_id).execute()
        assert chunk_rows.data == []  # ON DELETE CASCADE (delete_cascade_migration.sql), not a second explicit delete
    finally:
        client.request("DELETE", "/upload", json={"documentId": document_id})


def test_delete_nonexistent_document_is_a_no_op_success(client):
    """Documented existing behavior (see main.py's .maybe_single() guard
    comment), not a bug: deleting an id that never existed still returns
    {"success": true} rather than a 404, since there's nothing to reconcile
    on either R2 or the documents table."""
    res = client.request("DELETE", "/upload", json={"documentId": "no-such-doc"})
    assert res.status_code == 200
    assert res.json()["success"] is True
