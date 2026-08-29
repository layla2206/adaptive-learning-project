"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTutorStore } from "@/lib/store";
import { getSession } from "@/lib/session";
import AppHeader from "@/components/AppHeader";
import { ArrowIcon, RefreshIcon } from "@/components/icons";
import styles from "../page.module.css";

type ContentType = "practice_assignment" | "quiz";

interface QuizQuestion {
  question_text: string;
  options: string[];
  correct_answer: string;
  difficulty?: string;
}

interface PracticeQuestion {
  question_text: string;
  model_answer: string;
  difficulty?: string;
}

export default function PracticePage() {
  const params = useParams<{ subjectId: string; topicId: string }>();
  const searchParams = useSearchParams();
  const contentType: ContentType = searchParams.get("type") === "quiz" ? "quiz" : "practice_assignment";

  const { subjects, userName, loading } = useTutorStore();
  const subject = subjects.find((s) => s.id === params.subjectId);
  const topic = subject?.topics.find((t) => t.id === params.topicId);

  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
  const [questions, setQuestions] = useState<(QuizQuestion | PracticeQuestion)[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [regenerating, setRegenerating] = useState(false);

  async function load(forceRegenerate: boolean) {
    if (!topic) return;
    setStatus("loading");
    const session = getSession();
    if (!session) {
      setStatus("error");
      return;
    }
    try {
      const response = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ topicId: topic.id, contentType, forceRegenerate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");
      if (data.error) {
        setStatus("unavailable");
        return;
      }
      setQuestions(data.questions ?? []);
      setRevealed(new Set());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    queueMicrotask(() => load(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic?.id, contentType]);

  if (loading) {
    return <div className={`shell ${styles.page}`} />;
  }

  if (!subject || !topic) {
    return (
      <div className={`shell ${styles.page}`}>
        <div className={styles.notFound}>
          <p>Topic not found.</p>
          <Link href="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  function toggleReveal(i: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleRegenerate() {
    setRegenerating(true);
    await load(true);
    setRegenerating(false);
  }

  return (
    <div className={`shell ${styles.page}`}>
      <AppHeader
        eyebrow={contentType === "quiz" ? "Quiz" : "Practice"}
        title={topic.name}
        userName={userName}
        backHref={`/subject/${subject.id}/topic/${topic.id}`}
        backLabel={topic.name}
      />

      {status === "loading" && (
        <div className={styles.diagnoseCard}>
          <p className={styles.diagnoseTag}>
            {contentType === "quiz" ? "Building a fresh quiz…" : "Building a fresh practice set…"}
          </p>
        </div>
      )}

      {status === "unavailable" && (
        <div className={styles.diagnoseCard}>
          <h2 className={styles.diagnosePrompt}>
            No instructor {contentType === "quiz" ? "quiz" : "practice assignment"} material is available for this
            topic yet.
          </h2>
        </div>
      )}

      {status === "error" && (
        <div className={styles.diagnoseCard}>
          <h2 className={styles.diagnosePrompt}>Something went wrong loading this — try again in a moment.</h2>
        </div>
      )}

      {status === "ready" && (
        <>
          <div className={styles.chat}>
            {questions.map((q, i) => (
              <div key={i} className={styles.bubbleRow}>
                <div className={styles.bubble}>
                  <div className={styles.bubbleTag}>
                    Question {i + 1} of {questions.length}
                    {q.difficulty ? ` · ${q.difficulty}` : ""}
                  </div>
                  <p>{q.question_text}</p>
                  {"options" in q && (
                    <div className={styles.diagnoseOptions} style={{ marginTop: 14 }}>
                      {q.options.map((opt) => (
                        <span
                          key={opt}
                          className={styles.diagnoseOption}
                          style={
                            revealed.has(i) && opt === q.correct_answer
                              ? { borderColor: "var(--plum)", color: "var(--plum)" }
                              : undefined
                          }
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                  {revealed.has(i) && "model_answer" in q && (
                    <div className={styles.citationSnippet}>
                      <p className={styles.citationSnippetSource}>Model answer</p>
                      <p className={styles.citationSnippetExcerpt}>{q.model_answer}</p>
                    </div>
                  )}
                  <div className={styles.continueRow} style={{ marginTop: 14, marginBottom: 0 }}>
                    <button type="button" className={styles.continueButton} onClick={() => toggleReveal(i)}>
                      {revealed.has(i) ? "Hide answer" : "Reveal answer"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.continueRow}>
            <button type="button" className={styles.continueButton} onClick={handleRegenerate} disabled={regenerating}>
              <RefreshIcon size={14} />
              {regenerating ? "Generating…" : "Generate a new set"}
            </button>
          </div>
        </>
      )}

      <div className={styles.continueRow}>
        <Link href={`/subject/${subject.id}/topic/${topic.id}`} className={styles.continueButton}>
          Back to {topic.name}
          <ArrowIcon size={14} />
        </Link>
      </div>
    </div>
  );
}
