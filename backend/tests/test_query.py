"""Tests for POST /query -- the free-form "ask a question" endpoint.

The full-explanation path still fetches the topic's real chunks directly
from the `chunks` table (it needs the whole topic's content in one call to
ground every sub-idea, not just whatever's closest to a generic "explain
this" query -- see the comment in main.py). The follow-up path, however,
goes back through real embedding-based retrieval (retrieve_context),
anchored on the current sub-idea's label when given -- so these tests
monkeypatch retrieval.py's own Supabase client (the RPC call, same boundary
test_retrieval.py mocks at) to make the follow-up path's chunk set
deterministic, plus the mock_embeddings fixture so no real Gemini embedding
call happens. Tests that don't assert on specific chunk/citation content
just need mock_embeddings -- the RPC is allowed to hit the real (already
mocked-nowhere) dev Supabase project like the rest of this suite does."""

import retrieval as retrieval_module
from main import supabase
from google.genai.errors import ClientError


class _FakeRpcResult:
    def __init__(self, data):
        self.data = data


class _FakeRpcBuilder:
    def __init__(self, result):
        self._result = result

    def execute(self):
        return self._result


def _mock_retrieve_context_rpc(monkeypatch, rows):
    """Makes /query's follow-up path (retrieve_context -> match_chunks RPC)
    return exactly these chunk rows, instead of depending on the real
    embedding space. Use together with the mock_embeddings fixture so no
    real Gemini call happens either."""
    monkeypatch.setattr(retrieval_module.supabase, "rpc", lambda name, params: _FakeRpcBuilder(_FakeRpcResult(rows)))


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


def test_zero_content_topic_returns_no_context_answer(client, mock_embeddings, monkeypatch, fresh_student_id, seeded_topic, empty_topic_id):
    _mock_retrieve_context_rpc(monkeypatch, [])
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


def test_grounded_answer_returns_renumbered_citations_and_persists_history(client, mock_gemini, mock_embeddings, monkeypatch, fresh_student_id, seeded_topic):
    real_chunk = (
        supabase.table("chunks").select("chunk_id, chunk_text").eq("topic_id", seeded_topic["topic_id"]).limit(1).execute()
    ).data[0]
    _mock_retrieve_context_rpc(monkeypatch, [real_chunk])
    mock_gemini.returns(f"Hash tables use a hash function to map keys to buckets. [{real_chunk['chunk_id']}]")

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
    assert body["citations"][0]["chunk_id"] == real_chunk["chunk_id"]
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


def test_gemini_429_during_answer_generation_returns_429_not_502(client, mock_gemini, mock_embeddings, monkeypatch, fresh_student_id, seeded_topic):
    # A real chunk row with no similarity score attached (unlike a genuine
    # match_chunks result) so _relevant_chunks() never filters it out --
    # mock_embeddings' fake uniform vector makes the RPC's *real* similarity
    # scores against real chunk embeddings unpredictable, and this test only
    # cares that generate_content actually gets called and its 429 surfaces
    # correctly, not what content grounds the (never-returned) answer.
    real_chunk = (
        supabase.table("chunks").select("chunk_id, chunk_text").eq("topic_id", seeded_topic["topic_id"]).limit(1).execute()
    ).data[0]
    _mock_retrieve_context_rpc(monkeypatch, [real_chunk])
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


def test_full_explanation_returns_sections_check_question_and_solve_steps(client, mock_gemini, fresh_student_id, seeded_topic):
    """Each sub-idea is now its own self-contained mini-lesson: one
    session_messages row per section, each carrying its own checkQuestion/
    solveSteps -- the per-sub-idea explain/check loop sequences through
    these one at a time (see main.py's per-sub-idea /mastery/check)."""
    real_chunk = (
        supabase.table("chunks").select("chunk_id").eq("topic_id", seeded_topic["topic_id"]).limit(1).execute()
    ).data[0]
    chunk_id = real_chunk["chunk_id"]
    mock_gemini.returns(
        '{"sections": ['
        f'{{"heading": "Motivation", "body": "Hash tables solve slow lookup [{chunk_id}].", '
        '"checkQuestion": "Why is a hash table lookup faster than scanning an unsorted array?", '
        '"solveSteps": ["Hash the key", "Go to that bucket", "Check for the value"]},'
        f'{{"heading": "The Mechanism", "body": "A hash function maps keys to buckets [{chunk_id}].", '
        '"checkQuestion": "How does the hash function decide which bucket to use?", '
        '"solveSteps": ["Pick a key", "Run it through the hash function", "Land on a bucket"]}'
        ']}'
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
    assert len(body["sections"]) == 2
    first, second = body["sections"]
    assert first["heading"] == "Motivation"
    assert "[1]" in first["body"]  # citations renumbered per-section, unchanged from the plain-text path
    assert first["checkQuestion"] == "Why is a hash table lookup faster than scanning an unsorted array?"
    assert first["solveSteps"] == ["Hash the key", "Go to that bucket", "Check for the value"]
    assert second["heading"] == "The Mechanism"
    assert second["checkQuestion"] == "How does the hash function decide which bucket to use?"

    messages = (
        supabase.table("session_messages")
        .select("metadata")
        .eq("session_id", body["sessionId"])
        .eq("sender", "ai")
        .order("timestamp")
        .execute()
    )
    assert len(messages.data) == 2
    assert messages.data[0]["metadata"]["checkQuestion"] == first["checkQuestion"]
    assert messages.data[0]["metadata"]["solveSteps"] == first["solveSteps"]
    assert messages.data[1]["metadata"]["checkQuestion"] == second["checkQuestion"]


def test_full_explanation_omitted_still_uses_plain_answer_path(client, mock_gemini, mock_embeddings, monkeypatch, fresh_student_id, seeded_topic):
    """fullExplanation defaults to False -- a normal follow-up question must
    keep going through generate_answer, not the structured-JSON path."""
    real_chunk = (
        supabase.table("chunks").select("chunk_id, chunk_text").eq("topic_id", seeded_topic["topic_id"]).limit(1).execute()
    ).data[0]
    _mock_retrieve_context_rpc(monkeypatch, [real_chunk])
    mock_gemini.returns(f"A plain-text answer [{real_chunk['chunk_id']}].")

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
