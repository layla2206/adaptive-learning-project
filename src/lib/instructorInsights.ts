import { computeWeakAreaTrends } from "./studentProgress";
import { MISTAKE_TAG_LABELS } from "./mistakeTags";
import type { MistakeBreakdownEntry } from "./instructorData";

interface RetryRow {
  student_id: string;
  topic_id: string;
}

interface ProfileRow {
  student_id: string;
  topic_id: string;
  mastery_percent: number;
}

interface AnswerRow {
  student_id: string;
  topic_id: string;
  mistake_tag: string | null;
}

/** A student counts as stuck on a topic once they've retried it at least
 * twice and still haven't hit full mastery — same definition the dashboard's
 * "Where Students Are Stuck" view has always used, now shared with the
 * single-topic insight-generation route instead of being duplicated there. */
export function computeStuckCohort(
  topicId: string,
  retryRows: RetryRow[],
  profileRows: ProfileRow[]
): { stuckStudentIds: string[]; avgRetries: number } {
  const attemptsByStudent = new Map<string, number>();
  for (const r of retryRows) {
    if (r.topic_id !== topicId) continue;
    attemptsByStudent.set(r.student_id, (attemptsByStudent.get(r.student_id) ?? 0) + 1);
  }
  const masteredStudents = new Set(
    profileRows.filter((p) => p.topic_id === topicId && Number(p.mastery_percent) >= 100).map((p) => p.student_id)
  );
  const stuckEntries = Array.from(attemptsByStudent.entries()).filter(
    ([studentId, count]) => count >= 2 && !masteredStudents.has(studentId)
  );
  const avgRetries = stuckEntries.length
    ? Math.round((stuckEntries.reduce((sum, [, c]) => sum + c, 0) / stuckEntries.length) * 10) / 10
    : 0;
  return { stuckStudentIds: stuckEntries.map(([id]) => id), avgRetries };
}

/** Top mistake tags for a topic's stuck cohort. Reuses computeWeakAreaTrends
 * to rank/select which tags matter, but its `count` is a raw answer-row
 * count — here we re-derive the real distinct-student count per tag so "N of
 * M stuck students" is literally true rather than double-counting a student
 * with several tagged attempts. */
export function computeMistakeBreakdown(
  topicId: string,
  stuckStudentIds: string[],
  answerRows: AnswerRow[]
): MistakeBreakdownEntry[] {
  const stuckSet = new Set(stuckStudentIds);
  const filtered = answerRows.filter((a) => a.topic_id === topicId && stuckSet.has(a.student_id));
  const ranked = computeWeakAreaTrends(filtered).get(topicId) ?? [];

  return ranked.map(({ tag }) => {
    const distinctStudents = new Set(filtered.filter((a) => a.mistake_tag === tag).map((a) => a.student_id));
    return { tag, label: MISTAKE_TAG_LABELS[tag] ?? tag, count: distinctStudents.size };
  });
}
