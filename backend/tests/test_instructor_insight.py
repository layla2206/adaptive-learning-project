"""Failure scenarios and edge cases for POST /instructor/insight/generate --
in particular, the stat-snapshot cache check that's the real quota guard for
this endpoint (see the plan this feature shipped under: skip a redundant
Gemini call whenever the underlying stats haven't changed since last time)."""

from google.genai.errors import ClientError
from main import supabase

BREAKDOWN = [{"tag": "concept_confusion", "label": "Concept confusion", "count": 3}]
DIFFERENT_BREAKDOWN = [{"tag": "concept_confusion", "label": "Concept confusion", "count": 5}]


def _request(instructor_id, topic_id, breakdown=BREAKDOWN, stuck_count=4):
    return {
        "instructor_id": instructor_id,
        "topic_id": topic_id,
        "topic_name": "Pytest Topic",
        "stuck_count": stuck_count,
        "mistake_breakdown": breakdown,
    }


def test_empty_mistake_breakdown_returns_422(client, mock_gemini, seeded_instructor_id, empty_topic_id):
    res = client.post("/instructor/insight/generate", json=_request(seeded_instructor_id, empty_topic_id, breakdown=[]))
    assert res.status_code == 422
    assert mock_gemini.call_count == 0


def test_first_call_generates_and_caches(client, mock_gemini, seeded_instructor_id, empty_topic_id):
    mock_gemini.returns('{"suggestion": "Do a live worked example on hashing collisions."}')
    res = client.post("/instructor/insight/generate", json=_request(seeded_instructor_id, empty_topic_id))
    assert res.status_code == 200
    assert mock_gemini.call_count == 1
    assert res.json()["suggestionText"] == "Do a live worked example on hashing collisions."

    cached = supabase.table("instructor_topic_suggestions").select("*").eq("topic_id", empty_topic_id).maybe_single().execute()
    assert cached.data is not None
    assert cached.data["stat_snapshot"] == BREAKDOWN


def test_identical_stats_hit_the_cache_without_a_second_gemini_call(client, mock_gemini, seeded_instructor_id, empty_topic_id):
    mock_gemini.returns('{"suggestion": "First real suggestion."}')
    first = client.post("/instructor/insight/generate", json=_request(seeded_instructor_id, empty_topic_id))
    assert first.status_code == 200
    assert mock_gemini.call_count == 1

    # Same instructor, same topic, byte-identical mistake_breakdown -- this
    # is the entire point of the cache check: it must return the cached text
    # without ever touching Gemini again, even though mock_gemini would
    # happily answer if called.
    second = client.post("/instructor/insight/generate", json=_request(seeded_instructor_id, empty_topic_id))
    assert second.status_code == 200
    assert mock_gemini.call_count == 1  # unchanged -- no second call
    assert second.json()["suggestionText"] == "First real suggestion."


def test_changed_stats_trigger_a_fresh_generation(client, mock_gemini, seeded_instructor_id, empty_topic_id):
    mock_gemini.returns('{"suggestion": "First real suggestion."}')
    first = client.post("/instructor/insight/generate", json=_request(seeded_instructor_id, empty_topic_id))
    assert first.status_code == 200
    assert mock_gemini.call_count == 1

    mock_gemini.returns('{"suggestion": "Updated suggestion for the new stats."}')
    second = client.post(
        "/instructor/insight/generate", json=_request(seeded_instructor_id, empty_topic_id, breakdown=DIFFERENT_BREAKDOWN)
    )
    assert second.status_code == 200
    assert mock_gemini.call_count == 2
    assert second.json()["suggestionText"] == "Updated suggestion for the new stats."


def test_gemini_quota_exceeded_returns_429_not_500(client, mock_gemini, seeded_instructor_id, empty_topic_id):
    mock_gemini.raises(ClientError(429, {"error": {"message": "Resource has been exhausted"}}))
    res = client.post("/instructor/insight/generate", json=_request(seeded_instructor_id, empty_topic_id))
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()


def test_gemini_returns_empty_suggestion_returns_502(client, mock_gemini, seeded_instructor_id, empty_topic_id):
    mock_gemini.returns('{"suggestion": "   "}')
    res = client.post("/instructor/insight/generate", json=_request(seeded_instructor_id, empty_topic_id))
    assert res.status_code == 502
