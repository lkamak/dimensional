import { useState } from "react";
import type { UnitSystem } from "../types";
import { displayValueToInches, inchesToDisplayValue, unitLabel } from "../units";

const DEFAULT_WIDTH_IN = 36;
const DEFAULT_DEPTH_IN = 24;

type CreateFurnitureModalProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  onCreate: (draft: { label: string; widthIn: number; depthIn: number }) => void;
  onClose: () => void;
};

export function CreateFurnitureModal({
  unitSystem,
  canPlace,
  onCreate,
  onClose,
}: CreateFurnitureModalProps) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState(() =>
    String(inchesToDisplayValue(DEFAULT_WIDTH_IN, unitSystem)),
  );
  const [depth, setDepth] = useState(() =>
    String(inchesToDisplayValue(DEFAULT_DEPTH_IN, unitSystem)),
  );

  const units = unitLabel(unitSystem);
  const widthValue = Number(width);
  const depthValue = Number(depth);
  const canSubmit =
    name.trim().length > 0 &&
    Number.isFinite(widthValue) &&
    widthValue > 0 &&
    Number.isFinite(depthValue) &&
    depthValue > 0;

  function submit() {
    if (!canSubmit) return;
    onCreate({
      label: name.trim(),
      widthIn: displayValueToInches(widthValue, unitSystem),
      depthIn: displayValueToInches(depthValue, unitSystem),
    });
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-furniture-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="create-furniture-title">Create custom furniture</h2>
        <p>
          {canPlace
            ? "Saved to your catalog and placed on the plan."
            : "Saved to your catalog. Calibrate the plan scale to place it."}
        </p>
        <div className="modal-field">
          <label htmlFor="custom-furniture-name">Name</label>
          <input
            id="custom-furniture-name"
            type="text"
            autoFocus
            maxLength={80}
            placeholder="e.g. Nightstand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <div className="modal-field-row">
          <div className="modal-field">
            <label htmlFor="custom-furniture-width">Width ({units})</label>
            <input
              id="custom-furniture-width"
              type="number"
              min={1}
              step={unitSystem === "metric" ? 1 : 0.5}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
          <div className="modal-field">
            <label htmlFor="custom-furniture-depth">Depth ({units})</label>
            <input
              id="custom-furniture-depth"
              type="number"
              min={1}
              step={unitSystem === "metric" ? 1 : 0.5}
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
