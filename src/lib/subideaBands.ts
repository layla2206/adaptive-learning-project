export type SubideaBand = "good" | "warning" | "critical";

/** Shared score->status mapping so the bar chart and scatter chart (and any
 * future chart) always band the same score the same way. Thresholds match
 * the language instructors already see elsewhere on the dashboard (flagged
 * course avgMastery < 60 in the dashboard route). */
export function bandFor(score: number): SubideaBand {
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

export const BAND_LABEL: Record<SubideaBand, string> = {
  good: "On track",
  warning: "Needs attention",
  critical: "Struggling",
};
