import type { Point } from "./types";

export type VectorizeResult = {
  walls: { start: Point; end: Point }[];
  warning?: string;
};

const MAX_PROCESS_DIM = 900;
const MIN_SEGMENT_PX = 18;
const MERGE_ANGLE_DEG = 8;
const MERGE_DISTANCE_PX = 12;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

function grayscale(data: Uint8ClampedArray, len: number): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const o = i * 4;
    out[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  return out;
}

function otsuThreshold(gray: Float32Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    hist[Math.min(255, Math.max(0, Math.round(gray[i])))]++;
  }
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

function sobelMagnitude(gray: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  const gxK = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyK = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0;
      let gy = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const v = gray[(y + ky) * w + (x + kx)];
          gx += v * gxK[k];
          gy += v * gyK[k];
          k++;
        }
      }
      mag[y * w + x] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

function percentile(values: Float32Array, p: number): number {
  const sorted = Array.from(values).filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

type Segment = { start: Point; end: Point; angle: number };

function segmentAngle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function segmentLength(seg: { start: Point; end: Point }): number {
  return Math.hypot(seg.end.x - seg.start.x, seg.end.y - seg.start.y);
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function mergeSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];

  for (const seg of segments) {
    let absorbed = false;
    for (let i = 0; i < merged.length; i++) {
      const other = merged[i];
      const angleDiff =
        (Math.abs(seg.angle - other.angle) * 180) / Math.PI;
      const normDiff = Math.min(angleDiff, 180 - angleDiff);
      if (normDiff > MERGE_ANGLE_DEG) continue;

      const d1 = pointToSegmentDistance(seg.start, other.start, other.end);
      const d2 = pointToSegmentDistance(seg.end, other.start, other.end);
      if (d1 > MERGE_DISTANCE_PX || d2 > MERGE_DISTANCE_PX) continue;

      const points = [other.start, other.end, seg.start, seg.end];
      const cos = Math.cos(other.angle);
      const sin = Math.sin(other.angle);
      const origin = other.start;
      let minT = Infinity;
      let maxT = -Infinity;
      for (const pt of points) {
        const t = (pt.x - origin.x) * cos + (pt.y - origin.y) * sin;
        minT = Math.min(minT, t);
        maxT = Math.max(maxT, t);
      }
      merged[i] = {
        start: {
          x: origin.x + minT * cos,
          y: origin.y + minT * sin,
        },
        end: {
          x: origin.x + maxT * cos,
          y: origin.y + maxT * sin,
        },
        angle: other.angle,
      };
      absorbed = true;
      break;
    }
    if (!absorbed) merged.push(seg);
  }

  return merged;
}

function extractLineSegments(
  edges: Uint8Array,
  w: number,
  h: number,
): Segment[] {
  const thetaSteps = 180;
  const diag = Math.ceil(Math.hypot(w, h));
  const accumulator = new Uint32Array(thetaSteps * (diag * 2 + 1));
  const edgePoints: { x: number; y: number }[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!edges[y * w + x]) continue;
      edgePoints.push({ x, y });
      for (let t = 0; t < thetaSteps; t++) {
        const theta = (t * Math.PI) / thetaSteps;
        const rho = Math.round(x * Math.cos(theta) + y * Math.sin(theta)) + diag;
        accumulator[t * (diag * 2 + 1) + rho]++;
      }
    }
  }

  if (edgePoints.length === 0) return [];

  const votes: { theta: number; rho: number; count: number }[] = [];
  const minVotes = Math.max(12, Math.floor(edgePoints.length * 0.008));

  for (let t = 0; t < thetaSteps; t++) {
    const theta = (t * Math.PI) / thetaSteps;
    const row = t * (diag * 2 + 1);
    for (let r = 0; r < diag * 2 + 1; r++) {
      const count = accumulator[row + r];
      if (count < minVotes) continue;
      const left = accumulator[row + Math.max(0, r - 1)];
      const right = accumulator[row + Math.min(diag * 2, r + 1)];
      if (count >= left && count >= right) {
        votes.push({ theta, rho: r - diag, count });
      }
    }
  }

  votes.sort((a, b) => b.count - a.count);
  const topVotes = votes.slice(0, 80);
  const segments: Segment[] = [];

  for (const { theta, rho } of topVotes) {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const onLine: { x: number; y: number; t: number }[] = [];

    for (const p of edgePoints) {
      const dist = Math.abs(p.x * cos + p.y * sin - rho);
      if (dist > 2.5) continue;
      const t = p.x * -sin + p.y * cos;
      onLine.push({ x: p.x, y: p.y, t });
    }

    if (onLine.length < 8) continue;
    onLine.sort((a, b) => a.t - b.t);

    let runStart = 0;
    for (let i = 1; i <= onLine.length; i++) {
      const gap = i < onLine.length ? onLine[i].t - onLine[i - 1].t : Infinity;
      if (gap > 10) {
        if (i - runStart >= 4) {
          const slice = onLine.slice(runStart, i);
          const start = slice[0];
          const end = slice[slice.length - 1];
          const seg = { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
          if (segmentLength(seg) >= MIN_SEGMENT_PX) {
            segments.push({ ...seg, angle: segmentAngle(seg.start, seg.end) });
          }
        }
        runStart = i;
      }
    }
  }

  return mergeSegments(segments);
}

export async function vectorizeFloorPlan(
  imageDataUrl: string,
): Promise<VectorizeResult> {
  const image = await loadImage(imageDataUrl);
  const scale = Math.min(
    1,
    MAX_PROCESS_DIM / Math.max(image.width, image.height),
  );
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { walls: [], warning: "Canvas not available in this browser." };
  }

  ctx.drawImage(image, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const gray = grayscale(imageData.data, w * h);
  const threshold = otsuThreshold(gray);

  let darkCount = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < threshold) darkCount++;
  }
  const darkBackground = darkCount > gray.length * 0.5;

  const mag = sobelMagnitude(gray, w, h);
  const edgeThreshold = Math.max(percentile(mag, 88), 20);
  const edges = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const isEdge = mag[i] >= edgeThreshold;
    const isStructure = darkBackground ? gray[i] > threshold : gray[i] < threshold;
    edges[i] = isEdge && isStructure ? 1 : 0;
  }

  const segments = extractLineSegments(edges, w, h);
  const invScale = 1 / scale;

  const walls = segments
    .map((seg) => ({
      start: { x: seg.start.x * invScale, y: seg.start.y * invScale },
      end: { x: seg.end.x * invScale, y: seg.end.y * invScale },
    }))
    .filter((seg) => segmentLength(seg) >= MIN_SEGMENT_PX * invScale);

  let warning: string | undefined;
  if (walls.length === 0) {
    warning =
      "No walls were detected. Try a higher-contrast blueprint, or draw walls manually.";
  } else if (walls.length > 120) {
    warning =
      "Many segments were detected — noisy photos may need manual cleanup with draw tools.";
  }

  return { walls, warning };
}
