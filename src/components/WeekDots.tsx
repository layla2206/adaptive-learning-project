import type { DayState } from "@/lib/types";
import styles from "./WeekDots.module.css";

export default function WeekDots({ days }: { days: { label: string; state: DayState }[] }) {
  return (
    <div className={styles.row}>
      {days.map((d, i) => (
        <div key={i} className={styles.col}>
          <span className={styles.dayLabel}>{d.label}</span>
          <span className={`${styles.dot} ${styles[d.state]}`} />
        </div>
      ))}
    </div>
  );
}
