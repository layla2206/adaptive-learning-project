import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";
import type { UploadedFile } from "@/lib/instructorData";

function formatUploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "instructor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { courseId } = await params;

  const { data: userRow } = await supabase
    .from("users")
    .select("instructor_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();
  if (!userRow?.instructor_id) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const { data: course } = await supabase
    .from("courses")
    .select("instructor_id")
    .eq("course_id", courseId)
    .maybeSingle();
  if (!course || course.instructor_id !== userRow.instructor_id) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const { data: documents, error } = await supabase
    .from("documents")
    .select("document_id, file_name, lecture_number, topic_id, document_type, upload_date")
    .eq("course_id", courseId)
    .order("upload_date", { ascending: true });

  if (error) {
    console.error("Course files fetch error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const files: UploadedFile[] = (documents ?? []).map((d) => ({
    id: d.document_id,
    name: d.file_name,
    lectureNumber: d.lecture_number ?? 0,
    topicId: d.topic_id,
    documentType: d.document_type,
    uploadedAt: formatUploadDate(d.upload_date),
    status: d.lecture_number != null ? "ready" : "tagging",
  }));

  return NextResponse.json(files);
}
