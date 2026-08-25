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
}

export type DayState = "done" | "today" | "upcoming";

export interface UserProfile {
  name: string;
  streakDays: number;
  totalXp: number;
  week: { label: string; state: DayState }[];
}
