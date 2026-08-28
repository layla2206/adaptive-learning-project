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

export interface StuckTopic {
  topic: string;
  stuckCount: number;
  severity: StuckSeverity;
  avgRetries: number;
}

// "uploading"/"failed" are transient, page-local states for a file mid-flight through
// the upload request; "tagging" and "ready" are the two real states a fetched document
// can be in (tagging = no lecture_number assigned yet).
export type FileStatus = "uploading" | "tagging" | "processing" | "ready" | "failed";

export interface UploadedFile {
  id: string;
  name: string;
  lectureNumber: number;
  topicId?: string | null;
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
