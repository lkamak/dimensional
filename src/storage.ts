import type { PlanState, WallSegment } from "./types";

const STORAGE_KEY = "dimensional.plan.v2";

export const DEFAULT_STATE: PlanState = {
  imageDataUrl: null,
  pixelsPerInch: null,
  unitSystem: "imperial",
  items: [],
  walls: [],
  imageUnderlayVisible: true,
  imageUnderlayOpacity: 1,
};

function parseWalls(value: unknown): WallSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (w): w is WallSegment =>
        w != null &&
        typeof w === "object" &&
        typeof (w as WallSegment).id === "string" &&
        (w as WallSegment).start != null &&
        (w as WallSegment).end != null &&
        typeof (w as WallSegment).start.x === "number" &&
        typeof (w as WallSegment).start.y === "number" &&
        typeof (w as WallSegment).end.x === "number" &&
        typeof (w as WallSegment).end.y === "number",
    )
    .map((w) => ({
      id: w.id,
      start: { x: w.start.x, y: w.start.y },
      end: { x: w.end.x, y: w.end.y },
    }));
}

export function loadPlanState(): PlanState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem("dimensional.plan.v1");
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<PlanState>;
    const opacity =
      typeof parsed.imageUnderlayOpacity === "number"
        ? Math.min(1, Math.max(0, parsed.imageUnderlayOpacity))
        : DEFAULT_STATE.imageUnderlayOpacity;
    return {
      imageDataUrl: parsed.imageDataUrl ?? null,
      pixelsPerInch:
        typeof parsed.pixelsPerInch === "number" ? parsed.pixelsPerInch : null,
      unitSystem: parsed.unitSystem === "metric" ? "metric" : "imperial",
      items: Array.isArray(parsed.items) ? parsed.items : [],
      walls: parseWalls(parsed.walls),
      imageUnderlayVisible:
        typeof parsed.imageUnderlayVisible === "boolean"
          ? parsed.imageUnderlayVisible
          : DEFAULT_STATE.imageUnderlayVisible,
      imageUnderlayOpacity: opacity,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function savePlanState(state: PlanState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or private mode — ignore
  }
}
