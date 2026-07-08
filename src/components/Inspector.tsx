import type { FurnitureItem, UnitSystem } from "../types";
import {
  displayValueToInches,
  inchesToDisplayValue,
  unitLabel,
} from "../units";
import styles from "./Inspector.module.css";

type InspectorProps = {
  item: FurnitureItem | null;
  unitSystem: UnitSystem;
  onChange: (id: string, patch: Partial<FurnitureItem>) => void;
  onDelete: (id: string) => void;
  onRotate: (id: string, delta: number) => void;
};

export function Inspector({
  item,
  unitSystem,
  onChange,
  onDelete,
  onRotate,
}: InspectorProps) {
  if (!item) {
    return (
      <aside className={styles.empty}>
        Select a piece of furniture to edit its label, size, and rotation.
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
