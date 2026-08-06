import {
  drawMaskedLayerContent,
  type LayerMaskCache,
} from "@/lib/canvas/layer-masks";
import { type Viewport } from "@/lib/canvas/geometry";
import { drawStroke } from "@/lib/canvas/stroke-drawing";
import type {
  Bounds,
  CanvasImageObject,
  CanvasLayer,
  MaskStroke,
  Stroke,
} from "@/types/canvas";

type SurfaceSize = {
  width: number;
  height: number;
};

type Scene = {
  layers?: CanvasLayer[];
  strokes: Stroke[];
  maskStrokes?: MaskStroke[];
  objects: CanvasImageObject[];
  imageSources: Map<string, CanvasImageSource>;
  maskCache?: LayerMaskCache;
  worldWidth?: number;
  worldHeight?: number;
};

type WorldSize = {
  width: number;
  height: number;
};

export { drawStroke, strokeWidthAtPressure } from "@/lib/canvas/stroke-drawing";

export function orderedVisibleLayers(layers: CanvasLayer[]): CanvasLayer[] {
  return [...layers]
    .filter((layer) => layer.visible && layer.opacity > 0)
    .sort((first, second) => first.order - second.order);
}

export function objectDrawOpacity(opacity: number | undefined): number {
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) {
    return 1;
  }
  return Math.min(1, Math.max(0, opacity));
}

function drawObject(
  context: CanvasRenderingContext2D,
  canvasObject: CanvasImageObject,
  imageSource: CanvasImageSource | undefined,
): void {
  if (!imageSource) {
    return;
  }
  if (
    typeof ImageBitmap !== "undefined" &&
    imageSource instanceof ImageBitmap &&
    (imageSource.width === 0 || imageSource.height === 0)
  ) {
    return;
  }

  context.save();
  context.globalAlpha *= objectDrawOpacity(canvasObject.opacity);
  context.translate(
    canvasObject.x + canvasObject.width / 2,
    canvasObject.y + canvasObject.height / 2,
  );
  context.rotate(canvasObject.rotation);
  context.drawImage(
    imageSource,
    -canvasObject.width / 2,
    -canvasObject.height / 2,
    canvasObject.width,
    canvasObject.height,
  );
  context.restore();
}

function drawLayerContent(
  context: CanvasRenderingContext2D,
  scene: Scene,
  layer: CanvasLayer,
): void {
  const layerObjects = scene.objects
    .filter((canvasObject) => canvasObject.layerId === layer.id)
    .sort((first, second) => first.zIndex - second.zIndex);
  for (const canvasObject of layerObjects) {
    drawObject(
      context,
      canvasObject,
      scene.imageSources.get(canvasObject.id),
    );
  }
  for (const stroke of scene.strokes) {
    if (stroke.layerId === layer.id) {
      drawStroke(context, stroke);
    }
  }
}

function drawContent(
  context: CanvasRenderingContext2D,
  scene: Scene,
): void {
  const worldWidth = scene.worldWidth ?? 2048;
  const worldHeight = scene.worldHeight ?? 1536;
  const maskStrokes = scene.maskStrokes ?? [];

  if (scene.layers && scene.layers.length > 0) {
    for (const layer of orderedVisibleLayers(scene.layers)) {
      const usesMask =
        layer.hasMask && layer.maskEnabled && scene.maskCache !== undefined;

      if (usesMask && scene.maskCache) {
        const maskCanvas = scene.maskCache.getCanvas(
          layer.id,
          worldWidth,
          worldHeight,
          maskStrokes,
        );
        drawMaskedLayerContent(
          context,
          worldWidth,
          worldHeight,
          layer.opacity,
          maskCanvas,
          (layerContext) => drawLayerContent(layerContext, scene, layer),
        );
        continue;
      }

      context.save();
      context.globalAlpha *= layer.opacity;
      drawLayerContent(context, scene, layer);
      context.restore();
    }
    return;
  }

  const sortedObjects = [...scene.objects].sort(
    (first, second) => first.zIndex - second.zIndex,
  );

  for (const canvasObject of sortedObjects) {
    drawObject(
      context,
      canvasObject,
      scene.imageSources.get(canvasObject.id),
    );
  }

  for (const stroke of scene.strokes) {
    drawStroke(context, stroke);
  }
}

export function renderViewport(
  context: CanvasRenderingContext2D,
  surfaceSize: SurfaceSize,
  dpr: number,
  viewport: Viewport,
  worldSize: WorldSize,
  scene: Scene,
  colors: { workspace: string; artboard: string },
): void {
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.fillStyle = colors.workspace;
  context.fillRect(0, 0, surfaceSize.width, surfaceSize.height);
  context.setTransform(
    dpr * viewport.scale,
    0,
    0,
    dpr * viewport.scale,
    dpr * viewport.x,
    dpr * viewport.y,
  );
  context.fillStyle = colors.artboard;
  context.fillRect(0, 0, worldSize.width, worldSize.height);
  context.save();
  context.beginPath();
  context.rect(0, 0, worldSize.width, worldSize.height);
  context.clip();
  drawContent(context, {
    ...scene,
    worldWidth: worldSize.width,
    worldHeight: worldSize.height,
  });
  context.restore();
}

export function renderRegion(
  context: CanvasRenderingContext2D,
  outputSize: SurfaceSize,
  region: Bounds,
  worldSize: WorldSize,
  scene: Scene,
  background: string,
): void {
  const scale = Math.min(
    outputSize.width / Math.max(1, region.width),
    outputSize.height / Math.max(1, region.height),
  );
  const offsetX = (outputSize.width - region.width * scale) / 2;
  const offsetY = (outputSize.height - region.height * scale) / 2;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, outputSize.width, outputSize.height);
  context.setTransform(
    scale,
    0,
    0,
    scale,
    offsetX - region.x * scale,
    offsetY - region.y * scale,
  );
  context.save();
  context.beginPath();
  context.rect(0, 0, worldSize.width, worldSize.height);
  context.clip();
  drawContent(context, {
    ...scene,
    worldWidth: worldSize.width,
    worldHeight: worldSize.height,
  });
  context.restore();
}
