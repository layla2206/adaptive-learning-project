import { test, expect } from "@playwright/test";
import { seedSession } from "./helpers/auth";
import { getTestStudentUserId, getTestStudentId, resetStudentProgressForTopic, TEST_COURSE_ID, TEST_TOPIC_ID } from "./helpers/fixtures";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
}

async function setMastered(topicId: string) {
  const studentId = await getTestStudentId();
  await db()
    .from("student_profiles")
    .upsert({ student_id: studentId, topic_id: topicId, mastery_percent: 100 }, { onConflict: "student_id,topic_id" });
}

test.beforeEach(async () => {
  await resetStudentProgressForTopic(TEST_TOPIC_ID);
  await setMastered(TEST_TOPIC_ID);
});

test("student can chat with the peer buddy and hits the turn cap after 6 messages", async ({ page }) => {
  await seedSession(page, await getTestStudentUserId(), "student");
  await page.goto(`/subject/${TEST_COURSE_ID}/topic/${TEST_TOPIC_ID}`);

  await expect(page.getByText("Mastered")).toBeVisible({ timeout: 10000 });
  await page.getByRole("link", { name: "Explain it to a friend" }).click();

  await expect(page.locator("text=Your friend just missed")).toBeVisible({ timeout: 10000 });

  // backend/main.py's MAX_PEER_BUDDY_TURNS = 6 -- capped becomes true in the
  // response to the 6th student message already (prior_turns=5 -> 5+1>=6),
  // not only after a 7th attempt.
  for (let turn = 1; turn <= 6; turn++) {
    await page.locator("textarea").fill(`E2E turn ${turn}: here's how hashing works...`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("text=Mock peer-buddy reply for testing.")).toHaveCount(turn, { timeout: 10000 });
  }

  await expect(page.locator("text=That's a wrap for this conversation.")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("textarea")).not.toBeVisible();
});

test("returning to an existing conversation resumes it from history instead of starting fresh", async ({ page }) => {
  await seedSession(page, await getTestStudentUserId(), "student");
  await page.goto(`/subject/${TEST_COURSE_ID}/topic/${TEST_TOPIC_ID}/peer-buddy`);
  await expect(page.locator("text=Your friend just missed")).toBeVisible({ timeout: 10000 });

  await page.locator("textarea").fill("E2E: first message in this conversation.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("text=Mock peer-buddy reply for testing.")).toBeVisible({ timeout: 10000 });

  await page.reload();
  await expect(page.locator("text=E2E: first message in this conversation.")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("text=Mock peer-buddy reply for testing.")).toBeVisible();
  // The empty-state prompt must NOT reappear once real history exists.
  await expect(page.locator("text=Your friend just missed")).not.toBeVisible();
});
