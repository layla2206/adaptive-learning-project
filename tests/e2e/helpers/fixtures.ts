import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";
import { hashTestPassword } from "./auth";

loadEnv();

export const TEST_STUDENT_EMAIL = "e2e.test.student@example.edu";
export const TEST_STUDENT_PASSWORD = "E2eTestPass123!";
export const TEST_COURSE_ID = "cs301";
export const TEST_TOPIC_ID = "top-hash1"; // Hash Tables -- established topic with real embedded content
export const FOUNDATIONS_TOPIC_ID = "top-sort1"; // Sorting Algorithms -- the one topic with no predecessor, gated by the Foundations flow (backend/main.py's FOUNDATIONS_GATE_TOPIC_ID)

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
}

/** Resolves the E2E test student's students.student_id -- the UUID every
 *  domain table (student_profiles, retry_attempts, ...) is keyed on. Requires
 *  seed_test_fixtures.sql to have been run first (throws a clear message if
 *  not). NOT the same UUID as the session/JWT needs -- see getTestStudentUserId. */
export async function getTestStudentId(): Promise<string> {
  const { data } = await client().from("students").select("student_id").eq("email", TEST_STUDENT_EMAIL).maybeSingle();
  if (!data) {
    throw new Error(
      `E2E test student not found -- run backend/supabase/seed_test_fixtures.sql against the dev Supabase project first.`
    );
  }
  return data.student_id;
}

/** Resolves the E2E test student's users.user_id -- a DIFFERENT UUID from
 *  students.student_id above. This is the one seedSession's JWT needs
 *  (authJwt.ts's SessionPayload is {user_id, role}, and authMiddleware.ts
 *  resolves student_id from it via a users-table lookup) -- passing
 *  students.student_id here instead is a real bug (session resolves to no
 *  student, dashboard silently returns empty subjects). */
export async function getTestStudentUserId(): Promise<string> {
  const { data } = await client().from("users").select("user_id").eq("email", TEST_STUDENT_EMAIL).maybeSingle();
  if (!data) {
    throw new Error(
      `E2E test student's users row not found -- run backend/supabase/seed_test_fixtures.sql against the dev Supabase project first.`
    );
  }
  return data.user_id;
}

export async function getTestInstructorId(): Promise<string> {
  const { data } = await client().from("users").select("user_id").eq("email", "laila.khaled.04@gmail.com").maybeSingle();
  if (!data) throw new Error("Seeded instructor user not found -- run backend/supabase/seed_and_policies.sql first.");
  return data.user_id;
}

/** The same seeded instructor's instructors.instructor_id -- a DIFFERENT id
 *  from getTestInstructorId's users.user_id above. Needed wherever a route
 *  takes an instructorId that FKs to the instructors table directly (e.g.
 *  POST /api/admin/courses), not the session/JWT's user_id. */
export async function getTestInstructorRecordId(): Promise<string> {
  const { data } = await client().from("users").select("instructor_id").eq("email", "laila.khaled.04@gmail.com").maybeSingle();
  if (!data?.instructor_id) throw new Error("Seeded instructor's instructor_id not found -- run backend/supabase/seed_and_policies.sql first.");
  return data.instructor_id;
}

/** Removes one roster row -- cleanup for API-validation tests that insert a
 *  throwaway roster entry to exercise the create/duplicate paths. */
export async function deleteRosterEntry(studentId: string, courseId: string): Promise<void> {
  await client().from("roster").delete().eq("student_id", studentId).eq("course_id", courseId);
}

/** Clears any cached AI teaching suggestion for a topic, so
 *  instructor-insights.spec.ts always exercises a fresh MOCK_GEMINI call
 *  instead of silently taking the cache-hit path from earlier manual
 *  testing this session. */
export async function resetInstructorSuggestion(topicId: string): Promise<void> {
  await client().from("instructor_topic_suggestions").delete().eq("topic_id", topicId);
}

/** Makes the test student genuinely "stuck" on TEST_TOPIC_ID (2+ retries,
 *  not mastered, one tagged mistake) so instructor-insights.spec.ts doesn't
 *  depend on leftover state from someone else's manual testing -- it's
 *  self-contained and reruns cleanly. computeStuckCohort's definition
 *  (src/lib/instructorInsights.ts) is: >=2 retry_attempts rows and
 *  mastery_percent < 100. */
export async function seedStuckScenario(): Promise<void> {
  const studentId = await getTestStudentId();
  const db = client();
  await db.from("retry_attempts").insert([
    { retry_id: `e2erty${Date.now().toString(36).slice(-6)}a`, student_id: studentId, topic_id: TEST_TOPIC_ID, attempt_number: 1, format_used: "Worked Example" },
    { retry_id: `e2erty${Date.now().toString(36).slice(-6)}b`, student_id: studentId, topic_id: TEST_TOPIC_ID, attempt_number: 2, format_used: "Analogy" },
  ]);
  await db.from("student_answers").insert({
    answer_id: `e2eans${Date.now().toString(36).slice(-6)}`,
    student_id: studentId,
    topic_id: TEST_TOPIC_ID,
    question_text: "E2E fixture question",
    student_answer: "E2E fixture answer",
    score: 40,
    mistake_tag: "concept_confusion",
  });
  await db.from("student_profiles").upsert(
    { student_id: studentId, topic_id: TEST_TOPIC_ID, mastery_percent: 40 },
    { onConflict: "student_id,topic_id" }
  );
}

/** Resets the test student's progress on one topic to a clean slate --
 *  makes a spec idempotent instead of accumulating retry_attempts/
 *  mastery_checks/xp/foundations state across reruns. Scoped to this one
 *  student + topic only; never touches real data. Covers every session_type
 *  (mastery_loop, peer_buddy) sharing that (student, topic) pair, and the
 *  diagnostic_questions/diagnostic_results pair the Foundations Gate writes
 *  to (question_id has its own FK chain -- see the ordering note below). */
export async function resetStudentProgressForTopic(topicId: string): Promise<void> {
  const studentId = await getTestStudentId();
  const db = client();

  // session_messages.session_id FKs to sessions with no ON DELETE CASCADE --
  // deleting `sessions` first (as this used to) silently fails on the FK
  // violation (Supabase JS doesn't throw; you have to check .error, which
  // the old Promise.all version didn't), leaving orphaned messages behind.
  // /api/session/history then resurrects that whole old conversation on the
  // next run and restoreFromHistory() skips straight past the diagnose
  // stage -- delete messages before their parent sessions instead.
  const { data: sessionRows } = await db
    .from("sessions")
    .select("session_id")
    .eq("student_id", studentId)
    .eq("topic_id", topicId);
  const sessionIds = (sessionRows ?? []).map((s) => s.session_id);
  if (sessionIds.length > 0) {
    await db.from("session_messages").delete().in("session_id", sessionIds);
  }

  // diagnostic_results.question_id FKs to diagnostic_questions with no
  // cascade either -- same ordering requirement, one level deeper. Scoped by
  // student_id directly since diagnostic_results doesn't carry topic_id.
  await db.from("diagnostic_results").delete().eq("student_id", studentId);
  if (sessionIds.length > 0) {
    // Only the Foundations Gate's diagnostic_questions rows carry a
    // session_id (the older /diagnostic/generate path leaves it null and
    // isn't student-attributable at all) -- safe to scope this delete to
    // just this student's sessions on this topic.
    await db.from("diagnostic_questions").delete().in("session_id", sessionIds);
  }

  await Promise.all([
    db.from("student_profiles").delete().eq("student_id", studentId).eq("topic_id", topicId),
    db.from("retry_attempts").delete().eq("student_id", studentId).eq("topic_id", topicId),
    db.from("mastery_checks").delete().eq("student_id", studentId).eq("topic_id", topicId),
    db.from("sessions").delete().eq("student_id", studentId).eq("topic_id", topicId),
    db.from("xp_log").delete().eq("student_id", studentId).eq("topic_id", topicId),
    db.from("student_answers").delete().eq("student_id", studentId).eq("topic_id", topicId),
    db.from("generated_practice_content").delete().eq("student_id", studentId).eq("topic_id", topicId),
  ]);
}

/** Back-compat wrapper -- existing specs call this for TEST_TOPIC_ID. */
export async function resetTestStudentProgress(): Promise<void> {
  await resetStudentProgressForTopic(TEST_TOPIC_ID);
}

/** Tags one of the test topic's existing (currently untagged) documents as a
 *  practice_assignment or quiz reference -- /practice/generate 200s with
 *  {"error": ...} until at least one document on the topic carries this.
 *  Returns the tagged document's id so the caller can untag it in teardown;
 *  throws a clear message if the topic has no documents at all yet. */
export async function tagReferenceDocument(topicId: string, contentType: "practice_assignment" | "quiz"): Promise<string> {
  const db = client();
  const { data } = await db.from("documents").select("document_id").eq("topic_id", topicId).limit(1).maybeSingle();
  if (!data) throw new Error(`No document found on ${topicId} to tag as a ${contentType} reference.`);
  await db.from("documents").update({ document_type: contentType }).eq("document_id", data.document_id);
  return data.document_id;
}

export async function untagReferenceDocument(documentId: string): Promise<void> {
  await client().from("documents").update({ document_type: null }).eq("document_id", documentId);
}

export async function getTestAdminId(): Promise<string> {
  const { data } = await client().from("users").select("user_id").eq("email", "admin@tutor.local").maybeSingle();
  if (!data) throw new Error("Seeded admin user not found -- run backend/supabase/seed_admin.sql first.");
  return data.user_id;
}

/** Removes one instructor account (users row + its instructors row, if any)
 *  by email -- cleanup for admin-validation.spec.ts's account-creation
 *  tests. */
export async function deleteInstructorAndUser(email: string): Promise<void> {
  const db = client();
  const { data: userRow } = await db.from("users").select("user_id, instructor_id").eq("email", email).maybeSingle();
  if (userRow) {
    await db.from("users").delete().eq("user_id", userRow.user_id);
    if (userRow.instructor_id) await db.from("instructors").delete().eq("instructor_id", userRow.instructor_id);
  }
}

export async function deleteCourse(courseId: string): Promise<void> {
  await client().from("courses").delete().eq("course_id", courseId);
}

/** Seeds one unverified instructor users row (role='instructor',
 *  is_verified=false) with a known password -- for testing
 *  /api/auth/login's verification_required branch and /api/auth/verify-email
 *  without depending on the real signup flow. Uses an @example.edu address
 *  (RFC 2606 non-routable) so the real verification email these endpoints
 *  send never actually reaches anyone. */
export async function seedUnverifiedInstructor(password: string): Promise<{ email: string; userId: string }> {
  const email = `e2e.unverified.${Date.now().toString(36)}@example.edu`;
  const passwordHash = await hashTestPassword(password);
  const { data, error } = await client()
    .from("users")
    .insert({ email, password_hash: passwordHash, role: "instructor", is_verified: false })
    .select("user_id")
    .single();
  if (error || !data) throw new Error(`Failed to seed unverified instructor: ${error?.message}`);
  return { email, userId: data.user_id };
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const db = client();
  const { data: userRow } = await db.from("users").select("user_id").eq("email", email).maybeSingle();
  if (userRow) {
    await db.from("email_verifications").delete().eq("user_id", userRow.user_id);
  }
  await db.from("users").delete().eq("email", email);
}

export async function seedEmailVerificationToken(
  userId: string,
  token: string,
  opts?: { expired?: boolean }
): Promise<void> {
  const expiresAt = opts?.expired
    ? new Date(Date.now() - 60 * 1000).toISOString()
    : new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await client().from("email_verifications").insert({ user_id: userId, token, expires_at: expiresAt, used: false });
}

/** Seeds a real, unused otp_tokens row for an existing roster student --
 *  for testing /api/auth/student/verify-otp without going through
 *  /student/lookup first (which sends a real email on every call). */
export async function seedOtpToken(studentId: string, code: string): Promise<void> {
  const db = client();
  const { data: roster } = await db.from("roster").select("email").eq("student_id", studentId).limit(1).maybeSingle();
  if (!roster) throw new Error(`No roster row found for student_id ${studentId}`);
  await db.from("otp_tokens").insert({
    student_id: studentId,
    email: roster.email,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    used: false,
  });
}

export async function deleteOtpTokensForStudent(studentId: string): Promise<void> {
  await client().from("otp_tokens").delete().eq("student_id", studentId);
}

/** Seeds a throwaway roster entry (its own unique student_id + a
 *  non-routable email) for testing /api/auth/student/set-password's full
 *  signup path without touching the shared E2E test student, who already
 *  has an account and would just hit the 409 branch. */
export async function seedThrowawayRosterStudent(): Promise<{ studentId: string; email: string }> {
  const studentId = `E2SU${Date.now().toString(36).slice(-6)}`.toUpperCase().slice(0, 10);
  const email = `e2e.signup.${Date.now().toString(36)}@example.edu`;
  const { error } = await client()
    .from("roster")
    .insert({ student_id: studentId, name: "E2E Signup Test", email, course_id: TEST_COURSE_ID });
  if (error) throw new Error(`Failed to seed throwaway roster student: ${error.message}`);
  return { studentId, email };
}

/** Cleans up everything set-password's success path can create for one
 *  throwaway signup: enrollments, the new students/users rows, and the
 *  roster entry itself. */
export async function deleteSignupArtifacts(studentId: string, email: string): Promise<void> {
  const db = client();
  const { data: studentRow } = await db.from("students").select("student_id").eq("email", email).maybeSingle();
  if (studentRow) {
    await db.from("enrollments").delete().eq("student_id", studentRow.student_id);
    await db.from("users").delete().eq("student_id", studentRow.student_id);
    await db.from("students").delete().eq("student_id", studentRow.student_id);
  }
  await db.from("roster").delete().eq("student_id", studentId);
}
