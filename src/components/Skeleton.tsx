import styles from "./Skeleton.module.css";

export default function Skeleton({
  width = "100%",
  height = 16,
  radius,
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={`${styles.bar} ${className}`}
      style={{ width, height, borderRadius: radius ?? "var(--radius-sm)" }}
      aria-hidden="true"
    />
  );
}