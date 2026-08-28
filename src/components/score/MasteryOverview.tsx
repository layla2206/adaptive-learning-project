import type { MistakeTrendEntry, Subject } from "@/lib/types";
import MasteryBar from "@/components/MasteryBar";
import { MISTAKE_TAG_LABELS } from "@/lib/mistakeTags";
import styles from "./MasteryOverview.module.css";

function formatTrendEntry(e: MistakeTrendEntry): string {
  const label = MISTAKE_TAG_LABELS[e.tag] ?? e.tag;
  if (e.recentCount > 0 && e.previousCount > 0) {
    return `${label}: ${e.recentCount} this week (${e.previousCount} last week)`;
  }
  if (e.recentCount > 0 && e.previousCount === 0) {
    return `${label}: ${e.recentCount} this week (new)`;
  }
  if (e.recentCount === 0 && e.previousCount > 0) {
    return `${label}: none this week — improving (was ${e.previousCount} last week)`;
  }
  return `${label} ×${e.count}`;
}

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
              {subject.topics.some((t) => t.level) && (
                <div className={styles.topicList}>
                  {subject.topics
                    .filter((t) => t.level)
                    .map((t) => (
                      <div key={t.id} className={styles.topicEntry}>
                        <div className={styles.topicRow}>
                          <span className={styles.topicName}>{t.name}</span>
                          <span className={styles.levelBadge} data-level={t.level}>
                            {t.level}
                          </span>
                          {t.weakArea && (
                            <span className={styles.weakBadge}>
                              {MISTAKE_TAG_LABELS[t.weakArea] ?? t.weakArea}
                            </span>
                          )}
                        </div>
                        {t.weakAreaTrend.length > 0 && (
                          <p className={styles.trendCaption}>
                            Recurring: {t.weakAreaTrend.map(formatTrendEntry).join(" · ")}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}