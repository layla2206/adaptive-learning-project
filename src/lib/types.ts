export type TopicState = "locked" | "in-progress" | "mastered";

export interface Topic {
  id: string;
  name: string;
  state: TopicState;
  progressPct: number;
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
