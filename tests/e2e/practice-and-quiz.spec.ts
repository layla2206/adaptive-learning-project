import { test, expect } from "@playwright/test";
import { seedSession } from "./helpers/auth";
import {
  getTestStudentUserId,
  getTestStudentId,
  resetStudentProgressForTopic,
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

  test("student can open, reveal, and regenerate a practice set from the mastered hub", async ({ page }) => {
    await seedSession(page, await getTestStudentUserId(), "student");
    await page.goto(`/subject/${TEST_COURSE_ID}/topic/${TEST_TOPIC_ID}`);

    await expect(page.getByText("Mastered")).toBeVisible({ timeout: 10000 });
    const practiceLink = page.getByRole("link", { name: "Practice this lecture" });
    await expect(practiceLink).toBeVisible();
    await practiceLink.click();

    await expect(page.locator("text=Question 1 of")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Mock practice question 1")).toBeVisible();

    // No model answer visible until revealed.
    await expect(page.locator("text=Model answer")).not.toBeVisible();
    await page.getByRole("button", { name: "Reveal answer" }).first().click();
    await expect(page.locator("text=Model answer").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide answer" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Generate a new set" }).click();
    await expect(page.locator("text=Question 1 of")).toBeVisible({ timeout: 10000 });
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

  test("student can open a quiz and reveal the correct option", async ({ page }) => {
    await seedSession(page, await getTestStudentUserId(), "student");
    await page.goto(`/subject/${TEST_COURSE_ID}/topic/${TEST_TOPIC_ID}`);
    await page.getByRole("link", { name: "Take a quiz" }).click();

    await expect(page.locator("text=Question 1 of")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Mock quiz Q1")).toBeVisible();
    // Quiz options render as plain (non-clickable) spans -- no submission,
    // just A/B/C/D text visible for every question.
    await expect(page.locator("text=A").first()).toBeVisible();
    await page.getByRole("button", { name: "Reveal answer" }).first().click();
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
