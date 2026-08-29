"""Tests for POST /diagnostic/submit -- the warm-up diagnostic's scoring
endpoint, which had zero test coverage before this pass."""

import uuid

import pytest

from main import supabase


@pytest.fixture
def diagnostic_question(seeded_topic):
    question_id = f"q-{uuid.uuid4().hex[:6]}"
    supabase.table("diagnostic_questions").insert({
        "question_id": question_id,
        "topic_id": seeded_topic["topic_id"],
        "question_text": '{"text": "What is a hash function?", "options": ["A", "B", "C", "D"]}',
        "correct_answer": "A",
        "question_type": "MCQ",
    }).execute()
    yield question_id
    supabase.table("diagnostic_results").delete().eq("question_id", question_id).execute()
    supabase.table("diagnostic_questions").delete().eq("question_id", question_id).execute()


def test_correct_answer_is_scored_correct(client, fresh_student_id, diagnostic_question):
    res = client.post(
        "/diagnostic/submit",
        json={"student_id": fresh_student_id, "answers": [{"question_id": diagnostic_question, "student_answer": "A"}]},
    )
    assert res.status_code == 200
    assert res.json()["score"] == "1/1"

    result = supabase.table("diagnostic_results").select("is_correct").eq("student_id", fresh_student_id).single().execute()
    assert result.data["is_correct"] is True


def test_wrong_answer_is_scored_incorrect(client, fresh_student_id, diagnostic_question):
    res = client.post(
        "/diagnostic/submit",
        json={"student_id": fresh_student_id, "answers": [{"question_id": diagnostic_question, "student_answer": "B"}]},
    )
    assert res.status_code == 200
    assert res.json()["score"] == "0/1"


def test_answer_matching_is_case_and_whitespace_insensitive(client, fresh_student_id, diagnostic_question):
    res = client.post(
        "/diagnostic/submit",
        json={"student_id": fresh_student_id, "answers": [{"question_id": diagnostic_question, "student_answer": "  a  "}]},
    )
    assert res.status_code == 200
    assert res.json()["score"] == "1/1"


def test_submitting_does_not_write_a_student_profile_row(client, fresh_student_id, diagnostic_question, seeded_topic):
    """Deliberate: the warm-up diagnostic is low-stakes and must never
    overwrite real mastery earned via /mastery/check (see main.py's own
    comment on this endpoint)."""
    client.post(
        "/diagnostic/submit",
        json={"student_id": fresh_student_id, "answers": [{"question_id": diagnostic_question, "student_answer": "A"}]},
    )
    profile = (
        supabase.table("student_profiles")
        .select("student_id")
        .eq("student_id", fresh_student_id)
        .eq("topic_id", seeded_topic["topic_id"])
        .execute()
    )
    assert profile.data == []


def test_unknown_question_id_is_skipped_not_fatal(client, fresh_student_id):
    res = client.post(
        "/diagnostic/submit",
        json={"student_id": fresh_student_id, "answers": [{"question_id": "not-a-real-id", "student_answer": "A"}]},
    )
    assert res.status_code == 200
    assert res.json()["score"] == "0/1"  # counted in the total but never matched, so scored as not-correct
