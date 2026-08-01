type PreparedImage = {
  blob: Blob;
  source: ImageBitmap;
  width: number;
  height: number;
};

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Image conversion returned no data."));
        }
      },
      "image/webp",
      0.9,
    );
  });
}

export async function decodeImageBlob(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

export async function prepareImportedImage(
  file: File,
  maximumEdge = 2048,
): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be imported.");
  }

  const original = await decodeImageBlob(file);
  const longestEdge = Math.max(original.width, original.height);

  if (longestEdge <= maximumEdge) {
    return {
      blob: file,
      source: original,
      width: original.width,
      height: original.height,
    };
  }

  const scale = maximumEdge / longestEdge;
  const width = Math.max(1, Math.round(original.width * scale));
  const height = Math.max(1, Math.round(original.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    original.close();
    throw new Error("2D canvas rendering is unavailable.");
  }

  context.drawImage(original, 0, 0, width, height);
  original.close();
  const blob = await canvasToBlob(canvas);
  const source = await decodeImageBlob(blob);

  return { blob, source, width, height };
}
