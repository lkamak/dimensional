/** Snap a rotation in degrees to the nearest 15° and normalize to 0–359°. */
export function snapRotation(deg: number): number {
  const snapped = Math.round(deg / 15) * 15;
  return ((snapped % 360) + 360) % 360;
}

/**
 * Rotation (in degrees) implied by a pointer position relative to a center,
 * for a handle that sits on the top axis of the element.
 *
 * The handle points straight up when rotation is 0, so the raw angle is
 * offset by 90° before snapping and normalizing.
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
