import json
import logging
import os
from typing import Any, Iterable, Optional, Union

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
    """Filters out chunks that carry a similarity score below threshold.
    Chunks with no similarity score at all (e.g. fetched directly by
    topic_id rather than via embedding search) were already scoped as
    relevant by the caller and pass through untouched -- the wording-match
    threshold only makes sense as a filter over embedding-ranked results."""
    return [
        chunk for chunk in chunks
        if isinstance(chunk, dict)
        and (
            not isinstance(chunk.get("similarity"), (int, float))
            or chunk["similarity"] >= SIMILARITY_THRESHOLD
        )
    ]


def generate_answer(
    question: str,
    chunks: Iterable[Any],
    gemini_client: Any,
    conversation_context: Optional[str] = None,
    current_section: Optional[str] = None,
) -> str:
    """Generate a plain-text answer grounded only in the supplied chunks.

    conversation_context (prior turns in this session, student+ai) matters
    for a follow-up like "explain more" or "why" -- without it the model has
    no way to know what "more" refers to and, correctly by its own
    instructions below, says it doesn't have enough context even though the
    topic's chunks are right there. Full-explanation calls pass None since
    there's no prior turn yet to reference.

    current_section (the paced-explanation section actually on screen when a
    follow-up was asked) anchors a vague "explain more"/"why" to that one
    section specifically, AND is itself usable content the model can answer
    from directly -- a plain "I don't understand, explain again" needs
    nothing beyond re-explaining that section's own text, and must not fail
    just because the separately-fetched chunk set (below, "Learning
    content") happens not to cover it. Without current_section at all, a
    vague follow-up combined with conversation_context (which includes the
    full prior explanation) and the topic's whole chunk set reads to the
    model as "explain whatever hasn't been covered yet" -- confirmed live:
    it produced a multi-section answer covering the rest of the lecture
    instead of a short, focused reply."""
    if not isinstance(question, str) or not question.strip():
        return NO_CONTEXT_ANSWER

    context_text = _context_text(_relevant_chunks(chunks))
    if not context_text and not current_section:
        return NO_CONTEXT_ANSWER

    history_block = (
        f"\n\nConversation so far, oldest first (for context only -- answer only the question below, "
        f"which may refer back to it, e.g. \"explain more\" or \"why\"):\n{conversation_context}\n"
        if conversation_context else ""
    )
    section_block = (
        f"\n\nThe student is currently reading this specific section of the explanation, and their question "
        f"relates to it -- this is itself valid content to answer from (e.g. a plain \"explain again\" or "
        f"\"I don't understand\" can be answered by re-explaining this section in different words), not just "
        f"background:\n\"\"\"\n{current_section}\n\"\"\"\n"
        if current_section else ""
    )

    prompt = f"""Answer the user's question using only the learning content below and/or the current section
above (if given).
If NEITHER contains enough information, say that you do not have enough context to answer.
Do not invent facts or use knowledge outside what's supplied.
Return only the answer as plain text. Cite supporting chunks inline using their IDs, for example [chunk-id],
when your answer draws from the learning content below -- the current section above doesn't have chunk ids
to cite, so don't invent one for it.
Keep the answer concise (a few sentences, a short paragraph at most) and in plain prose -- do not use section
headings or organize it like a lecture outline, and do not cover other parts of the topic beyond what the
question actually asks, even if the source material below includes them.
{history_block}{section_block}
User question:
{question.strip()}

Learning content:
{context_text or "(none directly retrieved for this question -- rely on the current section above if given)"}"""

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


def generate_structured_explanation(
    question: str,
    chunks: Iterable[Any],
    gemini_client: Any,
    subideas: Optional[list] = None,
) -> Union[str, dict]:
    """Like generate_answer, but for the one-time "explain this topic from
    the ground up" request. Bundles the whole topic's per-sub-idea content
    into a single Gemini call (same grounding rules as generate_answer)
    instead of one call per sub-idea, since a free-tier daily quota makes
    every extra call expensive: each section IS one sub-idea's mini-lesson,
    carrying its own checkQuestion (a mastery-check prompt scoped to that
    one mechanism, e.g. "why does a hash table give faster lookup than an
    unsorted array") and solveSteps (3 step prompts for that sub-idea's own
    "solve end-to-end" check) -- the caller sequences these into one
    self-contained explain/check mini-loop per sub-idea, not one combined
    walkthrough for the whole topic.

    subideas: the topic's sub-idea list (each {"subidea_id", "label"}), if
    any exist yet (get_or_generate_subideas runs lazily on first use, so
    this is populated for essentially every topic with content). Every
    section carries a subideaId from this closed set -- same call, no extra
    Gemini cost -- so a section's granularity is stable and aggregable
    across every student's own (freshly-worded) explanation, rather than an
    id Gemini invents fresh each call. Empty subideas (rare -- a topic with
    no content yet, or generation failed) falls back to sections with
    subideaId=None; the caller can still sequence them by array position.

    Returns the NO_CONTEXT_ANSWER sentinel (not a dict) when there's no
    relevant content, exactly like generate_answer, so callers can check
    for it the same way before touching the dict shape."""
    if not isinstance(question, str) or not question.strip():
        return NO_CONTEXT_ANSWER

    context_text = _context_text(_relevant_chunks(chunks))
    if not context_text:
        return NO_CONTEXT_ANSWER

    valid_subidea_ids = {s["subidea_id"] for s in subideas} if subideas else set()
    if valid_subidea_ids:
        subidea_list = "\n".join(f'- {s["subidea_id"]}: {s["label"]}' for s in subideas)
        subidea_block = f"""

This topic has the following pre-defined sub-ideas -- produce exactly one section per sub-idea below,
in this order, and every section's "subideaId" MUST be exactly the matching id (do not invent new
ones, do not omit any, do not merge two sub-ideas into one section):
{subidea_list}"""
    else:
        subidea_block = ""

    prompt = f"""Answer the user's question using only the learning content below, organized for a
student walking through it step by step, one self-contained mini-lesson (section) at a time.
If the content does not contain enough information, say that you do not have enough context to answer.
Do not invent facts or use knowledge outside the supplied content.
Cite supporting claims inline using the chunk's ID in brackets immediately after the claim, for
example [chunk-id]. Only cite chunk IDs included below.{subidea_block}

Return ONLY strict JSON with this exact shape:
{{
  "sections": [
    {{
      "heading": "...",
      "body": "... markdown, with inline [chunk-id] citations ...",
      "subideaId": "...",
      "checkQuestion": "...",
      "solveSteps": ["...", "...", "..."]
    }}
  ]
}}

Each section is a self-contained mini-lesson on ONE sub-idea -- a student will read it, then
immediately be asked that section's own checkQuestion before moving to the next section, so do not
assume they've seen any other section yet, and do not reference "as covered above/below."

checkQuestion (per section): ONE question that tests understanding of THIS section's specific
mechanism -- not an invitation to summarize everything. For example, for a hash-table section on
lookup speed:
Bad: "Walk me through hash tables in your own words."
Better: "Why does a hash table give you faster lookup than an unsorted array -- what's actually
different about how each one finds a value?"
The question must be answerable using only this section's own content, and must name the specific
mechanism it's testing rather than asking generally "what do you know about X."

solveSteps (per section): exactly 3 short step labels (a few words each, like a checklist heading,
not full sentences) for walking through solving ONE SPECIFIC, concrete example for THIS sub-idea
end-to-end -- not generic steps like "what do you start from?"
Ground every step in one concrete instance (actual class/variable/value names drawn from or
consistent with this section's own body above), not an abstract description of the general
procedure -- the student fills these in as a worked example, so a step must give them something
concrete to act on rather than making them invent their own example from scratch.
For a sub-idea on casting after popping from a generic Object stack:
Bad: "Cast popped Objects back to type" (abstract -- cast what, to what?)
Better: "Cast obj back to Box" (names the actual class from this section)
All 3 steps must walk through the SAME one concrete example, start to finish (e.g. push a specific
named object, pop it, then act on that same object) -- not three unrelated abstract actions.

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
        # A subideaId outside the closed set (Gemini drifting, or no
        # subideas supplied at all) is dropped rather than failing the whole
        # explanation -- this tagging is supplementary instrumentation, not
        # something the student-facing explanation should ever break over.
        raw_subidea_id = section.get("subideaId") if isinstance(section, dict) else None
        subidea_id = raw_subidea_id if raw_subidea_id in valid_subidea_ids else None

        check_question = section.get("checkQuestion")
        check_question = check_question.strip() if isinstance(check_question, str) and check_question.strip() else None

        raw_steps = section.get("solveSteps")
        solve_steps = None
        if isinstance(raw_steps, list) and all(isinstance(step, str) and step.strip() for step in raw_steps):
            solve_steps = [step.strip() for step in raw_steps]

        sections.append({
            "heading": heading.strip(),
            "body": body.strip(),
            "subideaId": subidea_id,
            "checkQuestion": check_question,
            "solveSteps": solve_steps,
        })

    return {"sections": sections}