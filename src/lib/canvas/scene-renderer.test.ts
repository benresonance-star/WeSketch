import { describe, expect, it } from "vitest";

import { strokeWidthAtPressure } from "@/lib/canvas/scene-renderer";

describe("strokeWidthAtPressure", () => {
  it("maps Pencil pressure from a fine line to full brush size", () => {
    expect(strokeWidthAtPressure(10, 0, true)).toBe(2);
    expect(strokeWidthAtPressure(10, 0.5, true)).toBeCloseTo(6);
    expect(strokeWidthAtPressure(10, 1, true)).toBe(10);
  });

  it("uses a constant width when pressure is disabled", () => {
    expect(strokeWidthAtPressure(7.5, 0.1, false)).toBe(7.5);
    expect(strokeWidthAtPressure(7.5, 1, false)).toBe(7.5);
  });

  it("clamps pressure outside the pointer-event range", () => {
    expect(strokeWidthAtPressure(10, -1, true)).toBe(2);
    expect(strokeWidthAtPressure(10, 2, true)).toBe(10);
  });
});
