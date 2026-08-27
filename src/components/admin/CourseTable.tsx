"use client";

import { useState } from "react";
import type { AccountStatus, InstructorAccount, PlatformCourse } from "@/lib/adminData";
import { PlusIcon } from "@/components/icons";
import { getSession } from "@/lib/session";
import styles from "./AdminTable.module.css";

export default function CourseTable({
  courses,
  instructors,
}: {
  courses: PlatformCourse[];
  instructors: InstructorAccount[];
}) {
  const [allCourses, setAllCourses] = useState(courses);
  const [statusById, setStatusById] = useState<Record<string, AccountStatus>>(() =>
    Object.fromEntries(courses.map((c) => [c.id, c.status]))
  );
  // Resync local state when the fetched `courses` prop changes — done during
  // render (not a useEffect) per React's guidance for adjusting state from props.
  const [prevCourses, setPrevCourses] = useState(courses);
  if (courses !== prevCourses) {
    setPrevCourses(courses);
    setAllCourses(courses);
    setStatusById(Object.fromEntries(courses.map((c) => [c.id, c.status])));
  }

  const [formOpen, setFormOpen] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggle(id: string) {
    setStatusById((prev) => ({
      ...prev,
      [id]: prev[id] === "active" ? "deactivated" : "active",
    }));
  }

  function resetForm() {
    setCourseId("");
    setCourseName("");
    setInstructorId("");
    setError(null);
  }

  async function handleCreate() {
    if (!courseId.trim() || !courseName.trim() || !instructorId || submitting) return;
    setSubmitting(true);
    setError(null);

    const session = getSession();
    if (!session) {
      setError("Your session expired — sign in again.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          courseId: courseId.trim(),
          courseName: courseName.trim(),
          instructorId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }

      setAllCourses((prev) => [data, ...prev]);
      setStatusById((prev) => ({ ...prev, [data.id]: "active" }));
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
        <h3>All Courses</h3>
        <button
          type="button"
          className={styles.inviteButton}
          onClick={() => {
            if (formOpen) resetForm();
            setFormOpen((v) => !v);
          }}
        >
          <PlusIcon size={14} />
          {formOpen ? "Cancel" : "Add Course"}
        </button>
      </div>

      {formOpen && (
        <div className={styles.createForm}>
          <p className={styles.createHint}>
            Course code must be 10 characters or fewer (e.g. cs201) and unique across the platform.
          </p>
          <div className={styles.formRow}>
            <input
              className={styles.formInput}
              placeholder="Course code (e.g. cs201)"
              maxLength={10}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            />
            <input
              className={styles.formInput}
              placeholder="Course name"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <select
              className={styles.formInput}
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
            >
              <option value="">Select instructor…</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.inviteButton}
              onClick={handleCreate}
              disabled={!courseId.trim() || !courseName.trim() || !instructorId || submitting}
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
            <th>Course</th>
            <th>Instructor</th>
            <th>Students</th>
            <th>Status</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {allCourses.map((course) => {
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
