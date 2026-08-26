import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

const FASTAPI_URL = "http://127.0.0.1:8000";

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
    const courseId = formData.get("courseId") as string | null;
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

    // Server-verified instructor id, not whatever the client sent.
    formData.set("instructorId", instructorId);

    // Forward the formData to FastAPI, which handles R2 storage, parsing,
    // chunking, and embeddings (see backend/main.py).
    const response = await fetch(`${FASTAPI_URL}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `FastAPI Error: ${err}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Next.js proxy upload error:", error);
    const message = error instanceof Error ? error.message : "Internal Next.js proxy failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser || currentUser.role !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const response = await fetch(`${FASTAPI_URL}/upload`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `FastAPI Error: ${err}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Next.js proxy deletion error:", error);
    const message = error instanceof Error ? error.message : "Internal Next.js proxy failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
