import { describe, expect, it } from "vitest";

import {
  isLayerEffectivelyVisible,
  isLayerRenderable,
} from "@/lib/canvas/layer-isolate";
import type { CanvasLayer } from "@/types/canvas";

const layer = (
  id: string,
  visible = true,
  opacity = 1,
): CanvasLayer => ({
  id,
  name: id,
  order: 0,
  opacity,
  visible,
  hasMask: false,
  maskEnabled: true,
  createdAt: 0,
});

describe("layer isolate helpers", () => {
  it("shows only the isolated layer while isolate mode is active", () => {
    const visibleLayer = layer("visible");
    const hiddenLayer = layer("hidden", false);

    expect(isLayerEffectivelyVisible(visibleLayer, "visible")).toBe(true);
    expect(isLayerEffectivelyVisible(hiddenLayer, "visible")).toBe(false);
    expect(isLayerEffectivelyVisible(hiddenLayer, null)).toBe(false);
  });

  it("falls back to stored visibility when isolate mode is off", () => {
    const visibleLayer = layer("visible");
    const hiddenLayer = layer("hidden", false);

    expect(isLayerEffectivelyVisible(visibleLayer, null)).toBe(true);
    expect(isLayerEffectivelyVisible(hiddenLayer, null)).toBe(false);
  });

  it("requires opacity for renderable layers", () => {
    expect(isLayerRenderable(layer("visible"), null)).toBe(true);
    expect(isLayerRenderable(layer("transparent", true, 0), null)).toBe(false);
    expect(isLayerRenderable(layer("hidden", false), "visible")).toBe(false);
  });
});
