export function snapRotation(deg: number): number {
  const snapped = Math.round(deg / 15) * 15;
  return normalizeRotation(snapped);
}

export function normalizeRotation(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed delta from `fromDeg` to `toDeg` in (-180, 180]. */
export function shortestRotationDelta(fromDeg: number, toDeg: number): number {
  const delta = ((toDeg - fromDeg) % 360 + 360) % 360;
  return delta > 180 ? delta - 360 : delta;
}

/** Angle from furniture center to pointer, with handle on the top axis at 0°. */
export function rotationFromPointer(
  center: { x: number; y: number },
  pointer: { x: number; y: number },
): number {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const rad = Math.atan2(dy, dx);
  return normalizeRotation((rad * 180) / Math.PI + 90);
}
