import { describe, expect, it } from "vitest";

import { projectThumbnailRegionForTests } from "@/lib/canvas/project-thumbnail";
import {
  computeSceneContentBounds,
  strokeBounds,
} from "@/lib/canvas/selection";
import type { CanvasLayer, Stroke } from "@/types/canvas";

const defaultLayer: CanvasLayer = {
  id: "layer-1",
  name: "Layer 1",
  order: 0,
  opacity: 1,
  visible: true,
  createdAt: 0,
};

describe("computeSceneContentBounds", () => {
  it("returns bounds that include stroke width for pen-only sketches", () => {
    const stroke: Stroke = {
      id: "stroke-1",
      layerId: "layer-1",
      points: [
        { x: 400, y: 300, pressure: 0.5, time: 0 },
        { x: 520, y: 360, pressure: 0.5, time: 1 },
      ],
      color: "#242220",
      width: 8,
      createdAt: 0,
    };

    expect(strokeBounds(stroke)).toEqual({
      x: 396,
      y: 296,
      width: 128,
      height: 68,
    });

    expect(
      computeSceneContentBounds({
        strokes: [stroke],
        objects: [],
        layers: [defaultLayer],
        worldWidth: 2048,
        worldHeight: 1536,
      }),
    ).toEqual({
      x: 396,
      y: 296,
      width: 128,
      height: 68,
    });
  });
});

describe("projectThumbnailRegionForTests", () => {
  it("zooms pen-only sketches instead of rendering the full artboard", () => {
    const region = projectThumbnailRegionForTests({
      strokes: [
        {
          id: "stroke-1",
          layerId: "layer-1",
          points: [
            { x: 900, y: 700, pressure: 0.5, time: 0 },
            { x: 980, y: 760, pressure: 0.5, time: 1 },
          ],
          color: "#242220",
          width: 6,
          createdAt: 0,
        },
      ],
      objects: [],
      layers: [defaultLayer],
      imageSources: new Map(),
      backgroundColor: "#fbfaf6",
    });

    expect(region.width).toBeLessThan(500);
    expect(region.height).toBeLessThan(500);
    expect(region.x).toBeGreaterThan(0);
    expect(region.y).toBeGreaterThan(0);
  });

  it("uses the full artboard when the canvas is empty", () => {
    expect(
      projectThumbnailRegionForTests({
        strokes: [],
        objects: [],
        layers: [defaultLayer],
        imageSources: new Map(),
        backgroundColor: "#fbfaf6",
      }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 2048,
      height: 1536,
    });
  });
});
