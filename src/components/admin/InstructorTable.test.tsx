import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import InstructorTable from "./InstructorTable";
import { ToastProvider } from "@/components/Toast";
import { setSession, clearSession } from "@/lib/session";
import type { InstructorAccount } from "@/lib/adminData";

// This component's own optimistic-update and error-rollback logic (status
// toggle, create-account form) had no direct coverage before this pass --
// only ever exercised indirectly through a manual/agent-driven browser
// session. Real bug class this guards against: an optimistic UI update that
// never rolls back on a failed request, silently lying to the admin about
// what actually happened server-side.

const ACCOUNTS: InstructorAccount[] = [
  { id: "instr-1", name: "Layla Khaled", email: "layla@example.edu", coursesCount: 2, status: "active" },
];

function renderTable(accounts: InstructorAccount[] = ACCOUNTS) {
  return render(
    <ToastProvider>
      <InstructorTable instructors={accounts} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearSession();
});

describe("InstructorTable -- Add Instructor form", () => {
  it("toggles the create form open and closed", () => {
    renderTable();
    expect(screen.queryByPlaceholderText("Full name")).toBeNull();

    fireEvent.click(screen.getByText("Add Instructor"));
    expect(screen.getByPlaceholderText("Full name")).not.toBeNull();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText("Full name")).toBeNull();
  });

  it("keeps Create disabled until name, email, and password are all filled", () => {
    renderTable();
    fireEvent.click(screen.getByText("Add Instructor"));
    const createButton = screen.getByText("Create") as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "New Person" } });
    expect(createButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new@example.edu" } });
    fireEvent.change(screen.getByPlaceholderText("Temporary password"), { target: { value: "Passw0rd!" } });
    expect(createButton.disabled).toBe(false);
  });

  it("a session-expired create shows an inline error and never calls fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderTable();
    fireEvent.click(screen.getByText("Add Instructor"));
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "New Person" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new@example.edu" } });
    fireEvent.change(screen.getByPlaceholderText("Temporary password"), { target: { value: "Passw0rd!" } });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => expect(screen.getByText(/session expired/i)).not.toBeNull());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a successful create prepends the new account and resets the form", async () => {
    setSession("tok", "admin");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user_id: "instr-2", instructor_id: "instr-2" }),
      })
    );
    renderTable();
    fireEvent.click(screen.getByText("Add Instructor"));
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "New Person" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new@example.edu" } });
    fireEvent.change(screen.getByPlaceholderText("Temporary password"), { target: { value: "Passw0rd!" } });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => expect(screen.getByText("New Person")).not.toBeNull());
    // form closed and reset
    expect(screen.queryByPlaceholderText("Full name")).toBeNull();
    // still shows the original account too -- prepended, not replaced
    expect(screen.getByText("Layla Khaled")).not.toBeNull();
  });

  it("a failed create (non-ok response) shows the server's error and keeps the form open with no new row", async () => {
    setSession("tok", "admin");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "An account already exists for this email." }),
      })
    );
    renderTable();
    fireEvent.click(screen.getByText("Add Instructor"));
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Dup Person" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "dup@example.edu" } });
    fireEvent.change(screen.getByPlaceholderText("Temporary password"), { target: { value: "Passw0rd!" } });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => expect(screen.getByText("An account already exists for this email.")).not.toBeNull());
    expect(screen.getByPlaceholderText("Full name")).not.toBeNull(); // form stays open
    expect(screen.queryByText("Dup Person")).toBeNull(); // no optimistic row added
  });
});

describe("InstructorTable -- status toggle", () => {
  it("optimistically flips status immediately, before the request resolves", async () => {
    setSession("tok", "admin");
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)))
    );
    renderTable();

    const row = screen.getByText("Layla Khaled").closest("tr")!;
    fireEvent.click(within(row).getByText("Deactivate"));

    // flips immediately, before the (still-pending) fetch resolves
    expect(within(row).getByText("Deactivated")).not.toBeNull();

    resolveFetch({ ok: true });
    await waitFor(() => expect(within(row).getByText("Reactivate")).not.toBeNull());
  });

  it("rolls back to the previous status when the request fails", async () => {
    setSession("tok", "admin");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    renderTable();

    const row = screen.getByText("Layla Khaled").closest("tr")!;
    fireEvent.click(within(row).getByText("Deactivate"));
    expect(within(row).getByText("Deactivated")).not.toBeNull();

    await waitFor(() => expect(within(row).getByText("Active")).not.toBeNull()); // rolled back
    expect(within(row).getByText("Deactivate")).not.toBeNull(); // button label rolled back too
  });

  it("a session-expired toggle rolls back immediately and never calls fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderTable();

    const row = screen.getByText("Layla Khaled").closest("tr")!;
    fireEvent.click(within(row).getByText("Deactivate"));

    await waitFor(() => expect(within(row).getByText("Active")).not.toBeNull());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
