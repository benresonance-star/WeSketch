import { midpoint, type Viewport } from "@/lib/canvas/geometry";
import type {
  Bounds,
  CanvasImageObject,
  CanvasLayer,
  Stroke,
} from "@/types/canvas";

type SurfaceSize = {
  width: number;
  height: number;
};

type Scene = {
  layers?: CanvasLayer[];
  strokes: Stroke[];
  objects: CanvasImageObject[];
  imageSources: Map<string, CanvasImageSource>;
};

type WorldSize = {
  width: number;
  height: number;
};

export function orderedVisibleLayers(layers: CanvasLayer[]): CanvasLayer[] {
  return [...layers]
    .filter((layer) => layer.visible && layer.opacity > 0)
    .sort((first, second) => first.order - second.order);
}

export function strokeWidthAtPressure(
  baseWidth: number,
  pressure: number,
  pressureEnabled: boolean,
): number {
  if (!pressureEnabled) {
    return baseWidth;
  }

  const normalizedPressure = Math.min(1, Math.max(0, pressure));
  return baseWidth * (0.2 + normalizedPressure * 0.8);
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  const { points } = stroke;

  if (points.length === 0) {
    return;
  }

  const pressureEnabled = stroke.pressureEnabled ?? true;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (points.length === 1) {
    const pressureWidth = strokeWidthAtPressure(
      stroke.width,
      points[0].pressure,
      pressureEnabled,
    );
    context.beginPath();
    context.arc(points[0].x, points[0].y, pressureWidth / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  if (pressureEnabled) {
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      context.lineWidth = strokeWidthAtPressure(
        stroke.width,
        (previous.pressure + current.pressure) / 2,
        true,
      );
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(current.x, current.y);
      context.stroke();
    }
    return;
  }

  context.lineWidth = stroke.width;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length - 1; index += 1) {
    const nextMidpoint = midpoint(points[index], points[index + 1]);
    context.quadraticCurveTo(
      points[index].x,
      points[index].y,
      nextMidpoint.x,
      nextMidpoint.y,
    );
  }

  const lastPoint = points[points.length - 1];
  context.lineTo(lastPoint.x, lastPoint.y);
  context.stroke();
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

function drawContent(
  context: CanvasRenderingContext2D,
  scene: Scene,
): void {
  if (scene.layers && scene.layers.length > 0) {
    for (const layer of orderedVisibleLayers(scene.layers)) {
      context.save();
      context.globalAlpha *= layer.opacity;
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
  drawContent(context, scene);
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
  drawContent(context, scene);
  context.restore();
}
