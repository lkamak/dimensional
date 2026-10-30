import type { FurnitureShape } from "../types";

type FurnitureShapePreviewProps = {
  widthIn: number;
  depthIn: number;
  shape: FurnitureShape;
};

const VIEW = 120;
const PAD = 8;

export function FurnitureShapePreview({
  widthIn,
  depthIn,
  shape,
}: FurnitureShapePreviewProps) {
  const maxDim = Math.max(widthIn, depthIn, 0.01);
  const scale = (VIEW - PAD * 2) / maxDim;
  const w = widthIn * scale;
  const h = depthIn * scale;
  const ox = (VIEW - w) / 2;
  const oy = (VIEW - h) / 2;

  const fill = "rgba(92, 90, 82, 0.35)";
  const stroke = "rgba(42, 41, 36, 0.5)";

  if (shape.type === "round") {
    return (
      <svg
        className="shape-preview-svg"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width={VIEW}
        height={VIEW}
        aria-hidden
      >
        <ellipse
          cx={ox + w / 2}
          cy={oy + h / 2}
          rx={w / 2}
          ry={h / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  if (shape.type === "l") {
    const tIn = shape.thicknessIn;
    const t = tIn * scale;
    if (t >= w || t >= h) {
      return (
        <svg
          className="shape-preview-svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          width={VIEW}
          height={VIEW}
          aria-hidden
        >
          <rect x={ox} y={oy} width={w} height={h} fill={fill} stroke={stroke} />
        </svg>
      );
    }
    if (!shape.flip) {
      return (
        <svg
          className="shape-preview-svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          width={VIEW}
          height={VIEW}
          aria-hidden
        >
          <rect x={ox} y={oy} width={t} height={h} fill={fill} stroke={stroke} />
          <rect
            x={ox + t}
            y={oy + h - t}
            width={w - t}
            height={t}
            fill={fill}
            stroke={stroke}
          />
        </svg>
      );
    }
    return (
      <svg
        className="shape-preview-svg"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width={VIEW}
        height={VIEW}
        aria-hidden
      >
        <rect
          x={ox + w - t}
          y={oy}
          width={t}
          height={h}
          fill={fill}
          stroke={stroke}
        />
        <rect
          x={ox}
          y={oy + h - t}
          width={w - t}
          height={t}
          fill={fill}
          stroke={stroke}
        />
      </svg>
    );
  }

  return (
    <svg
      className="shape-preview-svg"
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={VIEW}
      height={VIEW}
      aria-hidden
    >
      <rect
        x={ox}
        y={oy}
        width={w}
        height={h}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        rx={2}
      />
    </svg>
  );
}
