"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/session";
import type { InstructorAccount, PlatformCourse } from "@/lib/adminData";
import StatsStrip, { StatsStripSkeleton, type Stat } from "@/components/StatsStrip";
import InstructorTable from "@/components/admin/InstructorTable";
import CourseTable from "@/components/admin/CourseTable";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import styles from "./page.module.css";

interface AdminDashboard {
  platformStats: Stat[];
  instructorAccounts: InstructorAccount[];
  platformCourses: PlatformCourse[];
}

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);

  function refetch() {
    const session = getSession();
    if (!session) return;
    fetch("/api/admin/dashboard", { headers: { Authorization: `Bearer ${session.token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then(setDashboard);
  }

  useEffect(refetch, []);

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
        {dashboard ? <StatsStrip stats={dashboard.platformStats} /> : <StatsStripSkeleton />}
      </div>

      {dashboard ? (
        <>
          <div id="instructors">
            <InstructorTable instructors={dashboard.instructorAccounts} onChanged={refetch} />
          </div>
          <div id="courses">
            <CourseTable
              courses={dashboard.platformCourses}
              instructors={dashboard.instructorAccounts}
              onChanged={refetch}
            />
          </div>
        </>
      ) : (
        <>
          <AdminTableSkeleton title="Instructor Accounts" columns={["Name", "Email", "Courses", "Status"]} />
          <AdminTableSkeleton title="All Courses" columns={["Course", "Instructor", "Students", "Status"]} />
        </>
      )}
    </div>
  );
}
