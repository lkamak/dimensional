import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Group, Rect, Text, Line, Circle } from "react-konva";
import type Konva from "konva";
import type {
  CalibrationDraft,
  FurnitureItem,
  ToolMode,
  UnitSystem,
} from "../types";
import { formatDimensions } from "../units";

type PlanCanvasProps = {
  imageDataUrl: string | null;
  pixelsPerInch: number | null;
  items: FurnitureItem[];
  selectedId: string | null;
  toolMode: ToolMode;
  unitSystem: UnitSystem;
  calibration: CalibrationDraft;
  onSelect: (id: string | null) => void;
  onItemChange: (id: string, patch: Partial<FurnitureItem>) => void;
  onCalibrationChange: (draft: CalibrationDraft) => void;
  onCalibrationComplete: (lineLengthPx: number) => void;
  onImageSize?: (size: { width: number; height: number }) => void;
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
  // Approximate with axis-aligned bounding boxes of rotated rects
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

export function PlanCanvas({
  imageDataUrl,
  pixelsPerInch,
  items,
  selectedId,
  toolMode,
  unitSystem,
  calibration,
  onSelect,
  onItemChange,
  onCalibrationChange,
  onCalibrationComplete,
  onImageSize,
}: PlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [isDraggingStage, setIsDraggingStage] = useState(false);
  const image = useHtmlImage(imageDataUrl);
  const fittedRef = useRef<string | null>(null);

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

  // Fit image into view when first loaded / replaced
  useEffect(() => {
    if (!image || !imageDataUrl) return;
    onImageSize?.({ width: image.width, height: image.height });
    if (fittedRef.current === imageDataUrl) return;
    fittedRef.current = imageDataUrl;

    const pad = 48;
    const sx = (size.width - pad * 2) / image.width;
    const sy = (size.height - pad * 2) / image.height;
    const next = Math.min(sx, sy, 1.5);
    setScale(next);
    setPosition({
      x: (size.width - image.width * next) / 2,
      y: (size.height - image.height * next) / 2,
    });
  }, [image, imageDataUrl, size.width, size.height, onImageSize]);

  const isPanning = toolMode === "pan" || spaceDown;
  const isCalibrating = toolMode === "calibrate";
  const isStageDraggable =
    (toolMode === "select" || isPanning) && !isCalibrating;

  const stageCursor = isDraggingStage
    ? "grabbing"
    : isStageDraggable
      ? "grab"
      : isCalibrating
        ? "crosshair"
        : "default";

  const isEmptyCanvasTarget = (target: Konva.Node) => {
    const stage = stageRef.current;
    return (
      stage !== null &&
      (target === stage || target.getClassName() === "Image")
    );
  };

  const pointerWorld = (stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - position.x) / scale,
      y: (pointer.y - position.y) / scale,
    };
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

  const handleStageMouseDown = () => {
    if (isPanning) return;
    const stage = stageRef.current;
    if (!stage) return;

    if (isCalibrating) {
      const world = pointerWorld(stage);
      if (!world) return;
      if (!calibration.start) {
        onCalibrationChange({ start: world, end: null });
      } else {
        // Second click commits the line (end may already be a live preview)
        onCalibrationChange({ start: calibration.start, end: world });
        onCalibrationComplete(dist(calibration.start, world));
      }
      return;
    }

  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning || isCalibrating) return;
    if (isEmptyCanvasTarget(e.target)) {
      onSelect(null);
    }
  };

  const handleStageTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (isPanning || isCalibrating) return;
    if (isEmptyCanvasTarget(e.target)) {
      onSelect(null);
    }
  };

  const handleStageDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === stageRef.current) {
      setIsDraggingStage(true);
    }
  };

  const handleStageDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === stageRef.current) {
      setPosition({ x: e.target.x(), y: e.target.y() });
    }
  };

  const handleStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === stageRef.current) {
      setPosition({ x: e.target.x(), y: e.target.y() });
      setIsDraggingStage(false);
    }
  };

  const setContainerCursor = (cursor: string) => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = cursor;
  };

  const handleStageMouseMove = () => {
    if (!isCalibrating || !calibration.start || calibration.end) return;
    const stage = stageRef.current;
    if (!stage) return;
    const world = pointerWorld(stage);
    if (!world) return;
    onCalibrationChange({ start: calibration.start, end: world });
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

    return sized.map(({ item, w, h }) => {
      const selected = item.id === selectedId;
      const overlaps = overlapping.has(item.id);
      return (
        <Group
          key={item.id}
          x={item.x}
          y={item.y}
          rotation={item.rotation}
          offsetX={w / 2}
          offsetY={h / 2}
          draggable={!isCalibrating && !isPanning}
          onMouseEnter={() => {
            if (toolMode === "select" && !isPanning) {
              setContainerCursor("move");
            }
          }}
          onMouseLeave={() => {
            if (toolMode === "select" && !isPanning) {
              setContainerCursor(stageCursor);
            }
          }}
          onClick={(e) => {
            e.cancelBubble = true;
            onSelect(item.id);
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            onSelect(item.id);
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
    stageCursor,
    onSelect,
    onItemChange,
    scale,
    unitSystem,
  ]);

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
        draggable={isStageDraggable}
        onDragStart={handleStageDragStart}
        onDragMove={handleStageDragMove}
        onDragEnd={handleStageDragEnd}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onClick={handleStageClick}
        onTap={handleStageTap}
        style={{
          cursor: stageCursor,
        }}
      >
        <Layer>
          {image && (
            <KonvaImage
              image={image}
              width={image.width}
              height={image.height}
              listening={!isCalibrating}
            />
          )}
          {furnitureNodes}
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
