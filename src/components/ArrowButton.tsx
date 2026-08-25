import { ArrowIcon, RefreshIcon } from "./icons";
import styles from "./ArrowButton.module.css";

interface ArrowButtonProps {
  inverted?: boolean;
  icon?: "arrow" | "refresh";
  size?: number;
  onClick?: () => void;
  ariaLabel?: string;
}

export default function ArrowButton({
  inverted,
  icon = "arrow",
  size = 40,
  onClick,
  ariaLabel,
}: ArrowButtonProps) {
  const cls = `${styles.btn} ${inverted ? styles.inverted : ""}`;
  const iconEl = icon === "refresh" ? <RefreshIcon size={size * 0.4} /> : <ArrowIcon size={size * 0.4} />;

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        style={{ width: size, height: size }}
        onClick={onClick}
        aria-label={ariaLabel ?? "Continue"}
      >
        {iconEl}
      </button>
    );
  }

  return (
    <span className={cls} style={{ width: size, height: size }} aria-hidden="true">
      {iconEl}
    </span>
  );
}
