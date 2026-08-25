import styles from "./CompletionBadge.module.css";

function BadgeIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5 19 5.5V11c0 5-3 8.5-7 10.5C8 19.5 5 16 5 11V5.5Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path
        d="m12 8 1.3 2.7 3 .4-2.15 2.1.5 3-2.65-1.4-2.65 1.4.5-3L7.7 11.1l3-.4Z"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CompletionBadge({
  subjectName,
  totalLectures,
  unlocked,
  compact,
  justUnlocked,
}: {
  subjectName: string;
  totalLectures: number;
  unlocked: boolean;
  compact?: boolean;
  /** This unlock just happened on arrival — plays a pop/glow transition instead of rendering unlocked instantly. */
  justUnlocked?: boolean;
}) {
  return (
    <div
      className={[
        styles.badge,
        unlocked ? styles.unlocked : styles.locked,
        compact && styles.compact,
        justUnlocked && styles.justUnlocked,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.iconWrap}>
        <BadgeIcon size={compact ? 20 : 26} />
      </div>
      <div>
        <h3 className={styles.title}>{unlocked ? `${subjectName} — Complete` : "Palace Badge"}</h3>
        <p className={styles.copy}>
          {unlocked
            ? `Every window is lit. ${subjectName} is fully mastered.`
            : `Reach lecture ${totalLectures} and fully light the palace to unlock it.`}
        </p>
      </div>
    </div>
  );
}
