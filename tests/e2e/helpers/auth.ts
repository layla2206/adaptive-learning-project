import { expect, type Page } from "@playwright/test";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { loadEnv } from "./env";

loadEnv();

export type Role = "student" | "instructor" | "admin";

/** Signs a session token exactly the way src/lib/authJwt.ts's signSessionToken
 *  does -- the raw token string, for tests that only need an Authorization
 *  header (e.g. Playwright's browser-less `request` fixture, which has no
 *  localStorage to write into). seedSession (below) is the browser variant. */
export function mintToken(userId: string, role: Role): string {
  return jwt.sign({ user_id: userId, role }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
}

/** Mirrors src/lib/authJwt.ts's signSetPasswordToken exactly -- lets
 *  auth-validation.spec.ts test /api/auth/student/set-password directly
 *  without going through the real lookup -> email -> verify-otp chain
 *  (which would send a real email per attempt). */
export function mintSetPasswordToken(studentId: string): string {
  return jwt.sign({ student_id: studentId, purpose: "set_password" }, process.env.JWT_SECRET as string, { expiresIn: "10m" });
}

/** Mirrors src/lib/authPassword.ts's hashPassword -- for seeding a users row
 *  directly with a password the test already knows (e.g. an unverified
 *  instructor for login's verification_required branch), bypassing routes
 *  that would otherwise have to create the account first. */
export function hashTestPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Writes a minted token to localStorage under the same "auth-session" key
 *  src/lib/session.ts reads -- the fast-path every ad hoc script this
 *  project's manual testing has used all session. Requires one page load
 *  first so `localStorage` has an origin to attach to; navigate again
 *  afterward to actually pick up the session. */
export async function seedSession(page: Page, userId: string, role: Role): Promise<void> {
  const token = mintToken(userId, role);
  await page.goto("/");
  await page.evaluate(
    ({ token, role }) => localStorage.setItem("auth-session", JSON.stringify({ token, role })),
    { token, role }
  );
}

/** .fill() sets an input's DOM value directly and dispatches synthetic
 *  input/change events -- normally enough for React to pick up via its
 *  patched native value-setter, but reliably reproducible on WebKit against
 *  this login form's `autoFocus` email field (cross-browser E2E run, found
 *  this session): the value sticks immediately (a toHaveValue check right
 *  after .fill() passes), but React's own `email` state was never actually
 *  updated -- so the NEXT re-render (triggered by filling the password
 *  field right after) reconciles the controlled input back to React's
 *  still-empty state, silently erasing what Playwright just verified. The
 *  password field, filled the same way, never showed this -- autoFocus is
 *  the one difference between them. pressSequentially() simulates real
 *  keystrokes (keydown/input/keyup per character), indistinguishable from
 *  actual typing, which React's onChange always picks up correctly. */
async function typeReliably(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector);
  await field.click();
  await field.pressSequentially(value);
  await expect(field).toHaveValue(value);
}

/** Drives the real /login form -- for the one spec that should exercise
 *  actual login UI rather than the seedSession shortcut. */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await typeReliably(page, "#email", email);
  await typeReliably(page, "#password", password);
  await page.click('button:has-text("Sign in")');
}
