import { describe, it, expect } from "vitest";
import { computeStuckCohort, computeMistakeBreakdown } from "./instructorInsights";

describe("computeStuckCohort", () => {
  it("counts a student as stuck once they have 2+ retries and are not mastered", () => {
    const retryRows = [
      { student_id: "s1", topic_id: "t1" },
      { student_id: "s1", topic_id: "t1" },
    ];
    const { stuckStudentIds } = computeStuckCohort("t1", retryRows, []);
    expect(stuckStudentIds).toEqual(["s1"]);
  });

  it("a single retry does not count as stuck", () => {
    const retryRows = [{ student_id: "s1", topic_id: "t1" }];
    const { stuckStudentIds } = computeStuckCohort("t1", retryRows, []);
    expect(stuckStudentIds).toEqual([]);
  });

  it("a student at 100% mastery is excluded even with many retries", () => {
    const retryRows = [
      { student_id: "s1", topic_id: "t1" },
      { student_id: "s1", topic_id: "t1" },
      { student_id: "s1", topic_id: "t1" },
    ];
    const profileRows = [{ student_id: "s1", topic_id: "t1", mastery_percent: 100 }];
    const { stuckStudentIds } = computeStuckCohort("t1", retryRows, profileRows);
    expect(stuckStudentIds).toEqual([]);
  });

  it("a passed mastery score (70-99, not just exactly 100) also excludes the student", () => {
    const retryRows = [
      { student_id: "s1", topic_id: "t1" },
      { student_id: "s1", topic_id: "t1" },
    ];
    const profileRows = [{ student_id: "s1", topic_id: "t1", mastery_percent: 78 }];
    const { stuckStudentIds } = computeStuckCohort("t1", retryRows, profileRows);
    expect(stuckStudentIds).toEqual([]);
  });

  it("mastery just below the pass threshold does NOT exclude the student", () => {
    const retryRows = [
      { student_id: "s1", topic_id: "t1" },
      { student_id: "s1", topic_id: "t1" },
    ];
    const profileRows = [{ student_id: "s1", topic_id: "t1", mastery_percent: 65 }];
    const { stuckStudentIds } = computeStuckCohort("t1", retryRows, profileRows);
    expect(stuckStudentIds).toEqual(["s1"]);
  });

  it("ignores retry rows for a different topic", () => {
    const retryRows = [
      { student_id: "s1", topic_id: "t2" },
      { student_id: "s1", topic_id: "t2" },
    ];
    const { stuckStudentIds } = computeStuckCohort("t1", retryRows, []);
    expect(stuckStudentIds).toEqual([]);
  });

  it("computes avgRetries rounded to one decimal across the stuck cohort only", () => {
    const retryRows = [
      { student_id: "s1", topic_id: "t1" },
      { student_id: "s1", topic_id: "t1" },
      { student_id: "s1", topic_id: "t1" }, // s1: 3 retries
      { student_id: "s2", topic_id: "t1" },
      { student_id: "s2", topic_id: "t1" }, // s2: 2 retries
      { student_id: "s3", topic_id: "t1" }, // s3: 1 retry -- not stuck, must not dilute the average
    ];
    const { avgRetries, stuckStudentIds } = computeStuckCohort("t1", retryRows, []);
    expect(stuckStudentIds.sort()).toEqual(["s1", "s2"]);
    expect(avgRetries).toBe(2.5);
  });

  it("returns avgRetries 0 when nobody is stuck", () => {
    const { avgRetries } = computeStuckCohort("t1", [], []);
    expect(avgRetries).toBe(0);
  });
});

describe("computeMistakeBreakdown", () => {
  it("only counts answers from students who are actually in the stuck cohort", () => {
    const answerRows = [
      { student_id: "s1", topic_id: "t1", mistake_tag: "concept_confusion" },
      { student_id: "s-not-stuck", topic_id: "t1", mistake_tag: "concept_confusion" },
    ];
    const breakdown = computeMistakeBreakdown("t1", ["s1"], answerRows);
    expect(breakdown).toEqual([{ tag: "concept_confusion", label: "Concept confusion", count: 1 }]);
  });

  it("counts DISTINCT students per tag, not raw answer rows", () => {
    const answerRows = [
      { student_id: "s1", topic_id: "t1", mistake_tag: "concept_confusion" },
      { student_id: "s1", topic_id: "t1", mistake_tag: "concept_confusion" }, // same student, 2nd attempt, same tag
      { student_id: "s2", topic_id: "t1", mistake_tag: "concept_confusion" },
    ];
    const breakdown = computeMistakeBreakdown("t1", ["s1", "s2"], answerRows);
    expect(breakdown).toEqual([{ tag: "concept_confusion", label: "Concept confusion", count: 2 }]);
  });

  it("ignores answers for a different topic", () => {
    const answerRows = [{ student_id: "s1", topic_id: "t2", mistake_tag: "concept_confusion" }];
    const breakdown = computeMistakeBreakdown("t1", ["s1"], answerRows);
    expect(breakdown).toEqual([]);
  });

  it("falls back to the raw tag string when there's no known label", () => {
    const answerRows = [{ student_id: "s1", topic_id: "t1", mistake_tag: "some_new_tag" }];
    const breakdown = computeMistakeBreakdown("t1", ["s1"], answerRows);
    expect(breakdown[0]).toEqual({ tag: "some_new_tag", label: "some_new_tag", count: 1 });
  });

  it("returns at most the top 2 tags", () => {
    const answerRows = [
      { student_id: "s1", topic_id: "t1", mistake_tag: "concept_confusion" },
      { student_id: "s2", topic_id: "t1", mistake_tag: "concept_confusion" },
      { student_id: "s3", topic_id: "t1", mistake_tag: "calculation_error" },
      { student_id: "s4", topic_id: "t1", mistake_tag: "incomplete" },
    ];
    const breakdown = computeMistakeBreakdown("t1", ["s1", "s2", "s3", "s4"], answerRows);
    expect(breakdown.length).toBe(2);
    expect(breakdown[0].tag).toBe("concept_confusion");
  });
});
