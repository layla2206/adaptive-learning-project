import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AuthGate from "./AuthGate";
import { setSession, clearSession } from "@/lib/session";

// AuthGate is the one component in this codebase with a documented history
// of a real bug (tests/e2e/auth-regression.spec.ts is a regression test for
// it: a hard reload used to bounce a validly logged-in user to /login,
// because useSyncExternalStore's server snapshot is always null on the
// first client render). These tests cover its own redirect logic directly,
// something the E2E regression test only proves indirectly through a full
// browser reload.

const replace = vi.fn();
let mockPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  replace.mockClear();
  clearSession();
  mockPathname = "/dashboard";
});

describe("AuthGate", () => {
  it("redirects to /login when there is no session at all", async () => {
    render(
      <AuthGate>
        <div>secret</div>
      </AuthGate>
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("redirects to the session's own home when its role doesn't match the current path", async () => {
    mockPathname = "/admin/instructors"; // requires role "admin"
    setSession("tok", "student");
    render(
      <AuthGate>
        <div>secret</div>
      </AuthGate>
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard")); // homeForRole("student")
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("renders children with no redirect when the session role matches the required role", async () => {
    mockPathname = "/instructor/dashboard"; // requires role "instructor"
    setSession("tok", "instructor");
    render(
      <AuthGate>
        <div>secret content</div>
      </AuthGate>
    );
    await waitFor(() => expect(screen.getByText("secret content")).not.toBeNull());
    expect(replace).not.toHaveBeenCalled();
  });

  it("a malformed session in storage is treated as no session", async () => {
    localStorage.setItem("auth-session", "not valid json");
    render(
      <AuthGate>
        <div>secret</div>
      </AuthGate>
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
