import {
  getAuthenticatedUserId,
  isOwnedAssetPath,
} from "@/lib/supabase/access-control";
import { createClient } from "@/lib/supabase/server";

const ASSET_BUCKET = "project-assets";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.startsWith("/") || path.includes("..")) {
    return new Response("Invalid asset path.", { status: 400 });
  }

  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);

  if (!userId) {
    return new Response("Authentication required.", { status: 401 });
  }

  if (!isOwnedAssetPath(userId, path)) {
    return new Response("Asset not found.", { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .download(path);

  if (error || !data) {
    return new Response("Asset not found.", { status: 404 });
  }

  const body = await data.arrayBuffer();
  const contentType =
    data.type.startsWith("image/")
      ? data.type
      : path.endsWith(".webp")
        ? "image/webp"
        : path.endsWith(".png")
          ? "image/png"
          : path.match(/\.jpe?g$/i)
            ? "image/jpeg"
            : "application/octet-stream";

  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(body.byteLength),
      "Content-Type": contentType,
    },
  });
}
