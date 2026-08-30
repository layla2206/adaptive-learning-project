"""Regression test for the cross-topic content leakage incident: a Hash
Tables hands-on task once came back citing binary-search-tree content. The
real cause was a leftover pytest fixture polluting top-hash1's live data
(see test_upload.py's fix), not a scoping defect in /retry/generate's own
chunk query -- but this test still needs to exist so a future scoping
regression (a dropped .eq("topic_id", ...) filter, a wrong variable, etc.)
gets caught immediately rather than only showing up as contaminated data in
production again.

Seeds a second, unrelated topic with distinctive real content, then asserts
a generation request scoped to seeded_topic never surfaces it.
"""

import uuid

import pytest

from main import supabase, EMBEDDING_DIMENSIONS

FOREIGN_MARKER_TEXT = "Zzyzx-marker-only-the-foreign-topic-should-ever-surface-this-text."


@pytest.fixture
def foreign_topic_with_content(seeded_topic, seeded_instructor_id):
    """A second, real topic (own course/document/chunk) with content that
    must never appear in a generation request scoped to seeded_topic."""
    topic_id = f"pt{uuid.uuid4().hex[:6]}"
    document_id = f"doc{uuid.uuid4().hex[:7]}"
    chunk_id = str(uuid.uuid4())[:15]

    supabase.table("topics").insert(
        {"topic_id": topic_id, "course_id": seeded_topic["course_id"], "topic_name": "Pytest Foreign Topic", "sort_order": 999}
    ).execute()
    supabase.table("documents").insert({
        "document_id": document_id,
        "instructor_id": seeded_instructor_id,
        "course_id": seeded_topic["course_id"],
        "topic_id": topic_id,
        "file_name": "pytest-foreign-topic.txt",
        "file_type": "txt",
        "r2_key": f"pytest/{document_id}",
    }).execute()
    supabase.table("chunks").insert({
        "chunk_id": chunk_id,
        "document_id": document_id,
        "topic_id": topic_id,
        "page_number": 1,
        "chunk_text": FOREIGN_MARKER_TEXT,
        "embedding": [0.0] * EMBEDDING_DIMENSIONS,
    }).execute()

    yield {"topic_id": topic_id, "document_id": document_id, "chunk_id": chunk_id}

    supabase.table("chunks").delete().eq("document_id", document_id).execute()
    supabase.table("documents").delete().eq("document_id", document_id).execute()
    supabase.table("topics").delete().eq("topic_id", topic_id).execute()


def test_retry_generate_never_cites_a_chunk_from_a_different_topic(
    client, mock_gemini, fresh_student_id, seeded_topic, foreign_topic_with_content
):
    mock_gemini.returns('{"content": "A worked example with a claim [chunk-id].", "citedChunkIds": []}')
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 200
    body = res.json()

    returned_chunk_ids = {c["chunk_id"] for c in body["chunks"]}
    assert foreign_topic_with_content["chunk_id"] not in returned_chunk_ids
    assert all(FOREIGN_MARKER_TEXT not in c["chunk_text"] for c in body["chunks"])
    assert all(FOREIGN_MARKER_TEXT not in (c.get("excerpt") or "") for c in body["citations"])
