import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getStudentId } from "@/lib/authMiddleware";
import { supabase } from "@/lib/supabaseClient";
import { RETRY_FORMATS } from "@/lib/retryFormats";

const MAX_PRIOR_COURSES = 20;
const MAX_COURSE_NAME_LEN = 120;

export async function GET(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const studentId = await getStudentId(currentUser.user_id);
  if (!studentId) return NextResponse.json({ error: "Student profile not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("students")
    .select("preferred_explanation_format, prior_courses")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) {
    console.error("Settings GET error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({
    preferredExplanationFormat: data?.preferred_explanation_format ?? null,
    priorCourses: data?.prior_courses ?? [],
  });
}

export async function PATCH(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const update: Record<string, string | string[] | null> = {};

  if ("preferredExplanationFormat" in body) {
    const val = body.preferredExplanationFormat;
    if (val !== null && !(RETRY_FORMATS as readonly string[]).includes(val as string)) {
      return NextResponse.json({ error: "Invalid preferredExplanationFormat" }, { status: 400 });
    }
    update.preferred_explanation_format = val as string | null;
  }

  if ("priorCourses" in body) {
    const val = body.priorCourses;
    if (
      !Array.isArray(val) ||
      val.length > MAX_PRIOR_COURSES ||
      !val.every((c) => typeof c === "string" && c.trim().length > 0 && c.length <= MAX_COURSE_NAME_LEN)
    ) {
      return NextResponse.json({ error: "priorCourses must be an array of short course names" }, { status: 400 });
    }
    update.prior_courses = val.map((c: string) => c.trim());
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const studentId = await getStudentId(currentUser.user_id);
  if (!studentId) return NextResponse.json({ error: "Student profile not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("students")
    .update(update)
    .eq("student_id", studentId)
    .select("preferred_explanation_format, prior_courses")
    .single();

  if (error) {
    console.error("Settings PATCH error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({
    preferredExplanationFormat: data.preferred_explanation_format,
    priorCourses: data.prior_courses ?? [],
  });
}