import { useMemo, useState } from "react";
import {
  defaultDraft,
  draftToShape,
  draftValidationMessage,
  type CustomShapeDraft,
} from "../furnitureShape";
import type { UnitSystem } from "../types";
import {
  displayValueToInches,
  inchesToDisplayValue,
  unitLabel,
} from "../units";
import { FurnitureShapePreview } from "./FurnitureShapePreview";
import styles from "./NewShapeModal.module.css";

type NewShapeModalProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  onSave: (draft: CustomShapeDraft) => void;
  onSaveAndPlace: (draft: CustomShapeDraft) => void;
  onClose: () => void;
};

const TEMPLATES: { id: CustomShapeDraft["template"]; label: string }[] = [
  { id: "rect", label: "Rectangle" },
  { id: "l", label: "L-shape" },
  { id: "round", label: "Round" },
];

export function NewShapeModal({
  unitSystem,
  canPlace,
  onSave,
  onSaveAndPlace,
  onClose,
}: NewShapeModalProps) {
  const [draft, setDraft] = useState<CustomShapeDraft>(() =>
    defaultDraft("rect"),
  );

  const validation = draftValidationMessage(draft, unitSystem);
  const shape = useMemo(() => draftToShape(draft), [draft]);
  const dimLabel = unitLabel(unitSystem);

  const setTemplate = (template: CustomShapeDraft["template"]) => {
    setDraft((prev) => {
      const next = defaultDraft(template);
      return { ...next, label: prev.label.trim() ? prev.label : next.label };
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`modal ${styles.modal}`}>
        <h2>New shape</h2>
        <p>Create a reusable footprint for the furniture rail.</p>

        <div className={styles.templateRow} role="tablist" aria-label="Shape">
          {TEMPLATES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={draft.template === id}
              className={
                draft.template === id ? styles.templateActive : styles.template
              }
              onClick={() => setTemplate(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          <div className={styles.previewWrap}>
            <FurnitureShapePreview
              widthIn={draft.widthIn}
              depthIn={draft.depthIn}
              shape={shape}
            />
          </div>

          <div className={styles.fields}>
            <div className="field">
              <label htmlFor="shape-label">Label</label>
              <input
                id="shape-label"
                value={draft.label}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, label: e.target.value }))
                }
                autoFocus
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="shape-width">Width ({dimLabel})</label>
                <input
                  id="shape-width"
                  type="number"
                  min={0.1}
                  step={unitSystem === "metric" ? 1 : 0.5}
                  value={inchesToDisplayValue(draft.widthIn, unitSystem)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v <= 0) return;
                    setDraft((d) => ({
                      ...d,
                      widthIn: displayValueToInches(v, unitSystem),
                    }));
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="shape-depth">Depth ({dimLabel})</label>
                <input
                  id="shape-depth"
                  type="number"
                  min={0.1}
                  step={unitSystem === "metric" ? 1 : 0.5}
                  value={inchesToDisplayValue(draft.depthIn, unitSystem)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v <= 0) return;
                    setDraft((d) => ({
                      ...d,
                      depthIn: displayValueToInches(v, unitSystem),
                    }));
                  }}
                />
              </div>
            </div>

            {draft.template === "l" && (
              <>
                <div className="field">
                  <label htmlFor="shape-thickness">
                    Leg thickness ({dimLabel})
                  </label>
                  <input
                    id="shape-thickness"
                    type="number"
                    min={0.1}
                    step={unitSystem === "metric" ? 1 : 0.5}
                    value={inchesToDisplayValue(draft.thicknessIn, unitSystem)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v) || v <= 0) return;
                      setDraft((d) => ({
                        ...d,
                        thicknessIn: displayValueToInches(v, unitSystem),
                      }));
                    }}
                  />
                </div>
                <label className={styles.flipRow}>
                  <input
                    type="checkbox"
                    checked={draft.flip}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, flip: e.target.checked }))
                    }
                  />
                  Return on the right (flipped)
                </label>
              </>
            )}

            {validation && (
              <p className={styles.validation} role="alert">
                {validation}
              </p>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={validation != null}
            onClick={() => onSave(draft)}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={validation != null || !canPlace}
            title={
              canPlace
                ? undefined
                : "Calibrate scale on a plan to place furniture"
            }
            onClick={() => onSaveAndPlace(draft)}
          >
            Save and place
          </button>
        </div>
      </div>
    </div>
  );
}
