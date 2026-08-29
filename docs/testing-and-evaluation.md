# Testing & Evaluation Report — Adaptive Tutor

**Date:** 2026-08-29
**Scope:** Automated test coverage across the backend (FastAPI), frontend (Next.js), and the RAG/generation pipeline, plus a real-data evaluation of AI output quality.

Setting up and running the suite yourself? See [`running-the-test-suite.md`](./running-the-test-suite.md) — this document covers what's tested and the results, not day-to-day commands.

## 1. Methodology

Six layers of automated testing exist, each answering a different question:

| Layer | Tool | Question it answers | Gemini cost |
|---|---|---|---|
| Backend unit / edge-case tests | `pytest` + FastAPI `TestClient` | Does the business logic handle malformed input, boundary conditions, and AI failures correctly? | None — Gemini is monkeypatched per test |
| Frontend unit tests | `Vitest` | Do the pure business-logic functions (mastery locking, stuck-cohort detection, trend bucketing, rate limiting) compute the right answer for known inputs? | None — no network/DB/AI involved |
| Frontend component tests | `Vitest` + `@testing-library/react` (jsdom) | Does one component's own state/rendering logic (optimistic updates, rollback on failure, redirect gating) behave correctly in isolation? | None |
| API-layer validation tests | `Playwright` (`request` fixture, no browser) | Do the Next.js API routes enforce auth, validate input, and return the right status codes? | None |
| End-to-end golden-path tests | `Playwright` (full browser — Chromium, Firefox, WebKit) | Does the full stack (browser → Next.js → FastAPI → Supabase) actually work for a real user, on every major browser engine? | None — a `MOCK_GEMINI=1` seam in `backend/main.py` intercepts every call site |
| AI-quality evaluation | Standalone harness (`backend/tests/eval/run_eval.py`) | Is the AI *itself* good — grounded, accurate, fast, safe to decline? | Real, deliberately small (~10 calls), run by hand only |

The first five layers never touch the real Gemini API — this project has exhausted its shared free-tier quota multiple times over its development, so correctness testing had to be decoupled from quota entirely. The AI-quality layer is the only one that spends real quota, and it is intentionally excluded from CI / any automatic run.

## 2. Test suite inventory

| Suite | Count | Status |
|---|---|---|
| `backend/tests/test_answer_generation.py` (pre-existing) | 4 | ✅ passing |
| `backend/tests/test_citations.py` (pre-existing) | 3 | ✅ passing |
| `backend/tests/test_mastery_check.py` | 9 | ✅ passing |
| `backend/tests/test_retry_generate.py` | 8 | ✅ passing |
| `backend/tests/test_instructor_insight.py` | 6 | ✅ passing |
| `backend/tests/test_diagnostic_generate.py` | 4 | ✅ passing |
| `backend/tests/test_foundations.py` | 2 | ✅ passing |
| `backend/tests/test_practice_generate.py` | 1 | ✅ passing |
| `backend/tests/test_peer_buddy.py` | 1 | ✅ passing |
| `backend/tests/test_upload.py` | 5 | ✅ passing |
| `backend/tests/test_query.py` | 4 | ✅ passing |
| `backend/tests/test_profile_update.py` | 3 | ✅ passing |
| `backend/tests/test_diagnostic_submit.py` | 5 | ✅ passing |
| `backend/tests/test_foundations_advance.py` | 3 | ✅ passing |
| `backend/tests/test_peer_buddy_history.py` | 2 | ✅ passing |
| `backend/tests/test_session_history.py` | 2 | ✅ passing |
| `backend/tests/test_chunking.py` | 6 | ✅ passing |
| `backend/tests/test_retrieval.py` | 7 | ✅ passing |
| `backend/tests/test_concurrency.py` | 1 | ✅ passing |
| `src/lib/rateLimit.test.ts` | 5 | ✅ passing |
| `src/lib/studentProgress.test.ts` | 15 | ✅ passing |
| `src/lib/instructorInsights.test.ts` | 13 | ✅ passing |
| `src/lib/sessionHistory.test.ts` | 22 | ✅ passing |
| `src/components/nav/AuthGate.test.tsx` | 4 | ✅ passing |
| `src/components/admin/InstructorTable.test.tsx` | 8 | ✅ passing |
| `tests/e2e/api-validation.spec.ts` | 9 | ✅ passing |
| `tests/e2e/auth-validation.spec.ts` | 20 | ✅ passing |
| `tests/e2e/admin-validation.spec.ts` | 16 | ✅ passing |
| `tests/e2e/upload-validation.spec.ts` | 11 | ✅ passing |
| `tests/e2e/instructor-and-practice-validation.spec.ts` | 8 | ✅ passing |
| `tests/e2e/student-proxy-validation.spec.ts` | 8 | ✅ passing |
| `tests/e2e/auth-regression.spec.ts` | 1 | ✅ passing |
| `tests/e2e/instructor-insights.spec.ts` | 1 | ✅ passing |
| `tests/e2e/student-core-loop.spec.ts` | 1 | ✅ passing |
| `tests/e2e/practice-and-quiz.spec.ts` | 3 | ✅ passing |
| `tests/e2e/peer-buddy.spec.ts` | 2 | ✅ passing |
| `tests/e2e/foundations-gate.spec.ts` | 1 | ✅ passing |
| **Total distinct test cases** | **224** | **224/224 passing** |
| AI-quality eval (real Gemini, run once) | 9 real calls across 7 questions + 1 consistency check | see §4 |

The 81 E2E test cases now each run against three browser engines (Chromium, Firefox, WebKit — see §3.4) — 243 total executions (241 passing, 2 deliberately skipped — see below). The 224 figure above counts distinct test *cases*, not executions, so it isn't inflated by that multiplication.

Two pre-existing unit tests (`test_answer_generation.py`, `test_citations.py`) were already committed to the repo (as far back as commit `81d749a`) but had never had a runner wired up — no `pytest` in `requirements.txt`, no `conftest.py`, no CI. This pass adds the pytest runner plus 29 new backend tests, a Vitest runner plus 55 frontend unit tests, 9 new API-layer validation tests, and 6 new E2E specs covering today's newest features (practice/quiz, peer-buddy, the Foundations Gate) — alongside the 3 E2E specs from the prior pass.

**A later pass closed the three gaps that were still open at that point: auth routes, admin-console routes, and the document-upload/embedding pipeline.** These had zero coverage before now because they sit outside the mastery-loop/instructor-insight feature work every earlier test targeted. Closing them added `backend/tests/test_upload.py` (5 tests) and three new Playwright API-layer specs — `auth-validation.spec.ts` (20 tests: login, the full student self-signup chain of lookup → verify-otp → set-password, and instructor email verification), `admin-validation.spec.ts` (16 tests: instructor and course account creation/status toggling, the platform dashboard), and `upload-validation.spec.ts` (11 tests: the `/api/upload` proxy's auth/ownership checks plus a real end-to-end upload, and document tagging) — bringing the suite from 111 to 163 tests.

Closing the upload gap required extending the `MOCK_GEMINI` seam one step further: `generate_embeddings()` calls a different Gemini SDK method (`embed_content`, returning `.embeddings[].values`) than every other endpoint (`generate_content`, returning `.text`), so the existing mock didn't cover it. `_MockGeminiModels` in `backend/main.py` now also stubs `embed_content` with a fixed-length fake vector per input string — real enough for `_normalize()`'s own math to run unchanged, at zero embedding quota cost. A matching `mock_embeddings` pytest fixture was added to `conftest.py` for the same reason `mock_gemini` exists separately from the env-var seam: pytest needs per-test monkeypatch control, not a process-wide flag.

The auth-route tests send two real emails per run through the app's actual Gmail SMTP path (login's `verification_required` branch, and the student-lookup endpoint) — nothing is mocked there, matching this project's general policy of only mocking the one resource (Gemini) that has an exhausted, shared quota. Every seeded test account uses an `@example.edu` address (RFC 2606, guaranteed non-routable), so nothing is ever actually delivered to a real inbox.

**A further pass closed the remaining coverage gaps: six FastAPI endpoints with no dedicated test at all (`/profile/update`, `/diagnostic/submit`, `/foundations/advance`, `/peer-buddy/history`, `/query`, `/session/history` — previously only exercised indirectly through E2E flows), five Next.js routes in the same position (`GET /api/instructor/courses/[courseId]`, `GET /api/instructor/dashboard`, `GET /api/practice/availability`, and the thin auth/validation layer in front of `/api/diagnostic/submit`, `/api/session/history`, `/api/query`), and `chunk_text()`'s own sliding-window/paragraph-aware splitting logic, which `test_upload.py` only ever checked the *end result* of.** This added 25 backend tests across 7 new files and 16 API-layer tests across 2 new specs — 163 → 204 tests.

Two real, previously-undetected bugs turned up while writing this pass, both fixed with a regression test:

- **`/query` swallowed a Gemini 429 into a generic `502`.** `generate_answer()` (`answer_generation.py`) catches every exception from its own Gemini call — including a 429 — and re-wraps it as a generic `AnswerGenerationError`, the same thing every other endpoint used to do before this session's earlier quota-handling fix (§6). `/query` was never included in that fix because it doesn't call Gemini directly — it goes through `generate_answer()`, one layer removed, which is exactly the layer that was hiding the real status code. Fixed by unwrapping the original `ClientError` from `AnswerGenerationError.__cause__` before deciding the response status.
- **`/diagnostic/submit` crashed with a `500` on a stale or unknown `question_id`**, instead of skipping just that one answer the way its own `if not q_res.data: continue` line clearly intends. The bug: `.single()` raises (`PGRST116`) on zero matching rows rather than returning empty data, so that guard line was dead code — any answer referencing a question that no longer exists (e.g. after a diagnostic was regenerated) took down the whole submission. Fixed by switching to `.maybe_single()`, the same `.data` guard already used everywhere else in this file for exactly this reason.

Writing the `/query` tests also surfaced an architectural fact worth documenting on its own: **`retrieval.py` constructs its own, separate `genai.Client` instance** — a different Python object from `main.py`'s `gemini_client` — even though both hit the same API key and model. `mock_embeddings` originally only patched `main.py`'s client (enough for `/upload`, the only other embedding call site at the time); it now patches both, since `/query` is the only caller of `retrieve_context()`, which is the only thing that ever touches `retrieval.py`'s client.

**A final pass closed the remaining flagged gaps: no React component tests, `retrieval.py`'s own retrieval logic never isolated from a real embedding space, no concurrency testing, and Chromium-only E2E coverage.** This added:

- **`backend/tests/test_retrieval.py`** (7 tests) — `retrieve_context()`'s own control flow in isolation (the query-blank guard, embedding/RPC failure handling, L2-normalization of the query vector, RPC parameter construction including `None` filters passing through instead of being dropped, and `map_chunk` post-processing), monkeypatching `retrieval.py`'s embed step and the `match_chunks` RPC directly rather than depending on a real populated embedding space.
- **`backend/tests/test_concurrency.py`** (1 test) — two threads racing `get_or_create_session()` for the same brand-new `(student, topic)` pair. **This found a real, previously-undetected bug**: the function is a check-then-insert (`find_active_session`, then insert if none found) with no locking, so two near-simultaneous calls — a double-click, a retried network request, two open tabs — could each see "no active session" and insert their own row, splitting one conversation across two sessions. Confirmed on the first run (2 session rows created, not 1). Fixed with a per-`(student_id, topic_id, session_type)` `threading.Lock` in `main.py`, the same in-process-only tradeoff `rateLimit.ts`'s limiter already makes for this single-process deployment. Verified fixed across 5 consecutive runs.
- **`@testing-library/react` + `jsdom`** (new devDependencies) and two component test files — `src/components/nav/AuthGate.test.tsx` (4 tests) and `src/components/admin/InstructorTable.test.tsx` (8 tests). These were chosen deliberately, not arbitrarily: `AuthGate` is the one component with a documented history of a real bug (`auth-regression.spec.ts` is a regression test for it), and `InstructorTable` owns real optimistic-update-with-rollback logic (status toggle, account creation) that a full E2E test can't cheaply probe for every failure branch. Vitest's default `forks` test-runner pool hung indefinitely in this environment (timed out waiting for a worker, no tests ever ran) — switched to `pool: "threads"` in `vitest.config.ts`, which works.
- **Firefox and WebKit added to `playwright.config.ts`** alongside the existing Chromium project — the same 81 E2E test cases now each run against all three engines (243 total executions), rather than being Chromium-only.

**Cross-browser coverage did exactly what it's for: the first full run surfaced two real, previously-invisible issues, plus flakes that turned out to be this session's own fault, not the app's.**

- **A real WebKit-only bug in the login form, found and fixed in the test helper, not the app.** `auth-regression.spec.ts` failed consistently on WebKit (reproduced 5/5 in isolation): `loginViaUI`'s `.fill("#email", ...)` would set the DOM value, and an immediate `toHaveValue` check would confirm it — but by the time the "Sign in" button was clicked, the email field had silently reverted to empty and the button stayed disabled for the full 30s timeout. Root cause: `.fill()` sets an input's value and dispatches synthetic events, which is normally enough for React to pick it up through its patched native value-setter — but on WebKit specifically, filling the login form's `autoFocus` email field this way left React's own `email` state at `""` even though the DOM value was briefly correct, so the *next* re-render (triggered by filling the password field right after) reconciled the controlled input back to React's stale state, erasing it. The password field, filled identically but without `autoFocus`, never showed this. Fixed by switching `loginViaUI` to `locator.pressSequentially()` — real per-character keystroke simulation, indistinguishable from actual typing, which React's `onChange` always picks up correctly. Verified fixed 5/5 consecutive runs.
- **A real test-isolation gap in `instructor-insights.spec.ts`, not a browser bug.** The same spec failed on Firefox with the page visibly showing "Please wait a few minutes before generating another insight for this topic." instead of the expected fresh suggestion — the real, in-memory, server-side rate limiter (`insight:${instructorId}:${topicId}`, 1 generation per 5 minutes, `src/lib/rateLimit.ts`) has no test-facing reset, and `resetInstructorSuggestion` only clears the *cached suggestion row*, not the limiter's own state. Running the same spec on a second browser project within the same suite invocation lands inside the first project's still-active 5-minute window and hits the limiter immediately. Confirmed by reproducing on a clean, single-project run moments after another run of the same spec. Since the rate-limiting logic itself is server-side and browser-agnostic (nothing about it could vary by engine), the fix is to run this one spec on Chromium only (`test.skip(browserName !== "chromium", ...)`), not to try to make a real 5-minute server-side window safe to hit twice in a row.
- **Two isolated single-test failures turned out to be this session's own resource leak, not app or test bugs.** A `firefox` `ECONNRESET` on the very first request of one run, and a `firefox` timeout waiting for an empty-state message on another, each passed cleanly and immediately on their own when re-run in isolation (3/3 and 3/3) — the kind of signature that points at environment contention rather than a reproducible defect. The actual cause: dozens of headless Chrome processes from this session's own earlier PDF-rendering work (`chrome.exe --headless --print-to-pdf` / `--screenshot`, used to build this report's own PDF) had never exited and were still running, accumulated over the session. Once those were cleaned up, a full fresh run came back **241 passed, 2 skipped, 0 failed** — completely clean, and close to 2 minutes faster than the contended runs. Documented here because it's a real lesson for running this suite locally: a long session of ad hoc headless-browser scripting can leave orphaned processes that degrade an unrelated E2E run's reliability without ever touching the app itself.

**`src/lib/sessionHistory.test.ts` required a small refactor first**, not just new tests: `restoreFromHistory` — the branching logic that decides which stage a resumed session lands on — lived inline and unexported inside the topic page's "use client" component, so it was extracted (along with its supporting types and `mapHistoryRowsToMessages`) into `src/lib/sessionHistory.ts`. This is exactly the kind of logic worth testing directly: it has already caused a real bug once this project (a resumed session skipping the diagnose stage entirely, from an earlier `session_messages` cleanup-ordering bug), and it has a genuine off-by-one hazard baked into its own design — `concept_index` can legitimately be `0` for the first Foundations concept, and the code has to check `!== undefined` rather than a truthy check to avoid treating that as "missing." One of the 22 new tests asserts exactly that boundary.

**Re-running the full E2E suite after this refactor surfaced one more real bug — in the E2E suite's own code, not the app.** `student-core-loop.spec.ts`'s diagnostic warm-up step polled "is the Warm-up tag still visible" in a loop to decide when to stop clicking answer options; that check and the diagnose-summary stage's own "Continue" button matched the exact same locator pattern (`h2 ~ div button`), so a stale visibility read on the last iteration could fire one extra click that landed on Continue — silently skipping straight to the explanation screen before the test's own assertions ran. Fixed by reading the total question count once from the tag text and clicking a fixed number of times instead of polling; confirmed with three consecutive clean runs plus a full-suite run after the fix.

**A methodology note worth keeping:** extending `MOCK_GEMINI` to cover these three new features surfaced two real bugs in the mock seam itself before any test ran — `/foundations/generate`'s and quiz-mode `/practice/generate`'s prompts both contain the literal string `"correct_answer"` (their own schema field), which collided with an earlier, more generic fixture matched first in the list. Left uncaught, this wouldn't have failed loudly: `/practice/generate` would have silently returned 2 diagnostic-shaped mock questions labeled as a 5-question quiz, passing the endpoint's own validation (which doesn't check item count) while never actually exercising the new code path a test was written to cover. Both were found and fixed by reading each new prompt's literal text directly rather than trusting a paraphrase, before writing any test against it — the general lesson being that a marker-substring mock scheme needs the same scrutiny on *ordering and collisions* as the prompts it's matching against, not just on whether a marker exists at all.

## 3. Defined test cases

### 3.1 Backend edge cases and failure scenarios (pytest)

| ID | Endpoint | Case | Expected result |
|---|---|---|---|
| MC-0 | `/mastery/check` | Gemini raises a 429 | `429`, not a generic `500` |
| MC-1 | `/mastery/check` | Neither `explanation` nor `solution` provided | `400` |
| MC-2 | `/mastery/check` | Gemini returns unparseable text | `502` |
| MC-3 | `/mastery/check` | Gemini returns `explain_score` as a string | `502` |
| MC-4 | `/mastery/check` | Gemini returns both scores `null` | `502` ("AI did not score") |
| MC-5 | `/mastery/check` | Topic has zero chunks | `422`, Gemini never called |
| MC-6 | `/mastery/check` | Score exactly `70` (the pass threshold) | `passed: true` |
| MC-7 | `/mastery/check` | Score `69` | `passed: false` |
| MC-8 | `/mastery/check` | `mistake_tag` outside the fixed enum | Silently normalized to `"none"`, `200` |
| RG-0 | `/retry/generate` | Gemini raises a 429 | `429`, not a generic `500` |
| RG-1 | `/retry/generate` | Topic has zero chunks | `422`, Gemini never called |
| RG-2 | `/retry/generate` | Gemini returns unparseable text | `502` |
| RG-3 | `/retry/generate` | Gemini omits `content` field | `502` ("invalid retry content") |
| RG-4 | `/retry/generate` | Student has a saved `preferred_explanation_format` | Attempt 1 uses that exact format |
| RG-5 | `/retry/generate` | No preference saved | Attempt 1 uses `"Worked Example"` (round-robin start) |
| RG-6 | `/retry/generate` | Diagram format, Gemini wraps output in ` ```mermaid ` fences | Fences stripped, `isDiagram: true` |
| RG-7 | `/retry/generate` | Diagram format, content is empty after fence-stripping | `502` |
| II-1 | `/instructor/insight/generate` | Empty `mistake_breakdown` | `422`, Gemini never called |
| II-2 | `/instructor/insight/generate` | First call for a topic | Calls Gemini once, caches the result |
| II-3 | `/instructor/insight/generate` | Second call, identical stats | **Cache hit — Gemini call count unchanged** |
| II-4 | `/instructor/insight/generate` | Second call, changed stats | Calls Gemini again, cache updated |
| II-5 | `/instructor/insight/generate` | Gemini raises a 429 | `429`, not a generic `500` |
| II-6 | `/instructor/insight/generate` | Gemini returns a blank suggestion | `502` |
| DG-0 | `/diagnostic/generate` | Gemini raises a 429 | `429`, not a generic `500` |
| DG-1 | `/diagnostic/generate` | Topic has zero chunks | `200` with `{"error": ...}` body — **see §6, known inconsistency** |
| DG-2 | `/diagnostic/generate` | Gemini returns non-JSON | `500` |
| DG-3 | `/diagnostic/generate` | Valid response | 2 questions returned, `correct_answer` never leaked to the client |
| FG-1 | `/foundations/generate` | Gemini raises a 429 | `429`, not a generic `500` |
| FG-2 | `/foundations/answer` | Gemini raises a 429 (wrong-answer explanation branch) | `429`, not a generic `500` |
| PG-1 | `/practice/generate` | Gemini raises a 429 | `429`, not a generic `500` |
| PB-1 | `/peer-buddy/message` | Gemini raises a 429 | `429`, not a generic `500` |
| UP-1 | `/upload` | Real text file, real content | `200`, `chunksInserted > 0`; chunk rows in Supabase carry the right `topic_id` and a real embedding |
| UP-2 | `/upload` | Unrecognized file extension | `200`, `chunksInserted == 0` — text-extraction failure is swallowed, not fatal |
| UP-3 | `/upload` | No `file` part in the request | `422` (FastAPI's own validation) |
| UP-4 | `DELETE /upload` | Delete an uploaded document | `200`; both the `documents` row and its `chunks` rows are gone (`ON DELETE CASCADE`, not a second explicit delete) |
| UP-5 | `DELETE /upload` | `documentId` that never existed | `200`, `{"success": true}` — documented existing no-op behavior, not a bug |
| PU-1 | `/profile/update` | Valid payload, new `(student_id, topic_id)` | `200`; real `student_profiles` row created |
| PU-2 | `/profile/update` | Same `(student_id, topic_id)` called twice | Upserts the same row, doesn't duplicate it |
| PU-3 | `/profile/update` | Unknown `topic_id` | `500` (FK violation) |
| DS-1 | `/diagnostic/submit` | Correct answer | `is_correct: true`, score `"1/1"` |
| DS-2 | `/diagnostic/submit` | Wrong answer | Score `"0/1"` |
| DS-3 | `/diagnostic/submit` | Answer differs only in case/whitespace (`"  a  "` vs `"A"`) | Still scored correct |
| DS-4 | `/diagnostic/submit` | Any submission | No `student_profiles` row is written — this warm-up must never overwrite real mastery |
| DS-5 | `/diagnostic/submit` | Unknown `question_id` | **`500` before the fix — now `200`, skipped, counted as not-correct — see the finding below** |
| FA-1 | `/foundations/advance` | Advance from the last concept (`concept_index: 3`) | `{"correct": true, "done": true}`; "Foundations Complete" message appended |
| FA-2 | `/foundations/advance` | Advance from a middle concept whose next question was pre-generated | `done: false`, next question returned; "Foundations Question" message appended |
| FA-3 | `/foundations/advance` | Advance to a concept whose question was never generated for this session | `500` |
| PBH-1 | `/peer-buddy/history` | No active peer-buddy session | `{"sessionId": null, "messages": []}` |
| PBH-2 | `/peer-buddy/history` | Active session with messages | Both student and ai messages returned in order, metadata merged onto each message |
| BSH-1 | `/session/history` | No active mastery-loop session | `{"sessionId": null, "messages": []}` |
| BSH-2 | `/session/history` | Active session with student + ai messages | Only `ai`-sender messages returned, metadata merged in |
| QY-1 | `/query` | Blank/whitespace-only question | No-context answer, no Gemini call at all |
| QY-2 | `/query` | Real question, zero-chunk topic | No-context answer (embeddings mocked, real `match_chunks` RPC scoped to an empty topic) |
| QY-3 | `/query` | A relevant chunk is retrieved | `200`; inline citation renumbered to `[1]`, real citation object returned, "Grounded Explanation" message persisted |
| QY-4 | `/query` | Gemini raises a 429 during answer generation | **`502` before the fix — now `429`, not swallowed by `AnswerGenerationError`** |
| CH-1 | `chunk_text()` | Empty string | `[]` |
| CH-2 | `chunk_text()` | Text shorter than `chunk_size` | One chunk, unmodified |
| CH-3 | `chunk_text()` | A paragraph break (`\n\n`) sits past the halfway point of the window | Splits there, not at a later single `\n` or space |
| CH-4 | `chunk_text()` | A single `\n` and a later space both sit past the halfway point | The newline wins even though the space is closer to the boundary |
| CH-5 | `chunk_text()` | Neither break falls past the halfway point | Hard cut at exactly `chunk_size`, no split-point adjustment |
| CH-6 | `chunk_text()` | Multi-chunk text | Each chunk after the first shares trailing/leading words with its neighbor, proving the overlap window is real |

### 3.2 Frontend unit tests (Vitest)

| ID | Function | Case | Expected result |
|---|---|---|---|
| RL-1..5 | `isRateLimited` | Allows up to `max` calls per window, blocks the next one, allows again once the window elapses, keys don't interfere, `max=0` blocks immediately | All assertions pass using fake timers (no real waiting) |
| SP-1..3 | `currentWeekDateKeysUTC` | Monday-anchored week for a known date, `weeksAgo=1` shifts back exactly 7 days, mid-week `now` still resolves to that week's Monday | Dates match hand-computed expected values from a known Monday anchor (2024-01-01) |
| SP-4..6 | `computeWeakAreaTrends` | Filters `null`/`"none"` tags, ranks by count with alphabetical tie-break, buckets this-week/last-week/older correctly; rows without `answered_at` still count toward the total | Exact entry arrays match, including tie-break order |
| SP-7..10 | `computeTopics` | No profile rows → only topic 1 unlocked; 100% mastery unlocks the next topic; partial progress does NOT unlock the next; each topic gets its own `weakAreaTrend`, not another's | State sequences and trend attachment match exactly |
| SP-11..12 | `computeWeekStates` | Active days marked done, today marked "today" only if not already active | Per-day state array matches |
| SP-13..16 | `computeStreakDays` | Consecutive active days ending today; falls back to yesterday if today has no activity yet; returns 0 if neither active; a gap breaks the streak | Streak counts match hand-computed expectations |
| II-U1..7 | `computeStuckCohort` | 2+ retries and not mastered = stuck; 1 retry ≠ stuck; 100% mastery excludes even with many retries; 99.5% does NOT exclude; retries for a different topic ignored; `avgRetries` correctly rounded and excludes non-stuck students; empty input → 0 | All boundary conditions match `src/lib/instructorInsights.ts`'s documented stuck-cohort definition |
| II-U8..13 | `computeMistakeBreakdown` | Only counts stuck students' answers; counts DISTINCT students per tag, not raw rows; ignores other topics; falls back to raw tag string with no known label; returns at most top 2 tags | Exact breakdown arrays match |
| SH-1..7 | `restoreFromHistory` | No history → `null`; last message not a resumable tag → `null`; `Grounded Explanation` → `explain-shown`; any of the 5 retry-format tags → `retry-shown`; `Hint` → `check-ask`; every row (not just the last) is converted to a message | Stage and message-count assertions match |
| SH-8..14 | `restoreFromHistory` (Foundations) | Full `Foundations Question` row populates `foundationsCurrent` exactly; **`concept_index: 0` is not treated as missing** (a real falsy-value hazard the code guards against with `!== undefined`); a missing required field leaves `foundationsCurrent` undefined while the stage still resumes; `Foundations Explanation` populates explanation text + pending index (including at index 0); `Foundations Complete` resumes cleanly with no stale current/explanation | Exact field-by-field matches |
| SH-15..22 | `mapHistoryRowsToMessages` | Plain text row passes through with citations; a diagram row with citations becomes a "Sources:" caption, not raw text; a diagram row with no citations has empty paragraphs, not an empty caption; a `Hint` row's tag becomes `"Hint {used}/{max}"`; every message gets a unique id | Exact message-object matches |

### 3.3 API-layer validation (Playwright, browser-less)

| ID | Route | Case | Expected result |
|---|---|---|---|
| API-1 | `POST /api/instructor/courses/[courseId]/roster` | Caller is a student, not an instructor | `403` |
| API-2 | `POST /api/instructor/courses/[courseId]/roster` | Course the instructor doesn't own | `404` |
| API-3 | `POST /api/instructor/courses/[courseId]/roster` | Required fields missing | `400` |
| API-4 | `POST /api/instructor/courses/[courseId]/roster` | Same `(studentId, courseId)` submitted twice | First `201`, second `409` |
| API-5 | `GET /api/student/settings` | Non-student token | `403` |
| API-6 | `GET /api/student/settings` | Real student | `200`, correct response shape |
| API-7 | `PATCH /api/student/settings` | Unrecognized explanation format | `400` |
| API-8 | `PATCH /api/student/settings` | `priorCourses` array over the 20-item cap | `400` |
| API-9 | `PATCH /api/student/settings` | Valid payload | `200`, change round-trips through a subsequent `GET` |

**Auth routes** (`tests/e2e/auth-validation.spec.ts`)

| ID | Route | Case | Expected result |
|---|---|---|---|
| AUTH-1 | `POST /api/auth/login` | Unknown email | `401`, generic message (doesn't reveal whether the email exists) |
| AUTH-2 | `POST /api/auth/login` | Known email, wrong password | `401`, same generic message |
| AUTH-3 | `POST /api/auth/login` | Missing password | `401` |
| AUTH-4 | `POST /api/auth/login` | Unverified instructor account | `200 {"status": "verification_required"}`, not a session token — a real verification email is sent |
| AUTH-5 | `POST /api/auth/student/lookup` | Missing `student_id` | `400` |
| AUTH-6 | `POST /api/auth/student/lookup` | Unknown `student_id` (not on any roster) | `404` |
| AUTH-7 | `POST /api/auth/student/lookup` | 4 lookups for the same `student_id` in quick succession | At least one `429` (limiter is 3 per 10 minutes) |
| AUTH-8 | `POST /api/auth/student/verify-otp` | Missing fields | `400` |
| AUTH-9 | `POST /api/auth/student/verify-otp` | Incorrect code | `400` |
| AUTH-10 | `POST /api/auth/student/verify-otp` | Real, unused code | `200`, returns a set-password token; code is marked used |
| AUTH-11 | `POST /api/auth/student/set-password` | Missing fields | `400` |
| AUTH-12 | `POST /api/auth/student/set-password` | Invalid/expired token | `401` |
| AUTH-13 | `POST /api/auth/student/set-password` | `password` ≠ `confirm_password` | `400` |
| AUTH-14 | `POST /api/auth/student/set-password` | Password under 8 characters | `400` |
| AUTH-15 | `POST /api/auth/student/set-password` | Student already has an account | `409` |
| AUTH-16 | `POST /api/auth/student/set-password` | Valid token + password for a new student | `200`; real `students`/`users`/`enrollments` rows created, session token returned |
| AUTH-17 | `POST /api/auth/verify-email` | Missing token | `400` |
| AUTH-18 | `POST /api/auth/verify-email` | Unknown token | `400` |
| AUTH-19 | `POST /api/auth/verify-email` | Expired token | `400` |
| AUTH-20 | `POST /api/auth/verify-email` | Valid, unused token | `200`, `users.is_verified` flips to `true`, session token returned |

**Admin-console routes** (`tests/e2e/admin-validation.spec.ts`)

| ID | Route | Case | Expected result |
|---|---|---|---|
| ADM-1 | `POST /api/admin/instructors` | Caller is not an admin | `403` |
| ADM-2 | `POST /api/admin/instructors` | Missing fields | `400` |
| ADM-3 | `POST /api/admin/instructors` | Email already has an account | `409` |
| ADM-4 | `POST /api/admin/instructors` | Valid payload | `200`, real `instructors` + `users` rows created |
| ADM-5 | `PATCH /api/admin/instructors/[id]` | Caller is not an admin | `403` |
| ADM-6 | `PATCH /api/admin/instructors/[id]` | Status outside `active`/`deactivated` | `400` |
| ADM-7 | `POST /api/admin/courses` | Caller is not an admin | `403` |
| ADM-8 | `POST /api/admin/courses` | Missing fields | `400` |
| ADM-9 | `POST /api/admin/courses` | `courseId` over 10 characters | `400` |
| ADM-10 | `POST /api/admin/courses` | Unknown `instructorId` | `400` |
| ADM-11 | `POST /api/admin/courses` | `courseId` already exists | `409` |
| ADM-12 | `POST /api/admin/courses` | Valid payload | `200`, real `courses` row created |
| ADM-13 | `PATCH /api/admin/courses/[id]` | Caller is not an admin | `403` |
| ADM-14 | `PATCH /api/admin/courses/[id]` | Status outside `active`/`deactivated` | `400` |
| ADM-15 | `GET /api/admin/dashboard` | Caller is not an admin | `403` |
| ADM-16 | `GET /api/admin/dashboard` | Admin caller | `200`, `platformStats` has exactly 4 entries, `instructorAccounts`/`platformCourses` are arrays |

**Document-upload routes** (`tests/e2e/upload-validation.spec.ts`)

| ID | Route | Case | Expected result |
|---|---|---|---|
| DOC-1 | `POST /api/upload` | Caller is not an instructor | `403` |
| DOC-2 | `POST /api/upload` | Missing `courseId` | `400` |
| DOC-3 | `POST /api/upload` | Course the instructor doesn't own | `404` |
| DOC-4 | `POST /api/upload` | Real file, owned course | `200`; forwarded to FastAPI, chunked and embedded for real (`MOCK_GEMINI=1`); the new file appears in `GET /api/instructor/courses/[courseId]/files` |
| DOC-5 | `DELETE /api/upload` | Caller is not an instructor | `403` |
| DOC-6 | `DELETE /api/upload` | Document the instructor doesn't own, or that doesn't exist | `404` |
| DOC-7 | `PATCH /api/instructor/documents/[id]` | Caller is not an instructor | `403` |
| DOC-8 | `PATCH /api/instructor/documents/[id]` | Document the instructor doesn't own | `404` |
| DOC-9 | `PATCH /api/instructor/documents/[id]` | `documentType` outside `practice_assignment`/`quiz` | `400` |
| DOC-10 | `PATCH /api/instructor/documents/[id]` | Unknown `topicId` | `404` |
| DOC-11 | `PATCH /api/instructor/documents/[id]` | Valid `documentType` | `200`; document and its existing chunks are re-tagged together |

**Instructor course/dashboard and practice-availability routes** (`tests/e2e/instructor-and-practice-validation.spec.ts`)

| ID | Route | Case | Expected result |
|---|---|---|---|
| INS-1 | `GET /api/instructor/courses/[courseId]` | Caller is not an instructor | `403` |
| INS-2 | `GET /api/instructor/courses/[courseId]` | Course the instructor doesn't own | `404` |
| INS-3 | `GET /api/instructor/courses/[courseId]` | Owned course | `200`; correct roster size and topic list |
| INS-4 | `GET /api/instructor/dashboard` | Caller is not an instructor | `403` |
| INS-5 | `GET /api/instructor/dashboard` | Real instructor | `200`; 4 stats, courses array includes the real course |
| INS-6 | `GET /api/practice/availability` | Caller is not a student | `403` |
| INS-7 | `GET /api/practice/availability` | Missing `topicId` | `400` |
| INS-8 | `GET /api/practice/availability` | Before vs. after tagging a document as a quiz reference | `quiz: false` before, `quiz: true` (and `practiceAssignment: false`) after |

**Student-facing proxy routes** (`tests/e2e/student-proxy-validation.spec.ts`) — the Next.js auth/validation layer in front of the backend endpoints tested in §3.1

| ID | Route | Case | Expected result |
|---|---|---|---|
| SPX-1 | `POST /api/diagnostic/submit` | Caller is not a student | `403` |
| SPX-2 | `POST /api/diagnostic/submit` | Missing/non-array `answers` | `400` |
| SPX-3 | `GET /api/session/history` | Caller is not a student | `403` |
| SPX-4 | `GET /api/session/history` | Missing `topicId` | `400` |
| SPX-5 | `POST /api/query` | Caller is not a student | `403` |
| SPX-6 | `POST /api/query` | Missing `courseId` | `400` |
| SPX-7 | `POST /api/query` | Missing `topicId` | `400` |
| SPX-8 | `POST /api/query` | Missing `question` | `400` |

### 3.4 End-to-end golden paths (Playwright, full browser)

| ID | Flow | Steps | Expected result |
|---|---|---|---|
| E2E-1 | Auth session survival | Log in → hard-reload a protected route | Session survives, no bounce to `/login` (regression test for a real bug fixed earlier this project) |
| E2E-2 | Instructor teaching insight | Generate an insight → reload → re-click immediately | Suggestion persists across reload; immediate re-click is rate-limited |
| E2E-3 | Full student mastery loop | Diagnose → explanation → fail mastery check twice (exhausting both hints) → retry intervention → pass the retry's solve check | Topic marked mastered; retry format and hint-exhaustion logic both exercised for real |
| E2E-4 | Practice assignment | From the mastered hub, open "Practice this lecture", reveal a model answer, regenerate the set | Real content renders; model answer hidden until revealed; regenerate produces a fresh set |
| E2E-5 | Quiz | From the mastered hub, open "Take a quiz", reveal the correct option | Options render as non-interactive (no scoring UI, matching the real page); correct option highlights on reveal |
| E2E-6 | Practice, no reference material tagged | Navigate directly to the practice page for a topic with no `practice_assignment`-tagged document | Correct "no instructor material available yet" empty state, not an error |
| E2E-7 | Peer-buddy turn cap | Send 6 student messages in one conversation | 6th reply sets `capped`; composer is replaced by the wrap-up card, matching `MAX_PEER_BUDDY_TURNS = 6` |
| E2E-8 | Peer-buddy history resume | Send one message, hard-reload the peer-buddy page | Prior messages restored from `/api/peer-buddy/history`; empty-state prompt does not reappear |
| E2E-9 | Foundations Gate | On the one topic with no predecessor: answer concept 1 wrong (explanation branch), concepts 2–4 correctly (direct-advance branch), clear the gate | Wrong answer shows an explanation screen before advancing; correct answers advance directly; gate completion rejoins the normal Explain flow via the same handler the ordinary diagnostic summary uses |

## 4. Measurable results — AI-quality evaluation

Run once against the real Gemini API and real `cs301` content (`backend/tests/eval/eval_results.json` is the full raw output; summary below).

**Dataset:** 5 on-topic questions across 5 real topics (Hash Tables, Stacks, Queues, Introduction to Trees, Sorting Algorithms), 2 deliberately off-topic questions, 1 mastery-check consistency probe (same answer scored twice).

| Metric | Result | What it measures |
|---|---|---|
| Retrieval hit rate | **100%** (5/5) | Every on-topic question retrieved at least one chunk above the similarity threshold (0.7) |
| Average top-1 similarity | **0.688** | Slightly *below* the 0.7 threshold on average across the top match — retrieval is finding relevant-but-imperfect matches |
| **Grounded-answer rate** | **40%** (2/5) | Of on-topic questions that DID retrieve relevant chunks, only 2 of 5 actually got a real answer — the model declined the other 3 despite having context (see finding below) |
| Citation validity rate | **100%** (4/4) | Every citation `[chunk-id]` in a real answer pointed to a chunk that was actually retrieved and above threshold — **zero hallucinated citations** in this sample |
| Fallback accuracy | **100%** (2/2) | Both off-topic questions were correctly declined, never fabricated an answer |
| Hard-fallback rate | **50%** (1/2) | Only 1 of the 2 off-topic questions was caught by the free, zero-Gemini-call similarity gate; the other ("What is the capital of France?") scored above threshold against Hash Tables content anyway and cost a real Gemini call before being declined |
| Generation latency (p50 / max) | **4.3s / 7.96s** | Wall-clock for `retrieve_context` + `generate_answer` combined |
| Mastery-check score consistency | **spread = 0** (100, 100 on 2 runs) | Same strong sample answer scored identically twice — encouraging, but N=2 is too small to generalize |

### Key finding: retrieval succeeding ≠ the model answering

The single most informative result from this run: **retrieval found relevant content for 100% of on-topic questions, but the model only produced a real answer for 40% of them.** For "What operations does a stack support, and what does LIFO mean?", "How is a queue different from a stack in ordering?", and "How does merge sort divide and combine data?" — all three retrieved 5 chunks above threshold, and all three got back *"I do not have enough context to answer."* in the model's own words (not the hard-coded fallback string — a real Gemini call that chose to decline).

This is a genuine tradeoff, not a bug: the system is conservative about not hallucinating (reflected in the 100% citation-validity and fallback-accuracy numbers above), but that same caution means a student can ask a reasonable, syllabus-relevant question and get an unhelpful decline on the first try, even with adequate retrieved context. Whether that's the right tradeoff for a tutoring product is a product decision, not a testing one — but it's now a measured, reproducible number instead of an assumption.

### Key finding: retrieval precision has a real gap

The "capital of France" question — asked against the Hash Tables topic — retrieved a chunk that scored above the 0.7 similarity threshold, despite being completely unrelated content. It was still correctly declined (the model itself recognized it couldn't answer), so no incorrect information reached a user, but it did cost a real Gemini call that the cheap embedding-similarity gate should ideally have caught for free. At small scale this is one data point, not a statistically strong claim — but it's a real, reproducible instance worth tracking if retrieval precision is tuned in the future.

### Real failure scenario observed during this run (unplanned)

While probing mastery-check scoring consistency, the harness hit the exact Gemini per-minute rate limit in production conditions:

```
429 RESOURCE_EXHAUSTED: Quota exceeded for metric:
generativelanguage.googleapis.com/generate_content_free_tier_requests,
limit: 5, model: gemini-3.6-flash. Please retry in 13s.
```

This is a *tighter, separate* limit from the daily 20-request cap documented in `backend/README.md` — 5 requests **per minute**, not just 20 per day. At the time, `check_mastery`'s exception handler converted this into a clean `500` rather than crashing the process, but didn't distinguish a 429 (transient, retry-worthy) from any other failure the way `/instructor/insight/generate` did (see II-5) — a student hitting this mid-lesson would have seen a generic "Unable to evaluate mastery" with no indication that waiting a few seconds would fix it.

**This has since been fixed.** `/mastery/check`, `/retry/generate`, `/diagnostic/generate`, `/practice/generate`, `/foundations/generate`, `/foundations/answer`, and `/peer-buddy/message` now all carry the same `except ClientError` handling `/instructor/insight/generate` already had, returning a clean `429` with a "try again later" message instead of a generic `500`. Confirmed with a dedicated regression test per endpoint (7 new tests, one per endpoint, each forcing a mocked `ClientError(429, ...)` and asserting the response is a `429` with "quota" in the message) plus a full E2E re-run to confirm nothing on the success path regressed.

## 5. Edge cases covered

- Mastery-pass threshold boundary (exactly 70, and one point below)
- Retry-format selection with and without a saved student preference
- Mermaid diagram output wrapped in markdown code fences (a real, previously-observed model behavior)
- Diagram content that becomes empty after fence-stripping
- Cache-hit vs. cache-miss for AI-generated instructor suggestions, keyed on exact stat equality
- Invalid/out-of-enum `mistake_tag` values from the model
- Zero-content topics across three different endpoints
- Off-topic questions that retrieval scores above threshold anyway
- Hard-reload / direct navigation to a protected route mid-session
- Duplicate roster entry for the same `(studentId, courseId)` pair
- `priorCourses` array at and just over its 20-item cap
- Locked-topic sequencing (mastery exactly 100 vs. 99.5 vs. 0, and how each propagates to the next topic's lock state)
- Streak calculation across a gap day, and "today not yet active" not zeroing out yesterday's streak
- An unrecognized file extension at upload time (text extraction fails silently; the document record and R2 object are still created)
- Deleting a document whose id never existed (no-op success, not a 404)
- An in-memory, per-process rate limiter being exercised across repeated calls in the same test run
- Expired vs. merely-unknown tokens for both the set-password and email-verification flows
- A student who already has an account attempting to sign up again with a freshly-minted set-password token
- Re-tagging a document's `topic_id` after upload, and whether its already-embedded chunks follow along
- A submitted diagnostic answer differing from the correct one only in case or surrounding whitespace
- Advancing the Foundations Gate from its very last concept vs. a middle one vs. one whose question was never generated
- A grounded `/query` answer's inline citation marker being renumbered from a real chunk id to the frontend's `[1]` convention
- Text-splitting boundary behavior: a paragraph break beating a later single newline, a single newline beating a later space, and the hard-cut fallback when neither exists past the halfway point of the window
- `retrieve_context()`'s own parameter construction: `None` topic/course filters passing through to the RPC as explicit `None`s (not omitted), and the query vector's L2 normalization (hand-verified: a `(3, 4, 0, ...)` embedding normalizes to `(0.6, 0.8, 0, ...)`)
- `InstructorTable`'s optimistic status toggle rendering the new state before the request resolves, then rolling back to the exact previous state and label on a failed request
- `AuthGate` treating a malformed (non-JSON) value in `localStorage` the same as no session at all, rather than crashing

## 6. Failure scenarios covered

- Gemini returning unparseable text (3 endpoints)
- Gemini returning a validly-shaped but semantically wrong response (wrong field type, missing field, blank string)
- Gemini quota exhaustion (429) — now handled identically across all 9 endpoints that call Gemini directly or indirectly on a student- or instructor-facing request path (clean `429`, not a generic `500`/`502`); the first 7 were found live during the evaluation run (§4) and closed the same session (MC-0, RG-0, DG-0, FG-1, FG-2, PG-1, PB-1); `/query`'s own version of the same gap (QY-4) was found and closed in the pass that added its test coverage
- A stale/unknown `question_id` in a `/diagnostic/submit` payload crashing the whole request instead of being skipped (DS-5) — `.single()` raising on zero rows instead of the `.maybe_single()` guard the code's own structure implied
- **Two concurrent calls to `get_or_create_session()` for the same brand-new `(student, topic)` pair creating two separate session rows instead of one** — a real check-then-insert race with no prior test coverage, caught by `test_concurrency.py` (2 session rows on the first run) and fixed with a per-`(student_id, topic_id, session_type)` lock
- **A WebKit-only login-form failure caused by `.fill()` not reliably updating React's controlled-input state on an `autoFocus` field** — the DOM value would revert to empty just before the "Sign in" click, found by the first cross-browser E2E run and fixed in the test helper (`pressSequentially`, real keystroke simulation) rather than the app
- Client-side rate limiting on the instructor-insight generation button
- Unauthenticated / wrong-role access to the roster, student-settings, admin, auth, upload, instructor, and student-proxy API routes
- **Known, un-fixed inconsistency:** `/diagnostic/generate` returns `200 {"error": ...}` instead of a proper 4xx status when a topic has no content — a caller checking only `res.ok` would treat this as success (`DG-1`, asserted explicitly so a future fix is a deliberate, visible test change)

## 7. Known limitations

- **No isolated test database.** The backend, API-validation, E2E, and AI-quality layers all run against the real shared dev Supabase project (matching this project's existing convention throughout development) — the frontend unit-test layer is the exception, since it tests pure functions with no DB or network involved. Test data is scoped to dedicated, clearly-named fixtures (`Pytest Student *`, `e2e.test.student@example.edu`) and torn down after each run, but a test run and a teammate's manual testing can still observe each other's transient state.
- **FastAPI has no authentication of its own.** Every endpoint in `backend/main.py` trusts `student_id`/`instructor_id`/`topic_id` directly from the request body with no signature or token verification — the only auth boundary is the Next.js proxy layer in front of it (which the new API-validation layer, §3.3, does now cover). Anyone who can reach port 8000 directly can impersonate any student or instructor. This is acceptable for a local dev setup behind the Next.js layer, but is a real gap to close before any deployment where the backend port could be reached directly.
- **Small AI-quality sample size.** The evaluation in §4 covers 7 questions and one 2-run consistency check — deliberately small given the shared 20-request/day (and 5-request/minute) Gemini quota. The numbers are real and reproducible, but not statistically powerful; a production-grade evaluation would need a larger, versioned question set and should budget quota (or a paid tier) specifically for it.
- **No CI.** All five suites are run locally, on demand. Nothing currently blocks a merge or deploy on test failure.
- **Two auth-route tests send real emails.** `AUTH-4` and `AUTH-7` (§3.3) go through the app's real Gmail SMTP path, unmocked — always to `@example.edu` addresses (RFC 2606, non-routable) so nothing is actually delivered, but this does mean those two tests fail if `GMAIL_USER`/`GMAIL_APP_PASSWORD` aren't configured or Gmail is unreachable.
- **Concurrency testing is narrow, not comprehensive.** One race (`get_or_create_session`, found and fixed — see §6) is now covered by `test_concurrency.py`. Nothing else in this suite tests concurrent access — mastery-check, retry-generate, and every other write path are still only exercised single-request, sequentially. The fix itself is also only correct within one process (an in-process `threading.Lock`, the same tradeoff `rateLimit.ts`'s limiter already accepts); it would not protect against a race across multiple uvicorn workers, which this project doesn't run.
- **The E2E and API-validation suites require manual environment setup** (both dev servers running, `MOCK_GEMINI=1` on the backend, `seed_test_fixtures.sql` already run) — there's no one-command bootstrap yet.
- **`retrieval.py`'s real ranking behavior against a populated embedding space still isn't deterministically tested.** `test_retrieval.py` covers `retrieve_context()`'s own control flow (guards, error handling, RPC parameter construction, normalization) in isolation; the actual similarity-threshold/ranking quality of a real, populated embedding space is still only measured by the AI-quality evaluation (§4), which is real but small (§4's own limitation below) and run by hand, not on every test run.
- **No accessibility testing.** E2E coverage is now cross-browser (Chromium, Firefox, WebKit — §3.4) but nothing here checks screen-reader semantics, keyboard navigation, or color contrast.
- **`instructor-insights.spec.ts` runs on Chromium only**, not all three browsers. It exercises a real, in-memory, server-side rate limiter (1 generation per instructor+topic per 5 minutes) with no test-facing reset — running it on a second browser project within the same suite invocation lands inside the first project's still-active window and fails on a false "already rate-limited" state, not a real per-browser difference (the rate-limiting logic is server-side and browser-agnostic). Documented in the "further pass" note above with the reproduction that confirmed this.

## 8. Reproducing these results

```bash
# Backend unit / edge-case tests (no quota cost)
cd backend && python -m pytest tests/ --ignore=tests/eval -v

# Frontend unit + component tests (no quota cost, no DB/network)
npm run test:unit

# API-layer validation + end-to-end golden-path tests (no quota cost)
# 1. Run backend/supabase/seed_test_fixtures.sql once against the dev Supabase project
# 2. Start FastAPI with MOCK_GEMINI=1, and the Next.js dev server, both running
# 3. One-time: npx playwright install firefox webkit (chromium is installed already)
npm run test:e2e   # runs every spec against Chromium, Firefox, and WebKit

# AI-quality evaluation (spends real, shared Gemini quota -- run deliberately, not on a schedule)
cd backend && python -m tests.eval.run_eval
```
