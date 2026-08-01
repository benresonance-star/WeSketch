import type { SupabaseClient } from "@supabase/supabase-js";

import type { RemoteSceneContext } from "@/lib/canvas/remote-persistence";
import type { SnapshotBundle } from "@/lib/canvas/snapshots";
import type { CanvasSelection } from "@/types/canvas";

const ASSET_BUCKET = "project-assets";

type PersistedContext = {
  id: string;
  selectionId: string;
  selectionPath: string;
  neighbourhoodPath: string;
  canvasPath: string;
};

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export async function persistSelectionContext(
  supabase: SupabaseClient,
  context: RemoteSceneContext,
  selection: CanvasSelection,
  bundle: SnapshotBundle,
  canvasRevision: string,
): Promise<PersistedContext> {
  const { data: selectionRow, error: selectionError } = await supabase
    .from("selections")
    .insert({
      canvas_id: context.canvasId,
      user_id: context.userId,
      selection_type: selection.type,
      bounds: selection.bounds,
      path: selection.type === "lasso" ? selection.path : null,
    })
    .select("id")
    .single();
  throwIfError(selectionError);

  if (!selectionRow) {
    throw new Error("Selection persistence returned no identifier.");
  }

  const basePath = `${context.userId}/${context.projectId}/selections/${selectionRow.id}`;
  const selectionPath = `${basePath}/selection.webp`;
  const neighbourhoodPath = `${basePath}/neighbourhood.webp`;
  const canvasPath = `${basePath}/canvas.webp`;
  const paths = [selectionPath, neighbourhoodPath, canvasPath];

  try {
    const uploads = await Promise.all([
      supabase.storage
        .from(ASSET_BUCKET)
        .upload(selectionPath, bundle.selection, {
          contentType: "image/webp",
          upsert: false,
        }),
      supabase.storage
        .from(ASSET_BUCKET)
        .upload(neighbourhoodPath, bundle.neighbourhood, {
          contentType: "image/webp",
          upsert: false,
        }),
      supabase.storage.from(ASSET_BUCKET).upload(canvasPath, bundle.canvas, {
        contentType: "image/webp",
        upsert: false,
      }),
    ]);
    uploads.forEach(({ error }) => throwIfError(error));

    const { data: contextRow, error: contextError } = await supabase
      .from("context_snapshots")
      .insert({
        selection_id: selectionRow.id,
        canvas_id: context.canvasId,
        user_id: context.userId,
        selection_asset_path: selectionPath,
        neighbourhood_asset_path: neighbourhoodPath,
        canvas_asset_path: canvasPath,
        canvas_revision: canvasRevision,
      })
      .select("id")
      .single();
    throwIfError(contextError);

    if (!contextRow) {
      throw new Error("Context persistence returned no identifier.");
    }

    return {
      id: contextRow.id,
      selectionId: selectionRow.id,
      selectionPath,
      neighbourhoodPath,
      canvasPath,
    };
  } catch (error) {
    await Promise.all([
      supabase.storage.from(ASSET_BUCKET).remove(paths),
      supabase.from("selections").delete().eq("id", selectionRow.id),
    ]);
    throw error;
  }
}
