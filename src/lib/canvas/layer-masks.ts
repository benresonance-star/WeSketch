import { drawStroke, strokeWidthAtPressure } from "@/lib/canvas/stroke-drawing";
import type {
  CanvasLayer,
  MaskStroke,
  MaskStrokeMode,
  Stroke,
} from "@/types/canvas";

const MASK_REVEAL_COLOR = "#ffffff";
const MASK_CONCEAL_COLOR = "#000000";

export function maskStrokeDrawColor(mode: MaskStrokeMode): string {
  return mode === "reveal" ? MASK_REVEAL_COLOR : MASK_CONCEAL_COLOR;
}

function maskStrokeAsStroke(maskStroke: MaskStroke): Stroke {
  return {
    id: maskStroke.id,
    layerId: maskStroke.layerId,
    points: maskStroke.points,
    color: maskStrokeDrawColor(maskStroke.mode),
    width: maskStroke.width,
    pressureEnabled: maskStroke.pressureEnabled,
    createdAt: maskStroke.createdAt,
  };
}

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

  context.fillStyle = "rgba(255, 255, 255, 1)";
  context.fillRect(0, 0, width, height);

  for (const maskStroke of maskStrokes) {
    if (maskStroke.layerId !== layerId) {
      continue;
    }

    context.globalCompositeOperation =
      maskStroke.mode === "conceal" ? "destination-out" : "source-over";
    drawStroke(context, maskStrokeAsStroke(maskStroke));
  }

  context.globalCompositeOperation = "source-over";

  return canvas;
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
  contentContext.globalCompositeOperation = "destination-in";
  contentContext.drawImage(maskCanvas, 0, 0);
  contentContext.globalCompositeOperation = "source-over";

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
