"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTutorStore } from "@/lib/store";
import { getSession } from "@/lib/session";
import AppHeader from "@/components/AppHeader";
import { ArrowIcon } from "@/components/icons";
import styles from "../page.module.css";

interface BuddyMessage {
  id: string;
  sender: "student" | "ai";
  text: string;
}

let msgId = 0;
function nextId() {
  msgId += 1;
  return `pb${msgId}`;
}

export default function PeerBuddyPage() {
  const params = useParams<{ subjectId: string; topicId: string }>();
  const { subjects, userName, loading } = useTutorStore();
  const subject = subjects.find((s) => s.id === params.subjectId);
  const topic = subject?.topics.find((t) => t.id === params.topicId);

  const [messages, setMessages] = useState<BuddyMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [capped, setCapped] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    async function loadHistory() {
      const session = getSession();
      if (!session) {
        setHistoryLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/peer-buddy/history?topicId=${topic!.id}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const data = await response.json();
        if (cancelled) return;
        if (response.ok && data.sessionId) {
          setSessionId(data.sessionId);
          setMessages(
            (data.messages ?? []).map((m: { sender: "student" | "ai"; text: string; capped?: boolean }) => ({
              id: nextId(),
              sender: m.sender,
              text: m.text,
            }))
          );
          if ((data.messages ?? []).some((m: { capped?: boolean }) => m.capped)) setCapped(true);
        }
      } catch {
        // Start fresh if history can't be loaded.
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [topic?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  async function handleSend() {
    if (!input.trim() || sending || capped || !topic) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { id: nextId(), sender: "student", text }]);
    setSending(true);

    const session = getSession();
    if (!session) {
      setSending(false);
      return;
    }
    try {
      const response = await fetch("/api/peer-buddy/message", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ topicId: topic.id, sessionId: sessionId ?? undefined, studentMessage: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");
      if (data.sessionId) setSessionId(data.sessionId);
      setMessages((prev) => [...prev, { id: nextId(), sender: "ai", text: data.reply }]);
      if (data.capped) setCapped(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), sender: "ai", text: "Something went wrong — try again in a moment." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`shell ${styles.page}`}>
      <AppHeader
        eyebrow="Explain it to a friend"
        title={topic.name}
        userName={userName}
        backHref={`/subject/${subject.id}/topic/${topic.id}`}
        backLabel={topic.name}
      />

      {historyLoading && (
        <div className={styles.diagnoseCard}>
          <p className={styles.diagnoseTag}>Getting your friend up to speed…</p>
        </div>
      )}

      {!historyLoading && messages.length === 0 && (
        <div className={styles.diagnoseCard}>
          <p className={styles.diagnoseTag}>Peer Buddy</p>
          <h2 className={styles.diagnosePrompt}>
            Your friend just missed the {topic.name} lecture and needs you to explain it. Say hi and start walking
            them through it — full sentences, like you&apos;re actually talking to them.
          </h2>
        </div>
      )}

      <div className={styles.chat}>
        {messages.map((m) => (
          <div key={m.id} className={`${styles.bubbleRow} ${m.sender === "student" ? styles.user : ""}`}>
            <div className={styles.bubble}>
              <p>{m.text}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {capped ? (
        <div className={styles.nudgeCard}>
          <div className={styles.nudgeText}>
            <p>That&apos;s a wrap for this conversation.</p>
            <p>Come back anytime to explain it again, or from the start with a fresh angle.</p>
          </div>
        </div>
      ) : (
        <div className={styles.composer}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Explain it to them, in your own words…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className={styles.composerFoot}>
            <span className={styles.composerHint}>Casual chat — no citations, just talk it through</span>
            <button type="button" className={styles.continueButton} onClick={handleSend} disabled={!input.trim() || sending}>
              Send
              <ArrowIcon size={14} />
            </button>
          </div>
        </div>
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
