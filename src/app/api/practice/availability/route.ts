import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";

// Pure Supabase read -- no FastAPI, no Gemini call, free to call as often as
// needed. A topic's practice/quiz buttons should only appear once the
// instructor has actually uploaded and tagged reference material for it.
export async function GET(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const topicId = req.nextUrl.searchParams.get("topicId");
  if (!topicId) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("document_type")
    .eq("topic_id", topicId)
    .in("document_type", ["practice_assignment", "quiz"]);

  if (error) {
    console.error("Practice availability error:", error.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const types = new Set((data ?? []).map((row) => row.document_type));
  return NextResponse.json({
    practiceAssignment: types.has("practice_assignment"),
    quiz: types.has("quiz"),
  });
}
