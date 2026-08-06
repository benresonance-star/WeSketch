import type { CanvasLayer } from "@/types/canvas";

export function clampIsolateBackgroundOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

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

export function orderedIsolateBackgroundLayers(
  layers: CanvasLayer[],
  isolatingLayerId: string,
): CanvasLayer[] {
  return [...layers]
    .filter(
      (layer) =>
        layer.id !== isolatingLayerId && layer.visible && layer.opacity > 0,
    )
    .sort((first, second) => first.order - second.order);
}
