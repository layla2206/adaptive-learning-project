"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTutorStore } from "@/lib/store";
import { getSession } from "@/lib/session";
import { announceMastery } from "@/lib/milestoneAnnounce";
import AppHeader from "@/components/AppHeader";
import Confetti from "@/components/Confetti";
import MermaidDiagram from "@/components/MermaidDiagram";
import TutorMarkdown from "@/components/TutorMarkdown";
import { ArrowIcon, BookIcon, CheckIcon, InfoIcon, LightbulbIcon, RefreshIcon } from "@/components/icons";
import styles from "./page.module.css";

type Stage =
  | "diagnose"
  | "diagnose-summary"
  | "thinking-explain"
  | "explain-shown"
  | "check-ask"
  | "checking"
  | "thinking-retry-explain"
  | "retry-shown"
  | "retry-check-ask"
  | "retry-checking"
  | "done";

interface Citation {
  mark: string;
  source: string;
  excerpt: string;
}

interface Message {
  id: string;
  role: "tutor" | "user";
  tag?: string;
  paragraphs: string[];
  citations?: Citation[];
  diagram?: string;
}

const BASE_STEPS = ["Diagnose", "Explain", "Check"];

interface DiagnosticQuestion {
  question_id: string;
  text: string;
  options: string[];
}

const STEP_PROMPTS = [
  "What do you start from?",
  "What rule or operation do you apply?",
  "What's the result, and how do you know it's right?",
];

function summarizeDiagnosticScore(score: string): { headline: string; sub: string } {
  const [correctStr, totalStr] = score.split("/");
  const total = Number(totalStr);
  const pct = total > 0 ? Number(correctStr) / total : 0;
  if (pct >= 1) return { headline: "Starting from a solid base.", sub: "We'll move quickly through the fundamentals and spend more time on the edge cases." };
  if (pct > 0) return { headline: "Starting with some familiarity.", sub: "We'll ground the parts you've half-seen before and build from there." };
  return { headline: "Starting fresh — exactly what this step is for.", sub: "No assumptions — the explanation will build the idea from the ground up." };
}

let msgId = 0;
function nextId() {
  msgId += 1;
  return `m${msgId}`;
}

const RETRY_TAGS = new Set(["Worked Example", "Hands-on Task", "Analogy", "Diagram", "Mind Map"]);

type MessageKind = "explanation" | "feedback" | "hint" | "retry" | "result";

const KIND_ICON: Record<MessageKind, typeof BookIcon> = {
  explanation: BookIcon,
  feedback: InfoIcon,
  hint: LightbulbIcon,
  retry: RefreshIcon,
  result: CheckIcon,
};

/** Which visual category a tutor bubble's tag belongs to, for the icon +
 * accent color that distinguishes explanations/feedback/hints/retry
 * formats/results at a glance -- untagged or user bubbles get none. */
function messageKind(tag?: string): MessageKind | null {
  if (!tag) return null;
  if (tag === "Grounded Explanation") return "explanation";
  if (tag === "Feedback") return "feedback";
  if (tag.startsWith("Hint")) return "hint";
  if (tag === "Result") return "result";
  if (RETRY_TAGS.has(tag)) return "retry";
  return null;
}

interface HistoryRow {
  text: string;
  tag?: string;
  citations?: Citation[];
  diagram?: string | null;
  isDiagram?: boolean;
  hintsUsed?: number;
  maxHints?: number;
}

/**
 * Rebuilds the chat + resumable stage from persisted session_messages.
 * Only "Grounded Explanation", a retry-format tag, or "Hint" as the LAST message
 * is a stage we know how to resume into (waiting on "Continue" or another
 * submission); anything else (no history, or a session that already reached
 * "Result") falls back to a fresh diagnose so we're never left resuming into an
 * inconsistent stage.
 */
function restoreFromHistory(rows: HistoryRow[]): { messages: Message[]; stage: Stage; hasRetried: boolean } | null {
  if (rows.length === 0) return null;
  const lastRow = rows[rows.length - 1];
  const lastTag = lastRow?.tag;
  const lastIsRetry = RETRY_TAGS.has(lastTag ?? "");
  const lastIsHint = lastTag === "Hint";
  if (lastTag !== "Grounded Explanation" && !lastIsRetry && !lastIsHint) return null;

  const messages: Message[] = rows.map((row) => ({
    id: nextId(),
    role: "tutor",
    tag: row.tag === "Hint" ? `Hint ${row.hintsUsed}/${row.maxHints}` : row.tag,
    paragraphs: row.isDiagram
      ? row.citations?.length
        ? [`Sources: ${row.citations.map((c) => `${c.mark} ${c.source}`).join(" · ")}`]
        : []
      : [row.text],
    citations: row.isDiagram ? undefined : row.citations,
    diagram: row.isDiagram ? row.text : undefined,
  }));

  return {
    messages,
    stage: lastIsRetry ? "retry-shown" : lastIsHint ? "check-ask" : "explain-shown",
    hasRetried: rows.some((row) => RETRY_TAGS.has(row.tag ?? "")),
  };
}

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className={styles.bubbleRow}>
      <div className={`${styles.bubble} ${styles.thinkingBubble}`}>
        <div className={styles.bubbleTag}>{label}</div>
        <div className={styles.thinkingLines}>
          <span className={styles.thinkingLine} />
          <span className={`${styles.thinkingLine} ${styles.thinkingLineShort}`} />
        </div>
      </div>
    </div>
  );
}

export default function TopicPage() {
  const params = useParams<{ subjectId: string; topicId: string }>();
  const { subjects, userName, loading, markTopicMastered, setTopicProgress } = useTutorStore();
  const subject = subjects.find((s) => s.id === params.subjectId);
  const topic = subject?.topics.find((t) => t.id === params.topicId);

  const [stage, setStage] = useState<Stage>("diagnose");
  const [diagQuestions, setDiagQuestions] = useState<DiagnosticQuestion[] | null>(null);
  const [diagLoading, setDiagLoading] = useState(true);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diagIdx, setDiagIdx] = useState(0);
  const [diagAnswers, setDiagAnswers] = useState<{ question_id: string; student_answer: string }[]>([]);
  const [diagScore, setDiagScore] = useState<string | null>(null);
  const [hasRetried, setHasRetried] = useState(false);
  const [input, setInput] = useState("");
  const [stepAnswers, setStepAnswers] = useState(["", "", ""]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!topic) return;
    const topicId = topic.id;
    let cancelled = false;

    async function loadQuestions(session: { token: string }) {
      try {
        const response = await fetch("/api/diagnostic/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ topic_id: topicId }),
        });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || "Something went wrong");
        if (!cancelled) setDiagQuestions(data.questions ?? []);
      } catch {
        if (!cancelled) setDiagError("Couldn't load the diagnostic questions for this topic — try refreshing.");
      } finally {
        if (!cancelled) setDiagLoading(false);
      }
    }

    async function resumeOrStart() {
      setDiagLoading(true);
      setDiagError(null);
      const session = getSession();
      if (!session) {
        if (!cancelled) {
          setDiagError("You'll need to be signed in to start the diagnostic — try refreshing.");
          setDiagLoading(false);
        }
        return;
      }

      try {
        const historyRes = await fetch(`/api/session/history?topicId=${topicId}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const historyData = await historyRes.json();
        if (cancelled) return;
        if (historyRes.ok && historyData.sessionId) {
          const restored = restoreFromHistory(historyData.messages ?? []);
          if (restored) {
            setSessionId(historyData.sessionId);
            setMessages(restored.messages);
            setHasRetried(restored.hasRetried);
            setStage(restored.stage);
            setDiagLoading(false);
            return;
          }
        }
      } catch {
        // Couldn't check for a resumable session — fall through to a fresh diagnostic.
      }

      if (!cancelled) loadQuestions(session);
    }

    resumeOrStart();
    return () => {
      cancelled = true;
    };
  }, [topic?.id]);

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

  function pushMessage(msg: Omit<Message, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);
  }

  function toggleCitation(key: string) {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleDiagnoseSelect(option: string) {
    if (!diagQuestions) return;
    const question = diagQuestions[diagIdx];
    const nextAnswers = [...diagAnswers, { question_id: question.question_id, student_answer: option }];
    setDiagAnswers(nextAnswers);
    if (diagIdx + 1 < diagQuestions.length) {
      setDiagIdx(diagIdx + 1);
      return;
    }
    handleDiagnoseSubmit(nextAnswers);
  }

  async function handleDiagnoseSubmit(answers: { question_id: string; student_answer: string }[]) {
    const session = getSession();
    if (!session) {
      setDiagScore("0/0");
      setStage("diagnose-summary");
      return;
    }
    try {
      const response = await fetch("/api/diagnostic/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ answers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");
      setDiagScore(data.score ?? "0/0");
    } catch {
      setDiagScore("0/0");
    } finally {
      setStage("diagnose-summary");
    }
  }

  async function handleDiagnoseSummaryContinue() {
    if (!topic || !subject) return;
    setTopicProgress(subject.id, topic.id, 30);
    setStage("thinking-explain");

    const session = getSession();
    if (!session) {
      pushMessage({ role: "tutor", paragraphs: ["You'll need to be signed in to get an explanation — try refreshing."] });
      setStage("explain-shown");
      return;
    }

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          courseId: subject.id,
          topicId: topic.id,
          question: `Explain ${topic.name} from the ground up, starting from the fundamentals.`,
          sessionId: sessionId ?? undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");

      if (data.sessionId) setSessionId(data.sessionId);
      pushMessage({
        role: "tutor",
        tag: "Grounded Explanation",
        paragraphs: [data.answer],
        citations: data.citations,
      });
    } catch {
      pushMessage({
        role: "tutor",
        paragraphs: ["Something went wrong getting an explanation for this topic — try again in a moment."],
      });
    } finally {
      setStage("explain-shown");
    }
  }

  function handleContinueToCheck() {
    if (!topic || !subject) return;
    setTopicProgress(subject.id, topic.id, 60);
    pushMessage({
      role: "tutor",
      tag: "Mastery Check",
      paragraphs: [
        `Your turn — walk me through ${topic.name} in your own words, like you're explaining it to someone who's never seen it. Be specific about the "why," not just the "what."`,
      ],
    });
    setStage("check-ask");
  }

  async function handleCheckSubmit() {
    if (!input.trim() || !topic || !subject) return;
    const answer = input.trim();
    pushMessage({ role: "user", paragraphs: [answer] });
    setInput("");
    setStage("checking");

    const session = getSession();
    if (!session) {
      pushMessage({ role: "tutor", paragraphs: ["You'll need to be signed in to check this — try refreshing."] });
      setStage("check-ask");
      return;
    }

    try {
      const checkRes = await fetch("/api/student/mastery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ topicId: topic.id, sessionId: sessionId ?? undefined, explanation: answer }),
      });
      const checkData = await checkRes.json();
      if (!checkRes.ok) throw new Error(checkData.error || "Something went wrong");
      if (checkData.sessionId) setSessionId(checkData.sessionId);

      if (checkData.passed) {
        pushMessage({ role: "tutor", tag: "Result", paragraphs: [checkData.feedback] });
        markTopicMastered(subject.id, topic.id);
        announceMastery(subject.id, topic.id);
        setStage("done");
        return;
      }

      if (checkData.hint) {
        pushMessage({
          role: "tutor",
          tag: `Hint ${checkData.hintsUsed}/${checkData.maxHints}`,
          paragraphs: [`${checkData.feedback}\n\n${checkData.hint}`],
        });
        setStage("check-ask");
        return;
      }

      setHasRetried(true);
      setTopicProgress(subject.id, topic.id, 70);
      pushMessage({ role: "tutor", tag: "Feedback", paragraphs: [checkData.feedback] });
      setStage("thinking-retry-explain");

      const retryRes = await fetch("/api/retry/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ topicId: topic.id, sessionId: checkData.sessionId ?? sessionId ?? undefined }),
      });
      const retryData = await retryRes.json();
      if (!retryRes.ok) throw new Error(retryData.error || "Something went wrong");
      if (retryData.sessionId) setSessionId(retryData.sessionId);

      const citations: Citation[] = retryData.citations ?? [];

      if (retryData.isDiagram) {
        // Diagram/Mind Map formats return Mermaid syntax, not prose — nothing
        // for renderCite's [\d] regex to attach a citation chip to, so sources
        // are listed as a plain caption instead of inline markers.
        pushMessage({
          role: "tutor",
          tag: retryData.format,
          paragraphs: citations.length
            ? [`Sources: ${citations.map((c: Citation) => `${c.mark} ${c.source}`).join(" · ")}`]
            : [],
          diagram: retryData.content,
        });
      } else {
        // Prose formats now cite inline (backend renumbers to match citations,
        // same as /query) — renderCite's [\d] regex picks the markers up directly.
        pushMessage({
          role: "tutor",
          tag: retryData.format,
          paragraphs: [retryData.content],
          citations,
        });
      }
      setStage("retry-shown");
    } catch {
      pushMessage({ role: "tutor", paragraphs: ["Something went wrong checking that — try again in a moment."] });
      setStage("check-ask");
    }
  }

  function handleContinueToRetryCheck() {
    if (!topic) return;
    setStepAnswers(["", "", ""]);
    pushMessage({
      role: "tutor",
      tag: "Mastery Check · Retry",
      paragraphs: [
        `This time, let's solve it end-to-end instead of describing it — walk me through the three steps below.`,
      ],
    });
    setStage("retry-check-ask");
  }

  async function handleRetryCheckSubmit() {
    if (!topic || !subject || stepAnswers.some((a) => !a.trim())) return;
    const solution = stepAnswers.map((a, i) => `Step ${i + 1}: ${a.trim()}`).join(" ");
    pushMessage({
      role: "user",
      paragraphs: stepAnswers.map((a, i) => `Step ${i + 1}: ${a.trim()}`),
    });
    setStepAnswers(["", "", ""]);
    setStage("retry-checking");

    const session = getSession();
    if (!session) {
      pushMessage({ role: "tutor", paragraphs: ["You'll need to be signed in to check this — try refreshing."] });
      setStage("retry-check-ask");
      return;
    }

    try {
      const response = await fetch("/api/student/mastery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ topicId: topic.id, sessionId: sessionId ?? undefined, solution }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");
      if (data.sessionId) setSessionId(data.sessionId);

      pushMessage({ role: "tutor", tag: "Result", paragraphs: [data.feedback] });
      if (data.passed) {
        markTopicMastered(subject.id, topic.id);
        announceMastery(subject.id, topic.id);
      }
      setStage("done");
    } catch {
      pushMessage({ role: "tutor", paragraphs: ["Something went wrong checking that — try again in a moment."] });
      setStage("retry-check-ask");
    }
  }

  const steps = hasRetried ? [...BASE_STEPS, "Retry"] : BASE_STEPS;
  const stepIndex =
    stage === "diagnose" || stage === "diagnose-summary"
      ? 0
      : stage === "thinking-explain" || stage === "explain-shown"
        ? 1
        : stage === "check-ask" || stage === "checking"
          ? 2
          : stage === "thinking-retry-explain" ||
              stage === "retry-shown" ||
              stage === "retry-check-ask" ||
              stage === "retry-checking"
            ? 3
            : steps.length;


  const diagSummary = summarizeDiagnosticScore(diagScore ?? "0/0");

  function handleSkipDiagnose() {
    setDiagScore(null);
    setStage("diagnose-summary");
  }

  return (
    <div className={`shell ${styles.page}`}>
      <AppHeader
        eyebrow="Topic"
        title={topic.name}
        userName={userName}
        backHref={`/subject/${subject.id}`}
        backLabel={subject.name}
        titleExtra={<span className={styles.subjectChip}>{subject.name}</span>}
      />

      <div className={styles.stepper}>
        {steps.map((label, i) => (
          <div key={label} className={styles.step}>
            <div
              className={`${styles.stepBar} ${
                i < stepIndex ? styles.done : i === stepIndex && stage !== "done" ? styles.current : ""
              }`}
            />
            <span className={`${styles.stepLabel} ${i <= stepIndex && stage !== "done" ? styles.active : ""}`}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {stage === "diagnose" && (
        <div className={styles.diagnoseCard}>
          {diagLoading && <p className={styles.diagnoseTag}>Preparing your diagnostic…</p>}

          {!diagLoading && diagError && (
            <>
              <p className={styles.diagnoseTag}>Couldn't load the diagnostic</p>
              <h2 className={styles.diagnosePrompt}>{diagError}</h2>
              <div className={styles.continueRow}>
                <button type="button" className={styles.continueButton} onClick={handleSkipDiagnose}>
                  Skip to the explanation
                  <ArrowIcon size={14} />
                </button>
              </div>
            </>
          )}

          {!diagLoading && !diagError && diagQuestions && diagQuestions.length === 0 && (
            <>
              <h2 className={styles.diagnosePrompt}>No diagnostic questions available for this topic yet.</h2>
              <div className={styles.continueRow}>
                <button type="button" className={styles.continueButton} onClick={handleSkipDiagnose}>
                  Continue
                  <ArrowIcon size={14} />
                </button>
              </div>
            </>
          )}

          {!diagLoading && !diagError && diagQuestions && diagQuestions.length > 0 && (
            <>
              <div className={styles.diagnoseDots}>
                {diagQuestions.map((_, i) => (
                  <span key={i} className={`${styles.diagnoseDot} ${i <= diagIdx ? styles.diagnoseDotActive : ""}`} />
                ))}
              </div>
              <p className={styles.diagnoseTag}>
                Diagnostic {diagIdx + 1} / {diagQuestions.length}
              </p>
              <h2 className={styles.diagnosePrompt}>{diagQuestions[diagIdx].text}</h2>
              <div className={styles.diagnoseOptions}>
                {diagQuestions[diagIdx].options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={styles.diagnoseOption}
                    onClick={() => handleDiagnoseSelect(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {stage === "diagnose-summary" && (
        <div className={styles.diagnoseCard}>
          <p className={styles.diagnoseTag}>Starting Point{diagScore ? ` · ${diagScore} correct` : ""}</p>
          <h2 className={styles.diagnosePrompt}>{diagSummary.headline}</h2>
          <p className={styles.summaryHint}>{diagSummary.sub}</p>
          <div className={styles.continueRow}>
            <button type="button" className={styles.continueButton} onClick={handleDiagnoseSummaryContinue}>
              Continue
              <ArrowIcon size={14} />
            </button>
          </div>
        </div>
      )}

      <div className={styles.chat}>
        {messages.map((m) => {
          const kind = m.role === "tutor" ? messageKind(m.tag) : null;
          const KindIcon = kind ? KIND_ICON[kind] : null;
          return (
          <div key={m.id} className={`${styles.bubbleRow} ${m.role === "user" ? styles.user : ""}`}>
            <div className={`${styles.bubble} ${kind ? styles[`kind_${kind}`] : ""}`}>
              {m.tag && (
                <div className={styles.bubbleTag}>
                  {KindIcon && <KindIcon size={12} />}
                  {m.tag}
                </div>
              )}
              {m.diagram && <MermaidDiagram code={m.diagram} />}
              {m.paragraphs.map((p, i) =>
                m.role === "tutor" ? (
                  <TutorMarkdown
                    key={i}
                    text={p}
                    citations={m.citations}
                    messageId={m.id}
                    expandedCitations={expandedCitations}
                    onToggleCitation={toggleCitation}
                    citeChipClassName={styles.citeChip}
                    citeChipOpenClassName={styles.citeChipOpen}
                  />
                ) : (
                  <p key={i}>{p}</p>
                )
              )}
              {m.citations
                ?.filter((c) => expandedCitations.has(`${m.id}:${c.mark}`))
                .map((c) => (
                  <div key={c.mark} className={styles.citationSnippet}>
                    <p className={styles.citationSnippetSource}>{c.source}</p>
                    <p className={styles.citationSnippetExcerpt}>{c.excerpt}</p>
                  </div>
                ))}
            </div>
          </div>
          );
        })}

        {(stage === "thinking-explain" || stage === "thinking-retry-explain") && (
          <ThinkingIndicator label="Grounding an explanation…" />
        )}
        {(stage === "checking" || stage === "retry-checking") && <ThinkingIndicator label="Checking…" />}
      </div>

      {stage === "explain-shown" && (
        <div className={styles.continueRow}>
          <button type="button" className={styles.continueButton} onClick={handleContinueToCheck}>
            I understand — check me
            <ArrowIcon size={14} />
          </button>
        </div>
      )}

      {stage === "retry-shown" && (
        <>
          <div className={styles.nudgeCard}>
            <span className={styles.nudgeIcon}>
              <RefreshIcon size={16} />
            </span>
            <div className={styles.nudgeText}>
              <p>Not quite there yet — that&apos;s normal.</p>
              <p>One more pass, from a different angle, usually does it.</p>
            </div>
          </div>
          <div className={styles.continueRow}>
            <button type="button" className={styles.continueButton} onClick={handleContinueToRetryCheck}>
              Try a different approach
              <ArrowIcon size={14} />
            </button>
          </div>
        </>
      )}

      {stage === "check-ask" && (
        <div className={styles.composer}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Explain it in your own words — full sentences, not a guess from a list."
          />
          <div className={styles.composerFoot}>
            <span className={styles.composerHint}>Free response — explain in your own words</span>
            <button
              type="button"
              className={styles.continueButton}
              onClick={handleCheckSubmit}
              disabled={!input.trim()}
            >
              Send
              <ArrowIcon size={14} />
            </button>
          </div>
        </div>
      )}

      {stage === "retry-check-ask" && (
        <div className={styles.composer}>
          {STEP_PROMPTS.map((label, i) => (
            <div key={i} className={styles.stepInputRow}>
              <label className={styles.stepInputLabel}>
                Step {i + 1} — {label}
              </label>
              <textarea
                className={styles.stepInputArea}
                value={stepAnswers[i]}
                onChange={(e) => {
                  const next = [...stepAnswers];
                  next[i] = e.target.value;
                  setStepAnswers(next);
                }}
                placeholder="Type this step..."
              />
            </div>
          ))}
          <div className={styles.composerFoot}>
            <span className={styles.composerHint}>Free response — solve it step by step</span>
            <button
              type="button"
              className={styles.continueButton}
              onClick={handleRetryCheckSubmit}
              disabled={stepAnswers.some((a) => !a.trim())}
            >
              Send
              <ArrowIcon size={14} />
            </button>
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className={styles.resultCard}>
          <Confetti />
          <div className={styles.resultIcon}>
            <CheckIcon size={22} />
          </div>
          <h2>Topic mastered</h2>
          <p>
            {topic.name} is locked in. The next topic in {subject.name} is now open.
          </p>
          <div className={styles.resultActions}>
            <Link href={`/subject/${subject.id}`} className={styles.resultButton}>
              Back to {subject.name}
              <ArrowIcon size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
