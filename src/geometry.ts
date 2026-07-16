import type { DrawElementKind } from "./types";

export type Point = { x: number; y: number };
export type Coords = { x1: number; y1: number; x2: number; y2: number };

/** Minimum pointer travel (in world px) required to commit a drawn element. */
export const MIN_DRAW_DISTANCE = 4;

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Coords {
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  };
}

/**
 * Resolve the stored coordinates for a freshly drawn element.
 *
 * Line-like kinds (`wall`, `line`) preserve the raw start/end endpoints so the
 * segment orientation (including negative-slope diagonals) is retained. Only
 * rectangle-like kinds (`room`, `rect`) are normalized to top-left/bottom-right
 * bounds. Returns `null` when the segment is shorter than the minimum distance.
 */
export function resolveDrawCoords(
  kind: DrawElementKind,
  start: Point,
  end: Point,
): Coords | null {
  if (dist(start, end) < MIN_DRAW_DISTANCE) return null;
  const isLineLike = kind === "wall" || kind === "line";
  return isLineLike
    ? { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
    : normalizeRect(start.x, start.y, end.x, end.y);
}
