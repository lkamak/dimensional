/** Snap a rotation in degrees to the nearest 15° and normalize into [0, 360). */
export function snapRotation(deg: number): number {
  const snapped = Math.round(deg / 15) * 15;
  return ((snapped % 360) + 360) % 360;
}

/**
 * Compute the snapped rotation (in degrees) for an item whose rotation handle
 * sits directly above its center. The pointer's angle relative to the center is
 * measured with `atan2` and offset by 90° so that dragging the handle to the
 * top yields 0°, right yields 90°, bottom 180°, and left 270°.
 */
export function rotationFromPointer(
  center: { x: number; y: number },
  pointer: { x: number; y: number },
): number {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return snapRotation(deg);
}
