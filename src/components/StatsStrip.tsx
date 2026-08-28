import Skeleton from "@/components/Skeleton";
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

export function StatsStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.strip}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.stat}>
          <Skeleton width={48} height={30} className={styles.value} />
          <Skeleton width={80} height={11} />
        </div>
      ))}
    </div>
  );
}
