export type UnitSystem = "imperial" | "metric";

export type FurnitureKind =
  | "couch"
  | "tv_console"
  | "desk"
  | "bed"
  | "chair"
  | "table"
  | "custom";

export type FurnitureItem = {
  id: string;
  kind: FurnitureKind;
  label: string;
  widthIn: number;
  depthIn: number;
  x: number;
  y: number;
  rotation: number;
};

export type PlanState = {
  imageDataUrl: string | null;
  pixelsPerInch: number | null;
  unitSystem: UnitSystem;
  items: FurnitureItem[];
};

export type SavedPlanMeta = {
  id: string;
  name: string;
  updatedAt: string;
};

export type SavedPlan = SavedPlanMeta & {
  state: PlanState;
};

export type SessionSnapshot = {
  plan: PlanState;
  activePlanId: string | null;
  activePlanName: string | null;
  baselineState: PlanState;
};

export type StorageError = {
  type: "quota_exceeded" | "unavailable";
  message: string;
};

export type StorageResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: StorageError };

export type CatalogPreset = {
  kind: FurnitureKind;
  label: string;
  widthIn: number;
  depthIn: number;
};

export type ToolMode = "select" | "calibrate" | "pan";

export type CalibrationDraft = {
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
};
