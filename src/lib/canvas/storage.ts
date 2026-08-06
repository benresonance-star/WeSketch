import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { CanvasImageObject, CanvasLayer, MaskStroke, Stroke } from "@/types/canvas";
import { normalizeCanvasLayer, normalizeMaskStroke } from "@/lib/canvas/layer-masks";

type StoredStroke = Stroke & { projectId?: string };
type StoredObject = CanvasImageObject & { projectId?: string };
type StoredLayer = CanvasLayer & { projectId: string };
type StoredMaskStroke = MaskStroke & { projectId?: string };
export type SceneDeletion = {
  key: string;
  projectId: string;
  kind: "stroke" | "object" | "mask-stroke";
  entityId: string;
};

interface WeSketchPrototypeDatabase extends DBSchema {
  strokes: {
    key: string;
    value: StoredStroke;
    indexes: { projectId: string };
  };
  objects: {
    key: string;
    value: StoredObject;
    indexes: { projectId: string };
  };
  layers: {
    key: string;
    value: StoredLayer;
    indexes: { projectId: string };
  };
  maskStrokes: {
    key: string;
    value: StoredMaskStroke;
    indexes: { projectId: string };
  };
  deletions: {
    key: string;
    value: SceneDeletion;
    indexes: { projectId: string };
  };
}

const DATABASE_NAME = "wesketch-phase-zero";
const DATABASE_VERSION = 6;

let databasePromise: Promise<IDBPDatabase<WeSketchPrototypeDatabase>> | null = null;

function getDatabase(): Promise<IDBPDatabase<WeSketchPrototypeDatabase>> {
  if (!databasePromise) {
    databasePromise = openDB<WeSketchPrototypeDatabase>(
      DATABASE_NAME,
      DATABASE_VERSION,
      {
        upgrade(database, oldVersion, _newVersion, transaction) {
          if (!database.objectStoreNames.contains("strokes")) {
            const strokes = database.createObjectStore("strokes", {
              keyPath: "id",
            });
            strokes.createIndex("projectId", "projectId");
          } else if (oldVersion < 3) {
            transaction.objectStore("strokes").createIndex("projectId", "projectId");
          }
          if (!database.objectStoreNames.contains("objects")) {
            const objects = database.createObjectStore("objects", {
              keyPath: "id",
            });
            objects.createIndex("projectId", "projectId");
          } else if (oldVersion < 3) {
            transaction.objectStore("objects").createIndex("projectId", "projectId");
          }
          if (!database.objectStoreNames.contains("deletions")) {
            const deletions = database.createObjectStore("deletions", {
              keyPath: "key",
            });
            deletions.createIndex("projectId", "projectId");
          }
          if (!database.objectStoreNames.contains("layers")) {
            const layers = database.createObjectStore("layers", {
              keyPath: "id",
            });
            layers.createIndex("projectId", "projectId");
          }
          if (!database.objectStoreNames.contains("maskStrokes")) {
            const maskStrokes = database.createObjectStore("maskStrokes", {
              keyPath: "id",
            });
            maskStrokes.createIndex("projectId", "projectId");
          }
        },
      },
    );
  }

  return databasePromise;
}

export async function loadStrokes(projectId: string): Promise<Stroke[]> {
  const database = await getDatabase();
  const scoped = await database.getAllFromIndex(
    "strokes",
    "projectId",
    projectId,
  );

  if (scoped.length > 0) {
    return scoped;
  }

  const legacy = (await database.getAll("strokes")).filter(
    (stroke) => !stroke.projectId,
  );
  await Promise.all(
    legacy.map((stroke) =>
      database.put("strokes", { ...stroke, projectId }),
    ),
  );
  return legacy;
}

export async function saveStroke(
  projectId: string,
  stroke: Stroke,
): Promise<void> {
  const database = await getDatabase();
  await database.put("strokes", { ...stroke, projectId });
}

export async function deleteStroke(strokeId: string): Promise<void> {
  const database = await getDatabase();
  await database.delete("strokes", strokeId);
}

export async function clearStrokes(projectId: string): Promise<void> {
  const database = await getDatabase();
  const keys = await database.getAllKeysFromIndex(
    "strokes",
    "projectId",
    projectId,
  );
  const transaction = database.transaction("strokes", "readwrite");
  await Promise.all(keys.map((key) => transaction.store.delete(key)));
  await transaction.done;
}

function normalizeStoredObject(
  canvasObject: StoredObject,
): CanvasImageObject {
  const opacity =
    typeof canvasObject.opacity === "number" &&
    Number.isFinite(canvasObject.opacity)
      ? Math.min(1, Math.max(0, canvasObject.opacity))
      : 1;

  return {
    id: canvasObject.id,
    layerId: canvasObject.layerId,
    type: canvasObject.type,
    x: canvasObject.x,
    y: canvasObject.y,
    width: canvasObject.width,
    height: canvasObject.height,
    rotation: canvasObject.rotation,
    zIndex: canvasObject.zIndex,
    opacity,
    blob: canvasObject.blob,
    artifactId: canvasObject.artifactId,
    storagePath: canvasObject.storagePath,
    mimeType: canvasObject.mimeType,
    createdAt: canvasObject.createdAt,
  };
}

export async function loadCanvasObjects(
  projectId: string,
): Promise<CanvasImageObject[]> {
  const database = await getDatabase();
  const scoped = await database.getAllFromIndex(
    "objects",
    "projectId",
    projectId,
  );

  if (scoped.length > 0) {
    return scoped.map(normalizeStoredObject);
  }

  const legacy = (await database.getAll("objects")).filter(
    (canvasObject) => !canvasObject.projectId,
  );
  await Promise.all(
    legacy.map((canvasObject) =>
      database.put("objects", { ...canvasObject, projectId }),
    ),
  );
  return legacy.map(normalizeStoredObject);
}

export async function saveCanvasObject(
  projectId: string,
  canvasObject: CanvasImageObject,
): Promise<void> {
  const database = await getDatabase();
  await database.put("objects", { ...canvasObject, projectId });
}

export async function deleteCanvasObject(objectId: string): Promise<void> {
  const database = await getDatabase();
  await database.delete("objects", objectId);
}

export async function clearCanvasObjects(projectId: string): Promise<void> {
  const database = await getDatabase();
  const keys = await database.getAllKeysFromIndex(
    "objects",
    "projectId",
    projectId,
  );
  const transaction = database.transaction("objects", "readwrite");
  await Promise.all(keys.map((key) => transaction.store.delete(key)));
  await transaction.done;
}

export async function loadCanvasLayers(
  projectId: string,
): Promise<CanvasLayer[]> {
  const database = await getDatabase();
  const layers = await database.getAllFromIndex(
    "layers",
    "projectId",
    projectId,
  );
  return layers.map((layer) => normalizeCanvasLayer(layer));
}

export async function saveCanvasLayer(
  projectId: string,
  layer: CanvasLayer,
): Promise<void> {
  const database = await getDatabase();
  await database.put("layers", {
    ...normalizeCanvasLayer(layer),
    projectId,
  });
}

export async function loadMaskStrokes(projectId: string): Promise<MaskStroke[]> {
  const database = await getDatabase();
  const scoped = await database.getAllFromIndex(
    "maskStrokes",
    "projectId",
    projectId,
  );

  if (scoped.length > 0) {
    return scoped.map((maskStroke) => normalizeMaskStroke(maskStroke));
  }

  const legacy = (await database.getAll("maskStrokes")).filter(
    (maskStroke) => !maskStroke.projectId,
  );
  await Promise.all(
    legacy.map((maskStroke) =>
      database.put("maskStrokes", { ...normalizeMaskStroke(maskStroke), projectId }),
    ),
  );
  return legacy.map((maskStroke) => normalizeMaskStroke(maskStroke));
}

export async function saveMaskStroke(
  projectId: string,
  maskStroke: MaskStroke,
): Promise<void> {
  const database = await getDatabase();
  await database.put("maskStrokes", { ...maskStroke, projectId });
}

export async function deleteMaskStroke(maskStrokeId: string): Promise<void> {
  const database = await getDatabase();
  await database.delete("maskStrokes", maskStrokeId);
}

export async function clearMaskStrokes(projectId: string): Promise<void> {
  const database = await getDatabase();
  const keys = await database.getAllKeysFromIndex(
    "maskStrokes",
    "projectId",
    projectId,
  );
  const transaction = database.transaction("maskStrokes", "readwrite");
  await Promise.all(keys.map((key) => transaction.store.delete(key)));
  await transaction.done;
}

export async function loadSceneDeletions(
  projectId: string,
): Promise<SceneDeletion[]> {
  const database = await getDatabase();
  return database.getAllFromIndex("deletions", "projectId", projectId);
}

export async function markSceneDeletion(
  projectId: string,
  kind: SceneDeletion["kind"],
  entityId: string,
): Promise<void> {
  const database = await getDatabase();
  await database.put("deletions", {
    key: `${projectId}:${kind}:${entityId}`,
    projectId,
    kind,
    entityId,
  });
}

export async function clearSceneDeletion(
  projectId: string,
  kind: SceneDeletion["kind"],
  entityId: string,
): Promise<void> {
  const database = await getDatabase();
  await database.delete("deletions", `${projectId}:${kind}:${entityId}`);
}

export async function clearSceneDeletions(projectId: string): Promise<void> {
  const database = await getDatabase();
  const keys = await database.getAllKeysFromIndex(
    "deletions",
    "projectId",
    projectId,
  );
  const transaction = database.transaction("deletions", "readwrite");
  await Promise.all(keys.map((key) => transaction.store.delete(key)));
  await transaction.done;
}
