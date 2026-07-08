import type {
  PlanState,
  SavedPlan,
  SavedPlanMeta,
  SessionSnapshot,
  StorageError,
  StorageResult,
} from "./types";

const LEGACY_KEY = "dimensional.plan.v1";
const SESSION_KEY = "dimensional.session.v2";
const LIBRARY_INDEX_KEY = "dimensional.library.index.v2";
const planEntryKey = (id: string) => `dimensional.library.plan.${id}.v2`;

export const DEFAULT_STATE: PlanState = {
  imageDataUrl: null,
  pixelsPerInch: null,
  unitSystem: "imperial",
  items: [],
};

function normalizePlanState(raw: Partial<PlanState> | null | undefined): PlanState {
  if (!raw) return { ...DEFAULT_STATE };
  return {
    imageDataUrl: raw.imageDataUrl ?? null,
    pixelsPerInch:
      typeof raw.pixelsPerInch === "number" ? raw.pixelsPerInch : null,
    unitSystem: raw.unitSystem === "metric" ? "metric" : "imperial",
    items: Array.isArray(raw.items) ? raw.items : [],
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

export function loadSessionSnapshot(): SessionSnapshot {
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
      };
    }
  } catch {
    // fall through to migration / default
  }

  const legacy = loadLegacyPlanState();
  if (legacy) {
    return {
      plan: legacy,
      activePlanId: null,
      activePlanName: null,
      baselineState: legacy,
    };
  }

  const plan = { ...DEFAULT_STATE };
  return {
    plan,
    activePlanId: null,
    activePlanName: null,
    baselineState: plan,
  };
}

function loadLegacyPlanState(): PlanState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlanState>;
    const plan = normalizePlanState(parsed);
    tryRemoveItem(LEGACY_KEY);
    return plan;
  } catch {
    return null;
  }
}

export function saveSessionSnapshot(snapshot: SessionSnapshot): StorageResult {
  return trySetItem(SESSION_KEY, JSON.stringify(snapshot));
}

export function listSavedPlans(): SavedPlanMeta[] {
  try {
    const raw = localStorage.getItem(LIBRARY_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { plans?: SavedPlanMeta[] };
    if (!Array.isArray(parsed.plans)) return [];
    return parsed.plans
      .filter(
        (p) =>
          p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.updatedAt === "string",
      )
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
    state: normalizePlanState(state),
  };

  const entryResult = trySetItem(planEntryKey(id), JSON.stringify(entry));
  if (!entryResult.ok) return entryResult;

  const index = listSavedPlans();
  const nextIndex = [
    { id, name: trimmedName, updatedAt },
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
  tryRemoveItem(planEntryKey(id));
  const index = listSavedPlans().filter((p) => p.id !== id);
  return writeLibraryIndex(index);
}

/** @deprecated Use loadSessionSnapshot instead */
export function loadPlanState(): PlanState {
  return loadSessionSnapshot().plan;
}

/** @deprecated Use saveSessionSnapshot instead */
export function savePlanState(state: PlanState): void {
  const snapshot = loadSessionSnapshot();
  saveSessionSnapshot({
    ...snapshot,
    plan: state,
  });
}
