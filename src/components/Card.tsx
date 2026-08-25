import Link from "next/link";
import type { ReactNode, MouseEventHandler } from "react";
import styles from "./Card.module.css";

interface CardProps {
  href?: string;
  featured?: boolean;
  flagged?: boolean;
  dashed?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: MouseEventHandler;
  children: ReactNode;
}

export default function Card({
  href,
  featured,
  flagged,
  dashed,
  disabled,
  className,
  onClick,
  children,
}: CardProps) {
  const cls = [
    styles.card,
    featured && styles.featured,
    flagged && styles.flagged,
    dashed && styles.dashed,
    disabled && styles.disabled,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href && !disabled) {
    return (
      <Link
        href={href}
        className={cls}
        onClick={onClick}
        data-card
        data-featured={featured || undefined}
        data-flagged={flagged || undefined}
      >
        {children}
      </Link>
    );
  }

  return (
    <div
      className={cls}
      onClick={disabled ? undefined : onClick}
      data-card
      data-featured={featured || undefined}
      data-flagged={flagged || undefined}
    >
      {children}
    </div>
  );
}
