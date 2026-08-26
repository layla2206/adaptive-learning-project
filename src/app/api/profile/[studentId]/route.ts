import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";
import { buildStudentProfile } from "@/lib/studentProgress";

export async function GET(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { studentId } = await params;

  if (currentUser.role === "student") {
    const { data: userRow } = await supabase
      .from("users")
      .select("student_id")
      .eq("user_id", currentUser.user_id)
      .maybeSingle();
    if (userRow?.student_id !== studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (currentUser.role !== "instructor" && currentUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await buildStudentProfile(studentId);
  return NextResponse.json(payload);
}
