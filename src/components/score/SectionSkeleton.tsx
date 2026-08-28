import Skeleton from "@/components/Skeleton";
import styles from "./SectionSkeleton.module.css";

/** A generic card-shaped placeholder for a Score page section, so a loading
 * subjects list doesn't briefly read as "No topics yet" / "No trophies yet"
 * before the real data arrives. */
export default function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.card}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "40%" : "100%"} height={16} />
      ))}
    </div>
  );
}