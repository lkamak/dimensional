import { CATALOG } from "../catalog";
import type { CatalogPreset, CustomCatalogPreset, UnitSystem } from "../types";
import { formatDimensions } from "../units";
import styles from "./CatalogRail.module.css";

type CatalogRailProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  customCatalog: CustomCatalogPreset[];
  onPlace: (preset: CatalogPreset) => void;
  onCreate: () => void;
  onDeleteCustom: (id: string) => void;
};

function PresetButton({
  preset,
  unitSystem,
  canPlace,
  onPlace,
}: {
  preset: CatalogPreset;
  unitSystem: UnitSystem;
  canPlace: boolean;
  onPlace: (preset: CatalogPreset) => void;
}) {
  return (
    <button
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
  );
}

export function CatalogRail({
  unitSystem,
  canPlace,
  customCatalog,
  onPlace,
  onCreate,
  onDeleteCustom,
}: CatalogRailProps) {
  return (
    <aside className={styles.rail}>
      <h2 className={styles.heading}>Furniture</h2>
      <div className={styles.list}>
        {CATALOG.map((preset) => (
          <PresetButton
            key={`${preset.kind}-${preset.label}`}
            preset={preset}
            unitSystem={unitSystem}
            canPlace={canPlace}
            onPlace={onPlace}
          />
        ))}
      </div>
      <button
        type="button"
        className={`btn btn-ghost ${styles.create}`}
        onClick={onCreate}
      >
        Create custom…
      </button>
      {customCatalog.length > 0 && (
        <>
          <h2 className={styles.heading}>Custom</h2>
          <div className={styles.list}>
            {customCatalog.map((preset) => (
              <div key={preset.id} className={styles.customRow}>
                <PresetButton
                  preset={preset}
                  unitSystem={unitSystem}
                  canPlace={canPlace}
                  onPlace={onPlace}
                />
                <button
                  type="button"
                  className={styles.delete}
                  aria-label={`Delete ${preset.label}`}
                  onClick={() => onDeleteCustom(preset.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className={styles.hint}>
        {canPlace
          ? "Click an item to place it. Create custom pieces anytime; drag to move, select to edit."
          : "Create custom furniture anytime. Upload a floor plan and calibrate the scale to place it."}
      </p>
    </aside>
  );
}
