import type { Subject } from "./types";

export function subjectProgress(subject: Subject): number {
  if (subject.topics.length === 0) return 0;
  const total = subject.topics.reduce((sum, t) => sum + t.progressPct, 0);
  return Math.round(total / subject.topics.length);
}

export function masteredCount(subject: Subject): number {
  return subject.topics.filter((t) => t.state === "mastered").length;
}

export function formatEyebrowDate(date: Date): string {
  return date
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
