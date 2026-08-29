"""Tests for POST /profile/update -- a thin upsert wrapper with zero test
coverage before this pass."""

from main import supabase


def test_creates_a_new_student_profile_row(client, fresh_student_id, seeded_topic):
    res = client.post(
        "/profile/update",
        json={
            "student_id": fresh_student_id,
            "topic_id": seeded_topic["topic_id"],
            "mastery_percent": 55,
            "level": "Intermediate",
        },
    )
    assert res.status_code == 200
    assert res.json()["success"] is True

    row = (
        supabase.table("student_profiles")
        .select("mastery_percent, level")
        .eq("student_id", fresh_student_id)
        .eq("topic_id", seeded_topic["topic_id"])
        .single()
        .execute()
    )
    assert row.data["mastery_percent"] == 55
    assert row.data["level"] == "Intermediate"


def test_upserts_the_same_row_instead_of_duplicating_it(client, fresh_student_id, seeded_topic):
    for mastery, level in [(40, "Intermediate"), (100, "Advanced")]:
        res = client.post(
            "/profile/update",
            json={
                "student_id": fresh_student_id,
                "topic_id": seeded_topic["topic_id"],
                "mastery_percent": mastery,
                "level": level,
            },
        )
        assert res.status_code == 200

    rows = (
        supabase.table("student_profiles")
        .select("mastery_percent, level")
        .eq("student_id", fresh_student_id)
        .eq("topic_id", seeded_topic["topic_id"])
        .execute()
    )
    assert len(rows.data) == 1  # second call updated the same row, not a second insert
    assert rows.data[0]["mastery_percent"] == 100
    assert rows.data[0]["level"] == "Advanced"


def test_unknown_topic_id_returns_500(client, fresh_student_id):
    res = client.post(
        "/profile/update",
        json={
            "student_id": fresh_student_id,
            "topic_id": "not-a-real-topic",
            "mastery_percent": 50,
            "level": "Intermediate",
        },
    )
    assert res.status_code == 500  # topic_id FK violation, caught by the endpoint's generic handler
