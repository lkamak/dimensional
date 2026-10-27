import { useState } from "react";
import { CATALOG } from "../catalog";
import type { CatalogPreset, UnitSystem } from "../types";
import { displayValueToInches, formatDimensions, unitLabel } from "../units";
import styles from "./CatalogRail.module.css";

type CatalogRailProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  onPlace: (preset: CatalogPreset) => void;
};

export function CatalogRail({ unitSystem, canPlace, onPlace }: CatalogRailProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customWidth, setCustomWidth] = useState("");
  const [customDepth, setCustomDepth] = useState("");

  const label = unitLabel(unitSystem);
  const widthNum = Number(customWidth);
  const depthNum = Number(customDepth);
  const canPlaceCustom =
    canPlace &&
    Number.isFinite(widthNum) &&
    widthNum > 0 &&
    Number.isFinite(depthNum) &&
    depthNum > 0;

  function handlePlaceCustom() {
    if (!canPlaceCustom) return;
    const preset: CatalogPreset = {
      kind: "custom",
      label: customName.trim() || "Custom",
      widthIn: displayValueToInches(widthNum, unitSystem),
      depthIn: displayValueToInches(depthNum, unitSystem),
    };
    onPlace(preset);
  }

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

      <div className={styles.customSection}>
        <button
          type="button"
          className={`btn btn-ghost ${styles.customToggle} ${customOpen ? styles.customToggleOpen : ""}`}
          disabled={!canPlace && !customOpen}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
        >
          Custom size
        </button>

        {customOpen && (
          <div className={styles.customForm}>
            <div className="field">
              <label htmlFor="custom-furniture-name">Name</label>
              <input
                id="custom-furniture-name"
                type="text"
                placeholder="Custom"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="custom-furniture-width">Width ({label})</label>
                <input
                  id="custom-furniture-width"
                  type="number"
                  min={0.1}
                  step={unitSystem === "metric" ? 1 : 0.5}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="custom-furniture-depth">Depth ({label})</label>
                <input
                  id="custom-furniture-depth"
                  type="number"
                  min={0.1}
                  step={unitSystem === "metric" ? 1 : 0.5}
                  value={customDepth}
                  onChange={(e) => setCustomDepth(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canPlaceCustom}
              onClick={handlePlaceCustom}
            >
              Place
            </button>
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
