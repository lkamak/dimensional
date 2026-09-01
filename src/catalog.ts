import type {
  CatalogPreset,
  CustomCatalogPreset,
  FurnitureKind,
} from "./types";
import { isFurnitureKind } from "./types";

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

export const DEFAULT_CUSTOM_SIZE = { widthIn: 36, depthIn: 24 };

export const FURNITURE_KIND_OPTIONS: { kind: FurnitureKind; label: string }[] = [
  { kind: "custom", label: "Custom" },
  { kind: "couch", label: "Sofa" },
  { kind: "tv_console", label: "TV console" },
  { kind: "desk", label: "Desk" },
  { kind: "bed", label: "Bed" },
  { kind: "chair", label: "Chair" },
  { kind: "table", label: "Table" },
];

export function parseCustomCatalog(raw: unknown): CustomCatalogPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomCatalogPreset[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const rec = item as Partial<CustomCatalogPreset>;
    if (typeof rec.id !== "string" || !rec.id) continue;
    if (typeof rec.label !== "string") continue;
    const label = rec.label.trim();
    if (!label) continue;
    if (!isFurnitureKind(rec.kind)) continue;
    if (
      typeof rec.widthIn !== "number" ||
      !Number.isFinite(rec.widthIn) ||
      rec.widthIn <= 0
    ) {
      continue;
    }
    if (
      typeof rec.depthIn !== "number" ||
      !Number.isFinite(rec.depthIn) ||
      rec.depthIn <= 0
    ) {
      continue;
    }
    out.push({
      id: rec.id,
      kind: rec.kind,
      label,
      widthIn: rec.widthIn,
      depthIn: rec.depthIn,
    });
  }
  return out;
}
