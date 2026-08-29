import { test, expect } from "@playwright/test";
import { mintToken } from "./helpers/auth";
import { getTestInstructorId, getTestStudentUserId, TEST_COURSE_ID, TEST_TOPIC_ID } from "./helpers/fixtures";

// API-layer validation for three thin Next.js proxies in front of FastAPI
// (/api/diagnostic/submit, /api/session/history, /api/query) that had zero
// coverage of their OWN auth/validation layer before this pass -- the
// backend logic they forward to is covered separately (test_diagnostic_submit.py,
// test_session_history.py, test_query.py).

test.describe("POST /api/diagnostic/submit", () => {
  test("rejects a non-student caller with 403", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post("/api/diagnostic/submit", { headers: { Authorization: `Bearer ${token}` }, data: { answers: [] } });
    expect(res.status()).toBe(403);
  });

  test("rejects a missing/non-array answers field with 400", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.post("/api/diagnostic/submit", { headers: { Authorization: `Bearer ${token}` }, data: {} });
    expect(res.status()).toBe(400);
  });
});

test.describe("GET /api/session/history", () => {
  test("rejects a non-student caller with 403", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.get(`/api/session/history?topicId=${TEST_TOPIC_ID}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test("rejects a missing topicId with 400", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.get("/api/session/history", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(400);
  });
});

test.describe("POST /api/query", () => {
  test("rejects a non-student caller with 403", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post("/api/query", {
      headers: { Authorization: `Bearer ${token}` },
      data: { courseId: TEST_COURSE_ID, topicId: TEST_TOPIC_ID, question: "How do hash tables work?" },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects a missing courseId with 400", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.post("/api/query", {
      headers: { Authorization: `Bearer ${token}` },
      data: { topicId: TEST_TOPIC_ID, question: "How do hash tables work?" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a missing topicId with 400", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.post("/api/query", {
      headers: { Authorization: `Bearer ${token}` },
      data: { courseId: TEST_COURSE_ID, question: "How do hash tables work?" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a missing question with 400", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.post("/api/query", {
      headers: { Authorization: `Bearer ${token}` },
      data: { courseId: TEST_COURSE_ID, topicId: TEST_TOPIC_ID },
    });
    expect(res.status()).toBe(400);
  });
});
