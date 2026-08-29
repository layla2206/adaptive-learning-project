"""Tests for POST /peer-buddy/history -- had zero test coverage before this
pass (peer-buddy.spec.ts's E2E history-resume test exercises this
indirectly through the browser, but never checks this endpoint's own
response shape directly)."""

import pytest

from main import supabase, short_id

TOPIC_ID = "top-hash1"


def test_no_active_session_returns_empty_history(client, fresh_student_id):
    res = client.post("/peer-buddy/history", json={"student_id": fresh_student_id, "topic_id": TOPIC_ID})
    assert res.status_code == 200
    assert res.json() == {"sessionId": None, "messages": []}


@pytest.fixture
def peer_buddy_session_with_messages(fresh_student_id):
    session_id = short_id("ses")
    supabase.table("sessions").insert(
        {"session_id": session_id, "student_id": fresh_student_id, "topic_id": TOPIC_ID, "session_type": "peer_buddy"}
    ).execute()
    supabase.table("session_messages").insert([
        {"message_id": short_id("msg", 20), "session_id": session_id, "sender": "student", "message_text": "hi"},
        {
            "message_id": short_id("msg", 20),
            "session_id": session_id,
            "sender": "ai",
            "message_text": "hey, what's up?",
            "metadata": {"tag": "Peer Reply"},
        },
    ]).execute()
    yield session_id
    supabase.table("session_messages").delete().eq("session_id", session_id).execute()
    supabase.table("sessions").delete().eq("session_id", session_id).execute()


def test_returns_both_student_and_ai_messages_in_order_with_metadata_merged_in(
    client, fresh_student_id, peer_buddy_session_with_messages
):
    res = client.post("/peer-buddy/history", json={"student_id": fresh_student_id, "topic_id": TOPIC_ID})
    assert res.status_code == 200
    body = res.json()
    assert body["sessionId"] == peer_buddy_session_with_messages
    assert [m["sender"] for m in body["messages"]] == ["student", "ai"]
    assert body["messages"][1]["tag"] == "Peer Reply"  # metadata spread directly onto the message, not nested
