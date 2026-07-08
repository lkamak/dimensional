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

export type DrawElementKind = "wall" | "room" | "line" | "rect";

export type DrawElement = {
  id: string;
  kind: DrawElementKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type PlanState = {
  imageDataUrl: string | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
  pixelsPerInch: number | null;
  unitSystem: UnitSystem;
  items: FurnitureItem[];
  elements: DrawElement[];
};

export const DEFAULT_CANVAS_WIDTH = 1200;
export const DEFAULT_CANVAS_HEIGHT = 900;

export type CatalogPreset = {
  kind: FurnitureKind;
  label: string;
  widthIn: number;
  depthIn: number;
};

export type ToolMode =
  | "select"
  | "calibrate"
  | "pan"
  | "draw-wall"
  | "draw-room"
  | "draw-line"
  | "draw-rect";

export type DrawToolMode = Extract<
  ToolMode,
  "draw-wall" | "draw-room" | "draw-line" | "draw-rect"
>;

export type CalibrationDraft = {
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
};

export function isDrawTool(mode: ToolMode): mode is DrawToolMode {
  return (
    mode === "draw-wall" ||
    mode === "draw-room" ||
    mode === "draw-line" ||
    mode === "draw-rect"
  );
}

export function hasActivePlan(plan: PlanState): boolean {
  return plan.imageDataUrl != null || plan.canvasWidth != null;
}
