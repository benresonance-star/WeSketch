import { describe, expect, it } from "vitest";

import {
  buildLayerMaskCanvas,
  colorToMaskGray,
  maskToolPaintColor,
  normalizeMaskStroke,
} from "@/lib/canvas/layer-masks";
import type { MaskStroke } from "@/types/canvas";

describe("colorToMaskGray", () => {
  it("maps black to hidden and white to fully visible", () => {
    expect(colorToMaskGray("#000000")).toBe(0);
    expect(colorToMaskGray("#ffffff")).toBe(255);
  });

  it("derives partial mask values from saturated colours", () => {
    expect(colorToMaskGray("#ff0000")).toBeLessThan(255);
    expect(colorToMaskGray("#ff0000")).toBeGreaterThan(0);
  });
});

describe("maskToolPaintColor", () => {
  it("uses brush luminance for pen and white for eraser", () => {
    expect(maskToolPaintColor("pen", "#000000")).toBe("rgb(0, 0, 0)");
    expect(maskToolPaintColor("eraser", "#000000")).toBe("rgb(255, 255, 255)");
  });
});

describe("normalizeMaskStroke", () => {
  it("migrates legacy reveal/conceal modes to colours", () => {
    expect(
      normalizeMaskStroke({
        id: "1",
        layerId: "layer",
        points: [],
        width: 4,
        mode: "conceal",
        createdAt: 0,
      } as unknown as MaskStroke & { mode: "conceal" }),
    ).toMatchObject({ color: "#000000" });
  });
});

describe("buildLayerMaskCanvas", () => {
  it.skipIf(typeof document === "undefined")(
    "applies black strokes as hidden regions",
    () => {
      const maskStroke: MaskStroke = {
        id: "mask-1",
        layerId: "layer-1",
        points: [
          { x: 50, y: 50, pressure: 0.5, time: 0 },
          { x: 100, y: 100, pressure: 0.5, time: 1 },
        ],
        width: 20,
        color: "#000000",
        createdAt: 0,
      };
      const canvas = buildLayerMaskCanvas(128, 128, [maskStroke], "layer-1");
      const context = canvas.getContext("2d");

      expect(context).not.toBeNull();
      if (!context) {
        return;
      }

      expect(context.getImageData(10, 10, 1, 1).data[3]).toBe(255);
      expect(context.getImageData(75, 75, 1, 1).data[3]).toBeLessThan(255);
    },
  );
});
