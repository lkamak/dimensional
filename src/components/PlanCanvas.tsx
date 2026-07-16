import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Group,
  Rect,
  Text,
  Line,
  Circle,
} from "react-konva";
import type Konva from "konva";
import type {
  CalibrationDraft,
  DrawElement,
  DrawElementKind,
  FurnitureItem,
  ToolMode,
  UnitSystem,
} from "../types";
import { isDrawTool } from "../types";
import { formatDimensions } from "../units";
import { rotationFromPointer } from "../geometry";

type PlanCanvasProps = {
  imageDataUrl: string | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
  pixelsPerInch: number | null;
  items: FurnitureItem[];
  elements: DrawElement[];
  selectedId: string | null;
  selectedElementId: string | null;
  toolMode: ToolMode;
  unitSystem: UnitSystem;
  calibration: CalibrationDraft;
  imageUnderlayVisible?: boolean;
  imageUnderlayOpacity?: number;
  conversionPreview?: { start: { x: number; y: number }; end: { x: number; y: number } }[];
  onSelect: (id: string | null) => void;
  onElementSelect: (id: string | null) => void;
  onItemChange: (id: string, patch: Partial<FurnitureItem>) => void;
  onElementChange: (id: string, patch: Partial<DrawElement>) => void;
  onElementAdd: (element: DrawElement) => void;
  onCalibrationChange: (draft: CalibrationDraft) => void;
  onCalibrationComplete: (lineLengthPx: number) => void;
  onCanvasSize?: (size: { width: number; height: number }) => void;
};

function useHtmlImage(src: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = src;
  }, [src]);

  return image;
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number; rotation: number },
  b: { x: number; y: number; w: number; h: number; rotation: number },
): boolean {
  const aabb = (r: typeof a) => {
    const rad = (r.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const bw = r.w * cos + r.h * sin;
    const bh = r.w * sin + r.h * cos;
    return {
      left: r.x - bw / 2,
      right: r.x + bw / 2,
      top: r.y - bh / 2,
      bottom: r.y + bh / 2,
    };
  };
  const A = aabb(a);
  const B = aabb(b);
  return !(
    A.right < B.left ||
    A.left > B.right ||
    A.bottom < B.top ||
    A.top > B.bottom
  );
}

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  };
}

function drawKindFromTool(toolMode: ToolMode): DrawElementKind | null {
  if (toolMode === "draw-wall") return "wall";
  if (toolMode === "draw-room") return "room";
  if (toolMode === "draw-line") return "line";
  if (toolMode === "draw-rect") return "rect";
  return null;
}

function renderElementShape(
  el: DrawElement,
  selected: boolean,
  scale: number,
  draggable: boolean,
  listening: boolean,
  onSelect: () => void,
  onDragEnd: (dx: number, dy: number) => void,
) {
  const stroke = selected ? "#3d5a5b" : "rgba(42, 41, 36, 0.75)";
  const strokeWidth = (selected ? 2 : 1) / scale;

  if (el.kind === "wall") {
    return (
      <Line
        key={el.id}
        points={[el.x1, el.y1, el.x2, el.y2]}
        stroke={stroke}
        strokeWidth={8 / scale}
        lineCap="square"
        hitStrokeWidth={16 / scale}
        draggable={draggable}
        listening={listening}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => {
          const node = e.target;
          onDragEnd(node.x(), node.y());
          node.position({ x: 0, y: 0 });
        }}
      />
    );
  }

  if (el.kind === "line") {
    return (
      <Line
        key={el.id}
        points={[el.x1, el.y1, el.x2, el.y2]}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={[6 / scale, 4 / scale]}
        hitStrokeWidth={12 / scale}
        draggable={draggable}
        listening={listening}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => {
          const node = e.target;
          onDragEnd(node.x(), node.y());
          node.position({ x: 0, y: 0 });
        }}
      />
    );
  }

  const rect = normalizeRect(el.x1, el.y1, el.x2, el.y2);
  const width = rect.x2 - rect.x1;
  const height = rect.y2 - rect.y1;

  return (
    <Rect
      key={el.id}
      x={rect.x1}
      y={rect.y1}
      width={width}
      height={height}
      fill={el.kind === "room" ? "rgba(61, 90, 91, 0.08)" : "transparent"}
      stroke={stroke}
      strokeWidth={strokeWidth}
      draggable={draggable}
      listening={listening}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDragEnd={(e) => {
        const node = e.target;
        onDragEnd(node.x() - rect.x1, node.y() - rect.y1);
      }}
    />
  );
}

function renderDraftPreview(
  kind: DrawElementKind,
  start: { x: number; y: number },
  end: { x: number; y: number },
  scale: number,
) {
  if (kind === "wall") {
    return (
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke="#3d5a5b"
        strokeWidth={8 / scale}
        lineCap="square"
        opacity={0.65}
        listening={false}
      />
    );
  }
  if (kind === "line") {
    return (
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke="#3d5a5b"
        strokeWidth={2 / scale}
        dash={[6 / scale, 4 / scale]}
        opacity={0.65}
        listening={false}
      />
    );
  }
  const rect = normalizeRect(start.x, start.y, end.x, end.y);
  return (
    <Rect
      x={rect.x1}
      y={rect.y1}
      width={rect.x2 - rect.x1}
      height={rect.y2 - rect.y1}
      fill={kind === "room" ? "rgba(61, 90, 91, 0.08)" : "transparent"}
      stroke="#3d5a5b"
      strokeWidth={2 / scale}
      dash={[6 / scale, 4 / scale]}
      opacity={0.65}
      listening={false}
    />
  );
}

export function PlanCanvas({
  imageDataUrl,
  canvasWidth,
  canvasHeight,
  pixelsPerInch,
  items,
  elements,
  selectedId,
  selectedElementId,
  toolMode,
  unitSystem,
  calibration,
  imageUnderlayVisible = true,
  imageUnderlayOpacity = 1,
  conversionPreview,
  onSelect,
  onElementSelect,
  onItemChange,
  onElementChange,
  onElementAdd,
  onCalibrationChange,
  onCalibrationComplete,
  onCanvasSize,
}: PlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [drawDraft, setDrawDraft] = useState<{
    kind: DrawElementKind;
    start: { x: number; y: number };
    end: { x: number; y: number } | null;
  } | null>(null);
  const drawDraftRef = useRef(drawDraft);
  drawDraftRef.current = drawDraft;
  const [rotating, setRotating] = useState<{ id: string; angle: number } | null>(
    null,
  );
  const rotatingRef = useRef(rotating);
  rotatingRef.current = rotating;
  const image = useHtmlImage(imageDataUrl);
  const fittedRef = useRef<string | null>(null);

  const contentWidth = image?.width ?? canvasWidth ?? 800;
  const contentHeight = image?.height ?? canvasHeight ?? 600;
  const fitKey = imageDataUrl ?? `blank:${canvasWidth}x${canvasHeight}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    onCanvasSize?.({ width: contentWidth, height: contentHeight });
  }, [contentWidth, contentHeight, onCanvasSize]);

  useEffect(() => {
    if (!contentWidth || !contentHeight) return;
    if (fittedRef.current === fitKey) return;
    fittedRef.current = fitKey;

    const pad = 48;
    const sx = (size.width - pad * 2) / contentWidth;
    const sy = (size.height - pad * 2) / contentHeight;
    const next = Math.min(sx, sy, 1.5);
    setScale(next);
    setPosition({
      x: (size.width - contentWidth * next) / 2,
      y: (size.height - contentHeight * next) / 2,
    });
  }, [image, fitKey, contentWidth, contentHeight, size.width, size.height]);

  useEffect(() => {
    setDrawDraft(null);
    setRotating(null);
  }, [toolMode]);

  const isPanning = toolMode === "pan" || spaceDown;
  const isCalibrating = toolMode === "calibrate";
  const drawKind = drawKindFromTool(toolMode);
  const isTwoClickDraw = drawKind === "wall" || drawKind === "line";

  const pointerWorld = (stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - position.x) / scale,
      y: (pointer.y - position.y) / scale,
    };
  };

  const beginRotate = useCallback((id: string, rotation: number) => {
    setRotating({ id, angle: rotation });
  }, []);

  const updateRotate = () => {
    const active = rotatingRef.current;
    if (!active) return;
    const stage = stageRef.current;
    if (!stage) return;
    const world = pointerWorld(stage);
    if (!world) return;
    const item = items.find((i) => i.id === active.id);
    if (!item) return;
    const angle = rotationFromPointer({ x: item.x, y: item.y }, world);
    setRotating({ id: active.id, angle });
  };

  const endRotate = useCallback(() => {
    const active = rotatingRef.current;
    if (!active) return;
    rotatingRef.current = null;
    let angle = active.angle;
    const stage = stageRef.current;
    if (stage) {
      const pointer = stage.getPointerPosition();
      if (pointer) {
        const world = {
          x: (pointer.x - position.x) / scale,
          y: (pointer.y - position.y) / scale,
        };
        const item = items.find((i) => i.id === active.id);
        if (item) {
          angle = rotationFromPointer({ x: item.x, y: item.y }, world);
        }
      }
    }
    onItemChange(active.id, { rotation: angle });
    setRotating(null);
  }, [onItemChange, items, position, scale]);

  const isRotating = rotating !== null;

  useEffect(() => {
    if (!isRotating) return;
    const onRelease = () => endRotate();
    window.addEventListener("mouseup", onRelease);
    window.addEventListener("touchend", onRelease);
    return () => {
      window.removeEventListener("mouseup", onRelease);
      window.removeEventListener("touchend", onRelease);
    };
  }, [isRotating, endRotate]);

  const commitDrawElement = (
    kind: DrawElementKind,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    if (dist(start, end) < 4) return;
    const rect = normalizeRect(start.x, start.y, end.x, end.y);
    onElementAdd({
      id: crypto.randomUUID(),
      kind,
      x1: rect.x1,
      y1: rect.y1,
      x2: rect.x2,
      y2: rect.y2,
    });
    drawDraftRef.current = null;
    setDrawDraft(null);
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.06;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(
      8,
      Math.max(0.15, direction > 0 ? oldScale * scaleBy : oldScale / scaleBy),
    );

    const mousePointTo = {
      x: (pointer.x - position.x) / oldScale,
      y: (pointer.y - position.y) / oldScale,
    };

    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning) return;
    const stage = stageRef.current;
    if (!stage) return;

    const world = pointerWorld(stage);
    if (!world) return;

    if (isCalibrating) {
      if (!calibration.start) {
        onCalibrationChange({ start: world, end: null });
      } else {
        onCalibrationChange({ start: calibration.start, end: world });
        onCalibrationComplete(dist(calibration.start, world));
      }
      return;
    }

    if (drawKind) {
      if (isTwoClickDraw) {
        if (!drawDraft) {
          setDrawDraft({ kind: drawKind, start: world, end: null });
        } else {
          commitDrawElement(drawKind, drawDraft.start, world);
        }
        return;
      }

      setDrawDraft({ kind: drawKind, start: world, end: world });
      return;
    }

    if (
      e.target === stage ||
      e.target.getClassName() === "Image" ||
      e.target.name() === "canvas-background"
    ) {
      onSelect(null);
      onElementSelect(null);
    }
  };

  const handleStageMouseMove = () => {
    if (rotating) {
      updateRotate();
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const world = pointerWorld(stage);
    if (!world) return;

    if (isCalibrating && calibration.start && !calibration.end) {
      onCalibrationChange({ start: calibration.start, end: world });
      return;
    }

    if (drawDraft && (!isTwoClickDraw || drawDraft.end == null)) {
      setDrawDraft({ ...drawDraft, end: world });
    }
  };

  const handleStageMouseUp = () => {
    if (rotating) {
      endRotate();
      return;
    }
    const draft = drawDraftRef.current;
    if (!draft || isTwoClickDraw || isPanning) return;
    if (!draft.end) return;
    commitDrawElement(draft.kind, draft.start, draft.end);
  };

  const handleStageTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (!rotating) return;
    e.evt.preventDefault();
    updateRotate();
  };

  const furnitureNodes = useMemo(() => {
    if (!pixelsPerInch) return null;

    const sized = items.map((item) => ({
      item,
      w: item.widthIn * pixelsPerInch,
      h: item.depthIn * pixelsPerInch,
    }));

    const overlapping = new Set<string>();
    for (let i = 0; i < sized.length; i++) {
      for (let j = i + 1; j < sized.length; j++) {
        const a = sized[i];
        const b = sized[j];
        if (
          boxesOverlap(
            {
              x: a.item.x,
              y: a.item.y,
              w: a.w,
              h: a.h,
              rotation: a.item.rotation,
            },
            {
              x: b.item.x,
              y: b.item.y,
              w: b.w,
              h: b.h,
              rotation: b.item.rotation,
            },
          )
        ) {
          overlapping.add(a.item.id);
          overlapping.add(b.item.id);
        }
      }
    }

    const showHandle =
      toolMode === "select" && !isPanning && !isCalibrating && !isDrawTool(toolMode);

    return sized.map(({ item, w, h }) => {
      const selected = item.id === selectedId;
      const overlaps = overlapping.has(item.id);
      const isItemRotating = rotating?.id === item.id;
      const effectiveRotation = isItemRotating ? rotating.angle : item.rotation;
      const handleOffset = 28 / scale;
      const handleRadius = 5 / scale;
      const handleHitRadius = 14 / scale;
      return (
        <Group
          key={item.id}
          x={item.x}
          y={item.y}
          rotation={effectiveRotation}
          offsetX={w / 2}
          offsetY={h / 2}
          draggable={
            !isCalibrating && !isPanning && !isDrawTool(toolMode) && !isItemRotating
          }
          onClick={(e) => {
            e.cancelBubble = true;
            onSelect(item.id);
            onElementSelect(null);
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            onSelect(item.id);
            onElementSelect(null);
          }}
          onDragEnd={(e) => {
            onItemChange(item.id, {
              x: e.target.x(),
              y: e.target.y(),
            });
          }}
        >
          <Rect
            width={w}
            height={h}
            fill={
              overlaps
                ? "rgba(139, 74, 66, 0.22)"
                : selected
                  ? "rgba(61, 90, 91, 0.22)"
                  : "rgba(92, 90, 82, 0.18)"
            }
            stroke={
              overlaps
                ? "#8b4a42"
                : selected
                  ? "#3d5a5b"
                  : "rgba(42, 41, 36, 0.45)"
            }
            strokeWidth={selected || overlaps ? 2 / scale : 1 / scale}
            cornerRadius={2 / scale}
          />
          <Text
            text={item.label}
            width={w}
            height={h * 0.55}
            align="center"
            verticalAlign="bottom"
            fontSize={Math.max(10 / scale, Math.min(14, w / 8))}
            fill="rgba(42, 41, 36, 0.75)"
            listening={false}
          />
          {selected && (
            <Text
              text={formatDimensions(item.widthIn, item.depthIn, unitSystem)}
              width={w}
              y={h * 0.55}
              height={h * 0.4}
              align="center"
              verticalAlign="top"
              fontSize={Math.max(9 / scale, Math.min(12, w / 10))}
              fill="rgba(61, 90, 91, 0.95)"
              listening={false}
            />
          )}
          {selected && showHandle && (
            <>
              <Line
                points={[w / 2, 0, w / 2, -handleOffset]}
                stroke="#3d5a5b"
                strokeWidth={2 / scale}
                listening={false}
              />
              <Circle
                x={w / 2}
                y={-handleOffset}
                radius={handleHitRadius}
                fill="#3d5a5b"
                opacity={0}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  beginRotate(item.id, item.rotation);
                }}
                onTouchStart={(e) => {
                  e.cancelBubble = true;
                  beginRotate(item.id, item.rotation);
                }}
              />
              <Circle
                x={w / 2}
                y={-handleOffset}
                radius={handleRadius}
                fill="#f7f7f4"
                stroke="#3d5a5b"
                strokeWidth={2 / scale}
                listening={false}
              />
            </>
          )}
        </Group>
      );
    });
  }, [
    items,
    pixelsPerInch,
    selectedId,
    isCalibrating,
    isPanning,
    toolMode,
    onSelect,
    onElementSelect,
    onItemChange,
    scale,
    unitSystem,
    rotating,
    beginRotate,
  ]);

  const elementNodes = useMemo(
    () =>
      elements.map((el) => {
        const selected = el.id === selectedElementId;
        const draggable = toolMode === "select" && !isPanning;
        return renderElementShape(
          el,
          selected,
          scale,
          draggable,
          !isCalibrating && !drawKind,
          () => {
            onElementSelect(el.id);
            onSelect(null);
          },
          (dx, dy) => {
            onElementChange(el.id, {
              x1: el.x1 + dx,
              y1: el.y1 + dy,
              x2: el.x2 + dx,
              y2: el.y2 + dy,
            });
          },
        );
      }),
    [
      elements,
      selectedElementId,
      toolMode,
      isPanning,
      isCalibrating,
      drawKind,
      scale,
      onElementSelect,
      onSelect,
      onElementChange,
    ],
  );

  const cursor = isPanning
    ? "grab"
    : isCalibrating || drawKind
      ? "crosshair"
      : "default";

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={isPanning}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setPosition({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageMouseUp}
        style={{ cursor }}
      >
        <Layer>
          {!image && canvasWidth != null && canvasHeight != null && (
            <Rect
              name="canvas-background"
              x={0}
              y={0}
              width={canvasWidth}
              height={canvasHeight}
              fill="#fafaf7"
              stroke="rgba(42, 41, 36, 0.2)"
              strokeWidth={1 / scale}
              listening={!isCalibrating && !drawKind}
            />
          )}
          {image && imageUnderlayVisible && (
            <KonvaImage
              image={image}
              width={image.width}
              height={image.height}
              opacity={imageUnderlayOpacity}
              listening={!isCalibrating && !drawKind}
            />
          )}
          {elementNodes}
          {conversionPreview?.map((seg, i) => (
            <Line
              key={`preview-${i}`}
              points={[seg.start.x, seg.start.y, seg.end.x, seg.end.y]}
              stroke="rgba(245, 78, 0, 0.75)"
              strokeWidth={2 / scale}
              dash={[8 / scale, 4 / scale]}
              listening={false}
            />
          ))}
          {furnitureNodes}
          {drawDraft?.end &&
            renderDraftPreview(
              drawDraft.kind,
              drawDraft.start,
              drawDraft.end,
              scale,
            )}
          {isCalibrating && calibration.start && (
            <>
              <Circle
                x={calibration.start.x}
                y={calibration.start.y}
                radius={4 / scale}
                fill="#3d5a5b"
              />
              {calibration.end && (
                <>
                  <Line
                    points={[
                      calibration.start.x,
                      calibration.start.y,
                      calibration.end.x,
                      calibration.end.y,
                    ]}
                    stroke="#3d5a5b"
                    strokeWidth={2 / scale}
                    dash={[6 / scale, 4 / scale]}
                  />
                  <Circle
                    x={calibration.end.x}
                    y={calibration.end.y}
                    radius={4 / scale}
                    fill="#3d5a5b"
                  />
                </>
              )}
            </>
          )}
        </Layer>
      </Stage>
    </div>
  );
}
