import { test, expect } from "@playwright/test";
import { seedSession } from "./helpers/auth";
import { getTestStudentUserId, resetTestStudentProgress, TEST_COURSE_ID, TEST_TOPIC_ID } from "./helpers/fixtures";

test.beforeEach(async () => {
  await resetTestStudentProgress();
});

// Full mastery loop on an established topic (Hash Tables): diagnose warm-up
// -> grounded explanation -> a mastery-check attempt that fails and exhausts
// both hints (backend/main.py's MAX_HINT_ATTEMPTS=2) -> a retry intervention
// renders -> the retry's step-by-step solve check passes -> topic mastered.
// The fail-then-pass sequence is driven by which submission label the
// backend/main.py MOCK_GEMINI fixture table keys on ("Explain in your own
// words:" always scores low, "Solve end-to-end:" always scores high) -- see
// the comment above _MOCK_GEMINI_FIXTURES for why that's the real signal,
// not a stateful counter.
test("student works through diagnose -> explain -> fail -> hints -> retry -> pass -> mastered", async ({ page }) => {
  const studentUserId = await getTestStudentUserId();
  await seedSession(page, studentUserId, "student");
  await page.goto(`/subject/${TEST_COURSE_ID}/topic/${TEST_TOPIC_ID}`);

  // Diagnostic warm-up -- click through however many MCQ questions the mock
  // returns, scoped to the diagnose card via the h2 prompt's sibling options
  // div so this never risks clicking the sidebar's Sign out button. Reads
  // the total from the "Warm-up N / total" tag once and clicks a FIXED
  // number of times, rather than polling "is the tag still visible" in a
  // loop -- that polling version raced the diagnose-summary stage's own
  // h2+Continue-button (which the same "h2 ~ div button" locator also
  // matches): a stale visibility read on the last iteration could fire one
  // extra click that landed on Continue, silently skipping straight to
  // explain-shown before this test's own assertions ran.
  const warmupTag = page.getByText(/Warm-up \d+ \/ \d+/);
  await expect(warmupTag).toBeVisible({ timeout: 10000 });
  const totalWarmup = Number((await warmupTag.textContent())?.match(/\/\s*(\d+)/)?.[1] ?? 0);
  for (let i = 0; i < totalWarmup; i++) {
    await page.locator("h2 ~ div button").first().click();
  }

  // Diagnose summary -> grounded explanation
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("text=Mock grounded explanation for automated testing")).toBeVisible({ timeout: 10000 });

  // Move into the mastery check
  await page.getByRole("button", { name: "I understand — check me" }).click();
  await expect(page.locator("textarea")).toBeVisible({ timeout: 10000 });

  // Attempts 1 and 2: mocked to score low ("Explain in your own words:" ->
  // explain_score 40) -- each should surface a hint and keep the composer open.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.locator("textarea").fill(`E2E attempt ${attempt}: my explanation of hash tables.`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("text=Mock hint:")).toHaveCount(attempt, { timeout: 10000 });
  }

  // Attempt 3: hints are now exhausted (MAX_HINT_ATTEMPTS=2), still scored
  // low -> falls through to Feedback + a real retry-generate call.
  await page.locator("textarea").fill("E2E attempt 3: my explanation of hash tables.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Try a different approach" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("text=Mock retry content for automated testing")).toBeVisible();

  // Retry's step-by-step solve check -- mocked to score high
  // ("Solve end-to-end:" -> solve_score 85) -> passes and masters the topic.
  await page.getByRole("button", { name: "Try a different approach" }).click();
  const stepInputs = page.locator("textarea");
  await expect(stepInputs).toHaveCount(3, { timeout: 10000 });
  await stepInputs.nth(0).fill("Hash the key to get a bucket index.");
  await stepInputs.nth(1).fill("Insert or look up within that bucket, resolving collisions.");
  await stepInputs.nth(2).fill("Confirmed by checking the bucket's contents match.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator("text=Topic mastered")).toBeVisible({ timeout: 10000 });
});
