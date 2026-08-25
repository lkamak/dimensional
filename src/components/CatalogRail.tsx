import { useState } from "react";
import { CATALOG } from "../catalog";
import type { CatalogPreset, UnitSystem } from "../types";
import {
  displayValueToInches,
  formatDimensions,
  inchesToDisplayValue,
  unitLabel,
} from "../units";
import styles from "./CatalogRail.module.css";

type RailTab = "catalog" | "build";

const DEFAULT_LABEL = "Custom";
const DEFAULT_WIDTH_IN = 36;
const DEFAULT_DEPTH_IN = 24;

type CatalogRailProps = {
  unitSystem: UnitSystem;
  canPlace: boolean;
  onPlace: (preset: CatalogPreset) => void;
};

export function CatalogRail({ unitSystem, canPlace, onPlace }: CatalogRailProps) {
  const [tab, setTab] = useState<RailTab>("catalog");
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [widthIn, setWidthIn] = useState(DEFAULT_WIDTH_IN);
  const [depthIn, setDepthIn] = useState(DEFAULT_DEPTH_IN);

  const dimLabel = unitLabel(unitSystem);
  const widthDisplay = inchesToDisplayValue(widthIn, unitSystem);
  const depthDisplay = inchesToDisplayValue(depthIn, unitSystem);
  const canSubmitBuild =
    canPlace &&
    label.trim().length > 0 &&
    widthIn > 0 &&
    depthIn > 0;

  const handlePlaceBuilt = () => {
    if (!canSubmitBuild) return;
    onPlace({
      kind: "custom",
      label: label.trim(),
      widthIn,
      depthIn,
    });
  };

  return (
    <aside className={styles.rail}>
      <div className={styles.tabs} role="tablist" aria-label="Furniture menu">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "catalog"}
          className={tab === "catalog" ? styles.tabActive : styles.tab}
          onClick={() => setTab("catalog")}
        >
          Catalog
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "build"}
          className={tab === "build" ? styles.tabActive : styles.tab}
          onClick={() => setTab("build")}
        >
          Build
        </button>
      </div>

      {tab === "catalog" ? (
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
      ) : (
        <form
          className={styles.buildForm}
          onSubmit={(e) => {
            e.preventDefault();
            handlePlaceBuilt();
          }}
        >
          <div className="field">
            <label htmlFor="build-label">Label</label>
            <input
              id="build-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={!canPlace}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="build-width">Width ({dimLabel})</label>
              <input
                id="build-width"
                type="number"
                min={1}
                step={unitSystem === "metric" ? 1 : 0.5}
                value={widthDisplay}
                disabled={!canPlace}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v <= 0) return;
                  setWidthIn(displayValueToInches(v, unitSystem));
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="build-depth">Depth ({dimLabel})</label>
              <input
                id="build-depth"
                type="number"
                min={1}
                step={unitSystem === "metric" ? 1 : 0.5}
                value={depthDisplay}
                disabled={!canPlace}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v <= 0) return;
                  setDepthIn(displayValueToInches(v, unitSystem));
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmitBuild}
          >
            Place piece
          </button>
        </form>
      )}

      <p className={styles.hint}>
        {canPlace
          ? tab === "catalog"
            ? "Click an item to place it on the plan. Drag to move, select to edit."
            : "Set dimensions and place a custom piece on the plan."
          : "Upload a floor plan and calibrate the scale to place furniture."}
      </p>
    </aside>
  );
}
