type Point = { x: number; y: number };

export function snapRotation(degrees: number): number {
  const snapped = Math.round(degrees / 15) * 15;
  return ((snapped % 360) + 360) % 360;
}

/** Angle from center to pointer, adjusted for a handle on the top axis (+90°). */
export function rotationFromPointer(center: Point, pointer: Point): number {
  const degrees =
    (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI +
    90;
  return snapRotation(degrees);
}
