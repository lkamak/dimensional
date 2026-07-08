import { useEffect, useState } from "react";
import type { SavedPlanMeta } from "../types";
import styles from "./PlanLibraryModal.module.css";

type PlanLibraryModalProps = {
  mode: "open" | "save-as" | "unsaved";
  plans: SavedPlanMeta[];
  initialName?: string;
  currentPlanName?: string | null;
  onOpen: (id: string) => void;
  onSaveAs: (name: string) => void;
  onSaveAndContinue?: () => void;
  onDiscard?: () => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
};

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PlanLibraryModal({
  mode,
  plans,
  initialName = "",
  currentPlanName,
  onOpen,
  onSaveAs,
  onSaveAndContinue,
  onDiscard,
  onDelete,
  onClose,
}: PlanLibraryModalProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    setName(initialName);
  }, [initialName, mode]);

  const title =
    mode === "open"
      ? "Open saved plan"
      : mode === "save-as"
        ? "Save plan as"
        : "Unsaved changes";

  const description =
    mode === "open"
      ? "Choose a saved layout to open. Furniture, scale, and units are restored."
      : mode === "save-as"
        ? "Save the current floor plan with all furniture under a name."
        : currentPlanName
          ? `"${currentPlanName}" has unsaved changes. Save before switching plans?`
          : "This plan has unsaved changes. Save before switching plans?";

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-library-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${mode === "open" ? styles.modalWide : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="plan-library-title">{title}</h2>
        <p>{description}</p>

        {mode === "unsaved" ? (
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-ghost" onClick={onDiscard}>
              Discard
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSaveAndContinue}
            >
              Save & continue
            </button>
          </div>
        ) : mode === "save-as" ? (
          <>
            <div className="modal-field">
              <label htmlFor="plan-name">Plan name</label>
              <input
                id="plan-name"
                type="text"
                autoFocus
                maxLength={80}
                placeholder="e.g. Living room layout"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) onSaveAs(name);
                }}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!name.trim()}
                onClick={() => onSaveAs(name)}
              >
                Save
              </button>
            </div>
          </>
        ) : plans.length === 0 ? (
          <>
            <p className={styles.empty}>No saved plans yet. Use Save or Save as to create one.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className={styles.list}>
              {plans.map((plan) => (
                <li key={plan.id}>
                  <button
                    type="button"
                    className={styles.listItem}
                    onClick={() => onOpen(plan.id)}
                  >
                    <span className={styles.listItemMain}>
                      <span className={styles.listItemName}>{plan.name}</span>
                      <span className={styles.listItemMeta}>
                        Updated {formatUpdatedAt(plan.updatedAt)}
                      </span>
                    </span>
                    {onDelete && (
                      <span
                        role="button"
                        tabIndex={0}
                        className={styles.deleteBtn}
                        aria-label={`Delete ${plan.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(plan.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete(plan.id);
                          }
                        }}
                      >
                        Delete
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
