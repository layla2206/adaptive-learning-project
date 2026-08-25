"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Subject, TopicState } from "./types";
import { initialSubjects, userProfile } from "./data";

const STORAGE_KEY = "tutor-subjects-v2";

function isValidSubjects(value: unknown): value is Subject[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        s &&
        typeof s === "object" &&
        typeof (s as Subject).building === "string" &&
        Array.isArray((s as Subject).topics)
    )
  );
}

interface StoreValue {
  subjects: Subject[];
  userName: string;
  getSubject: (subjectId: string) => Subject | undefined;
  getTopic: (subjectId: string, topicId: string) => { subject: Subject; topicIndex: number } | undefined;
  setTopicProgress: (subjectId: string, topicId: string, pct: number) => void;
  markTopicMastered: (subjectId: string, topicId: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function TutorStoreProvider({ children }: { children: ReactNode }) {
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One-time sync from localStorage after mount — must run after the SSR-matching
    // first render, so this can't be a lazy useState initializer instead.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isValidSubjects(parsed)) setSubjects(parsed);
    } catch {
      /* ignore malformed/unavailable storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
    } catch {
      /* ignore unavailable storage */
    }
  }, [subjects, hydrated]);

  function getSubject(subjectId: string) {
    return subjects.find((s) => s.id === subjectId);
  }

  function getTopic(subjectId: string, topicId: string) {
    const subject = getSubject(subjectId);
    if (!subject) return undefined;
    const topicIndex = subject.topics.findIndex((t) => t.id === topicId);
    if (topicIndex === -1) return undefined;
    return { subject, topicIndex };
  }

  function setTopicProgress(subjectId: string, topicId: string, pct: number) {
    setSubjects((prev) =>
      prev.map((s) =>
        s.id !== subjectId
          ? s
          : {
              ...s,
              topics: s.topics.map((t) =>
                t.id === topicId
                  ? {
                      ...t,
                      state: (t.state === "locked" ? "in-progress" : t.state) as TopicState,
                      progressPct: Math.max(t.progressPct, pct),
                    }
                  : t
              ),
            }
      )
    );
  }

  function markTopicMastered(subjectId: string, topicId: string) {
    setSubjects((prev) =>
      prev.map((s) => {
        if (s.id !== subjectId) return s;
        const idx = s.topics.findIndex((t) => t.id === topicId);
        return {
          ...s,
          topics: s.topics.map((t, i) => {
            if (i === idx) return { ...t, state: "mastered" as TopicState, progressPct: 100 };
            if (i === idx + 1 && t.state === "locked") {
              return { ...t, state: "in-progress" as TopicState, progressPct: 0 };
            }
            return t;
          }),
        };
      })
    );
  }

  return (
    <StoreContext.Provider
      value={{
        subjects,
        userName: userProfile.name,
        getSubject,
        getTopic,
        setTopicProgress,
        markTopicMastered,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useTutorStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useTutorStore must be used within TutorStoreProvider");
  return ctx;
}
