import Card from "@/components/Card";
import Skeleton from "@/components/Skeleton";
import styles from "./CardSkeleton.module.css";

/** Placeholder matching the subject/course Card shape (ring + title + tag +
 * progress bar + meta) so the grid doesn't jump size once real data lands. */
export default function CardSkeleton() {
  return (
    <Card className={styles.card}>
      <Skeleton width={56} height={56} radius={999} />
      <Skeleton width="65%" height={19} />
      <Skeleton width="45%" height={11} />
      <Skeleton width="100%" height={8} radius={999} />
      <Skeleton width="50%" height={11} />
    </Card>
  );
}