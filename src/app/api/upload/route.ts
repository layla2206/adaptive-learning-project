import { NextRequest, NextResponse } from "next/server";
import { r2Client, R2_BUCKET_NAME, PutObjectCommand } from "@/lib/r2Client";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = (formData.get("courseId") as string) || "cs201";
    const topicId = (formData.get("topicId") as string) || null;
    const instructorId = (formData.get("instructorId") as string) || "inst-1";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
    const uniqueId = `doc-${Date.now().toString(36)}`;
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
          documentId: uniqueId,
        },
      })
    );

    // 2. Save Document record to Supabase
    const { data: dbData, error: dbError } = await supabase
      .from("documents")
      .insert({
        document_id: uniqueId.slice(0, 10),
        instructor_id: instructorId,
        course_id: courseId,
        topic_id: topicId,
        file_name: file.name,
        file_type: extension.replace(".", "") || "file",
      })
      .select()
      .single();

    if (dbError) {
      console.warn("Supabase document insert note (RLS/Foreign key):", dbError.message);
    }

    return NextResponse.json({
      success: true,
      documentId: uniqueId,
      fileName: file.name,
      r2Key: r2Key,
      fileType: extension.replace(".", ""),
      dbRecord: dbData || null,
      dbWarning: dbError ? dbError.message : null,
    });
  } catch (error: any) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal upload failure" },
      { status: 500 }
    );
  }
}
