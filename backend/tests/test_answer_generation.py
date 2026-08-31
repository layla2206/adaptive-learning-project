import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parents[1]))

from answer_generation import AnswerGenerationError, NO_CONTEXT_ANSWER, generate_answer, generate_structured_explanation


class FakeGeminiClient:
    def __init__(self, response_text="Grounded answer [chunk-1].", error=None):
        self.response_text = response_text
        self.error = error
        self.models = self

    def generate_content(self, **kwargs):
        if self.error:
            raise self.error
        self.request = kwargs
        return SimpleNamespace(text=self.response_text)


class AnswerGenerationTests(unittest.TestCase):
    def test_empty_chunks_return_no_context_answer_without_calling_model(self):
        client = FakeGeminiClient()

        answer = generate_answer("What is traversal?", [], client)

        self.assertEqual(answer, NO_CONTEXT_ANSWER)
        self.assertFalse(hasattr(client, "request"))

    def test_generates_plain_text_answer_from_chunks(self):
        client = FakeGeminiClient()

        answer = generate_answer("What is traversal?", [
            {
                "chunk_id": "chunk-1",
                "chunk_text": "Traversal visits graph nodes.",
                "similarity": 0.9,
            }
        ], client)

        self.assertEqual(answer, "Grounded answer [chunk-1].")
        self.assertEqual(client.request["model"], "gemini-3.6-flash")
        self.assertIn("What is traversal?", client.request["contents"])
        self.assertIn("[chunk-1] Traversal visits graph nodes.", client.request["contents"])

    def test_below_threshold_returns_fallback_without_calling_model(self):
        client = FakeGeminiClient()

        answer = generate_answer("What is traversal?", [
            {
                "chunk_id": "chunk-1",
                "chunk_text": "Unrelated content.",
                "similarity": 0.1,  # unambiguously below any reasonable threshold, not tied to the current .env value
            }
        ], client)

        self.assertEqual(answer, NO_CONTEXT_ANSWER)
        self.assertFalse(hasattr(client, "request"))

    def test_model_failure_is_wrapped(self):
        client = FakeGeminiClient(error=TimeoutError("timed out"))

        with self.assertRaises(AnswerGenerationError):
            generate_answer("What is traversal?", [{"chunk_text": "Some context.", "similarity": 0.9}], client)

    def test_chunks_without_similarity_score_are_not_filtered_out(self):
        """Chunks fetched directly by topic_id (a follow-up question's
        grounding set) carry no similarity score -- they must still reach
        the model instead of being treated as below-threshold."""
        client = FakeGeminiClient()

        answer = generate_answer("can you explain in more detail?", [
            {"chunk_id": "chunk-1", "chunk_text": "Traversal visits graph nodes."},
        ], client)

        self.assertEqual(answer, "Grounded answer [chunk-1].")
        self.assertIn("[chunk-1] Traversal visits graph nodes.", client.request["contents"])

    def test_conversation_context_is_included_when_provided(self):
        client = FakeGeminiClient()

        generate_answer(
            "can you explain more?",
            [{"chunk_id": "chunk-1", "chunk_text": "Traversal visits graph nodes.", "similarity": 0.9}],
            client,
            conversation_context="student: what is traversal?\nai: Traversal visits graph nodes [chunk-1].",
        )

        self.assertIn("what is traversal?", client.request["contents"])
        self.assertIn("can you explain more?", client.request["contents"])

    def test_no_conversation_context_omits_history_block(self):
        client = FakeGeminiClient()

        generate_answer(
            "What is traversal?",
            [{"chunk_id": "chunk-1", "chunk_text": "Traversal visits graph nodes.", "similarity": 0.9}],
            client,
        )

        self.assertNotIn("Conversation so far", client.request["contents"])


CHUNKS = [{"chunk_id": "chunk-1", "chunk_text": "Traversal visits graph nodes.", "similarity": 0.9}]


class StructuredExplanationTests(unittest.TestCase):
    def test_empty_chunks_return_no_context_sentinel_without_calling_model(self):
        client = FakeGeminiClient()

        result = generate_structured_explanation("What is traversal?", [], client)

        self.assertEqual(result, NO_CONTEXT_ANSWER)
        self.assertFalse(hasattr(client, "request"))

    def test_returns_sections_check_question_and_solve_steps(self):
        """Each section is now its own self-contained mini-lesson, so
        checkQuestion/solveSteps live per-section, not once for the whole
        explanation -- the per-sub-idea explain/check loop sequences
        through sections one at a time (see main.py's per-sub-idea
        /mastery/check)."""
        client = FakeGeminiClient(response_text=json.dumps({
            "sections": [
                {
                    "heading": "Motivation",
                    "body": "Why this matters [chunk-1].",
                    "checkQuestion": "Why is this faster than the naive approach?",
                    "solveSteps": ["Identify the input", "Apply the rule", "Check the result"],
                },
                {
                    "heading": "The Mechanism",
                    "body": "How it works [chunk-1].",
                    "checkQuestion": "What determines which bucket an item lands in?",
                    "solveSteps": ["Pick a key", "Run the rule", "Land on a slot"],
                },
            ],
        }))

        result = generate_structured_explanation("Explain traversal from the ground up.", CHUNKS, client)

        self.assertEqual([s["heading"] for s in result["sections"]], ["Motivation", "The Mechanism"])
        self.assertEqual(result["sections"][0]["checkQuestion"], "Why is this faster than the naive approach?")
        self.assertEqual(result["sections"][0]["solveSteps"], ["Identify the input", "Apply the rule", "Check the result"])
        self.assertEqual(result["sections"][1]["checkQuestion"], "What determines which bucket an item lands in?")
        self.assertIn("[chunk-1]", client.request["contents"])

    def test_missing_check_question_and_solve_steps_fall_back_to_none(self):
        client = FakeGeminiClient(response_text=json.dumps({
            "sections": [{"heading": "Motivation", "body": "Why this matters [chunk-1]."}],
        }))

        result = generate_structured_explanation("Explain traversal.", CHUNKS, client)

        self.assertIsNone(result["sections"][0]["checkQuestion"])
        self.assertIsNone(result["sections"][0]["solveSteps"])

    def test_missing_sections_raises(self):
        client = FakeGeminiClient(response_text=json.dumps({"checkQuestion": "Why?"}))

        with self.assertRaises(AnswerGenerationError):
            generate_structured_explanation("Explain traversal.", CHUNKS, client)

    def test_invalid_json_raises(self):
        client = FakeGeminiClient(response_text="not json")

        with self.assertRaises(AnswerGenerationError):
            generate_structured_explanation("Explain traversal.", CHUNKS, client)

    def test_model_failure_is_wrapped(self):
        client = FakeGeminiClient(error=TimeoutError("timed out"))

        with self.assertRaises(AnswerGenerationError):
            generate_structured_explanation("Explain traversal.", CHUNKS, client)


if __name__ == "__main__":
    unittest.main()