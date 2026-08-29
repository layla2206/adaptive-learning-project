"""Failure scenarios and edge cases for POST /diagnostic/generate."""

from google.genai.errors import ClientError


def test_gemini_quota_exceeded_returns_429_not_500(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))
    res = client.post("/diagnostic/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()


def test_no_content_for_topic_returns_200_with_error_field_not_422(client, mock_gemini, fresh_student_id, empty_topic_id):
    # KNOWN INCONSISTENCY (documented in docs/testing-and-evaluation.md, not
    # fixed here): every other content-missing check in this file
    # (mastery/check, retry/generate) raises a 422 HTTPException. This one
    # instead returns 200 with an {"error": ...} body -- a caller that only
    # checks res.ok would treat this as success. Asserted here so a future
    # fix is a deliberate, visible change to this test, not a silent one.
    res = client.post("/diagnostic/generate", json={"student_id": fresh_student_id, "topic_id": empty_topic_id})
    assert res.status_code == 200
    assert "error" in res.json()
    assert mock_gemini.call_count == 0


def test_gemini_returns_wrong_shape_returns_500(client, mock_gemini, fresh_student_id, seeded_topic):
    # The endpoint's own json.loads(response.text) call is unguarded (no
    # try/except around it, unlike parse_gemini_json used elsewhere) -- a
    # non-JSON response surfaces as a bare 500, not the 502 "AI returned
    # invalid JSON" pattern the rest of this file uses.
    mock_gemini.returns("not a json array")
    res = client.post("/diagnostic/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 500


def test_generates_two_questions_from_valid_response(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.returns(
        '[{"question_text": "Q1?", "options": ["A", "B"], "correct_answer": "A", "difficulty": "Easy"},'
        ' {"question_text": "Q2?", "options": ["A", "B"], "correct_answer": "B", "difficulty": "Easy"}]'
    )
    res = client.post("/diagnostic/generate", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 200
    questions = res.json()["questions"]
    assert len(questions) == 2
    # correct_answer must never leak to the client -- it's the answer key.
    assert all("correct_answer" not in q for q in questions)
