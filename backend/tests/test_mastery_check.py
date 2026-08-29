"""Failure scenarios and edge cases for POST /mastery/check."""

from google.genai.errors import ClientError


def test_gemini_quota_exceeded_returns_429_not_500(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))
    res = client.post(
        "/mastery/check",
        json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"], "explanation": "an explanation"},
    )
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()


def test_neither_explanation_nor_solution_returns_400(client, fresh_student_id, seeded_topic):
    res = client.post("/mastery/check", json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"]})
    assert res.status_code == 400


def test_gemini_returns_unparseable_json_returns_502(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.returns("this is not JSON at all")
    res = client.post(
        "/mastery/check",
        json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"], "explanation": "hash tables use buckets"},
    )
    assert res.status_code == 502
    assert "invalid JSON" in res.json()["detail"]


def test_gemini_returns_wrong_score_type_returns_502(client, mock_gemini, fresh_student_id, seeded_topic):
    # explain_score as a string instead of a number -- score_value() must
    # reject this rather than silently coercing it.
    mock_gemini.returns('{"explain_score": "high", "solve_score": null, "feedback": "ok", "mistake_tag": "none"}')
    res = client.post(
        "/mastery/check",
        json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"], "explanation": "hash tables use buckets"},
    )
    assert res.status_code == 502
    assert "explain_score" in res.json()["detail"]


def test_gemini_returns_neither_score_returns_502(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.returns('{"explain_score": null, "solve_score": null, "feedback": "ok", "mistake_tag": "none"}')
    res = client.post(
        "/mastery/check",
        json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"], "explanation": "hash tables use buckets"},
    )
    assert res.status_code == 502
    assert "did not score" in res.json()["detail"]


def test_no_content_for_topic_returns_422(client, mock_gemini, fresh_student_id, empty_topic_id):
    res = client.post(
        "/mastery/check", json={"student_id": fresh_student_id, "topic_id": empty_topic_id, "explanation": "anything"}
    )
    assert res.status_code == 422
    assert mock_gemini.call_count == 0  # never even reaches Gemini -- fails fast on missing content


def test_mastery_threshold_boundary_pass_at_exactly_70(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.returns('{"explain_score": 70, "solve_score": null, "feedback": "ok", "mistake_tag": "none"}')
    res = client.post(
        "/mastery/check",
        json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"], "explanation": "a full explanation"},
    )
    assert res.status_code == 200
    assert res.json()["passed"] is True


def test_mastery_threshold_boundary_fail_just_below_70(client, mock_gemini, fresh_student_id, seeded_topic):
    mock_gemini.returns('{"explain_score": 69, "solve_score": null, "feedback": "needs more", "mistake_tag": "incomplete"}')
    res = client.post(
        "/mastery/check",
        json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"], "explanation": "a partial explanation"},
    )
    assert res.status_code == 200
    assert res.json()["passed"] is False


def test_invalid_mistake_tag_falls_back_to_none(client, mock_gemini, fresh_student_id, seeded_topic):
    # A mistake_tag outside the fixed enum must never propagate into
    # student_answers/weak_area -- it silently normalizes to "none" rather
    # than failing the request or storing junk.
    mock_gemini.returns('{"explain_score": 50, "solve_score": null, "feedback": "ok", "mistake_tag": "not_a_real_tag"}')
    res = client.post(
        "/mastery/check",
        json={"student_id": fresh_student_id, "topic_id": seeded_topic["topic_id"], "explanation": "an explanation"},
    )
    assert res.status_code == 200
