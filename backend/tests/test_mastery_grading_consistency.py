"""Regression test for the grading-contradicts-Explain incident: a student
was told (during Explain) that a hash table "maps keys to values using a
hash function, which converts a key into an array index," then marked wrong
on the mastery check for using that exact language -- because /mastery/check
used to grade against an independent, unordered "first 8 chunks for this
topic" fetch that had no relationship to what /query actually retrieved and
cited. Fixed by get_session_cited_chunk_ids() (main.py), which grades
against the same chunks the student was actually shown in this session."""

from main import supabase, short_id, get_session_cited_chunk_ids

TOPIC_ID = "top-hash1"


def test_get_session_cited_chunk_ids_dedupes_and_preserves_first_seen_order(fresh_student_id):
    session_id = short_id("ses")
    supabase.table("sessions").insert(
        {"session_id": session_id, "student_id": fresh_student_id, "topic_id": TOPIC_ID}
    ).execute()
    supabase.table("session_messages").insert([
        {
            "message_id": short_id("msg", 20),
            "session_id": session_id,
            "sender": "ai",
            "message_text": "First explanation.",
            "metadata": {"tag": "Grounded Explanation", "citations": [{"chunk_id": "chunk-a"}, {"chunk_id": "chunk-b"}]},
        },
        {
            "message_id": short_id("msg", 20),
            "session_id": session_id,
            "sender": "student",
            "message_text": "a follow-up question",
        },
        {
            "message_id": short_id("msg", 20),
            "session_id": session_id,
            "sender": "ai",
            "message_text": "Follow-up answer.",
            "metadata": {"tag": "Grounded Explanation", "citations": [{"chunk_id": "chunk-b"}, {"chunk_id": "chunk-c"}]},
        },
    ]).execute()
    try:
        assert get_session_cited_chunk_ids(session_id) == ["chunk-a", "chunk-b", "chunk-c"]
    finally:
        supabase.table("session_messages").delete().eq("session_id", session_id).execute()
        supabase.table("sessions").delete().eq("session_id", session_id).execute()


def test_mastery_check_grades_against_the_chunks_shown_during_explain_not_a_fresh_fetch(
    client, mock_gemini, fresh_student_id
):
    # Two real chunks on the seeded topic -- cite only the first one to the
    # student, then confirm /mastery/check's prompt is built from that chunk
    # and never mentions the second, uncited one.
    chunks = (
        supabase.table("chunks").select("chunk_id, chunk_text").eq("topic_id", TOPIC_ID).limit(2).execute()
    ).data
    assert len(chunks) == 2, "seeded topic needs at least 2 chunks for this test to be meaningful"
    shown_chunk, uncited_chunk = chunks[0], chunks[1]

    session_id = short_id("ses")
    supabase.table("sessions").insert(
        {"session_id": session_id, "student_id": fresh_student_id, "topic_id": TOPIC_ID}
    ).execute()
    supabase.table("session_messages").insert({
        "message_id": short_id("msg", 20),
        "session_id": session_id,
        "sender": "ai",
        "message_text": "Explanation grounded only in the shown chunk.",
        "metadata": {"tag": "Grounded Explanation", "citations": [{"chunk_id": shown_chunk["chunk_id"]}]},
    }).execute()

    try:
        mock_gemini.returns('{"explain_score": 90, "solve_score": null, "feedback": "ok", "mistake_tag": "none"}')
        res = client.post(
            "/mastery/check",
            json={
                "student_id": fresh_student_id,
                "topic_id": TOPIC_ID,
                "session_id": session_id,
                "explanation": "an explanation reusing the shown wording",
            },
        )
        assert res.status_code == 200
        prompt = mock_gemini.last_contents
        assert shown_chunk["chunk_text"] in prompt
        assert uncited_chunk["chunk_text"] not in prompt
    finally:
        supabase.table("student_answers").delete().eq("student_id", fresh_student_id).execute()
        supabase.table("mastery_checks").delete().eq("student_id", fresh_student_id).execute()
        supabase.table("student_profiles").delete().eq("student_id", fresh_student_id).execute()
        supabase.table("session_messages").delete().eq("session_id", session_id).execute()
        supabase.table("sessions").delete().eq("session_id", session_id).execute()
