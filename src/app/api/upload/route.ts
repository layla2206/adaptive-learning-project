import { NextRequest, NextResponse } from "next/server";
import { r2Client, R2_BUCKET_NAME, PutObjectCommand } from "@/lib/r2Client";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

export async function POST(req: NextRequest) {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser || currentUser.role !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("instructor_id")
      .eq("user_id", currentUser.user_id)
      .maybeSingle();
    const instructorId = userRow?.instructor_id;
    if (!instructorId) {
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = formData.get("courseId") as string | null;
    const topicId = (formData.get("topicId") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!courseId) {
      return NextResponse.json({ error: "courseId is required" }, { status: 400 });
    }

    const { data: courseRow } = await supabase
      .from("courses")
      .select("instructor_id")
      .eq("course_id", courseId)
      .maybeSingle();
    if (!courseRow || courseRow.instructor_id !== instructorId) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
    // documents.document_id is VARCHAR(10) — this must stay the id actually stored below.
    const documentId = `doc-${Date.now().toString(36)}`.slice(0, 10);
    const r2Key = `courses/${courseId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    // 1. Upload to Cloudflare R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: fileBuffer,
        ContentType: file.type || "application/octet-stream",
        Metadata: {
          originalName: file.name,
          courseId: courseId,
          documentId: documentId,
        },
      })
    );

    // 2. Save Document record to Supabase
    const { data: dbData, error: dbError } = await supabase
      .from("documents")
      .insert({
        document_id: documentId,
        instructor_id: instructorId,
        course_id: courseId,
        topic_id: topicId,
        file_name: file.name,
        file_type: extension.replace(".", "") || "file",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Document insert error:", dbError.message);
      return NextResponse.json({ error: "File uploaded but couldn't be saved. Try again." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      documentId,
      fileName: file.name,
      r2Key: r2Key,
      fileType: extension.replace(".", ""),
      dbRecord: dbData,
    });
  } catch (error) {
    console.error("File upload error:", error);
    const message = error instanceof Error ? error.message : "Internal upload failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
