import type { SubideaSignal } from "@/lib/instructorData";
import { bandFor } from "@/lib/subideaBands";
import styles from "./SubideaScoreBar.module.css";

/** Same track/fill meter language as MasteryBar, banded good/warning/critical
 * instead of a flat plum fill -- the score here means something (a student
 * struggling with this idea), so it earns a status color, not the brand
 * accent. A small ring marks the fill end when gapCount > 0: size alone is
 * hard to read at n=1 vs n=2, the ring makes "someone got stuck here and
 * moved on anyway" pop regardless of count. */
export default function SubideaScoreBar({ signal }: { signal: SubideaSignal }) {
  const hasData = signal.scoreAttempts > 0;
  const clamped = Math.max(0, Math.min(100, signal.avgUnderstandingScore));
  const band = bandFor(clamped);

  return (
    <div className={styles.cell}>
      <div className={styles.track}>
        {hasData && (
          <div className={`${styles.fill} ${styles[band]}`} style={{ width: `${clamped}%` }}>
            {signal.gapCount > 0 && <span className={styles.gapRing} title={`${signal.gapCount} student(s) hit a gap here`} />}
          </div>
        )}
      </div>
      <span className={styles.value}>
        {hasData ? `${Math.round(clamped)}% (n=${signal.scoreAttempts})` : "No data yet"}
      </span>
    </div>
  );
}
