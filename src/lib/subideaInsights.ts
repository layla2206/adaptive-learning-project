import type { SubideaSignal } from "./instructorData";

interface SubideaRow {
  subidea_id: string;
  label: string;
}

/** One mastery_checks row, scoped by subidea_id (null rows -- topics with
 * no sub-idea breakdown yet -- are filtered out by the caller). solve_score
 * non-null means this was a retry-check submission (the "advance anyway on
 * final failure" rule) -- a retry-check that still failed is what makes a
 * sub-idea a "gap," distinct from a merely low average. */
interface MasteryCheckRow {
  student_id: string;
  topic_id: string;
  subidea_id: string;
  overall_mastery: number;
  passed: boolean;
  solve_score: number | null;
}

/** A follow-up asked mid-explanation, tagged to whichever sub-idea was on
 * screen (subidea_id null when the student asked outside any tagged
 * section, or the topic has no sub-idea list at all -- excluded from the
 * per-sub-idea count rather than mis-attributed). topic_id is resolved by
 * the caller from the owning session, since session_messages itself has no
 * topic_id column. */
interface FollowUpRow {
  topic_id: string;
  subidea_id: string | null;
}

/** Same on-the-fly-computation convention as instructorInsights.ts's
 * computeStuckCohort/computeMistakeBreakdown -- nothing here is
 * precomputed/stored, it's derived fresh from mastery_checks (now genuinely
 * per-sub-idea -- each sub-idea gets its own real check, not an
 * approximation) and tagged session_messages (the follow-up-rate signal)
 * each time the dashboard loads. Three independent numbers per sub-idea,
 * never blended: a sub-idea students consistently score low on implies a
 * different lecture fix than one they only ask follow-ups about, and a
 * "gap" (a student who exhausted hints/retry and still failed, but was
 * allowed to move on) deserves more visibility than either. */
export function buildSubideaSignals(
  topicId: string,
  subideas: SubideaRow[],
  checkRows: MasteryCheckRow[],
  followUpRows: FollowUpRow[]
): SubideaSignal[] {
  const scoresByIdea = new Map<string, number[]>();
  const gapStudentsByIdea = new Map<string, Set<string>>();
  for (const row of checkRows) {
    if (row.topic_id !== topicId) continue;
    const scores = scoresByIdea.get(row.subidea_id) ?? [];
    scores.push(Number(row.overall_mastery));
    scoresByIdea.set(row.subidea_id, scores);

    if (row.solve_score !== null && !row.passed) {
      const gapStudents = gapStudentsByIdea.get(row.subidea_id) ?? new Set<string>();
      gapStudents.add(row.student_id);
      gapStudentsByIdea.set(row.subidea_id, gapStudents);
    }
  }

  const followUpsByIdea = new Map<string, number>();
  for (const row of followUpRows) {
    if (row.topic_id !== topicId || !row.subidea_id) continue;
    followUpsByIdea.set(row.subidea_id, (followUpsByIdea.get(row.subidea_id) ?? 0) + 1);
  }

  return subideas.map((s) => {
    const scores = scoresByIdea.get(s.subidea_id) ?? [];
    return {
      subideaId: s.subidea_id,
      label: s.label,
      scoreAttempts: scores.length,
      avgUnderstandingScore: scores.length ? scores.reduce((sum, v) => sum + v, 0) / scores.length : 0,
      followUpCount: followUpsByIdea.get(s.subidea_id) ?? 0,
      gapCount: gapStudentsByIdea.get(s.subidea_id)?.size ?? 0,
    };
  });
}
