import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

export function isOwnedAssetPath(userId: string, path: string): boolean {
  const [pathUserId, projectId] = path.split("/");
  return Boolean(
    pathUserId &&
      projectId &&
      pathUserId === userId &&
      !path.startsWith("/") &&
      !path.includes(".."),
  );
}

export async function assertOwnedProjectAccess(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function assertOwnedCanvasAccess(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  canvasId: string,
): Promise<boolean> {
  const projectOwned = await assertOwnedProjectAccess(
    supabase,
    userId,
    projectId,
  );
  if (!projectOwned) {
    return false;
  }

  const { data, error } = await supabase
    .from("canvases")
    .select("id")
    .eq("id", canvasId)
    .eq("project_id", projectId)
    .maybeSingle();

  return !error && Boolean(data);
}
