# Running the test suite

For what's tested and why, see [`testing-and-evaluation.md`](./testing-and-evaluation.md) — this doc is just the "get it running on your machine" instructions.

There are four layers. The first two need nothing but your existing `.env` — no servers, no seed data. The third needs both dev servers running plus one seed script, run once. The fourth spends real, shared Gemini quota and should be run rarely and on purpose.

## One-time setup

You already have `.env` set up per [`SETUP.md`](../SETUP.md) to run the app day to day (the tests read `.env` directly, the same as `main.py` does — **not** `.env.local`, despite what `SETUP.md` currently says). Beyond that:

```bash
# Frontend test deps (jsdom, @testing-library/react, vitest) come in with a normal install
npm install

# Backend test deps (pytest, httpx) come in with a normal install
cd backend && pip install -r requirements.txt && cd ..

# Playwright's own browser binaries -- separate from npm install, and not
# something `npm install` triggers on its own. Chromium may already be on
# your machine from earlier manual testing; firefox/webkit are new.
npx playwright install chromium firefox webkit
```

One SQL script needs to be run once against the shared dev Supabase project, if you haven't already: `backend/supabase/seed_test_fixtures.sql` (via the Supabase SQL editor, or `psql`). It creates one dedicated, clearly-named E2E test student (`e2e.test.student@example.edu`) — every spec uses only this account, never real seeded data.

## Backend tests (pytest)

No servers needed. Gemini is monkeypatched per-test, so this costs zero quota.

```bash
cd backend
python -m pytest tests/ --ignore=tests/eval -v
```

## Frontend unit + component tests (Vitest)

No servers needed, no network, no DB.

```bash
npm run test:unit
```

## API-layer validation + end-to-end tests (Playwright)

These need **both** dev servers running, in two separate terminals — and the backend specifically needs `MOCK_GEMINI=1` set, or the golden-path specs will hit the real, shared, quota-limited Gemini API.

**Terminal 1 — backend, with the mock seam on:**

```bash
cd backend
# macOS/Linux:
MOCK_GEMINI=1 python -m uvicorn main:app --port 8000
# Windows PowerShell:
$env:MOCK_GEMINI="1"; python -m uvicorn main:app --port 8000
```

**Terminal 2 — frontend, normal:**

```bash
npm run dev
```

**Terminal 3 — run the suite:**

```bash
npm run test:e2e
```

This runs every spec against Chromium, Firefox, and WebKit (243 test executions across 81 test cases). One spec (`instructor-insights.spec.ts`'s main test) deliberately runs on Chromium only — it exercises a real, in-memory, server-side rate limiter with no test-facing reset, so running it on a second browser project in the same invocation would collide with the first project's still-active 5-minute window. That's a `test.skip`, not a failure.

Two tests send real emails through the app's actual Gmail SMTP path (`GMAIL_USER`/`GMAIL_APP_PASSWORD` in `.env`) — always to `@example.edu` addresses (RFC 2606, guaranteed non-routable), so nothing is ever actually delivered, but those two tests will fail if Gmail creds aren't configured or Gmail is unreachable.

**When you're done, remember to unset `MOCK_GEMINI`** (just start `uvicorn` normally next time) — running the app day-to-day with it set means every AI response is the same canned mock text.

## AI-quality evaluation (real Gemini, real quota)

This is the one layer that costs real, shared Gemini quota (~10 calls). Not part of `npm run test:e2e` or CI-equivalent — run it by hand, deliberately, not as a habit:

```bash
cd backend
python -m tests.eval.run_eval
```

## Quick reference

| Command | What it runs | Needs servers? | Costs quota? |
|---|---|---|---|
| `cd backend && python -m pytest tests/ --ignore=tests/eval -v` | Backend edge cases | No | No |
| `npm run test:unit` | Frontend unit + component tests | No | No |
| `npm run test:e2e` | API validation + full E2E, 3 browsers | Yes, both, backend with `MOCK_GEMINI=1` | No |
| `cd backend && python -m tests.eval.run_eval` | AI-quality evaluation | No | **Yes — real Gemini calls** |
