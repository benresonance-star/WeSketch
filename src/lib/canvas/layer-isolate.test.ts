import { describe, expect, it } from "vitest";

import {
  clampIsolateBackgroundOpacity,
  isLayerEffectivelyVisible,
  isLayerRenderable,
  orderedIsolateBackgroundLayers,
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

  it("clamps isolate background opacity", () => {
    expect(clampIsolateBackgroundOpacity(0.5)).toBe(0.5);
    expect(clampIsolateBackgroundOpacity(-0.2)).toBe(0);
    expect(clampIsolateBackgroundOpacity(1.4)).toBe(1);
    expect(clampIsolateBackgroundOpacity(Number.NaN)).toBe(0);
  });

  it("lists visible non-isolated layers for onion-skin background", () => {
    const layers = [
      { ...layer("solo", true, 1), order: 2 },
      { ...layer("bg", true, 1), order: 0 },
      { ...layer("hidden", false, 1), order: 1 },
    ];

    expect(
      orderedIsolateBackgroundLayers(layers, "solo").map((item) => item.id),
    ).toEqual(["bg"]);
  });
});
