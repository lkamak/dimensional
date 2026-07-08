import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { TopBar } from "./components/TopBar";
import { CatalogRail } from "./components/CatalogRail";
import { Inspector } from "./components/Inspector";
import { EmptyState } from "./components/EmptyState";
import { PlanCanvas } from "./components/PlanCanvas";
import { PlanLibraryModal } from "./components/PlanLibraryModal";
import {
  clearLegacyPlanState,
  DEFAULT_STATE,
  deleteSavedPlan,
  listSavedPlans,
  loadSavedPlan,
  loadSessionSnapshot,
  planStatesEqual,
  savePlanToLibrary,
  saveSessionSnapshot,
} from "./storage";
import type {
  CalibrationDraft,
  CatalogPreset,
  FurnitureItem,
  PlanState,
  SessionSnapshot,
  StorageError,
  ToolMode,
  UnitSystem,
} from "./types";
import { displayValueToInches, unitLabel } from "./units";

type LibraryModalMode = "open" | "save-as" | "unsaved" | null;

function createId(): string {
  return crypto.randomUUID();
}

function snapRotation(deg: number): number {
  const snapped = Math.round(deg / 15) * 15;
  return ((snapped % 360) + 360) % 360;
}

function sessionSnapshotsEqual(
  a: SessionSnapshot,
  b: SessionSnapshot,
): boolean {
  return (
    a.activePlanId === b.activePlanId &&
    a.activePlanName === b.activePlanName &&
    planStatesEqual(a.plan, b.plan) &&
    planStatesEqual(a.baselineState, b.baselineState)
  );
}

export default function App() {
  const [initial] = useState(() => loadSessionSnapshot());
  const [plan, setPlan] = useState<PlanState>(initial.plan);
  const [activePlanId, setActivePlanId] = useState<string | null>(
    initial.activePlanId,
  );
  const [activePlanName, setActivePlanName] = useState<string | null>(
    initial.activePlanName,
  );
  const [baselineState, setBaselineState] = useState<PlanState>(
    initial.baselineState,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [calibration, setCalibration] = useState<CalibrationDraft>({
    start: null,
    end: null,
  });
  const [pendingLinePx, setPendingLinePx] = useState<number | null>(null);
  const [calibInput, setCalibInput] = useState("");
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [savedPlans, setSavedPlans] = useState(() => listSavedPlans());
  const [libraryModal, setLibraryModal] = useState<LibraryModalMode>(null);
  const [pendingAction, setPendingAction] = useState<"open" | null>(null);
  const [storageError, setStorageError] = useState<StorageError | null>(null);
  const sessionHydrated = useRef(false);
  const legacyMigrationSnapshot = useRef<SessionSnapshot | null>(
    initial.needsLegacyMigration
      ? {
          plan: initial.plan,
          activePlanId: initial.activePlanId,
          activePlanName: initial.activePlanName,
          baselineState: initial.baselineState,
        }
      : null,
  );

  const isDirty = !planStatesEqual(plan, baselineState);

  useEffect(() => {
    if (!sessionHydrated.current) {
      sessionHydrated.current = true;
      if (!legacyMigrationSnapshot.current) {
        return;
      }
    }
    const snapshot = {
      plan,
      activePlanId,
      activePlanName,
      baselineState,
    };
    const result = saveSessionSnapshot(snapshot);
    if (!result.ok) {
      setStorageError(result.error);
      return;
    }
    if (
      legacyMigrationSnapshot.current &&
      sessionSnapshotsEqual(snapshot, legacyMigrationSnapshot.current)
    ) {
      clearLegacyPlanState();
      legacyMigrationSnapshot.current = null;
    }
  }, [plan, activePlanId, activePlanName, baselineState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToolMode("select");
        setCalibration({ start: null, end: null });
        setPendingLinePx(null);
        setSelectedId(null);
        setLibraryModal(null);
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setPlan((prev) => ({
          ...prev,
          items: prev.items.filter((i) => i.id !== selectedId),
        }));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const selectedItem = useMemo(
    () => plan.items.find((i) => i.id === selectedId) ?? null,
    [plan.items, selectedId],
  );

  const refreshSavedPlans = useCallback(() => {
    setSavedPlans(listSavedPlans());
  }, []);

  const applyLoadedPlan = useCallback(
    (state: PlanState, id: string | null, name: string | null) => {
      setPlan(state);
      setBaselineState(state);
      setActivePlanId(id);
      setActivePlanName(name);
      setSelectedId(null);
      setToolMode(state.pixelsPerInch ? "select" : "calibrate");
      setCalibration({ start: null, end: null });
      setPendingLinePx(null);
      setCalibInput("");
    },
    [],
  );

  const persistCurrentPlan = useCallback(
    (id: string, name: string) => {
      const result = savePlanToLibrary(id, name, plan);
      if (!result.ok) {
        setStorageError(result.error);
        return false;
      }
      setActivePlanId(id);
      setActivePlanName(result.value.name);
      setBaselineState(plan);
      refreshSavedPlans();
      return true;
    },
    [plan, refreshSavedPlans],
  );

  const handleSave = useCallback(() => {
    if (!plan.imageDataUrl) return;
    if (activePlanId && activePlanName) {
      persistCurrentPlan(activePlanId, activePlanName);
      return;
    }
    setLibraryModal("save-as");
  }, [plan.imageDataUrl, activePlanId, activePlanName, persistCurrentPlan]);

  const handleSaveAs = useCallback(() => {
    if (!plan.imageDataUrl) return;
    setLibraryModal("save-as");
  }, [plan.imageDataUrl]);

  const openPlanById = useCallback(
    (id: string) => {
      const saved = loadSavedPlan(id);
      if (!saved) {
        setStorageError({
          type: "unavailable",
          message: "That saved plan could not be loaded.",
        });
        refreshSavedPlans();
        return;
      }
      applyLoadedPlan(saved.state, saved.id, saved.name);
      setLibraryModal(null);
      setPendingAction(null);
    },
    [applyLoadedPlan, refreshSavedPlans],
  );

  const requestOpenLibrary = useCallback(() => {
    refreshSavedPlans();
    if (isDirty) {
      setPendingAction("open");
      setLibraryModal("unsaved");
      return;
    }
    setLibraryModal("open");
  }, [isDirty, refreshSavedPlans]);

  const updatePlan = useCallback((patch: Partial<PlanState>) => {
    setPlan((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpload = useCallback((dataUrl: string) => {
    const next = {
      ...DEFAULT_STATE,
      imageDataUrl: dataUrl,
      unitSystem: plan.unitSystem,
    };
    setPlan(next);
    setBaselineState(next);
    setActivePlanId(null);
    setActivePlanName(null);
    setSelectedId(null);
    setToolMode("calibrate");
    setCalibration({ start: null, end: null });
    setPendingLinePx(null);
  }, [plan.unitSystem]);

  const handlePlace = useCallback(
    (preset: CatalogPreset) => {
      if (!plan.imageDataUrl || !plan.pixelsPerInch) return;

      const cx = imageSize ? imageSize.width / 2 : 400;
      const cy = imageSize ? imageSize.height / 2 : 300;
      const offset = plan.items.length * 16;

      const item: FurnitureItem = {
        id: createId(),
        kind: preset.kind,
        label: preset.label,
        widthIn: preset.widthIn,
        depthIn: preset.depthIn,
        x: cx + offset,
        y: cy + offset,
        rotation: 0,
      };
      setPlan((prev) => ({ ...prev, items: [...prev.items, item] }));
      setSelectedId(item.id);
      setToolMode("select");
    },
    [
      plan.imageDataUrl,
      plan.pixelsPerInch,
      plan.items.length,
      imageSize,
    ],
  );

  const handleItemChange = useCallback(
    (id: string, patch: Partial<FurnitureItem>) => {
      setPlan((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      }));
    },
    [],
  );

  const handleDelete = useCallback((id: string) => {
    setPlan((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.id !== id),
    }));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const handleRotate = useCallback((id: string, delta: number) => {
    setPlan((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id
          ? { ...item, rotation: snapRotation(item.rotation + delta) }
          : item,
      ),
    }));
  }, []);

  const handleCalibrationComplete = useCallback((lineLengthPx: number) => {
    if (lineLengthPx < 4) return;
    setPendingLinePx(lineLengthPx);
  }, []);

  const confirmCalibration = useCallback(() => {
    if (pendingLinePx == null) return;
    const value = Number(calibInput);
    if (!Number.isFinite(value) || value <= 0) return;
    const lengthInches = displayValueToInches(value, plan.unitSystem);
    const pixelsPerInch = pendingLinePx / lengthInches;
    setPlan((prev) => ({ ...prev, pixelsPerInch }));
    setPendingLinePx(null);
    setCalibInput("");
    setCalibration({ start: null, end: null });
    setToolMode("select");
  }, [pendingLinePx, calibInput, plan.unitSystem]);

  const cancelCalibrationModal = useCallback(() => {
    setPendingLinePx(null);
    setCalibInput("");
    setCalibration({ start: null, end: null });
  }, []);

  const handleDeleteSavedPlan = useCallback(
    (id: string) => {
      const meta = savedPlans.find((p) => p.id === id);
      if (!meta) return;
      if (!window.confirm(`Delete saved plan "${meta.name}"?`)) return;
      const result = deleteSavedPlan(id);
      if (!result.ok) {
        setStorageError(result.error);
        return;
      }
      if (activePlanId === id) {
        setActivePlanId(null);
        setActivePlanName(null);
      }
      refreshSavedPlans();
    },
    [savedPlans, activePlanId, refreshSavedPlans],
  );

  const canPlace = Boolean(plan.imageDataUrl && plan.pixelsPerInch);

  return (
    <div className="app">
      {storageError && (
        <div className="storage-error" role="alert">
          <span>{storageError.message}</span>
          <button
            type="button"
            className="storage-error-dismiss"
            aria-label="Dismiss error"
            onClick={() => setStorageError(null)}
          >
            ×
          </button>
        </div>
      )}

      <TopBar
        unitSystem={plan.unitSystem}
        toolMode={toolMode}
        hasImage={Boolean(plan.imageDataUrl)}
        pixelsPerInch={plan.pixelsPerInch}
        activePlanName={activePlanName}
        isDirty={isDirty}
        onUnitSystemChange={(unitSystem: UnitSystem) => updatePlan({ unitSystem })}
        onUpload={handleUpload}
        onToolModeChange={(mode) => {
          setToolMode(mode);
          if (mode === "calibrate") {
            setCalibration({ start: null, end: null });
            setPendingLinePx(null);
          }
        }}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpen={requestOpenLibrary}
        onClearLayout={() => {
          updatePlan({ items: [] });
          setSelectedId(null);
        }}
        onClearAll={() => {
          const next = { ...DEFAULT_STATE, unitSystem: plan.unitSystem };
          setPlan(next);
          setBaselineState(next);
          setActivePlanId(null);
          setActivePlanName(null);
          setSelectedId(null);
          setToolMode("select");
          setCalibration({ start: null, end: null });
          setPendingLinePx(null);
        }}
      />

      <div className="workspace">
        <CatalogRail
          unitSystem={plan.unitSystem}
          canPlace={canPlace}
          onPlace={handlePlace}
        />

        <div className="canvas-area">
          {!plan.imageDataUrl ? (
            <EmptyState onUpload={handleUpload} />
          ) : (
            <>
              <PlanCanvas
                imageDataUrl={plan.imageDataUrl}
                pixelsPerInch={plan.pixelsPerInch}
                items={plan.items}
                selectedId={selectedId}
                toolMode={toolMode}
                unitSystem={plan.unitSystem}
                calibration={calibration}
                onSelect={setSelectedId}
                onItemChange={handleItemChange}
                onCalibrationChange={setCalibration}
                onCalibrationComplete={handleCalibrationComplete}
                onImageSize={setImageSize}
              />
              {toolMode === "calibrate" && pendingLinePx == null && (
                <div className="overlay-hint">
                  Click two points on a wall or dimension line with a known length
                </div>
              )}
              {plan.pixelsPerInch && toolMode === "select" && (
                <div className="overlay-hint">
                  Scroll to zoom · Space + drag to pan · Delete to remove selection
                </div>
              )}
            </>
          )}
        </div>

        <Inspector
          item={selectedItem}
          unitSystem={plan.unitSystem}
          onChange={handleItemChange}
          onDelete={handleDelete}
          onRotate={handleRotate}
        />
      </div>

      {pendingLinePx != null && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Set real length</h2>
            <p>
              Enter the real-world length of the line you just drew. This sets
              the scale for all furniture.
            </p>
            <div className="modal-field">
              <label htmlFor="calib-length">
                Length ({unitLabel(plan.unitSystem)})
              </label>
              <input
                id="calib-length"
                type="number"
                min={0.1}
                step={plan.unitSystem === "metric" ? 1 : 0.5}
                autoFocus
                value={calibInput}
                placeholder={
                  plan.unitSystem === "metric"
                    ? "e.g. 300 for 3 m wall"
                    : "e.g. 120 for 10 ft wall"
                }
                onChange={(e) => setCalibInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCalibration();
                }}
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={cancelCalibrationModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmCalibration}
              >
                Apply scale
              </button>
            </div>
          </div>
        </div>
      )}

      {libraryModal && (
        <PlanLibraryModal
          mode={libraryModal}
          plans={savedPlans}
          initialName={activePlanName ?? ""}
          currentPlanName={activePlanName}
          onOpen={openPlanById}
          onSaveAs={(name) => {
            const id = activePlanId ?? createId();
            if (persistCurrentPlan(id, name)) {
              setLibraryModal(null);
              if (pendingAction === "open") {
                setPendingAction(null);
                setLibraryModal("open");
              }
            }
          }}
          onSaveAndContinue={() => {
            if (activePlanId && activePlanName) {
              if (!persistCurrentPlan(activePlanId, activePlanName)) return;
            } else {
              setLibraryModal("save-as");
              return;
            }
            setLibraryModal(null);
            if (pendingAction === "open") {
              setPendingAction(null);
              setLibraryModal("open");
            }
          }}
          onDiscard={() => {
            setPlan(baselineState);
            setLibraryModal(null);
            if (pendingAction === "open") {
              setPendingAction(null);
              setLibraryModal("open");
            }
          }}
          onDelete={libraryModal === "open" ? handleDeleteSavedPlan : undefined}
          onClose={() => {
            setLibraryModal(null);
            setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}
