import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

async function resolveOwnedDocument(instructorId: string, documentId: string) {
  const { data } = await supabase
    .from("documents")
    .select("document_id, instructor_id")
    .eq("document_id", documentId)
    .maybeSingle();
  if (!data || data.instructor_id !== instructorId) return null;
  return data;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "instructor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { documentId } = await params;

  const { data: userRow } = await supabase
    .from("users")
    .select("instructor_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();
  if (!userRow?.instructor_id) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const doc = await resolveOwnedDocument(userRow.instructor_id, documentId);
  if (!doc) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const { lectureNumber } = await req.json();
  if (typeof lectureNumber !== "number" || lectureNumber < 1) {
    return NextResponse.json({ error: "lectureNumber must be a positive number" }, { status: 400 });
  }

  const { error } = await supabase.from("documents").update({ lecture_number: lectureNumber }).eq("document_id", documentId);
  if (error) {
    console.error("Document tag update error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lectureNumber });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "instructor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { documentId } = await params;

  const { data: userRow } = await supabase
    .from("users")
    .select("instructor_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();
  if (!userRow?.instructor_id) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const doc = await resolveOwnedDocument(userRow.instructor_id, documentId);
  if (!doc) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const { error } = await supabase.from("documents").delete().eq("document_id", documentId);
  if (error) {
    console.error("Document delete error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
