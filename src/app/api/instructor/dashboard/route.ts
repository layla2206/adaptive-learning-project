import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";
import type { StuckSeverity, StuckTopic, TopicBreakdown } from "@/lib/instructorData";
import { computeStuckCohort, computeMistakeBreakdown } from "@/lib/instructorInsights";
import { buildSubideaSignals } from "@/lib/subideaInsights";

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
      topicsByCourse: {},
    });
  }

  const [{ data: enrollmentRows }, { data: topicRows }, { data: documentRows }] = await Promise.all([
    supabase.from("enrollments").select("student_id, course_id").in("course_id", courseIds),
    supabase.from("topics").select("topic_id, course_id, topic_name").in("course_id", courseIds),
    supabase.from("documents").select("document_id, course_id").in("course_id", courseIds),
  ]);

  const topicIds = (topicRows ?? []).map((t) => t.topic_id);
  const allStudentIds = Array.from(new Set((enrollmentRows ?? []).map((e) => e.student_id)));

  const [
    { data: profileRows },
    { data: retryRows },
    { data: answerRows },
    { data: suggestionRows },
    { data: subideaRows },
    { data: subideaCheckRows },
    { data: masteryLoopSessions },
  ] = await Promise.all([
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
    topicIds.length
      ? supabase.from("topic_subideas").select("subidea_id, topic_id, idea_index, label").in("topic_id", topicIds)
      : Promise.resolve({ data: [] as { subidea_id: string; topic_id: string; idea_index: number; label: string }[] }),
    // Now genuinely per-sub-idea (subidea_id set on every row once a topic
    // has a breakdown) -- filtered to non-null so topics without one yet
    // don't pollute the aggregation below.
    topicIds.length
      ? supabase
          .from("mastery_checks")
          .select("student_id, topic_id, subidea_id, overall_mastery, passed, solve_score")
          .in("topic_id", topicIds)
          .not("subidea_id", "is", null)
      : Promise.resolve({
          data: [] as { student_id: string; topic_id: string; subidea_id: string; overall_mastery: number; passed: boolean; solve_score: number | null }[],
        }),
    // Follow-up tagging lives on session_messages, which has no topic_id
    // column of its own -- resolved via the owning (mastery-loop) session.
    topicIds.length
      ? supabase.from("sessions").select("session_id, topic_id").in("topic_id", topicIds).eq("session_type", "mastery_loop")
      : Promise.resolve({ data: [] as { session_id: string; topic_id: string }[] }),
  ]);
  const suggestionByTopic = new Map(
    (suggestionRows ?? []).map((s) => [s.topic_id, { text: s.suggestion_text, generatedAt: s.generated_at }])
  );
  const subideasByTopic = new Map<string, { subidea_id: string; label: string; idea_index: number }[]>();
  for (const s of subideaRows ?? []) {
    const list = subideasByTopic.get(s.topic_id) ?? [];
    list.push({ subidea_id: s.subidea_id, label: s.label, idea_index: s.idea_index });
    subideasByTopic.set(s.topic_id, list);
  }
  for (const list of subideasByTopic.values()) list.sort((a, b) => a.idea_index - b.idea_index);

  const topicBySessionId = new Map((masteryLoopSessions ?? []).map((s) => [s.session_id, s.topic_id]));
  const sessionIds = Array.from(topicBySessionId.keys());
  const { data: followUpMessageRows } = sessionIds.length
    ? await supabase
        .from("session_messages")
        .select("session_id, metadata")
        .in("session_id", sessionIds)
        .eq("sender", "ai")
    : { data: [] as { session_id: string; metadata: { isFollowUp?: boolean; subideaId?: string | null } | null }[] };
  const followUpRows = (followUpMessageRows ?? [])
    .filter((m) => m.metadata?.isFollowUp === true)
    .map((m) => ({ topic_id: topicBySessionId.get(m.session_id) ?? "", subidea_id: m.metadata?.subideaId ?? null }));

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
      const subideaSignals = buildSubideaSignals(
        topic.topic_id,
        subideasByTopic.get(topic.topic_id) ?? [],
        subideaCheckRows ?? [],
        followUpRows
      );
      rows.push({
        topic: topic.topic_name,
        topicId: topic.topic_id,
        stuckCount: stuckStudentIds.length,
        severity: severityFor(stuckStudentIds.length),
        avgRetries,
        mistakeBreakdown,
        suggestion: suggestionByTopic.get(topic.topic_id) ?? null,
        subideaSignals,
      });
    }
    stuckTopicsByCourse[course.course_id] = rows.sort((a, b) => b.stuckCount - a.stuckCount);
  }

  // Every topic, not just ones with a stuck cohort -- lets an instructor see
  // a topic's sub-idea breakdown/insights the moment any data exists for it
  // (e.g. while testing one topic in isolation), without waiting for 2+
  // students to retry and stay unmastered first.
  const topicsByCourse: Record<string, TopicBreakdown[]> = {};
  for (const course of courseRows ?? []) {
    const courseTopics = (topicRows ?? []).filter((t) => t.course_id === course.course_id);
    topicsByCourse[course.course_id] = courseTopics.map((topic) => ({
      topic: topic.topic_name,
      topicId: topic.topic_id,
      subideaSignals: buildSubideaSignals(
        topic.topic_id,
        subideasByTopic.get(topic.topic_id) ?? [],
        subideaCheckRows ?? [],
        followUpRows
      ),
    }));
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
    topicsByCourse,
  });
}
