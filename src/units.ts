import type { UnitSystem } from "./types";

export const INCHES_PER_FOOT = 12;
export const CM_PER_INCH = 2.54;

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inchesToDisplayValue(
  inches: number,
  unitSystem: UnitSystem,
): number {
  if (unitSystem === "metric") {
    return Math.round(inchesToCm(inches) * 10) / 10;
  }
  return Math.round(inches * 100) / 100;
}

export function displayValueToInches(
  value: number,
  unitSystem: UnitSystem,
): number {
  if (unitSystem === "metric") {
    return cmToInches(value);
  }
  return value;
}

/** Format inches as 7'0" or 7'2" */
export function formatImperial(inches: number): string {
  const total = Math.max(0, inches);
  const feet = Math.floor(total / INCHES_PER_FOOT);
  const rem = Math.round((total % INCHES_PER_FOOT) * 10) / 10;
  if (rem === 0) return `${feet}'`;
  if (rem === INCHES_PER_FOOT) return `${feet + 1}'`;
  const remStr = Number.isInteger(rem) ? `${rem}` : rem.toFixed(1);
  return `${feet}'${remStr}"`;
}

/** Format inches as cm or m depending on magnitude */
export function formatMetric(inches: number): string {
  const cm = inchesToCm(inches);
  if (cm >= 100) {
    const m = cm / 100;
    return `${Math.round(m * 100) / 100} m`;
  }
  return `${Math.round(cm * 10) / 10} cm`;
}

export function formatLength(inches: number, unitSystem: UnitSystem): string {
  return unitSystem === "metric"
    ? formatMetric(inches)
    : formatImperial(inches);
}

export function formatDimensions(
  widthIn: number,
  depthIn: number,
  unitSystem: UnitSystem,
): string {
  return `${formatLength(widthIn, unitSystem)} × ${formatLength(depthIn, unitSystem)}`;
}

export function unitLabel(unitSystem: UnitSystem): string {
  return unitSystem === "metric" ? "cm" : "in";
}

export function unitLabelLong(unitSystem: UnitSystem): string {
  return unitSystem === "metric" ? "Centimeters" : "Inches";
}
