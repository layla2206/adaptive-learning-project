"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTutorStore } from "@/lib/store";
import { subjectProgress, masteredCount, formatEyebrowDate, initials, greetingForHour } from "@/lib/utils";
import Card from "@/components/Card";
import ArrowButton from "@/components/ArrowButton";
import ProgressRing from "@/components/ProgressRing";
import TagRow from "@/components/TagRow";
import StreakChip from "@/components/StreakChip";
import WeekDots from "@/components/WeekDots";
import { PlusIcon } from "@/components/icons";
import { userProfile } from "@/lib/data";
import styles from "./page.module.css";

export default function DashboardPage() {
  const { subjects, userName } = useTutorStore();

  const now = useMemo(() => new Date(), []);
  const featuredId = useMemo(() => {
    const inProgress = subjects.filter((s) => subjectProgress(s) < 100 && s.topics.length > 0);
    if (inProgress.length === 0) return subjects[0]?.id;
    return inProgress.reduce((best, s) => (subjectProgress(s) > subjectProgress(best) ? s : best)).id;
  }, [subjects]);

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">{formatEyebrowDate(now)}</p>
          <h1 className={styles.greeting}>
            {greetingForHour(now.getHours())}, {userName}
          </h1>
        </div>
        <div className={styles.avatar} title={userName}>
          {initials(userName)}
        </div>
      </header>

      <Link href="/score" className={styles.hero} aria-label="View your score: weekly calendar and trophy cabinet">
        <div className={styles.heroLeft}>
          <StreakChip days={userProfile.streakDays} />
          <WeekDots days={userProfile.week} />
        </div>
        <div className={styles.heroDivider} />
        <div className={styles.xpBlock}>
          <div className={styles.xpValue}>{userProfile.totalXp.toLocaleString()}</div>
          <div className={styles.xpLabel}>Total XP</div>
        </div>
      </Link>

      <div className={styles.sectionHead}>
        <h2>Your Subjects</h2>
      </div>

      <div className={styles.subjectGrid}>
        {subjects.map((subject) => {
          const progress = subjectProgress(subject);
          const mastered = masteredCount(subject);
          const featured = subject.id === featuredId;
          const tagList = subject.topics.slice(0, 3).map((t) => t.name);

          return (
            <Card
              key={subject.id}
              href={`/subject/${subject.id}`}
              featured={featured}
              className={styles.subjectCard}
            >
              <div className={styles.ringWrap}>
                <ProgressRing percent={progress} size={56} strokeWidth={5} inverted={featured} />
              </div>
              <h3 className={styles.subjectName}>{subject.name}</h3>
              <TagRow tags={tagList} inverted={featured} />
              <p className={styles.meta}>
                {mastered} / {subject.topics.length} Topics
              </p>
              <div className={styles.cardFoot}>
                <ArrowButton inverted={featured} />
              </div>
            </Card>
          );
        })}

        <Card dashed className={styles.addCard}>
          <span className={styles.addPlus}>
            <PlusIcon size={18} />
          </span>
          <span className={styles.addLabel}>Add a subject</span>
        </Card>
      </div>
    </div>
  );
}
