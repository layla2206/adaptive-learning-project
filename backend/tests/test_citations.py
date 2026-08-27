import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from citations import make_snippet, map_chunk, map_citations


class CitationMappingTests(unittest.TestCase):
    def test_snippet_is_trimmed_at_a_word_boundary(self):
        text = "alpha beta " * 40

        snippet = make_snippet(text)

        self.assertLessEqual(len(snippet), 180)
        self.assertNotIn("  ", snippet)
        self.assertEqual(snippet, snippet.rstrip())
        self.assertTrue(text.startswith(snippet))
        self.assertEqual(text[len(snippet)], " ")

    def test_chunk_maps_document_title_location_and_snippet(self):
        chunk = map_chunk({
            "chunk_id": "chunk-1",
            "document_id": "doc-1",
            "chunk_text": "A source passage about graph traversal.",
            "file_name": "Algorithms.pdf",
            "page_number": 12,
        })

        self.assertEqual(chunk["document_title"], "Algorithms.pdf")
        self.assertEqual(chunk["location"], 12)
        self.assertEqual(chunk["snippet"], "A source passage about graph traversal.")

    def test_citations_map_only_known_chunks_and_keep_card_fields(self):
        citations = map_citations([
            {
                "chunk_id": "chunk-1",
                "chunk_text": "The useful excerpt.",
                "document_title": "Algorithms.pdf",
                "location": 12,
            }
        ], ["chunk-1", "missing"])

        self.assertEqual(len(citations), 1)
        self.assertEqual(citations[0]["mark"], "[1]")
        self.assertEqual(citations[0]["source"], "Algorithms.pdf · Page 12")
        self.assertEqual(citations[0]["excerpt"], "The useful excerpt.")
        self.assertEqual(citations[0]["document_title"], "Algorithms.pdf")
        self.assertEqual(citations[0]["location"], 12)
        self.assertEqual(citations[0]["snippet"], "The useful excerpt.")


if __name__ == "__main__":
    unittest.main()
