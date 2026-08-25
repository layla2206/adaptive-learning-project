import type { Subject } from "./types";
import { masteredCount } from "./utils";

export const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** Monday = 0 .. Sunday = 6, converting from JS's Sunday-first Date#getDay(). */
export function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

export function currentWeekLabel(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - todayIndex());
  return `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// Mock "days ago within this week" a subject's lecture was completed — negative offsets
// from today, clamped so a completion never lands in the future relative to "today."
const COMPLETION_OFFSET: Record<string, number | null> = {
  dsa: -2,
  calculus: 0,
  "linear-algebra": null,
  orgo: null,
};

export interface WeeklyRow {
  subjectId: string;
  subjectName: string;
  completedDayIndex: number | null;
  onTrack: boolean;
}

export function buildWeeklyRows(subjects: Subject[]): WeeklyRow[] {
  const today = todayIndex();
  return subjects.map((s) => {
    const offset = COMPLETION_OFFSET[s.id] ?? null;
    const completedDayIndex = offset === null ? null : Math.max(0, today + offset);
    return {
      subjectId: s.id,
      subjectName: s.name,
      completedDayIndex,
      onTrack: completedDayIndex !== null,
    };
  });
}

export type BadgeIconKind = "shield" | "star" | "ribbon";

export interface Badge {
  id: string;
  name: string;
  icon: BadgeIconKind;
  unlocked: boolean;
  /** Shown in the tooltip for locked badges that track numeric progress. */
  progress?: { current: number; total: number };
}

export interface Shelf {
  label: string;
  badges: Badge[];
}

export function buildShelves(subjects: Subject[], streakDays: number): Shelf[] {
  const subjectShelves: Shelf[] = subjects.map((s) => {
    const mastered = masteredCount(s);
    const total = s.topics.length;
    return {
      label: s.name,
      badges: [
        {
          id: `${s.id}-palace-lit`,
          name: "Palace Lit",
          icon: "shield",
          unlocked: total > 0 && mastered === total,
          progress: { current: mastered, total },
        },
        {
          id: `${s.id}-first-light`,
          name: "First Light",
          icon: "star",
          unlocked: mastered >= 1,
        },
      ],
    };
  });

  const streakShelf: Shelf = {
    label: "Streaks",
    badges: [
      {
        id: "streak-7",
        name: "7-Day Streak",
        icon: "ribbon",
        unlocked: streakDays >= 7,
        progress: { current: Math.min(streakDays, 7), total: 7 },
      },
      {
        id: "streak-30",
        name: "30-Day Streak",
        icon: "ribbon",
        unlocked: streakDays >= 30,
        progress: { current: Math.min(streakDays, 30), total: 30 },
      },
    ],
  };

  return [...subjectShelves, streakShelf];
}

export function badgeTooltip(badge: Badge): string {
  if (badge.unlocked) return badge.name;
  if (badge.progress) return `${badge.name} — ${badge.progress.current}/${badge.progress.total}`;
  return badge.name;
}
