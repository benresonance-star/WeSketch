"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function createProjectAction(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) {
    redirect("/login");
  }

  const requestedTitle = formData.get("title");
  const title =
    typeof requestedTitle === "string" && requestedTitle.trim()
      ? requestedTitle.trim().slice(0, 120)
      : "Untitled project";
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({ owner_id: userId, title })
    .select("id")
    .single();

  if (projectError) {
    throw new Error(projectError.message);
  }

  const { error: canvasError } = await supabase.from("canvases").insert({
    project_id: project.id,
    name: "Canvas 1",
    width: 2048,
    height: 1536,
  });

  if (canvasError) {
    await supabase.from("projects").delete().eq("id", project.id);
    throw new Error(canvasError.message);
  }

  redirect(`/projects/${project.id}`);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
