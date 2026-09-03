import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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

type MenuId = "plan" | "tools" | "edit";

const DRAW_TOOLS: { mode: ToolMode; label: string }[] = [
  { mode: "draw-wall", label: "Wall" },
  { mode: "draw-room", label: "Room" },
  { mode: "draw-line", label: "Line" },
  { mode: "draw-rect", label: "Rect" },
];

type MenuItemProps = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  title?: string;
};

function MenuItem({
  label,
  onClick,
  disabled,
  active,
  danger,
  title,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${styles.menuItem} ${active ? styles.menuItemActive : ""} ${danger ? styles.menuItemDanger : ""}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <span className={styles.menuItemCheck} aria-hidden="true">
        {active ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

function MenuSeparator() {
  return <div className={styles.menuSeparator} role="separator" />;
}

type TopBarMenuProps = {
  label: string;
  menuId: MenuId;
  openMenu: MenuId | null;
  onToggle: (menuId: MenuId) => void;
  onClose: () => void;
  disabled?: boolean;
  children: ReactNode;
};

function TopBarMenu({
  label,
  menuId,
  openMenu,
  onToggle,
  onClose,
  disabled,
  children,
}: TopBarMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const menuListId = useId();
  const isOpen = openMenu === menuId;

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className={styles.menuWrap} ref={menuRef}>
      <button
        type="button"
        className={`btn btn-ghost ${styles.menuTrigger} ${isOpen ? styles.menuTriggerOpen : ""}`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuListId}
        onClick={() => onToggle(menuId)}
      >
        {label}
        <span className={styles.menuChevron} aria-hidden="true">
          ▾
        </span>
      </button>
      {isOpen && (
        <div
          id={menuListId}
          className={styles.menuPanel}
          role="menu"
          onClick={onClose}
        >
          {children}
        </div>
      )}
    </div>
  );
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
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);

  function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onUpload(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function toggleMenu(menuId: MenuId) {
    setOpenMenu((current) => (current === menuId ? null : menuId));
  }

  function closeMenu() {
    setOpenMenu(null);
  }

  function selectTool(mode: ToolMode) {
    onToolModeChange(mode);
    closeMenu();
  }

  function toggleCalibrate() {
    onToolModeChange(toolMode === "calibrate" ? "select" : "calibrate");
    closeMenu();
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

        <TopBarMenu
          label="Plan"
          menuId="plan"
          openMenu={openMenu}
          onToggle={toggleMenu}
          onClose={closeMenu}
        >
          <MenuItem
            label="Upload plan"
            onClick={() => fileRef.current?.click()}
          />
          <MenuItem label="Draw plan" onClick={onDrawPlan} />
          <MenuSeparator />
          <MenuItem label="Open" onClick={onOpen} />
          <MenuItem
            label="Save"
            disabled={!hasPlan || !isDirty}
            onClick={onSave}
          />
          <MenuItem
            label="Save as"
            disabled={!hasPlan}
            onClick={onSaveAs}
          />
          <MenuItem
            label="Save clean copy"
            disabled={!hasPlan}
            title="Save the plan, scale, and drawing without furniture"
            onClick={onSaveCleanAs}
          />
        </TopBarMenu>

        <TopBarMenu
          label="Tools"
          menuId="tools"
          openMenu={openMenu}
          onToggle={toggleMenu}
          onClose={closeMenu}
          disabled={!hasPlan}
        >
          <MenuItem
            label="Select"
            active={toolMode === "select"}
            onClick={() => selectTool("select")}
          />
          {DRAW_TOOLS.map(({ mode, label }) => (
            <MenuItem
              key={mode}
              label={label}
              active={toolMode === mode}
              onClick={() => selectTool(mode)}
            />
          ))}
          <MenuSeparator />
          <MenuItem
            label="Calibrate"
            active={toolMode === "calibrate"}
            onClick={toggleCalibrate}
          />
          {hasImage && (
            <>
              <MenuItem
                label={isConverting ? "Converting…" : "Convert to drawing"}
                disabled={isConverting}
                onClick={onConvert}
              />
              <MenuItem
                label={imageUnderlayVisible ? "Hide underlay" : "Show underlay"}
                active={!imageUnderlayVisible}
                onClick={onToggleUnderlay}
              />
            </>
          )}
        </TopBarMenu>

        <TopBarMenu
          label="Edit"
          menuId="edit"
          openMenu={openMenu}
          onToggle={toggleMenu}
          onClose={closeMenu}
        >
          <MenuItem
            label="ft / in"
            active={unitSystem === "imperial"}
            onClick={() => onUnitSystemChange("imperial")}
          />
          <MenuItem
            label="metric"
            active={unitSystem === "metric"}
            onClick={() => onUnitSystemChange("metric")}
          />
          <MenuSeparator />
          <MenuItem
            label="Clear furniture"
            disabled={!hasPlan}
            onClick={onClearLayout}
          />
          <MenuItem
            label="Clear walls"
            disabled={!hasWalls}
            onClick={onClearWalls}
          />
          <MenuItem
            label="Reset"
            disabled={!hasPlan}
            danger
            onClick={onClearAll}
          />
        </TopBarMenu>

        <span className={styles.scalePill}>
          {pixelsPerInch
            ? `Scale set · 1 in = ${pixelsPerInch.toFixed(1)} px`
            : hasPlan
              ? "Scale not set"
              : "No plan loaded"}
          {hasWalls ? " · walls editable" : ""}
        </span>
      </div>
    </header>
  );
}
