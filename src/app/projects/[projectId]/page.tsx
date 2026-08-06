/* eslint-disable @next/next/no-html-link-for-pages -- Full reload prevents stale canvas state on iPadOS 16 Safari. */
import { LayoutGrid } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { PhaseOneCanvas } from "@/components/canvas/PhaseOneCanvas";
import { createClient } from "@/lib/supabase/server";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) {
    redirect("/login");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, canvases(id, background)")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .single();
  const canvasId = project?.canvases?.[0]?.id;
  const canvasBackground = project?.canvases?.[0]?.background as
    | { color?: string }
    | undefined;

  if (!project || !canvasId) {
    notFound();
  }

  return (
    <PhaseOneCanvas
      backLink={
        <a
          aria-label="Projects"
          className="canvas-back-link"
          data-tooltip="Projects"
          href="/"
        >
          <LayoutGrid aria-hidden="true" strokeWidth={1.5} />
        </a>
      }
      canvasId={canvasId}
      initialCanvasColor={canvasBackground?.color ?? "#fbfaf6"}
      key={canvasId}
      projectId={project.id}
      projectTitle={project.title}
      userId={userId}
    />
  );
}
