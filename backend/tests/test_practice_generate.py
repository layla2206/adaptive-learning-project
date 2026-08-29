"""Regression test proving /practice/generate now handles a Gemini 429 the
same way /instructor/insight/generate always has, instead of falling through
to a generic 500 (see docs/testing-and-evaluation.md's quota-handling
finding, confirmed live during the AI-quality evaluation run)."""

from google.genai.errors import ClientError


def test_gemini_quota_exceeded_returns_429_not_500(client, mock_gemini, fresh_student_id, seeded_topic, tagged_reference_document):
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))
    res = client.post(
        "/practice/generate",
        json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"], "content_type": "quiz"},
    )
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()
