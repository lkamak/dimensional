import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { TopBar } from "./components/TopBar";
import { CatalogRail } from "./components/CatalogRail";
import { Inspector } from "./components/Inspector";
import { EmptyState } from "./components/EmptyState";
import { PlanCanvas } from "./components/PlanCanvas";
import {
  DEFAULT_STATE,
  createBlankPlanState,
  loadPlanState,
  savePlanState,
} from "./storage";
import type {
  CalibrationDraft,
  CatalogPreset,
  DrawElement,
  FurnitureItem,
  PlanState,
  ToolMode,
  UnitSystem,
} from "./types";
import { hasActivePlan } from "./types";
import { displayValueToInches, unitLabel } from "./units";

function createId(): string {
  return crypto.randomUUID();
}

function snapRotation(deg: number): number {
  const snapped = Math.round(deg / 15) * 15;
  return ((snapped % 360) + 360) % 360;
}

export default function App() {
  const [plan, setPlan] = useState<PlanState>(() => loadPlanState());
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

  useEffect(() => {
    savePlanState(plan);
  }, [plan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToolMode("select");
        setCalibration({ start: null, end: null });
        setPendingLinePx(null);
        setSelectedId(null);
        setSelectedElementId(null);
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
  }, [selectedId, selectedElementId]);

  const selectedItem = useMemo(
    () => plan.items.find((i) => i.id === selectedId) ?? null,
    [plan.items, selectedId],
  );

  const updatePlan = useCallback((patch: Partial<PlanState>) => {
    setPlan((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpload = useCallback((dataUrl: string) => {
    setPlan((prev) => ({
      ...prev,
      imageDataUrl: dataUrl,
      canvasWidth: null,
      canvasHeight: null,
      pixelsPerInch: null,
      items: [],
      elements: [],
    }));
    setSelectedId(null);
    setSelectedElementId(null);
    setToolMode("calibrate");
    setCalibration({ start: null, end: null });
    setPendingLinePx(null);
  }, []);

  const handleDrawPlan = useCallback(() => {
    setPlan((prev) => createBlankPlanState(prev.unitSystem));
    setSelectedId(null);
    setSelectedElementId(null);
    setToolMode("draw-wall");
    setCalibration({ start: null, end: null });
    setPendingLinePx(null);
  }, []);

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

  const planActive = hasActivePlan(plan);
  const canPlace = Boolean(planActive && plan.pixelsPerInch);

  return (
    <div className="app">
      <TopBar
        unitSystem={plan.unitSystem}
        toolMode={toolMode}
        hasPlan={planActive}
        pixelsPerInch={plan.pixelsPerInch}
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
        onClearLayout={() => {
          updatePlan({ items: [] });
          setSelectedId(null);
        }}
        onClearAll={() => {
          setPlan({ ...DEFAULT_STATE, unitSystem: plan.unitSystem });
          setSelectedId(null);
          setSelectedElementId(null);
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
                  {toolMode === "draw-wall" || toolMode === "draw-line"
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
    </div>
  );
}
