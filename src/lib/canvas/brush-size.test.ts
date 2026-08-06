import { describe, expect, it } from "vitest";

import {
  BRUSH_SIZE_MAX,
  BRUSH_SIZE_MIN,
  brushSizeFromVerticalDrag,
} from "@/lib/canvas/brush-size";

describe("brushSizeFromVerticalDrag", () => {
  it("increases size when dragging up", () => {
    expect(brushSizeFromVerticalDrag(4, 100, 80)).toBeGreaterThan(4);
  });

  it("decreases size when dragging down", () => {
    expect(brushSizeFromVerticalDrag(4, 100, 120)).toBeLessThan(4);
  });

  it("clamps to the brush size range", () => {
    expect(brushSizeFromVerticalDrag(BRUSH_SIZE_MIN, 0, 10_000)).toBe(
      BRUSH_SIZE_MIN,
    );
    expect(brushSizeFromVerticalDrag(BRUSH_SIZE_MAX, 10_000, 0)).toBe(
      BRUSH_SIZE_MAX,
    );
  });

  it("rounds to the brush size step", () => {
    expect(brushSizeFromVerticalDrag(4, 100, 97)).toBe(4.5);
  });
});
