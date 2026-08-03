import { describe, expect, it } from "vitest";

import {
  closestImageGenerationSize,
  generationLayerName,
  isImageGenerationIntent,
  outputSizeForBounds,
} from "@/lib/canvas/generation";

describe("image generation intent", () => {
  it("accepts only supported placement modes", () => {
    expect(isImageGenerationIntent("beside")).toBe(true);
    expect(isImageGenerationIntent("in_place")).toBe(true);
    expect(isImageGenerationIntent("replace")).toBe(false);
    expect(isImageGenerationIntent(undefined)).toBe(false);
  });
});

describe("in-place generation sizing", () => {
  it("chooses the closest supported model shape", () => {
    expect(
      closestImageGenerationSize({ x: 0, y: 0, width: 800, height: 200 }),
    ).toBe("1536x1024");
    expect(
      closestImageGenerationSize({ x: 0, y: 0, width: 200, height: 800 }),
    ).toBe("1024x1536");
    expect(
      closestImageGenerationSize({ x: 0, y: 0, width: 500, height: 480 }),
    ).toBe("1024x1024");
  });

  it("preserves selection aspect ratio at the target long edge", () => {
    expect(
      outputSizeForBounds({ x: 100, y: 80, width: 600, height: 300 }),
    ).toEqual({ width: 1200, height: 600 });
    expect(
      outputSizeForBounds({ x: 100, y: 80, width: 200, height: 800 }),
    ).toEqual({ width: 300, height: 1200 });
  });
});

describe("generation layer naming", () => {
  it("uses the first available iteration number", () => {
    expect(generationLayerName([{ name: "Sketch" }])).toBe("AI iteration 1");
    expect(
      generationLayerName([
        { name: "AI iteration 1" },
        { name: "AI iteration 3" },
      ]),
    ).toBe("AI iteration 2");
  });
});
