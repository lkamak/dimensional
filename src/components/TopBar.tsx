import { useRef } from "react";
import type { ToolMode, UnitSystem } from "../types";
import { TopBarMenu } from "./TopBarMenu";
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

const DRAW_TOOLS: { mode: ToolMode; label: string }[] = [
  { mode: "draw-wall", label: "Wall" },
  { mode: "draw-room", label: "Room" },
  { mode: "draw-line", label: "Line" },
  { mode: "draw-rect", label: "Rect" },
];

function getToolLabel(toolMode: ToolMode): string {
  if (toolMode === "select") return "Select";
  if (toolMode === "calibrate") return "Calibrate";
  if (toolMode === "pan") return "Pan";
  return DRAW_TOOLS.find((tool) => tool.mode === toolMode)?.label ?? "Select";
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

  const imageToolItems = hasImage
    ? [
        {
          label: isConverting ? "Converting…" : "Convert to drawing",
          onClick: onConvert,
          disabled: isConverting,
        },
        {
          label: imageUnderlayVisible ? "Hide underlay" : "Show underlay",
          onClick: onToggleUnderlay,
          active: !imageUnderlayVisible,
        },
      ]
    : [];

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

        <TopBarMenu
          label="Plan"
          sections={[
            {
              items: [
                {
                  label: "Upload plan",
                  onClick: () => fileRef.current?.click(),
                },
                {
                  label: "Draw plan",
                  onClick: onDrawPlan,
                },
              ],
            },
            {
              items: [
                {
                  label: "Open",
                  onClick: onOpen,
                },
                {
                  label: "Save",
                  onClick: onSave,
                  disabled: !hasPlan || !isDirty,
                },
                {
                  label: "Save as",
                  onClick: onSaveAs,
                  disabled: !hasPlan,
                },
                {
                  label: "Save clean copy",
                  onClick: onSaveCleanAs,
                  disabled: !hasPlan,
                  title: "Save the plan, scale, and drawing without furniture",
                },
              ],
            },
          ]}
        />

        {hasPlan && (
          <>
            <TopBarMenu
              label={`Tools · ${getToolLabel(toolMode)}`}
              sections={[
                {
                  items: [
                    {
                      label: "Select",
                      onClick: () => onToolModeChange("select"),
                      active: toolMode === "select",
                    },
                    ...DRAW_TOOLS.map(({ mode, label }) => ({
                      label,
                      onClick: () => onToolModeChange(mode),
                      active: toolMode === mode,
                    })),
                  ],
                },
                {
                  items: [
                    {
                      label: "Calibrate",
                      onClick: () =>
                        onToolModeChange(
                          toolMode === "calibrate" ? "select" : "calibrate",
                        ),
                      active: toolMode === "calibrate",
                    },
                  ],
                },
                ...(imageToolItems.length > 0 ? [{ items: imageToolItems }] : []),
              ]}
            />

            <TopBarMenu
              label="Edit"
              sections={[
                {
                  items: [
                    {
                      label: "Clear furniture",
                      onClick: onClearLayout,
                      disabled: !hasPlan,
                    },
                    {
                      label: "Clear walls",
                      onClick: onClearWalls,
                      disabled: !hasWalls,
                    },
                  ],
                },
                {
                  items: [
                    {
                      label: "Reset",
                      onClick: onClearAll,
                      disabled: !hasPlan,
                      danger: true,
                    },
                  ],
                },
              ]}
            />
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
      </div>
    </header>
  );
}
