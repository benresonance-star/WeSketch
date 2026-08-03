import type { Point, ScreenPoint } from "@/lib/canvas/geometry";
import type { Bounds, CanvasImageObject, CanvasLayer, Stroke } from "@/types/canvas";

export function normalizeBounds(
  start: ScreenPoint,
  end: ScreenPoint,
): Bounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function boundsFromPoints(points: ScreenPoint[]): Bounds {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minimumX = points[0].x;
  let minimumY = points[0].y;
  let maximumX = points[0].x;
  let maximumY = points[0].y;

  for (let index = 1; index < points.length; index += 1) {
    minimumX = Math.min(minimumX, points[index].x);
    minimumY = Math.min(minimumY, points[index].y);
    maximumX = Math.max(maximumX, points[index].x);
    maximumY = Math.max(maximumY, points[index].y);
  }

  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX,
    height: maximumY - minimumY,
  };
}

export function unionBounds(first: Bounds, second: Bounds): Bounds {
  if (first.width <= 0 && first.height <= 0) {
    return second;
  }

  if (second.width <= 0 && second.height <= 0) {
    return first;
  }

  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  const maximumX = Math.max(first.x + first.width, second.x + second.width);
  const maximumY = Math.max(first.y + first.height, second.y + second.height);

  return {
    x,
    y,
    width: maximumX - x,
    height: maximumY - y,
  };
}

export function strokeBounds(stroke: Stroke): Bounds {
  if (stroke.points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const bounds = boundsFromPoints(stroke.points);
  const padding = stroke.width / 2;

  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

export function ensureMinimumBounds(bounds: Bounds, minimumSize: number): Bounds {
  const width = Math.max(bounds.width, minimumSize);
  const height = Math.max(bounds.height, minimumSize);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function clampBounds(
  bounds: Bounds,
  worldWidth: number,
  worldHeight: number,
): Bounds {
  const x = Math.max(0, Math.min(bounds.x, worldWidth));
  const y = Math.max(0, Math.min(bounds.y, worldHeight));
  const maximumX = Math.max(x, Math.min(bounds.x + bounds.width, worldWidth));
  const maximumY = Math.max(y, Math.min(bounds.y + bounds.height, worldHeight));

  return {
    x,
    y,
    width: maximumX - x,
    height: maximumY - y,
  };
}

export function expandBounds(
  bounds: Bounds,
  expansionRatio: number,
  worldWidth: number,
  worldHeight: number,
): Bounds {
  const horizontalExpansion = bounds.width * expansionRatio;
  const verticalExpansion = bounds.height * expansionRatio;

  return clampBounds(
    {
      x: bounds.x - horizontalExpansion,
      y: bounds.y - verticalExpansion,
      width: bounds.width + horizontalExpansion * 2,
      height: bounds.height + verticalExpansion * 2,
    },
    worldWidth,
    worldHeight,
  );
}

export function pointInBounds(point: ScreenPoint, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function distanceToSegment(
  point: ScreenPoint,
  start: ScreenPoint,
  end: ScreenPoint,
): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
        segmentLengthSquared,
    ),
  );
  const projectedX = start.x + projection * segmentX;
  const projectedY = start.y + projection * segmentY;

  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

export function hitTestStroke(
  point: ScreenPoint,
  stroke: Stroke,
  radius: number,
): boolean {
  const { points } = stroke;

  if (points.length === 0) {
    return false;
  }

  if (points.length === 1) {
    return distanceToSegment(point, points[0], points[0]) <= radius;
  }

  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= radius) {
      return true;
    }
  }

  return false;
}

export function asPoint(
  point: ScreenPoint,
  pressure = 0.5,
  time = 0,
): Point {
  return { ...point, pressure, time };
}

export function computeSceneContentBounds(input: {
  strokes: Stroke[];
  objects: CanvasImageObject[];
  layers: CanvasLayer[];
  worldWidth: number;
  worldHeight: number;
}): Bounds | null {
  const visibleLayerIds = new Set(
    input.layers
      .filter((layer) => layer.visible && layer.opacity > 0)
      .map((layer) => layer.id),
  );

  let contentBounds: Bounds | null = null;

  for (const stroke of input.strokes) {
    if (!visibleLayerIds.has(stroke.layerId)) {
      continue;
    }

    contentBounds = contentBounds
      ? unionBounds(contentBounds, strokeBounds(stroke))
      : strokeBounds(stroke);
  }

  for (const canvasObject of input.objects) {
    if (!visibleLayerIds.has(canvasObject.layerId)) {
      continue;
    }

    const objectBound = {
      x: canvasObject.x,
      y: canvasObject.y,
      width: canvasObject.width,
      height: canvasObject.height,
    };
    contentBounds = contentBounds
      ? unionBounds(contentBounds, objectBound)
      : objectBound;
  }

  if (!contentBounds || (contentBounds.width <= 0 && contentBounds.height <= 0)) {
    return null;
  }

  return clampBounds(contentBounds, input.worldWidth, input.worldHeight);
}
