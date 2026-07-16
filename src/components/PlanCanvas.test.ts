import { describe, it, expect } from "vitest";
import { resolveDrawCoords, normalizeRect, dist } from "./PlanCanvas";

describe("resolveDrawCoords - line-like kinds preserve raw endpoints", () => {
  it("wall retains negative-slope endpoint order", () => {
    const coords = resolveDrawCoords("wall", { x: 100, y: 50 }, { x: 50, y: 100 });
    expect(coords).toEqual({ x1: 100, y1: 50, x2: 50, y2: 100 });
    expect(coords!.x1).toBeGreaterThan(coords!.x2);
    expect(coords!.y1).toBeLessThan(coords!.y2);
  });

  it("line retains negative-slope endpoint order", () => {
    const coords = resolveDrawCoords("line", { x: 100, y: 50 }, { x: 50, y: 100 });
    expect(coords).toEqual({ x1: 100, y1: 50, x2: 50, y2: 100 });
    expect(coords!.x1).toBeGreaterThan(coords!.x2);
    expect(coords!.y1).toBeLessThan(coords!.y2);
  });

  it("horizontal wall/line stores endpoints unchanged", () => {
    expect(resolveDrawCoords("wall", { x: 0, y: 0 }, { x: 50, y: 0 })).toEqual({
      x1: 0,
      y1: 0,
      x2: 50,
      y2: 0,
    });
    expect(resolveDrawCoords("line", { x: 0, y: 0 }, { x: 50, y: 0 })).toEqual({
      x1: 0,
      y1: 0,
      x2: 50,
      y2: 0,
    });
  });

  it("vertical wall/line stores endpoints unchanged", () => {
    expect(resolveDrawCoords("wall", { x: 0, y: 0 }, { x: 0, y: 50 })).toEqual({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 50,
    });
    expect(resolveDrawCoords("line", { x: 0, y: 0 }, { x: 0, y: 50 })).toEqual({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 50,
    });
  });

  it("positive-slope wall/line stores endpoints unchanged", () => {
    expect(resolveDrawCoords("wall", { x: 0, y: 0 }, { x: 50, y: 50 })).toEqual({
      x1: 0,
      y1: 0,
      x2: 50,
      y2: 50,
    });
    expect(resolveDrawCoords("line", { x: 0, y: 0 }, { x: 50, y: 50 })).toEqual({
      x1: 0,
      y1: 0,
      x2: 50,
      y2: 50,
    });
  });
});

describe("resolveDrawCoords - rectangle-like kinds normalize bounds", () => {
  const expected = { x1: 40, y1: 20, x2: 100, y2: 100 };

  it("room normalizes regardless of drag corner", () => {
    expect(
      resolveDrawCoords("room", { x: 100, y: 100 }, { x: 40, y: 20 }),
    ).toEqual(expected);
  });

  it("room produces identical bounds for all four drag directions", () => {
    const corners = [
      [
        { x: 40, y: 20 },
        { x: 100, y: 100 },
      ],
      [
        { x: 100, y: 100 },
        { x: 40, y: 20 },
      ],
      [
        { x: 100, y: 20 },
        { x: 40, y: 100 },
      ],
      [
        { x: 40, y: 100 },
        { x: 100, y: 20 },
      ],
    ] as const;
    for (const [start, end] of corners) {
      expect(resolveDrawCoords("room", start, end)).toEqual(expected);
    }
  });

  it("rect produces identical bounds for all four drag directions", () => {
    const corners = [
      [
        { x: 40, y: 20 },
        { x: 100, y: 100 },
      ],
      [
        { x: 100, y: 100 },
        { x: 40, y: 20 },
      ],
      [
        { x: 100, y: 20 },
        { x: 40, y: 100 },
      ],
      [
        { x: 40, y: 100 },
        { x: 100, y: 20 },
      ],
    ] as const;
    for (const [start, end] of corners) {
      expect(resolveDrawCoords("rect", start, end)).toEqual(expected);
    }
  });
});

describe("resolveDrawCoords - min-distance guard", () => {
  const kinds = ["wall", "line", "room", "rect"] as const;

  it("returns null when dist < 4 for every kind", () => {
    for (const kind of kinds) {
      expect(resolveDrawCoords(kind, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
    }
  });

  it("returns non-null when dist == 4 for every kind", () => {
    for (const kind of kinds) {
      expect(
        resolveDrawCoords(kind, { x: 0, y: 0 }, { x: 4, y: 0 }),
      ).not.toBeNull();
    }
  });
});

describe("normalizeRect", () => {
  it("normalizes all four quadrant directions to min/max bounds", () => {
    const bounds = { x1: 10, y1: 20, x2: 60, y2: 80 };
    expect(normalizeRect(10, 20, 60, 80)).toEqual(bounds);
    expect(normalizeRect(60, 80, 10, 20)).toEqual(bounds);
    expect(normalizeRect(60, 20, 10, 80)).toEqual(bounds);
    expect(normalizeRect(10, 80, 60, 20)).toEqual(bounds);
  });

  it("leaves already-normalized input unchanged", () => {
    expect(normalizeRect(0, 0, 100, 50)).toEqual({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 50,
    });
  });
});

describe("dist", () => {
  it("computes Euclidean distance for a 3-4-5 triangle", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("computes horizontal and vertical distances", () => {
    expect(dist({ x: 0, y: 0 }, { x: 50, y: 0 })).toBe(50);
    expect(dist({ x: 0, y: 0 }, { x: 0, y: 50 })).toBe(50);
  });

  it("is zero for identical points", () => {
    expect(dist({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});
