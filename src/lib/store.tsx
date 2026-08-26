"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { DayState, Subject, TopicState } from "./types";
import { getSession } from "./session";

interface DashboardResponse {
  userName: string;
  streakDays: number;
  totalXp: number;
  week: { label: string; state: DayState }[];
  subjects: Subject[];
}

interface StoreValue {
  subjects: Subject[];
  userName: string;
  streakDays: number;
  totalXp: number;
  week: { label: string; state: DayState }[];
  loading: boolean;
  getSubject: (subjectId: string) => Subject | undefined;
  getTopic: (subjectId: string, topicId: string) => { subject: Subject; topicIndex: number } | undefined;
  setTopicProgress: (subjectId: string, topicId: string, pct: number) => void;
  markTopicMastered: (subjectId: string, topicId: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);
const EMPTY_WEEK: { label: string; state: DayState }[] = [];

export function TutorStoreProvider({ children }: { children: ReactNode }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [userName, setUserName] = useState("");
  const [streakDays, setStreakDays] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [week, setWeek] = useState(EMPTY_WEEK);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    const session = getSession();
    if (!session || session.role !== "student") {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/student/dashboard", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) return;
      const data: DashboardResponse = await res.json();
      setSubjects(data.subjects);
      setUserName(data.userName);
      setStreakDays(data.streakDays);
      setTotalXp(data.totalXp);
      setWeek(data.week);
    } catch {
      /* leave existing state on a transient network failure */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(fetchDashboard);
    window.addEventListener("auth-session-change", fetchDashboard);
    return () => window.removeEventListener("auth-session-change", fetchDashboard);
  }, [fetchDashboard]);

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

    const session = getSession();
    if (!session) return;
    fetch("/api/student/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ topicId, progressPct: pct }),
    }).catch(() => {
      /* local state already reflects the change; retry isn't critical for this prototype */
    });
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

    const session = getSession();
    if (!session) return;
    fetch("/api/student/mastery", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ topicId }),
    })
      .then(() => fetchDashboard())
      .catch(() => {
        /* local state already reflects the change; refetch will reconcile next load */
      });
  }

  return (
    <StoreContext.Provider
      value={{
        subjects,
        userName,
        streakDays,
        totalXp,
        week,
        loading,
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
