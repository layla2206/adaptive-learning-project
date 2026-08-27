import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authMiddleware";
import { supabase } from "@/lib/supabaseClient";

const PROFILE_FIELDS = ["level", "mastery_percent", "weak_area", "preferred_format"] as const;

async function getStudentId(userId: string): Promise<string | null> {
  const { data } = await supabase.from("users").select("student_id").eq("user_id", userId).maybeSingle();
  return data?.student_id ?? null;
}

export async function GET(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const studentId = await getStudentId(currentUser.user_id);
  if (!studentId) return NextResponse.json({ error: "Student profile not found" }, { status: 404 });

  const topicId = req.nextUrl.searchParams.get("topicId");
  let query = supabase
    .from("student_profiles")
    .select("student_id, topic_id, level, mastery_percent, weak_area, preferred_format, updated_at")
    .eq("student_id", studentId);
  if (topicId) query = query.eq("topic_id", topicId);

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) {
    console.error("Profile GET error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ profiles: data ?? [] });
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

  const topicId = body.topicId;
  if (typeof topicId !== "string" || !topicId.trim()) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }

  const profile: Record<string, string | number> = { topic_id: topicId };
  for (const field of PROFILE_FIELDS) {
    if (body[field] !== undefined) {
      if (field === "mastery_percent") {
        if (typeof body[field] !== "number" || !Number.isFinite(body[field])) {
          return NextResponse.json({ error: "mastery_percent must be a number" }, { status: 400 });
        }
        profile[field] = Math.max(0, Math.min(100, body[field]));
      } else if (typeof body[field] !== "string") {
        return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
      } else {
        profile[field] = body[field];
      }
    }
  }

  const studentId = await getStudentId(currentUser.user_id);
  if (!studentId) return NextResponse.json({ error: "Student profile not found" }, { status: 404 });

  const { data: topic } = await supabase.from("topics").select("topic_id").eq("topic_id", topicId).maybeSingle();
  if (!topic) return NextResponse.json({ error: "Unknown topic" }, { status: 404 });

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("student_profiles")
    .select("level, mastery_percent, weak_area, preferred_format")
    .eq("student_id", studentId)
    .eq("topic_id", topicId)
    .maybeSingle();
  if (existingProfileError) {
    console.error("Profile lookup error:", existingProfileError.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("student_profiles")
    .upsert(
      { student_id: studentId, topic_id: topicId, ...existingProfile, ...profile, updated_at: new Date().toISOString() },
      { onConflict: "student_id,topic_id" }
    )
    .select("student_id, topic_id, level, mastery_percent, weak_area, preferred_format, updated_at")
    .single();

  if (error) {
    console.error("Profile PATCH error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}