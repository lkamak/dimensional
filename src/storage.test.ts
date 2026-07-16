import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STATE,
  clearLegacyPlanState,
  createBlankPlanState,
  deleteSavedPlan,
  listSavedPlans,
  loadSavedPlan,
  loadSessionSnapshot,
  planStateWithoutFurniture,
  planStatesEqual,
  savePlanToLibrary,
  saveSessionSnapshot,
} from "./storage";
import type {
  DrawElement,
  FurnitureItem,
  PlanState,
  SessionSnapshot,
} from "./types";
import { DEFAULT_CANVAS_HEIGHT, DEFAULT_CANVAS_WIDTH } from "./types";

const LEGACY_KEY = "dimensional.plan.v1";
const PRE_LIBRARY_KEY = "dimensional.plan.v2";
const SESSION_KEY = "dimensional.session.v2";
const LIBRARY_INDEX_KEY = "dimensional.library.index.v2";
const planEntryKey = (id: string) => `dimensional.library.plan.${id}.v2`;

const sampleItem: FurnitureItem = {
  id: "f1",
  kind: "couch",
  label: "Couch",
  widthIn: 84,
  depthIn: 36,
  x: 10,
  y: 20,
  rotation: 0,
};

const negativeSlopeWall: DrawElement = {
  id: "w1",
  kind: "wall",
  x1: 100,
  y1: 50,
  x2: 50,
  y2: 100,
};

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    ...DEFAULT_STATE,
    canvasWidth: 1200,
    canvasHeight: 900,
    ...overrides,
  };
}

function makeSnapshot(plan: PlanState): SessionSnapshot {
  return {
    plan,
    activePlanId: null,
    activePlanName: null,
    baselineState: plan,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("createBlankPlanState", () => {
  it("returns DEFAULT_STATE with canvas dims and default imperial units", () => {
    const state = createBlankPlanState();
    expect(state.canvasWidth).toBe(DEFAULT_CANVAS_WIDTH);
    expect(state.canvasHeight).toBe(DEFAULT_CANVAS_HEIGHT);
    expect(state.canvasWidth).toBe(1200);
    expect(state.canvasHeight).toBe(900);
    expect(state.unitSystem).toBe("imperial");
    expect(state.items).toEqual([]);
    expect(state.elements).toEqual([]);
    expect(state.imageDataUrl).toBeNull();
    expect(state.pixelsPerInch).toBeNull();
    expect(state.imageUnderlayVisible).toBe(true);
    expect(state.imageUnderlayOpacity).toBe(1);
  });

  it("honors the given unit system", () => {
    expect(createBlankPlanState("metric").unitSystem).toBe("metric");
    expect(createBlankPlanState("imperial").unitSystem).toBe("imperial");
  });

  it("does not mutate DEFAULT_STATE", () => {
    createBlankPlanState("metric");
    expect(DEFAULT_STATE.canvasWidth).toBeNull();
    expect(DEFAULT_STATE.unitSystem).toBe("imperial");
  });
});

describe("planStatesEqual", () => {
  it("returns true for deep-equal states", () => {
    const a = makeState({ elements: [negativeSlopeWall] });
    const b = makeState({ elements: [{ ...negativeSlopeWall }] });
    expect(planStatesEqual(a, b)).toBe(true);
  });

  it("returns false when states differ", () => {
    const a = makeState({ canvasWidth: 1200 });
    const b = makeState({ canvasWidth: 800 });
    expect(planStatesEqual(a, b)).toBe(false);
  });

  it("returns false when only items differ", () => {
    const a = makeState({ items: [sampleItem] });
    const b = makeState({ items: [] });
    expect(planStatesEqual(a, b)).toBe(false);
  });
});

describe("planStateWithoutFurniture", () => {
  it("strips items to [] but preserves elements and other fields", () => {
    const state = makeState({
      items: [sampleItem],
      elements: [negativeSlopeWall],
      unitSystem: "metric",
      pixelsPerInch: 12,
      imageUnderlayOpacity: 0.5,
      imageUnderlayVisible: false,
    });
    const cleaned = planStateWithoutFurniture(state);
    expect(cleaned.items).toEqual([]);
    expect(cleaned.elements).toEqual([negativeSlopeWall]);
    expect(cleaned.canvasWidth).toBe(1200);
    expect(cleaned.canvasHeight).toBe(900);
    expect(cleaned.unitSystem).toBe("metric");
    expect(cleaned.pixelsPerInch).toBe(12);
    expect(cleaned.imageUnderlayOpacity).toBe(0.5);
    expect(cleaned.imageUnderlayVisible).toBe(false);
  });

  it("normalizes the state (result matches normalized round-trip)", () => {
    const state = makeState({ items: [sampleItem], elements: [] });
    const cleaned = planStateWithoutFurniture(state);
    expect(cleaned).toEqual(makeState({ items: [], elements: [] }));
  });
});

describe("savePlanToLibrary / loadSavedPlan round-trip", () => {
  it("round-trips a saved plan and lists the entry", () => {
    const state = makeState({ elements: [negativeSlopeWall], items: [sampleItem] });
    const result = savePlanToLibrary("plan-a", "My Plan", state);
    expect(result.ok).toBe(true);

    const loaded = loadSavedPlan("plan-a");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("plan-a");
    expect(loaded!.name).toBe("My Plan");
    expect(loaded!.kind).toBe("full");
    expect(planStatesEqual(loaded!.state, state)).toBe(true);

    const list = listSavedPlans();
    expect(list.some((p) => p.id === "plan-a")).toBe(true);
    const entry = list.find((p) => p.id === "plan-a")!;
    expect(entry.name).toBe("My Plan");
    expect(entry.kind).toBe("full");
  });

  it("preserves negative-slope wall coords via loadSavedPlan (DIM-17)", () => {
    const state = makeState({ elements: [negativeSlopeWall] });
    savePlanToLibrary("plan-neg", "Neg", state);
    const loaded = loadSavedPlan("plan-neg");
    expect(loaded!.state.elements).toEqual([
      { id: "w1", kind: "wall", x1: 100, y1: 50, x2: 50, y2: 100 },
    ]);
  });

  it("preserves negative-slope wall coords via session snapshot (DIM-17)", () => {
    const state = makeState({ elements: [negativeSlopeWall] });
    saveSessionSnapshot(makeSnapshot(state));
    const loaded = loadSessionSnapshot();
    expect(loaded.plan.elements).toEqual([
      { id: "w1", kind: "wall", x1: 100, y1: 50, x2: 50, y2: 100 },
    ]);
  });

  it("saves with an explicit clean kind", () => {
    savePlanToLibrary("plan-c", "Clean", makeState(), "clean");
    expect(loadSavedPlan("plan-c")!.kind).toBe("clean");
    expect(listSavedPlans().find((p) => p.id === "plan-c")!.kind).toBe("clean");
  });
});

describe("savePlanToLibrary name validation", () => {
  it("rejects an empty name", () => {
    const result = savePlanToLibrary("id1", "", makeState());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("unavailable");
      expect(typeof result.error.message).toBe("string");
    }
    expect(loadSavedPlan("id1")).toBeNull();
  });

  it("rejects a whitespace-only name", () => {
    const result = savePlanToLibrary("id2", "   \t\n ", makeState());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("unavailable");
    }
    expect(listSavedPlans()).toEqual([]);
  });

  it("trims the stored name", () => {
    const result = savePlanToLibrary("id3", "  Padded  ", makeState());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Padded");
    }
    expect(loadSavedPlan("id3")!.name).toBe("Padded");
    expect(listSavedPlans().find((p) => p.id === "id3")!.name).toBe("Padded");
  });
});

describe("listSavedPlans", () => {
  it("returns [] when nothing stored", () => {
    expect(listSavedPlans()).toEqual([]);
  });

  it("returns [] on malformed index JSON", () => {
    localStorage.setItem(LIBRARY_INDEX_KEY, "{not json");
    expect(listSavedPlans()).toEqual([]);
  });

  it("sorts by updatedAt descending", () => {
    localStorage.setItem(
      LIBRARY_INDEX_KEY,
      JSON.stringify({
        plans: [
          { id: "old", name: "Old", updatedAt: "2020-01-01T00:00:00.000Z" },
          { id: "new", name: "New", updatedAt: "2024-06-01T00:00:00.000Z" },
          { id: "mid", name: "Mid", updatedAt: "2022-03-01T00:00:00.000Z" },
        ],
      }),
    );
    expect(listSavedPlans().map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("de-dupes by id keeping the newest, first", () => {
    savePlanToLibrary("dup", "First", makeState({ canvasWidth: 100 }));
    savePlanToLibrary("dup", "Second", makeState({ canvasWidth: 200 }));
    const list = listSavedPlans();
    expect(list.filter((p) => p.id === "dup")).toHaveLength(1);
    expect(list[0].id).toBe("dup");
    expect(list[0].name).toBe("Second");
    expect(loadSavedPlan("dup")!.state.canvasWidth).toBe(200);
  });

  it("defaults kind to full when missing and clean when set", () => {
    localStorage.setItem(
      LIBRARY_INDEX_KEY,
      JSON.stringify({
        plans: [
          { id: "a", name: "A", updatedAt: "2024-01-01T00:00:00.000Z" },
          {
            id: "b",
            name: "B",
            updatedAt: "2023-01-01T00:00:00.000Z",
            kind: "clean",
          },
        ],
      }),
    );
    const list = listSavedPlans();
    expect(list.find((p) => p.id === "a")!.kind).toBe("full");
    expect(list.find((p) => p.id === "b")!.kind).toBe("clean");
  });

  it("filters out entries missing required fields", () => {
    localStorage.setItem(
      LIBRARY_INDEX_KEY,
      JSON.stringify({
        plans: [
          { id: "good", name: "Good", updatedAt: "2024-01-01T00:00:00.000Z" },
          { id: "bad", name: "Bad" },
          { name: "NoId", updatedAt: "2024-01-01T00:00:00.000Z" },
          null,
        ],
      }),
    );
    expect(listSavedPlans().map((p) => p.id)).toEqual(["good"]);
  });
});

describe("loadSavedPlan", () => {
  it("returns null for a missing id", () => {
    expect(loadSavedPlan("nope")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    localStorage.setItem(planEntryKey("broken"), "{bad json");
    expect(loadSavedPlan("broken")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    localStorage.setItem(
      planEntryKey("partial"),
      JSON.stringify({ id: "partial", state: {} }),
    );
    expect(loadSavedPlan("partial")).toBeNull();
  });
});

describe("deleteSavedPlan", () => {
  it("removes both the index entry and per-plan entry", () => {
    savePlanToLibrary("del", "Delete Me", makeState());
    expect(loadSavedPlan("del")).not.toBeNull();
    expect(localStorage.getItem(planEntryKey("del"))).not.toBeNull();

    const result = deleteSavedPlan("del");
    expect(result.ok).toBe(true);

    expect(loadSavedPlan("del")).toBeNull();
    expect(localStorage.getItem(planEntryKey("del"))).toBeNull();
    expect(listSavedPlans().some((p) => p.id === "del")).toBe(false);
  });

  it("leaves other plans intact", () => {
    savePlanToLibrary("keep", "Keep", makeState());
    savePlanToLibrary("drop", "Drop", makeState());
    deleteSavedPlan("drop");
    expect(listSavedPlans().map((p) => p.id)).toEqual(["keep"]);
    expect(loadSavedPlan("keep")).not.toBeNull();
  });
});

describe("loadSessionSnapshot", () => {
  it("returns a DEFAULT-based plan when nothing stored", () => {
    const loaded = loadSessionSnapshot();
    expect(loaded.plan).toEqual(DEFAULT_STATE);
    expect(loaded.activePlanId).toBeNull();
    expect(loaded.activePlanName).toBeNull();
    expect(loaded.baselineState).toEqual(DEFAULT_STATE);
    expect(loaded.needsLegacyMigration).toBe(false);
  });

  it("round-trips a stored session snapshot", () => {
    const plan = makeState({ elements: [negativeSlopeWall], items: [sampleItem] });
    const snapshot: SessionSnapshot = {
      plan,
      activePlanId: "active-1",
      activePlanName: "Active Plan",
      baselineState: makeState({ elements: [negativeSlopeWall] }),
    };
    expect(saveSessionSnapshot(snapshot).ok).toBe(true);

    const loaded = loadSessionSnapshot();
    expect(loaded.needsLegacyMigration).toBe(false);
    expect(loaded.activePlanId).toBe("active-1");
    expect(loaded.activePlanName).toBe("Active Plan");
    expect(planStatesEqual(loaded.plan, plan)).toBe(true);
    expect(
      planStatesEqual(loaded.baselineState, makeState({ elements: [negativeSlopeWall] })),
    ).toBe(true);
  });

  it("defaults baselineState to plan when absent", () => {
    const plan = makeState({ elements: [negativeSlopeWall] });
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ plan, activePlanId: null, activePlanName: null }),
    );
    const loaded = loadSessionSnapshot();
    expect(planStatesEqual(loaded.baselineState, loaded.plan)).toBe(true);
  });

  it("migrates from the pre-library key with needsLegacyMigration true", () => {
    const plan = makeState({ elements: [negativeSlopeWall] });
    localStorage.setItem(PRE_LIBRARY_KEY, JSON.stringify(plan));
    const loaded = loadSessionSnapshot();
    expect(loaded.needsLegacyMigration).toBe(true);
    expect(loaded.activePlanId).toBeNull();
    expect(loaded.activePlanName).toBeNull();
    expect(planStatesEqual(loaded.plan, plan)).toBe(true);
    expect(planStatesEqual(loaded.baselineState, plan)).toBe(true);
  });

  it("migrates from the legacy v1 key when pre-library absent", () => {
    const plan = makeState({ unitSystem: "metric" });
    localStorage.setItem(LEGACY_KEY, JSON.stringify(plan));
    const loaded = loadSessionSnapshot();
    expect(loaded.needsLegacyMigration).toBe(true);
    expect(loaded.plan.unitSystem).toBe("metric");
  });

  it("falls back to migration when session JSON is malformed", () => {
    localStorage.setItem(SESSION_KEY, "{broken");
    const plan = makeState();
    localStorage.setItem(PRE_LIBRARY_KEY, JSON.stringify(plan));
    const loaded = loadSessionSnapshot();
    expect(loaded.needsLegacyMigration).toBe(true);
    expect(planStatesEqual(loaded.plan, plan)).toBe(true);
  });
});

describe("legacy walls migration (LUC-22)", () => {
  it("migrates walls[] into wall elements when no elements present", () => {
    const preLibrary = {
      canvasWidth: 1200,
      canvasHeight: 900,
      unitSystem: "imperial",
      walls: [
        { id: "wa", start: { x: 10, y: 20 }, end: { x: 30, y: 40 } },
        { id: "wb", start: { x: 5, y: 6 }, end: { x: 7, y: 8 } },
      ],
    };
    localStorage.setItem(PRE_LIBRARY_KEY, JSON.stringify(preLibrary));
    const loaded = loadSessionSnapshot();
    expect(loaded.needsLegacyMigration).toBe(true);
    expect(loaded.plan.elements).toEqual([
      { id: "wa", kind: "wall", x1: 10, y1: 20, x2: 30, y2: 40 },
      { id: "wb", kind: "wall", x1: 5, y1: 6, x2: 7, y2: 8 },
    ]);
  });

  it("ignores malformed wall segments during migration", () => {
    const preLibrary = {
      canvasWidth: 1200,
      canvasHeight: 900,
      walls: [
        { id: "ok", start: { x: 1, y: 2 }, end: { x: 3, y: 4 } },
        { id: "noStart", end: { x: 3, y: 4 } },
        { start: { x: 1, y: 2 }, end: { x: 3, y: 4 } },
        { id: "badCoords", start: { x: "a", y: 2 }, end: { x: 3, y: 4 } },
      ],
    };
    localStorage.setItem(PRE_LIBRARY_KEY, JSON.stringify(preLibrary));
    const loaded = loadSessionSnapshot();
    expect(loaded.plan.elements).toEqual([
      { id: "ok", kind: "wall", x1: 1, y1: 2, x2: 3, y2: 4 },
    ]);
  });

  it("prefers existing elements over legacy walls", () => {
    const preLibrary = {
      canvasWidth: 1200,
      elements: [negativeSlopeWall],
      walls: [{ id: "wa", start: { x: 10, y: 20 }, end: { x: 30, y: 40 } }],
    };
    localStorage.setItem(PRE_LIBRARY_KEY, JSON.stringify(preLibrary));
    const loaded = loadSessionSnapshot();
    expect(loaded.plan.elements).toEqual([negativeSlopeWall]);
  });
});

describe("clearLegacyPlanState", () => {
  it("removes the legacy and pre-library keys", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(makeState()));
    localStorage.setItem(PRE_LIBRARY_KEY, JSON.stringify(makeState()));
    localStorage.setItem(SESSION_KEY, JSON.stringify(makeSnapshot(makeState())));

    clearLegacyPlanState();

    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(PRE_LIBRARY_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });
});

describe("parseElements robustness (via normalization)", () => {
  it("filters out malformed elements on load", () => {
    const raw = {
      canvasWidth: 1200,
      elements: [
        { id: "good", kind: "wall", x1: 1, y1: 2, x2: 3, y2: 4 },
        { id: "noCoords", kind: "wall" },
        { id: "unknownKind", kind: "circle", x1: 1, y1: 2, x2: 3, y2: 4 },
        { kind: "line", x1: 1, y1: 2, x2: 3, y2: 4 },
        { id: "badCoord", kind: "rect", x1: "1", y1: 2, x2: 3, y2: 4 },
        null,
        "not an object",
      ],
    };
    localStorage.setItem(planEntryKey("robust"), JSON.stringify({
      id: "robust",
      name: "Robust",
      updatedAt: "2024-01-01T00:00:00.000Z",
      kind: "full",
      state: raw,
    }));
    const loaded = loadSavedPlan("robust");
    expect(loaded!.state.elements).toEqual([
      { id: "good", kind: "wall", x1: 1, y1: 2, x2: 3, y2: 4 },
    ]);
  });

  it("keeps all valid element kinds", () => {
    const raw = {
      canvasWidth: 1200,
      elements: [
        { id: "e1", kind: "wall", x1: 0, y1: 0, x2: 1, y2: 1 },
        { id: "e2", kind: "room", x1: 0, y1: 0, x2: 1, y2: 1 },
        { id: "e3", kind: "line", x1: 0, y1: 0, x2: 1, y2: 1 },
        { id: "e4", kind: "rect", x1: 0, y1: 0, x2: 1, y2: 1 },
      ],
    };
    localStorage.setItem(PRE_LIBRARY_KEY, JSON.stringify(raw));
    const loaded = loadSessionSnapshot();
    expect(loaded.plan.elements.map((e) => e.kind)).toEqual([
      "wall",
      "room",
      "line",
      "rect",
    ]);
  });
});
