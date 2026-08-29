import fs from "fs";
import path from "path";

let loaded = false;

/** Loads the repo's .env into process.env once. CRLF-safe -- a naive split("\n")
 *  leaves a trailing \r that `.` (which excludes line terminators in JS regex)
 *  can't consume before `$`, silently failing every KEY=value match on this
 *  Windows-checked-out repo. */
export function loadEnv(): void {
  if (loaded) return;
  const envPath = path.resolve(__dirname, "../../../.env");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  loaded = true;
}
