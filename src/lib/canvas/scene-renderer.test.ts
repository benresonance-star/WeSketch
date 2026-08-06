import { describe, expect, it } from "vitest";

import {
  objectDrawOpacity,
  orderedVisibleLayers,
  strokeWidthAtPressure,
} from "@/lib/canvas/scene-renderer";
import type { CanvasLayer } from "@/types/canvas";

describe("objectDrawOpacity", () => {
  it("defaults missing opacity to fully opaque", () => {
    expect(objectDrawOpacity(undefined)).toBe(1);
  });

  it("clamps object opacity into the 0–1 range", () => {
    expect(objectDrawOpacity(-0.2)).toBe(0);
    expect(objectDrawOpacity(0.4)).toBe(0.4);
    expect(objectDrawOpacity(1.5)).toBe(1);
  });
});

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

describe("orderedVisibleLayers", () => {
  const layer = (
    id: string,
    order: number,
    visible = true,
    opacity = 1,
  ): CanvasLayer => ({
    id,
    name: id,
    order,
    opacity,
    visible,
    hasMask: false,
    maskEnabled: true,
    createdAt: 0,
  });

  it("renders bottom layers first and top layers last", () => {
    expect(
      orderedVisibleLayers([layer("top", 2), layer("bottom", 0)]).map(
        (item) => item.id,
      ),
    ).toEqual(["bottom", "top"]);
  });

  it("excludes hidden and fully transparent layers", () => {
    expect(
      orderedVisibleLayers([
        layer("visible", 0),
        layer("hidden", 1, false),
        layer("transparent", 2, true, 0),
      ]).map((item) => item.id),
    ).toEqual(["visible"]);
  });
});
