import { createClient } from "@/lib/supabase/server";

const ASSET_BUCKET = "project-assets";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.startsWith("/") || path.includes("..")) {
    return new Response("Invalid asset path.", { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .download(path);

  if (error || !data) {
    return new Response("Asset not found.", { status: 404 });
  }

  return new Response(data, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": data.type || "application/octet-stream",
    },
  });
}
