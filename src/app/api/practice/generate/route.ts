import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getStudentId } from "@/lib/authMiddleware";

const FASTAPI_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser || currentUser.role !== "student") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const studentId = await getStudentId(currentUser.user_id);
    if (!studentId) {
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const body = await req.json();
    const { topicIds, courseId, contentType, forceRegenerate } = body as {
      topicIds?: unknown;
      courseId?: unknown;
      contentType?: unknown;
      forceRegenerate?: unknown;
    };
    if (contentType !== "practice_assignment" && contentType !== "quiz" && contentType !== "final_exam") {
      return NextResponse.json({ error: "A valid contentType is required" }, { status: 400 });
    }
    if (contentType === "final_exam") {
      if (typeof courseId !== "string" || !courseId) {
        return NextResponse.json({ error: "courseId is required for final_exam" }, { status: 400 });
      }
    } else if (!Array.isArray(topicIds) || topicIds.length === 0 || !topicIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "topicIds is required" }, { status: 400 });
    }

    // student_id is server-resolved, not taken from the request body.
    const response = await fetch(`${FASTAPI_URL}/practice/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_ids: contentType === "final_exam" ? [] : topicIds,
        course_id: contentType === "final_exam" ? courseId : undefined,
        student_id: studentId,
        content_type: contentType,
        force_regenerate: forceRegenerate === true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let message = errText;
      try {
        message = JSON.parse(errText).detail ?? errText;
      } catch {
        /* not JSON -- fall back to the raw text */
      }
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Practice Generate proxy error:", error);
    const message = error instanceof Error ? error.message : "Internal Next.js proxy failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
