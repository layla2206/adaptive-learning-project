import Skeleton from "@/components/Skeleton";
import styles from "./AdminTable.module.css";

export default function AdminTableSkeleton({
  title,
  columns,
  rows = 3,
}: {
  title: string;
  columns: string[];
  rows?: number;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3>{title}</h3>
        <Skeleton width={140} height={32} radius={8} />
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {columns.map((c, i) => (
                <td key={c}>
                  <Skeleton width={i === 0 ? "70%" : "50%"} height={13} />
                </td>
              ))}
              <td className={styles.actionCell}>
                <Skeleton width={80} height={28} radius={8} className={styles.skeletonRight} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}