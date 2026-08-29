import { test, expect } from "@playwright/test";
import { mintToken } from "./helpers/auth";
import { getTestInstructorId, getTestStudentUserId, deleteRosterEntry, TEST_COURSE_ID } from "./helpers/fixtures";

// API-layer validation tests -- these use Playwright's browser-less `request`
// fixture (no page, no browser) to test the Next.js API routes' own
// auth/validation/error-shape logic directly and fast. Complements the full
// browser-driven specs, which exercise these same routes indirectly through
// real UI flows but don't systematically check every error path.

test.describe("POST /api/instructor/courses/[courseId]/roster", () => {
  test("rejects with 403 when the caller isn't an instructor", async ({ request }) => {
    const studentToken = mintToken(await getTestStudentUserId(), "student");
    const res = await request.post(`/api/instructor/courses/${TEST_COURSE_ID}/roster`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { studentId: "S99999", name: "Test", email: "test@example.edu" },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects with 404 for a course the instructor doesn't own", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post(`/api/instructor/courses/nonexistent-course/roster`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { studentId: "S99999", name: "Test", email: "test@example.edu" },
    });
    expect(res.status()).toBe(404);
  });

  test("rejects with 400 when required fields are missing", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post(`/api/instructor/courses/${TEST_COURSE_ID}/roster`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { studentId: "S99999" },
    });
    expect(res.status()).toBe(400);
  });

  test("succeeds once, then rejects the identical (studentId, courseId) pair with 409", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const studentId = `APIV${Date.now().toString(36).slice(-6)}`;
    try {
      const first = await request.post(`/api/instructor/courses/${TEST_COURSE_ID}/roster`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { studentId, name: "API Validation Test", email: "api.validation@example.edu" },
      });
      expect(first.status()).toBe(201);

      const second = await request.post(`/api/instructor/courses/${TEST_COURSE_ID}/roster`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { studentId, name: "API Validation Test", email: "api.validation@example.edu" },
      });
      expect(second.status()).toBe(409);
    } finally {
      await deleteRosterEntry(studentId, TEST_COURSE_ID);
    }
  });
});

test.describe("GET/PATCH /api/student/settings", () => {
  test("GET rejects with 403 for a non-student token", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.get("/api/student/settings", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test("GET succeeds for the real student and returns the expected shape", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.get("/api/student/settings", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("preferredExplanationFormat");
    expect(body).toHaveProperty("priorCourses");
    expect(Array.isArray(body.priorCourses)).toBe(true);
  });

  test("PATCH rejects an unrecognized explanation format with 400", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.patch("/api/student/settings", {
      headers: { Authorization: `Bearer ${token}` },
      data: { preferredExplanationFormat: "Not A Real Format" },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH rejects a priorCourses array over the 20-item cap with 400", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.patch("/api/student/settings", {
      headers: { Authorization: `Bearer ${token}` },
      data: { priorCourses: Array.from({ length: 21 }, (_, i) => `Course ${i}`) },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH succeeds with a valid payload and the change round-trips through GET", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const patchRes = await request.patch("/api/student/settings", {
      headers: { Authorization: `Bearer ${token}` },
      data: { preferredExplanationFormat: "Analogy", priorCourses: ["API Validation Course"] },
    });
    expect(patchRes.status()).toBe(200);

    const getRes = await request.get("/api/student/settings", { headers: { Authorization: `Bearer ${token}` } });
    const body = await getRes.json();
    expect(body.preferredExplanationFormat).toBe("Analogy");
    expect(body.priorCourses).toEqual(["API Validation Course"]);
  });
});
