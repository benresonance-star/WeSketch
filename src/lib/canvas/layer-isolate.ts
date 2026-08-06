import type { CanvasLayer } from "@/types/canvas";

export function isLayerEffectivelyVisible(
  layer: CanvasLayer,
  isolatingLayerId: string | null,
): boolean {
  if (isolatingLayerId !== null) {
    return layer.id === isolatingLayerId;
  }

  return layer.visible;
}

export function isLayerRenderable(
  layer: CanvasLayer,
  isolatingLayerId: string | null,
): boolean {
  return isLayerEffectivelyVisible(layer, isolatingLayerId) && layer.opacity > 0;
}
