"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HomeIcon, CalendarIcon, GridIcon, ChartIcon, UsersIcon, LogoutIcon, SettingsIcon } from "@/components/icons";
import type { ComponentType } from "react";
import { roleForPath } from "@/lib/roleForPath";
import { clearSession } from "@/lib/session";
import styles from "./Sidebar.module.css";

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ size?: number }>;
  active: (pathname: string) => boolean;
}

const STUDENT_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: HomeIcon, active: (p) => p === "/dashboard" || p.startsWith("/subject") },
  { label: "Score", href: "/score", icon: CalendarIcon, active: (p) => p.startsWith("/score") },
  { label: "Settings", href: "/settings", icon: SettingsIcon, active: (p) => p.startsWith("/settings") },
];

const INSTRUCTOR_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/instructor", icon: HomeIcon, active: (p) => p === "/instructor" },
  { label: "Courses", href: "/instructor#courses", icon: GridIcon, active: (p) => p.startsWith("/instructor/courses") },
  { label: "Insights", href: "/instructor#insights", icon: ChartIcon, active: () => false },
];

const ADMIN_ITEMS: NavItem[] = [
  { label: "Instructors", href: "/admin#instructors", icon: UsersIcon, active: (p) => p === "/admin" },
  { label: "Courses", href: "/admin#courses", icon: GridIcon, active: () => false },
  { label: "Platform Stats", href: "/admin#stats", icon: ChartIcon, active: () => false },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const role = roleForPath(pathname);
  const items = role === "instructor" ? INSTRUCTOR_ITEMS : role === "admin" ? ADMIN_ITEMS : STUDENT_ITEMS;
  const homeHref = role === "instructor" ? "/instructor" : role === "admin" ? "/admin" : "/dashboard";

  return (
    <aside className={styles.sidebar}>
      <Link href={homeHref} className={styles.logo}>
        Bridge
      </Link>

      <nav className={styles.nav}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.active(pathname);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
            >
              <Icon size={18} />
              <span className={styles.itemLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        className={styles.signOut}
        onClick={() => {
          clearSession();
          router.push("/");
        }}
      >
        <LogoutIcon size={18} />
        <span className={styles.itemLabel}>Sign out</span>
      </button>
    </aside>
  );
}