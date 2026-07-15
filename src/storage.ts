import type {
  DrawElement,
  PlanState,
  SavedPlan,
  SavedPlanKind,
  SavedPlanMeta,
  SessionSnapshot,
  StorageError,
  StorageResult,
} from "./types";
import { DEFAULT_CANVAS_HEIGHT, DEFAULT_CANVAS_WIDTH } from "./types";

const LEGACY_KEY = "dimensional.plan.v1";
const PRE_LIBRARY_KEY = "dimensional.plan.v2";
const SESSION_KEY = "dimensional.session.v2";
const LIBRARY_INDEX_KEY = "dimensional.library.index.v2";
const planEntryKey = (id: string) => `dimensional.library.plan.${id}.v2`;

type LoadedSessionSnapshot = SessionSnapshot & {
  needsLegacyMigration: boolean;
};

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

function normalizePlanState(
  raw: Partial<PlanState> | null | undefined,
): PlanState {
  if (!raw) return { ...DEFAULT_STATE };
  return {
    imageDataUrl: raw.imageDataUrl ?? null,
    canvasWidth: typeof raw.canvasWidth === "number" ? raw.canvasWidth : null,
    canvasHeight:
      typeof raw.canvasHeight === "number" ? raw.canvasHeight : null,
    pixelsPerInch:
      typeof raw.pixelsPerInch === "number" ? raw.pixelsPerInch : null,
    unitSystem: raw.unitSystem === "metric" ? "metric" : "imperial",
    items: Array.isArray(raw.items) ? raw.items : [],
    elements: parseElements(raw.elements),
  };
}

function storageErrorFromException(err: unknown): StorageError {
  const domErr = err as DOMException | undefined;
  if (
    domErr?.name === "QuotaExceededError" ||
    domErr?.code === 22 ||
    domErr?.code === 1014
  ) {
    return {
      type: "quota_exceeded",
      message:
        "Storage is full. Remove older saved plans or use a smaller floor plan image.",
    };
  }
  return {
    type: "unavailable",
    message: "Could not save to browser storage. Check that storage is enabled.",
  };
}

function trySetItem(key: string, value: string): StorageResult {
  try {
    localStorage.setItem(key, value);
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: storageErrorFromException(err) };
  }
}

function tryRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function planStatesEqual(a: PlanState, b: PlanState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function planStateWithoutFurniture(state: PlanState): PlanState {
  return normalizePlanState({ ...state, items: [] });
}

export function loadSessionSnapshot(): LoadedSessionSnapshot {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
      const plan = normalizePlanState(parsed.plan);
      const baselineState = normalizePlanState(parsed.baselineState ?? plan);
      return {
        plan,
        activePlanId:
          typeof parsed.activePlanId === "string" ? parsed.activePlanId : null,
        activePlanName:
          typeof parsed.activePlanName === "string"
            ? parsed.activePlanName
            : null,
        baselineState,
        needsLegacyMigration: false,
      };
    }
  } catch {
    // fall through to migration / default
  }

  const migrated = loadPreLibraryPlanState();
  if (migrated) {
    return {
      plan: migrated,
      activePlanId: null,
      activePlanName: null,
      baselineState: migrated,
      needsLegacyMigration: true,
    };
  }

  const plan = { ...DEFAULT_STATE };
  return {
    plan,
    activePlanId: null,
    activePlanName: null,
    baselineState: plan,
    needsLegacyMigration: false,
  };
}

function loadPreLibraryPlanState(): PlanState | null {
  try {
    const raw =
      localStorage.getItem(PRE_LIBRARY_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlanState>;
    return normalizePlanState(parsed);
  } catch {
    return null;
  }
}

export function clearLegacyPlanState(): void {
  tryRemoveItem(LEGACY_KEY);
  tryRemoveItem(PRE_LIBRARY_KEY);
}

export function saveSessionSnapshot(snapshot: SessionSnapshot): StorageResult {
  return trySetItem(SESSION_KEY, JSON.stringify(snapshot));
}

export function listSavedPlans(): SavedPlanMeta[] {
  try {
    const raw = localStorage.getItem(LIBRARY_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      plans?: Partial<SavedPlanMeta>[];
    };
    if (!Array.isArray(parsed.plans)) return [];
    return parsed.plans
      .filter(
        (
          p,
        ): p is Partial<SavedPlanMeta> &
          Pick<SavedPlanMeta, "id" | "name" | "updatedAt"> =>
          p != null &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.updatedAt === "string",
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        kind: p.kind === "clean" ? "clean" : "full",
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  } catch {
    return [];
  }
}

function writeLibraryIndex(plans: SavedPlanMeta[]): StorageResult {
  return trySetItem(LIBRARY_INDEX_KEY, JSON.stringify({ plans }));
}

export function loadSavedPlan(id: string): SavedPlan | null {
  try {
    const raw = localStorage.getItem(planEntryKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedPlan>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      name: parsed.name,
      updatedAt: parsed.updatedAt,
      kind: parsed.kind === "clean" ? "clean" : "full",
      state: normalizePlanState(parsed.state),
    };
  } catch {
    return null;
  }
}

export function savePlanToLibrary(
  id: string,
  name: string,
  state: PlanState,
  kind: SavedPlanKind = "full",
): StorageResult<SavedPlan> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return {
      ok: false,
      error: {
        type: "unavailable",
        message: "Plan name cannot be empty.",
      },
    };
  }

  const updatedAt = new Date().toISOString();
  const entry: SavedPlan = {
    id,
    name: trimmedName,
    updatedAt,
    kind,
    state: normalizePlanState(state),
  };

  const entryResult = trySetItem(planEntryKey(id), JSON.stringify(entry));
  if (!entryResult.ok) return entryResult;

  const index = listSavedPlans();
  const nextIndex = [
    { id, name: trimmedName, updatedAt, kind },
    ...index.filter((p) => p.id !== id),
  ];
  const indexResult = writeLibraryIndex(nextIndex);
  if (!indexResult.ok) {
    tryRemoveItem(planEntryKey(id));
    return indexResult;
  }

  return { ok: true, value: entry };
}

export function deleteSavedPlan(id: string): StorageResult {
  const index = listSavedPlans().filter((p) => p.id !== id);
  const indexResult = writeLibraryIndex(index);
  if (!indexResult.ok) return indexResult;

  tryRemoveItem(planEntryKey(id));
  return { ok: true, value: undefined };
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
