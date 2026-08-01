import { renderRegion } from "@/lib/canvas/scene-renderer";
import { expandBounds } from "@/lib/canvas/selection";
import type {
  Bounds,
  CanvasImageObject,
  CanvasLayer,
  CanvasSelection,
  Stroke,
} from "@/types/canvas";

export type SnapshotBundle = {
  selection: Blob;
  neighbourhood: Blob;
  canvas: Blob;
};

type SnapshotInput = {
  selection: CanvasSelection;
  strokes: Stroke[];
  objects: CanvasImageObject[];
  layers: CanvasLayer[];
  imageSources: Map<string, CanvasImageSource>;
  worldWidth: number;
  worldHeight: number;
  backgroundColor: string;
};

function outputSizeForRegion(
  region: Bounds,
  targetLongEdge: number,
): { width: number; height: number } {
  const longestEdge = Math.max(1, region.width, region.height);
  const scale = targetLongEdge / longestEdge;

  return {
    width: Math.max(1, Math.round(region.width * scale)),
    height: Math.max(1, Math.round(region.height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas export returned no image data."));
        }
      },
      "image/webp",
      0.88,
    );
  });
}

async function renderSnapshot(
  input: SnapshotInput,
  region: Bounds,
  targetLongEdge: number,
  applyLassoMask: boolean,
): Promise<Blob> {
  const outputSize = outputSizeForRegion(region, targetLongEdge);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("2D canvas rendering is unavailable.");
  }

  renderRegion(
    context,
    outputSize,
    region,
    { width: input.worldWidth, height: input.worldHeight },
    {
      strokes: input.strokes,
      objects: input.objects,
      layers: input.layers,
      imageSources: input.imageSources,
    },
    input.backgroundColor,
  );

  if (applyLassoMask && input.selection.type === "lasso") {
    const scale = Math.min(
      outputSize.width / Math.max(1, region.width),
      outputSize.height / Math.max(1, region.height),
    );
    const offsetX = (outputSize.width - region.width * scale) / 2;
    const offsetY = (outputSize.height - region.height * scale) / 2;

    context.save();
    context.setTransform(
      scale,
      0,
      0,
      scale,
      offsetX - region.x * scale,
      offsetY - region.y * scale,
    );
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = "#000";
    context.beginPath();

    input.selection.path.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });

    context.closePath();
    context.fill();
    context.restore();
  }

  return canvasToBlob(canvas);
}

export async function renderSnapshotBundle(
  input: SnapshotInput,
): Promise<SnapshotBundle> {
  const neighbourhoodBounds = expandBounds(
    input.selection.bounds,
    0.5,
    input.worldWidth,
    input.worldHeight,
  );
  const wholeCanvasBounds = {
    x: 0,
    y: 0,
    width: input.worldWidth,
    height: input.worldHeight,
  };

  const [selection, neighbourhood, canvas] = await Promise.all([
    renderSnapshot(input, input.selection.bounds, 1200, true),
    renderSnapshot(input, neighbourhoodBounds, 1200, false),
    renderSnapshot(input, wholeCanvasBounds, 1024, false),
  ]);

  return { selection, neighbourhood, canvas };
}
