"""Unit tests for retrieve_context()'s own control flow (retrieval.py) --
previously only exercised end-to-end (via /query and the AI-quality eval
harness), never in isolation. A real populated embedding space isn't
reproducible deterministically in a test, so these monkeypatch retrieval's
own embed_content and the match_chunks RPC directly, at the boundary of
retrieve_context() itself -- everything inside it (query-guard, vector
normalization, RPC parameter construction, exception handling, map_chunk)
is real."""

import asyncio

import pytest

import retrieval as retrieval_module
from retrieval import retrieve_context


class _FakeEmbedding:
    def __init__(self, values):
        self.values = values


class _FakeEmbedResponse:
    def __init__(self, values):
        self.embeddings = [_FakeEmbedding(values)]


class _FakeRpcResult:
    def __init__(self, data):
        self.data = data


class _FakeRpcBuilder:
    def __init__(self, result):
        self._result = result

    def execute(self):
        return self._result


def run(coro):
    return asyncio.run(coro)


def test_blank_query_returns_no_chunks_without_calling_embed_or_rpc(monkeypatch):
    embed_spy = MockCounter()
    rpc_spy = MockCounter()
    monkeypatch.setattr(retrieval_module.gemini_client.models, "embed_content", embed_spy)
    monkeypatch.setattr(retrieval_module.supabase, "rpc", rpc_spy)

    assert run(retrieve_context("   ")) == []
    assert embed_spy.call_count == 0
    assert rpc_spy.call_count == 0


def test_embedding_failure_is_caught_and_returns_no_chunks(monkeypatch):
    def _raise(**kwargs):
        raise RuntimeError("embedding service unreachable")

    monkeypatch.setattr(retrieval_module.gemini_client.models, "embed_content", _raise)
    assert run(retrieve_context("what is a hash table?")) == []


def test_rpc_failure_is_caught_and_returns_no_chunks(monkeypatch):
    monkeypatch.setattr(
        retrieval_module.gemini_client.models,
        "embed_content",
        lambda **kwargs: _FakeEmbedResponse([1.0] * retrieval_module.EMBEDDING_DIMENSIONS),
    )

    def _raise_rpc(name, params):
        raise RuntimeError("supabase unreachable")

    monkeypatch.setattr(retrieval_module.supabase, "rpc", _raise_rpc)
    assert run(retrieve_context("what is a hash table?")) == []


def test_query_vector_is_l2_normalized_before_the_rpc_call(monkeypatch):
    monkeypatch.setattr(
        retrieval_module.gemini_client.models,
        "embed_content",
        lambda **kwargs: _FakeEmbedResponse([3.0, 4.0] + [0.0] * (retrieval_module.EMBEDDING_DIMENSIONS - 2)),
    )
    captured = {}

    def _rpc(name, params):
        captured["name"] = name
        captured["params"] = params
        return _FakeRpcBuilder(_FakeRpcResult([]))

    monkeypatch.setattr(retrieval_module.supabase, "rpc", _rpc)
    run(retrieve_context("what is a hash table?"))

    assert captured["name"] == "match_chunks"
    vector = captured["params"]["query_embedding"]
    # (3, 4, 0, 0, ...) has magnitude 5 -- normalized, the first two
    # components become 0.6 and 0.8 (gemini-embedding-001 requires this
    # manual normalization for a non-default output_dimensionality).
    assert vector[0] == pytest.approx(0.6)
    assert vector[1] == pytest.approx(0.8)
    assert sum(x * x for x in vector) == pytest.approx(1.0)


def test_topic_and_course_filters_pass_through_to_the_rpc_as_is(monkeypatch):
    monkeypatch.setattr(
        retrieval_module.gemini_client.models,
        "embed_content",
        lambda **kwargs: _FakeEmbedResponse([1.0] * retrieval_module.EMBEDDING_DIMENSIONS),
    )
    captured = {}

    def _rpc(name, params):
        captured["params"] = params
        return _FakeRpcBuilder(_FakeRpcResult([]))

    monkeypatch.setattr(retrieval_module.supabase, "rpc", _rpc)
    run(retrieve_context("a question", topic_id="top-hash1", course_id="cs301", top_k=3))

    assert captured["params"]["match_topic_id"] == "top-hash1"
    assert captured["params"]["match_course_id"] == "cs301"
    assert captured["params"]["match_count"] == 3


def test_omitted_topic_and_course_pass_through_as_none_not_dropped(monkeypatch):
    """retrieval.py's own docstring: the SQL function must treat NULL as
    "no filter" -- that only works if these keys are actually present as
    None, not omitted from the RPC params entirely."""
    monkeypatch.setattr(
        retrieval_module.gemini_client.models,
        "embed_content",
        lambda **kwargs: _FakeEmbedResponse([1.0] * retrieval_module.EMBEDDING_DIMENSIONS),
    )
    captured = {}

    def _rpc(name, params):
        captured["params"] = params
        return _FakeRpcBuilder(_FakeRpcResult([]))

    monkeypatch.setattr(retrieval_module.supabase, "rpc", _rpc)
    run(retrieve_context("a question"))

    assert "match_topic_id" in captured["params"] and captured["params"]["match_topic_id"] is None
    assert "match_course_id" in captured["params"] and captured["params"]["match_course_id"] is None


def test_rpc_rows_are_run_through_map_chunk(monkeypatch):
    monkeypatch.setattr(
        retrieval_module.gemini_client.models,
        "embed_content",
        lambda **kwargs: _FakeEmbedResponse([1.0] * retrieval_module.EMBEDDING_DIMENSIONS),
    )
    raw_rows = [
        {"chunk_id": "c1", "chunk_text": "Hash tables map keys to buckets.", "similarity": 0.91, "page_number": 3},
        {"chunk_id": "c2", "chunk_text": "No document title on this one.", "similarity": 0.75},
    ]
    monkeypatch.setattr(retrieval_module.supabase, "rpc", lambda name, params: _FakeRpcBuilder(_FakeRpcResult(raw_rows)))

    chunks = run(retrieve_context("a question"))
    assert len(chunks) == 2
    assert chunks[0]["document_title"] == "Unknown document"  # map_chunk's fallback, no document_title/file_name given
    assert chunks[0]["location"] == 3  # falls back to page_number
    assert chunks[0]["snippet"] == "Hash tables map keys to buckets."
    assert chunks[1]["location"] is None


class MockCounter:
    def __init__(self):
        self.call_count = 0

    def __call__(self, *args, **kwargs):
        self.call_count += 1
        return None
