"use client";

import { useState } from "react";
import type { AccountStatus, PlatformCourse } from "@/lib/adminData";
import styles from "./AdminTable.module.css";

export default function CourseTable({ courses }: { courses: PlatformCourse[] }) {
  const [statusById, setStatusById] = useState<Record<string, AccountStatus>>(() =>
    Object.fromEntries(courses.map((c) => [c.id, c.status]))
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
        <h3>All Courses</h3>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Course</th>
            <th>Instructor</th>
            <th>Students</th>
            <th>Status</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => {
            const status = statusById[course.id];
            return (
              <tr key={course.id}>
                <td>{course.name}</td>
                <td className={styles.muted}>{course.instructorName}</td>
                <td>{course.studentCount}</td>
                <td>
                  <span className={`${styles.statusDot} ${styles[status]}`} />
                  {status === "active" ? "Live" : "Deactivated"}
                </td>
                <td className={styles.actionCell}>
                  <button type="button" className={styles.actionButton} onClick={() => toggle(course.id)}>
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
