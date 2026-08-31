"use client";

import { Fragment, useState } from "react";
import type { Course, TopicBreakdown } from "@/lib/instructorData";
import { ArrowIcon } from "@/components/icons";
import SubideaSignalsPanel from "./SubideaSignalsPanel";
import styles from "./TopicSubideasTable.module.css";

/** Every topic in a course, expandable to its sub-idea breakdown -- unlike
 * StuckTable, not gated on a topic having a stuck cohort (2+ retries,
 * unmastered). Useful for watching one topic's insights build up in
 * isolation (e.g. a single test run) without needing multiple students to
 * hit the stuck threshold first. */
export default function TopicSubideasTable({
  courses,
  topicsByCourse,
}: {
  courses: Course[];
  topicsByCourse: Record<string, TopicBreakdown[]>;
}) {
  const [activeCourseId, setActiveCourseId] = useState(courses[0]?.id);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const activeTopics = topicsByCourse[activeCourseId ?? ""] ?? [];

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
        <p className={styles.empty}>No topics for this course yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Sub-Ideas</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {activeTopics.map((t) => {
              const expanded = expandedTopicId === t.topicId;
              return (
                <Fragment key={t.topicId}>
                  <tr className={styles.topicRow} onClick={() => setExpandedTopicId(expanded ? null : t.topicId)}>
                    <td>{t.topic}</td>
                    <td>{t.subideaSignals.length > 0 ? t.subideaSignals.length : "Not generated yet"}</td>
                    <td className={styles.arrowCell}>
                      <span className={`${styles.arrow} ${expanded ? styles.arrowOpen : ""}`}>
                        <ArrowIcon size={14} />
                      </span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className={styles.detailRow}>
                      <td colSpan={3}>
                        {t.subideaSignals.length === 0 ? (
                          <p className={styles.empty}>No sub-idea breakdown generated for this topic yet.</p>
                        ) : (
                          <SubideaSignalsPanel signals={t.subideaSignals} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
