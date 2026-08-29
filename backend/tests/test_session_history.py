"""Tests for POST /session/history -- the mastery-loop resumption endpoint
(what src/lib/sessionHistory.ts's restoreFromHistory consumes), which had
zero backend test coverage before this pass. sessionHistory.test.ts already
covers the frontend's own resumption branching in detail; these tests cover
this endpoint's own contract: session lookup and the ai-only message filter."""

import pytest

from main import supabase, short_id

TOPIC_ID = "top-hash1"


def test_no_active_session_returns_empty_history(client, fresh_student_id):
    res = client.post("/session/history", json={"student_id": fresh_student_id, "topic_id": TOPIC_ID})
    assert res.status_code == 200
    assert res.json() == {"sessionId": None, "messages": []}


@pytest.fixture
def mastery_session_with_messages(fresh_student_id):
    session_id = short_id("ses")
    supabase.table("sessions").insert(
        {"session_id": session_id, "student_id": fresh_student_id, "topic_id": TOPIC_ID}  # session_type defaults to mastery_loop
    ).execute()
    supabase.table("session_messages").insert([
        {"message_id": short_id("msg", 20), "session_id": session_id, "sender": "student", "message_text": "my answer"},
        {
            "message_id": short_id("msg", 20),
            "session_id": session_id,
            "sender": "ai",
            "message_text": "Here's the explanation.",
            "metadata": {"tag": "Grounded Explanation", "citations": []},
        },
    ]).execute()
    yield session_id
    supabase.table("session_messages").delete().eq("session_id", session_id).execute()
    supabase.table("sessions").delete().eq("session_id", session_id).execute()


def test_returns_only_ai_messages_with_metadata_merged_in(client, fresh_student_id, mastery_session_with_messages):
    res = client.post("/session/history", json={"student_id": fresh_student_id, "topic_id": TOPIC_ID})
    assert res.status_code == 200
    body = res.json()
    assert body["sessionId"] == mastery_session_with_messages
    assert len(body["messages"]) == 1  # the student's own message is excluded
    assert body["messages"][0]["text"] == "Here's the explanation."
    assert body["messages"][0]["tag"] == "Grounded Explanation"
