"""Unit tests for renumber_inline_citations (main.py) -- pure function, no
Gemini/Supabase calls needed. Regression coverage for a real incident: a
multi-chunk claim cited as one bracket, "[id1, id2]", used to match nothing
(the old regex only accepted a bracket that was EXACTLY one known chunk_id)
and leaked the raw UUIDs straight into the text shown to the student."""

from main import renumber_inline_citations

CHUNKS = [
    {"chunk_id": "chunk-aaa", "chunk_text": "First fact.", "document_title": "Doc.pdf", "location": 1},
    {"chunk_id": "chunk-bbb", "chunk_text": "Second fact.", "document_title": "Doc.pdf", "location": 2},
]


def test_single_id_bracket_renumbers_to_frontend_mark():
    text = "A claim supported by one source [chunk-aaa]."
    rewritten, citations = renumber_inline_citations(text, CHUNKS)
    assert rewritten == "A claim supported by one source [1]."
    assert [c["chunk_id"] for c in citations] == ["chunk-aaa"]


def test_multi_id_bracket_renumbers_to_two_marks_not_left_raw():
    text = "A claim supported by two sources [chunk-aaa, chunk-bbb]."
    rewritten, citations = renumber_inline_citations(text, CHUNKS)
    assert rewritten == "A claim supported by two sources [1][2]."
    assert [c["chunk_id"] for c in citations] == ["chunk-aaa", "chunk-bbb"]
    assert "chunk-aaa" not in rewritten
    assert "chunk-bbb" not in rewritten


def test_multi_id_bracket_with_one_unknown_id_still_renumbers_the_known_one():
    text = "Mixed claim [chunk-aaa, not-a-real-id]."
    rewritten, citations = renumber_inline_citations(text, CHUNKS)
    assert rewritten == "Mixed claim [1]."
    assert [c["chunk_id"] for c in citations] == ["chunk-aaa"]


def test_bracket_with_no_known_ids_is_left_untouched():
    text = "A note that isn't a citation [just some text]."
    rewritten, citations = renumber_inline_citations(text, CHUNKS)
    assert rewritten == text
    assert citations == []


def test_repeated_single_citation_gets_the_same_mark_each_time():
    text = "First mention [chunk-aaa]. Second mention [chunk-aaa]."
    rewritten, citations = renumber_inline_citations(text, CHUNKS)
    assert rewritten == "First mention [1]. Second mention [1]."
    assert len(citations) == 1


def test_marks_are_assigned_in_first_seen_order_across_the_whole_text():
    text = "Cites bbb first [chunk-bbb], then aaa [chunk-aaa]."
    rewritten, citations = renumber_inline_citations(text, CHUNKS)
    assert rewritten == "Cites bbb first [1], then aaa [2]."
    assert [c["chunk_id"] for c in citations] == ["chunk-bbb", "chunk-aaa"]
