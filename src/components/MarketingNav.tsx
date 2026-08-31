import Link from "next/link";
import styles from "./MarketingNav.module.css";

export default function MarketingNav() {
  return (
    <nav className={styles.nav}>
      <div className="shell">
        <div className={styles.row}>
          <span className={styles.logo}>Bridge</span>
          <div className={styles.right}>
            <Link href="/login" className={styles.signIn}>
              Sign in
            </Link>
            <Link href="/signup" className={styles.signUp}>
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
