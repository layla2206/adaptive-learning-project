import { Fragment } from "react";
import type { Subject } from "@/lib/types";
import { buildWeeklyRows, currentWeekLabel, DAY_LABELS, todayIndex } from "@/lib/scoreData";
import { CheckIcon } from "@/components/icons";
import styles from "./WeeklyCalendar.module.css";

export default function WeeklyCalendar({ subjects }: { subjects: Subject[] }) {
  const rows = buildWeeklyRows(subjects);
  const today = todayIndex();
  const onTrackCount = rows.filter((r) => r.onTrack).length;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <p className={styles.weekLabel}>{currentWeekLabel()}</p>
        <p className={styles.trackCount}>
          <span className={styles.trackCountNum}>{onTrackCount}</span> / {rows.length} courses on track
        </p>
      </div>

      <div className={styles.grid}>
        <div className={styles.cornerCell} />
        {DAY_LABELS.map((d, i) => (
          <div key={i} className={`${styles.dayHeader} ${i === today ? styles.dayHeaderToday : ""}`}>
            {d}
          </div>
        ))}

        {rows.map((row) => (
          <Fragment key={row.subjectId}>
            <div className={styles.subjectName}>{row.subjectName}</div>
            {DAY_LABELS.map((_, dayIdx) => {
              const isToday = dayIdx === today;
              const isDone = row.completedDayIndex === dayIdx;
              const stillNeeded = isToday && !row.onTrack;
              const dotCls = isDone ? styles.done : stillNeeded ? styles.needed : styles.empty;
              return (
                <div key={dayIdx} className={styles.cellWrap}>
                  <span className={`${styles.dot} ${dotCls} ${isToday ? styles.todayRing : ""}`}>
                    {isDone && <CheckIcon size={12} />}
                  </span>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.done} ${styles.legendDot}`}>
            <CheckIcon size={9} />
          </span>
          Lecture completed
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.needed} ${styles.legendDot}`} />
          Still needed today
        </span>
      </div>
    </div>
  );
}
