"""Concurrency test for get_or_create_session() -- a check-then-insert
(find_active_session, then insert if none found) that used to have no
locking or upsert-on-conflict. Two requests racing to start the same
student's first session on a topic (a double-click, a retried network
request, two browser tabs) is a real, plausible scenario this project never
had a test for -- this test caught it creating two session rows instead of
one before main.py's get_or_create_session gained its per-(student, topic,
session_type) lock."""

import threading

from main import get_or_create_session, supabase


def test_concurrent_session_creation_for_a_brand_new_student_topic_pair(fresh_student_id, seeded_topic):
    results = []
    barrier = threading.Barrier(2)

    def worker():
        barrier.wait()  # maximize the actual overlap window between both threads' find-then-insert
        results.append(get_or_create_session(fresh_student_id, seeded_topic["topic_id"]))

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    sessions = (
        supabase.table("sessions")
        .select("session_id")
        .eq("student_id", fresh_student_id)
        .eq("topic_id", seeded_topic["topic_id"])
        .execute()
    )
    assert len(sessions.data) == 1, (
        f"expected exactly one session row for a race between two concurrent "
        f"get_or_create_session calls, found {len(sessions.data)}"
    )
    assert results[0] == results[1]  # both callers must agree on the same session_id
