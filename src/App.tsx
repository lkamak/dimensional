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
  createBlankPlanState,
  deleteSavedPlan,
  listSavedPlans,
  loadSavedPlan,
  loadSessionSnapshot,
  planStateWithoutFurniture,
  planStatesEqual,
  savePlanToLibrary,
  saveSessionSnapshot,
} from "./storage";
import type {
  CalibrationDraft,
  CatalogPreset,
  DrawElement,
  FurnitureItem,
  PlanState,
  SessionSnapshot,
  StorageError,
  ToolMode,
  UnitSystem,
} from "./types";
import { hasActivePlan } from "./types";
import { displayValueToInches, unitLabel } from "./units";
import { vectorizeFloorPlan } from "./vectorize";

type LibraryModalMode =
  | "open"
  | "save-as"
  | "save-clean-as"
  | "unsaved"
  | null;

type ConversionPreview = {
  walls: { start: { x: number; y: number }; end: { x: number; y: number } }[];
  warning?: string;
};

function createId(): string {
  return crypto.randomUUID();
}

function snapRotation(deg: number): number {
  const snapped = Math.round(deg / 15) * 15;
  return ((snapped % 360) + 360) % 360;
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
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [calibration, setCalibration] = useState<CalibrationDraft>({
    start: null,
    end: null,
  });
  const [pendingLinePx, setPendingLinePx] = useState<number | null>(null);
  const [calibInput, setCalibInput] = useState("");
  const [canvasSize, setCanvasSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [savedPlans, setSavedPlans] = useState(() => listSavedPlans());
  const [libraryModal, setLibraryModal] = useState<LibraryModalMode>(null);
  const [pendingAction, setPendingAction] = useState<"open" | null>(null);
  const [storageError, setStorageError] = useState<StorageError | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionPreview, setConversionPreview] =
    useState<ConversionPreview | null>(null);
  const conversionRequestId = useRef(0);
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

  const cancelConversion = useCallback(() => {
    conversionRequestId.current += 1;
    setIsConverting(false);
    setConversionPreview(null);
  }, []);

  const isDirty = !planStatesEqual(plan, baselineState);
  const planActive = hasActivePlan(plan);
  const canPlace = Boolean(planActive && plan.pixelsPerInch);
  const wallCount = plan.elements.filter((el) => el.kind === "wall").length;

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
    if (legacyMigrationSnapshot.current) {
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
        setSelectedElementId(null);
        setLibraryModal(null);
        setPendingAction(null);
        cancelConversion();
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        if (selectedId) {
          setPlan((prev) => ({
            ...prev,
            items: prev.items.filter((i) => i.id !== selectedId),
          }));
          setSelectedId(null);
        } else if (selectedElementId) {
          setPlan((prev) => ({
            ...prev,
            elements: prev.elements.filter((el) => el.id !== selectedElementId),
          }));
          setSelectedElementId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, selectedElementId, cancelConversion]);

  const selectedItem = useMemo(
    () => plan.items.find((i) => i.id === selectedId) ?? null,
    [plan.items, selectedId],
  );

  const selectedElement = useMemo(
    () => plan.elements.find((el) => el.id === selectedElementId) ?? null,
    [plan.elements, selectedElementId],
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
      setSelectedElementId(null);
      setToolMode(state.pixelsPerInch ? "select" : "calibrate");
      setCalibration({ start: null, end: null });
      setPendingLinePx(null);
      setCalibInput("");
      cancelConversion();
    },
    [cancelConversion],
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
    if (!hasActivePlan(plan)) return;
    if (activePlanId && activePlanName) {
      if (loadSavedPlan(activePlanId)?.kind === "clean") {
        setLibraryModal("save-as");
        return;
      }
      persistCurrentPlan(activePlanId, activePlanName);
      return;
    }
    setLibraryModal("save-as");
  }, [plan, activePlanId, activePlanName, persistCurrentPlan]);

  const handleSaveAs = useCallback(() => {
    if (!hasActivePlan(plan)) return;
    setLibraryModal("save-as");
  }, [plan]);

  const handleSaveCleanAs = useCallback(() => {
    if (!hasActivePlan(plan)) return;
    setLibraryModal("save-clean-as");
  }, [plan]);

  const saveCleanPlanCopy = useCallback(
    (name: string) => {
      const result = savePlanToLibrary(
        createId(),
        name,
        planStateWithoutFurniture(plan),
        "clean",
      );
      if (!result.ok) {
        setStorageError(result.error);
        return false;
      }
      refreshSavedPlans();
      return true;
    },
    [plan, refreshSavedPlans],
  );

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

  const handleUpload = useCallback(
    (dataUrl: string) => {
      const next = {
        ...DEFAULT_STATE,
        imageDataUrl: dataUrl,
        unitSystem: plan.unitSystem,
        imageUnderlayVisible: true,
        imageUnderlayOpacity: 1,
      };
      setPlan(next);
      setBaselineState(next);
      setActivePlanId(null);
      setActivePlanName(null);
      setSelectedId(null);
      setSelectedElementId(null);
      setToolMode("calibrate");
      setCalibration({ start: null, end: null });
      setPendingLinePx(null);
      cancelConversion();
    },
    [plan.unitSystem, cancelConversion],
  );

  const handleDrawPlan = useCallback(() => {
    const next = createBlankPlanState(plan.unitSystem);
    setPlan(next);
    setBaselineState(next);
    setActivePlanId(null);
    setActivePlanName(null);
    setSelectedId(null);
    setSelectedElementId(null);
    setToolMode("draw-wall");
    setCalibration({ start: null, end: null });
    setPendingLinePx(null);
    cancelConversion();
  }, [plan.unitSystem, cancelConversion]);

  const handlePlace = useCallback(
    (preset: CatalogPreset) => {
      if (!hasActivePlan(plan) || !plan.pixelsPerInch) return;

      const cx = canvasSize ? canvasSize.width / 2 : 400;
      const cy = canvasSize ? canvasSize.height / 2 : 300;
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
      setSelectedElementId(null);
      setToolMode("select");
    },
    [plan, canvasSize],
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

  const handleDeleteElement = useCallback((id: string) => {
    setPlan((prev) => ({
      ...prev,
      elements: prev.elements.filter((el) => el.id !== id),
    }));
    setSelectedElementId((cur) => (cur === id ? null : cur));
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

  const handleElementAdd = useCallback((element: DrawElement) => {
    setPlan((prev) => ({ ...prev, elements: [...prev.elements, element] }));
  }, []);

  const handleElementChange = useCallback(
    (id: string, patch: Partial<DrawElement>) => {
      setPlan((prev) => ({
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === id ? { ...el, ...patch } : el,
        ),
      }));
    },
    [],
  );

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

  const runConversion = useCallback(async () => {
    if (!plan.imageDataUrl || isConverting) return;
    const requestId = ++conversionRequestId.current;
    setIsConverting(true);
    setConversionPreview(null);
    try {
      const result = await vectorizeFloorPlan(plan.imageDataUrl);
      if (requestId !== conversionRequestId.current) return;
      setConversionPreview({
        walls: result.walls,
        warning: result.warning,
      });
      setToolMode("select");
    } catch {
      if (requestId !== conversionRequestId.current) return;
      setConversionPreview({
        walls: [],
        warning: "Conversion failed. The uploaded image is unchanged.",
      });
    } finally {
      if (requestId === conversionRequestId.current) {
        setIsConverting(false);
      }
    }
  }, [plan.imageDataUrl, isConverting]);

  const acceptConversion = useCallback(() => {
    if (!conversionPreview) return;
    const newWalls: DrawElement[] = conversionPreview.walls.map((w) => ({
      id: createId(),
      kind: "wall" as const,
      x1: w.start.x,
      y1: w.start.y,
      x2: w.end.x,
      y2: w.end.y,
    }));
    setPlan((prev) => ({
      ...prev,
      elements: [
        ...prev.elements.filter((el) => el.kind !== "wall"),
        ...newWalls,
      ],
      imageUnderlayVisible: true,
      imageUnderlayOpacity: 0.35,
    }));
    cancelConversion();
    setSelectedElementId(null);
    setSelectedId(null);
  }, [conversionPreview, cancelConversion]);

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
        hasPlan={planActive}
        hasImage={Boolean(plan.imageDataUrl)}
        pixelsPerInch={plan.pixelsPerInch}
        hasWalls={wallCount > 0}
        imageUnderlayVisible={plan.imageUnderlayVisible}
        isConverting={isConverting}
        activePlanName={activePlanName}
        isDirty={isDirty}
        onUnitSystemChange={(unitSystem: UnitSystem) => updatePlan({ unitSystem })}
        onUpload={handleUpload}
        onDrawPlan={handleDrawPlan}
        onToolModeChange={(mode) => {
          setToolMode(mode);
          if (mode === "calibrate") {
            setCalibration({ start: null, end: null });
            setPendingLinePx(null);
          }
        }}
        onConvert={() => {
          void runConversion();
        }}
        onToggleUnderlay={() =>
          updatePlan({ imageUnderlayVisible: !plan.imageUnderlayVisible })
        }
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onSaveCleanAs={handleSaveCleanAs}
        onOpen={requestOpenLibrary}
        onClearLayout={() => {
          updatePlan({ items: [] });
          setSelectedId(null);
        }}
        onClearWalls={() => {
          updatePlan({
            elements: plan.elements.filter((el) => el.kind !== "wall"),
          });
          setSelectedElementId(null);
        }}
        onClearAll={() => {
          const next = { ...DEFAULT_STATE, unitSystem: plan.unitSystem };
          setPlan(next);
          setBaselineState(next);
          setActivePlanId(null);
          setActivePlanName(null);
          setSelectedId(null);
          setSelectedElementId(null);
          setToolMode("select");
          setCalibration({ start: null, end: null });
          setPendingLinePx(null);
          cancelConversion();
        }}
      />

      <div className="workspace">
        <CatalogRail
          unitSystem={plan.unitSystem}
          canPlace={canPlace}
          onPlace={handlePlace}
        />

        <div className="canvas-area">
          {!planActive ? (
            <EmptyState onUpload={handleUpload} onDrawPlan={handleDrawPlan} />
          ) : (
            <>
              <PlanCanvas
                imageDataUrl={plan.imageDataUrl}
                canvasWidth={plan.canvasWidth}
                canvasHeight={plan.canvasHeight}
                pixelsPerInch={plan.pixelsPerInch}
                items={plan.items}
                elements={plan.elements}
                selectedId={selectedId}
                selectedElementId={selectedElementId}
                toolMode={toolMode}
                unitSystem={plan.unitSystem}
                calibration={calibration}
                imageUnderlayVisible={plan.imageUnderlayVisible}
                imageUnderlayOpacity={plan.imageUnderlayOpacity}
                conversionPreview={conversionPreview?.walls}
                onSelect={setSelectedId}
                onElementSelect={setSelectedElementId}
                onItemChange={handleItemChange}
                onElementChange={handleElementChange}
                onElementAdd={handleElementAdd}
                onCalibrationChange={setCalibration}
                onCalibrationComplete={handleCalibrationComplete}
                onCanvasSize={setCanvasSize}
              />
              {toolMode === "calibrate" && pendingLinePx == null && (
                <div className="overlay-hint">
                  Click two points on a wall or dimension line with a known length
                </div>
              )}
              {toolMode.startsWith("draw-") && (
                <div className="overlay-hint">
                  {toolMode === "draw-wall" ||
                  toolMode === "draw-line" ||
                  toolMode === "draw-link"
                    ? "Click two points to draw · Esc to cancel"
                    : "Click and drag to draw · Esc to cancel"}
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
          element={selectedElement}
          pixelsPerInch={plan.pixelsPerInch}
          unitSystem={plan.unitSystem}
          onChange={handleItemChange}
          onDelete={handleDelete}
          onRotate={handleRotate}
          onDeleteElement={handleDeleteElement}
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

      {conversionPreview != null && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal modal-wide">
            <h2>Convert to drawing</h2>
            <p>
              {conversionPreview.walls.length > 0
                ? `Detected ${conversionPreview.walls.length} wall segment${conversionPreview.walls.length === 1 ? "" : "s"}. Preview is shown on the canvas in orange. Accept to make them editable, or cancel to keep the image only.`
                : "No wall segments were detected in this image."}
            </p>
            {conversionPreview.warning && (
              <p className="modal-warning">{conversionPreview.warning}</p>
            )}
            {wallCount > 0 && conversionPreview.walls.length > 0 && (
              <p className="modal-warning">
                Accepting will replace your existing {wallCount} wall segment
                {wallCount === 1 ? "" : "s"}. Other drawings, furniture, and the
                uploaded image are kept.
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={cancelConversion}
              >
                Cancel
              </button>
              {conversionPreview.walls.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={acceptConversion}
                >
                  Accept {conversionPreview.walls.length} walls
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void runConversion();
                }}
              >
                Retry
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
            if (libraryModal === "save-clean-as") {
              if (saveCleanPlanCopy(name)) {
                setLibraryModal(null);
              }
              return;
            }
            const id = createId();
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
              if (loadSavedPlan(activePlanId)?.kind === "clean") {
                setLibraryModal("save-as");
                return;
              }
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
