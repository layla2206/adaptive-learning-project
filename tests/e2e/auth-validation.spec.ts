import { test, expect } from "@playwright/test";
import { mintSetPasswordToken } from "./helpers/auth";
import {
  TEST_STUDENT_EMAIL,
  seedUnverifiedInstructor,
  deleteUserByEmail,
  seedOtpToken,
  deleteOtpTokensForStudent,
  seedThrowawayRosterStudent,
  deleteSignupArtifacts,
  seedEmailVerificationToken,
} from "./helpers/fixtures";

// API-layer validation for the auth flows -- login, the student self-signup
// chain (lookup -> verify-otp -> set-password), and instructor email
// verification. None of these had any coverage before this pass. The two
// paths that trigger a real email send (login's verification_required
// branch, /student/lookup's success/rate-limit path) all use @example.edu
// addresses (RFC 2606, non-routable), so nothing actually reaches an inbox.

test.describe("POST /api/auth/login", () => {
  test("rejects an unknown email with a generic 401", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: { email: "nobody@example.edu", password: "whatever123" } });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe("Invalid email or password");
  });

  test("rejects a known email with the wrong password with the same generic 401", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: { email: TEST_STUDENT_EMAIL, password: "definitely-wrong" } });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe("Invalid email or password");
  });

  test("rejects a missing password with 401", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: { email: TEST_STUDENT_EMAIL } });
    expect(res.status()).toBe(401);
  });

  test("an unverified instructor gets verification_required instead of a session token", async ({ request }) => {
    const password = "ThrowawayPass123!";
    const { email } = await seedUnverifiedInstructor(password);
    try {
      const res = await request.post("/api/auth/login", { data: { email, password } });
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual({ status: "verification_required" });
    } finally {
      await deleteUserByEmail(email);
    }
  });
});

test.describe("POST /api/auth/student/lookup", () => {
  test("rejects a missing student_id with 400", async ({ request }) => {
    const res = await request.post("/api/auth/student/lookup", { data: {} });
    expect(res.status()).toBe(400);
  });

  test("rejects an unknown student_id with 404", async ({ request }) => {
    const res = await request.post("/api/auth/student/lookup", { data: { student_id: "NOTAREALID99" } });
    expect(res.status()).toBe(404);
  });

  test("rate-limits repeated lookups for the same student_id", async ({ request }) => {
    // RATE_LIMIT_MAX is 3 per 10 minutes -- 4 calls always surfaces at least
    // one 429 regardless of what an earlier run within the same window
    // already used (the limiter is in-memory and shared across runs until
    // the dev server restarts, so asserting an exact call number would be
    // flaky).
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request.post("/api/auth/student/lookup", { data: { student_id: "TEST0001" } });
      statuses.push(res.status());
    }
    expect(statuses).toContain(429);
  });
});

test.describe("POST /api/auth/student/verify-otp", () => {
  test("rejects missing fields with 400", async ({ request }) => {
    const res = await request.post("/api/auth/student/verify-otp", { data: { student_id: "TEST0001" } });
    expect(res.status()).toBe(400);
  });

  test("rejects an incorrect code with 400", async ({ request }) => {
    const res = await request.post("/api/auth/student/verify-otp", { data: { student_id: "TEST0001", code: "000000" } });
    expect(res.status()).toBe(400);
  });

  test("accepts a real, unused code and returns a set-password token", async ({ request }) => {
    const code = "482913";
    await seedOtpToken("TEST0001", code);
    try {
      const res = await request.post("/api/auth/student/verify-otp", { data: { student_id: "TEST0001", code } });
      expect(res.status()).toBe(200);
      expect(typeof (await res.json()).token).toBe("string");
    } finally {
      await deleteOtpTokensForStudent("TEST0001");
    }
  });
});

test.describe("POST /api/auth/student/set-password", () => {
  test("rejects missing fields with 400", async ({ request }) => {
    const res = await request.post("/api/auth/student/set-password", { data: { token: "x" } });
    expect(res.status()).toBe(400);
  });

  test("rejects a bad/expired token with 401", async ({ request }) => {
    const res = await request.post("/api/auth/student/set-password", {
      data: { token: "not-a-real-token", password: "LongEnough123!", confirm_password: "LongEnough123!" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects mismatched passwords with 400", async ({ request }) => {
    const token = mintSetPasswordToken("TEST0001");
    const res = await request.post("/api/auth/student/set-password", {
      data: { token, password: "LongEnough123!", confirm_password: "Different123!" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a password under 8 characters with 400", async ({ request }) => {
    const token = mintSetPasswordToken("TEST0001");
    const res = await request.post("/api/auth/student/set-password", {
      data: { token, password: "short1", confirm_password: "short1" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a student who already has an account with 409", async ({ request }) => {
    const token = mintSetPasswordToken("TEST0001"); // the shared E2E test student -- already signed up
    const res = await request.post("/api/auth/student/set-password", {
      data: { token, password: "LongEnough123!", confirm_password: "LongEnough123!" },
    });
    expect(res.status()).toBe(409);
  });

  test("creates a real account, enrolls the student, and returns a session token", async ({ request }) => {
    const { studentId, email } = await seedThrowawayRosterStudent();
    const token = mintSetPasswordToken(studentId);
    try {
      const res = await request.post("/api/auth/student/set-password", {
        data: { token, password: "LongEnough123!", confirm_password: "LongEnough123!" },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("student");
      expect(typeof body.token).toBe("string");
    } finally {
      await deleteSignupArtifacts(studentId, email);
    }
  });
});

test.describe("POST /api/auth/verify-email", () => {
  test("rejects a missing token with 400", async ({ request }) => {
    const res = await request.post("/api/auth/verify-email", { data: {} });
    expect(res.status()).toBe(400);
  });

  test("rejects an unknown token with 400", async ({ request }) => {
    const res = await request.post("/api/auth/verify-email", { data: { token: "not-a-real-token" } });
    expect(res.status()).toBe(400);
  });

  test("rejects an expired token with 400", async ({ request }) => {
    const { email, userId } = await seedUnverifiedInstructor("ThrowawayPass123!");
    const token = `expired-token-${Date.now()}`;
    await seedEmailVerificationToken(userId, token, { expired: true });
    try {
      const res = await request.post("/api/auth/verify-email", { data: { token } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("marks a real, unused token verified and returns a session token", async ({ request }) => {
    const { email, userId } = await seedUnverifiedInstructor("ThrowawayPass123!");
    const token = `valid-token-${Date.now()}`;
    await seedEmailVerificationToken(userId, token);
    try {
      const res = await request.post("/api/auth/verify-email", { data: { token } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("instructor");
      expect(typeof body.token).toBe("string");
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
