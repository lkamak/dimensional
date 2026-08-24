import { useCallback, useState } from "react";
import type { CustomCatalogPreset, FurnitureKind, UnitSystem } from "../types";
import {
  displayValueToInches,
  inchesToDisplayValue,
  unitLabel,
} from "../units";

type CustomFurnitureModalProps = {
  unitSystem: UnitSystem;
  onCancel: () => void;
  onCreate: (preset: Omit<CustomCatalogPreset, "id">) => void;
};

const KIND_OPTIONS: { value: FurnitureKind; label: string }[] = [
  { value: "couch", label: "Couch" },
  { value: "tv_console", label: "TV console" },
  { value: "desk", label: "Desk" },
  { value: "bed", label: "Bed" },
  { value: "chair", label: "Chair" },
  { value: "table", label: "Table" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_WIDTH_IN = 36;
const DEFAULT_DEPTH_IN = 24;

type FormState = {
  label: string;
  kind: FurnitureKind;
  widthIn: number;
  depthIn: number;
};

function defaultFormState(): FormState {
  return {
    label: "",
    kind: "custom",
    widthIn: DEFAULT_WIDTH_IN,
    depthIn: DEFAULT_DEPTH_IN,
  };
}

export function CustomFurnitureModal({
  unitSystem,
  onCancel,
  onCreate,
}: CustomFurnitureModalProps) {
  const [form, setForm] = useState<FormState>(defaultFormState);

  const canSave =
    form.label.trim().length > 0 &&
    form.widthIn > 0 &&
    form.depthIn > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onCreate({
      kind: form.kind,
      label: form.label.trim(),
      widthIn: form.widthIn,
      depthIn: form.depthIn,
    });
  }, [canSave, form, onCreate]);

  const dimLabel = unitLabel(unitSystem);
  const widthDisplay = inchesToDisplayValue(form.widthIn, unitSystem);
  const depthDisplay = inchesToDisplayValue(form.depthIn, unitSystem);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-furniture-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="custom-furniture-title">New furniture</h2>
        <p>
          Save a reusable preset to your catalog. You can place it on the plan
          anytime after calibrating the scale.
        </p>

        <div className="modal-field">
          <label htmlFor="custom-furniture-name">Name</label>
          <input
            id="custom-furniture-name"
            type="text"
            autoFocus
            maxLength={80}
            placeholder="e.g. Reading nook chair"
            value={form.label}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, label: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
          />
        </div>

        <div className="modal-field">
          <label htmlFor="custom-furniture-kind">Kind</label>
          <select
            id="custom-furniture-kind"
            value={form.kind}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                kind: e.target.value as FurnitureKind,
              }))
            }
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="modal-field">
            <label htmlFor="custom-furniture-width">Width ({dimLabel})</label>
            <input
              id="custom-furniture-width"
              type="number"
              min={1}
              step={unitSystem === "metric" ? 1 : 0.5}
              value={widthDisplay}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v) || v <= 0) return;
                setForm((prev) => ({
                  ...prev,
                  widthIn: displayValueToInches(v, unitSystem),
                }));
              }}
            />
          </div>
          <div className="modal-field">
            <label htmlFor="custom-furniture-depth">Depth ({dimLabel})</label>
            <input
              id="custom-furniture-depth"
              type="number"
              min={1}
              step={unitSystem === "metric" ? 1 : 0.5}
              value={depthDisplay}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v) || v <= 0) return;
                setForm((prev) => ({
                  ...prev,
                  depthIn: displayValueToInches(v, unitSystem),
                }));
              }}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
