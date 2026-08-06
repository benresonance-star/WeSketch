import { midpoint } from "@/lib/canvas/geometry";
import type { Stroke } from "@/types/canvas";

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
