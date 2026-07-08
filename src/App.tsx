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
  WallDraft,
  WallSegment,
} from "./types";
import { displayValueToInches, unitLabel } from "./units";
import { vectorizeFloorPlan } from "./vectorize";

function createId(): string {
  return crypto.randomUUID();
}

function snapRotation(deg: number): number {
  const snapped = Math.round(deg / 15) * 15;
  return ((snapped % 360) + 360) % 360;
}

type ConversionPreview = {
  walls: { start: { x: number; y: number }; end: { x: number; y: number } }[];
  warning?: string;
};

export default function App() {
  const [plan, setPlan] = useState<PlanState>(() => loadPlanState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [calibration, setCalibration] = useState<CalibrationDraft>({
    start: null,
    end: null,
  });
  const [wallDraft, setWallDraft] = useState<WallDraft>({
    start: null,
    end: null,
  });
  const [pendingLinePx, setPendingLinePx] = useState<number | null>(null);
  const [calibInput, setCalibInput] = useState("");
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionPreview, setConversionPreview] =
    useState<ConversionPreview | null>(null);

  useEffect(() => {
    savePlanState(plan);
  }, [plan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToolMode("select");
        setCalibration({ start: null, end: null });
        setWallDraft({ start: null, end: null });
        setPendingLinePx(null);
        setSelectedId(null);
        setSelectedWallId(null);
        setConversionPreview(null);
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        if (selectedWallId) {
          setPlan((prev) => ({
            ...prev,
            walls: prev.walls.filter((w) => w.id !== selectedWallId),
          }));
          setSelectedWallId(null);
        } else if (selectedId) {
          setPlan((prev) => ({
            ...prev,
            items: prev.items.filter((i) => i.id !== selectedId),
          }));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, selectedWallId]);

  const selectedItem = useMemo(
    () => plan.items.find((i) => i.id === selectedId) ?? null,
    [plan.items, selectedId],
  );

  const selectedWall = useMemo(
    () => plan.walls.find((w) => w.id === selectedWallId) ?? null,
    [plan.walls, selectedWallId],
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
      walls: [],
      imageUnderlayVisible: true,
      imageUnderlayOpacity: 1,
    }));
    setSelectedId(null);
    setSelectedWallId(null);
    setToolMode("calibrate");
    setCalibration({ start: null, end: null });
    setWallDraft({ start: null, end: null });
    setPendingLinePx(null);
    setConversionPreview(null);
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
      setSelectedWallId(null);
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

  const handleWallChange = useCallback(
    (id: string, patch: Partial<WallSegment>) => {
      setPlan((prev) => ({
        ...prev,
        walls: prev.walls.map((wall) =>
          wall.id === id ? { ...wall, ...patch } : wall,
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

  const handleDeleteWall = useCallback((id: string) => {
    setPlan((prev) => ({
      ...prev,
      walls: prev.walls.filter((w) => w.id !== id),
    }));
    setSelectedWallId((cur) => (cur === id ? null : cur));
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

  const handleWallComplete = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      if (Math.hypot(end.x - start.x, end.y - start.y) < 4) {
        setWallDraft({ start: null, end: null });
        return;
      }
      const wall: WallSegment = {
        id: createId(),
        start,
        end,
      };
      setPlan((prev) => ({ ...prev, walls: [...prev.walls, wall] }));
      setSelectedWallId(wall.id);
      setSelectedId(null);
      setWallDraft({ start: null, end: null });
    },
    [],
  );

  const runConversion = useCallback(async () => {
    if (!plan.imageDataUrl || isConverting) return;
    setIsConverting(true);
    setConversionPreview(null);
    try {
      const result = await vectorizeFloorPlan(plan.imageDataUrl);
      setConversionPreview({
        walls: result.walls,
        warning: result.warning,
      });
      setToolMode("select");
    } catch {
      setConversionPreview({
        walls: [],
        warning: "Conversion failed. The uploaded image is unchanged.",
      });
    } finally {
      setIsConverting(false);
    }
  }, [plan.imageDataUrl, isConverting]);

  const acceptConversion = useCallback(() => {
    if (!conversionPreview) return;
    const newWalls: WallSegment[] = conversionPreview.walls.map((w) => ({
      id: createId(),
      start: w.start,
      end: w.end,
    }));
    setPlan((prev) => ({
      ...prev,
      walls: newWalls,
      imageUnderlayVisible: true,
      imageUnderlayOpacity: 0.35,
    }));
    setConversionPreview(null);
    setSelectedWallId(null);
    setSelectedId(null);
  }, [conversionPreview]);

  const cancelConversion = useCallback(() => {
    setConversionPreview(null);
  }, []);

  const canPlace = Boolean(plan.imageDataUrl && plan.pixelsPerInch);

  return (
    <div className="app">
      <TopBar
        unitSystem={plan.unitSystem}
        toolMode={toolMode}
        hasImage={Boolean(plan.imageDataUrl)}
        pixelsPerInch={plan.pixelsPerInch}
        hasWalls={plan.walls.length > 0}
        imageUnderlayVisible={plan.imageUnderlayVisible}
        isConverting={isConverting}
        onUnitSystemChange={(unitSystem: UnitSystem) => updatePlan({ unitSystem })}
        onUpload={handleUpload}
        onToolModeChange={(mode) => {
          setToolMode(mode);
          if (mode === "calibrate") {
            setCalibration({ start: null, end: null });
            setPendingLinePx(null);
            setWallDraft({ start: null, end: null });
          }
          if (mode === "draw_wall") {
            setWallDraft({ start: null, end: null });
            setCalibration({ start: null, end: null });
            setPendingLinePx(null);
          }
        }}
        onConvert={runConversion}
        onToggleUnderlay={() =>
          updatePlan({ imageUnderlayVisible: !plan.imageUnderlayVisible })
        }
        onClearLayout={() => {
          updatePlan({ items: [] });
          setSelectedId(null);
        }}
        onClearWalls={() => {
          updatePlan({ walls: [] });
          setSelectedWallId(null);
        }}
        onClearAll={() => {
          setPlan({ ...DEFAULT_STATE, unitSystem: plan.unitSystem });
          setSelectedId(null);
          setSelectedWallId(null);
          setToolMode("select");
          setCalibration({ start: null, end: null });
          setWallDraft({ start: null, end: null });
          setPendingLinePx(null);
          setConversionPreview(null);
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
                walls={plan.walls}
                selectedId={selectedId}
                selectedWallId={selectedWallId}
                toolMode={toolMode}
                unitSystem={plan.unitSystem}
                calibration={calibration}
                wallDraft={wallDraft}
                imageUnderlayVisible={plan.imageUnderlayVisible}
                imageUnderlayOpacity={plan.imageUnderlayOpacity}
                conversionPreview={conversionPreview?.walls}
                onSelect={setSelectedId}
                onSelectWall={setSelectedWallId}
                onItemChange={handleItemChange}
                onWallChange={handleWallChange}
                onCalibrationChange={setCalibration}
                onCalibrationComplete={handleCalibrationComplete}
                onWallDraftChange={setWallDraft}
                onWallComplete={handleWallComplete}
                onImageSize={setImageSize}
              />
              {toolMode === "calibrate" && pendingLinePx == null && (
                <div className="overlay-hint">
                  Click two points on a wall or dimension line with a known length
                </div>
              )}
              {toolMode === "draw_wall" && (
                <div className="overlay-hint">
                  Click two points to draw a wall segment · Delete to remove selection
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
          wall={selectedWall}
          pixelsPerInch={plan.pixelsPerInch}
          unitSystem={plan.unitSystem}
          onChange={handleItemChange}
          onDelete={handleDelete}
          onRotate={handleRotate}
          onDeleteWall={handleDeleteWall}
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
            {plan.walls.length > 0 && conversionPreview.walls.length > 0 && (
              <p className="modal-warning">
                Accepting will replace your existing {plan.walls.length} wall
                segment{plan.walls.length === 1 ? "" : "s"}. Furniture and the
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
    </div>
  );
}
