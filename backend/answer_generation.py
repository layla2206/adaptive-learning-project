import json
import logging
import os
from typing import Any, Iterable, Union

from dotenv import load_dotenv

# Defensive, same as retrieval.py: main.py imports this module before it
# calls its own load_dotenv(), so RAG_SIMILARITY_THRESHOLD below would
# otherwise silently read an empty environment and always fall back to the
# hardcoded default, no matter what .env actually says.
load_dotenv(dotenv_path="../.env")

logger = logging.getLogger("answer_generation")
NO_CONTEXT_ANSWER = "I don't have enough context to answer that question."
# gemini-embedding-001 cosine similarities for this corpus run much lower than
# 0.7 even for genuinely relevant chunks -- measured a real "hash table"
# question against its own topic's chunks topping out at 0.73, and a
# same-topic "sorting algorithm" question topping out at 0.68, while a
# deliberately unrelated question against the same chunks topped out at 0.47.
# 0.7 was clipping true matches essentially at random depending on wording;
# 0.6 sits cleanly above the irrelevant cluster and below the relevant one.
try:
    SIMILARITY_THRESHOLD = float(os.environ.get("RAG_SIMILARITY_THRESHOLD", "0.6"))
except ValueError:
    SIMILARITY_THRESHOLD = 0.6


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
            model="gemini-3.6-flash",
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


def generate_structured_explanation(question: str, chunks: Iterable[Any], gemini_client: Any) -> Union[str, dict]:
    """Like generate_answer, but for the one-time "explain this topic from
    the ground up" request. Bundles three things into a single Gemini call
    (same grounding rules as generate_answer) instead of three separate
    ones, since a free-tier daily quota makes every extra call expensive:

    - sections: the explanation broken into logical, Continue-button-paced
      chunks instead of one wall of text.
    - checkQuestion: a mastery-check prompt scoped to one specific mechanism
      the explanation just covered (e.g. "why does a hash table give faster
      lookup than an unsorted array"), replacing a generic, static
      "explain this in your own words."
    - solveSteps: 3 topic-specific step prompts for the "solve end-to-end"
      mastery check, replacing today's generic "what do you start from?"

    Returns the NO_CONTEXT_ANSWER sentinel (not a dict) when there's no
    relevant content, exactly like generate_answer, so callers can check
    for it the same way before touching the dict shape."""
    if not isinstance(question, str) or not question.strip():
        return NO_CONTEXT_ANSWER

    context_text = _context_text(_relevant_chunks(chunks))
    if not context_text:
        return NO_CONTEXT_ANSWER

    prompt = f"""Answer the user's question using only the learning content below, organized for a
student walking through it step by step.
If the content does not contain enough information, say that you do not have enough context to answer.
Do not invent facts or use knowledge outside the supplied content.
Cite supporting claims inline using the chunk's ID in brackets immediately after the claim, for
example [chunk-id]. Only cite chunk IDs included below.

Return ONLY strict JSON with this exact shape:
{{
  "sections": [{{"heading": "...", "body": "... markdown, with inline [chunk-id] citations ..."}}],
  "checkQuestion": "...",
  "solveSteps": ["...", "...", "..."]
}}

sections: break the explanation into 3-6 logical sections following the content's own natural
structure (e.g. motivation, the core mechanism, edge cases, performance) -- each section should
cover one coherent idea, not an arbitrary word-count split.

checkQuestion: ONE question that tests understanding of a specific mechanism or comparison from the
explanation -- not an invitation to summarize everything. For example, for a hash table topic:
Bad: "Walk me through hash tables in your own words."
Better: "Why does a hash table give you faster lookup than an unsorted array -- what's actually
different about how each one finds a value?"
The question must be answerable using only the content below, and must name the specific mechanism
or comparison it's testing rather than asking generally "what do you know about X."

solveSteps: exactly 3 short step labels (a few words each, like a checklist heading, not full
sentences) for walking through solving one representative problem for this topic end-to-end, scoped
to this topic's own method -- not generic steps like "what do you start from?"

User question:
{question.strip()}

Learning content:
{context_text}"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
    except TimeoutError as exc:
        logger.error("Gemini structured explanation timed out: %s", exc)
        raise AnswerGenerationError("Answer generation timed out") from exc
    except Exception as exc:
        logger.error("Gemini structured explanation failed: %s", exc)
        raise AnswerGenerationError("Answer generation failed") from exc

    try:
        parsed = json.loads(response.text)
    except (TypeError, ValueError) as exc:
        raise AnswerGenerationError("Gemini returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise AnswerGenerationError("Gemini returned an invalid explanation")

    raw_sections = parsed.get("sections")
    if not isinstance(raw_sections, list) or not raw_sections:
        raise AnswerGenerationError("Gemini returned no explanation sections")

    sections = []
    for section in raw_sections:
        heading = section.get("heading") if isinstance(section, dict) else None
        body = section.get("body") if isinstance(section, dict) else None
        if not isinstance(heading, str) or not heading.strip() or not isinstance(body, str) or not body.strip():
            raise AnswerGenerationError("Gemini returned an invalid explanation section")
        sections.append({"heading": heading.strip(), "body": body.strip()})

    check_question = parsed.get("checkQuestion")
    check_question = check_question.strip() if isinstance(check_question, str) and check_question.strip() else None

    raw_steps = parsed.get("solveSteps")
    solve_steps = None
    if isinstance(raw_steps, list) and all(isinstance(step, str) and step.strip() for step in raw_steps):
        solve_steps = [step.strip() for step in raw_steps]

    return {"sections": sections, "checkQuestion": check_question, "solveSteps": solve_steps}