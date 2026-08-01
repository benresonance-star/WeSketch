import { createClient } from "@/lib/supabase/client";
import type { SavedUiConfiguration } from "@/types/canvas";

type UiConfigurationRow = {
  id: string;
  name: string;
  theme_mode: SavedUiConfiguration["themeMode"];
  canvas_color: string;
};

export async function loadUiConfigurations(
  userId: string,
): Promise<SavedUiConfiguration[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ui_configurations")
    .select("id, name, theme_mode, canvas_color")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as UiConfigurationRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    themeMode: row.theme_mode,
    canvasColor: row.canvas_color,
  }));
}

export async function saveUiConfiguration(
  userId: string,
  configuration: SavedUiConfiguration,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("ui_configurations").upsert(
    {
      id: configuration.id,
      user_id: userId,
      name: configuration.name,
      theme_mode: configuration.themeMode,
      canvas_color: configuration.canvasColor,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw error;
  }
}

export async function deleteUiConfiguration(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ui_configurations")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
