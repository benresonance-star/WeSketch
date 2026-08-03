"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) {
    redirect("/login");
  }

  return { supabase, userId };
}

function normalizeProjectTitle(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") {
    return "Untitled project";
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : "Untitled project";
}

export async function createProjectAction(formData: FormData) {
  const { supabase, userId } = await requireUserId();
  const title = normalizeProjectTitle(formData.get("title"));
  const { data: leadingProject } = await supabase
    .from("projects")
    .select("sort_order")
    .eq("owner_id", userId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  const sortOrder =
    typeof leadingProject?.sort_order === "number"
      ? leadingProject.sort_order - 1
      : 0;
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({ owner_id: userId, title, sort_order: sortOrder })
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

export async function renameProjectAction(projectId: string, title: string) {
  const { supabase, userId } = await requireUserId();
  const normalizedTitle = title.trim().slice(0, 120) || "Untitled project";
  const { error } = await supabase
    .from("projects")
    .update({ title: normalizedTitle })
    .eq("id", projectId)
    .eq("owner_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
}

export async function archiveProjectAction(projectId: string) {
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase
    .from("projects")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("owner_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
}

export async function unarchiveProjectAction(projectId: string) {
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase
    .from("projects")
    .update({ archived_at: null })
    .eq("id", projectId)
    .eq("owner_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
}

export async function reorderProjectsAction(projectIds: string[]) {
  const { supabase, userId } = await requireUserId();

  if (projectIds.length === 0) {
    return;
  }

  const uniqueIds = new Set(projectIds);
  if (uniqueIds.size !== projectIds.length) {
    throw new Error("Duplicate project ids in reorder request.");
  }

  const { data: ownedProjects, error: readError } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", userId)
    .in("id", projectIds);

  if (readError) {
    throw new Error(readError.message);
  }

  if ((ownedProjects?.length ?? 0) !== projectIds.length) {
    throw new Error("One or more projects could not be reordered.");
  }

  const results = await Promise.all(
    projectIds.map((projectId, index) =>
      supabase
        .from("projects")
        .update({ sort_order: index })
        .eq("id", projectId)
        .eq("owner_id", userId),
    ),
  );

  for (const { error } of results) {
    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/");
}
