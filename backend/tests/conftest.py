"""
Shared pytest fixtures for the backend edge-case / failure-scenario suite.

Run from backend/ (matches how uvicorn is normally started here) so
main.py's `load_dotenv(dotenv_path="../.env")` resolves the same way it
does for the real dev server:

    cd backend && python -m pytest tests/ -v

These tests exercise real business logic (FastAPI TestClient -> the real
route handlers) against the real dev Supabase project -- there's no
separate test database, matching this whole project's existing
convention (see tests/e2e/ and every ad hoc script this session). Gemini
itself is monkeypatched per-test via `mock_gemini`, never called for real,
so these tests cost zero quota and can run as often as needed.
"""

import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main as app_module  # noqa: E402
import retrieval as retrieval_module  # noqa: E402
from main import app, supabase  # noqa: E402


@pytest.fixture
def client():
    return TestClient(app)


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text


@pytest.fixture
def mock_gemini(monkeypatch):
    """Replaces gemini_client.models.generate_content for the duration of one
    test. Usage:

        mock_gemini.returns('{"explain_score": 85, ...}')   # next call succeeds
        mock_gemini.raises(SomeException())                  # next call raises
        mock_gemini.call_count                                # how many times it was invoked

    Unlike the MOCK_GEMINI env-var seam (built for the browser-driven E2E
    suite, which can't monkeypatch Python objects), this gives each pytest
    test full control over exactly what Gemini "returns" -- including
    responses no real fixture table should ever need to produce, like
    invalid JSON or a raised quota error, which is exactly the point of a
    failure-scenario test.
    """

    class Controller:
        def __init__(self):
            self.call_count = 0
            self.last_contents = None
            self._next_text = None
            self._next_exception = None

        def returns(self, text: str):
            self._next_text = text
            self._next_exception = None

        def raises(self, exc: Exception):
            self._next_exception = exc
            self._next_text = None

        def _generate_content(self, *, model, contents, config=None):
            self.call_count += 1
            self.last_contents = contents
            if self._next_exception is not None:
                raise self._next_exception
            return _FakeResponse(self._next_text if self._next_text is not None else "{}")

    controller = Controller()
    monkeypatch.setattr(app_module.gemini_client.models, "generate_content", controller._generate_content)
    return controller


@pytest.fixture
def mock_embeddings(monkeypatch):
    """Replaces embed_content for the duration of one test -- on BOTH of the
    two separate Gemini client instances this backend has. main.py's
    gemini_client is used by /upload's ingestion pipeline (generate_embeddings,
    contents is a list of chunk strings); retrieval.py has its own,
    independently-constructed genai.Client (contents is a single query
    string) used only by /query. They are genuinely different Python objects
    even though they hit the same API/model, so patching one does not patch
    the other -- a real gap discovered while writing the /query tests, not a
    hypothetical one. embed_content is a separate SDK method from
    generate_content (different response shape: .embeddings[].values, not
    .text), so mock_gemini above doesn't cover either of these. Returns a
    fixed-length fake vector per input string; _normalize() just needs some
    nonzero 768-dim vector to run its real math unchanged, so this costs zero
    embedding quota."""

    class _FakeEmbedding:
        def __init__(self, values):
            self.values = values

    class _FakeEmbedResponse:
        def __init__(self, embeddings):
            self.embeddings = embeddings

    def _embed_content(*, model, contents, config=None):
        batch = [contents] if isinstance(contents, str) else contents
        return _FakeEmbedResponse([_FakeEmbedding([0.01] * app_module.EMBEDDING_DIMENSIONS) for _ in batch])

    monkeypatch.setattr(app_module.gemini_client.models, "embed_content", _embed_content)
    monkeypatch.setattr(retrieval_module.gemini_client.models, "embed_content", _embed_content)


@pytest.fixture(scope="session")
def seeded_instructor_id():
    """The real seeded instructor (Layla) -- read-only lookup, nothing to
    tear down. instructor_topic_suggestions.generated_by FKs to instructors,
    so this must be a real row, not an arbitrary UUID."""
    res = supabase.table("instructors").select("instructor_id").limit(1).execute()
    assert res.data, "No seeded instructor found -- run backend/supabase/seed_and_policies.sql first."
    return res.data[0]["instructor_id"]


@pytest.fixture(scope="session")
def seeded_topic():
    """The one course/topic with real embedded content this whole project's
    manual and E2E testing already relies on -- see auth_schema.sql's own
    comment on why cs301 is the only real option."""
    return {"course_id": "cs301", "topic_id": "top-hash1"}


@pytest.fixture
def empty_topic_id(seeded_topic):
    """A real topic row (satisfies every FK the endpoints under test insert
    against) that deliberately has zero chunks -- for testing the
    "no learning content found" failure path without a topic_id so fake it
    trips an unrelated FK violation on the sessions insert before the
    endpoint even gets to its own content check."""
    topic_id = f"pt{uuid.uuid4().hex[:6]}"
    supabase.table("topics").insert(
        {"topic_id": topic_id, "course_id": seeded_topic["course_id"], "topic_name": "Pytest Empty Topic", "sort_order": 999}
    ).execute()
    yield topic_id
    # session_messages.session_id FKs to sessions with no ON DELETE CASCADE --
    # a test that writes messages against a session on this topic (e.g.
    # /query) must have those deleted before the sessions delete below, or
    # this raises a foreign-key violation instead of cleaning up.
    session_rows = supabase.table("sessions").select("session_id").eq("topic_id", topic_id).execute()
    session_ids = [s["session_id"] for s in (session_rows.data or [])]
    if session_ids:
        supabase.table("session_messages").delete().in_("session_id", session_ids).execute()
    supabase.table("sessions").delete().eq("topic_id", topic_id).execute()
    supabase.table("topics").delete().eq("topic_id", topic_id).execute()


@pytest.fixture
def tagged_reference_document(seeded_topic):
    """Tags one of seeded_topic's existing documents as a quiz reference --
    /practice/generate 200s with {"error": ...} (never reaching Gemini) until
    at least one document on the topic carries this. Mirrors
    tests/e2e/helpers/fixtures.ts's tagReferenceDocument for the same
    precondition on the Playwright side. Untags on teardown."""
    res = supabase.table("documents").select("document_id").eq("topic_id", seeded_topic["topic_id"]).limit(1).execute()
    assert res.data, f"No document found on {seeded_topic['topic_id']} to tag as a reference document."
    document_id = res.data[0]["document_id"]
    supabase.table("documents").update({"document_type": "quiz"}).eq("document_id", document_id).execute()
    yield document_id
    supabase.table("documents").update({"document_type": None}).eq("document_id", document_id).execute()


@pytest.fixture
def tagged_exam_reference_document(seeded_topic):
    """Tags one of seeded_topic's existing documents as an exam reference --
    mirrors tagged_reference_document but for final_exam's own
    reference_document_type ('exam') rather than quiz's fallback. Untags on
    teardown."""
    res = supabase.table("documents").select("document_id").eq("topic_id", seeded_topic["topic_id"]).limit(1).execute()
    assert res.data, f"No document found on {seeded_topic['topic_id']} to tag as an exam reference document."
    document_id = res.data[0]["document_id"]
    supabase.table("documents").update({"document_type": "exam"}).eq("document_id", document_id).execute()
    yield document_id
    supabase.table("documents").update({"document_type": None}).eq("document_id", document_id).execute()


@pytest.fixture
def second_topic_with_content(seeded_topic, seeded_instructor_id):
    """A second real topic in seeded_topic's own course, with its own
    document + one embedded-looking chunk (a fixed non-null vector, no real
    Gemini embed call) -- lets multi-topic quiz / final_exam tests aggregate
    content across more than one topic without needing mock_embeddings.
    Deletes everything it created on teardown."""
    topic_id = f"pt{uuid.uuid4().hex[:6]}"
    supabase.table("topics").insert(
        {"topic_id": topic_id, "course_id": seeded_topic["course_id"], "topic_name": "Pytest Second Topic", "sort_order": 998}
    ).execute()
    document_id = f"pt{uuid.uuid4().hex[:6]}"
    supabase.table("documents").insert({
        "document_id": document_id,
        "instructor_id": seeded_instructor_id,
        "course_id": seeded_topic["course_id"],
        "topic_id": topic_id,
        "file_name": "pytest-second-topic.txt",
        "file_type": "txt",
    }).execute()
    chunk_id = f"ptc{uuid.uuid4().hex[:8]}"
    supabase.table("chunks").insert({
        "chunk_id": chunk_id,
        "document_id": document_id,
        "topic_id": topic_id,
        "page_number": 1,
        "chunk_text": "Merge sort splits the array in half, recursively sorts each half, and merges the results.",
        "embedding": [0.01] * 768,
    }).execute()
    yield {"topic_id": topic_id, "document_id": document_id}
    supabase.table("chunks").delete().eq("document_id", document_id).execute()
    supabase.table("documents").delete().eq("document_id", document_id).execute()
    supabase.table("topics").delete().eq("topic_id", topic_id).execute()


@pytest.fixture
def fresh_student_id():
    """A student row scoped to this pytest run only (unique name/email each
    time via uuid4), separate from both the E2E suite's dedicated student
    and any real seeded data -- deleted at teardown so this suite never
    accumulates rows in the shared dev project."""
    unique = uuid.uuid4().hex[:8]
    res = supabase.table("students").insert({"name": f"Pytest Student {unique}", "email": f"pytest.{unique}@example.edu"}).execute()
    student_id = res.data[0]["student_id"]
    yield student_id
    supabase.table("student_answers").delete().eq("student_id", student_id).execute()
    supabase.table("mastery_checks").delete().eq("student_id", student_id).execute()
    supabase.table("retry_attempts").delete().eq("student_id", student_id).execute()
    supabase.table("student_profiles").delete().eq("student_id", student_id).execute()
    supabase.table("topic_progress").delete().eq("student_id", student_id).execute()
    # session_messages.session_id FKs to sessions with no ON DELETE CASCADE
    # (same fact tests/e2e/helpers/fixtures.ts's resetTestStudentProgress
    # had to learn the hard way) -- delete messages before their parent
    # sessions or this delete silently... doesn't silently fail here, since
    # Python's postgrest client DOES raise on the FK violation, but it would
    # still leave the session row orphaned if left unhandled.
    session_rows = supabase.table("sessions").select("session_id").eq("student_id", student_id).execute()
    session_ids = [s["session_id"] for s in (session_rows.data or [])]
    if session_ids:
        supabase.table("session_messages").delete().in_("session_id", session_ids).execute()
    supabase.table("sessions").delete().eq("student_id", student_id).execute()
    supabase.table("students").delete().eq("student_id", student_id).execute()
