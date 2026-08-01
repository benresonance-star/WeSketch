import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { persistSelectionContext } from "@/lib/canvas/selection-persistence";

function createSupabaseMock(uploadError: Error | null = null) {
  const selectionInsert = vi.fn();
  const contextInsert = vi.fn();
  const upload = vi.fn(async () => ({ error: uploadError }));
  const remove = vi.fn(async () => ({ error: null }));
  const deleteSelection = vi.fn();

  const client = {
    from(table: string) {
      if (table === "selections") {
        return {
          insert(payload: unknown) {
            selectionInsert(payload);
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: "selection-id" },
                    error: null,
                  }),
                };
              },
            };
          },
          delete() {
            return {
              eq: async (_column: string, id: string) => {
                deleteSelection(id);
                return { error: null };
              },
            };
          },
        };
      }

      return {
        insert(payload: unknown) {
          contextInsert(payload);
          return {
            select() {
              return {
                single: async () => ({
                  data: { id: "context-id" },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return { upload, remove };
      },
    },
  } as unknown as SupabaseClient;

  return {
    client,
    contextInsert,
    deleteSelection,
    remove,
    selectionInsert,
    upload,
  };
}

const context = {
  canvasId: "canvas-id",
  projectId: "project-id",
  userId: "user-id",
};
const selection = {
  type: "rectangle" as const,
  bounds: { x: 10, y: 20, width: 100, height: 80 },
};
const bundle = {
  selection: new Blob(["selection"], { type: "image/webp" }),
  neighbourhood: new Blob(["neighbourhood"], { type: "image/webp" }),
  canvas: new Blob(["canvas"], { type: "image/webp" }),
};

describe("persistSelectionContext", () => {
  it("stores the selection, three private assets, and context row", async () => {
    const mock = createSupabaseMock();

    const result = await persistSelectionContext(
      mock.client,
      context,
      selection,
      bundle,
      "revision-1",
    );

    expect(result.id).toBe("context-id");
    expect(mock.selectionInsert).toHaveBeenCalledWith(
      expect.objectContaining({ selection_type: "rectangle" }),
    );
    expect(mock.upload).toHaveBeenCalledTimes(3);
    expect(mock.contextInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas_revision: "revision-1",
        selection_id: "selection-id",
      }),
    );
  });

  it("removes partial assets and the selection when an upload fails", async () => {
    const mock = createSupabaseMock(new Error("upload failed"));

    await expect(
      persistSelectionContext(
        mock.client,
        context,
        selection,
        bundle,
        "revision-1",
      ),
    ).rejects.toThrow("upload failed");

    expect(mock.remove).toHaveBeenCalledOnce();
    expect(mock.deleteSelection).toHaveBeenCalledWith("selection-id");
    expect(mock.contextInsert).not.toHaveBeenCalled();
  });
});
