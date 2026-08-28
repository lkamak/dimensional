import { useEffect, useId, useRef, useState } from "react";
import type { ToolMode, UnitSystem } from "../types";
import styles from "./TopBar.module.css";

type TopBarProps = {
  unitSystem: UnitSystem;
  toolMode: ToolMode;
  hasPlan: boolean;
  hasImage: boolean;
  pixelsPerInch: number | null;
  hasWalls: boolean;
  imageUnderlayVisible: boolean;
  isConverting: boolean;
  activePlanName: string | null;
  isDirty: boolean;
  onUnitSystemChange: (system: UnitSystem) => void;
  onUpload: (dataUrl: string) => void;
  onDrawPlan: () => void;
  onToolModeChange: (mode: ToolMode) => void;
  onConvert: () => void;
  onToggleUnderlay: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSaveCleanAs: () => void;
  onOpen: () => void;
  onClearLayout: () => void;
  onClearWalls: () => void;
  onClearAll: () => void;
};

const TOOL_OPTIONS: { mode: ToolMode; label: string }[] = [
  { mode: "select", label: "Select" },
  { mode: "draw-wall", label: "Wall" },
  { mode: "draw-room", label: "Room" },
  { mode: "draw-line", label: "Line" },
  { mode: "draw-rect", label: "Rect" },
  { mode: "calibrate", label: "Calibrate" },
];

function toolLabel(mode: ToolMode): string {
  return TOOL_OPTIONS.find((tool) => tool.mode === mode)?.label ?? "Tools";
}

export function TopBar({
  unitSystem,
  toolMode,
  hasPlan,
  hasImage,
  pixelsPerInch,
  hasWalls,
  imageUnderlayVisible,
  isConverting,
  activePlanName,
  isDirty,
  onUnitSystemChange,
  onUpload,
  onDrawPlan,
  onToolModeChange,
  onConvert,
  onToggleUnderlay,
  onSave,
  onSaveAs,
  onSaveCleanAs,
  onOpen,
  onClearLayout,
  onClearWalls,
  onClearAll,
}: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toolMenuRef = useRef<HTMLDivElement>(null);
  const toolMenuId = useId();
  const [toolMenuOpen, setToolMenuOpen] = useState(false);

  useEffect(() => {
    if (!hasPlan) setToolMenuOpen(false);
  }, [hasPlan]);

  useEffect(() => {
    if (!toolMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (
        toolMenuRef.current &&
        !toolMenuRef.current.contains(event.target as Node)
      ) {
        setToolMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setToolMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [toolMenuOpen]);

  function chooseTool(mode: ToolMode) {
    if (mode !== toolMode) onToolModeChange(mode);
    setToolMenuOpen(false);
  }

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
        <button type="button" className="btn btn-ghost" onClick={onDrawPlan}>
          Draw plan
        </button>

        {hasPlan && (
          <>
            <div className={styles.divider} />

            <div className={styles.toolMenu} ref={toolMenuRef}>
              <button
                type="button"
                className={`btn btn-ghost ${toolMenuOpen ? "btn-active" : ""}`}
                aria-haspopup="menu"
                aria-expanded={toolMenuOpen}
                aria-controls={toolMenuId}
                onClick={() => setToolMenuOpen((open) => !open)}
              >
                {toolLabel(toolMode)}
                <span className={styles.caret} aria-hidden="true" />
              </button>
              {toolMenuOpen && (
                <div
                  id={toolMenuId}
                  className={styles.toolMenuList}
                  role="menu"
                  aria-label="Drawing tools"
                >
                  {TOOL_OPTIONS.map(({ mode, label }) => (
                    <button
                      key={mode}
                      type="button"
                      role="menuitem"
                      className={`${styles.toolMenuItem} ${
                        toolMode === mode ? styles.toolMenuItemActive : ""
                      }`}
                      onClick={() => chooseTool(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {hasImage && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isConverting}
                  onClick={onConvert}
                >
                  {isConverting ? "Converting…" : "Convert to drawing"}
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost ${imageUnderlayVisible ? "" : "btn-active"}`}
                  onClick={onToggleUnderlay}
                >
                  {imageUnderlayVisible ? "Hide underlay" : "Show underlay"}
                </button>
              </>
            )}
          </>
        )}

        <span className={styles.scalePill}>
          {pixelsPerInch
            ? `Scale set · 1 in = ${pixelsPerInch.toFixed(1)} px`
            : hasPlan
              ? "Scale not set"
              : "No plan loaded"}
          {hasWalls ? " · walls editable" : ""}
        </span>

        <div className={styles.divider} />

        <button
          type="button"
          className="btn btn-ghost"
          onClick={onOpen}
        >
          Open
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasPlan || !isDirty}
          onClick={onSave}
        >
          Save
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasPlan}
          onClick={onSaveAs}
        >
          Save as
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasPlan}
          onClick={onSaveCleanAs}
          title="Save the plan, scale, and drawing without furniture"
        >
          Save clean copy
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
          disabled={!hasPlan}
          onClick={onClearLayout}
        >
          Clear furniture
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasWalls}
          onClick={onClearWalls}
        >
          Clear walls
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-danger"
          disabled={!hasPlan}
          onClick={onClearAll}
        >
          Reset
        </button>
      </div>
    </header>
  );
}
