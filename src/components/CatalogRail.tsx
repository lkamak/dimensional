import { useState } from "react";
import {
  CATALOG,
  DEFAULT_CUSTOM_SIZE,
  FURNITURE_KIND_OPTIONS,
} from "../catalog";
import type {
  CatalogPreset,
  CustomCatalogPreset,
  FurnitureKind,
  UnitSystem,
} from "../types";
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
  onCreate: (preset: CatalogPreset) => void;
  onDeleteCustom: (id: string) => void;
};

type Draft = {
  label: string;
  kind: FurnitureKind;
  widthIn: number;
  depthIn: number;
};

const EMPTY_DRAFT: Draft = {
  label: "",
  kind: "custom",
  widthIn: DEFAULT_CUSTOM_SIZE.widthIn,
  depthIn: DEFAULT_CUSTOM_SIZE.depthIn,
};

export function CatalogRail({
  unitSystem,
  canPlace,
  customPresets,
  onPlace,
  onCreate,
  onDeleteCustom,
}: CatalogRailProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const label = unitLabel(unitSystem);
  const canSubmit =
    draft.label.trim().length > 0 && draft.widthIn > 0 && draft.depthIn > 0;

  function resetForm() {
    setDraft(EMPTY_DRAFT);
    setFormOpen(false);
  }

  function submitDraft() {
    const trimmed = draft.label.trim();
    if (!trimmed || draft.widthIn <= 0 || draft.depthIn <= 0) return;
    onCreate({
      kind: draft.kind,
      label: trimmed,
      widthIn: draft.widthIn,
      depthIn: draft.depthIn,
    });
    resetForm();
  }

  function renderPresetButton(preset: CatalogPreset, key: string) {
    return (
      <button
        key={key}
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

  return (
    <aside className={styles.rail}>
      <h2 className={styles.heading}>Furniture</h2>

      <button
        type="button"
        className={`btn btn-ghost ${styles.createToggle}`}
        aria-expanded={formOpen}
        onClick={() => {
          if (formOpen) {
            resetForm();
            return;
          }
          setFormOpen(true);
        }}
      >
        {formOpen ? "Cancel" : "New furniture"}
      </button>

      {formOpen && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            submitDraft();
          }}
        >
          <div className="field">
            <label htmlFor="new-furniture-label">Name</label>
            <input
              id="new-furniture-label"
              type="text"
              autoFocus
              maxLength={80}
              placeholder="e.g. Sideboard"
              value={draft.label}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, label: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="new-furniture-kind">Type</label>
            <select
              id="new-furniture-kind"
              value={draft.kind}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  kind: e.target.value as FurnitureKind,
                }))
              }
            >
              {FURNITURE_KIND_OPTIONS.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="new-furniture-width">Width ({label})</label>
              <input
                id="new-furniture-width"
                type="number"
                min={1}
                step={unitSystem === "metric" ? 1 : 0.5}
                value={inchesToDisplayValue(draft.widthIn, unitSystem)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v <= 0) return;
                  setDraft((prev) => ({
                    ...prev,
                    widthIn: displayValueToInches(v, unitSystem),
                  }));
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="new-furniture-depth">Depth ({label})</label>
              <input
                id="new-furniture-depth"
                type="number"
                min={1}
                step={unitSystem === "metric" ? 1 : 0.5}
                value={inchesToDisplayValue(draft.depthIn, unitSystem)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v <= 0) return;
                  setDraft((prev) => ({
                    ...prev,
                    depthIn: displayValueToInches(v, unitSystem),
                  }));
                }}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit}
            >
              Add to catalog
            </button>
          </div>
        </form>
      )}

      {customPresets.length > 0 && (
        <>
          <h3 className={styles.section}>Yours</h3>
          <div className={styles.list}>
            {customPresets.map((preset) => (
              <div key={preset.id} className={styles.customRow}>
                {renderPresetButton(preset, preset.id)}
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${preset.label} from catalog`}
                  onClick={() => onDeleteCustom(preset.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className={styles.section}>Catalog</h3>
      <div className={styles.list}>
        {CATALOG.map((preset) =>
          renderPresetButton(preset, `${preset.kind}-${preset.label}`),
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
