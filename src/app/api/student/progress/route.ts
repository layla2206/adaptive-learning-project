import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

export async function POST(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { topicId, progressPct } = await req.json();
  if (typeof topicId !== "string" || typeof progressPct !== "number") {
    return NextResponse.json({ error: "topicId and progressPct are required" }, { status: 400 });
  }
  const clamped = Math.max(0, Math.min(100, progressPct));

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

  const { data: existing } = await supabase
    .from("student_profiles")
    .select("mastery_percent")
    .eq("student_id", studentId)
    .eq("topic_id", topicId)
    .maybeSingle();

  const nextPercent = Math.max(existing?.mastery_percent ?? 0, clamped);

  const { error } = await supabase
    .from("student_profiles")
    .upsert(
      { student_id: studentId, topic_id: topicId, mastery_percent: nextPercent, updated_at: new Date().toISOString() },
      { onConflict: "student_id,topic_id" }
    );

  if (error) {
    console.error("Progress upsert error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ masteryPercent: nextPercent });
}
