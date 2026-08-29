"""Unit tests for chunk_text() -- the sliding-window, paragraph-aware text
splitter behind /upload's ingestion pipeline. Pure function, no DB/network,
so these run instantly and don't need any of the other fixtures. Previously
only exercised indirectly (test_upload.py checks that *some* chunks came
back, not the splitting logic's own boundary behavior)."""

from main import chunk_text


def test_empty_text_returns_no_chunks():
    assert chunk_text("") == []


def test_text_shorter_than_chunk_size_is_a_single_chunk():
    assert chunk_text("Hello world") == [{"text": "Hello world", "pageNumber": 1}]


def test_prefers_a_paragraph_break_over_a_single_newline_or_space():
    # chunk_size=20: the window [0:20) contains a "\n\n" at index 12, a "\n"
    # nowhere else, and no space -- the double-newline split point must win.
    text = "A" * 12 + "\n\n" + "B" * 12  # length 26
    chunks = chunk_text(text, chunk_size=20, overlap=5)
    assert chunks == [
        {"text": "A" * 12, "pageNumber": 1},
        {"text": "AAAAA\n\nBBBBBBBBBBBB", "pageNumber": 1},  # overlap re-includes the last 5 A's
        {"text": "BBBB", "pageNumber": 1},
    ]


def test_prefers_a_single_newline_over_a_later_space_even_though_the_space_is_closer_to_the_boundary():
    # The elif chain checks "\n" before " " regardless of position -- a
    # structural break wins even when a space sits closer to the chunk_size
    # cutoff. Also exercises the split_point=-1 hard-cut fallback on the
    # second chunk, where neither break falls past the chunk_size // 2 floor.
    text = "X" * 12 + "\n" + "Y" * 3 + " " + "Z" * 20  # length 37
    chunks = chunk_text(text, chunk_size=20, overlap=0)
    assert chunks == [
        {"text": "X" * 12, "pageNumber": 1},
        {"text": "YYY " + "Z" * 15, "pageNumber": 1},  # hard cut at 20 chars, leading \n stripped
        {"text": "ZZZZZ", "pageNumber": 1},
    ]


def test_overlap_repeats_the_tail_of_the_previous_chunk():
    text = "one two three four five six seven eight nine ten"
    chunks = chunk_text(text, chunk_size=20, overlap=10)
    assert len(chunks) > 1
    # every chunk after the first should share some trailing text of the
    # previous chunk with its own leading text, proving overlap isn't zero
    first_words = chunks[0]["text"].split()
    second_words = chunks[1]["text"].split()
    assert set(first_words) & set(second_words)


def test_a_single_long_word_with_no_break_point_is_hard_cut_at_chunk_size():
    text = "A" * 50
    chunks = chunk_text(text, chunk_size=20, overlap=5)
    assert chunks[0] == {"text": "A" * 20, "pageNumber": 1}
