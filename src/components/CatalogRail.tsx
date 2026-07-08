import { CATALOG } from "../catalog";
import type { CatalogPreset, UnitSystem } from "../types";
import { formatDimensions } from "../units";
import styles from "./CatalogRail.module.css";

type CatalogRailProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  onPlace: (preset: CatalogPreset) => void;
};

export function CatalogRail({ unitSystem, canPlace, onPlace }: CatalogRailProps) {
  return (
    <aside className={styles.rail}>
      <h2 className={styles.heading}>Furniture</h2>
      <div className={styles.list}>
        {CATALOG.map((preset) => (
          <button
            key={`${preset.kind}-${preset.label}`}
            type="button"
            className={styles.item}
            disabled={!canPlace}
            onClick={() => onPlace(preset)}
          >
            <span className={styles.label}>{preset.label}</span>
            <span className={styles.dims}>
              {formatDimensions(preset.widthIn, preset.depthIn, unitSystem)}
            </span>
          </button>
        ))}
      </div>
      <p className={styles.hint}>
        {canPlace
          ? "Click an item to place it on the plan. Drag to move, select to edit."
          : "Upload a floor plan and calibrate the scale to place furniture."}
      </p>
    </aside>
  );
}
