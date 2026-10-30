import type { FurnitureItem, FurnitureShape, UnitSystem } from "./types";

export const DEFAULT_FURNITURE_SHAPE: FurnitureShape = { type: "rect" };

export function normalizeFurnitureShape(
  raw: unknown,
  widthIn: number,
  depthIn: number,
): FurnitureShape {
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    return { type: "rect" };
  }
  const type = (raw as { type: unknown }).type;
  if (type === "round") return { type: "round" };
  if (type === "rect") return { type: "rect" };
  if (type === "l") {
    const rawT = (raw as { thicknessIn?: unknown }).thicknessIn;
    let thicknessIn =
      typeof rawT === "number" && Number.isFinite(rawT)
        ? rawT
        : Math.min(widthIn, depthIn) * 0.4;
    const flip = Boolean((raw as { flip?: unknown }).flip);
    const maxT = Math.min(widthIn, depthIn) - 0.01;
    if (maxT <= 0.01) {
      return { type: "rect" };
    }
    thicknessIn = Math.max(0.01, Math.min(thicknessIn, maxT));
    return { type: "l", thicknessIn, flip };
  }
  return { type: "rect" };
}

export function isLShapeValid(
  widthIn: number,
  depthIn: number,
  thicknessIn: number,
): boolean {
  return (
    thicknessIn > 0 &&
    thicknessIn < widthIn &&
    thicknessIn < depthIn
  );
}

export function normalizeFurnitureItem(
  raw: Partial<FurnitureItem> | null | undefined,
): FurnitureItem | null {
  if (
    !raw ||
    typeof raw.id !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.widthIn !== "number" ||
    typeof raw.depthIn !== "number" ||
    typeof raw.x !== "number" ||
    typeof raw.y !== "number" ||
    typeof raw.rotation !== "number"
  ) {
    return null;
  }
  const kind =
    raw.kind === "couch" ||
    raw.kind === "tv_console" ||
    raw.kind === "desk" ||
    raw.kind === "bed" ||
    raw.kind === "chair" ||
    raw.kind === "table" ||
    raw.kind === "custom"
      ? raw.kind
      : "custom";

  const widthIn = Math.max(0.01, raw.widthIn);
  const depthIn = Math.max(0.01, raw.depthIn);

  return {
    id: raw.id,
    kind,
    label: raw.label,
    widthIn,
    depthIn,
    x: raw.x,
    y: raw.y,
    rotation: raw.rotation,
    shape: normalizeFurnitureShape(raw.shape, widthIn, depthIn),
  };
}

export function parseFurnitureItems(raw: unknown): FurnitureItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FurnitureItem[] = [];
  for (const entry of raw) {
    const item = normalizeFurnitureItem(entry as Partial<FurnitureItem>);
    if (item) out.push(item);
  }
  return out;
}

export function effectiveShape(item: FurnitureItem): FurnitureShape {
  return item.shape ?? DEFAULT_FURNITURE_SHAPE;
}

export function shapeTemplateLabel(shape: FurnitureShape): string {
  switch (shape.type) {
    case "round":
      return "Round";
    case "l":
      return "L-shape";
    default:
      return "Rectangle";
  }
}

/** Local-space leg boxes (center origin) for overlap tests. Sizes in pixels. */
export function lShapeLegsLocal(
  widthPx: number,
  heightPx: number,
  thicknessPx: number,
  flip: boolean,
): { x: number; y: number; w: number; h: number }[] {
  const W = widthPx;
  const H = heightPx;
  const t = thicknessPx;
  if (t >= W || t >= H) {
    return [{ x: -W / 2, y: -H / 2, w: W, h: H }];
  }
  if (!flip) {
    return [
      { x: -W / 2, y: -H / 2, w: t, h: H },
      { x: -W / 2 + t, y: H / 2 - t, w: W - t, h: t },
    ];
  }
  return [
    { x: W / 2 - t, y: -H / 2, w: t, h: H },
    { x: -W / 2, y: H / 2 - t, w: W - t, h: t },
  ];
}

export function furnitureCollisionBoxes(
  item: FurnitureItem,
  widthPx: number,
  heightPx: number,
  pixelsPerInch: number,
): { x: number; y: number; w: number; h: number; rotation: number }[] {
  const shape = effectiveShape(item);
  if (shape.type !== "l") {
    return [
      {
        x: item.x,
        y: item.y,
        w: widthPx,
        h: heightPx,
        rotation: item.rotation,
      },
    ];
  }
  const tPx = shape.thicknessIn * pixelsPerInch;
  const legs = lShapeLegsLocal(widthPx, heightPx, tPx, shape.flip);
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = widthPx / 2;
  const oy = heightPx / 2;
  return legs.map((leg) => {
    const lcx = leg.x + leg.w / 2;
    const lcy = leg.y + leg.h / 2;
    const dx = lcx - ox;
    const dy = lcy - oy;
    return {
      x: item.x + dx * cos - dy * sin,
      y: item.y + dx * sin + dy * cos,
      w: leg.w,
      h: leg.h,
      rotation: item.rotation,
    };
  });
}

export type CustomShapeDraft = {
  template: "rect" | "round" | "l";
  label: string;
  widthIn: number;
  depthIn: number;
  thicknessIn: number;
  flip: boolean;
};

export function draftToShape(draft: CustomShapeDraft): FurnitureShape {
  if (draft.template === "round") return { type: "round" };
  if (draft.template === "l") {
    return {
      type: "l",
      thicknessIn: draft.thicknessIn,
      flip: draft.flip,
    };
  }
  return { type: "rect" };
}

export function defaultDraft(template: CustomShapeDraft["template"]): CustomShapeDraft {
  if (template === "round") {
    return {
      template: "round",
      label: "Round table",
      widthIn: 36,
      depthIn: 36,
      thicknessIn: 36,
      flip: false,
    };
  }
  if (template === "l") {
    return {
      template: "l",
      label: "L desk",
      widthIn: 84,
      depthIn: 84,
      thicknessIn: 36,
      flip: false,
    };
  }
  return {
    template: "rect",
    label: "Custom piece",
    widthIn: 36,
    depthIn: 24,
    thicknessIn: 24,
    flip: false,
  };
}

export function draftValidationMessage(
  draft: CustomShapeDraft,
  _unitSystem: UnitSystem,
): string | null {
  if (!draft.label.trim()) return "Label is required.";
  if (draft.widthIn <= 0 || draft.depthIn <= 0) {
    return "Width and depth must be greater than zero.";
  }
  if (draft.template === "l" && !isLShapeValid(draft.widthIn, draft.depthIn, draft.thicknessIn)) {
    return "Leg thickness must be greater than zero and smaller than both outer sides.";
  }
  return null;
}
