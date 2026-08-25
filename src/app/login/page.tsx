"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { setSession } from "@/lib/session";
import { homeForRole, type Role } from "@/lib/roleForPath";
import styles from "./page.module.css";

type Status = "idle" | "loading" | "verification_required";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit() {
    if (!email || !password) return;
    setError(null);
    setStatus("loading");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        setStatus("idle");
        return;
      }

      if (data.status === "verification_required") {
        setStatus("verification_required");
        return;
      }

      setSession(data.token, data.role as Role);
      router.push(homeForRole(data.role as Role));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "verification_required") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <Link href="/" className={styles.logo}>
            Tutor
          </Link>
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.subtitle}>
            Your account needs to be verified before you can sign in. We just sent a verification link
            to <strong>{email}</strong> — open it to finish setting up your account. Didn&apos;t get it?
            Sign in again to send a fresh one.
          </p>
          <button type="button" className={styles.primaryButton} onClick={() => setStatus("idle")}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.logo}>
          Tutor
        </Link>

        <div className={styles.stepBody}>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.subtitle}>Welcome back — enter your details to continue.</p>

          <label className={styles.fieldLabel} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />

          <label className={styles.fieldLabel} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />

          {error && <p className={styles.fieldError}>{error}</p>}

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSubmit}
            disabled={!email || !password || status === "loading"}
          >
            {status === "loading" ? "Signing in…" : "Sign in"}
            <ArrowIcon size={14} />
          </button>

          <p className={styles.footNote}>
            Student?{" "}
            <Link href="/signup" className={styles.footLink}>
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
