"use client";

import { useState, type CSSProperties } from "react";
import styles from "./Confetti.module.css";

const COLORS = ["var(--plum)", "var(--plum-deep)", "#f5c542", "var(--ink)"];

interface Piece {
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
  drift: number;
  width: number;
  height: number;
}

export default function Confetti({ count = 30 }: { count?: number }) {
  // Randomness belongs in one-time initial state, not a memo — a memo is expected to
  // be a pure recomputation of its inputs, which Math.random() can never satisfy.
  const [pieces] = useState<Piece[]>(() =>
    Array.from({ length: count }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1 + Math.random() * 0.8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotate: 180 + Math.random() * 360,
      drift: (Math.random() - 0.5) * 90,
      width: 5 + Math.random() * 5,
      height: 3 + Math.random() * 5,
    }))
  );

  return (
    <div className={styles.field} aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={styles.piece}
          style={
            {
              left: `${p.left}%`,
              width: p.width,
              height: p.height,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--rot": `${p.rotate}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
