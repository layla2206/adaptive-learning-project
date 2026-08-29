import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers/auth";
import { TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD } from "./helpers/fixtures";

// Regression test for a real bug fixed earlier this project: a hard
// reload / direct navigation to a protected route bounced a fully
// authenticated user to /login instead of recognizing their session.
test("a hard reload on a protected route keeps a logged-in student signed in", async ({ page }) => {
  await loginViaUI(page, TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);

  // Hard reload -- a real full navigation, not client-side routing, which is
  // exactly the case that used to race the session check and lose.
  await page.reload();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("text=/dashboard/i").first()).toBeVisible();
});
