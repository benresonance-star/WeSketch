import Link from "next/link";
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
    .select("id, title, canvases(id)")
    .eq("id", projectId)
    .single();
  const canvasId = project?.canvases?.[0]?.id;

  if (!project || !canvasId) {
    notFound();
  }

  return (
    <PhaseOneCanvas
      backLink={<Link href="/">Projects</Link>}
      canvasId={canvasId}
      projectId={project.id}
      projectTitle={project.title}
      userId={userId}
    />
  );
}
