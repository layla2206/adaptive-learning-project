"use client";

import { useState } from "react";
import type { Course, StuckTopic } from "@/lib/instructorData";
import { ArrowIcon } from "@/components/icons";
import styles from "./StuckTable.module.css";

export default function StuckTable({
  courses,
  stuckTopicsByCourse,
}: {
  courses: Course[];
  stuckTopicsByCourse: Record<string, StuckTopic[]>;
}) {
  const [activeCourseId, setActiveCourseId] = useState(courses[0]?.id);
  const activeTopics = stuckTopicsByCourse[activeCourseId ?? ""] ?? [];

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
              <tr key={t.topic}>
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
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
