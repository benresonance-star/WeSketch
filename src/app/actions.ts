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
