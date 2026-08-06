import { clamp } from "@/lib/canvas/geometry";

export const BRUSH_SIZE_MIN = 1;
export const BRUSH_SIZE_MAX = 40;
export const BRUSH_SIZE_STEP = 0.5;

const DEFAULT_DRAG_SENSITIVITY = 0.15;

function roundToBrushStep(size: number): number {
  return (
    Math.round(size / BRUSH_SIZE_STEP) * BRUSH_SIZE_STEP
  );
}

/** Drag up increases size; drag down decreases size. */
export function brushSizeFromVerticalDrag(
  startSize: number,
  startY: number,
  currentY: number,
  sensitivity = DEFAULT_DRAG_SENSITIVITY,
): number {
  const nextSize = startSize + (startY - currentY) * sensitivity;
  return roundToBrushStep(
    clamp(nextSize, BRUSH_SIZE_MIN, BRUSH_SIZE_MAX),
  );
}
