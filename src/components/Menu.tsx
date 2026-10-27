import { useEffect, useRef } from "react";
import styles from "./Menu.module.css";

export type MenuItem =
  | { type: "separator" }
  | {
      type: "item";
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      active?: boolean;
      title?: string;
    };

type MenuProps = {
  id: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MenuItem[];
  disabled?: boolean;
  align?: "start" | "end";
};

export function Menu({
  id,
  label,
  open,
  onOpenChange,
  items,
  disabled,
  align = "start",
}: MenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = `${id}-menu`;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      onOpenChange(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={`btn btn-ghost ${open ? "btn-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <span className={styles.caret} aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          className={`${styles.panel} ${align === "end" ? styles.alignEnd : ""}`}
          role="menu"
          aria-label={label}
        >
          {items.map((item, index) => {
            if (item.type === "separator") {
              return (
                <div
                  key={`sep-${index}`}
                  className={styles.separator}
                  role="separator"
                />
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`${styles.item} ${item.active ? styles.itemActive : ""} ${item.danger ? styles.itemDanger : ""}`}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  if (item.disabled) return;
                  onOpenChange(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
