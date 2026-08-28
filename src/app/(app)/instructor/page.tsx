"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { formatEyebrowDate, initials, greetingForHour } from "@/lib/utils";
import { getSession } from "@/lib/session";
import type { Course, StuckTopic } from "@/lib/instructorData";
import Card from "@/components/Card";
import ArrowButton from "@/components/ArrowButton";
import ProgressRing from "@/components/ProgressRing";
import MasteryBar from "@/components/MasteryBar";
import StatsStrip, { StatsStripSkeleton, type Stat } from "@/components/StatsStrip";
import StuckTable from "@/components/instructor/StuckTable";
import CardSkeleton from "@/components/CardSkeleton";
import Skeleton from "@/components/Skeleton";
import { UploadIcon, UsersIcon, CheckIcon } from "@/components/icons";
import styles from "./page.module.css";

interface InstructorDashboard {
  instructorName: string;
  stats: Stat[];
  courses: Course[];
  stuckTopicsByCourse: Record<string, StuckTopic[]>;
}

export default function InstructorDashboardPage() {
  const now = useMemo(() => new Date(), []);
  const [dashboard, setDashboard] = useState<InstructorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const TOAST_MS = 4000;

  useEffect(() => {
    async function load() {
      const session = getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/instructor/dashboard", { headers: { Authorization: `Bearer ${session.token}` } });
      setDashboard(res.ok ? await res.json() : null);
      setLoading(false);
    }
    queueMicrotask(load);
  }, []);

  const instructorName = dashboard?.instructorName ?? "";
  const stats = dashboard?.stats ?? [];
  const courses = dashboard?.courses ?? [];
  const stuckTopicsByCourse = dashboard?.stuckTopicsByCourse ?? {};

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">{formatEyebrowDate(now)}</p>
          {loading ? (
            <Skeleton width={220} height={34} className={styles.greetingSkeleton} />
          ) : (
            <h1 className={styles.greeting}>
              {greetingForHour(now.getHours())}, {instructorName}
            </h1>
          )}
        </div>
        <div className={styles.avatar} title={instructorName}>
          {loading ? "" : initials(instructorName || "?")}
        </div>
      </header>

      <div className={styles.statsWrap}>
        {loading ? <StatsStripSkeleton /> : <StatsStrip stats={stats} />}
      </div>

      <div className={styles.sectionHead}>
        <h2>Quick Actions</h2>
      </div>
      <div className={styles.actionsGrid}>
        <Card
          href={courses.length === 1 ? `/instructor/courses/${courses[0].id}` : "#courses"}
          className={styles.actionCard}
        >
          <span className={styles.actionIcon}>
            <UploadIcon size={20} />
          </span>
          <div>
            <h3>Upload lecture content</h3>
            <p>Add slides, video, or notes to an existing course.</p>
          </div>
          <div className={styles.actionFoot}>
            <ArrowButton />
          </div>
        </Card>
        <Card
          onClick={() => showToast("Add Students interface coming soon!")}
          className={styles.actionCard}
        >
          <span className={styles.actionIcon}>
            <UsersIcon size={20} />
          </span>
          <div>
            <h3>Add students to a course</h3>
            <p>Enroll students individually or by roster upload.</p>
          </div>
          <div className={styles.actionFoot}>
            <ArrowButton />
          </div>
        </Card>
      </div>

      <div id="courses" className={styles.sectionHead}>
        <h2>Your Courses</h2>
      </div>

      {!loading && courses.length === 0 && <p className={styles.meta}>No courses yet.</p>}

      <div className={styles.courseGrid}>
        {loading && (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        )}
        {courses.map((course) => (
          <Card key={course.id} href={`/instructor/courses/${course.id}`} flagged={course.flagged} className={styles.courseCard}>
            <div className={styles.ringWrap}>
              <ProgressRing percent={course.avgMastery} size={52} strokeWidth={5} inverted={course.flagged} />
            </div>
            <h3 className={styles.courseName}>{course.name}</h3>
            <p className={styles.roster}>{course.rosterSize} students enrolled</p>
            <div className={styles.barWrap}>
              <MasteryBar percent={course.avgMastery} inverted={course.flagged} />
            </div>
            <p className={styles.meta}>{course.lecturesUploaded} Lectures Uploaded</p>
            <div className={styles.cardFoot}>
              <ArrowButton inverted={course.flagged} />
            </div>
          </Card>
        ))}
      </div>

      <div id="insights" className={styles.sectionHead}>
        <h2>Where Students Are Stuck</h2>
      </div>
      {courses.length > 0 && <StuckTable courses={courses} stuckTopicsByCourse={stuckTopicsByCourse} />}

      {toast && (
        <div className={styles.toast}>
          <CheckIcon size={13} />
          {toast}
        </div>
      )}
    </div>
  );
}
