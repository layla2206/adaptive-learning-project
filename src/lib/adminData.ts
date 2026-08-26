export type AccountStatus = "active" | "deactivated";

export interface InstructorAccount {
  id: string;
  name: string;
  email: string;
  coursesCount: number;
  status: AccountStatus;
}

export interface PlatformCourse {
  id: string;
  name: string;
  instructorName: string;
  studentCount: number;
  status: AccountStatus;
}

// Real data for all of the above is fetched at render time from
// /api/admin/dashboard — see src/app/(app)/admin/page.tsx. This file now
// only holds the shared type definitions.
