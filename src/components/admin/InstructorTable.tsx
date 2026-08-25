"use client";

import { useState } from "react";
import type { AccountStatus, InstructorAccount } from "@/lib/adminData";
import { PlusIcon } from "@/components/icons";
import styles from "./AdminTable.module.css";

export default function InstructorTable({ instructors }: { instructors: InstructorAccount[] }) {
  const [statusById, setStatusById] = useState<Record<string, AccountStatus>>(() =>
    Object.fromEntries(instructors.map((i) => [i.id, i.status]))
  );

  function toggle(id: string) {
    setStatusById((prev) => ({
      ...prev,
      [id]: prev[id] === "active" ? "deactivated" : "active",
    }));
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3>Instructor Accounts</h3>
        <button type="button" className={styles.inviteButton}>
          <PlusIcon size={14} />
          Invite Instructor
        </button>
      </div>

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
          {instructors.map((instructor) => {
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
