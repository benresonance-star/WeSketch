import { LayerMaskCache } from "@/lib/canvas/layer-masks";
import { renderRegion } from "@/lib/canvas/scene-renderer";
import {
  clampBounds,
  computeSceneContentBounds,
  ensureMinimumBounds,
  expandBounds,
} from "@/lib/canvas/selection";
import type {
  CanvasImageObject,
  CanvasLayer,
  MaskStroke,
  Stroke,
} from "@/types/canvas";

const WORLD_WIDTH = 2048;
const WORLD_HEIGHT = 1536;
const THUMBNAIL_LONG_EDGE = 640;
const THUMBNAIL_CONTENT_PADDING_RATIO = 0.15;
const THUMBNAIL_MIN_CONTENT_SIZE = 180;

export type ProjectThumbnailInput = {
  strokes: Stroke[];
  maskStrokes?: MaskStroke[];
  maskCache?: LayerMaskCache;
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

function thumbnailRegion(input: ProjectThumbnailInput) {
  const wholeCanvasBounds = {
    x: 0,
    y: 0,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
  };
  const contentBounds = computeSceneContentBounds({
    strokes: input.strokes,
    objects: input.objects,
    layers: input.layers,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
  });

  if (!contentBounds) {
    return wholeCanvasBounds;
  }

  return expandBounds(
    clampBounds(
      ensureMinimumBounds(contentBounds, THUMBNAIL_MIN_CONTENT_SIZE),
      WORLD_WIDTH,
      WORLD_HEIGHT,
    ),
    THUMBNAIL_CONTENT_PADDING_RATIO,
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
}

export async function renderProjectThumbnail(
  input: ProjectThumbnailInput,
): Promise<Blob> {
  const region = thumbnailRegion(input);
  const longestEdge = Math.max(1, region.width, region.height);
  const scale = THUMBNAIL_LONG_EDGE / longestEdge;
  const outputSize = {
    width: Math.max(1, Math.round(region.width * scale)),
    height: Math.max(1, Math.round(region.height * scale)),
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
      maskStrokes: input.maskStrokes,
      maskCache: input.maskCache,
      objects: input.objects,
      layers: input.layers,
      imageSources: input.imageSources,
    },
    input.backgroundColor,
  );

  return canvasToBlob(canvas);
}

export { thumbnailRegion as projectThumbnailRegionForTests };
