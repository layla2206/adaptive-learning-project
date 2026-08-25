import Sidebar from "@/components/nav/Sidebar";
import AuthGate from "@/components/nav/AuthGate";
import styles from "./layout.module.css";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className={styles.shell}>
        <Sidebar />
        <main className={styles.main}>{children}</main>
      </div>
    </AuthGate>
  );
}
