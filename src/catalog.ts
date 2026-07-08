import type { CatalogPreset } from "./types";

export const CATALOG: CatalogPreset[] = [
  { kind: "couch", label: "Sofa", widthIn: 84, depthIn: 38 },
  { kind: "couch", label: "Loveseat", widthIn: 60, depthIn: 36 },
  { kind: "tv_console", label: "TV console", widthIn: 60, depthIn: 18 },
  { kind: "desk", label: "Desk", widthIn: 60, depthIn: 30 },
  { kind: "bed", label: "Queen bed", widthIn: 60, depthIn: 80 },
  { kind: "bed", label: "King bed", widthIn: 76, depthIn: 80 },
  { kind: "chair", label: "Armchair", widthIn: 34, depthIn: 34 },
  { kind: "table", label: "Dining table", widthIn: 72, depthIn: 36 },
  { kind: "table", label: "Coffee table", widthIn: 48, depthIn: 24 },
  { kind: "custom", label: "Custom", widthIn: 36, depthIn: 24 },
];
