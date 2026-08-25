import styles from "./TagRow.module.css";

export default function TagRow({ tags, inverted }: { tags: string[]; inverted?: boolean }) {
  return (
    <div className={`${styles.row} ${inverted ? styles.inverted : ""}`}>
      {tags.map((tag) => (
        <span key={tag} className={styles.tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}
