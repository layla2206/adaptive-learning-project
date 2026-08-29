import { test, expect } from "@playwright/test";
import { mintToken } from "./helpers/auth";
import {
  getTestInstructorId,
  getTestStudentUserId,
  TEST_COURSE_ID,
  TEST_TOPIC_ID,
  tagReferenceDocument,
  untagReferenceDocument,
} from "./helpers/fixtures";

// API-layer validation for three GET routes that had zero coverage before
// this pass: the instructor course-detail and dashboard pages, and the
// student-facing practice/quiz availability check.

test.describe("GET /api/instructor/courses/[courseId]", () => {
  test("rejects a non-instructor caller with 403", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.get(`/api/instructor/courses/${TEST_COURSE_ID}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test("rejects a course the instructor doesn't own with 404", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.get("/api/instructor/courses/nonexistent-course", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(404);
  });

  test("returns the expected shape for an owned course", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.get(`/api/instructor/courses/${TEST_COURSE_ID}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(TEST_COURSE_ID);
    expect(typeof body.rosterSize).toBe("number");
    expect(Array.isArray(body.topics)).toBe(true);
    expect(body.topics.some((t: { id: string }) => t.id === TEST_TOPIC_ID)).toBe(true);
  });
});

test.describe("GET /api/instructor/dashboard", () => {
  test("rejects a non-instructor caller with 403", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.get("/api/instructor/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test("returns the expected shape for the real instructor", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.get("/api/instructor/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.stats).toHaveLength(4);
    expect(Array.isArray(body.courses)).toBe(true);
    expect(body.courses.some((c: { id: string }) => c.id === TEST_COURSE_ID)).toBe(true);
    expect(typeof body.stuckTopicsByCourse).toBe("object");
  });
});

test.describe("GET /api/practice/availability", () => {
  test("rejects a non-student caller with 403", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.get(`/api/practice/availability?topicId=${TEST_TOPIC_ID}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test("rejects a missing topicId with 400", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.get("/api/practice/availability", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(400);
  });

  test("reports quiz availability once a document is tagged, and not before", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");

    const before = await request.get(`/api/practice/availability?topicId=${TEST_TOPIC_ID}`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await before.json()).quiz).toBe(false);

    const documentId = await tagReferenceDocument(TEST_TOPIC_ID, "quiz");
    try {
      const after = await request.get(`/api/practice/availability?topicId=${TEST_TOPIC_ID}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(after.status()).toBe(200);
      const body = await after.json();
      expect(body.quiz).toBe(true);
      expect(body.practiceAssignment).toBe(false);
    } finally {
      await untagReferenceDocument(documentId);
    }
  });
});
