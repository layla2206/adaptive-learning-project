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
    const { topicId, sessionId, conceptIndex } = body as {
      topicId?: unknown;
      sessionId?: unknown;
      conceptIndex?: unknown;
    };
    if (typeof topicId !== "string" || typeof sessionId !== "string" || typeof conceptIndex !== "number") {
      return NextResponse.json({ error: "topicId, sessionId, conceptIndex are required" }, { status: 400 });
    }

    // student_id is server-resolved, not taken from the request body.
    const response = await fetch(`${FASTAPI_URL}/foundations/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_id: topicId,
        student_id: studentId,
        session_id: sessionId,
        concept_index: conceptIndex,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `FastAPI Error: ${err}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Foundations Advance proxy error:", error);
    const message = error instanceof Error ? error.message : "Internal Next.js proxy failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
