"""Tests for POST /practice/generate covering the multi-lecture quiz,
final_exam, and PDF-output extension of the original single-topic
practice/quiz feature. Uses the real dev R2 bucket and Supabase project
(matching this whole suite's convention -- see test_upload.py), with Gemini
mocked via mock_gemini so this costs zero quota. PDF rendering and upload run
for real (WeasyPrint + R2), same as production, so every test that reaches
that path cleans up both the R2 objects and the generated_practice_content
row it created."""

from google.genai.errors import ClientError

from main import supabase, s3_client, r2_bucket_name

QUIZ_PAYLOAD = """[
  {"question_text": "Q1?", "options": ["A", "B", "C", "D"], "correct_answer": "A", "difficulty": "Easy"},
  {"question_text": "Q2?", "options": ["A", "B", "C", "D"], "correct_answer": "B", "difficulty": "Medium"}
]"""


def _cleanup_generated_content(student_id: str, content_type: str, topic_ids_key: str):
    row = (
        supabase.table("generated_practice_content")
        .select("questions_pdf_key, answer_key_pdf_key")
        .eq("student_id", student_id)
        .eq("content_type", content_type)
        .eq("topic_ids", topic_ids_key)
        .maybe_single()
        .execute()
    )
    if row and row.data:
        for key in (row.data.get("questions_pdf_key"), row.data.get("answer_key_pdf_key")):
            if key:
                s3_client.delete_object(Bucket=r2_bucket_name, Key=key)
    supabase.table("generated_practice_content").delete().eq("student_id", student_id).eq(
        "content_type", content_type
    ).eq("topic_ids", topic_ids_key).execute()


def test_gemini_quota_exceeded_returns_429_not_500(client, mock_gemini, fresh_student_id, seeded_topic, tagged_reference_document):
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))
    res = client.post(
        "/practice/generate",
        json={"student_id": fresh_student_id, "topic_ids": [seeded_topic["topic_id"]], "content_type": "quiz"},
    )
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()


def test_missing_topic_ids_returns_400(client, fresh_student_id):
    res = client.post("/practice/generate", json={"student_id": fresh_student_id, "topic_ids": [], "content_type": "quiz"})
    assert res.status_code == 400


def test_final_exam_missing_course_id_returns_400(client, fresh_student_id):
    res = client.post("/practice/generate", json={"student_id": fresh_student_id, "content_type": "final_exam"})
    assert res.status_code == 400


def test_unknown_content_type_returns_400(client, fresh_student_id, seeded_topic):
    res = client.post(
        "/practice/generate",
        json={"student_id": fresh_student_id, "topic_ids": [seeded_topic["topic_id"]], "content_type": "bogus"},
    )
    assert res.status_code == 400


def test_quiz_generates_two_pdfs_and_caches_on_second_call(
    client, mock_gemini, mock_embeddings, fresh_student_id, seeded_topic, tagged_reference_document
):
    mock_gemini.returns(QUIZ_PAYLOAD)
    topic_ids_key = seeded_topic["topic_id"]
    try:
        first = client.post(
            "/practice/generate",
            json={"student_id": fresh_student_id, "topic_ids": [seeded_topic["topic_id"]], "content_type": "quiz"},
        )
        assert first.status_code == 200
        body = first.json()
        assert body["cached"] is False
        assert body["questionCount"] == 2
        assert body["questionsPdfUrl"].startswith("http")
        assert body["answerKeyPdfUrl"].startswith("http")
        assert body["questionsPdfUrl"] != body["answerKeyPdfUrl"]

        row = (
            supabase.table("generated_practice_content")
            .select("topic_ids, questions_pdf_key, answer_key_pdf_key")
            .eq("student_id", fresh_student_id)
            .eq("content_type", "quiz")
            .maybe_single()
            .execute()
        )
        assert row.data["topic_ids"] == topic_ids_key
        assert row.data["questions_pdf_key"]
        assert row.data["answer_key_pdf_key"]

        second = client.post(
            "/practice/generate",
            json={"student_id": fresh_student_id, "topic_ids": [seeded_topic["topic_id"]], "content_type": "quiz"},
        )
        assert second.status_code == 200
        assert second.json()["cached"] is True
        assert mock_gemini.call_count == 1  # cache hit never re-spends quota
    finally:
        _cleanup_generated_content(fresh_student_id, "quiz", topic_ids_key)


def test_multi_topic_quiz_aggregates_content_across_topics(
    client, mock_gemini, mock_embeddings, fresh_student_id, seeded_topic, tagged_reference_document, second_topic_with_content
):
    mock_gemini.returns(QUIZ_PAYLOAD)
    topic_ids = sorted([seeded_topic["topic_id"], second_topic_with_content["topic_id"]])
    topic_ids_key = ",".join(topic_ids)
    try:
        res = client.post(
            "/practice/generate",
            json={"student_id": fresh_student_id, "topic_ids": topic_ids, "content_type": "quiz"},
        )
        assert res.status_code == 200
        assert res.json()["cached"] is False

        # The prompt sent to Gemini must include content pulled from both
        # topics, not just the one carrying the reference document.
        prompt = mock_gemini.last_contents
        assert "Merge sort splits the array in half" in prompt

        row = (
            supabase.table("generated_practice_content")
            .select("topic_ids")
            .eq("student_id", fresh_student_id)
            .eq("content_type", "quiz")
            .maybe_single()
            .execute()
        )
        assert row.data["topic_ids"] == topic_ids_key
    finally:
        _cleanup_generated_content(fresh_student_id, "quiz", topic_ids_key)


def test_final_exam_spans_every_topic_in_the_course(
    client, mock_gemini, mock_embeddings, fresh_student_id, seeded_topic, tagged_exam_reference_document, second_topic_with_content
):
    mock_gemini.returns(QUIZ_PAYLOAD)
    course_topics = supabase.table("topics").select("topic_id").eq("course_id", seeded_topic["course_id"]).execute()
    topic_ids_key = ",".join(sorted(t["topic_id"] for t in course_topics.data))
    try:
        res = client.post(
            "/practice/generate",
            json={"student_id": fresh_student_id, "course_id": seeded_topic["course_id"], "content_type": "final_exam"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["cached"] is False
        assert body["questionsPdfUrl"].startswith("http")

        row = (
            supabase.table("generated_practice_content")
            .select("topic_ids")
            .eq("student_id", fresh_student_id)
            .eq("content_type", "final_exam")
            .maybe_single()
            .execute()
        )
        assert row.data["topic_ids"] == topic_ids_key
    finally:
        _cleanup_generated_content(fresh_student_id, "final_exam", topic_ids_key)


def test_final_exam_falls_back_to_quiz_reference_when_no_exam_doc(
    client, mock_gemini, mock_embeddings, fresh_student_id, seeded_topic, tagged_reference_document
):
    """No document_type='exam' anywhere in the course -- tagged_reference_document
    only tags a 'quiz' -- so final_exam must fall back to that instead of
    erroring out, per the feature spec."""
    mock_gemini.returns(QUIZ_PAYLOAD)
    course_topics = supabase.table("topics").select("topic_id").eq("course_id", seeded_topic["course_id"]).execute()
    topic_ids_key = ",".join(sorted(t["topic_id"] for t in course_topics.data))
    try:
        res = client.post(
            "/practice/generate",
            json={"student_id": fresh_student_id, "course_id": seeded_topic["course_id"], "content_type": "final_exam"},
        )
        assert res.status_code == 200
        assert "error" not in res.json()
    finally:
        _cleanup_generated_content(fresh_student_id, "final_exam", topic_ids_key)


def test_no_reference_material_returns_soft_error_not_exception(client, fresh_student_id, seeded_topic):
    """No document is tagged at all (no tagged_reference_document fixture
    here) -- a 200 with an {"error": ...} body, not a 4xx/5xx, matching the
    original single-topic behavior this extends."""
    res = client.post(
        "/practice/generate",
        json={"student_id": fresh_student_id, "topic_ids": [seeded_topic["topic_id"]], "content_type": "practice_assignment"},
    )
    assert res.status_code == 200
    assert "error" in res.json()
