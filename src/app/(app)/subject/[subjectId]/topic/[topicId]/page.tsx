"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTutorStore } from "@/lib/store";
import { announceMastery } from "@/lib/milestoneAnnounce";
import AppHeader from "@/components/AppHeader";
import Confetti from "@/components/Confetti";
import { ArrowIcon, CheckIcon, RefreshIcon } from "@/components/icons";
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
}

const BASE_STEPS = ["Diagnose", "Explain", "Check"];
const THINKING_MS = 900;

const DIAGNOSE_QUESTIONS = [
  { prompt: (topic: string) => `Have you worked with ${topic} before?`, options: ["Never", "A little", "Pretty comfortable"] },
  { prompt: () => "How confident do you feel about it right now?", options: ["Not confident", "Somewhat", "Fairly confident"] },
];

const STEP_PROMPTS = [
  "What do you start from?",
  "What rule or operation do you apply?",
  "What's the result, and how do you know it's right?",
];

function summarizeDiagnostic(answers: string[]): { headline: string; sub: string } {
  const score = answers.reduce((sum, ans, i) => {
    const idx = DIAGNOSE_QUESTIONS[i]?.options.indexOf(ans) ?? -1;
    return sum + Math.max(idx, 0);
  }, 0);
  if (score >= 3) return { headline: "Starting from a solid base.", sub: "We'll move quickly through the fundamentals and spend more time on the edge cases." };
  if (score >= 1) return { headline: "Starting with some familiarity.", sub: "We'll ground the parts you've half-seen before and build from there." };
  return { headline: "Starting fresh — exactly what this step is for.", sub: "No assumptions — the explanation will build the idea from the ground up." };
}

let msgId = 0;
function nextId() {
  msgId += 1;
  return `m${msgId}`;
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
  const { subjects, userName, markTopicMastered, setTopicProgress } = useTutorStore();
  const subject = subjects.find((s) => s.id === params.subjectId);
  const topic = subject?.topics.find((t) => t.id === params.topicId);

  const [stage, setStage] = useState<Stage>("diagnose");
  const [diagIdx, setDiagIdx] = useState(0);
  const [diagAnswers, setDiagAnswers] = useState<string[]>([]);
  const [hasRetried, setHasRetried] = useState(false);
  const [input, setInput] = useState("");
  const [stepAnswers, setStepAnswers] = useState(["", "", ""]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());

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
    const nextAnswers = [...diagAnswers, option];
    setDiagAnswers(nextAnswers);
    if (diagIdx + 1 < DIAGNOSE_QUESTIONS.length) {
      setDiagIdx(diagIdx + 1);
      return;
    }
    setStage("diagnose-summary");
  }

  function handleDiagnoseSummaryContinue() {
    if (!topic || !subject) return;
    setTopicProgress(subject.id, topic.id, 30);
    setStage("thinking-explain");
    setTimeout(() => {
      pushMessage({
        role: "tutor",
        tag: "Grounded Explanation",
        paragraphs: [
          `Good starting point. Here's the core idea behind ${topic.name}, tied to where your answers landed ${"[1]"}.`,
          `The key mechanism is how each step depends only on the result of the step before it — which is exactly the part most explanations skip over ${"[2]"}. Once that clicks, the rest is mostly bookkeeping.`,
        ],
        citations: [
          { mark: "[1]", source: "Lecture 4 · Slide 12", excerpt: `"A ${topic.name.toLowerCase()} node's identity is independent of its position in the drawing — only the connections matter for structure."` },
          { mark: "[2]", source: `${subject.name} Course Notes, §2`, excerpt: "\"Each step reads only the state produced by the step before it — there's no lookahead in the base case.\"" },
        ],
      });
      setStage("explain-shown");
    }, THINKING_MS);
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

  function handleCheckSubmit() {
    if (!input.trim() || !topic || !subject) return;
    const answer = input.trim();
    pushMessage({ role: "user", paragraphs: [answer] });
    setInput("");
    setStage("checking");

    setTimeout(() => {
      if (answer.length >= 15) {
        pushMessage({
          role: "tutor",
          tag: "Result",
          paragraphs: [`That's a solid, specific explanation of ${topic.name} — you've got it.`],
        });
        markTopicMastered(subject.id, topic.id);
        announceMastery(subject.id, topic.id);
        setStage("done");
        return;
      }

      setHasRetried(true);
      setTopicProgress(subject.id, topic.id, 70);
      setStage("thinking-retry-explain");
      setTimeout(() => {
        pushMessage({
          role: "tutor",
          tag: "Alternate Explanation",
          paragraphs: [
            `Let's come at this from a different angle — here's a worked example instead of the abstract version ${"[1]"}.`,
            `Walk through it step by step: start from what you already know is true, apply the rule for ${topic.name} once, and check that the result still makes sense before moving on ${"[2]"}. That's the whole pattern, just repeated.`,
          ],
          citations: [
            { mark: "[1]", source: `${topic.name} — Worked Examples`, excerpt: "\"Example 3 walks the same pattern with concrete values substituted at each step.\"" },
            { mark: "[2]", source: `${subject.name} Course Notes, §3`, excerpt: "\"Checking the result against the invariant is what separates a correct step from a lucky one.\"" },
          ],
        });
        setStage("retry-shown");
      }, THINKING_MS);
    }, THINKING_MS);
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

  function handleRetryCheckSubmit() {
    if (!topic || !subject || stepAnswers.some((a) => !a.trim())) return;
    pushMessage({
      role: "user",
      paragraphs: stepAnswers.map((a, i) => `Step ${i + 1}: ${a.trim()}`),
    });
    setStepAnswers(["", "", ""]);
    setStage("retry-checking");

    setTimeout(() => {
      pushMessage({
        role: "tutor",
        tag: "Result",
        paragraphs: [`Walked through cleanly — that's a mastered understanding of ${topic.name}.`],
      });
      markTopicMastered(subject.id, topic.id);
      announceMastery(subject.id, topic.id);
      setStage("done");
    }, THINKING_MS);
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

  function renderCite(text: string, citations: Citation[] | undefined, messageId: string) {
    const parts = text.split(/(\[\d\])/g);
    return parts.map((part, i) => {
      const citation = /^\[\d\]$/.test(part) ? citations?.find((c) => c.mark === part) : undefined;
      if (citation) {
        const key = `${messageId}:${citation.mark}`;
        const isOpen = expandedCitations.has(key);
        return (
          <button
            key={i}
            type="button"
            className={`${styles.citeChip} ${isOpen ? styles.citeChipOpen : ""}`}
            onClick={() => toggleCitation(key)}
            aria-expanded={isOpen}
          >
            {part}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  const diagSummary = summarizeDiagnostic(diagAnswers);

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
          <div className={styles.diagnoseDots}>
            {DIAGNOSE_QUESTIONS.map((_, i) => (
              <span key={i} className={`${styles.diagnoseDot} ${i <= diagIdx ? styles.diagnoseDotActive : ""}`} />
            ))}
          </div>
          <p className={styles.diagnoseTag}>
            Diagnostic {diagIdx + 1} / {DIAGNOSE_QUESTIONS.length}
          </p>
          <h2 className={styles.diagnosePrompt}>{DIAGNOSE_QUESTIONS[diagIdx].prompt(topic.name)}</h2>
          <div className={styles.diagnoseOptions}>
            {DIAGNOSE_QUESTIONS[diagIdx].options.map((opt) => (
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
        </div>
      )}

      {stage === "diagnose-summary" && (
        <div className={styles.diagnoseCard}>
          <p className={styles.diagnoseTag}>Starting Point</p>
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
        {messages.map((m) => (
          <div key={m.id} className={`${styles.bubbleRow} ${m.role === "user" ? styles.user : ""}`}>
            <div className={styles.bubble}>
              {m.tag && <div className={styles.bubbleTag}>{m.tag}</div>}
              {m.paragraphs.map((p, i) => (
                <p key={i}>{renderCite(p, m.citations, m.id)}</p>
              ))}
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
        ))}

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
