import { useRef } from "react";
import type { ToolMode, UnitSystem } from "../types";
import styles from "./TopBar.module.css";

type TopBarProps = {
  unitSystem: UnitSystem;
  toolMode: ToolMode;
  hasImage: boolean;
  pixelsPerInch: number | null;
  activePlanName: string | null;
  isDirty: boolean;
  onUnitSystemChange: (system: UnitSystem) => void;
  onUpload: (dataUrl: string) => void;
  onToolModeChange: (mode: ToolMode) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onClearLayout: () => void;
  onClearAll: () => void;
};

export function TopBar({
  unitSystem,
  toolMode,
  hasImage,
  pixelsPerInch,
  activePlanName,
  isDirty,
  onUnitSystemChange,
  onUpload,
  onToolModeChange,
  onSave,
  onSaveAs,
  onOpen,
  onClearLayout,
  onClearAll,
}: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onUpload(reader.result);
    };
    reader.readAsDataURL(file);
  }

  const planLabel = activePlanName
    ? `${activePlanName}${isDirty ? " *" : ""}`
    : isDirty
      ? "Unsaved plan *"
      : null;

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.brandName}>dimensional</span>
        <span className={styles.brandTag}>floor plan</span>
        {planLabel && (
          <span className={styles.planName} title={planLabel}>
            {planLabel}
          </span>
        )}
      </div>

      <div className={styles.topbarActions}>
        <input
          ref={fileRef}
          className={styles.fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileRef.current?.click()}
        >
          Upload plan
        </button>

        <button
          type="button"
          className={`btn btn-ghost ${toolMode === "calibrate" ? "btn-active" : ""}`}
          disabled={!hasImage}
          onClick={() =>
            onToolModeChange(toolMode === "calibrate" ? "select" : "calibrate")
          }
        >
          Calibrate
        </button>

        <span className={styles.scalePill}>
          {pixelsPerInch
            ? `Scale set · 1 in = ${pixelsPerInch.toFixed(1)} px`
            : hasImage
              ? "Scale not set"
              : "No plan loaded"}
        </span>

        <div className={styles.divider} />

        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasImage}
          onClick={onOpen}
        >
          Open
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasImage || !isDirty}
          onClick={onSave}
        >
          Save
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasImage}
          onClick={onSaveAs}
        >
          Save as
        </button>

        <div className={styles.divider} />

        <div className={styles.unitToggle} role="group" aria-label="Units">
          <button
            type="button"
            className={unitSystem === "imperial" ? styles.active : undefined}
            onClick={() => onUnitSystemChange("imperial")}
          >
            ft / in
          </button>
          <button
            type="button"
            className={unitSystem === "metric" ? styles.active : undefined}
            onClick={() => onUnitSystemChange("metric")}
          >
            metric
          </button>
        </div>

        <div className={styles.divider} />

        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasImage}
          onClick={onClearLayout}
        >
          Clear furniture
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-danger"
          disabled={!hasImage}
          onClick={onClearAll}
        >
          Reset
        </button>
      </div>
    </header>
  );
}
