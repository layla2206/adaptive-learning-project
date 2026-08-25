"use client";

import { useMemo } from "react";
import { formatEyebrowDate, initials, greetingForHour } from "@/lib/utils";
import { instructorProfile, instructorStats, courses, stuckTopicsByCourse } from "@/lib/instructorData";
import Card from "@/components/Card";
import ArrowButton from "@/components/ArrowButton";
import ProgressRing from "@/components/ProgressRing";
import MasteryBar from "@/components/MasteryBar";
import StatsStrip from "@/components/StatsStrip";
import StuckTable from "@/components/instructor/StuckTable";
import { UploadIcon, UsersIcon } from "@/components/icons";
import styles from "./page.module.css";

export default function InstructorDashboardPage() {
  const now = useMemo(() => new Date(), []);

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">{formatEyebrowDate(now)}</p>
          <h1 className={styles.greeting}>
            {greetingForHour(now.getHours())}, {instructorProfile.name}
          </h1>
        </div>
        <div className={styles.avatar} title={instructorProfile.name}>
          {initials(instructorProfile.name)}
        </div>
      </header>

      <div className={styles.statsWrap}>
        <StatsStrip stats={instructorStats} />
      </div>

      <div className={styles.sectionHead}>
        <h2>Quick Actions</h2>
      </div>
      <div className={styles.actionsGrid}>
        <Card className={styles.actionCard}>
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
        <Card className={styles.actionCard}>
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
      <div className={styles.courseGrid}>
        {courses.map((course) => {
          const uploadPct = Math.round((course.lecturesUploaded / course.lecturesPlanned) * 100);
          return (
            <Card
              key={course.id}
              href={`/instructor/courses/${course.id}`}
              flagged={course.flagged}
              className={styles.courseCard}
            >
              <div className={styles.ringWrap}>
                <ProgressRing percent={uploadPct} size={52} strokeWidth={5} inverted={course.flagged} />
              </div>
              <h3 className={styles.courseName}>{course.name}</h3>
              <p className={styles.roster}>{course.rosterSize} students enrolled</p>
              <div className={styles.barWrap}>
                <MasteryBar percent={course.avgMastery} inverted={course.flagged} />
              </div>
              <p className={styles.meta}>
                {course.lecturesUploaded} / {course.lecturesPlanned} Lectures
              </p>
              <div className={styles.cardFoot}>
                <ArrowButton inverted={course.flagged} />
              </div>
            </Card>
          );
        })}
      </div>

      <div id="insights" className={styles.sectionHead}>
        <h2>Where Students Are Stuck</h2>
      </div>
      <StuckTable courses={courses} stuckTopicsByCourse={stuckTopicsByCourse} />
    </div>
  );
}
