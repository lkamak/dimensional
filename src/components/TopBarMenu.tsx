import { useEffect, useId, useRef, useState } from "react";
import styles from "./TopBarMenu.module.css";

export type TopBarMenuItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  title?: string;
};

export type TopBarMenuSection = {
  items: TopBarMenuItem[];
};

type TopBarMenuProps = {
  label: string;
  sections: TopBarMenuSection[];
  disabled?: boolean;
};

export function TopBarMenu({ label, sections, disabled }: TopBarMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasItems = sections.some((section) => section.items.length > 0);
  if (!hasItems) return null;

  return (
    <div className={styles.menuRoot} ref={rootRef}>
      <button
        type="button"
        className={`btn btn-ghost ${styles.menuTrigger} ${open ? styles.menuTriggerOpen : ""}`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{label}</span>
        <span className={styles.menuChevron} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div id={menuId} className={styles.menuPanel} role="menu">
          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {sectionIndex > 0 && <div className={styles.menuDivider} role="separator" />}
              {section.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${item.active ? styles.menuItemActive : ""} ${item.danger ? styles.menuItemDanger : ""}`}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    item.onClick();
                    setOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
