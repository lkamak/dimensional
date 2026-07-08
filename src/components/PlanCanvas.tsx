import { useEffect, useMemo, useRef, useState } from "react";
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
  FurnitureItem,
  ToolMode,
  UnitSystem,
  WallDraft,
  WallSegment,
} from "../types";
import { formatDimensions } from "../units";

type PlanCanvasProps = {
  imageDataUrl: string | null;
  pixelsPerInch: number | null;
  items: FurnitureItem[];
  walls: WallSegment[];
  selectedId: string | null;
  selectedWallId: string | null;
  toolMode: ToolMode;
  unitSystem: UnitSystem;
  calibration: CalibrationDraft;
  wallDraft: WallDraft;
  imageUnderlayVisible: boolean;
  imageUnderlayOpacity: number;
  conversionPreview?: { start: { x: number; y: number }; end: { x: number; y: number } }[];
  onSelect: (id: string | null) => void;
  onSelectWall: (id: string | null) => void;
  onItemChange: (id: string, patch: Partial<FurnitureItem>) => void;
  onWallChange: (id: string, patch: Partial<WallSegment>) => void;
  onCalibrationChange: (draft: CalibrationDraft) => void;
  onCalibrationComplete: (lineLengthPx: number) => void;
  onWallDraftChange: (draft: WallDraft) => void;
  onWallComplete: (start: { x: number; y: number }, end: { x: number; y: number }) => void;
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

function pointToSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function findWallAt(
  walls: WallSegment[],
  point: { x: number; y: number },
  threshold: number,
): WallSegment | null {
  let best: WallSegment | null = null;
  let bestDist = threshold;
  for (const wall of walls) {
    const d = pointToSegmentDistance(point, wall.start, wall.end);
    if (d < bestDist) {
      bestDist = d;
      best = wall;
    }
  }
  return best;
}

export function PlanCanvas({
  imageDataUrl,
  pixelsPerInch,
  items,
  walls,
  selectedId,
  selectedWallId,
  toolMode,
  unitSystem,
  calibration,
  wallDraft,
  imageUnderlayVisible,
  imageUnderlayOpacity,
  conversionPreview,
  onSelect,
  onSelectWall,
  onItemChange,
  onWallChange,
  onCalibrationChange,
  onCalibrationComplete,
  onWallDraftChange,
  onWallComplete,
  onImageSize,
}: PlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
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
  const isDrawingWall = toolMode === "draw_wall";

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

    if (isDrawingWall) {
      if (!wallDraft.start) {
        onWallDraftChange({ start: world, end: null });
      } else {
        onWallDraftChange({ start: wallDraft.start, end: world });
        onWallComplete(wallDraft.start, world);
      }
      return;
    }

    if (toolMode === "select") {
      const hitWall = findWallAt(walls, world, 8 / scale);
      if (hitWall) {
        onSelectWall(hitWall.id);
        onSelect(null);
        return;
      }
    }

    if (e.target === stage || e.target.getClassName() === "Image") {
      onSelect(null);
      onSelectWall(null);
    }
  };

  const handleStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const world = pointerWorld(stage);
    if (!world) return;

    if (isCalibrating && calibration.start && !calibration.end) {
      onCalibrationChange({ start: calibration.start, end: world });
      return;
    }

    if (isDrawingWall && wallDraft.start && !wallDraft.end) {
      onWallDraftChange({ start: wallDraft.start, end: world });
    }
  };

  const wallNodes = useMemo(() => {
    const strokeW = 3 / scale;
    const previewStroke = 2 / scale;

    const previewNodes =
      conversionPreview?.map((seg, i) => (
        <Line
          key={`preview-${i}`}
          points={[seg.start.x, seg.start.y, seg.end.x, seg.end.y]}
          stroke="rgba(245, 78, 0, 0.75)"
          strokeWidth={previewStroke}
          dash={[8 / scale, 4 / scale]}
          listening={false}
        />
      )) ?? [];

    const wallLines = walls.map((wall) => {
      const selected = wall.id === selectedWallId;
      return (
        <Group key={wall.id}>
          <Line
            points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
            stroke={selected ? "#3d5a5b" : "rgba(42, 41, 36, 0.85)"}
            strokeWidth={selected ? strokeW + 1 / scale : strokeW}
            hitStrokeWidth={Math.max(12 / scale, 8)}
            onClick={(ev) => {
              ev.cancelBubble = true;
              onSelectWall(wall.id);
              onSelect(null);
            }}
            onTap={(ev) => {
              ev.cancelBubble = true;
              onSelectWall(wall.id);
              onSelect(null);
            }}
          />
          {selected && (
            <>
              <Circle
                x={wall.start.x}
                y={wall.start.y}
                radius={5 / scale}
                fill="#3d5a5b"
                draggable={!isPanning && !isCalibrating}
                onDragEnd={(ev) => {
                  onWallChange(wall.id, {
                    start: { x: ev.target.x(), y: ev.target.y() },
                  });
                }}
              />
              <Circle
                x={wall.end.x}
                y={wall.end.y}
                radius={5 / scale}
                fill="#3d5a5b"
                draggable={!isPanning && !isCalibrating}
                onDragEnd={(ev) => {
                  onWallChange(wall.id, {
                    end: { x: ev.target.x(), y: ev.target.y() },
                  });
                }}
              />
            </>
          )}
        </Group>
      );
    });

    return [...previewNodes, ...wallLines];
  }, [
    walls,
    selectedWallId,
    scale,
    conversionPreview,
    isPanning,
    isCalibrating,
    onSelectWall,
    onSelect,
    onWallChange,
  ]);

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
          draggable={!isCalibrating && !isPanning && !isDrawingWall}
          onClick={(ev) => {
            ev.cancelBubble = true;
            onSelect(item.id);
            onSelectWall(null);
          }}
          onTap={(ev) => {
            ev.cancelBubble = true;
            onSelect(item.id);
            onSelectWall(null);
          }}
          onDragEnd={(ev) => {
            onItemChange(item.id, {
              x: ev.target.x(),
              y: ev.target.y(),
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
    isDrawingWall,
    onSelect,
    onSelectWall,
    onItemChange,
    scale,
    unitSystem,
  ]);

  const cursor =
    isPanning ? "grab" : isCalibrating || isDrawingWall ? "crosshair" : "default";

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
        style={{ cursor }}
      >
        <Layer>
          {image && imageUnderlayVisible && (
            <KonvaImage
              image={image}
              width={image.width}
              height={image.height}
              opacity={imageUnderlayOpacity}
              listening={!isCalibrating && !isDrawingWall}
            />
          )}
          {wallNodes}
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
          {isDrawingWall && wallDraft.start && (
            <>
              <Circle
                x={wallDraft.start.x}
                y={wallDraft.start.y}
                radius={4 / scale}
                fill="#f54e00"
              />
              {wallDraft.end && (
                <>
                  <Line
                    points={[
                      wallDraft.start.x,
                      wallDraft.start.y,
                      wallDraft.end.x,
                      wallDraft.end.y,
                    ]}
                    stroke="#f54e00"
                    strokeWidth={2 / scale}
                    dash={[6 / scale, 4 / scale]}
                  />
                  <Circle
                    x={wallDraft.end.x}
                    y={wallDraft.end.y}
                    radius={4 / scale}
                    fill="#f54e00"
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
