"use client";

import { useTutorStore } from "@/lib/store";
import AppHeader from "@/components/AppHeader";
import WeeklyCalendar from "@/components/score/WeeklyCalendar";
import MasteryOverview from "@/components/score/MasteryOverview";
import TrophyCabinet from "@/components/score/TrophyCabinet";
import SectionSkeleton from "@/components/score/SectionSkeleton";
import styles from "./page.module.css";

export default function ScorePage() {
  const { subjects, userName, streakDays, loading } = useTutorStore();

  return (
    <div className={`shell ${styles.page}`}>
      <AppHeader
        eyebrow="Progress"
        title="Score"
        userName={userName}
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <div className={styles.section}>
        <p className="eyebrow">Weekly Goal</p>
        <h2 className={styles.sectionTitle}>Lecture Calendar</h2>
        {loading ? <SectionSkeleton lines={2} /> : <WeeklyCalendar subjects={subjects} />}
      </div>

      <div className={styles.section}>
        <p className="eyebrow">Progress</p>
        <h2 className={styles.sectionTitle}>Mastery</h2>
        {loading ? <SectionSkeleton lines={4} /> : <MasteryOverview subjects={subjects} />}
      </div>

      <div className={styles.section}>
        <p className="eyebrow">Achievements</p>
        <h2 className={styles.sectionTitle}>Trophy Cabinet</h2>
        {loading ? <SectionSkeleton lines={3} /> : <TrophyCabinet subjects={subjects} streakDays={streakDays} />}
      </div>
    </div>
  );
}
