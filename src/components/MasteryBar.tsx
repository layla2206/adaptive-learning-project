import styles from "./MasteryBar.module.css";

interface MasteryBarProps {
  percent: number;
  label?: string;
  inverted?: boolean;
}

export default function MasteryBar({ percent, label = "Class Mastery", inverted }: MasteryBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={styles.wrap}>
      <div className={styles.labelRow}>
        <span className={`${styles.label} ${inverted ? styles.labelInverted : ""}`}>{label}</span>
        <span className={`${styles.value} ${inverted ? styles.valueInverted : ""}`}>{clamped}%</span>
      </div>
      <div className={`${styles.track} ${inverted ? styles.trackInverted : ""}`}>
        <div
          className={`${styles.fill} ${inverted ? styles.fillInverted : ""}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
