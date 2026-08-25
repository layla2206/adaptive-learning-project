"use client";

import { useRouter } from "next/navigation";
import type { Topic } from "@/lib/types";
import { nodePositions, pathAreaWidth, entryPoint, PATH_ROW_HEIGHT } from "./geometry";
import { CheckIcon, ArrowIcon } from "@/components/icons";
import styles from "./MilestonePath.module.css";

const NODE_RADIUS = 21;

export default function MilestonePath({
  subjectId,
  topics,
}: {
  subjectId: string;
  topics: Topic[];
}) {
  const router = useRouter();
  const positions = nodePositions(topics.length);
  const width = pathAreaWidth(topics.length);
  const entry = entryPoint(topics.length);
  const allMastered = topics.length > 0 && topics.every((t) => t.state === "mastered");

  function openTopic(topicId: string) {
    router.push(`/subject/${subjectId}/topic/${topicId}`);
  }

  const currentIndex = topics.findIndex((t) => t.state === "in-progress");
  const last = positions[positions.length - 1];

  return (
    <div className={styles.wrap} style={{ width }}>
      <svg
        viewBox={`0 0 ${width} ${PATH_ROW_HEIGHT}`}
        width={width}
        height={PATH_ROW_HEIGHT}
        style={{ display: "block" }}
      >
        {positions.slice(0, -1).map((p, i) => {
          const next = positions[i + 1];
          const walked = topics[i].state === "mastered";
          return (
            <line
              key={i}
              x1={p.x}
              y1={p.y}
              x2={next.x}
              y2={next.y}
              className={`${styles.connector} ${walked ? styles.connectorDone : styles.connectorAhead}`}
            />
          );
        })}

        {/* Final stretch leading off the path's right edge, toward the palace's entrance. */}
        {last && (
          <line
            x1={last.x}
            y1={last.y}
            x2={entry.x}
            y2={entry.y}
            className={`${styles.connector} ${allMastered ? styles.connectorDone : styles.connectorAhead}`}
          />
        )}

        {positions.map((p, i) => {
          const topic = topics[i];
          const clickable = topic.state !== "locked";
          const nodeCls =
            topic.state === "mastered"
              ? styles.nodeDone
              : topic.state === "in-progress"
                ? styles.nodeCurrent
                : styles.nodeLocked;
          const numberCls =
            topic.state === "mastered"
              ? styles.numberDone
              : topic.state === "in-progress"
                ? styles.numberCurrent
                : styles.numberLocked;

          return (
            <g
              key={topic.id}
              onClick={clickable ? () => openTopic(topic.id) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={`Lecture ${i + 1}: ${topic.name} — ${topic.state.replace("-", " ")}`}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") openTopic(topic.id);
                    }
                  : undefined
              }
            >
              {topic.state === "in-progress" && (
                <circle cx={p.x} cy={p.y} r={NODE_RADIUS} className={styles.pulseRing} />
              )}
              <circle cx={p.x} cy={p.y} r={NODE_RADIUS} className={`${styles.nodeCircle} ${nodeCls}`} />
              {topic.state === "mastered" ? (
                <g className={styles.checkIcon} transform={`translate(${p.x - 8}, ${p.y - 8})`}>
                  <CheckIcon size={16} />
                </g>
              ) : (
                <text x={p.x} y={p.y + 1} className={numberCls}>
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {currentIndex !== -1 && (
        <button
          type="button"
          className={styles.pill}
          style={{
            left: positions[currentIndex].x,
            top: positions[currentIndex].y,
          }}
          onClick={() => openTopic(topics[currentIndex].id)}
        >
          <span className={styles.pillLabel}>
            Lecture {currentIndex + 1} · {topics[currentIndex].name}
          </span>
          <ArrowIcon size={13} />
        </button>
      )}
    </div>
  );
}
