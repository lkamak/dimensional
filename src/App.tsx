import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { TopBar } from "./components/TopBar";
import { CatalogRail } from "./components/CatalogRail";
import { Inspector } from "./components/Inspector";
import { EmptyState } from "./components/EmptyState";
import { PlanCanvas } from "./components/PlanCanvas";
import { DEFAULT_STATE, loadPlanState, savePlanState } from "./storage";
import type {
  CalibrationDraft,
  CatalogPreset,
  FurnitureItem,
  PlanState,
  ToolMode,
  UnitSystem,
} from "./types";
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

  const updatePlan = useCallback((patch: Partial<PlanState>) => {
    setPlan((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpload = useCallback((dataUrl: string) => {
    setPlan((prev) => ({
      ...prev,
      imageDataUrl: dataUrl,
      pixelsPerInch: null,
      items: [],
    }));
    setSelectedId(null);
    setToolMode("calibrate");
    setCalibration({ start: null, end: null });
    setPendingLinePx(null);
  }, []);

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

  const canPlace = Boolean(plan.imageDataUrl && plan.pixelsPerInch);

  return (
    <div className="app">
      <TopBar
        unitSystem={plan.unitSystem}
        toolMode={toolMode}
        hasImage={Boolean(plan.imageDataUrl)}
        pixelsPerInch={plan.pixelsPerInch}
        onUnitSystemChange={(unitSystem: UnitSystem) => updatePlan({ unitSystem })}
        onUpload={handleUpload}
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
    </div>
  );
}
