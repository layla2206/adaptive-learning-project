import type { Role } from "@/lib/roleForPath";

interface Session {
  token: string;
  role: Role;
}

const STORAGE_KEY = "auth-session";

export function setSession(token: string, role: Role) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, role }));
  window.dispatchEvent(new Event("auth-session-change"));
}

export function getRawSession(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === "string" && typeof parsed.role === "string") {
      return parsed as Session;
    }
  } catch {
    // malformed — treat as no session
  }
  return null;
}

export function getSession(): Session | null {
  return parseSession(getRawSession());
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("auth-session-change"));
}
