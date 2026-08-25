"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setSession } from "@/lib/session";
import { homeForRole, type Role } from "@/lib/roleForPath";
import styles from "./page.module.css";

type Status = "verifying" | "success" | "error";

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [error, setError] = useState<string | null>(
    token ? null : "This verification link is missing its token."
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error || "Something went wrong.");
          setStatus("error");
          return;
        }

        setSession(data.token, data.role as Role);
        setStatus("success");
        setTimeout(() => router.push(homeForRole(data.role as Role)), 1200);
      } catch {
        if (!cancelled) {
          setError("Couldn't reach the server. Try the link again.");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.logo}>
          Tutor
        </Link>
        {status === "verifying" && (
          <>
            <h1 className={styles.title}>Verifying your account…</h1>
            <p className={styles.subtitle}>Just a moment.</p>
          </>
        )}
        {status === "success" && (
          <>
            <h1 className={styles.title}>You&apos;re verified</h1>
            <p className={styles.subtitle}>Taking you to your dashboard…</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className={styles.title}>Couldn&apos;t verify that link</h1>
            <p className={styles.subtitle}>{error}</p>
            <Link href="/login" className={styles.primaryButton}>
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
