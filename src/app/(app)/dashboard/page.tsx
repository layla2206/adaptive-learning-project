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
import Skeleton from "@/components/Skeleton";
import CardSkeleton from "@/components/CardSkeleton";
import { PlusIcon } from "@/components/icons";
import styles from "./page.module.css";

export default function DashboardPage() {
  const { subjects, userName, streakDays, totalXp, week, loading } = useTutorStore();

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
          {loading ? (
            <Skeleton width={220} height={34} className={styles.greetingSkeleton} />
          ) : (
            <h1 className={styles.greeting}>
              {greetingForHour(now.getHours())}, {userName}
            </h1>
          )}
        </div>
        <div className={styles.avatar} title={userName}>
          {loading ? "" : initials(userName)}
        </div>
      </header>

      {loading ? (
        <div className={styles.hero}>
          <div className={styles.heroLeft}>
            <Skeleton width={110} height={28} radius={999} />
            <Skeleton width={180} height={16} />
          </div>
          <div className={styles.heroDivider} />
          <div className={styles.xpBlock}>
            <Skeleton width={70} height={32} className={styles.xpValueSkeleton} />
            <Skeleton width={60} height={11} />
          </div>
        </div>
      ) : (
        <Link href="/score" className={styles.hero} aria-label="View your score: weekly calendar and trophy cabinet">
          <div className={styles.heroLeft}>
            <StreakChip days={streakDays} />
            <WeekDots days={week} />
          </div>
          <div className={styles.heroDivider} />
          <div className={styles.xpBlock}>
            <div className={styles.xpValue}>{totalXp.toLocaleString()}</div>
            <div className={styles.xpLabel}>Total XP</div>
          </div>
        </Link>
      )}

      <div className={styles.sectionHead}>
        <h2>Your Subjects</h2>
      </div>

      {!loading && subjects.length === 0 && (
        <p className={styles.meta}>You&apos;re not enrolled in a subject yet — check with your instructor.</p>
      )}

      <div className={styles.subjectGrid}>
        {loading && (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        )}
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
