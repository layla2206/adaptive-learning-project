"use client";

import { useEffect, useState } from "react";
import type { AccountStatus, InstructorAccount } from "@/lib/adminData";
import { PlusIcon } from "@/components/icons";
import { getSession } from "@/lib/session";
import styles from "./AdminTable.module.css";

export default function InstructorTable({ instructors }: { instructors: InstructorAccount[] }) {
  const [accounts, setAccounts] = useState(instructors);
  const [statusById, setStatusById] = useState<Record<string, AccountStatus>>(() =>
    Object.fromEntries(instructors.map((i) => [i.id, i.status]))
  );

  useEffect(() => {
    setAccounts(instructors);
    setStatusById(Object.fromEntries(instructors.map((i) => [i.id, i.status])));
  }, [instructors]);

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggle(id: string) {
    setStatusById((prev) => ({
      ...prev,
      [id]: prev[id] === "active" ? "deactivated" : "active",
    }));
  }

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
  }

  async function handleCreate() {
    if (!name.trim() || !email.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(null);

    const session = getSession();
    if (!session) {
      setError("Your session expired — sign in again.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/instructors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }

      const newAccount: InstructorAccount = {
        id: data.user_id,
        name: name.trim(),
        email: email.trim(),
        coursesCount: 0,
        status: "active",
      };
      setAccounts((prev) => [newAccount, ...prev]);
      setStatusById((prev) => ({ ...prev, [newAccount.id]: "active" }));
      resetForm();
      setFormOpen(false);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3>Instructor Accounts</h3>
        <button
          type="button"
          className={styles.inviteButton}
          onClick={() => {
            if (formOpen) resetForm();
            setFormOpen((v) => !v);
          }}
        >
          <PlusIcon size={14} />
          {formOpen ? "Cancel" : "Add Instructor"}
        </button>
      </div>

      {formOpen && (
        <div className={styles.createForm}>
          <p className={styles.createHint}>
            The instructor signs in with this email and password on first use — no invite email is
            sent until they log in unverified, which triggers the verification email automatically.
          </p>
          <div className={styles.formRow}>
            <input
              className={styles.formInput}
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={styles.formInput}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className={styles.formInput}
              type="password"
              placeholder="Temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button
              type="button"
              className={styles.inviteButton}
              onClick={handleCreate}
              disabled={!name.trim() || !email.trim() || !password || submitting}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
          {error && <p className={styles.formError}>{error}</p>}
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Courses</th>
            <th>Status</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {accounts.map((instructor) => {
            const status = statusById[instructor.id];
            return (
              <tr key={instructor.id}>
                <td>{instructor.name}</td>
                <td className={styles.muted}>{instructor.email}</td>
                <td>{instructor.coursesCount}</td>
                <td>
                  <span className={`${styles.statusDot} ${styles[status]}`} />
                  {status === "active" ? "Active" : "Deactivated"}
                </td>
                <td className={styles.actionCell}>
                  <button type="button" className={styles.actionButton} onClick={() => toggle(instructor.id)}>
                    {status === "active" ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
