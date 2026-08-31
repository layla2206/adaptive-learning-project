// Extracted from the topic page (src/app/(app)/subject/[subjectId]/topic/
// [topicId]/page.tsx) so restoreFromHistory -- the branching logic that
// decides which stage a resumed Foundations-gate session should land on --
// can be unit-tested without needing to render that "use client" page
// component. Everything here is pure: no React, no fetch, no DOM.
//
// The mastery loop itself (explain/check/hint/retry, now sequenced once per
// sub-idea) resumes via a different, authoritative mechanism -- POST
// /topic/resume reads backend/main.py's topic_progress table directly,
// rather than inferring a stage from the last session_messages tag the way
// this file used to. That inference proved fragile: a runaway follow-up
// answer was once mistaken for a second completed explanation. This file
// now only covers the Foundations gate (top-sort1's prerequisite check,
// which runs before Explain and isn't part of the per-sub-idea loop) and
// the Mastered Hub's read-only full-transcript review.

export type Stage =
  | "mastered-hub"
  | "reviewing"
  | "diagnose"
  | "diagnose-summary"
  | "foundations-question"
  | "foundations-checking"
  | "foundations-explain"
  | "foundations-complete"
  | "thinking-explain"
  | "explain-shown"
  | "check-ask"
  | "checking"
  | "thinking-retry-explain"
  | "retry-shown"
  | "retry-check-ask"
  | "retry-checking"
  | "done";

export interface Citation {
  mark: string;
  source: string;
  excerpt: string;
}

/** One sub-idea's self-contained mini-lesson -- what /query's full-explanation
 * response and /topic/resume both return, one per sub-idea, generated in a
 * single Gemini call up front (see backend's generate_structured_explanation)
 * and then sequenced through one at a time as their own explain/check loop. */
export interface ExplanationSection {
  heading: string;
  body: string;
  citations: Citation[];
  subideaId: string | null;
  checkQuestion: string | null;
  solveSteps: string[] | null;
}

export interface Message {
  id: string;
  role: "tutor" | "user";
  tag?: string;
  heading?: string;
  paragraphs: string[];
  citations?: Citation[];
  diagram?: string;
}

export interface FoundationsQuestion {
  question_id: string;
  concept_id: string;
  concept_label: string;
  concept_index: number;
  text: string;
  options: string[];
}

export interface HistoryRow {
  text: string;
  tag?: string;
  heading?: string;
  citations?: Citation[];
  diagram?: string | null;
  isDiagram?: boolean;
  hintsUsed?: number;
  maxHints?: number;
  questionId?: string;
  conceptId?: string;
  conceptLabel?: string;
  conceptIndex?: number;
  totalConcepts?: number;
  questionText?: string;
  options?: string[];
  isFollowUp?: boolean;
}

export const RETRY_TAGS = new Set(["Worked Example", "Hands-on Task", "Analogy", "Diagram", "Mind Map"]);

export const QUOTA_ERROR_MESSAGE = "Bridge has hit its daily usage limit — try again later.";

/** Every catch block in the topic page used to show the same generic
 * fallback no matter what actually failed, so a Gemini 429 (backend/main.py's
 * various endpoints all return "... quota exceeded for today ..." on one)
 * looked identical to a real network failure. Surfaces the honest quota
 * message when that's actually what happened, and only falls back to the
 * generic copy otherwise. */
export function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message.toLowerCase().includes("quota") ? QUOTA_ERROR_MESSAGE : fallback;
}

let msgId = 0;
export function nextId(): string {
  msgId += 1;
  return `m${msgId}`;
}

/** Converts persisted session_messages rows into chat bubbles -- used by the
 * Mastered Hub's read-only "Review the explanation" view (the whole topic's
 * transcript, every sub-idea together) and by the per-sub-idea resume flow
 * (one sub-idea's own messages only). */
export function mapHistoryRowsToMessages(rows: HistoryRow[]): Message[] {
  return rows.map((row) => ({
    id: nextId(),
    role: "tutor",
    tag: row.tag === "Hint" ? `Hint ${row.hintsUsed}/${row.maxHints}` : row.tag,
    heading: row.isDiagram ? undefined : row.heading,
    paragraphs: row.isDiagram
      ? row.citations?.length
        ? [`Sources: ${row.citations.map((c) => `${c.mark} ${c.source}`).join(" · ")}`]
        : []
      : [row.text],
    citations: row.isDiagram ? undefined : row.citations,
    diagram: row.isDiagram ? row.text : undefined,
  }));
}

/**
 * Rebuilds the chat + resumable stage for an in-progress Foundations gate
 * (top-sort1's prerequisite check) from persisted session_messages. Only a
 * foundations-gate tag as the LAST message is a stage this still knows how
 * to resume into -- anything else (no history, a mastery-loop tag, or a
 * session that already reached "Result") returns null so the caller falls
 * through to its own next step (fresh foundations start, or the per-sub-idea
 * /topic/resume flow).
 */
export function restoreFromHistory(rows: HistoryRow[]): {
  messages: Message[];
  stage: Stage;
  foundationsCurrent?: FoundationsQuestion;
  foundationsExplanation?: string;
  foundationsPendingIndex?: number;
  foundationsTotal?: number;
} | null {
  if (rows.length === 0) return null;
  const lastRow = rows[rows.length - 1];
  const lastTag = lastRow?.tag;
  const lastIsFoundationsQuestion = lastTag === "Foundations Question";
  const lastIsFoundationsExplanation = lastTag === "Foundations Explanation";
  const lastIsFoundationsComplete = lastTag === "Foundations Complete";
  if (!lastIsFoundationsQuestion && !lastIsFoundationsExplanation && !lastIsFoundationsComplete) {
    return null;
  }

  const messages: Message[] = mapHistoryRowsToMessages(rows);

  const stage: Stage = lastIsFoundationsQuestion
    ? "foundations-question"
    : lastIsFoundationsExplanation
      ? "foundations-explain"
      : "foundations-complete";

  const foundationsCurrent: FoundationsQuestion | undefined =
    lastIsFoundationsQuestion &&
    lastRow.questionId &&
    lastRow.conceptId &&
    lastRow.conceptLabel !== undefined &&
    lastRow.conceptIndex !== undefined &&
    lastRow.questionText &&
    lastRow.options
      ? {
          question_id: lastRow.questionId,
          concept_id: lastRow.conceptId,
          concept_label: lastRow.conceptLabel,
          concept_index: lastRow.conceptIndex,
          text: lastRow.questionText,
          options: lastRow.options,
        }
      : undefined;

  return {
    messages,
    stage,
    foundationsCurrent,
    foundationsExplanation: lastIsFoundationsExplanation ? lastRow.text : undefined,
    foundationsPendingIndex: lastIsFoundationsExplanation ? lastRow.conceptIndex : undefined,
    foundationsTotal: lastRow.totalConcepts,
  };
}
