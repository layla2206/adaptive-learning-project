import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

export async function POST(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { courseId, courseName, instructorId } = await req.json();
    if (!courseId || !courseName || !instructorId) {
      return NextResponse.json({ error: "courseId, courseName, and instructorId are required" }, { status: 400 });
    }
    if (courseId.length > 10) {
      return NextResponse.json({ error: "Course code must be 10 characters or fewer" }, { status: 400 });
    }

    const { data: instructorRow } = await supabase
      .from("instructors")
      .select("instructor_id, name")
      .eq("instructor_id", instructorId)
      .maybeSingle();
    if (!instructorRow) {
      return NextResponse.json({ error: "Unknown instructor" }, { status: 400 });
    }

    const { data: existingCourse } = await supabase
      .from("courses")
      .select("course_id")
      .eq("course_id", courseId)
      .maybeSingle();
    if (existingCourse) {
      return NextResponse.json({ error: "A course with that code already exists." }, { status: 409 });
    }

    const { data: courseRow, error: courseError } = await supabase
      .from("courses")
      .insert({ course_id: courseId, course_name: courseName, instructor_id: instructorId })
      .select("course_id, course_name")
      .single();

    if (courseError || !courseRow) {
      console.error("Course insert error:", courseError?.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    return NextResponse.json({
      id: courseRow.course_id,
      name: courseRow.course_name,
      instructorName: instructorRow.name,
      studentCount: 0,
      status: "active" as const,
    });
  } catch (error) {
    console.error("Create course error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
