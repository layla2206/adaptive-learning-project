import styles from "./ProgressRing.module.css";

interface ProgressRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  inverted?: boolean;
  label?: string;
}

export default function ProgressRing({
  percent,
  size = 64,
  strokeWidth = 6,
  inverted = false,
  label,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={inverted ? styles.trackInverted : styles.track}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={inverted ? styles.progressInverted : styles.progress}
        />
      </svg>
      <span
        className={styles.label}
        style={{ fontSize: size < 56 ? "0.65rem" : "0.85rem" }}
      >
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
