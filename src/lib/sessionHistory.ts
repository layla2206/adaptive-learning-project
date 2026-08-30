// Extracted from the topic page (src/app/(app)/subject/[subjectId]/topic/
// [topicId]/page.tsx) so restoreFromHistory -- the branching logic that
// decides which stage a resumed mastery-loop/foundations session should
// land on -- can be unit-tested without needing to render that "use client"
// page component. Everything here is pure: no React, no fetch, no DOM.

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

export interface ExplanationSection {
  heading: string;
  body: string;
}

export interface Message {
  id: string;
  role: "tutor" | "user";
  tag?: string;
  paragraphs: string[];
  citations?: Citation[];
  diagram?: string;
  /** Present only for a "ground-up explain" answer with 2+ "### Heading"
   * sections -- delivered one at a time behind a Continue button instead of
   * as one wall of text. Absent (or a single section) means render
   * `paragraphs` as before. */
  sections?: ExplanationSection[];
  /** How many of `sections` are currently shown. Always fully revealed
   * (== sections.length) for a resumed/history message -- live pacing is a
   * first-pass-only affordance, not persisted mid-reveal state. */
  revealedCount?: number;
}

/** Splits a "ground-up explain" answer on its "### Heading" markdown
 * boundaries into ordered sections. Returns [] if the text has fewer than 2
 * headings -- a plain one-off answer never gets sectioned/paced, only a
 * genuine multi-section explanation does. */
export function parseExplanationSections(text: string): ExplanationSection[] {
  const parts = text.split(/^### (.+)$/m);
  const sections: ExplanationSection[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i]?.trim();
    const body = parts[i + 1]?.trim();
    if (heading && body) sections.push({ heading, body });
  }
  return sections.length >= 2 ? sections : [];
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
  checkQuestion?: string;
  solveSteps?: string[];
}

export const RETRY_TAGS = new Set(["Worked Example", "Hands-on Task", "Analogy", "Diagram", "Mind Map"]);

export const QUOTA_ERROR_MESSAGE = "The AI tutor has hit its daily usage limit — try again later.";

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

/** Converts persisted session_messages rows into chat bubbles -- shared by
 * restoreFromHistory (mastery-loop resume) and the Mastered Hub's read-only
 * "Review the explanation" view, so there's one mapping to keep in sync. */
export function mapHistoryRowsToMessages(rows: HistoryRow[]): Message[] {
  return rows.map((row) => {
    const sections = row.isDiagram ? [] : parseExplanationSections(row.text);
    return {
      id: nextId(),
      role: "tutor",
      tag: row.tag === "Hint" ? `Hint ${row.hintsUsed}/${row.maxHints}` : row.tag,
      paragraphs: sections.length
        ? []
        : row.isDiagram
          ? row.citations?.length
            ? [`Sources: ${row.citations.map((c) => `${c.mark} ${c.source}`).join(" · ")}`]
            : []
          : [row.text],
      citations: row.isDiagram ? undefined : row.citations,
      diagram: row.isDiagram ? row.text : undefined,
      sections: sections.length ? sections : undefined,
      // A resumed message is always fully revealed -- live section-by-section
      // pacing is a first-pass affordance only, not persisted mid-reveal state.
      revealedCount: sections.length || undefined,
    };
  });
}

/**
 * Rebuilds the chat + resumable stage from persisted session_messages.
 * Only "Grounded Explanation", a retry-format tag, "Hint", or a foundations-
 * gate tag as the LAST message is a stage we know how to resume into (waiting
 * on "Continue" or another submission); anything else (no history, or a
 * session that already reached "Result") falls back to a fresh diagnose so
 * we're never left resuming into an inconsistent stage.
 */
export function restoreFromHistory(rows: HistoryRow[]): {
  messages: Message[];
  stage: Stage;
  foundationsCurrent?: FoundationsQuestion;
  foundationsExplanation?: string;
  foundationsPendingIndex?: number;
  foundationsTotal?: number;
  checkQuestion?: string;
  solveSteps?: string[];
} | null {
  if (rows.length === 0) return null;
  const lastRow = rows[rows.length - 1];
  const lastTag = lastRow?.tag;
  const lastIsRetry = RETRY_TAGS.has(lastTag ?? "");
  const lastIsHint = lastTag === "Hint";
  const lastIsFoundationsQuestion = lastTag === "Foundations Question";
  const lastIsFoundationsExplanation = lastTag === "Foundations Explanation";
  const lastIsFoundationsComplete = lastTag === "Foundations Complete";
  if (
    lastTag !== "Grounded Explanation" &&
    !lastIsRetry &&
    !lastIsHint &&
    !lastIsFoundationsQuestion &&
    !lastIsFoundationsExplanation &&
    !lastIsFoundationsComplete
  ) {
    return null;
  }

  const messages: Message[] = mapHistoryRowsToMessages(rows);

  const stage: Stage = lastIsRetry
    ? "retry-shown"
    : lastIsHint
      ? "check-ask"
      : lastIsFoundationsQuestion
        ? "foundations-question"
        : lastIsFoundationsExplanation
          ? "foundations-explain"
          : lastIsFoundationsComplete
            ? "foundations-complete"
            : "explain-shown";

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

  // checkQuestion/solveSteps live on whichever "Grounded Explanation" row
  // first generated them (the ground-up explain), not necessarily the LAST
  // row -- a follow-up question asked mid-pacing appends its own "Grounded
  // Explanation" row with no checkQuestion/solveSteps of its own, so search
  // backward for the most recent row that actually has them.
  const checkQuestion = [...rows].reverse().find((r) => r.checkQuestion)?.checkQuestion;
  const solveSteps = [...rows].reverse().find((r) => r.solveSteps?.length)?.solveSteps;

  return {
    messages,
    stage,
    foundationsCurrent,
    foundationsExplanation: lastIsFoundationsExplanation ? lastRow.text : undefined,
    foundationsPendingIndex: lastIsFoundationsExplanation ? lastRow.conceptIndex : undefined,
    foundationsTotal: lastRow.totalConcepts,
    checkQuestion,
    solveSteps,
  };
}
