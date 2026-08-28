import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

export async function GET(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    { data: instructors },
    { data: courses },
    { count: totalStudents },
    { count: totalDocuments },
    { data: enrollments },
  ] = await Promise.all([
    supabase.from("instructors").select("instructor_id, name, email, status"),
    supabase.from("courses").select("course_id, course_name, instructor_id, status"),
    supabase.from("students").select("student_id", { count: "exact", head: true }),
    supabase.from("documents").select("document_id", { count: "exact", head: true }),
    supabase.from("enrollments").select("course_id"),
  ]);

  const enrollmentCountByCourse = new Map<string, number>();
  for (const e of enrollments ?? []) {
    enrollmentCountByCourse.set(e.course_id, (enrollmentCountByCourse.get(e.course_id) ?? 0) + 1);
  }

  const instructorNameById = new Map((instructors ?? []).map((i) => [i.instructor_id, i.name]));
  const courseCountByInstructor = new Map<string, number>();
  for (const c of courses ?? []) {
    courseCountByInstructor.set(c.instructor_id, (courseCountByInstructor.get(c.instructor_id) ?? 0) + 1);
  }

  const instructorAccounts = (instructors ?? []).map((i) => ({
    id: i.instructor_id,
    name: i.name,
    email: i.email,
    coursesCount: courseCountByInstructor.get(i.instructor_id) ?? 0,
    status: (i.status ?? "active") as "active" | "deactivated",
  }));

  const platformCourses = (courses ?? []).map((c) => ({
    id: c.course_id,
    name: c.course_name,
    instructorName: instructorNameById.get(c.instructor_id) ?? "Unknown",
    studentCount: enrollmentCountByCourse.get(c.course_id) ?? 0,
    status: (c.status ?? "active") as "active" | "deactivated",
  }));

  return NextResponse.json({
    platformStats: [
      { value: String(totalStudents ?? 0), label: "Total Students" },
      { value: String((instructors ?? []).length), label: "Total Instructors" },
      { value: String((courses ?? []).length), label: "Total Courses" },
      { value: String(totalDocuments ?? 0), label: "Lectures Uploaded" },
    ],
    instructorAccounts,
    platformCourses,
  });
}
