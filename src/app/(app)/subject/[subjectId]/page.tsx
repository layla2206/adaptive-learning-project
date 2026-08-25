"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTutorStore } from "@/lib/store";
import { subjectProgress, masteredCount } from "@/lib/utils";
import { useMasteryCelebration } from "@/lib/milestoneAnnounce";
import AppHeader from "@/components/AppHeader";
import ProgressRing from "@/components/ProgressRing";
import MilestoneScene from "@/components/milestones/MilestoneScene";
import CompletionBadge from "@/components/milestones/CompletionBadge";
import styles from "./page.module.css";

export default function SubjectPage() {
  const params = useParams<{ subjectId: string }>();
  const { subjects, userName } = useTutorStore();
  const subject = subjects.find((s) => s.id === params.subjectId);

  const { celebrateIndex, justCompletedSubject } = useMasteryCelebration(subject);

  if (!subject) {
    return (
      <div className={`shell ${styles.page}`}>
        <div className={styles.notFound}>
          <p>Subject not found.</p>
          <Link href="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const progress = subjectProgress(subject);
  const mastered = masteredCount(subject);
  const unlocked = mastered === subject.topics.length;

  return (
    <div className={`shell ${styles.page}`}>
      <AppHeader
        eyebrow="Subject"
        title={subject.name}
        userName={userName}
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <div className={styles.summaryCard}>
        <div className={styles.summaryText}>
          <h2>{subject.name}</h2>
          <p>{subject.summary}</p>
          <p className={styles.summaryStat}>
            {mastered} / {subject.topics.length} Topics Mastered
          </p>
        </div>
        <ProgressRing percent={progress} size={92} strokeWidth={7} />
      </div>

      <div className={styles.journeySection}>
        <div className={styles.journeyHeader}>
          <h2>Your Path</h2>
          <CompletionBadge
            subjectName={subject.name}
            totalLectures={subject.topics.length}
            unlocked={unlocked}
            compact
            justUnlocked={justCompletedSubject}
          />
        </div>

        <MilestoneScene
          subject={subject}
          celebrateIndex={celebrateIndex}
          justCompletedSubject={justCompletedSubject}
        />
      </div>
    </div>
  );
}
