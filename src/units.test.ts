import { describe, it, expect } from "vitest";
import {
  INCHES_PER_FOOT,
  CM_PER_INCH,
  inchesToCm,
  cmToInches,
  inchesToDisplayValue,
  displayValueToInches,
  formatImperial,
  formatMetric,
  formatLength,
  formatDimensions,
  unitLabel,
  unitLabelLong,
} from "./units";

describe("constants", () => {
  it("INCHES_PER_FOOT is 12", () => {
    expect(INCHES_PER_FOOT).toBe(12);
  });

  it("CM_PER_INCH is 2.54", () => {
    expect(CM_PER_INCH).toBe(2.54);
  });
});

describe("inchesToCm / cmToInches", () => {
  it("inchesToCm multiplies by 2.54", () => {
    expect(inchesToCm(1)).toBeCloseTo(2.54, 10);
    expect(inchesToCm(10)).toBeCloseTo(25.4, 10);
    expect(inchesToCm(0)).toBe(0);
  });

  it("cmToInches divides by 2.54", () => {
    expect(cmToInches(2.54)).toBeCloseTo(1, 10);
    expect(cmToInches(25.4)).toBeCloseTo(10, 10);
    expect(cmToInches(0)).toBe(0);
  });

  it("round-trips through cm and back", () => {
    for (const inches of [0, 1, 12, 36.5, 100.25]) {
      expect(cmToInches(inchesToCm(inches))).toBeCloseTo(inches, 10);
    }
  });
});

describe("inchesToDisplayValue", () => {
  it("metric rounds to 0.1 cm", () => {
    // 10 in -> 25.4 cm
    expect(inchesToDisplayValue(10, "metric")).toBe(25.4);
    // 1 in -> 2.54 cm -> rounds to 2.5
    expect(inchesToDisplayValue(1, "metric")).toBe(2.5);
    // 5 in -> 12.7 cm
    expect(inchesToDisplayValue(5, "metric")).toBe(12.7);
  });

  it("imperial rounds to 0.01 in", () => {
    expect(inchesToDisplayValue(10.126, "imperial")).toBe(10.13);
    expect(inchesToDisplayValue(10.124, "imperial")).toBe(10.12);
    expect(inchesToDisplayValue(7, "imperial")).toBe(7);
  });
});

describe("displayValueToInches", () => {
  it("metric converts cm to inches", () => {
    expect(displayValueToInches(25.4, "metric")).toBeCloseTo(10, 10);
    expect(displayValueToInches(2.54, "metric")).toBeCloseTo(1, 10);
  });

  it("imperial passes value through unchanged", () => {
    expect(displayValueToInches(10, "imperial")).toBe(10);
    expect(displayValueToInches(36.5, "imperial")).toBe(36.5);
  });

  it("round-trips approximately with inchesToDisplayValue", () => {
    for (const inches of [3, 12, 36.4, 100.2]) {
      const metricDisplay = inchesToDisplayValue(inches, "metric");
      expect(displayValueToInches(metricDisplay, "metric")).toBeCloseTo(
        inches,
        1,
      );

      const imperialDisplay = inchesToDisplayValue(inches, "imperial");
      expect(displayValueToInches(imperialDisplay, "imperial")).toBeCloseTo(
        inches,
        1,
      );
    }
  });
});

describe("formatImperial", () => {
  it("whole feet render without inches", () => {
    // 84 % 12 = 0 -> "7'"
    expect(formatImperial(84)).toBe("7'");
    // 96 % 12 = 0 -> "8'"
    expect(formatImperial(96)).toBe("8'");
    expect(formatImperial(0)).toBe("0'");
  });

  it("whole inch remainder renders as integer", () => {
    // 86 -> 7 ft, 2 in
    expect(formatImperial(86)).toBe('7\'2"');
  });

  it("fractional inch remainder renders one decimal", () => {
    // 84.5 -> feet 7, rem 0.5 -> "7'0.5\""
    expect(formatImperial(84.5)).toBe('7\'0.5"');
  });

  it("carries up to next foot when remainder rounds to 12", () => {
    // 95.98 -> feet 7 (95.98/12=7.998), rem = round(11.98*10)/10 = 12 -> "8'"
    expect(formatImperial(95.98)).toBe("8'");
  });

  it("clamps negative inches to 0'", () => {
    expect(formatImperial(-5)).toBe("0'");
    expect(formatImperial(-0.5)).toBe("0'");
  });
});

describe("formatMetric", () => {
  it("below 100cm returns cm", () => {
    // 12 in -> 30.48 cm -> 30.5 cm
    expect(formatMetric(12)).toBe("30.5 cm");
    // 39 in -> 99.06 cm -> 99.1 cm
    expect(formatMetric(39)).toBe("99.1 cm");
  });

  it("at/above 100cm returns m", () => {
    // 40 in -> 101.6 cm -> 1.016 m -> 1.02 m
    expect(formatMetric(40)).toBe("1.02 m");
  });

  it("uses actual cm (not rounded cm) for the 100cm threshold", () => {
    // 39.37 in -> 99.9998 cm (< 100) -> cm branch, rounds to 100 cm
    expect(formatMetric(39.37)).toBe("100 cm");
    // 39.38 in -> 100.0252 cm (>= 100) -> m branch -> 1 m
    expect(formatMetric(39.38)).toBe("1 m");
  });
});

describe("formatLength", () => {
  it("dispatches to imperial", () => {
    expect(formatLength(86, "imperial")).toBe('7\'2"');
  });

  it("dispatches to metric", () => {
    expect(formatLength(12, "metric")).toBe("30.5 cm");
  });
});

describe("formatDimensions", () => {
  it('joins width and depth with " × "', () => {
    expect(formatDimensions(84, 86, "imperial")).toBe("7' × 7'2\"");
    expect(formatDimensions(12, 40, "metric")).toBe("30.5 cm × 1.02 m");
  });

  it("uses the multiplication sign U+00D7", () => {
    expect(formatDimensions(84, 84, "imperial")).toContain("\u00d7");
  });
});

describe("unitLabel", () => {
  it("returns correct short labels", () => {
    expect(unitLabel("metric")).toBe("cm");
    expect(unitLabel("imperial")).toBe("in");
  });
});

describe("unitLabelLong", () => {
  it("returns correct long labels", () => {
    expect(unitLabelLong("metric")).toBe("Centimeters");
    expect(unitLabelLong("imperial")).toBe("Inches");
  });
});
