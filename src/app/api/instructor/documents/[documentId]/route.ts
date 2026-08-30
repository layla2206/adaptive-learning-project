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

  const body = await req.json();
  const { lectureNumber, topicId, documentType } = body as {
    lectureNumber?: unknown;
    topicId?: unknown;
    documentType?: unknown;
  };

  const update: { lecture_number?: number; topic_id?: string | null; document_type?: string | null } = {};

  const ALLOWED_DOCUMENT_TYPES = new Set(["practice_assignment", "quiz", "exam"]);
  if (documentType !== undefined) {
    if (documentType !== null && (typeof documentType !== "string" || !ALLOWED_DOCUMENT_TYPES.has(documentType))) {
      return NextResponse.json({ error: "documentType must be one of practice_assignment, quiz, exam, or null" }, { status: 400 });
    }
    update.document_type = documentType;
  }

  if (lectureNumber !== undefined) {
    if (typeof lectureNumber !== "number" || lectureNumber < 1) {
      return NextResponse.json({ error: "lectureNumber must be a positive number" }, { status: 400 });
    }
    update.lecture_number = lectureNumber;
  }

  if (topicId !== undefined) {
    if (topicId !== null && typeof topicId !== "string") {
      return NextResponse.json({ error: "topicId must be a string or null" }, { status: 400 });
    }
    if (topicId !== null) {
      const { data: topicRow } = await supabase
        .from("topics")
        .select("topic_id")
        .eq("topic_id", topicId)
        .maybeSingle();
      if (!topicRow) {
        return NextResponse.json({ error: "Unknown topic" }, { status: 404 });
      }
    }
    update.topic_id = topicId;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "lectureNumber, topicId, and/or documentType is required" }, { status: 400 });
  }

  const { error } = await supabase.from("documents").update(update).eq("document_id", documentId);
  if (error) {
    console.error("Document tag update error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  // Existing chunks were embedded with whatever topic_id the document had at
  // upload time (main.py's /upload copies it onto each chunk row) — re-tagging
  // the document afterward has to also re-sync its chunks, or they'd stay
  // permanently unreachable by topic-filtered retrieval (match_chunks, the
  // diagnostic/mastery/retry endpoints) despite the document showing a topic.
  if (update.topic_id !== undefined) {
    const { error: chunkError } = await supabase
      .from("chunks")
      .update({ topic_id: update.topic_id })
      .eq("document_id", documentId);
    if (chunkError) {
      console.error("Chunk topic sync error:", chunkError.message);
      return NextResponse.json({ error: "Document saved, but its chunks couldn't be re-tagged. Try again." }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    lectureNumber: update.lecture_number,
    topicId: update.topic_id,
    documentType: update.document_type,
  });
}

