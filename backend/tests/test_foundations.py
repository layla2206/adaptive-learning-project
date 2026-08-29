"""Regression tests proving /foundations/generate and /foundations/answer's
wrong-answer explanation branch now handle a Gemini 429 the same way
/instructor/insight/generate always has, instead of falling through to a
generic 500."""

import pytest
from google.genai.errors import ClientError
from main import supabase, short_id

FOUNDATIONS_TOPIC_ID = "top-sort1"  # backend/main.py's FOUNDATIONS_GATE_TOPIC_ID -- the one topic this endpoint accepts


def test_generate_quota_exceeded_returns_429_not_500(client, mock_gemini, fresh_student_id):
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))
    res = client.post("/foundations/generate", json={"student_id": fresh_student_id, "topic_id": FOUNDATIONS_TOPIC_ID})
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()


@pytest.fixture
def foundations_question(fresh_student_id):
    """A real diagnostic_questions row for the first Foundations concept,
    with a known correct_answer -- /foundations/answer requires this to
    exist before it can be called at all (it looks the question up by id).
    Sidesteps calling the real /foundations/generate (which needs its own 4
    Gemini-shaped questions) since this test only cares about the
    wrong-answer explanation branch's 429 handling."""
    session_id = short_id("ses")
    question_id = short_id("q", 10)  # diagnostic_questions.question_id is VARCHAR(10) -- short_id's 15-char default overflows it
    supabase.table("sessions").insert({"session_id": session_id, "student_id": fresh_student_id, "topic_id": FOUNDATIONS_TOPIC_ID}).execute()
    supabase.table("diagnostic_questions").insert({
        "question_id": question_id,
        "topic_id": FOUNDATIONS_TOPIC_ID,
        "session_id": session_id,
        "concept_id": "variables",
        "question_text": '{"text": "What is a variable?", "options": ["A", "B", "C", "D"]}',
        "correct_answer": "A",
        "question_type": "FOUNDATIONS_MCQ",
    }).execute()
    yield {"session_id": session_id, "question_id": question_id}
    supabase.table("diagnostic_results").delete().eq("student_id", fresh_student_id).execute()
    supabase.table("diagnostic_questions").delete().eq("question_id", question_id).execute()
    supabase.table("sessions").delete().eq("session_id", session_id).execute()


def test_answer_wrong_branch_quota_exceeded_returns_429_not_500(client, mock_gemini, fresh_student_id, foundations_question):
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))
    res = client.post(
        "/foundations/answer",
        json={
            "student_id": fresh_student_id,
            "topic_id": FOUNDATIONS_TOPIC_ID,
            "session_id": foundations_question["session_id"],
            "question_id": foundations_question["question_id"],
            "concept_index": 0,
            "student_answer": "B",  # wrong -- correct_answer is "A" -- triggers the explanation call
        },
    )
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()
