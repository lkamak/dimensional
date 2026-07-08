import type { PlanState } from "./types";

const STORAGE_KEY = "dimensional.plan.v1";

export const DEFAULT_STATE: PlanState = {
  imageDataUrl: null,
  pixelsPerInch: null,
  unitSystem: "imperial",
  items: [],
};

export function loadPlanState(): PlanState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<PlanState>;
    return {
      imageDataUrl: parsed.imageDataUrl ?? null,
      pixelsPerInch:
        typeof parsed.pixelsPerInch === "number" ? parsed.pixelsPerInch : null,
      unitSystem: parsed.unitSystem === "metric" ? "metric" : "imperial",
      items: Array.isArray(parsed.items) ? parsed.items : [],
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
