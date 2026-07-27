export function snapRotation(degrees: number): number {
  const snapped = Math.round(degrees / 15) * 15;
  return ((snapped % 360) + 360) % 360;
}
