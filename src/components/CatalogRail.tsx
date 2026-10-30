import { useState } from "react";
import { CATALOG } from "../catalog";
import type { CatalogPreset, CustomCatalogPreset, UnitSystem } from "../types";
import {
  displayValueToInches,
  formatDimensions,
  inchesToDisplayValue,
  unitLabel,
} from "../units";
import styles from "./CatalogRail.module.css";

type CatalogRailProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  customPresets: CustomCatalogPreset[];
  onPlace: (preset: CatalogPreset) => void;
  onCreateCustom: (input: {
    label: string;
    widthIn: number;
    depthIn: number;
  }) => void;
  onDeleteCustom: (id: string) => void;
};

function PresetButton({
  preset,
  unitSystem,
  canPlace,
  onPlace,
  onDelete,
}: {
  preset: CatalogPreset | CustomCatalogPreset;
  unitSystem: UnitSystem;
  canPlace: boolean;
  onPlace: (preset: CatalogPreset) => void;
  onDelete?: () => void;
}) {
  return (
    <div className={styles.itemRow}>
      <button
        type="button"
        className={styles.item}
        disabled={!canPlace}
        onClick={() =>
          onPlace({
            kind: preset.kind,
            label: preset.label,
            widthIn: preset.widthIn,
            depthIn: preset.depthIn,
          })
        }
      >
        <span className={styles.label}>{preset.label}</span>
        <span className={styles.dims}>
          {formatDimensions(preset.widthIn, preset.depthIn, unitSystem)}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          className={styles.removePreset}
          aria-label={`Remove ${preset.label} from catalog`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function CatalogRail({
  unitSystem,
  canPlace,
  customPresets,
  onPlace,
  onCreateCustom,
  onDeleteCustom,
}: CatalogRailProps) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const dimLabel = unitLabel(unitSystem);
  const widthStep = unitSystem === "metric" ? 1 : 0.5;
  const defaultWidth =
    unitSystem === "metric"
      ? String(inchesToDisplayValue(36, unitSystem))
      : "36";
  const defaultDepth =
    unitSystem === "metric"
      ? String(inchesToDisplayValue(24, unitSystem))
      : "24";

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Enter a name.");
      return;
    }
    const w = Number(width || defaultWidth);
    const d = Number(depth || defaultDepth);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(d) || d <= 0) {
      setFormError("Width and depth must be greater than zero.");
      return;
    }
    onCreateCustom({
      label: trimmed,
      widthIn: displayValueToInches(w, unitSystem),
      depthIn: displayValueToInches(d, unitSystem),
    });
    setName("");
    setWidth("");
    setDepth("");
  }

  return (
    <aside className={styles.rail}>
      <h2 className={styles.heading}>Create custom</h2>
      <form className={styles.createForm} onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="custom-name">Name</label>
          <input
            id="custom-name"
            type="text"
            value={name}
            placeholder="e.g. Bookshelf"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="custom-width">Width ({dimLabel})</label>
            <input
              id="custom-width"
              type="number"
              min={widthStep}
              step={widthStep}
              placeholder={defaultWidth}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="custom-depth">Depth ({dimLabel})</label>
            <input
              id="custom-depth"
              type="number"
              min={widthStep}
              step={widthStep}
              placeholder={defaultDepth}
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
            />
          </div>
        </div>
        {formError && (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn btn-primary createSubmit">
          Create
        </button>
      </form>

      {customPresets.length > 0 && (
        <>
          <h2 className={styles.heading}>Yours</h2>
          <div className={styles.list}>
            {customPresets.map((preset) => (
              <PresetButton
                key={preset.id}
                preset={preset}
                unitSystem={unitSystem}
                canPlace={canPlace}
                onPlace={onPlace}
                onDelete={() => onDeleteCustom(preset.id)}
              />
            ))}
          </div>
        </>
      )}

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
      <p className={styles.hint}>
        {canPlace
          ? "Create a custom piece or click a catalog item to place it. Drag to move, select to edit."
          : "Upload a floor plan and calibrate the scale to place furniture."}
      </p>
    </aside>
  );
}
