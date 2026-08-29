import { test, expect } from "@playwright/test";
import { mintToken } from "./helpers/auth";
import { getTestInstructorId, getTestStudentUserId, TEST_COURSE_ID, TEST_TOPIC_ID } from "./helpers/fixtures";

// API-layer validation for the document-upload pipeline's Next.js proxy
// (/api/upload -> FastAPI's /upload; see backend/tests/test_upload.py for
// the ingestion logic itself -- chunking, embedding, cascade delete) and
// /api/instructor/documents/[id] (tagging). The success-path tests below
// require the FastAPI backend to be running with MOCK_GEMINI=1 (same
// requirement as practice-and-quiz.spec.ts and peer-buddy.spec.ts) so they
// don't spend real embedding quota.

test.describe("POST /api/upload", () => {
  test("rejects a non-instructor caller with 403", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.post("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: "test.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }, courseId: TEST_COURSE_ID },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects a missing courseId with 400", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: "test.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a course the instructor doesn't own with 404", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: "test.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }, courseId: "nonexistent-course" },
    });
    expect(res.status()).toBe(404);
  });

  test("uploads a real file, chunks and embeds it, and lists it in the course's files", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const fileName = `e2e-upload-${Date.now()}.txt`;
    let documentId: string | undefined;
    try {
      const uploadRes = await request.post("/api/upload", {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: fileName,
            mimeType: "text/plain",
            buffer: Buffer.from("Hash tables map keys to buckets using a hash function. ".repeat(20)),
          },
          courseId: TEST_COURSE_ID,
          topicId: TEST_TOPIC_ID,
        },
      });
      expect(uploadRes.status()).toBe(200);
      const body = await uploadRes.json();
      expect(body.success).toBe(true);
      expect(body.chunksInserted).toBeGreaterThan(0);
      documentId = body.documentId;

      const listRes = await request.get(`/api/instructor/courses/${TEST_COURSE_ID}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(listRes.status()).toBe(200);
      const files = await listRes.json();
      expect(files.some((f: { id: string; name: string }) => f.id === documentId && f.name === fileName)).toBe(true);
    } finally {
      if (documentId) {
        await request.delete("/api/upload", { headers: { Authorization: `Bearer ${token}` }, data: { documentId } });
      }
    }
  });
});

test.describe("DELETE /api/upload", () => {
  test("rejects a non-instructor caller with 403", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.delete("/api/upload", { headers: { Authorization: `Bearer ${token}` }, data: { documentId: "doc-anything" } });
    expect(res.status()).toBe(403);
  });

  test("rejects a document the instructor doesn't own (or that doesn't exist) with 404", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.delete("/api/upload", { headers: { Authorization: `Bearer ${token}` }, data: { documentId: "nonexistent" } });
    expect(res.status()).toBe(404);
  });
});

test.describe("PATCH /api/instructor/documents/[documentId]", () => {
  let documentId: string;

  test.beforeAll(async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.post("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: `e2e-patch-fixture-${Date.now()}.txt`, mimeType: "text/plain", buffer: Buffer.from("fixture content") },
        courseId: TEST_COURSE_ID,
      },
    });
    documentId = (await res.json()).documentId;
  });

  test.afterAll(async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    await request.delete("/api/upload", { headers: { Authorization: `Bearer ${token}` }, data: { documentId } });
  });

  test("rejects a non-instructor caller with 403", async ({ request }) => {
    const token = mintToken(await getTestStudentUserId(), "student");
    const res = await request.patch(`/api/instructor/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { documentType: "quiz" },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects a document the instructor doesn't own with 404", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.patch("/api/instructor/documents/nonexistent-doc", {
      headers: { Authorization: `Bearer ${token}` },
      data: { documentType: "quiz" },
    });
    expect(res.status()).toBe(404);
  });

  test("rejects an unrecognized documentType with 400", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.patch(`/api/instructor/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { documentType: "not-a-real-type" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects an unknown topicId with 404", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.patch(`/api/instructor/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { topicId: "not-a-real-topic" },
    });
    expect(res.status()).toBe(404);
  });

  test("tags the document as a quiz reference", async ({ request }) => {
    const token = mintToken(await getTestInstructorId(), "instructor");
    const res = await request.patch(`/api/instructor/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { documentType: "quiz" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).documentType).toBe("quiz");
  });
});
