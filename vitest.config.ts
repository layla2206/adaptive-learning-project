import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*": ["./src/*"] -- the lib files under
      // test import each other via this alias, same as the app does.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // jsdom is only strictly needed by the .test.tsx component tests, but
    // the pure-logic .test.ts files run fast enough that a single shared
    // environment isn't worth the per-file environmentMatchGlobs overhead.
    environment: "jsdom",
    // Vitest's default "forks" pool hangs indefinitely on this machine
    // (times out waiting for the worker to respond, no tests ever run) --
    // "threads" starts and runs fine. Not investigated further since a
    // working pool was all that was needed here.
    pool: "threads",
  },
});
