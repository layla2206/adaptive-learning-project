"use client";

import { useEffect, useRef, useState } from "react";
import type { Subject } from "@/lib/types";
import { masteredCount } from "@/lib/utils";
import Confetti from "@/components/Confetti";
import Palace from "./Palace";
import MilestonePath from "./MilestonePath";
import styles from "./MilestoneScene.module.css";

const GOLD = "#F5C542";
const CONFETTI_DELAY_MS = 450;
const CONFETTI_DURATION_MS = 1400;
const FANFARE_CONFETTI_DURATION_MS = 2400;

interface MilestoneSceneProps {
  subject: Subject;
  celebrateIndex: number;
  justCompletedSubject: boolean;
}

export default function MilestoneScene({ subject, celebrateIndex, justCompletedSubject }: MilestoneSceneProps) {
  const litCount = masteredCount(subject);
  const total = subject.topics.length;

  const [showConfetti, setShowConfetti] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const confettiSize = justCompletedSubject ? 60 : 30;

  // Plain timer effect reacting to celebrateIndex — safe to double-invoke as-is: Strict
  // Mode's synchronous cleanup clears the first pair of timers and the immediate
  // re-run schedules a fresh pair that fires normally.
  useEffect(() => {
    if (celebrateIndex < 0) return;
    const duration = justCompletedSubject ? FANFARE_CONFETTI_DURATION_MS : CONFETTI_DURATION_MS;
    const onTimer = setTimeout(() => setShowConfetti(true), CONFETTI_DELAY_MS);
    const offTimer = setTimeout(() => setShowConfetti(false), CONFETTI_DELAY_MS + duration);
    return () => {
      clearTimeout(onTimer);
      clearTimeout(offTimer);
    };
  }, [celebrateIndex, justCompletedSubject]);

  // Arriving right after a mastery: make sure the palace end of the path is in view so
  // the ignite isn't missed if the map is wider than the viewport.
  useEffect(() => {
    if (celebrateIndex < 0 || !scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [celebrateIndex]);

  return (
    <div className={styles.scene} ref={scrollRef}>
      {showConfetti && <Confetti count={confettiSize} />}
      <div className={styles.row}>
        <div className={styles.pathWrap}>
          <MilestonePath subjectId={subject.id} topics={subject.topics} />
        </div>
        <div className={styles.palaceWrap}>
          <Palace
            building={subject.building}
            litCount={litCount}
            total={total}
            accent={GOLD}
            celebrateIndex={celebrateIndex}
            fanfare={justCompletedSubject}
          />
        </div>
      </div>
    </div>
  );
}
