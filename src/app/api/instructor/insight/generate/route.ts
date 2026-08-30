import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authMiddleware";
import { supabase } from "@/lib/supabaseClient";
import { isRateLimited } from "@/lib/rateLimit";
import { computeStuckCohort, computeMistakeBreakdown } from "@/lib/instructorInsights";

const FASTAPI_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "instructor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("instructor_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();
  const instructorId: string | undefined = userRow?.instructor_id;
  if (!instructorId) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const topicId = body?.topicId;
  if (!topicId || typeof topicId !== "string") {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }

  const { data: topic } = await supabase
    .from("topics")
    .select("topic_id, topic_name, course_id, courses!inner(course_id, instructor_id)")
    .eq("topic_id", topicId)
    .eq("courses.instructor_id", instructorId)
    .maybeSingle();
  if (!topic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isRateLimited(`insight:${instructorId}:${topicId}`, 1, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Please wait a few minutes before generating another insight for this topic." }, { status: 429 });
  }

  const [{ data: retryRows }, { data: profileRows }, { data: answerRows }] = await Promise.all([
    supabase.from("retry_attempts").select("student_id, topic_id").eq("topic_id", topicId),
    supabase.from("student_profiles").select("student_id, topic_id, mastery_percent").eq("topic_id", topicId),
    supabase.from("student_answers").select("student_id, topic_id, mistake_tag").eq("topic_id", topicId),
  ]);

  const { stuckStudentIds } = computeStuckCohort(topicId, retryRows ?? [], profileRows ?? []);
  if (stuckStudentIds.length === 0) {
    return NextResponse.json({ error: "No stuck students found for this topic yet" }, { status: 422 });
  }
  const mistakeBreakdown = computeMistakeBreakdown(topicId, stuckStudentIds, answerRows ?? []);

  try {
    const response = await fetch(`${FASTAPI_URL}/instructor/insight/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instructor_id: instructorId,
        topic_id: topicId,
        topic_name: topic.topic_name,
        stuck_count: stuckStudentIds.length,
        mistake_breakdown: mistakeBreakdown,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.detail ?? data.error ?? "Couldn't generate an insight." }, { status: response.status });
    }
    return NextResponse.json({
      topicId: data.topicId,
      suggestionText: data.suggestionText,
      generatedAt: data.generatedAt,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the server. Try again." }, { status: 502 });
  }
}
