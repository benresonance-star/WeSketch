import { describe, expect, it } from "vitest";

import {
  buildLayerMaskCanvas,
  maskStrokeDrawColor,
  normalizeCanvasLayer,
} from "@/lib/canvas/layer-masks";
import type { MaskStroke } from "@/types/canvas";

describe("maskStrokeDrawColor", () => {
  it("maps reveal and conceal to white and black", () => {
    expect(maskStrokeDrawColor("reveal")).toBe("#ffffff");
    expect(maskStrokeDrawColor("conceal")).toBe("#000000");
  });
});

describe("normalizeCanvasLayer", () => {
  it("defaults missing mask flags", () => {
    expect(
      normalizeCanvasLayer({
        id: "layer-1",
        name: "Layer 1",
        order: 0,
        opacity: 1,
        visible: true,
        createdAt: 0,
      }),
    ).toEqual({
      id: "layer-1",
      name: "Layer 1",
      order: 0,
      opacity: 1,
      visible: true,
      hasMask: false,
      maskEnabled: true,
      createdAt: 0,
    });
  });
});

describe("buildLayerMaskCanvas", () => {
  it.skipIf(typeof document === "undefined")(
    "starts fully visible and applies conceal strokes",
    () => {
      const maskStroke: MaskStroke = {
        id: "mask-1",
        layerId: "layer-1",
        points: [
          { x: 50, y: 50, pressure: 0.5, time: 0 },
          { x: 100, y: 100, pressure: 0.5, time: 1 },
        ],
        width: 20,
        mode: "conceal",
        createdAt: 0,
      };
      const canvas = buildLayerMaskCanvas(128, 128, [maskStroke], "layer-1");
      const context = canvas.getContext("2d");

      expect(context).not.toBeNull();
      if (!context) {
        return;
      }

      expect(context.getImageData(10, 10, 1, 1).data[0]).toBe(255);
      const concealed = context.getImageData(75, 75, 1, 1).data[0];
      expect(concealed).toBeLessThan(255);
    },
  );
});
