import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authMiddleware";
import { supabase } from "@/lib/supabaseClient";

const FASTAPI_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const XP_PER_TOPIC_MASTERED = 100;

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
  if (typeof body.topicId !== "string" || !body.topicId.trim()) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
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
    const response = await fetch(`${FASTAPI_URL}/mastery/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        topic_id: body.topicId,
        session_id: typeof body.sessionId === "string" ? body.sessionId : undefined,
        explanation: typeof body.explanation === "string" ? body.explanation : undefined,
        solution: typeof body.solution === "string" ? body.solution : undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.detail ?? data.error ?? "Mastery evaluation failed" }, { status: response.status });
    }

    if (data.passed === true) {
      const { error: xpError } = await supabase.from("xp_log").insert({
        student_id: studentId,
        topic_id: body.topicId,
        amount: XP_PER_TOPIC_MASTERED,
        reason: "topic_mastered",
      });
      if (xpError) {
        console.error("XP log insert error:", xpError.message);
        return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
      }
      data.xpAwarded = XP_PER_TOPIC_MASTERED;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Mastery check proxy error:", error);
    return NextResponse.json({ error: "Unable to reach mastery evaluation service" }, { status: 502 });
  }
}
