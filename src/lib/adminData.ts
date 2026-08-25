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

export const platformStats = [
  { value: "1,240", label: "Total Students" },
  { value: "38", label: "Total Instructors" },
  { value: "94", label: "Total Courses" },
  { value: "612", label: "Lectures Uploaded" },
];

export const instructorAccounts: InstructorAccount[] = [
  { id: "i1", name: "Dr. Elena Marsh", email: "e.marsh@faculty.edu", coursesCount: 4, status: "active" },
  { id: "i2", name: "Dr. Marcus Webb", email: "m.webb@faculty.edu", coursesCount: 3, status: "active" },
  { id: "i3", name: "Dr. Priya Nandakumar", email: "p.nandakumar@faculty.edu", coursesCount: 2, status: "active" },
  { id: "i4", name: "Dr. Aaron Fischer", email: "a.fischer@faculty.edu", coursesCount: 1, status: "deactivated" },
];

export const platformCourses: PlatformCourse[] = [
  { id: "cs201", name: "Data Structures & Algorithms", instructorName: "Dr. Elena Marsh", studentCount: 94, status: "active" },
  { id: "math210", name: "Calculus II", instructorName: "Dr. Elena Marsh", studentCount: 112, status: "active" },
  { id: "math240", name: "Linear Algebra", instructorName: "Dr. Elena Marsh", studentCount: 68, status: "active" },
  { id: "chem150", name: "Organic Chemistry I", instructorName: "Dr. Elena Marsh", studentCount: 38, status: "active" },
  { id: "phys110", name: "Intro Mechanics", instructorName: "Dr. Marcus Webb", studentCount: 81, status: "active" },
  { id: "bio120", name: "Cell Biology", instructorName: "Dr. Priya Nandakumar", studentCount: 57, status: "active" },
  { id: "cs340", name: "Compilers", instructorName: "Dr. Aaron Fischer", studentCount: 19, status: "deactivated" },
];
