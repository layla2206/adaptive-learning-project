"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, CalendarIcon, GridIcon, ChartIcon, UsersIcon, LogoutIcon } from "@/components/icons";
import type { ComponentType } from "react";
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

function roleForPath(pathname: string): "instructor" | "admin" | "student" {
  if (pathname.startsWith("/instructor")) return "instructor";
  if (pathname.startsWith("/admin")) return "admin";
  return "student";
}

export default function Sidebar() {
  const pathname = usePathname();
  const role = roleForPath(pathname);
  const items = role === "instructor" ? INSTRUCTOR_ITEMS : role === "admin" ? ADMIN_ITEMS : STUDENT_ITEMS;
  const homeHref = role === "instructor" ? "/instructor" : role === "admin" ? "/admin" : "/dashboard";

  return (
    <aside className={styles.sidebar}>
      <Link href={homeHref} className={styles.logo}>
        Tutor
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

      <Link href="/" className={styles.signOut}>
        <LogoutIcon size={18} />
        <span className={styles.itemLabel}>Sign out</span>
      </Link>
    </aside>
  );
}
