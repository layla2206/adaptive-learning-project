export interface InstructorProfile {
  name: string;
}

export interface Course {
  id: string;
  name: string;
  rosterSize: number;
  lecturesUploaded: number;
  avgMastery: number;
  flagged?: boolean;
}

export type StuckSeverity = "high" | "mid" | "low";

export interface MistakeBreakdownEntry {
  tag: string;
  label: string;
  /** Distinct stuck students on record with this mistake tag — not a raw
   * answer-row count, so "N of M stuck students" phrasing is literally true. */
  count: number;
}

export interface TopicSuggestion {
  text: string;
  generatedAt: string;
}

/** Per-sub-idea difficulty for one topic -- three independent signals, never
 * blended into one score (a sub-idea students score low on in their own
 * explanation implies a different fix than one they only ask follow-ups
 * about, and a "gap" implies yet another). scoreAttempts is 0 whenever no
 * student has submitted a graded explanation for this topic yet --
 * avgUnderstandingScore is meaningless in that case, render it as "no data"
 * rather than 0%. gapCount > 0 deserves a visible flag, not just a folded-in
 * low average -- it's a distinct count of students who exhausted hints and
 * a retry and still failed, but were allowed to move on anyway (the
 * "advance anyway on final failure" rule). */
export interface SubideaSignal {
  subideaId: string;
  label: string;
  scoreAttempts: number;
  avgUnderstandingScore: number;
  followUpCount: number;
  gapCount: number;
}

export interface StuckTopic {
  topic: string;
  topicId: string;
  stuckCount: number;
  severity: StuckSeverity;
  avgRetries: number;
  mistakeBreakdown: MistakeBreakdownEntry[];
  suggestion: TopicSuggestion | null;
  subideaSignals: SubideaSignal[];
}

/** Every topic in a course with its sub-idea breakdown -- unlike StuckTopic,
 * not gated on having a stuck cohort (2+ retries, unmastered). A topic with
 * no sub-idea list generated yet just carries an empty subideaSignals. */
export interface TopicBreakdown {
  topic: string;
  topicId: string;
  subideaSignals: SubideaSignal[];
}

// "uploading"/"failed" are transient, page-local states for a file mid-flight through
// the upload request; "tagging" and "ready" are the two real states a fetched document
// can be in (tagging = no lecture_number assigned yet).
export type FileStatus = "uploading" | "tagging" | "processing" | "ready" | "failed";

export type DocumentType = "practice_assignment" | "quiz" | "exam";

export interface UploadedFile {
  id: string;
  name: string;
  lectureNumber: number;
  topicId?: string | null;
  documentType?: DocumentType | null;
  uploadedAt: string;
  status: FileStatus;
  progress?: number;
  errorReason?: string;
  documentId?: string;
  r2Key?: string;
}

export interface CourseTopic {
  id: string;
  name: string;
}

// Real data for all of the above is fetched at render time from
// /api/instructor/dashboard and /api/instructor/courses/[courseId]/files —
// see src/app/(app)/instructor/page.tsx and .../courses/[courseId]/page.tsx.
// This file now only holds the shared type definitions.
