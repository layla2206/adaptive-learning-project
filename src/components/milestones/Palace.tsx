"use client";

import { useEffect, useState } from "react";
import type { BuildingKind } from "@/lib/types";
import { diamondPoints, hexagonPoints, windowGrid, SCENE_WIDTH, PALACE_HEIGHT } from "./geometry";
import { playIgniteDing, playFanfare } from "@/lib/sound";
import styles from "./Palace.module.css";

type WindowShape = "rect" | "hex" | "diamond";

interface PalaceProps {
  building: BuildingKind;
  litCount: number;
  total: number;
  accent: string;
  /** Index of a window that just got lit — plays a delayed ignite animation instead of appearing lit instantly. */
  celebrateIndex?: number;
  /** This ignite is also the one that completed the whole subject — plays the bigger "full palace" moment. */
  fanfare?: boolean;
}

interface BuildingProps {
  litCount: number;
  total: number;
  accent: string;
  igniteIndex: number;
}

function Window({
  x,
  y,
  size,
  lit,
  accent,
  shape,
  igniting,
}: {
  x: number;
  y: number;
  size: number;
  lit: boolean;
  accent: string;
  shape: WindowShape;
  igniting: boolean;
}) {
  const cls = lit ? styles.windowLit : styles.windowLocked;
  const style = lit ? { fill: accent, filter: `drop-shadow(0 0 5px ${accent})` } : undefined;

  const shapeEl =
    shape === "diamond" ? (
      <polygon points={diamondPoints(x, y, size)} className={cls} style={style} />
    ) : shape === "hex" ? (
      <polygon points={hexagonPoints(x, y, size / 1.7)} className={cls} style={style} />
    ) : (
      <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={2} className={cls} style={style} />
    );

  if (!igniting) return shapeEl;

  return (
    <g style={{ transformOrigin: `${x}px ${y}px` }} className={styles.ignitePop}>
      <circle cx={x} cy={y} r={size * 0.6} className={styles.igniteRing} style={{ stroke: accent }} />
      {shapeEl}
    </g>
  );
}

function Windows({
  total,
  litCount,
  box,
  cols,
  shape,
  size,
  accent,
  igniteIndex,
}: {
  total: number;
  litCount: number;
  box: { x: number; y: number; width: number; height: number };
  cols: number;
  shape: WindowShape;
  size: number;
  accent: string;
  igniteIndex: number;
}) {
  const positions = windowGrid(total, box, cols);
  return (
    <>
      {positions.map((p, i) => (
        <Window
          key={i}
          x={p.x}
          y={p.y}
          size={size}
          lit={i < litCount}
          accent={accent}
          shape={shape}
          igniting={i === igniteIndex}
        />
      ))}
    </>
  );
}

function Citadel({ litCount, total, accent, igniteIndex }: BuildingProps) {
  const cols = total > 4 ? 3 : 2;
  return (
    <g>
      {/* corner turrets */}
      <rect x={78} y={90} width={26} height={130} className={styles.structure} />
      <polygon points="78,90 91,66 104,90" className={styles.structure} />
      <rect x={256} y={90} width={26} height={130} className={styles.structure} />
      <polygon points="256,90 269,66 282,90" className={styles.structure} />

      {/* main keep */}
      <rect x={104} y={60} width={152} height={160} className={styles.structure} />
      {/* crenellations */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={110 + i * 30} y={44} width={16} height={18} className={styles.structure} />
      ))}

      <Windows
        total={total}
        litCount={litCount}
        box={{ x: 118, y: 96, width: 124, height: 108 }}
        cols={cols}
        shape="rect"
        size={20}
        accent={accent}
        igniteIndex={igniteIndex}
      />
    </g>
  );
}

function Observatory({ litCount, total, accent, igniteIndex }: BuildingProps) {
  const cols = total > 4 ? 3 : 2;
  return (
    <g>
      <rect x={128} y={112} width={104} height={108} className={styles.structure} />
      <path d="M128,112 A52,68 0 0 1 232,112 Z" className={styles.structure} />
      <line x1={180} y1={44} x2={180} y2={80} className={styles.structureLine} />
      <rect x={172} y={72} width={16} height={40} className={styles.structure} />

      <Windows
        total={total}
        litCount={litCount}
        box={{ x: 140, y: 134, width: 80, height: 78 }}
        cols={cols}
        shape="rect"
        size={18}
        accent={accent}
        igniteIndex={igniteIndex}
      />
    </g>
  );
}

function Crystal({ litCount, total, accent, igniteIndex }: BuildingProps) {
  const cols = total > 4 ? 3 : 2;
  return (
    <g>
      <polygon
        points="180,42 236,104 220,208 180,236 140,208 124,104"
        className={styles.structure}
      />
      <line x1={180} y1={42} x2={180} y2={236} className={styles.structureFacet} />
      <line x1={124} y1={104} x2={236} y2={104} className={styles.structureFacet} />
      <line x1={180} y1={42} x2={124} y2={104} className={styles.structureFacet} />
      <line x1={180} y1={42} x2={236} y2={104} className={styles.structureFacet} />

      <Windows
        total={total}
        litCount={litCount}
        box={{ x: 142, y: 112, width: 76, height: 100 }}
        cols={cols}
        shape="diamond"
        size={22}
        accent={accent}
        igniteIndex={igniteIndex}
      />
    </g>
  );
}

function HexTower({ litCount, total, accent, igniteIndex }: BuildingProps) {
  const cols = total > 4 ? 3 : 2;
  return (
    <g>
      <polygon points={hexagonPoints(180, 84, 46)} className={styles.structure} />
      <polygon points={hexagonPoints(180, 168, 76)} className={styles.structure} />

      <Windows
        total={total}
        litCount={litCount}
        box={{ x: 132, y: 128, width: 96, height: 82 }}
        cols={cols}
        shape="hex"
        size={20}
        accent={accent}
        igniteIndex={igniteIndex}
      />
    </g>
  );
}

const BUILDINGS: Record<BuildingKind, typeof Citadel> = {
  citadel: Citadel,
  observatory: Observatory,
  crystal: Crystal,
  hextower: HexTower,
};

const IGNITE_DELAY_MS = 450;
const IGNITE_DURATION_MS = 850;
const FANFARE_EXTRA_MS = 500;

export default function Palace({
  building,
  litCount,
  total,
  accent,
  celebrateIndex = -1,
  fanfare = false,
}: PalaceProps) {
  const BuildingComponent = BUILDINGS[building] ?? Citadel;

  // celebrateIndex arrives as a prop one render after Palace mounts (the parent resolves
  // it from sessionStorage in its own effect), so this reacts to the prop directly rather
  // than freezing a value at mount — otherwise the animation would silently never fire.
  // Plain timer effect, no ref guard: it's naturally safe to double-invoke — Strict
  // Mode's synchronous cleanup clears the first pair of timers and the immediate
  // re-run schedules a fresh pair that fires normally.
  const [igniteIndex, setIgniteIndex] = useState(-1);
  const [completedIndex, setCompletedIndex] = useState(-1);
  const [fanfareActive, setFanfareActive] = useState(false);

  useEffect(() => {
    if (celebrateIndex < 0) return;
    const fanfareDuration = fanfare ? IGNITE_DURATION_MS + FANFARE_EXTRA_MS : IGNITE_DURATION_MS;
    const onTimer = setTimeout(() => {
      setIgniteIndex(celebrateIndex);
      if (fanfare) {
        setFanfareActive(true);
        playFanfare();
      } else {
        playIgniteDing();
      }
    }, IGNITE_DELAY_MS);
    const offTimer = setTimeout(() => {
      setIgniteIndex(-1);
      setCompletedIndex(celebrateIndex);
      setFanfareActive(false);
    }, IGNITE_DELAY_MS + fanfareDuration);
    return () => {
      clearTimeout(onTimer);
      clearTimeout(offTimer);
    };
  }, [celebrateIndex, fanfare]);

  // Hold the celebrated window back until it has ignited (or finished igniting) at least
  // once — purely derived, no extra synchronous state needed.
  const isPending = celebrateIndex >= 0 && igniteIndex !== celebrateIndex && completedIndex !== celebrateIndex;
  const revealed = isPending ? Math.max(0, litCount - 1) : litCount;

  // The building art has generous dead margin on each side of its own coordinate space
  // (drawn on a wide shared canvas); crop the viewBox to the content's real bounds so it
  // fills its box tightly instead of floating with a big gap toward the path.
  const cropX = 70;
  const cropWidth = SCENE_WIDTH - cropX * 2;

  return (
    <svg
      viewBox={`${cropX} 0 ${cropWidth} ${PALACE_HEIGHT}`}
      width="100%"
      height={PALACE_HEIGHT}
      style={{ display: "block", overflow: "visible" }}
    >
      <BuildingComponent litCount={revealed} total={total} accent={accent} igniteIndex={igniteIndex} />
      {fanfareActive && (
        <>
          <circle
            cx={SCENE_WIDTH / 2}
            cy={PALACE_HEIGHT / 2}
            r={70}
            className={styles.fanfareRing}
            style={{ stroke: accent }}
          />
          <circle
            cx={SCENE_WIDTH / 2}
            cy={PALACE_HEIGHT / 2}
            r={70}
            className={styles.fanfareRingDelayed}
            style={{ stroke: accent }}
          />
        </>
      )}
    </svg>
  );
}
