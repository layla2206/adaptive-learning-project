import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authMiddleware";
import { supabase } from "@/lib/supabaseClient";

const FASTAPI_URL = "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const topicId = req.nextUrl.searchParams.get("topicId");
  if (!topicId) {
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
    const response = await fetch(`${FASTAPI_URL}/session/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, topic_id: topicId }),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.detail ?? data.error ?? "Unable to load session history" }, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Session history proxy error:", error);
    return NextResponse.json({ error: "Unable to reach session service" }, { status: 502 });
  }
}