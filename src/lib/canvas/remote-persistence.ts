import type { SupabaseClient } from "@supabase/supabase-js";

import type { CanvasImageObject, CanvasLayer, Stroke } from "@/types/canvas";

const ASSET_BUCKET = "project-assets";

export type RemoteSceneContext = {
  canvasId: string;
  projectId: string;
  userId: string;
};

export type RemoteScene = {
  layers: CanvasLayer[];
  strokes: Stroke[];
  objects: CanvasImageObject[];
};

type RemoteStrokeRow = {
  id: string;
  layer_id: string;
  points: Stroke["points"];
  style: {
    color?: string;
    width?: number;
    pressureEnabled?: boolean;
  };
  created_at: string;
};

type RemoteObjectRow = {
  id: string;
  layer_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  artifact_id: string | null;
  data: { storagePath?: string; mimeType?: string; opacity?: number };
  created_at: string;
};

function normalizeObjectOpacity(opacity: number | undefined): number {
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) {
    return 1;
  }
  return Math.min(1, Math.max(0, opacity));
}

type RemoteLayerRow = {
  id: string;
  name: string;
  sort_order: number;
  opacity: number;
  is_visible: boolean;
  created_at: string;
};

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }

  throw lastError;
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export async function loadRemoteScene(
  supabase: SupabaseClient,
  context: RemoteSceneContext,
): Promise<RemoteScene> {
  const [layerResult, strokeResult, objectResult] = await Promise.all([
    supabase
      .from("canvas_layers")
      .select("id, name, sort_order, opacity, is_visible, created_at")
      .eq("canvas_id", context.canvasId)
      .order("sort_order"),
    supabase
      .from("strokes")
      .select("id, layer_id, points, style, created_at")
      .eq("canvas_id", context.canvasId)
      .is("deleted_at", null)
      .order("z_index"),
    supabase
      .from("canvas_objects")
      .select(
        "id, layer_id, x, y, width, height, rotation, z_index, artifact_id, data, created_at",
      )
      .eq("canvas_id", context.canvasId)
      .is("deleted_at", null)
      .order("z_index"),
  ]);

  throwIfError(layerResult.error);
  throwIfError(strokeResult.error);
  throwIfError(objectResult.error);

  const strokes = (strokeResult.data as RemoteStrokeRow[] | null)?.map(
    (row) => ({
      id: row.id,
      layerId: row.layer_id,
      points: row.points,
      color: row.style.color ?? "#242220",
      width: row.style.width ?? 4,
      pressureEnabled: row.style.pressureEnabled ?? true,
      createdAt: new Date(row.created_at).getTime(),
    }),
  );
  const objects = await Promise.all(
    ((objectResult.data as RemoteObjectRow[] | null) ?? []).map(async (row) => {
      const storagePath = row.data.storagePath;

      if (!storagePath) {
        throw new Error(`Image object ${row.id} has no storage path.`);
      }

      const { data: blob, error } = await supabase.storage
        .from(ASSET_BUCKET)
        .download(storagePath);
      throwIfError(error);
      if (!blob) {
        throw new Error(`Image object ${row.id} could not be downloaded.`);
      }

      return {
        id: row.id,
        layerId: row.layer_id,
        type: "image" as const,
        x: Number(row.x),
        y: Number(row.y),
        width: Number(row.width),
        height: Number(row.height),
        rotation: Number(row.rotation),
        zIndex: row.z_index,
        opacity: normalizeObjectOpacity(row.data.opacity),
        blob,
        artifactId: row.artifact_id ?? undefined,
        storagePath,
        mimeType: row.data.mimeType,
        createdAt: new Date(row.created_at).getTime(),
      };
    }),
  );

  const layers = ((layerResult.data as RemoteLayerRow[] | null) ?? []).map(
    (row) => ({
      id: row.id,
      name: row.name,
      order: row.sort_order,
      opacity: Number(row.opacity),
      visible: row.is_visible,
      createdAt: new Date(row.created_at).getTime(),
    }),
  );

  return { layers, strokes: strokes ?? [], objects };
}

export async function saveRemoteStroke(
  supabase: SupabaseClient,
  context: RemoteSceneContext,
  stroke: Stroke,
  zIndex: number,
): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabase.from("strokes").upsert({
      id: stroke.id,
      layer_id: stroke.layerId,
      canvas_id: context.canvasId,
      user_id: context.userId,
      points: stroke.points,
      style: {
        color: stroke.color,
        width: stroke.width,
        pressureEnabled: stroke.pressureEnabled ?? true,
      },
      z_index: zIndex,
      created_at: new Date(stroke.createdAt).toISOString(),
      deleted_at: null,
    });
    throwIfError(error);
  });
}

export async function deleteRemoteStroke(
  supabase: SupabaseClient,
  context: RemoteSceneContext,
  strokeId: string,
): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabase
      .from("strokes")
      .delete()
      .eq("id", strokeId)
      .eq("canvas_id", context.canvasId);
    throwIfError(error);
  });
}

export async function saveRemoteObject(
  supabase: SupabaseClient,
  context: RemoteSceneContext,
  canvasObject: CanvasImageObject,
): Promise<CanvasImageObject> {
  let artifactId = canvasObject.artifactId;
  let storagePath = canvasObject.storagePath;
  const mimeType =
    canvasObject.mimeType ||
    (canvasObject.blob.type.startsWith("image/")
      ? canvasObject.blob.type
      : "image/png");

  if (!storagePath) {
    const extension =
      mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    storagePath = `${context.userId}/${context.projectId}/imports/${canvasObject.id}.${extension}`;

    await withRetry(async () => {
      const { error } = await supabase.storage
        .from(ASSET_BUCKET)
        .upload(storagePath!, canvasObject.blob, {
          cacheControl: "3600",
          contentType: mimeType,
          upsert: true,
        });
      throwIfError(error);
    });

    const { data: artifact, error } = await supabase
      .from("artifacts")
      .upsert(
        {
          project_id: context.projectId,
          canvas_id: context.canvasId,
          user_id: context.userId,
          artifact_type: "imported_image",
          storage_path: storagePath,
          mime_type: mimeType,
          width: Math.round(canvasObject.width),
          height: Math.round(canvasObject.height),
        },
        { onConflict: "storage_path" },
      )
      .select("id")
      .single();
    throwIfError(error);
    artifactId = artifact?.id;
  }

  const savedObject = {
    ...canvasObject,
    artifactId,
    storagePath,
    mimeType,
  };

  await withRetry(async () => {
    const { error } = await supabase.from("canvas_objects").upsert({
      id: savedObject.id,
      layer_id: savedObject.layerId,
      canvas_id: context.canvasId,
      user_id: context.userId,
      type: savedObject.type,
      x: savedObject.x,
      y: savedObject.y,
      width: savedObject.width,
      height: savedObject.height,
      rotation: savedObject.rotation,
      z_index: savedObject.zIndex,
      artifact_id: savedObject.artifactId,
      data: {
        storagePath: savedObject.storagePath,
        mimeType: savedObject.mimeType,
        opacity: normalizeObjectOpacity(savedObject.opacity),
      },
      created_at: new Date(savedObject.createdAt).toISOString(),
      deleted_at: null,
    });
    throwIfError(error);
  });

  return savedObject;
}

export async function saveRemoteLayer(
  supabase: SupabaseClient,
  context: RemoteSceneContext,
  layer: CanvasLayer,
): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabase.from("canvas_layers").upsert({
      id: layer.id,
      canvas_id: context.canvasId,
      user_id: context.userId,
      name: layer.name,
      sort_order: layer.order,
      opacity: layer.opacity,
      is_visible: layer.visible,
      created_at: new Date(layer.createdAt).toISOString(),
    });
    throwIfError(error);
  });
}

export async function deleteRemoteObject(
  supabase: SupabaseClient,
  context: RemoteSceneContext,
  canvasObject: CanvasImageObject,
): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabase
      .from("canvas_objects")
      .delete()
      .eq("id", canvasObject.id)
      .eq("canvas_id", context.canvasId);
    throwIfError(error);
  });
}

export async function clearRemoteScene(
  supabase: SupabaseClient,
  context: RemoteSceneContext,
): Promise<void> {
  const { data: artifacts, error: artifactReadError } = await supabase
    .from("artifacts")
    .select("storage_path")
    .eq("canvas_id", context.canvasId);
  throwIfError(artifactReadError);

  const paths = artifacts?.map((artifact) => artifact.storage_path) ?? [];
  const results = await Promise.all([
    supabase.from("strokes").delete().eq("canvas_id", context.canvasId),
    supabase.from("canvas_objects").delete().eq("canvas_id", context.canvasId),
  ]);
  results.forEach(({ error }) => throwIfError(error));

  const { error: artifactDeleteError } = await supabase
    .from("artifacts")
    .delete()
    .eq("canvas_id", context.canvasId);
  throwIfError(artifactDeleteError);

  if (paths.length > 0) {
    const { error } = await supabase.storage.from(ASSET_BUCKET).remove(paths);
    throwIfError(error);
  }
}
