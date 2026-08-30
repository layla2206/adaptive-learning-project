"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTutorStore } from "@/lib/store";
import { getSession } from "@/lib/session";
import AppHeader from "@/components/AppHeader";
import { ArrowIcon, RefreshIcon } from "@/components/icons";
import styles from "./page.module.css";

interface GenerateResult {
  questionCount: number;
  generatedAt: string;
  questionsPdfUrl: string;
  answerKeyPdfUrl: string;
}

export default function FinalExamPage() {
  const params = useParams<{ subjectId: string }>();
  const { subjects, userName, loading } = useTutorStore();
  const subject = subjects.find((s) => s.id === params.subjectId);

  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  async function load(forceRegenerate: boolean) {
    if (!subject) return;
    setStatus("loading");
    const session = getSession();
    if (!session) {
      setErrorMessage("You'll need to be signed in — try refreshing.");
      setStatus("error");
      return;
    }
    try {
      const response = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ courseId: subject.id, contentType: "final_exam", forceRegenerate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");
      if (data.error) {
        setStatus("unavailable");
        return;
      }
      setResult({
        questionCount: data.questionCount,
        generatedAt: data.generatedAt,
        questionsPdfUrl: data.questionsPdfUrl,
        answerKeyPdfUrl: data.answerKeyPdfUrl,
      });
      setStatus("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong loading this — try again in a moment.");
      setStatus("error");
    }
  }

  useEffect(() => {
    queueMicrotask(() => load(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject?.id]);

  if (loading) {
    return <div className={`shell ${styles.page}`} />;
  }

  if (!subject) {
    return (
      <div className={`shell ${styles.page}`}>
        <div className={styles.notFound}>
          <p>Subject not found.</p>
          <Link href="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  async function handleRegenerate() {
    setRegenerating(true);
    await load(true);
    setRegenerating(false);
  }

  return (
    <div className={`shell ${styles.page}`}>
      <AppHeader
        eyebrow="Final Exam"
        title={subject.name}
        userName={userName}
        backHref={`/subject/${subject.id}`}
        backLabel={subject.name}
      />

      {status === "loading" && (
        <div className={styles.diagnoseCard}>
          <p className={styles.diagnoseTag}>Building your final exam…</p>
        </div>
      )}

      {status === "unavailable" && (
        <div className={styles.diagnoseCard}>
          <h2 className={styles.diagnosePrompt}>
            No instructor exam or quiz material is available for {subject.name} yet.
          </h2>
        </div>
      )}

      {status === "error" && (
        <div className={styles.diagnoseCard}>
          <h2 className={styles.diagnosePrompt}>
            {errorMessage ?? "Something went wrong loading this — try again in a moment."}
          </h2>
        </div>
      )}

      {status === "ready" && result && (
        <div className={styles.diagnoseCard}>
          <p className={styles.diagnoseTag}>Final exam ready</p>
          <h2 className={styles.diagnosePrompt}>
            {result.questionCount} question{result.questionCount === 1 ? "" : "s"}, ready to download.
          </h2>
          <div className={styles.continueRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            <a href={result.questionsPdfUrl} className={styles.continueButton} target="_blank" rel="noopener noreferrer">
              Download Questions (PDF)
              <ArrowIcon size={14} />
            </a>
            <a href={result.answerKeyPdfUrl} className={styles.continueButton} target="_blank" rel="noopener noreferrer">
              Download Answer Key (PDF)
              <ArrowIcon size={14} />
            </a>
            <button type="button" className={styles.continueButton} onClick={handleRegenerate} disabled={regenerating}>
              <RefreshIcon size={14} />
              {regenerating ? "Generating…" : "Generate a new exam"}
            </button>
          </div>
        </div>
      )}

      <div className={styles.continueRow}>
        <Link href={`/subject/${subject.id}`} className={styles.continueButton}>
          Back to {subject.name}
          <ArrowIcon size={14} />
        </Link>
      </div>
    </div>
  );
}
