import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUser } from "@/lib/authMiddleware";
import {
  computeTopics,
  computeStreakDays,
  computeWeekStates,
  computeWeeklyCompletionDayIndex,
  dateKeyUTC,
} from "@/lib/studentProgress";
import type { Subject } from "@/lib/types";

export async function GET(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("student_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();

  if (userError || !userRow?.student_id) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  const studentId: string = userRow.student_id;

  const { data: studentRow } = await supabase
    .from("students")
    .select("name")
    .eq("student_id", studentId)
    .maybeSingle();

  const { data: enrollmentRows } = await supabase
    .from("enrollments")
    .select("course_id")
    .eq("student_id", studentId);
  const courseIds = (enrollmentRows ?? []).map((e) => e.course_id);

  if (courseIds.length === 0) {
    return NextResponse.json({
      userName: studentRow?.name ?? "there",
      streakDays: 0,
      totalXp: 0,
      week: computeWeekStates(new Set()),
      subjects: [] as Subject[],
    });
  }

  const [{ data: courseRows }, { data: topicRows }, { data: xpRows }] = await Promise.all([
    supabase.from("courses").select("course_id, course_name, summary, building").in("course_id", courseIds),
    supabase.from("topics").select("topic_id, course_id, topic_name, sort_order").in("course_id", courseIds),
    supabase.from("xp_log").select("amount, created_at").eq("student_id", studentId),
  ]);

  const topicIds = (topicRows ?? []).map((t) => t.topic_id);

  const [{ data: profileRows }, { data: passedChecks }] = await Promise.all([
    topicIds.length
      ? supabase.from("student_profiles").select("topic_id, mastery_percent").eq("student_id", studentId).in("topic_id", topicIds)
      : Promise.resolve({ data: [] as { topic_id: string; mastery_percent: number }[] }),
    topicIds.length
      ? supabase
          .from("mastery_checks")
          .select("topic_id, checked_at")
          .eq("student_id", studentId)
          .eq("passed", true)
          .in("topic_id", topicIds)
      : Promise.resolve({ data: [] as { topic_id: string; checked_at: string }[] }),
  ]);

  const activeDateKeys = new Set((xpRows ?? []).map((x) => dateKeyUTC(new Date(x.created_at))));
  const totalXp = (xpRows ?? []).reduce((sum, x) => sum + x.amount, 0);

  const subjects: Subject[] = (courseRows ?? []).map((course) => {
    const courseTopics = (topicRows ?? []).filter((t) => t.course_id === course.course_id);
    const courseTopicIds = new Set(courseTopics.map((t) => t.topic_id));
    const courseProfiles = (profileRows ?? []).filter((p) => courseTopicIds.has(p.topic_id));
    const passDateKeysThisCourse = (passedChecks ?? [])
      .filter((c) => courseTopicIds.has(c.topic_id))
      .map((c) => dateKeyUTC(new Date(c.checked_at)));

    return {
      id: course.course_id,
      name: course.course_name,
      summary: course.summary ?? "",
      building: (course.building ?? "citadel") as Subject["building"],
      topics: computeTopics(courseTopics, courseProfiles),
      weeklyCompletion: computeWeeklyCompletionDayIndex(passDateKeysThisCourse),
    };
  });

  return NextResponse.json({
    userName: studentRow?.name ?? "there",
    streakDays: computeStreakDays(activeDateKeys),
    totalXp,
    week: computeWeekStates(activeDateKeys),
    subjects,
  });
}
