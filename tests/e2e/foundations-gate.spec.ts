import { test, expect } from "@playwright/test";
import { seedSession } from "./helpers/auth";
import { getTestStudentUserId, resetStudentProgressForTopic, TEST_COURSE_ID, FOUNDATIONS_TOPIC_ID } from "./helpers/fixtures";

test.beforeEach(async () => {
  await resetStudentProgressForTopic(FOUNDATIONS_TOPIC_ID);
});

// Sorting Algorithms (top-sort1) has no predecessor topic, so instead of the
// normal diagnostic warm-up it gets a dedicated 4-concept Foundations Gate
// (backend/main.py's FOUNDATIONS_GATE_TOPIC_ID) before Explain. The mock
// fixture's 4 questions have correct answers A, B, C, D in concept order
// (see backend/main.py's "in this exact order:" fixture entry) -- concept 1
// is deliberately answered wrong here to exercise the explanation branch,
// the rest answered correctly to exercise the direct-advance branch, so both
// paths through _foundations_next_payload get real coverage in one run.
test("student clears the Foundations Gate (one wrong answer, three right) and rejoins the normal explain flow", async ({ page }) => {
  await seedSession(page, await getTestStudentUserId(), "student");
  await page.goto(`/subject/${TEST_COURSE_ID}/topic/${FOUNDATIONS_TOPIC_ID}`);

  // Concept 1 -- answer wrong (correct is index 0 / "A"; click index 1 / "B").
  await expect(page.locator("text=Concept 1 / 4")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("text=Variables & Assignment")).toBeVisible();
  await expect(page.locator("text=Mock foundations Q1")).toBeVisible();
  await page.locator("h2 ~ div button").nth(1).click();

  await expect(page.locator("text=Not quite — here's the idea")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("text=Mock foundations explanation for testing.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Concept 2 -- answer correctly (index 1 / "B") -> advances directly, no explanation screen.
  await expect(page.locator("text=Concept 2 / 4")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("text=Arrays & Indexing")).toBeVisible();
  await page.locator("h2 ~ div button").nth(1).click();

  // Concept 3 -- correct is index 2 / "C".
  await expect(page.locator("text=Concept 3 / 4")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("text=Comparing Two Values")).toBeVisible();
  await page.locator("h2 ~ div button").nth(2).click();

  // Concept 4 -- correct is index 3 / "D".
  await expect(page.locator("text=Concept 4 / 4")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("text=Swapping Two Values")).toBeVisible();
  await page.locator("h2 ~ div button").nth(3).click();

  // Gate cleared -> rejoins the normal Explain flow via the same
  // handleDiagnoseSummaryContinue handler the ordinary diagnose-summary
  // stage uses.
  await expect(page.locator("text=Foundations cleared")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("text=Mock grounded explanation for automated testing")).toBeVisible({ timeout: 10000 });
});
