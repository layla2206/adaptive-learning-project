import { useEffect, useRef, useState } from "react";
import type { Subject } from "./types";

const KEY = "milestone:justLit";
const FRESH_WINDOW_MS = 5 * 60 * 1000;

interface Announcement {
  subjectId: string;
  topicId: string;
  ts: number;
}

/** Called right when a topic is mastered, so the subject page can play the ignite/confetti moment on arrival. */
export function announceMastery(subjectId: string, topicId: string) {
  try {
    const payload: Announcement = { subjectId, topicId, ts: Date.now() };
    window.sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore unavailable storage */
  }
}

/** Reads and clears a pending announcement for this subject, if any. Consumed exactly once. */
export function consumeMasteryAnnouncement(subjectId: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);

    const data = JSON.parse(raw) as Announcement;
    const fresh = Date.now() - data.ts < FRESH_WINDOW_MS;
    if (fresh && data.subjectId === subjectId) return data.topicId;
    return null;
  } catch {
    return null;
  }
}

export interface MasteryCelebration {
  /** Index of the just-mastered topic within subject.topics, or -1 if nothing to celebrate. */
  celebrateIndex: number;
  /** This arrival's mastery was also the one that completed every topic in the subject. */
  justCompletedSubject: boolean;
}

/**
 * Resolves (once) whether this page load is an arrival right after mastering a topic in
 * this subject, for the palace ignite / confetti / badge-unlock celebration. Call this
 * once per subject page and pass the result down — don't duplicate the sessionStorage
 * read in multiple places.
 */
export function useMasteryCelebration(subject: Subject | undefined): MasteryCelebration {
  const [celebrateTopicId, setCelebrateTopicId] = useState<string | null>(null);
  const consumedForRef = useRef<string | null>(null);
  const subjectId = subject?.id;

  useEffect(() => {
    if (!subjectId || consumedForRef.current === subjectId) return;
    consumedForRef.current = subjectId;
    const topicId = consumeMasteryAnnouncement(subjectId);
    setCelebrateTopicId(topicId);
  }, [subjectId]);

  const celebrateIndex =
    subject && celebrateTopicId ? subject.topics.findIndex((t) => t.id === celebrateTopicId) : -1;
  const justCompletedSubject =
    celebrateIndex >= 0 && !!subject && subject.topics.every((t) => t.state === "mastered");

  return { celebrateIndex, justCompletedSubject };
}
