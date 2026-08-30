import { test, expect } from "@playwright/test";
import { seedSession } from "./helpers/auth";
import {
  getTestStudentUserId,
  getTestStudentId,
  resetStudentProgressForTopic,
  resetFinalExamContent,
  tagReferenceDocument,
  untagReferenceDocument,
  TEST_COURSE_ID,
  TEST_TOPIC_ID,
} from "./helpers/fixtures";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
}

// On-demand practice/quiz only appears on the mastered-topic hub, and
// /practice/generate 200s with {"error": ...} until at least one document on
// the topic is tagged as a reference (see fixtures.ts's tagReferenceDocument
// doc comment) -- both preconditions are set up directly rather than
// re-running the full mastery loop, to keep this spec focused on the
// practice/quiz surface itself.
async function setMastered(topicId: string) {
  const studentId = await getTestStudentId();
  await db()
    .from("student_profiles")
    .upsert({ student_id: studentId, topic_id: topicId, mastery_percent: 100 }, { onConflict: "student_id,topic_id" });
}

test.describe("Practice assignment", () => {
  let refDocId: string;

  test.beforeEach(async () => {
    await resetStudentProgressForTopic(TEST_TOPIC_ID);
    await setMastered(TEST_TOPIC_ID);
    refDocId = await tagReferenceDocument(TEST_TOPIC_ID, "practice_assignment");
  });

  test.afterEach(async () => {
    await untagReferenceDocument(refDocId);
  });

  test("student can open a practice set from the mastered hub and download both PDFs", async ({ page }) => {
    await seedSession(page, await getTestStudentUserId(), "student");
    await page.goto(`/subject/${TEST_COURSE_ID}/topic/${TEST_TOPIC_ID}`);

    await expect(page.getByText("Mastered")).toBeVisible({ timeout: 10000 });
    const practiceLink = page.getByRole("link", { name: "Practice this lecture" });
    await expect(practiceLink).toBeVisible();
    await practiceLink.click();

    await expect(page.locator("text=ready to download")).toBeVisible({ timeout: 20000 });
    const questionsLink = page.getByRole("link", { name: "Download Questions (PDF)" });
    const answerKeyLink = page.getByRole("link", { name: "Download Answer Key (PDF)" });
    await expect(questionsLink).toBeVisible();
    await expect(answerKeyLink).toBeVisible();
    expect(await questionsLink.getAttribute("href")).toContain("questions");
    expect(await answerKeyLink.getAttribute("href")).toContain("answer_key");

    await page.getByRole("button", { name: "Generate a new set" }).click();
    await expect(page.locator("text=ready to download")).toBeVisible({ timeout: 20000 });
  });
});

test.describe("Quiz", () => {
  let refDocId: string;

  test.beforeEach(async () => {
    await resetStudentProgressForTopic(TEST_TOPIC_ID);
    await setMastered(TEST_TOPIC_ID);
    refDocId = await tagReferenceDocument(TEST_TOPIC_ID, "quiz");
  });

  test.afterEach(async () => {
    await untagReferenceDocument(refDocId);
  });

  test("student picks lectures for a quiz and downloads both PDFs", async ({ page }) => {
    await seedSession(page, await getTestStudentUserId(), "student");
    await page.goto(`/subject/${TEST_COURSE_ID}/topic/${TEST_TOPIC_ID}`);
    // "Take a quiz" now opens an inline lecture-selection step (checkbox
    // list of mastered lectures, current one pre-checked) before generating.
    await page.getByRole("button", { name: "Take a quiz" }).click();
    await expect(page.locator("text=Choose which lectures to include")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="checkbox"]').first()).toBeChecked();

    await page.getByRole("link", { name: "Generate quiz" }).click();
    await expect(page.locator("text=ready to download")).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("link", { name: "Download Questions (PDF)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download Answer Key (PDF)" })).toBeVisible();
  });
});

test.describe("Final exam", () => {
  let refDocId: string;
  let studentId: string;

  test.beforeEach(async () => {
    studentId = await getTestStudentId();
    await resetFinalExamContent(studentId);
    // No 'exam'-tagged document exists on the seeded course -- tags a 'quiz'
    // one instead, exercising final_exam's fallback-to-quiz-reference path
    // (see backend/main.py's PRACTICE_CONTENT_SPECS "fallback_reference_document_type").
    refDocId = await tagReferenceDocument(TEST_TOPIC_ID, "quiz");
  });

  test.afterEach(async () => {
    await untagReferenceDocument(refDocId);
    await resetFinalExamContent(studentId);
  });

  test("student can generate and download a final exam from the subject page", async ({ page }) => {
    await seedSession(page, await getTestStudentUserId(), "student");
    await page.goto(`/subject/${TEST_COURSE_ID}`);
    await page.getByRole("link", { name: "Final exam" }).click();

    await expect(page.locator("text=ready to download")).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("link", { name: "Download Questions (PDF)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download Answer Key (PDF)" })).toBeVisible();
  });
});

test("practice page shows the correct empty state when no reference document is tagged", async ({ page }) => {
  await resetStudentProgressForTopic(TEST_TOPIC_ID);
  await setMastered(TEST_TOPIC_ID);
  await seedSession(page, await getTestStudentUserId(), "student");
  // Direct navigation -- deliberately skipping the hub, since with nothing
  // tagged the hub wouldn't even show the "Practice this lecture" link.
  await page.goto(`/subject/${TEST_COURSE_ID}/topic/${TEST_TOPIC_ID}/practice?type=practice_assignment`);
  await expect(page.locator("text=No instructor practice assignment material is available")).toBeVisible({ timeout: 10000 });
});
