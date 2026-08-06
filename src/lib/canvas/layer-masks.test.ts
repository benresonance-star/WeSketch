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
    expect(colorToMaskGray("rgb(0, 0, 0)")).toBe(0);
    expect(colorToMaskGray("rgb(255, 255, 255)")).toBe(255);
  });

  it("derives partial mask values from mid grey and saturated colours", () => {
    expect(colorToMaskGray("#808080")).toBe(128);
    expect(colorToMaskGray("#ff0000")).toBeLessThan(255);
    expect(colorToMaskGray("#ff0000")).toBeGreaterThan(0);
  });
});

describe("maskToolPaintColor", () => {
  it("uses brush luminance for pen and black for eraser", () => {
    expect(maskToolPaintColor("pen", "#000000")).toBe("rgb(0, 0, 0)");
    expect(maskToolPaintColor("pen", "#ffffff")).toBe("rgb(255, 255, 255)");
    expect(maskToolPaintColor("pen", "#808080")).toBe("rgb(128, 128, 128)");
    expect(maskToolPaintColor("eraser", "#ffffff")).toBe("rgb(0, 0, 0)");
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
    "builds a greyscale opacity map where black hides and grey is partial",
    () => {
      const blackStroke: MaskStroke = {
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
      const greyStroke: MaskStroke = {
        id: "mask-2",
        layerId: "layer-1",
        points: [{ x: 20, y: 20, pressure: 0.5, time: 0 }],
        width: 20,
        color: "#808080",
        createdAt: 0,
      };
      const canvas = buildLayerMaskCanvas(
        128,
        128,
        [blackStroke, greyStroke],
        "layer-1",
      );
      const context = canvas.getContext("2d");

      expect(context).not.toBeNull();
      if (!context) {
        return;
      }

      expect(context.getImageData(10, 10, 1, 1).data[0]).toBe(255);
      expect(context.getImageData(75, 75, 1, 1).data[0]).toBe(0);
      expect(context.getImageData(20, 20, 1, 1).data[0]).toBe(128);
    },
  );
});
