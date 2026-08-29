import fs from "fs";
import path from "path";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmounts every component rendered by the previous test -- without this,
// a component still mounted from test N keeps its effects (and any pending
// redirect/fetch calls) running into test N+1, since Vitest doesn't
// auto-cleanup the DOM between tests the way Jest's testing-library preset
// does. Harmless no-op for the pure-function tests that never call render().
afterEach(() => {
  cleanup();
});

// The functions under test are pure, but the modules that export them
// (studentProgress.ts, instructorInsights.ts) import ./supabaseClient at
// module scope, which throws immediately if NEXT_PUBLIC_SUPABASE_URL/
// ANON_KEY aren't set -- Vitest doesn't load .env the way Next.js does, so
// this has to happen before any test file's imports run. CRLF-safe parse:
// a naive split("\n") on this Windows-checked-out repo leaves a trailing
// \r that `.` (which excludes line terminators) can't consume before `$`,
// silently failing every KEY=value match.
const envPath = path.resolve(__dirname, ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
