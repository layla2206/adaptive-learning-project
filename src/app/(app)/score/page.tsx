"use client";

import { useTutorStore } from "@/lib/store";
import { userProfile } from "@/lib/data";
import AppHeader from "@/components/AppHeader";
import WeeklyCalendar from "@/components/score/WeeklyCalendar";
import TrophyCabinet from "@/components/score/TrophyCabinet";
import styles from "./page.module.css";

export default function ScorePage() {
  const { subjects, userName } = useTutorStore();

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
        <WeeklyCalendar subjects={subjects} />
      </div>

      <div className={styles.section}>
        <p className="eyebrow">Achievements</p>
        <h2 className={styles.sectionTitle}>Trophy Cabinet</h2>
        <TrophyCabinet subjects={subjects} streakDays={userProfile.streakDays} />
      </div>
    </div>
  );
}
