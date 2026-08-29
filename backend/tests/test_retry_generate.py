"""Failure scenarios and edge cases for POST /retry/generate."""

from google.genai.errors import ClientError
from main import supabase


def test_gemini_quota_exceeded_returns_429_not_500(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()


def test_no_content_for_topic_returns_422(client, mock_gemini, fresh_student_id, empty_topic_id):
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": empty_topic_id})
    assert res.status_code == 422
    assert mock_gemini.call_count == 0


def test_gemini_returns_unparseable_json_returns_502(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.returns("not json")
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 502


def test_gemini_omits_content_field_returns_502(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.returns('{"citedChunkIds": []}')  # valid JSON, but no "content" key
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 502
    assert "invalid retry content" in res.json()["detail"]


def test_first_attempt_leads_with_saved_preferred_format(client, mock_gemini, fresh_student_id, seeded_topic):
    supabase.table("students").update({"preferred_explanation_format": "Analogy"}).eq("student_id", fresh_student_id).execute()
    mock_gemini.returns('{"content": "An analogy-based explanation with a claim [chunk-id].", "citedChunkIds": []}')
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 200
    assert res.json()["format"] == "Analogy"


def test_unset_preference_falls_back_to_round_robin_first_slot(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.returns('{"content": "A worked example with a claim [chunk-id].", "citedChunkIds": []}')
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 200
    assert res.json()["format"] == "Worked Example"


def test_diagram_format_strips_markdown_code_fences(client, mock_gemini, fresh_student_id, seeded_topic):
    # Models routinely wrap Mermaid output in ```mermaid fences despite being
    # told not to (see the comment in generate_retry) -- the endpoint must
    # strip these rather than handing fenced text straight to the renderer.
    supabase.table("students").update({"preferred_explanation_format": "Diagram"}).eq("student_id", fresh_student_id).execute()
    mock_gemini.returns('{"content": "```mermaid\\ngraph TD\\nA-->B\\n```", "citedChunkIds": []}')
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 200
    body = res.json()
    assert body["isDiagram"] is True
    assert "```" not in body["content"]
    assert body["content"].strip().startswith("graph TD")


def test_diagram_format_empty_after_fence_stripping_returns_502(client, mock_gemini, fresh_student_id, seeded_topic):
    supabase.table("students").update({"preferred_explanation_format": "Diagram"}).eq("student_id", fresh_student_id).execute()
    mock_gemini.returns('{"content": "```mermaid\\n```", "citedChunkIds": []}')
    res = client.post("/retry/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 502
