import type { SubideaSignal } from "@/lib/instructorData";
import { BAND_LABEL } from "@/lib/subideaBands";
import SubideaScoreBar from "./SubideaScoreBar";
import SubideaScatter from "./SubideaScatter";
import styles from "./SubideaSignalsPanel.module.css";

/** Shared rendering for a topic's sub-idea breakdown -- used by both
 * StuckTable (gated on a stuck cohort) and TopicSubideasTable (every topic).
 * One legend covers both charts below it since they share the same
 * good/warning/critical score banding. The scatter only earns its keep once
 * there are >= 2 scored sub-ideas to compare -- a single point has no
 * quadrant to read. */
export default function SubideaSignalsPanel({ signals }: { signals: SubideaSignal[] }) {
  if (signals.length === 0) return null;
  const scoredCount = signals.filter((s) => s.scoreAttempts > 0).length;

  return (
    <div className={styles.panel}>
      <div className={styles.legend}>
        {(Object.keys(BAND_LABEL) as (keyof typeof BAND_LABEL)[]).map((band) => (
          <span key={band} className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles[band]}`} />
            {BAND_LABEL[band]}
          </span>
        ))}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Sub-Idea</th>
            <th>Avg. Understanding Score</th>
            <th>Follow-Up Questions</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.subideaId}>
              <td>{s.label}</td>
              <td>
                <SubideaScoreBar signal={s} />
              </td>
              <td>{s.followUpCount}</td>
              <td>{s.gapCount > 0 && <span className={styles.gapBadge}>GAP · {s.gapCount}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {scoredCount >= 2 && (
        <div className={styles.scatterBlock}>
          <p className={styles.scatterCaption}>Score vs. follow-up questions</p>
          <SubideaScatter signals={signals} />
        </div>
      )}
    </div>
  );
}
