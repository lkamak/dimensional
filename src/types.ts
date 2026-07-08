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

export type Point = {
  x: number;
  y: number;
};

/** Editable wall segment in image pixel coordinates. */
export type WallSegment = {
  id: string;
  start: Point;
  end: Point;
};

export type PlanState = {
  imageDataUrl: string | null;
  pixelsPerInch: number | null;
  unitSystem: UnitSystem;
  items: FurnitureItem[];
  walls: WallSegment[];
  imageUnderlayVisible: boolean;
  imageUnderlayOpacity: number;
};

export type CatalogPreset = {
  kind: FurnitureKind;
  label: string;
  widthIn: number;
  depthIn: number;
};

export type ToolMode = "select" | "calibrate" | "pan" | "draw_wall";

export type CalibrationDraft = {
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
};

export type WallDraft = {
  start: Point | null;
  end: Point | null;
};
