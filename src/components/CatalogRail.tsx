import { CATALOG } from "../catalog";
import type { CatalogPreset, CustomCatalogPreset, UnitSystem } from "../types";
import { formatDimensions } from "../units";
import styles from "./CatalogRail.module.css";

type CatalogRailProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  customPresets: CustomCatalogPreset[];
  onCreate: () => void;
  onDeleteCustom: (id: string) => void;
  onPlace: (preset: CatalogPreset) => void;
};

export function CatalogRail({
  unitSystem,
  canPlace,
  customPresets,
  onCreate,
  onDeleteCustom,
  onPlace,
}: CatalogRailProps) {
  return (
    <aside className={styles.rail}>
      <h2 className={styles.heading}>Furniture</h2>

      <button type="button" className={styles.createButton} onClick={onCreate}>
        + New furniture
      </button>

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

      {customPresets.length > 0 && (
        <>
          <h2 className={styles.heading}>My furniture</h2>
          <div className={styles.list}>
            {customPresets.map((preset) => (
              <div key={preset.id} className={styles.customRow}>
                <button
                  type="button"
                  className={styles.item}
                  disabled={!canPlace}
                  onClick={() => onPlace(preset)}
                >
                  <span className={styles.label}>{preset.label}</span>
                  <span className={styles.dims}>
                    {formatDimensions(
                      preset.widthIn,
                      preset.depthIn,
                      unitSystem,
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  aria-label={`Delete ${preset.label}`}
                  onClick={() => onDeleteCustom(preset.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p className={styles.hint}>
        {canPlace
          ? "Click an item to place it on the plan. Drag to move, select to edit."
          : "Upload a floor plan and calibrate the scale to place furniture."}
      </p>
    </aside>
  );
}
