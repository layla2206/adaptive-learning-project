import { defineConfig, devices } from "@playwright/test";

// Both dev servers (Next.js on :3000, FastAPI on :8000) are started manually,
// the same way every manual test this project has run this session -- FastAPI
// isn't something Playwright's `webServer` option can manage. When running
// the backend for this suite, start it with MOCK_GEMINI=1 so the golden
// paths below never hit the real, shared, quota-limited Gemini API.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // Several specs share the one dedicated E2E test student's data (retry
  // attempts, sessions, the instructor-side rate limiter) -- fullyParallel:
  // false only serializes tests within one file, not across files, so
  // without this, different spec files still run concurrently by default
  // and can race on that shared fixture data.
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
