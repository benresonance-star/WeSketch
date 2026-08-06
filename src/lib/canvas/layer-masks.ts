import { drawStroke } from "@/lib/canvas/stroke-drawing";
import type { CanvasLayer, MaskStroke, Stroke } from "@/types/canvas";

const MASK_FULLY_VISIBLE = "#ffffff";
const MASK_FULLY_HIDDEN = "#000000";

function clamp255(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function parseHexColor(color: string): { b: number; g: number; r: number } | null {
  const normalized = color.trim();
  const shortMatch = /^#([\da-f]{3})$/i.exec(normalized);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("").map((channel) => channel + channel);
    return {
      r: Number.parseInt(r, 16),
      g: Number.parseInt(g, 16),
      b: Number.parseInt(b, 16),
    };
  }

  const longMatch = /^#([\da-f]{6})$/i.exec(normalized);
  if (longMatch) {
    const value = longMatch[1];
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  return null;
}

function parseRgbColor(color: string): { b: number; g: number; r: number } | null {
  const match = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i.exec(
    color.trim(),
  );
  if (!match) {
    return null;
  }

  return {
    r: clamp255(Number(match[1])),
    g: clamp255(Number(match[2])),
    b: clamp255(Number(match[3])),
  };
}

function parseColorToRgb(color: string): { b: number; g: number; r: number } | null {
  return parseHexColor(color) ?? parseRgbColor(color);
}

/** Map a brush colour to mask density (0 hides, 255 reveals). */
export function colorToMaskGray(color: string): number {
  const rgb = parseColorToRgb(color);
  if (!rgb) {
    return 255;
  }

  return clamp255(rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114);
}

export function maskGrayToStrokeColor(gray: number): string {
  const channel = clamp255(gray);
  return `rgb(${channel}, ${channel}, ${channel})`;
}

export function maskStrokePaintColor(
  maskStroke: Pick<MaskStroke, "color">,
): string {
  return maskGrayToStrokeColor(colorToMaskGray(maskStroke.color));
}

export function maskToolStorageColor(
  tool: "pen" | "eraser",
  brushColor: string,
): string {
  if (tool === "eraser") {
    return MASK_FULLY_HIDDEN;
  }

  return brushColor;
}

export function maskToolPaintColor(
  tool: "pen" | "eraser",
  brushColor: string,
): string {
  return maskStrokePaintColor({
    color: maskToolStorageColor(tool, brushColor),
  });
}

export function normalizeMaskStroke(
  maskStroke: MaskStroke & { mode?: "reveal" | "conceal"; color?: string },
): MaskStroke {
  if (maskStroke.color) {
    return maskStroke as MaskStroke;
  }

  return {
    ...maskStroke,
    color:
      maskStroke.mode === "conceal" ? MASK_FULLY_HIDDEN : MASK_FULLY_VISIBLE,
  };
}

function maskStrokeAsStroke(maskStroke: MaskStroke): Stroke {
  return {
    id: maskStroke.id,
    layerId: maskStroke.layerId,
    points: maskStroke.points,
    color: maskStrokePaintColor(maskStroke),
    width: maskStroke.width,
    pressureEnabled: maskStroke.pressureEnabled,
    createdAt: maskStroke.createdAt,
  };
}

/** Build a greyscale opacity map (255 = visible, 0 = hidden). */
export function buildLayerMaskCanvas(
  width: number,
  height: number,
  maskStrokes: MaskStroke[],
  layerId: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("2D canvas rendering is unavailable.");
  }

  context.fillStyle = MASK_FULLY_VISIBLE;
  context.fillRect(0, 0, width, height);

  for (const maskStroke of maskStrokes) {
    if (maskStroke.layerId !== layerId) {
      continue;
    }

    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    drawStroke(context, maskStrokeAsStroke(normalizeMaskStroke(maskStroke)));
  }

  return canvas;
}

function applyGrayscaleMaskOpacity(
  contentContext: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const maskContext = maskCanvas.getContext("2d");

  if (!maskContext) {
    throw new Error("2D canvas rendering is unavailable.");
  }

  const contentImage = contentContext.getImageData(0, 0, width, height);
  const maskImage = maskContext.getImageData(0, 0, width, height);
  const content = contentImage.data;
  const mask = maskImage.data;

  for (let index = 0; index < content.length; index += 4) {
    const maskDensity = mask[index];
    content[index + 3] = Math.round((content[index + 3] * maskDensity) / 255);
  }

  contentContext.putImageData(contentImage, 0, 0);
}

export class LayerMaskCache {
  private entries = new Map<
    string,
    { generation: number; canvas: HTMLCanvasElement }
  >();

  private generations = new Map<string, number>();

  invalidate(layerId?: string): void {
    if (layerId) {
      this.generations.set(
        layerId,
        (this.generations.get(layerId) ?? 0) + 1,
      );
      this.entries.delete(layerId);
      return;
    }

    this.generations.clear();
    this.entries.clear();
  }

  getCanvas(
    layerId: string,
    width: number,
    height: number,
    maskStrokes: MaskStroke[],
  ): HTMLCanvasElement {
    const generation = this.generations.get(layerId) ?? 0;
    const cached = this.entries.get(layerId);

    if (cached && cached.generation === generation) {
      return cached.canvas;
    }

    const canvas = buildLayerMaskCanvas(width, height, maskStrokes, layerId);
    this.entries.set(layerId, { generation, canvas });
    return canvas;
  }
}

export function drawMaskedLayerContent(
  context: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  layerOpacity: number,
  maskCanvas: CanvasImageSource,
  drawLayerContent: (layerContext: CanvasRenderingContext2D) => void,
): void {
  const contentCanvas = document.createElement("canvas");
  contentCanvas.width = worldWidth;
  contentCanvas.height = worldHeight;
  const contentContext = contentCanvas.getContext("2d");

  if (!contentContext) {
    throw new Error("2D canvas rendering is unavailable.");
  }

  drawLayerContent(contentContext);

  if (maskCanvas instanceof HTMLCanvasElement) {
    applyGrayscaleMaskOpacity(
      contentContext,
      maskCanvas,
      worldWidth,
      worldHeight,
    );
  }

  context.save();
  context.globalAlpha *= layerOpacity;
  context.drawImage(contentCanvas, 0, 0);
  context.restore();
}

export function normalizeCanvasLayer<
  T extends Partial<CanvasLayer> &
    Pick<
      CanvasLayer,
      "id" | "name" | "order" | "opacity" | "visible" | "createdAt"
    >,
>(layer: T): T & Pick<CanvasLayer, "hasMask" | "maskEnabled"> {
  return {
    ...layer,
    hasMask: layer.hasMask ?? false,
    maskEnabled: layer.maskEnabled ?? true,
  };
}
