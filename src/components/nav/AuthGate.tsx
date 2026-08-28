"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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

  // useSyncExternalStore renders the server snapshot (always `null`, since the
  // server can't see localStorage) for the first client render too, only
  // resyncing to the real value a render later. Redirecting on that first,
  // structurally-guaranteed-unauthenticated render would bounce a validly
  // signed-in user to /login before the resync ever lands -- wait for one
  // real post-hydration render (`clientReady`) before trusting `authorized`.
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (clientReady && !authorized) {
      router.replace(session ? homeForRole(session.role) : "/login");
    }
  }, [clientReady, authorized, session, router]);

  if (!clientReady || !authorized) return null;
  return <>{children}</>;
}
