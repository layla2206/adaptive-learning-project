import { test, expect } from "@playwright/test";
import { mintToken } from "./helpers/auth";
import {
  getTestAdminId,
  getTestInstructorId,
  getTestInstructorRecordId,
  getTestStudentUserId,
  deleteInstructorAndUser,
  deleteCourse,
} from "./helpers/fixtures";

// API-layer validation for the admin console -- instructor account creation
// and status toggling, course creation and status toggling, and the
// dashboard aggregate. None of these had any coverage before this pass.

test.describe("POST /api/admin/instructors", () => {
  test("rejects a non-admin caller with 403", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post("/api/admin/instructors", {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: "Test", email: "admintest@example.edu", password: "Whatever123!" },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects missing fields with 400", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.post("/api/admin/instructors", {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: "Test" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a duplicate email with 409", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.post("/api/admin/instructors", {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: "Duplicate", email: "admin@tutor.local", password: "Whatever123!" },
    });
    expect(res.status()).toBe(409);
  });

  test("creates a real instructor account", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const email = `e2e.admin.created.${Date.now().toString(36)}@example.edu`;
    try {
      const res = await request.post("/api/admin/instructors", {
        headers: { Authorization: `Bearer ${token}` },
        data: { name: "API Validation Instructor", email, password: "Whatever123!" },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(typeof body.instructor_id).toBe("string");
      expect(typeof body.user_id).toBe("string");
    } finally {
      await deleteInstructorAndUser(email);
    }
  });
});

test.describe("PATCH /api/admin/instructors/[id]", () => {
  test("rejects a non-admin caller with 403", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.patch("/api/admin/instructors/nonexistent", {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "deactivated" },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects an unrecognized status with 400", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.patch("/api/admin/instructors/nonexistent", {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "banned" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("POST /api/admin/courses", () => {
  test("rejects a non-admin caller with 403", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post("/api/admin/courses", {
      headers: { Authorization: `Bearer ${token}` },
      data: { courseId: "apitest1", courseName: "API Test", instructorId: await getTestInstructorRecordId() },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects missing fields with 400", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.post("/api/admin/courses", {
      headers: { Authorization: `Bearer ${token}` },
      data: { courseId: "apitest1" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a course code over 10 characters with 400", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.post("/api/admin/courses", {
      headers: { Authorization: `Bearer ${token}` },
      data: { courseId: "waytoolongcoursecode", courseName: "API Test", instructorId: await getTestInstructorRecordId() },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects an unknown instructor with 400", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.post("/api/admin/courses", {
      headers: { Authorization: `Bearer ${token}` },
      data: { courseId: "apitest1", courseName: "API Test", instructorId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a duplicate course code with 409", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.post("/api/admin/courses", {
      headers: { Authorization: `Bearer ${token}` },
      data: { courseId: "cs301", courseName: "Duplicate", instructorId: await getTestInstructorRecordId() },
    });
    expect(res.status()).toBe(409);
  });

  test("creates a real course", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const courseId = `apiv${Date.now().toString(36).slice(-6)}`.slice(0, 10);
    try {
      const res = await request.post("/api/admin/courses", {
        headers: { Authorization: `Bearer ${token}` },
        data: { courseId, courseName: "API Validation Course", instructorId: await getTestInstructorRecordId() },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(courseId);
      expect(body.status).toBe("active");
    } finally {
      await deleteCourse(courseId);
    }
  });
});

test.describe("PATCH /api/admin/courses/[id]", () => {
  test("rejects a non-admin caller with 403", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.patch("/api/admin/courses/cs301", {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "deactivated" },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects an unrecognized status with 400", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.patch("/api/admin/courses/cs301", {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "banned" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("GET /api/admin/dashboard", () => {
  test("rejects a non-admin caller with 403", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.get("/api/admin/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test("returns the expected shape for an admin caller", async ({ request }) => {
    const token = mintToken(await getTestAdminId(), "admin");
    const res = await request.get("/api/admin/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.platformStats).toHaveLength(4);
    expect(Array.isArray(body.instructorAccounts)).toBe(true);
    expect(Array.isArray(body.platformCourses)).toBe(true);
  });
});
