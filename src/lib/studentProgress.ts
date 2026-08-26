import type { Topic, TopicState, DayState } from "./types";

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
