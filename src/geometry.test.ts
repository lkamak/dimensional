import { describe, it, expect } from "vitest";
import { snapRotation, rotationFromPointer } from "./geometry";

describe("snapRotation", () => {
  it("rounds to the nearest 15", () => {
    expect(snapRotation(7)).toBe(0);
    expect(snapRotation(8)).toBe(15);
    expect(snapRotation(22)).toBe(15);
    expect(snapRotation(23)).toBe(30);
    expect(snapRotation(0)).toBe(0);
    expect(snapRotation(15)).toBe(15);
    expect(snapRotation(90)).toBe(90);
  });

  it("normalizes negative inputs into [0, 360)", () => {
    // Math.round(-15/15) = -1 => -15 => 345
    expect(snapRotation(-15)).toBe(345);
    // Math.round(-1/15) = Math.round(-0.066) = -0 => 0
    expect(snapRotation(-1)).toBe(0);
    // Math.round(-8/15) = Math.round(-0.533) = -1 => -15 => 345
    expect(snapRotation(-8)).toBe(345);
    // Math.round(-7/15) = Math.round(-0.466) = -0 => 0
    expect(snapRotation(-7)).toBe(0);
    // Math.round(-90/15) = -6 => -90 => 270
    expect(snapRotation(-90)).toBe(270);
  });

  it("normalizes values >= 360 into [0, 360)", () => {
    // Math.round(360/15) = 24 => 360 => 0
    expect(snapRotation(360)).toBe(0);
    // Math.round(370/15) = Math.round(24.666) = 25 => 375 => 15
    expect(snapRotation(370)).toBe(15);
    // Math.round(375/15) = 25 => 375 => 15
    expect(snapRotation(375)).toBe(15);
    // Math.round(720/15) = 48 => 720 => 0
    expect(snapRotation(720)).toBe(0);
  });

  it("never returns 360 at the upper boundary", () => {
    // Math.round(352.5/15) = Math.round(23.5) = 24 => 360 => 0
    expect(snapRotation(352.5)).toBe(0);
    // Math.round(358/15) = Math.round(23.866) = 24 => 360 => 0
    expect(snapRotation(358)).toBe(0);
    expect(snapRotation(359.9)).toBe(0);
    expect(snapRotation(360)).toBe(0);
    // Sweep a range and assert none produce exactly 360
    for (let d = 340; d <= 380; d += 0.5) {
      expect(snapRotation(d)).not.toBe(360);
    }
  });
});

describe("rotationFromPointer", () => {
  const center = { x: 100, y: 100 };

  it("maps the four cardinal directions (y-down coordinates)", () => {
    // ABOVE: dx=0, dy=-100 => atan2(-100,0)=-90 => +90 => 0
    expect(rotationFromPointer(center, { x: 100, y: 0 })).toBe(0);
    // RIGHT: dx=100, dy=0 => atan2(0,100)=0 => +90 => 90
    expect(rotationFromPointer(center, { x: 200, y: 100 })).toBe(90);
    // BELOW: dx=0, dy=100 => atan2(100,0)=90 => +90 => 180
    expect(rotationFromPointer(center, { x: 100, y: 200 })).toBe(180);
    // LEFT: dx=-100, dy=0 => atan2(0,-100)=180 => +90 => 270
    expect(rotationFromPointer(center, { x: 0, y: 100 })).toBe(270);
  });

  it("snaps an off-axis diagonal correctly", () => {
    // UP-RIGHT: dx=100, dy=-100 => atan2(-100,100)=-45 => +90 => 45
    expect(rotationFromPointer(center, { x: 200, y: 0 })).toBe(45);
    // DOWN-RIGHT: dx=100, dy=100 => atan2(100,100)=45 => +90 => 135
    expect(rotationFromPointer(center, { x: 200, y: 200 })).toBe(135);
    // DOWN-LEFT: dx=-100, dy=100 => atan2(100,-100)=135 => +90 => 225
    expect(rotationFromPointer(center, { x: 0, y: 200 })).toBe(225);
    // UP-LEFT: dx=-100, dy=-100 => atan2(-100,-100)=-135 => +90 => -45 => 315
    expect(rotationFromPointer(center, { x: 0, y: 0 })).toBe(315);
  });

  it("applies the +90 top-axis correction (straight up is 0, not 90 or 270)", () => {
    const result = rotationFromPointer(center, { x: 100, y: 20 });
    expect(result).toBe(0);
    expect(result).not.toBe(90);
    expect(result).not.toBe(270);
  });

  it("never returns 360 for any pointer around the circle", () => {
    for (let angle = 0; angle < 360; angle += 1) {
      const rad = (angle * Math.PI) / 180;
      const pointer = {
        x: center.x + Math.cos(rad) * 100,
        y: center.y + Math.sin(rad) * 100,
      };
      expect(rotationFromPointer(center, pointer)).not.toBe(360);
    }
  });
});
