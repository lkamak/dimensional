import type { DrawElement, FurnitureItem, UnitSystem } from "../types";
import {
  displayValueToInches,
  formatLength,
  inchesToDisplayValue,
  unitLabel,
} from "../units";
import styles from "./Inspector.module.css";

type InspectorProps = {
  item: FurnitureItem | null;
  element: DrawElement | null;
  pixelsPerInch: number | null;
  unitSystem: UnitSystem;
  onChange: (id: string, patch: Partial<FurnitureItem>) => void;
  onDelete: (id: string) => void;
  onRotate: (id: string, delta: number) => void;
  onDeleteElement: (id: string) => void;
};

function elementLengthPx(el: DrawElement): number {
  return Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
}

function elementLabel(kind: DrawElement["kind"]): string {
  switch (kind) {
    case "wall":
      return "Wall segment";
    case "room":
      return "Room";
    case "line":
      return "Line";
    case "rect":
      return "Rectangle";
  }
}

export function Inspector({
  item,
  element,
  pixelsPerInch,
  unitSystem,
  onChange,
  onDelete,
  onRotate,
  onDeleteElement,
}: InspectorProps) {
  if (element && !item) {
    const lengthPx = elementLengthPx(element);
    const lengthIn = pixelsPerInch ? lengthPx / pixelsPerInch : null;
    const isLineLike = element.kind === "wall" || element.kind === "line";

    return (
      <aside className={styles.inspector}>
        <h2 className={styles.heading}>{elementLabel(element.kind)}</h2>
        {isLineLike ? (
          <p className={styles.sub}>
            {lengthIn != null
              ? formatLength(lengthIn, unitSystem)
              : `${Math.round(lengthPx)} px`}
            {lengthIn == null && pixelsPerInch == null
              ? " (set scale to see real length)"
              : ""}
          </p>
        ) : (
          <p className={styles.sub}>Selected drawing element</p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={() => onDeleteElement(element.id)}
          >
            Delete
          </button>
        </div>
      </aside>
    );
  }

  if (!item) {
    return (
      <aside className={styles.empty}>
        Select furniture or a drawing to edit. Use draw tools or Convert to
        drawing to add editable geometry.
      </aside>
    );
  }

  const widthDisplay = inchesToDisplayValue(item.widthIn, unitSystem);
  const depthDisplay = inchesToDisplayValue(item.depthIn, unitSystem);
  const label = unitLabel(unitSystem);

  return (
    <aside className={styles.inspector}>
      <h2 className={styles.heading}>{item.label}</h2>
      <p className={styles.sub}>{item.kind.replace("_", " ")}</p>

      <div className="field">
        <label htmlFor="item-label">Label</label>
        <input
          id="item-label"
          value={item.label}
          onChange={(e) => onChange(item.id, { label: e.target.value })}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="item-width">Width ({label})</label>
          <input
            id="item-width"
            type="number"
            min={1}
            step={unitSystem === "metric" ? 1 : 0.5}
            value={widthDisplay}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v <= 0) return;
              onChange(item.id, {
                widthIn: displayValueToInches(v, unitSystem),
              });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="item-depth">Depth ({label})</label>
          <input
            id="item-depth"
            type="number"
            min={1}
            step={unitSystem === "metric" ? 1 : 0.5}
            value={depthDisplay}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v <= 0) return;
              onChange(item.id, {
                depthIn: displayValueToInches(v, unitSystem),
              });
            }}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="item-rotation">Rotation (°)</label>
        <input
          id="item-rotation"
          type="number"
          step={15}
          value={Math.round(item.rotation)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            onChange(item.id, { rotation: v });
          }}
        />
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onRotate(item.id, -15)}
        >
          Rotate −15°
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onRotate(item.id, 15)}
        >
          Rotate +15°
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-danger"
          onClick={() => onDelete(item.id)}
        >
          Delete
        </button>
      </div>
    </aside>
  );
}
