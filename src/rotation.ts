/** Snap degrees to 15° increments and normalize to [0, 360). */
export function snapRotation(deg: number): number {
  const snapped = Math.round(deg / 15) * 15;
  return ((snapped % 360) + 360) % 360;
}
