export interface InstructorProfile {
  name: string;
}

export interface Course {
  id: string;
  name: string;
  rosterSize: number;
  lecturesUploaded: number;
  lecturesPlanned: number;
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

// "uploading"/"tagging"/"failed" are transient, page-local states for a file that's
// mid-flight; the seeded course data below only ever starts at "processing" or "ready".
export type FileStatus = "uploading" | "tagging" | "processing" | "ready" | "failed";

export interface UploadedFile {
  id: string;
  name: string;
  lectureNumber: number;
  uploadedAt: string;
  status: FileStatus;
  progress?: number;
  errorReason?: string;
  documentId?: string;
  r2Key?: string;
}

export const instructorProfile: InstructorProfile = {
  name: "Dr. Elena Marsh",
};

export const instructorStats = [
  { value: "4", label: "Courses Taught" },
  { value: "312", label: "Total Students" },
  { value: "58", label: "Lectures Uploaded" },
  { value: "76%", label: "Avg. Class Mastery" },
];

export const courses: Course[] = [
  {
    id: "cs201",
    name: "Data Structures & Algorithms",
    rosterSize: 94,
    lecturesUploaded: 18,
    lecturesPlanned: 20,
    avgMastery: 81,
  },
  {
    id: "math210",
    name: "Calculus II",
    rosterSize: 112,
    lecturesUploaded: 14,
    lecturesPlanned: 22,
    avgMastery: 52,
    flagged: true,
  },
  {
    id: "math240",
    name: "Linear Algebra",
    rosterSize: 68,
    lecturesUploaded: 16,
    lecturesPlanned: 18,
    avgMastery: 74,
  },
  {
    id: "chem150",
    name: "Organic Chemistry I",
    rosterSize: 38,
    lecturesUploaded: 10,
    lecturesPlanned: 20,
    avgMastery: 69,
  },
];

// A topic counts as "stuck" once students have logged 2+ retries without hitting mastery
// — the same retry loop already tracked per-topic on the student side.
export const stuckTopicsByCourse: Record<string, StuckTopic[]> = {
  cs201: [
    { topic: "Graph Traversal (BFS/DFS)", stuckCount: 21, severity: "high", avgRetries: 3.4 },
    { topic: "Dynamic Programming", stuckCount: 17, severity: "high", avgRetries: 3.1 },
    { topic: "Hashing & Collision Handling", stuckCount: 9, severity: "mid", avgRetries: 2.4 },
    { topic: "Tree Balancing", stuckCount: 4, severity: "low", avgRetries: 2.1 },
  ],
  math210: [
    { topic: "Series Convergence Tests", stuckCount: 38, severity: "high", avgRetries: 4.2 },
    { topic: "Integration by Parts", stuckCount: 29, severity: "high", avgRetries: 3.8 },
    { topic: "Related Rates", stuckCount: 15, severity: "mid", avgRetries: 2.6 },
  ],
  math240: [
    { topic: "Eigenvalues & Eigenvectors", stuckCount: 12, severity: "mid", avgRetries: 2.5 },
    { topic: "Determinants", stuckCount: 5, severity: "low", avgRetries: 2.1 },
  ],
  chem150: [
    { topic: "Reaction Mechanisms", stuckCount: 14, severity: "high", avgRetries: 3.3 },
    { topic: "Stereochemistry", stuckCount: 8, severity: "mid", avgRetries: 2.3 },
    { topic: "Nomenclature", stuckCount: 3, severity: "low", avgRetries: 2.0 },
  ],
};

export const uploadedFilesByCourse: Record<string, UploadedFile[]> = {
  cs201: [
    { id: "f1", name: "L01-arrays-strings.pdf", lectureNumber: 1, uploadedAt: "Aug 4", status: "ready" },
    { id: "f2", name: "L02-trees-intro.pdf", lectureNumber: 2, uploadedAt: "Aug 6", status: "ready" },
    { id: "f3", name: "L03-graphs-slides.pdf", lectureNumber: 3, uploadedAt: "Aug 11", status: "ready" },
  ],
  math210: [
    { id: "f4", name: "L01-limits-review.pdf", lectureNumber: 1, uploadedAt: "Jul 28", status: "ready" },
    { id: "f5", name: "L02-derivatives.pdf", lectureNumber: 2, uploadedAt: "Jul 30", status: "ready" },
  ],
  math240: [{ id: "f6", name: "L01-vectors-intro.pdf", lectureNumber: 1, uploadedAt: "Aug 2", status: "ready" }],
  chem150: [{ id: "f7", name: "L01-nomenclature.pdf", lectureNumber: 1, uploadedAt: "Aug 9", status: "ready" }],
};
