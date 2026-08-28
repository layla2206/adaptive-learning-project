export type TopicState = "locked" | "in-progress" | "mastered";

export interface MistakeTrendEntry {
  tag: string;
  /** All-time count — used for ranking/selecting which tags matter. */
  count: number;
  /** Occurrences in the current UTC week (Mon..Sun). 0 when answered_at wasn't supplied. */
  recentCount: number;
  /** Occurrences in the prior UTC week. 0 when answered_at wasn't supplied. */
  previousCount: number;
}

export interface Topic {
  id: string;
  name: string;
  state: TopicState;
  progressPct: number;
  level: string | null;
  weakArea: string | null;
  /** Recurring mistake types across all mastery-check attempts on this topic,
   * most frequent first — distinct from `weakArea`, which is just the latest
   * attempt's tag. Empty when there's no repeated pattern yet. */
  weakAreaTrend: MistakeTrendEntry[];
}

export type BuildingKind = "citadel" | "observatory" | "crystal" | "hextower";

export interface Subject {
  id: string;
  name: string;
  summary: string;
  building: BuildingKind;
  topics: Topic[];
  /** Day index (0=Mon..6=Sun) this week a lecture in this subject was completed, or null if none yet. */
  weeklyCompletion: number | null;
}

export type DayState = "done" | "today" | "upcoming";

export interface UserProfile {
  name: string;
  streakDays: number;
  totalXp: number;
  week: { label: string; state: DayState }[];
}
