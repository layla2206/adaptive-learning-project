import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await req.json();
  if (status !== "active" && status !== "deactivated") {
    return NextResponse.json({ error: "status must be 'active' or 'deactivated'" }, { status: 400 });
  }

  const { error } = await supabase.from("instructors").update({ status }).eq("instructor_id", id);
  if (error) {
    console.error("Update instructor status error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ id, status });
}