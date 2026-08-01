export type Point = {
  x: number;
  y: number;
  pressure: number;
  time: number;
};

export type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export type ScreenPoint = Pick<Point, "x" | "y">;

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 6;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function screenToWorld(point: ScreenPoint, viewport: Viewport): ScreenPoint {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

export function worldToScreen(point: ScreenPoint, viewport: Viewport): ScreenPoint {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  };
}

export function distance(first: ScreenPoint, second: ScreenPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function midpoint(first: ScreenPoint, second: ScreenPoint): ScreenPoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

export function zoomViewport(
  initialViewport: Viewport,
  initialCenter: ScreenPoint,
  currentCenter: ScreenPoint,
  scaleRatio: number,
): Viewport {
  const worldAnchor = screenToWorld(initialCenter, initialViewport);
  const scale = clamp(initialViewport.scale * scaleRatio, MIN_SCALE, MAX_SCALE);

  return {
    x: currentCenter.x - worldAnchor.x * scale,
    y: currentCenter.y - worldAnchor.y * scale,
    scale,
  };
}

export function fitViewport(
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number,
  worldHeight: number,
  padding = 24,
): Viewport {
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const scale = clamp(
    Math.min(availableWidth / worldWidth, availableHeight / worldHeight),
    MIN_SCALE,
    1,
  );

  return {
    x: (viewportWidth - worldWidth * scale) / 2,
    y: (viewportHeight - worldHeight * scale) / 2,
    scale,
  };
}
