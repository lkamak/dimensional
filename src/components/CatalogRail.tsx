import { CATALOG } from "../catalog";
import { shapeTemplateLabel } from "../furnitureShape";
import type { CatalogPreset, CustomFurnitureEntry, UnitSystem } from "../types";
import { formatDimensions } from "../units";
import styles from "./CatalogRail.module.css";

type CatalogRailProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  customEntries: CustomFurnitureEntry[];
  onPlace: (preset: CatalogPreset) => void;
  onPlaceCustom: (entry: CustomFurnitureEntry) => void;
  onNewShape: () => void;
  onDeleteCustom: (id: string) => void;
};

export function CatalogRail({
  unitSystem,
  canPlace,
  customEntries,
  onPlace,
  onPlaceCustom,
  onNewShape,
  onDeleteCustom,
}: CatalogRailProps) {
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

      <div className={styles.yoursSection}>
        <div className={styles.yoursHeader}>
          <h2 className={styles.heading}>Yours</h2>
          <button
            type="button"
            className={`btn btn-ghost ${styles.newShapeBtn}`}
            onClick={onNewShape}
          >
            New shape
          </button>
        </div>
        {customEntries.length === 0 ? (
          <p className={styles.yoursEmpty}>
            Save rectangle, L, or round footprints to reuse them here.
          </p>
        ) : (
          <div className={styles.list}>
            {customEntries.map((entry) => (
              <div key={entry.id} className={styles.customRow}>
                <button
                  type="button"
                  className={styles.item}
                  disabled={!canPlace}
                  onClick={() => onPlaceCustom(entry)}
                >
                  <span className={styles.label}>{entry.label}</span>
                  <span className={styles.dims}>
                    {shapeTemplateLabel(entry.shape)} ·{" "}
                    {formatDimensions(
                      entry.widthIn,
                      entry.depthIn,
                      unitSystem,
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.removeCustom}
                  aria-label={`Remove ${entry.label} from library`}
                  onClick={() => onDeleteCustom(entry.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className={styles.hint}>
        {canPlace
          ? "Click an item to place it on the plan. Drag to move, select to edit."
          : "Upload a floor plan and calibrate the scale to place furniture."}
      </p>
    </aside>
  );
}
