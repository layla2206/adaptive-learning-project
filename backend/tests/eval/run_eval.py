"""
AI-quality evaluation harness for the RAG tutoring pipeline -- measures
retrieval, groundedness, fallback correctness, latency, and mastery-check
scoring consistency against the REAL Gemini API and the real cs301 content.

THIS SPENDS REAL, SHARED GEMINI QUOTA (~9 generate_content calls +
~7 embed_content calls for the dataset in eval_dataset.json). It is
deliberately NOT part of pytest/CI and never runs automatically -- run it
by hand, once, when you're ready to pull real numbers for a report:

    cd backend && python -m tests.eval.run_eval

Writes tests/eval/eval_results.json (the source of truth for any numbers
quoted in a report) and prints a human-readable summary.
"""

import asyncio
import json
import re
import statistics
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from answer_generation import NO_CONTEXT_ANSWER, SIMILARITY_THRESHOLD, generate_answer  # noqa: E402
from retrieval import retrieve_context  # noqa: E402
from main import supabase, gemini_client  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

DATASET_PATH = Path(__file__).parent / "eval_dataset.json"
RESULTS_PATH = Path(__file__).parent / "eval_results.json"
COURSE_ID = "cs301"

CITATION_RE = re.compile(r"\[([\w-]+)\]")
# Catches both decline paths: the exact NO_CONTEXT_ANSWER constant (zero
# chunks passed the similarity threshold -> generate_answer short-circuits
# before ever calling Gemini) AND the model declining in its own words after
# being called with context that DID pass threshold but wasn't actually
# sufficient to answer the specific question -- these are different
# phenomena with different quota cost and different implications, kept as
# separate fields below rather than collapsed into one boolean.
DECLINE_RE = re.compile(r"don.t have enough context|do not have enough context", re.IGNORECASE)


def extract_citation_ids(answer: str) -> list[str]:
    return CITATION_RE.findall(answer)


def is_decline(answer: str) -> bool:
    return bool(DECLINE_RE.search(answer))


async def run_answerable_case(case: dict) -> dict:
    t0 = time.perf_counter()
    chunks = await retrieve_context(case["question"], topic_id=case["topic_id"], course_id=COURSE_ID)
    t1 = time.perf_counter()
    answer = generate_answer(case["question"], chunks, gemini_client)
    t2 = time.perf_counter()

    above_threshold = [c for c in chunks if isinstance(c.get("similarity"), (int, float)) and c["similarity"] >= SIMILARITY_THRESHOLD]
    valid_ids = {c["chunk_id"] for c in above_threshold if c.get("chunk_id")}
    cited_ids = extract_citation_ids(answer)
    valid_citations = [cid for cid in cited_ids if cid in valid_ids]

    declined = is_decline(answer)
    return {
        "topic_id": case["topic_id"],
        "topic_name": case["topic_name"],
        "question": case["question"],
        "answer": answer,
        "retrieved_count": len(chunks),
        "above_threshold_count": len(above_threshold),
        "top1_similarity": max((c.get("similarity", 0) for c in chunks), default=0),
        "retrieval_hit": len(above_threshold) > 0,
        # A real grounded answer requires BOTH retrieval to have found
        # relevant chunks AND the model to have actually used them -- these
        # can and do diverge (see the "capital of France" / "do not have
        # enough context" case this harness's first run surfaced).
        "declined_to_answer": declined,
        "grounded_answer": len(above_threshold) > 0 and not declined,
        "citation_count": len(cited_ids),
        "valid_citation_count": len(valid_citations),
        "retrieval_latency_s": round(t1 - t0, 3),
        "generation_latency_s": round(t2 - t1, 3),
        "total_latency_s": round(t2 - t0, 3),
    }


async def run_unanswerable_case(case: dict) -> dict:
    t0 = time.perf_counter()
    chunks = await retrieve_context(case["question"], topic_id=case["topic_id"], course_id=COURSE_ID)
    above_threshold = [c for c in chunks if isinstance(c.get("similarity"), (int, float)) and c["similarity"] >= SIMILARITY_THRESHOLD]
    answer = generate_answer(case["question"], chunks, gemini_client)
    t1 = time.perf_counter()
    return {
        "topic_id": case["topic_id"],
        "question": case["question"],
        "answer": answer,
        "above_threshold_count": len(above_threshold),
        "correctly_declined": is_decline(answer),
        # True = the zero-cost hard fallback fired (no chunk passed
        # threshold, generate_answer never called Gemini). False = threshold
        # was crossed by an off-topic question anyway (a retrieval-precision
        # miss) and it took a real Gemini call for the model to decline.
        "hard_fallback": answer.strip() == NO_CONTEXT_ANSWER,
        "total_latency_s": round(t1 - t0, 3),
    }


def run_mastery_consistency_check() -> dict:
    """Runs the SAME representative answer through /mastery/check twice, for
    the same topic, to measure how stable the LLM-as-judge scoring is --
    real variance here is a legitimate risk for a system where the score
    gates whether a student is told they've mastered a topic."""
    client = TestClient(app)
    unique = uuid.uuid4().hex[:8]
    student = supabase.table("students").insert({"name": f"Eval Student {unique}", "email": f"eval.{unique}@example.edu"}).execute()
    student_id = student.data[0]["student_id"]

    sample_answer = (
        "A hash table maps keys to array slots using a hash function. When two keys hash to the "
        "same slot, that's a collision -- it's commonly resolved with chaining (each slot holds a "
        "linked list of entries) or open addressing (probing for the next free slot)."
    )
    scores = []
    try:
        for _ in range(2):
            res = client.post(
                "/mastery/check",
                json={"student_id": student_id, "topic_id": "top-hash1", "explanation": sample_answer},
            )
            if res.status_code == 200:
                scores.append(res.json().get("explainScore"))
    finally:
        supabase.table("student_answers").delete().eq("student_id", student_id).execute()
        supabase.table("mastery_checks").delete().eq("student_id", student_id).execute()
        session_rows = supabase.table("sessions").select("session_id").eq("student_id", student_id).execute()
        session_ids = [s["session_id"] for s in (session_rows.data or [])]
        if session_ids:
            supabase.table("session_messages").delete().in_("session_id", session_ids).execute()
        supabase.table("sessions").delete().eq("student_id", student_id).execute()
        supabase.table("student_profiles").delete().eq("student_id", student_id).execute()
        supabase.table("students").delete().eq("student_id", student_id).execute()

    return {
        "scores": scores,
        "spread": (max(scores) - min(scores)) if len(scores) >= 2 else None,
    }


async def main():
    dataset = json.loads(DATASET_PATH.read_text())

    print(f"Running {len(dataset['answerable'])} answerable + {len(dataset['unanswerable'])} unanswerable cases...")
    answerable_results = [await run_answerable_case(c) for c in dataset["answerable"]]
    unanswerable_results = [await run_unanswerable_case(c) for c in dataset["unanswerable"]]

    print("Running mastery-check scoring consistency check (2 calls)...")
    mastery_consistency = run_mastery_consistency_check()

    total_latencies = [r["total_latency_s"] for r in answerable_results]
    all_citation_counts = sum(r["citation_count"] for r in answerable_results)
    all_valid_citations = sum(r["valid_citation_count"] for r in answerable_results)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "retrieval_hit_rate": sum(r["retrieval_hit"] for r in answerable_results) / len(answerable_results),
        "avg_top1_similarity": round(statistics.mean(r["top1_similarity"] for r in answerable_results), 3),
        # Of questions that DID retrieve relevant chunks, how many actually
        # got used in a real answer vs. the model declining anyway.
        "grounded_answer_rate": sum(r["grounded_answer"] for r in answerable_results) / len(answerable_results),
        "citation_validity_rate": (all_valid_citations / all_citation_counts) if all_citation_counts else None,
        "total_citations": all_citation_counts,
        "valid_citations": all_valid_citations,
        "fallback_accuracy": sum(r["correctly_declined"] for r in unanswerable_results) / len(unanswerable_results),
        "hard_fallback_rate": sum(r["hard_fallback"] for r in unanswerable_results) / len(unanswerable_results),
        "latency_p50_s": round(statistics.median(total_latencies), 3),
        "latency_max_s": round(max(total_latencies), 3),
        "mastery_check_score_spread": mastery_consistency["spread"],
    }

    RESULTS_PATH.write_text(
        json.dumps(
            {"summary": summary, "answerable": answerable_results, "unanswerable": unanswerable_results, "mastery_consistency": mastery_consistency},
            indent=2,
        )
    )

    print("\n=== Summary ===")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    print(f"\nFull results written to {RESULTS_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
