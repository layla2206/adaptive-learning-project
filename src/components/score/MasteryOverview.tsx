import type { Subject } from "@/lib/types";
import MasteryBar from "@/components/MasteryBar";
import styles from "./MasteryOverview.module.css";

export default function MasteryOverview({ subjects }: { subjects: Subject[] }) {
  const totalTopics = subjects.reduce((sum, s) => sum + s.topics.length, 0);
  const totalMastered = subjects.reduce(
    (sum, s) => sum + s.topics.filter((t) => t.state === "mastered").length,
    0
  );

  if (subjects.length === 0 || totalTopics === 0) {
    return (
      <div className={styles.card}>
        <p className={styles.empty}>No topics yet — mastery shows up here once you start a course.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <p className={styles.summaryLabel}>Across all courses</p>
        <p className={styles.summaryCount}>
          <span className={styles.summaryCountNum}>{totalMastered}</span> / {totalTopics} topics mastered
        </p>
      </div>

      <div className={styles.list}>
        {subjects.map((subject) => {
          const total = subject.topics.length;
          const mastered = subject.topics.filter((t) => t.state === "mastered").length;
          const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;
          return (
            <div key={subject.id} className={styles.row}>
              <MasteryBar percent={percent} label={subject.name} />
              <p className={styles.caption}>
                {mastered} of {total} topic{total === 1 ? "" : "s"} mastered
                {total > 0 && mastered < total ? ` · ${total - mastered} remaining` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}