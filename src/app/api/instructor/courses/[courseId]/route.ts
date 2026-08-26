import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

export async function GET(req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "instructor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { courseId } = await params;

  const { data: userRow } = await supabase
    .from("users")
    .select("instructor_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();
  if (!userRow?.instructor_id) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const [{ data: course }, { data: instructorRow }] = await Promise.all([
    supabase.from("courses").select("course_id, course_name, instructor_id").eq("course_id", courseId).maybeSingle(),
    supabase.from("instructors").select("name").eq("instructor_id", userRow.instructor_id).maybeSingle(),
  ]);

  if (!course || course.instructor_id !== userRow.instructor_id) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const { count: rosterSize } = await supabase
    .from("enrollments")
    .select("enrollment_id", { count: "exact", head: true })
    .eq("course_id", courseId);

  return NextResponse.json({
    id: course.course_id,
    name: course.course_name,
    rosterSize: rosterSize ?? 0,
    instructorName: instructorRow?.name ?? "",
  });
}
