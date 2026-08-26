"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getRawSession, parseSession } from "@/lib/session";
import { roleForPath, homeForRole } from "@/lib/roleForPath";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("auth-session-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("auth-session-change", callback);
  };
}

function getServerSnapshot() {
  return null;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const rawSession = useSyncExternalStore(subscribe, getRawSession, getServerSnapshot);
  const session = parseSession(rawSession);
  const requiredRole = roleForPath(pathname);
  const authorized = !!session && session.role === requiredRole;

  useEffect(() => {
    if (!authorized) {
      router.replace(session ? homeForRole(session.role) : "/login");
    }
  }, [authorized, session, router]);

  if (!authorized) return null;
  return <>{children}</>;
}
