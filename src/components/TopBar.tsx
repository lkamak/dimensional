import { useCallback, useRef, useState } from "react";
import type { ToolMode, UnitSystem } from "../types";
import { Menu, type MenuItem } from "./Menu";
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

const TOOLS: { mode: ToolMode; label: string }[] = [
  { mode: "select", label: "Select" },
  { mode: "draw-wall", label: "Wall" },
  { mode: "draw-room", label: "Room" },
  { mode: "draw-line", label: "Line" },
  { mode: "draw-rect", label: "Rect" },
];

type OpenMenu = "file" | "tool" | "view" | "edit" | null;

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
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  const handleMenuChange = useCallback((id: OpenMenu) => {
    return (nextOpen: boolean) => setOpenMenu(nextOpen ? id : null);
  }, []);

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

  const fileItems: MenuItem[] = [
    {
      type: "item",
      label: "Upload plan",
      onSelect: () => fileRef.current?.click(),
    },
    { type: "item", label: "Draw plan", onSelect: onDrawPlan },
    { type: "separator" },
    { type: "item", label: "Open…", onSelect: onOpen },
    {
      type: "item",
      label: "Save",
      disabled: !hasPlan || !isDirty,
      onSelect: onSave,
    },
    {
      type: "item",
      label: "Save as…",
      disabled: !hasPlan,
      onSelect: onSaveAs,
    },
    {
      type: "item",
      label: "Save clean copy…",
      disabled: !hasPlan,
      title: "Save the plan, scale, and drawing without furniture",
      onSelect: onSaveCleanAs,
    },
  ];

  const toolLabel =
    TOOLS.find(({ mode }) => mode === toolMode)?.label ?? "Tool";

  const toolItems: MenuItem[] = TOOLS.map(({ mode, label }) => ({
    type: "item",
    label,
    active: toolMode === mode,
    onSelect: () => onToolModeChange(mode),
  }));
  toolItems.splice(1, 0, { type: "separator" });

  const viewItems: MenuItem[] = [
    {
      type: "item",
      label: "Calibrate scale",
      active: toolMode === "calibrate",
      onSelect: () =>
        onToolModeChange(toolMode === "calibrate" ? "select" : "calibrate"),
    },
    ...(hasImage
      ? ([
          {
            type: "item",
            label: isConverting ? "Converting…" : "Convert to drawing",
            disabled: isConverting,
            onSelect: onConvert,
          },
          {
            type: "item",
            label: imageUnderlayVisible ? "Hide underlay" : "Show underlay",
            active: !imageUnderlayVisible,
            onSelect: onToggleUnderlay,
          },
        ] satisfies MenuItem[])
      : []),
  ];

  const editItems: MenuItem[] = [
    {
      type: "item",
      label: "Clear furniture",
      disabled: !hasPlan,
      onSelect: onClearLayout,
    },
    {
      type: "item",
      label: "Clear walls",
      disabled: !hasWalls,
      onSelect: onClearWalls,
    },
    { type: "separator" },
    {
      type: "item",
      label: "Reset plan",
      danger: true,
      disabled: !hasPlan,
      onSelect: onClearAll,
    },
  ];

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

        <Menu
          id="file"
          label="File"
          open={openMenu === "file"}
          onOpenChange={handleMenuChange("file")}
          items={fileItems}
        />

        {hasPlan && (
          <Menu
            id="tool"
            label={toolLabel}
            open={openMenu === "tool"}
            onOpenChange={handleMenuChange("tool")}
            items={toolItems}
          />
        )}

        {hasPlan && (
          <Menu
            id="view"
            label="View"
            open={openMenu === "view"}
            onOpenChange={handleMenuChange("view")}
            items={viewItems}
          />
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

        <Menu
          id="edit"
          label="Edit"
          align="end"
          open={openMenu === "edit"}
          onOpenChange={handleMenuChange("edit")}
          items={editItems}
        />
      </div>
    </header>
  );
}
