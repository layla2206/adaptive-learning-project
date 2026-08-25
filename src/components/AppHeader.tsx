import Link from "next/link";
import type { ReactNode } from "react";
import { initials } from "@/lib/utils";
import { ArrowIcon } from "./icons";
import styles from "./AppHeader.module.css";

interface AppHeaderProps {
  eyebrow: string;
  title: string;
  userName: string;
  backHref?: string;
  backLabel?: string;
  /** Optional chip/tag rendered inline next to the title (e.g. a subject label). */
  titleExtra?: ReactNode;
}

export default function AppHeader({
  eyebrow,
  title,
  userName,
  backHref,
  backLabel,
  titleExtra,
}: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        {backHref ? (
          <Link href={backHref} className={styles.back}>
            <span className={styles.backArrow}>
              <ArrowIcon size={12} />
            </span>
            {backLabel ?? "Back"}
          </Link>
        ) : (
          <p className={`eyebrow ${styles.eyebrow}`}>{eyebrow}</p>
        )}
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {titleExtra}
        </div>
      </div>
      <div className={styles.avatar} title={userName}>
        {initials(userName)}
      </div>
    </header>
  );
}
