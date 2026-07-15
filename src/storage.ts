import type { DrawElement, PlanState } from "./types";
import { DEFAULT_CANVAS_HEIGHT, DEFAULT_CANVAS_WIDTH } from "./types";

const STORAGE_KEY = "dimensional.plan.v2";
const LEGACY_STORAGE_KEY = "dimensional.plan.v1";

export const DEFAULT_STATE: PlanState = {
  imageDataUrl: null,
  canvasWidth: null,
  canvasHeight: null,
  pixelsPerInch: null,
  unitSystem: "imperial",
  items: [],
  elements: [],
};

function parseElements(raw: unknown): DrawElement[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (el): el is DrawElement =>
      el != null &&
      typeof el === "object" &&
      typeof (el as DrawElement).id === "string" &&
      ["wall", "room", "line", "rect"].includes((el as DrawElement).kind) &&
      typeof (el as DrawElement).x1 === "number" &&
      typeof (el as DrawElement).y1 === "number" &&
      typeof (el as DrawElement).x2 === "number" &&
      typeof (el as DrawElement).y2 === "number",
  );
}

function normalizePlanState(parsed: Partial<PlanState>): PlanState {
  return {
    imageDataUrl: parsed.imageDataUrl ?? null,
    canvasWidth:
      typeof parsed.canvasWidth === "number" ? parsed.canvasWidth : null,
    canvasHeight:
      typeof parsed.canvasHeight === "number" ? parsed.canvasHeight : null,
    pixelsPerInch:
      typeof parsed.pixelsPerInch === "number" ? parsed.pixelsPerInch : null,
    unitSystem: parsed.unitSystem === "metric" ? "metric" : "imperial",
    items: Array.isArray(parsed.items) ? parsed.items : [],
    elements: parseElements(parsed.elements),
  };
}

export function loadPlanState(): PlanState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<PlanState>;
    const state = normalizePlanState(parsed);
    if (
      localStorage.getItem(STORAGE_KEY) == null &&
      localStorage.getItem(LEGACY_STORAGE_KEY) != null
    ) {
      savePlanState(state);
    }
    return state;
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

export function createBlankPlanState(
  unitSystem: PlanState["unitSystem"] = "imperial",
): PlanState {
  return {
    ...DEFAULT_STATE,
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    unitSystem,
  };
}
