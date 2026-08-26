import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

const XP_PER_TOPIC_MASTERED = 100;

function shortId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

export async function POST(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { topicId } = await req.json();
  if (typeof topicId !== "string") {
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

  const { data: topicRow } = await supabase.from("topics").select("topic_id").eq("topic_id", topicId).maybeSingle();
  if (!topicRow) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 404 });
  }

  const { count: attemptCount } = await supabase
    .from("mastery_checks")
    .select("mastery_id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("topic_id", topicId);

  const { error: profileError } = await supabase
    .from("student_profiles")
    .upsert(
      { student_id: studentId, topic_id: topicId, mastery_percent: 100, updated_at: new Date().toISOString() },
      { onConflict: "student_id,topic_id" }
    );
  if (profileError) {
    console.error("Mastery profile upsert error:", profileError.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const { error: checkError } = await supabase.from("mastery_checks").insert({
    mastery_id: shortId("mc"),
    student_id: studentId,
    topic_id: topicId,
    attempt_number: (attemptCount ?? 0) + 1,
    explain_score: 100,
    solve_score: 100,
    overall_mastery: 100,
    passed: true,
  });
  if (checkError) {
    console.error("Mastery check insert error:", checkError.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const { error: xpError } = await supabase.from("xp_log").insert({
    student_id: studentId,
    topic_id: topicId,
    amount: XP_PER_TOPIC_MASTERED,
    reason: "topic_mastered",
  });
  if (xpError) {
    console.error("XP log insert error:", xpError.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ masteryPercent: 100, xpAwarded: XP_PER_TOPIC_MASTERED });
}
