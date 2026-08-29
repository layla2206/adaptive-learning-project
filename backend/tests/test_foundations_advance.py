"""Tests for POST /foundations/advance -- the Foundations Gate's
zero-Gemini-cost "reveal the next already-generated question" bookkeeping,
which had zero direct test coverage before this pass (only exercised
indirectly through /foundations/answer's correct-answer branch, which shares
the same _foundations_next_payload helper)."""

import pytest

from main import supabase, short_id

FOUNDATIONS_TOPIC_ID = "top-sort1"


@pytest.fixture
def foundations_session(fresh_student_id):
    session_id = short_id("ses")
    supabase.table("sessions").insert(
        {"session_id": session_id, "student_id": fresh_student_id, "topic_id": FOUNDATIONS_TOPIC_ID}
    ).execute()
    yield session_id
    supabase.table("diagnostic_questions").delete().eq("session_id", session_id).execute()
    supabase.table("session_messages").delete().eq("session_id", session_id).execute()
    supabase.table("sessions").delete().eq("session_id", session_id).execute()


def _seed_question(session_id: str, concept_id: str) -> str:
    question_id = short_id("q", 10)
    supabase.table("diagnostic_questions").insert({
        "question_id": question_id,
        "topic_id": FOUNDATIONS_TOPIC_ID,
        "session_id": session_id,
        "concept_id": concept_id,
        "question_text": '{"text": "Placeholder?", "options": ["A", "B", "C", "D"]}',
        "correct_answer": "A",
        "question_type": "FOUNDATIONS_MCQ",
    }).execute()
    return question_id


def test_advance_from_the_last_concept_marks_the_gate_complete(client, fresh_student_id, foundations_session):
    res = client.post(
        "/foundations/advance",
        json={
            "student_id": fresh_student_id,
            "topic_id": FOUNDATIONS_TOPIC_ID,
            "session_id": foundations_session,
            "concept_index": 3,  # "swapping" -- the last of the 4 FOUNDATIONS_CONCEPTS
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body == {"correct": True, "done": True}

    message = (
        supabase.table("session_messages")
        .select("metadata")
        .eq("session_id", foundations_session)
        .single()
        .execute()
    )
    assert message.data["metadata"]["tag"] == "Foundations Complete"


def test_advance_reveals_the_next_pre_generated_question(client, fresh_student_id, foundations_session):
    _seed_question(foundations_session, "arrays")  # concept_index 1's question, generated ahead of time

    res = client.post(
        "/foundations/advance",
        json={
            "student_id": fresh_student_id,
            "topic_id": FOUNDATIONS_TOPIC_ID,
            "session_id": foundations_session,
            "concept_index": 0,  # "variables" -- next up is "arrays"
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["done"] is False
    assert body["next"]["concept_id"] == "arrays"
    assert body["next"]["concept_index"] == 1

    message = (
        supabase.table("session_messages")
        .select("metadata")
        .eq("session_id", foundations_session)
        .single()
        .execute()
    )
    assert message.data["metadata"]["tag"] == "Foundations Question"
    assert message.data["metadata"]["conceptIndex"] == 1


def test_advance_when_the_next_question_was_never_generated_returns_500(client, fresh_student_id, foundations_session):
    res = client.post(
        "/foundations/advance",
        json={
            "student_id": fresh_student_id,
            "topic_id": FOUNDATIONS_TOPIC_ID,
            "session_id": foundations_session,
            "concept_index": 0,  # no "arrays" question was ever seeded for this session
        },
    )
    assert res.status_code == 500
