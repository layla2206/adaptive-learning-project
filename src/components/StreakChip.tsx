import { FlameIcon } from "./icons";
import styles from "./StreakChip.module.css";

export default function StreakChip({ days }: { days: number }) {
  return (
    <div className={styles.chip}>
      <FlameIcon size={14} />
      <span>
        {days} day streak
      </span>
    </div>
  );
}
