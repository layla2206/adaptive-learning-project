import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";
import type { StuckSeverity, StuckTopic } from "@/lib/instructorData";
import { computeStuckCohort, computeMistakeBreakdown } from "@/lib/instructorInsights";

function severityFor(stuckCount: number): StuckSeverity {
  if (stuckCount >= 15) return "high";
  if (stuckCount >= 5) return "mid";
  return "low";
}

export async function GET(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "instructor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("instructor_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();
  const instructorId: string | undefined = userRow?.instructor_id;
  if (!instructorId) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const { data: instructorRow } = await supabase
    .from("instructors")
    .select("name")
    .eq("instructor_id", instructorId)
    .maybeSingle();

  const { data: courseRows } = await supabase
    .from("courses")
    .select("course_id, course_name")
    .eq("instructor_id", instructorId);
  const courseIds = (courseRows ?? []).map((c) => c.course_id);

  if (courseIds.length === 0) {
    return NextResponse.json({
      instructorName: instructorRow?.name ?? "there",
      stats: [
        { value: "0", label: "Courses Taught" },
        { value: "0", label: "Total Students" },
        { value: "0", label: "Lectures Uploaded" },
        { value: "0%", label: "Avg. Class Mastery" },
      ],
      courses: [],
      stuckTopicsByCourse: {},
    });
  }

  const [{ data: enrollmentRows }, { data: topicRows }, { data: documentRows }] = await Promise.all([
    supabase.from("enrollments").select("student_id, course_id").in("course_id", courseIds),
    supabase.from("topics").select("topic_id, course_id, topic_name").in("course_id", courseIds),
    supabase.from("documents").select("document_id, course_id").in("course_id", courseIds),
  ]);

  const topicIds = (topicRows ?? []).map((t) => t.topic_id);
  const allStudentIds = Array.from(new Set((enrollmentRows ?? []).map((e) => e.student_id)));

  const [{ data: profileRows }, { data: retryRows }, { data: answerRows }, { data: suggestionRows }] = await Promise.all([
    topicIds.length
      ? supabase.from("student_profiles").select("student_id, topic_id, mastery_percent").in("topic_id", topicIds)
      : Promise.resolve({ data: [] as { student_id: string; topic_id: string; mastery_percent: number }[] }),
    topicIds.length
      ? supabase.from("retry_attempts").select("student_id, topic_id").in("topic_id", topicIds)
      : Promise.resolve({ data: [] as { student_id: string; topic_id: string }[] }),
    topicIds.length
      ? supabase.from("student_answers").select("student_id, topic_id, mistake_tag").in("topic_id", topicIds)
      : Promise.resolve({ data: [] as { student_id: string; topic_id: string; mistake_tag: string | null }[] }),
    topicIds.length
      ? supabase.from("instructor_topic_suggestions").select("topic_id, suggestion_text, generated_at").in("topic_id", topicIds)
      : Promise.resolve({ data: [] as { topic_id: string; suggestion_text: string; generated_at: string }[] }),
  ]);
  const suggestionByTopic = new Map(
    (suggestionRows ?? []).map((s) => [s.topic_id, { text: s.suggestion_text, generatedAt: s.generated_at }])
  );

  const courses = (courseRows ?? []).map((course) => {
    const courseTopicIds = new Set((topicRows ?? []).filter((t) => t.course_id === course.course_id).map((t) => t.topic_id));
    const courseStudentIds = new Set(
      (enrollmentRows ?? []).filter((e) => e.course_id === course.course_id).map((e) => e.student_id)
    );
    const courseProfiles = (profileRows ?? []).filter(
      (p) => courseTopicIds.has(p.topic_id) && courseStudentIds.has(p.student_id)
    );
    const avgMastery = courseProfiles.length
      ? Math.round(courseProfiles.reduce((sum, p) => sum + Number(p.mastery_percent), 0) / courseProfiles.length)
      : 0;

    return {
      id: course.course_id,
      name: course.course_name,
      rosterSize: courseStudentIds.size,
      lecturesUploaded: (documentRows ?? []).filter((d) => d.course_id === course.course_id).length,
      avgMastery,
      flagged: courseProfiles.length > 0 && avgMastery < 60,
    };
  });

  const stuckTopicsByCourse: Record<string, StuckTopic[]> = {};
  for (const course of courseRows ?? []) {
    const courseTopics = (topicRows ?? []).filter((t) => t.course_id === course.course_id);
    const rows: StuckTopic[] = [];

    for (const topic of courseTopics) {
      const { stuckStudentIds, avgRetries } = computeStuckCohort(topic.topic_id, retryRows ?? [], profileRows ?? []);
      if (stuckStudentIds.length === 0) continue;

      const mistakeBreakdown = computeMistakeBreakdown(topic.topic_id, stuckStudentIds, answerRows ?? []);
      rows.push({
        topic: topic.topic_name,
        topicId: topic.topic_id,
        stuckCount: stuckStudentIds.length,
        severity: severityFor(stuckStudentIds.length),
        avgRetries,
        mistakeBreakdown,
        suggestion: suggestionByTopic.get(topic.topic_id) ?? null,
      });
    }
    stuckTopicsByCourse[course.course_id] = rows.sort((a, b) => b.stuckCount - a.stuckCount);
  }

  const totalMasteryRows = profileRows ?? [];
  const avgClassMastery = totalMasteryRows.length
    ? Math.round(totalMasteryRows.reduce((sum, p) => sum + Number(p.mastery_percent), 0) / totalMasteryRows.length)
    : 0;

  return NextResponse.json({
    instructorName: instructorRow?.name ?? "there",
    stats: [
      { value: String(courseIds.length), label: "Courses Taught" },
      { value: String(allStudentIds.length), label: "Total Students" },
      { value: String((documentRows ?? []).length), label: "Lectures Uploaded" },
      { value: `${avgClassMastery}%`, label: "Avg. Class Mastery" },
    ],
    courses,
    stuckTopicsByCourse,
  });
}
