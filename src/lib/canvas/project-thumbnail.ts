import { renderRegion } from "@/lib/canvas/scene-renderer";
import type { CanvasImageObject, CanvasLayer, Stroke } from "@/types/canvas";

const WORLD_WIDTH = 2048;
const WORLD_HEIGHT = 1536;
const THUMBNAIL_LONG_EDGE = 640;

export type ProjectThumbnailInput = {
  strokes: Stroke[];
  objects: CanvasImageObject[];
  layers: CanvasLayer[];
  imageSources: Map<string, CanvasImageSource>;
  backgroundColor: string;
};

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
      0.82,
    );
  });
}

export async function renderProjectThumbnail(
  input: ProjectThumbnailInput,
): Promise<Blob> {
  const region = {
    x: 0,
    y: 0,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
  };
  const longestEdge = Math.max(WORLD_WIDTH, WORLD_HEIGHT);
  const scale = THUMBNAIL_LONG_EDGE / longestEdge;
  const outputSize = {
    width: Math.max(1, Math.round(WORLD_WIDTH * scale)),
    height: Math.max(1, Math.round(WORLD_HEIGHT * scale)),
  };

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
    { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    {
      strokes: input.strokes,
      objects: input.objects,
      layers: input.layers,
      imageSources: input.imageSources,
    },
    input.backgroundColor,
  );

  return canvasToBlob(canvas);
}
