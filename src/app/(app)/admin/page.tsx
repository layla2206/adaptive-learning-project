"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/session";
import type { InstructorAccount, PlatformCourse } from "@/lib/adminData";
import StatsStrip, { type Stat } from "@/components/StatsStrip";
import InstructorTable from "@/components/admin/InstructorTable";
import CourseTable from "@/components/admin/CourseTable";
import styles from "./page.module.css";

interface AdminDashboard {
  platformStats: Stat[];
  instructorAccounts: InstructorAccount[];
  platformCourses: PlatformCourse[];
}

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    fetch("/api/admin/dashboard", { headers: { Authorization: `Bearer ${session.token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then(setDashboard);
  }, []);

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>Platform Overview</h1>
        </div>
        <div className={styles.avatar} title="Admin">
          A
        </div>
      </header>

      <div id="stats" className={styles.statsWrap}>
        <StatsStrip stats={dashboard?.platformStats ?? []} />
      </div>

      <div id="instructors">
        <InstructorTable instructors={dashboard?.instructorAccounts ?? []} />
      </div>
      <div id="courses">
        <CourseTable courses={dashboard?.platformCourses ?? []} instructors={dashboard?.instructorAccounts ?? []} />
      </div>
    </div>
  );
}
