export interface Point {
  x: number;
  y: number;
}

export const SCENE_WIDTH = 360;
export const PALACE_HEIGHT = 220;

// Horizontal path (map-style): lecture 1 at the left edge, wave running left-to-right,
// palace sits to the right of the path rather than above it.
export const PATH_ROW_HEIGHT = 220;
const NODE_SPACING_X = 108;
const PATH_LEFT_PADDING = 96; // leaves room for the floating current-lecture pill, which can be wider than the node spacing
const PATH_RIGHT_STUB = 22; // extra reach so the final connector visibly leads into the palace
const WAVE_AMPLITUDE = 58;
const CENTER_Y = PATH_ROW_HEIGHT / 2;

export function pathAreaWidth(nodeCount: number): number {
  return PATH_LEFT_PADDING + Math.max(0, nodeCount - 1) * NODE_SPACING_X + PATH_RIGHT_STUB;
}

/** Node positions in local path coordinates, index 0 = leftmost/first lecture. */
export function nodePositions(nodeCount: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const x = PATH_LEFT_PADDING + i * NODE_SPACING_X;
    const y = CENTER_Y + WAVE_AMPLITUDE * Math.sin((i * Math.PI) / 2);
    points.push({ x, y });
  }
  return points;
}

/** The point the final connector stub reaches toward, at the path's right edge — where it visually hands off to the palace. */
export function entryPoint(nodeCount: number): Point {
  const width = pathAreaWidth(nodeCount);
  return { x: width - 6, y: CENTER_Y };
}

interface WindowBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Evenly spaced window slots inside a bounding box, filled bottom row first (matching lecture order). */
export function windowGrid(count: number, box: WindowBox, cols: number): Point[] {
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = box.width / cols;
  const cellH = box.height / rows;
  const points: Point[] = [];
  let placed = 0;

  for (let r = rows - 1; r >= 0 && placed < count; r--) {
    const remaining = count - placed;
    const countInRow = Math.min(cols, remaining);
    const rowOffsetX = ((cols - countInRow) * cellW) / 2;
    for (let c = 0; c < countInRow; c++) {
      points.push({
        x: box.x + rowOffsetX + c * cellW + cellW / 2,
        y: box.y + r * cellH + cellH / 2,
      });
      placed++;
    }
  }
  return points;
}

export function hexagonPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

export function diamondPoints(cx: number, cy: number, size: number): string {
  const half = size / 2;
  return `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
}
