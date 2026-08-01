import { describe, expect, it } from "vitest";

import {
  boundsFromPoints,
  expandBounds,
  hitTestStroke,
  normalizeBounds,
} from "@/lib/canvas/selection";
import type { Stroke } from "@/types/canvas";

describe("selection geometry", () => {
  it("normalizes a rectangle dragged in any direction", () => {
    expect(normalizeBounds({ x: 80, y: 90 }, { x: 20, y: 30 })).toEqual({
      x: 20,
      y: 30,
      width: 60,
      height: 60,
    });
  });

  it("computes lasso bounds from its path", () => {
    expect(
      boundsFromPoints([
        { x: 20, y: 50 },
        { x: 90, y: 10 },
        { x: 45, y: 120 },
      ]),
    ).toEqual({ x: 20, y: 10, width: 70, height: 110 });
  });

  it("expands context by half the selection on each side and clamps it", () => {
    expect(
      expandBounds(
        { x: 10, y: 20, width: 100, height: 80 },
        0.5,
        500,
        400,
      ),
    ).toEqual({ x: 0, y: 0, width: 160, height: 140 });
  });

  it("hit-tests the complete stroke path rather than only stored points", () => {
    const stroke: Stroke = {
      id: "stroke",
      layerId: "layer",
      points: [
        { x: 0, y: 0, pressure: 0.5, time: 0 },
        { x: 100, y: 0, pressure: 0.5, time: 1 },
      ],
      color: "#000",
      width: 4,
      createdAt: 0,
    };

    expect(hitTestStroke({ x: 50, y: 4 }, stroke, 5)).toBe(true);
    expect(hitTestStroke({ x: 50, y: 12 }, stroke, 5)).toBe(false);
  });
});
