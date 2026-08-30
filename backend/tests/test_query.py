"""Tests for POST /query -- the free-form "ask a question" endpoint, which
had zero test coverage before this pass. Real retrieval (retrieval.py's
embed_content -> Supabase match_chunks RPC) can't be driven deterministically
from a test without a real, known embedding space, so the happy-path and
429 tests monkeypatch retrieve_context itself with a controlled fake chunk --
everything downstream of that (generate_answer, citation renumbering,
session persistence) is real. The empty-topic test instead exercises real
retrieval end-to-end (with embeddings mocked), since a zero-chunk topic
returns no matches from match_chunks regardless of the query vector."""

import main as app_module
from google.genai.errors import ClientError
from main import supabase


FAKE_CHUNK = {
    "chunk_id": "fake-chunk-001",
    "chunk_text": "Hash tables map keys to buckets using a hash function.",
    "similarity": 0.95,
    "document_title": "Pytest Fixture Doc",
    "location": 1,
}


async def _fake_retrieve_context(*args, **kwargs):
    return [dict(FAKE_CHUNK)]


def test_empty_question_returns_no_context_answer_with_no_gemini_call(client, fresh_student_id, seeded_topic):
    res = client.post(
        "/query",
        json={
            "student_id": fresh_student_id,
            "course_id": seeded_topic["course_id"],
            "topic_id": seeded_topic["topic_id"],
            "question": "   ",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["answer"] == "I don't have enough context to answer that question."
    assert body["citations"] == []


def test_zero_content_topic_returns_no_context_answer(client, mock_embeddings, fresh_student_id, seeded_topic, empty_topic_id):
    res = client.post(
        "/query",
        json={
            "student_id": fresh_student_id,
            "course_id": seeded_topic["course_id"],
            "topic_id": empty_topic_id,
            "question": "What is a hash table?",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["answer"] == "I don't have enough context to answer that question."
    assert body["citations"] == []


def test_grounded_answer_returns_renumbered_citations_and_persists_history(
    client, mock_gemini, fresh_student_id, seeded_topic, monkeypatch
):
    monkeypatch.setattr(app_module, "retrieve_context", _fake_retrieve_context)
    mock_gemini.returns("Hash tables use a hash function to map keys to buckets. [fake-chunk-001]")

    res = client.post(
        "/query",
        json={
            "student_id": fresh_student_id,
            "course_id": seeded_topic["course_id"],
            "topic_id": seeded_topic["topic_id"],
            "question": "How do hash tables work?",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert "[1]" in body["answer"]  # real chunk_id renumbered to the frontend's [1] marker
    assert len(body["citations"]) == 1
    assert body["citations"][0]["chunk_id"] == "fake-chunk-001"
    assert body["citations"][0]["mark"] == "[1]"

    messages = (
        supabase.table("session_messages")
        .select("sender, message_text, metadata")
        .eq("session_id", body["sessionId"])
        .order("timestamp")
        .execute()
    )
    assert [m["sender"] for m in messages.data] == ["student", "ai"]
    assert messages.data[1]["metadata"]["tag"] == "Grounded Explanation"
    assert len(messages.data[1]["metadata"]["citations"]) == 1


def test_gemini_429_during_answer_generation_returns_429_not_502(
    client, mock_gemini, fresh_student_id, seeded_topic, monkeypatch
):
    monkeypatch.setattr(app_module, "retrieve_context", _fake_retrieve_context)
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))

    res = client.post(
        "/query",
        json={
            "student_id": fresh_student_id,
            "course_id": seeded_topic["course_id"],
            "topic_id": seeded_topic["topic_id"],
            "question": "How do hash tables work?",
        },
    )
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()


def test_full_explanation_returns_sections_check_question_and_solve_steps(
    client, mock_gemini, fresh_student_id, seeded_topic, monkeypatch
):
    monkeypatch.setattr(app_module, "retrieve_context", _fake_retrieve_context)
    mock_gemini.returns(
        '{"sections": ['
        '{"heading": "Motivation", "body": "Hash tables solve slow lookup [fake-chunk-001]."},'
        '{"heading": "The Mechanism", "body": "A hash function maps keys to buckets [fake-chunk-001]."}'
        '], "checkQuestion": "Why is a hash table lookup faster than scanning an unsorted array?", '
        '"solveSteps": ["Hash the key", "Go to that bucket", "Check for the value"]}'
    )

    res = client.post(
        "/query",
        json={
            "student_id": fresh_student_id,
            "course_id": seeded_topic["course_id"],
            "topic_id": seeded_topic["topic_id"],
            "question": "Explain Hash Tables from the ground up, starting from the fundamentals.",
            "full_explanation": True,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert "### Motivation" in body["answer"]
    assert "### The Mechanism" in body["answer"]
    assert "[1]" in body["answer"]  # citations still renumbered, unchanged from the plain-text path
    assert body["checkQuestion"] == "Why is a hash table lookup faster than scanning an unsorted array?"
    assert body["solveSteps"] == ["Hash the key", "Go to that bucket", "Check for the value"]

    messages = (
        supabase.table("session_messages")
        .select("metadata")
        .eq("session_id", body["sessionId"])
        .eq("sender", "ai")
        .execute()
    )
    assert messages.data[0]["metadata"]["checkQuestion"] == body["checkQuestion"]
    assert messages.data[0]["metadata"]["solveSteps"] == body["solveSteps"]


def test_full_explanation_omitted_still_uses_plain_answer_path(
    client, mock_gemini, fresh_student_id, seeded_topic, monkeypatch
):
    """fullExplanation defaults to False -- a normal follow-up question must
    keep going through generate_answer, not the structured-JSON path."""
    monkeypatch.setattr(app_module, "retrieve_context", _fake_retrieve_context)
    mock_gemini.returns("A plain-text answer [fake-chunk-001].")

    res = client.post(
        "/query",
        json={
            "student_id": fresh_student_id,
            "course_id": seeded_topic["course_id"],
            "topic_id": seeded_topic["topic_id"],
            "question": "What about a follow-up question?",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["answer"] == "A plain-text answer [1]."
    assert body["checkQuestion"] is None
    assert body["solveSteps"] is None
