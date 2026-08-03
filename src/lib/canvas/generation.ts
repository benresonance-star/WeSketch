import type {
  Bounds,
  ImageGenerationIntent,
  ImageGenerationSize,
} from "@/types/canvas";

const IMAGE_SIZES: Array<{
  size: ImageGenerationSize;
  width: number;
  height: number;
}> = [
  { size: "1024x1024", width: 1024, height: 1024 },
  { size: "1536x1024", width: 1536, height: 1024 },
  { size: "1024x1536", width: 1024, height: 1536 },
];

export function isImageGenerationIntent(
  value: unknown,
): value is ImageGenerationIntent {
  return value === "beside" || value === "in_place";
}

export function closestImageGenerationSize(
  bounds: Bounds,
): ImageGenerationSize {
  const targetRatio = bounds.width / Math.max(1, bounds.height);
  return IMAGE_SIZES.reduce((closest, candidate) => {
    const closestDistance = Math.abs(
      Math.log(targetRatio / (closest.width / closest.height)),
    );
    const candidateDistance = Math.abs(
      Math.log(targetRatio / (candidate.width / candidate.height)),
    );
    return candidateDistance < closestDistance ? candidate : closest;
  }).size;
}

export function outputSizeForBounds(
  bounds: Bounds,
  maximumEdge = 1200,
): { width: number; height: number } {
  const longestEdge = Math.max(1, bounds.width, bounds.height);
  const scale = maximumEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  };
}

export function generationLayerName(
  layers: Array<{ name: string }>,
): string {
  const usedNumbers = new Set(
    layers.flatMap((layer) => {
      const match = /^AI iteration (\d+)$/.exec(layer.name);
      return match ? [Number(match[1])] : [];
    }),
  );
  let iteration = 1;
  while (usedNumbers.has(iteration)) {
    iteration += 1;
  }
  return `AI iteration ${iteration}`;
}
