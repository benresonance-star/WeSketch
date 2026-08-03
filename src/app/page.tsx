import { redirect } from "next/navigation";

import { ProjectsView } from "@/components/projects/ProjectsView";
import { createClient } from "@/lib/supabase/server";

type CanvasBackground = {
  color?: string;
};

export default async function HomePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims.sub) {
    redirect("/login");
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id, title, updated_at, archived_at, sort_order, thumbnail_path, canvases ( background )",
    )
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const projectItems = await Promise.all(
    (projects ?? []).map(async (project) => {
      let thumbnailUrl: string | null = null;

      if (project.thumbnail_path) {
        const { data: signedUrl } = await supabase.storage
          .from("project-assets")
          .createSignedUrl(project.thumbnail_path, 60 * 60);
        thumbnailUrl = signedUrl?.signedUrl ?? null;
      }

      const canvasBackground = project.canvases?.[0]?.background as
        | CanvasBackground
        | undefined;

      return {
        id: project.id,
        title: project.title,
        updatedAt: project.updated_at,
        archivedAt: project.archived_at,
        thumbnailUrl,
        canvasColor: canvasBackground?.color ?? "#fbfaf6",
      };
    }),
  );

  return <ProjectsView projects={projectItems} />;
}
