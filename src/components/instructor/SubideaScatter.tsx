"use client";

import { useState } from "react";
import type { SubideaSignal } from "@/lib/instructorData";
import { bandFor } from "@/lib/subideaBands";
import styles from "./SubideaScatter.module.css";

const VB_W = 480;
const VB_H = 220;
const PAD = { top: 14, right: 16, bottom: 30, left: 36 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

function radiusFor(gapCount: number) {
  return 8 + Math.min(gapCount, 4) * 3;
}

/** Score (x) vs follow-up count (y), bubble size = gapCount -- the three
 * signals from subideaInsights.ts plotted together without blending them
 * into one number. Quadrant reading: low score + high follow-ups (top-left)
 * is "students are confused and say so"; low score + low follow-ups
 * (bottom-left) is the more urgent, silent-confusion case. Only sub-ideas
 * with at least one graded attempt are plottable -- score is undefined
 * without one. */
export default function SubideaScatter({ signals }: { signals: SubideaSignal[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const points = signals.filter((s) => s.scoreAttempts > 0);
  const maxFollowUps = Math.max(1, ...points.map((s) => s.followUpCount));
  const avgFollowUps = points.reduce((sum, s) => sum + s.followUpCount, 0) / points.length;

  const xScale = (score: number) => PAD.left + (Math.max(0, Math.min(100, score)) / 100) * PLOT_W;
  const yScale = (count: number) => PAD.top + PLOT_H - (Math.min(count, maxFollowUps) / maxFollowUps) * PLOT_H;

  const xTicks = [0, 50, 100];
  const yTicks = maxFollowUps <= 4 ? Array.from({ length: maxFollowUps + 1 }, (_, i) => i) : [0, Math.round(maxFollowUps / 2), maxFollowUps];

  const hovered = points.find((p) => p.subideaId === hoveredId) ?? null;

  return (
    <div className={styles.wrap}>
      <svg className={styles.svg} viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Understanding score versus follow-up questions per sub-idea">
        {/* gridlines */}
        {yTicks.map((t) => (
          <line key={`gy-${t}`} x1={PAD.left} x2={VB_W - PAD.right} y1={yScale(t)} y2={yScale(t)} className={styles.grid} />
        ))}
        {xTicks.map((t) => (
          <line key={`gx-${t}`} x1={xScale(t)} x2={xScale(t)} y1={PAD.top} y2={VB_H - PAD.bottom} className={styles.grid} />
        ))}

        {/* quadrant reference lines */}
        <line x1={xScale(50)} x2={xScale(50)} y1={PAD.top} y2={VB_H - PAD.bottom} className={styles.refLine} />
        <line x1={PAD.left} x2={VB_W - PAD.right} y1={yScale(avgFollowUps)} y2={yScale(avgFollowUps)} className={styles.refLine} />

        {/* axis ticks */}
        {xTicks.map((t) => (
          <text key={`xt-${t}`} x={xScale(t)} y={VB_H - PAD.bottom + 16} className={styles.tickLabel} textAnchor="middle">
            {t}%
          </text>
        ))}
        {yTicks.map((t) => (
          <text key={`yt-${t}`} x={PAD.left - 8} y={yScale(t) + 3} className={styles.tickLabel} textAnchor="end">
            {t}
          </text>
        ))}

        <text x={PAD.left} y={VB_H - 4} className={styles.axisTitle}>
          Understanding score →
        </text>
        <text x={12} y={VB_H / 2} className={styles.axisTitle} transform={`rotate(-90 12 ${VB_H / 2})`} textAnchor="middle">
          Follow-ups →
        </text>

        {/* points */}
        {points.map((p) => {
          const cx = xScale(p.avgUnderstandingScore);
          const cy = yScale(p.followUpCount);
          const r = radiusFor(p.gapCount);
          const band = bandFor(p.avgUnderstandingScore);
          const isHovered = hoveredId === p.subideaId;
          return (
            <g
              key={p.subideaId}
              tabIndex={0}
              role="img"
              aria-label={`${p.label}: ${Math.round(p.avgUnderstandingScore)} percent understanding, ${p.followUpCount} follow-up questions${p.gapCount > 0 ? `, ${p.gapCount} gap` : ""}`}
              className={styles.point}
              onMouseEnter={() => setHoveredId(p.subideaId)}
              onMouseLeave={() => setHoveredId((cur) => (cur === p.subideaId ? null : cur))}
              onFocus={() => setHoveredId(p.subideaId)}
              onBlur={() => setHoveredId((cur) => (cur === p.subideaId ? null : cur))}
            >
              {/* transparent hit target, bigger than the mark */}
              <circle cx={cx} cy={cy} r={Math.max(r, 14)} className={styles.hitArea} />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                className={`${styles.bubble} ${styles[band]} ${isHovered ? styles.bubbleHovered : ""} ${p.gapCount > 0 ? styles.bubbleGap : ""}`}
              />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className={styles.tooltip}
          style={{
            left: `${(xScale(hovered.avgUnderstandingScore) / VB_W) * 100}%`,
            top: `${(yScale(hovered.followUpCount) / VB_H) * 100}%`,
          }}
        >
          <p className={styles.tooltipLabel}>{hovered.label}</p>
          <p className={styles.tooltipRow}>
            <strong>{Math.round(hovered.avgUnderstandingScore)}%</strong> understanding (n={hovered.scoreAttempts})
          </p>
          <p className={styles.tooltipRow}>
            <strong>{hovered.followUpCount}</strong> follow-up question{hovered.followUpCount === 1 ? "" : "s"}
          </p>
          {hovered.gapCount > 0 && (
            <p className={styles.tooltipRow}>
              <strong>{hovered.gapCount}</strong> student{hovered.gapCount === 1 ? "" : "s"} hit a gap
            </p>
          )}
        </div>
      )}
    </div>
  );
}
