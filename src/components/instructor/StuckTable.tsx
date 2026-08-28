"use client";

import { Fragment, useState } from "react";
import type { Course, StuckTopic } from "@/lib/instructorData";
import { ArrowIcon } from "@/components/icons";
import { getSession } from "@/lib/session";
import TagRow from "@/components/TagRow";
import styles from "./StuckTable.module.css";

export default function StuckTable({
  courses,
  stuckTopicsByCourse,
  onInsightGenerated,
}: {
  courses: Course[];
  stuckTopicsByCourse: Record<string, StuckTopic[]>;
  onInsightGenerated: (topicId: string, suggestion: { text: string; generatedAt: string }) => void;
}) {
  const [activeCourseId, setActiveCourseId] = useState(courses[0]?.id);
  const [loadingTopicId, setLoadingTopicId] = useState<string | null>(null);
  const [errorByTopicId, setErrorByTopicId] = useState<Record<string, string>>({});
  const activeTopics = stuckTopicsByCourse[activeCourseId ?? ""] ?? [];

  async function handleGenerate(topicId: string) {
    const session = getSession();
    if (!session) return;
    setLoadingTopicId(topicId);
    setErrorByTopicId((prev) => ({ ...prev, [topicId]: "" }));
    try {
      const res = await fetch("/api/instructor/insight/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ topicId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorByTopicId((prev) => ({ ...prev, [topicId]: data.error ?? "Couldn't generate an insight. Try again." }));
        return;
      }
      onInsightGenerated(topicId, { text: data.suggestionText, generatedAt: data.generatedAt });
    } catch {
      setErrorByTopicId((prev) => ({ ...prev, [topicId]: "Couldn't reach the server. Try again." }));
    } finally {
      setLoadingTopicId(null);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.tabs}>
        {courses.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${styles.tab} ${c.id === activeCourseId ? styles.tabActive : ""}`}
            onClick={() => setActiveCourseId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {activeTopics.length === 0 ? (
        <p className={styles.empty}>No stuck topics for this course right now.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Stuck Students</th>
              <th>Avg. Retries</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {activeTopics.map((t) => (
              <Fragment key={t.topicId}>
                <tr>
                  <td>
                    <span className={`${styles.dot} ${styles[t.severity]}`} />
                    {t.topic}
                  </td>
                  <td>{t.stuckCount}</td>
                  <td>{t.avgRetries.toFixed(1)}</td>
                  <td className={styles.arrowCell}>
                    <span className={styles.arrow}>
                      <ArrowIcon size={14} />
                    </span>
                  </td>
                </tr>
                <tr className={styles.insightRow}>
                  <td colSpan={4}>
                    <div className={styles.insightBlock}>
                      {t.mistakeBreakdown.length > 0 ? (
                        <TagRow
                          tags={t.mistakeBreakdown.map((b) => `${b.label} — ${b.count} of ${t.stuckCount} stuck students`)}
                        />
                      ) : (
                        <p className={styles.insightEmpty}>No mistake-tag pattern recorded yet.</p>
                      )}
                      {t.suggestion ? (
                        <p className={styles.suggestionText}>
                          {t.suggestion.text}
                          <span className={styles.suggestionMeta}>
                            {" "}
                            — generated {new Date(t.suggestion.generatedAt).toLocaleDateString()}
                          </span>
                        </p>
                      ) : (
                        <p className={styles.insightEmpty}>No teaching insight generated yet.</p>
                      )}
                      <button
                        type="button"
                        className={styles.insightButton}
                        disabled={loadingTopicId === t.topicId || t.mistakeBreakdown.length === 0}
                        onClick={() => handleGenerate(t.topicId)}
                      >
                        {loadingTopicId === t.topicId ? "Generating…" : t.suggestion ? "Refresh insight" : "Generate insight"}
                      </button>
                      {errorByTopicId[t.topicId] && <p className={styles.insightError}>{errorByTopicId[t.topicId]}</p>}
                    </div>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
