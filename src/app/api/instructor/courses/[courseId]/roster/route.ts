import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

export async function POST(req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
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

  const { data: course } = await supabase
    .from("courses")
    .select("course_id, instructor_id")
    .eq("course_id", courseId)
    .maybeSingle();
  if (!course || course.instructor_id !== userRow.instructor_id) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!studentId || studentId.length > 20) {
    return NextResponse.json({ error: "Student ID is required and must be 20 characters or fewer" }, { status: 400 });
  }
  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Name is required and must be 100 characters or fewer" }, { status: 400 });
  }
  if (!email || email.length > 100 || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("roster")
    .select("roster_id")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "This student is already pre-approved for this course." }, { status: 409 });
  }

  const { error } = await supabase.from("roster").insert({ student_id: studentId, name, email, course_id: courseId });
  if (error) {
    console.error("Roster insert error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ studentId, name, email }, { status: 201 });
}
