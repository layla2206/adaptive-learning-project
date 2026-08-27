import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authMiddleware";
import { supabase } from "@/lib/supabaseClient";

const FASTAPI_URL = "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
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
  if (typeof body.courseId !== "string" || !body.courseId.trim()) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }
  if (typeof body.topicId !== "string" || !body.topicId.trim()) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("student_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();
  const studentId: string | undefined = userRow?.student_id;
  if (!studentId) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  try {
    const response = await fetch(`${FASTAPI_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        course_id: body.courseId,
        topic_id: body.topicId,
        question: body.question,
        session_id: typeof body.sessionId === "string" ? body.sessionId : undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.detail ?? data.error ?? "Query failed" }, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Query proxy error:", error);
    return NextResponse.json({ error: "Unable to reach the query service" }, { status: 502 });
  }
}