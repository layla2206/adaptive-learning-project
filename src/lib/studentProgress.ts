import { supabase } from "./supabaseClient";
import type { Topic, TopicState, DayState, Subject } from "./types";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export interface TopicRow {
  topic_id: string;
  topic_name: string;
  sort_order: number;
}

export interface ProfileRow {
  topic_id: string;
  mastery_percent: number;
}

/**
 * Derives each topic's locked/in-progress/mastered state from real
 * student_profiles rows. A brand-new student has no rows at all, so only
 * the first topic (by sort_order) starts unlocked — everything after it
 * stays locked until the topic before it is mastered.
 */
export function computeTopics(topicRows: TopicRow[], profileRows: ProfileRow[]): Topic[] {
  const sorted = [...topicRows].sort(
    (a, b) => a.sort_order - b.sort_order || a.topic_id.localeCompare(b.topic_id)
  );
  const masteryByTopic = new Map(profileRows.map((p) => [p.topic_id, Number(p.mastery_percent)]));

  const topics: Topic[] = [];
  let previousMastered = true;
  for (const row of sorted) {
    const mastery = masteryByTopic.get(row.topic_id);
    let state: TopicState;
    let progressPct: number;

    if (mastery !== undefined && mastery >= 100) {
      state = "mastered";
      progressPct = 100;
    } else if (mastery !== undefined && mastery > 0) {
      state = "in-progress";
      progressPct = mastery;
    } else if (previousMastered) {
      state = "in-progress";
      progressPct = 0;
    } else {
      state = "locked";
      progressPct = 0;
    }

    topics.push({ id: row.topic_id, name: row.topic_name, state, progressPct });
    previousMastered = state === "mastered";
  }
  return topics;
}

/** UTC calendar-day key — avoids local-timezone drift on the server. */
export function dateKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday..Sunday date keys for the week containing `now`, in UTC. */
export function currentWeekDateKeysUTC(now: Date = new Date()): string[] {
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0 .. Sunday = 6
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return dateKeyUTC(d);
  });
}

/**
 * Per-day states for the week view. A day only ever renders "done" if
 * `activeDateKeys` actually contains it — no fabricated completions.
 */
export function computeWeekStates(
  activeDateKeys: Set<string>,
  now: Date = new Date()
): { label: string; state: DayState }[] {
  const weekKeys = currentWeekDateKeysUTC(now);
  const todayKey = dateKeyUTC(now);
  const todayIdx = weekKeys.indexOf(todayKey);

  return weekKeys.map((key, i) => {
    if (activeDateKeys.has(key)) return { label: DAY_LABELS[i], state: "done" as DayState };
    if (i === todayIdx) return { label: DAY_LABELS[i], state: "today" as DayState };
    return { label: DAY_LABELS[i], state: "upcoming" as DayState };
  });
}

/**
 * Consecutive active days ending today (or, if today has no activity yet,
 * ending yesterday — so the streak isn't zeroed out before the day is over).
 */
export function computeStreakDays(activeDateKeys: Set<string>, now: Date = new Date()): number {
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!activeDateKeys.has(dateKeyUTC(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (activeDateKeys.has(dateKeyUTC(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Day index (0=Mon..6=Sun) this week a passing mastery check landed, or null. */
export function computeWeeklyCompletionDayIndex(
  passDateKeys: string[],
  now: Date = new Date()
): number | null {
  const weekKeys = currentWeekDateKeysUTC(now);
  let latestIndex: number | null = null;
  for (const key of passDateKeys) {
    const idx = weekKeys.indexOf(key);
    if (idx !== -1 && (latestIndex === null || idx > latestIndex)) latestIndex = idx;
  }
  return latestIndex;
}

export interface StudentProfilePayload {
  userName: string;
  streakDays: number;
  totalXp: number;
  week: { label: string; state: DayState }[];
  subjects: Subject[];
}

/**
 * The single source of truth for "what does this student's dashboard look
 * like" — real streak/XP/mastery/milestone state computed from the DB, no
 * mock data. Used by both /api/student/dashboard (a student viewing their
 * own data) and /api/profile/[studentId] (an instructor/admin, or the
 * student, looking up a specific student) — there should never be a second,
 * separately-maintained implementation of this.
 */
export async function buildStudentProfile(studentId: string): Promise<StudentProfilePayload> {
  const { data: studentRow } = await supabase.from("students").select("name").eq("student_id", studentId).maybeSingle();

  const { data: enrollmentRows } = await supabase.from("enrollments").select("course_id").eq("student_id", studentId);
  const courseIds = (enrollmentRows ?? []).map((e) => e.course_id);

  if (courseIds.length === 0) {
    return {
      userName: studentRow?.name ?? "there",
      streakDays: 0,
      totalXp: 0,
      week: computeWeekStates(new Set()),
      subjects: [],
    };
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
      : Promise.resolve({ data: [] as ProfileRow[] }),
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

  return {
    userName: studentRow?.name ?? "there",
    streakDays: computeStreakDays(activeDateKeys),
    totalXp,
    week: computeWeekStates(activeDateKeys),
    subjects,
  };
}
