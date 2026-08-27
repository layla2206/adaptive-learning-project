import logging
import os
from typing import Any, Iterable


logger = logging.getLogger("answer_generation")
NO_CONTEXT_ANSWER = "I don't have enough context to answer that question."
try:
    SIMILARITY_THRESHOLD = float(os.environ.get("RAG_SIMILARITY_THRESHOLD", "0.7"))
except ValueError:
    SIMILARITY_THRESHOLD = 0.7


class AnswerGenerationError(RuntimeError):
    """Raised when Gemini cannot generate an answer from the supplied context."""


def _context_text(chunks: Iterable[Any]) -> str:
    context = []
    for index, chunk in enumerate(chunks, start=1):
        if isinstance(chunk, dict):
            text = chunk.get("chunk_text") or chunk.get("text")
            chunk_id = chunk.get("chunk_id", index)
        else:
            text = str(chunk)
            chunk_id = index
        if isinstance(text, str) and text.strip():
            context.append(f"[{chunk_id}] {text.strip()}")
    return "\n\n".join(context)


def _relevant_chunks(chunks: Iterable[Any]) -> list[Any]:
    return [
        chunk for chunk in chunks
        if isinstance(chunk, dict)
        and isinstance(chunk.get("similarity"), (int, float))
        and chunk["similarity"] >= SIMILARITY_THRESHOLD
    ]


def generate_answer(question: str, chunks: Iterable[Any], gemini_client: Any) -> str:
    """Generate a plain-text answer grounded only in the supplied chunks."""
    if not isinstance(question, str) or not question.strip():
        return NO_CONTEXT_ANSWER

    context_text = _context_text(_relevant_chunks(chunks))
    if not context_text:
        return NO_CONTEXT_ANSWER

    prompt = f"""Answer the user's question using only the learning content below.
If the content does not contain enough information, say that you do not have enough context to answer.
Do not invent facts or use knowledge outside the supplied content.
Return only the answer as plain text. Cite supporting chunks inline using their IDs, for example [chunk-id].

User question:
{question.strip()}

Learning content:
{context_text}"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
    except TimeoutError as exc:
        logger.error("Gemini answer generation timed out: %s", exc)
        raise AnswerGenerationError("Answer generation timed out") from exc
    except Exception as exc:
        logger.error("Gemini answer generation failed: %s", exc)
        raise AnswerGenerationError("Answer generation failed") from exc

    answer = getattr(response, "text", None)
    if not isinstance(answer, str) or not answer.strip():
        raise AnswerGenerationError("Gemini returned an empty answer")
    return answer.strip()