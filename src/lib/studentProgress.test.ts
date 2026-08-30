import { describe, it, expect } from "vitest";
import {
  computeWeakAreaTrends,
  computeTopics,
  currentWeekDateKeysUTC,
  computeWeekStates,
  computeStreakDays,
} from "./studentProgress";

// Jan 1 2024 is a well-known, independently-verifiable Monday -- every date
// below is computed by hand from that anchor, not by trusting the function
// under test to tell us what "this week" means.
const MONDAY = new Date("2024-01-01T12:00:00Z");
const WEDNESDAY_WEEK2 = new Date("2024-01-10T12:00:00Z"); // week of Jan 8-14

describe("currentWeekDateKeysUTC", () => {
  it("returns Monday..Sunday for the week containing `now`", () => {
    expect(currentWeekDateKeysUTC(MONDAY)).toEqual([
      "2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04",
      "2024-01-05", "2024-01-06", "2024-01-07",
    ]);
  });

  it("weeksAgo=1 shifts the whole window back exactly 7 days", () => {
    expect(currentWeekDateKeysUTC(MONDAY, 1)).toEqual([
      "2023-12-25", "2023-12-26", "2023-12-27", "2023-12-28",
      "2023-12-29", "2023-12-30", "2023-12-31",
    ]);
  });

  it("mid-week `now` still resolves to that week's Monday start", () => {
    expect(currentWeekDateKeysUTC(WEDNESDAY_WEEK2)[0]).toBe("2024-01-08");
  });
});

describe("computeWeakAreaTrends", () => {
  it("filters out null and \"none\" tags, ranks by count with alphabetical tie-break, and buckets this-week/last-week/older correctly", () => {
    const rows = [
      { topic_id: "t1", mistake_tag: "concept_confusion", answered_at: "2024-01-09T00:00:00Z" }, // this week
      { topic_id: "t1", mistake_tag: "concept_confusion", answered_at: "2024-01-03T00:00:00Z" }, // last week
      { topic_id: "t1", mistake_tag: "concept_confusion", answered_at: "2023-12-20T00:00:00Z" }, // older
      { topic_id: "t1", mistake_tag: "calculation_error", answered_at: "2024-01-09T00:00:00Z" }, // this week
      { topic_id: "t1", mistake_tag: "off_topic", answered_at: null }, // no date at all
      { topic_id: "t1", mistake_tag: "none", answered_at: "2024-01-09T00:00:00Z" }, // must be excluded
      { topic_id: "t1", mistake_tag: null, answered_at: "2024-01-09T00:00:00Z" }, // must be excluded
    ];

    const trends = computeWeakAreaTrends(rows, WEDNESDAY_WEEK2);
    const entries = trends.get("t1");

    expect(entries).toEqual([
      { tag: "concept_confusion", count: 3, recentCount: 1, previousCount: 1 },
      // calculation_error and off_topic are both count=1 -- alphabetical
      // tie-break picks calculation_error for the second slot.
      { tag: "calculation_error", count: 1, recentCount: 1, previousCount: 0 },
    ]);
  });

  it("rows without answered_at still count toward the all-time total, just not this-week/last-week", () => {
    const rows = [
      { topic_id: "t1", mistake_tag: "incomplete" },
      { topic_id: "t1", mistake_tag: "incomplete" },
    ];
    const entries = computeWeakAreaTrends(rows, WEDNESDAY_WEEK2).get("t1");
    expect(entries).toEqual([{ tag: "incomplete", count: 2, recentCount: 0, previousCount: 0 }]);
  });

  it("returns no entry for a topic with only correct/untagged answers", () => {
    const rows = [{ topic_id: "t1", mistake_tag: "none" }, { topic_id: "t1", mistake_tag: null }];
    expect(computeWeakAreaTrends(rows).has("t1")).toBe(false);
  });
});

describe("computeTopics", () => {
  const topicRows = [
    { topic_id: "t1", topic_name: "Topic 1", sort_order: 1 },
    { topic_id: "t2", topic_name: "Topic 2", sort_order: 2 },
    { topic_id: "t3", topic_name: "Topic 3", sort_order: 3 },
  ];

  it("a brand-new student (no profile rows) has only the first topic unlocked", () => {
    const topics = computeTopics(topicRows, []);
    expect(topics.map((t) => t.state)).toEqual(["in-progress", "locked", "locked"]);
    expect(topics[0].progressPct).toBe(0);
  });

  it("a topic at exactly 100% mastery unlocks the next one", () => {
    const topics = computeTopics(topicRows, [{ topic_id: "t1", mastery_percent: 100, level: "Advanced", weak_area: null }]);
    expect(topics.map((t) => t.state)).toEqual(["mastered", "in-progress", "locked"]);
  });

  it("partial progress (mastery > 0, < 70) is in-progress but does NOT unlock the next topic", () => {
    const topics = computeTopics(topicRows, [{ topic_id: "t1", mastery_percent: 55, level: "Intermediate", weak_area: null }]);
    expect(topics.map((t) => t.state)).toEqual(["in-progress", "locked", "locked"]);
    expect(topics[0].progressPct).toBe(55);
  });

  it("a passed mastery check (70-99, not just exactly 100) counts as mastered and unlocks the next topic", () => {
    const topics = computeTopics(topicRows, [{ topic_id: "t1", mastery_percent: 78, level: "Intermediate", weak_area: null }]);
    expect(topics.map((t) => t.state)).toEqual(["mastered", "in-progress", "locked"]);
    expect(topics[0].progressPct).toBe(100);
  });

  it("attaches each topic's own weakAreaTrend, not another topic's", () => {
    const answerRows = [
      { topic_id: "t1", mistake_tag: "concept_confusion" },
      { topic_id: "t2", mistake_tag: "calculation_error" },
    ];
    const topics = computeTopics(topicRows, [], answerRows);
    expect(topics[0].weakAreaTrend.map((e) => e.tag)).toEqual(["concept_confusion"]);
    expect(topics[1].weakAreaTrend.map((e) => e.tag)).toEqual(["calculation_error"]);
    expect(topics[2].weakAreaTrend).toEqual([]);
  });
});

describe("computeWeekStates", () => {
  it("marks active days done, today as today (if not already active), and the rest upcoming", () => {
    const wednesday = new Date("2024-01-03T12:00:00Z"); // week of Jan 1-7, today = Wed
    const active = new Set(["2024-01-01", "2024-01-02"]); // Mon, Tue done
    const states = computeWeekStates(active, wednesday);
    expect(states.map((s) => s.state)).toEqual(["done", "done", "today", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("today shows as done, not today, if it's already in activeDateKeys", () => {
    const wednesday = new Date("2024-01-03T12:00:00Z");
    const active = new Set(["2024-01-03"]);
    const states = computeWeekStates(active, wednesday);
    expect(states[2].state).toBe("done");
  });
});

describe("computeStreakDays", () => {
  it("counts consecutive active days ending today", () => {
    const now = new Date("2024-01-03T12:00:00Z");
    const active = new Set(["2024-01-01", "2024-01-02", "2024-01-03"]);
    expect(computeStreakDays(active, now)).toBe(3);
  });

  it("falls back to yesterday if today has no activity yet, instead of zeroing out early", () => {
    const now = new Date("2024-01-03T12:00:00Z");
    const active = new Set(["2024-01-01", "2024-01-02"]); // NOT today
    expect(computeStreakDays(active, now)).toBe(2);
  });

  it("returns 0 when neither today nor yesterday is active", () => {
    const now = new Date("2024-01-03T12:00:00Z");
    const active = new Set(["2023-12-20"]);
    expect(computeStreakDays(active, now)).toBe(0);
  });

  it("a gap breaks the streak", () => {
    const now = new Date("2024-01-05T12:00:00Z");
    const active = new Set(["2024-01-05", "2024-01-04", "2024-01-02"]); // missing Jan 3
    expect(computeStreakDays(active, now)).toBe(2);
  });
});
