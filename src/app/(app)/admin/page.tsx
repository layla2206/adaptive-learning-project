"use client";

import { platformStats, instructorAccounts, platformCourses } from "@/lib/adminData";
import StatsStrip from "@/components/StatsStrip";
import InstructorTable from "@/components/admin/InstructorTable";
import CourseTable from "@/components/admin/CourseTable";
import styles from "./page.module.css";

export default function AdminPage() {
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
        <StatsStrip stats={platformStats} />
      </div>

      <div id="instructors">
        <InstructorTable instructors={instructorAccounts} />
      </div>
      <div id="courses">
        <CourseTable courses={platformCourses} />
      </div>
    </div>
  );
}
