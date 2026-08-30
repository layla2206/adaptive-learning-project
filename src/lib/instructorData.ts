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

export interface StuckTopic {
  topic: string;
  topicId: string;
  stuckCount: number;
  severity: StuckSeverity;
  avgRetries: number;
  mistakeBreakdown: MistakeBreakdownEntry[];
  suggestion: TopicSuggestion | null;
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
