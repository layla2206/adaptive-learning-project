import styles from "./StatsStrip.module.css";

export interface Stat {
  value: string;
  label: string;
}

export default function StatsStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className={styles.strip}>
      {stats.map((s) => (
        <div key={s.label} className={styles.stat}>
          <div className={styles.value}>{s.value}</div>
          <div className={styles.label}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
