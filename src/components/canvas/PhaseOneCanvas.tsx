"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { ContextPanel } from "@/components/canvas/ContextPanel";
import {
  distance,
  fitViewport,
  midpoint,
  screenToWorld,
  zoomViewport,
  type Point,
  type ScreenPoint,
  type Viewport,
} from "@/lib/canvas/geometry";
import {
  decodeImageBlob,
  prepareImportedImage,
} from "@/lib/canvas/images";
import {
  drawStroke,
  renderViewport,
} from "@/lib/canvas/scene-renderer";
import {
  boundsFromPoints,
  hitTestStroke,
  normalizeBounds,
  pointInBounds,
} from "@/lib/canvas/selection";
import { renderSnapshotBundle } from "@/lib/canvas/snapshots";
import {
  clearCanvasObjects,
  clearSceneDeletion,
  clearSceneDeletions,
  clearStrokes,
  deleteCanvasObject,
  deleteStroke,
  loadCanvasObjects,
  loadSceneDeletions,
  loadStrokes,
  markSceneDeletion,
  saveCanvasObject,
  saveStroke,
} from "@/lib/canvas/storage";
import {
  clearRemoteScene,
  deleteRemoteObject,
  deleteRemoteStroke,
  loadRemoteScene,
  saveRemoteObject,
  saveRemoteStroke,
  type RemoteSceneContext,
} from "@/lib/canvas/remote-persistence";
import { createClient } from "@/lib/supabase/client";
import { createUuid, isUuid } from "@/lib/uuid";
import type {
  BrushSettings,
  CanvasImageObject,
  CanvasSelection,
  InteractionMode,
  PrototypeStats,
  SnapshotPreview,
  Stroke,
  Tool,
} from "@/types/canvas";

const WORLD_WIDTH = 2048;
const WORLD_HEIGHT = 1536;
const DEFAULT_DPR = 1.5;
const MAX_DPR = 2;
const STRESS_STROKE_COUNT = 10_000;
const STRESS_POINTS_PER_STROKE = 12;
const PEN_COLOR = "#242220";
const BRUSH_SETTINGS_STORAGE_KEY = "wesketch-brush-settings-v1";
const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  color: PEN_COLOR,
  size: 4,
  pressureEnabled: true,
};
const SELECTION_COLOR = "#2468f2";
const ARTBOARD_COLOR = "#fbfaf6";
const WORKSPACE_COLOR = "#e9e7e2";
const MIN_SELECTION_SIZE = 8;

type SurfaceSize = {
  width: number;
  height: number;
};

type TrackedPointer = {
  id: number;
  pointerType: string;
  current: ScreenPoint;
};

type PinchState = {
  firstId: number;
  secondId: number;
  initialCenter: ScreenPoint;
  initialDistance: number;
  initialViewport: Viewport;
};

type PanState = {
  pointerId: number;
  initialPoint: ScreenPoint;
  initialViewport: Viewport;
};

type ObjectTransformState = {
  pointerId: number;
  kind: "move" | "resize";
  initialPoint: ScreenPoint;
  initialObject: CanvasImageObject;
};

type HistoryCommand =
  | { type: "stroke-add"; stroke: Stroke }
  | { type: "stroke-delete"; stroke: Stroke; index: number }
  | { type: "object-add"; object: CanvasImageObject }
  | { type: "object-delete"; object: CanvasImageObject; index: number }
  | {
      type: "object-update";
      before: CanvasImageObject;
      after: CanvasImageObject;
    };

const INITIAL_STATS: PrototypeStats = {
  strokeCount: 0,
  pointCount: 0,
  pointerCancelCount: 0,
  renderDurationMs: 0,
  persistenceState: "loading",
};

function configureCanvas(
  canvas: HTMLCanvasElement,
  size: SurfaceSize,
  dpr: number,
  alpha: boolean,
): CanvasRenderingContext2D | null {
  const width = Math.max(1, Math.round(size.width * dpr));
  const height = Math.max(1, Math.round(size.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return canvas.getContext("2d", { alpha });
}

function screenPointFromEvent(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
): ScreenPoint {
  const bounds = canvas.getBoundingClientRect();

  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function worldPointFromEvent(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  viewport: Viewport,
): Point {
  const worldPoint = screenToWorld(
    screenPointFromEvent(event, canvas),
    viewport,
  );

  return {
    ...worldPoint,
    pressure: event.pressure > 0 ? event.pressure : 0.5,
    time: event.timeStamp,
  };
}

function hitTestObject(
  point: ScreenPoint,
  objects: CanvasImageObject[],
): CanvasImageObject | null {
  const sorted = [...objects].sort(
    (first, second) => second.zIndex - first.zIndex,
  );
  return sorted.find((canvasObject) => pointInBounds(point, canvasObject)) ?? null;
}

function isResizeHandle(
  point: ScreenPoint,
  canvasObject: CanvasImageObject,
  viewportScale: number,
): boolean {
  const radius = 20 / viewportScale;
  return (
    Math.hypot(
      point.x - (canvasObject.x + canvasObject.width),
      point.y - (canvasObject.y + canvasObject.height),
    ) <= radius
  );
}

type PhaseOneCanvasProps = {
  backLink: ReactNode;
  canvasId: string;
  projectId: string;
  projectTitle: string;
  userId: string;
};

export function PhaseOneCanvas({
  backLink,
  canvasId,
  projectId,
  projectTitle,
  userId,
}: PhaseOneCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const objectsRef = useRef<CanvasImageObject[]>([]);
  const imageSourcesRef = useRef(new Map<string, ImageBitmap>());
  const historyRef = useRef<HistoryCommand[]>([]);
  const redoRef = useRef<HistoryCommand[]>([]);
  const activePointsRef = useRef<Point[]>([]);
  const activeStrokeIdRef = useRef<string | null>(null);
  const activePenPointerIdRef = useRef<number | null>(null);
  const erasedStrokeIdsRef = useRef(new Set<string>());
  const selectionRef = useRef<CanvasSelection | null>(null);
  const selectionStartRef = useRef<ScreenPoint | null>(null);
  const selectedObjectIdRef = useRef<string | null>(null);
  const objectTransformRef = useRef<ObjectTransformState | null>(null);
  const pointersRef = useRef(new Map<number, TrackedPointer>());
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const surfaceSizeRef = useRef<SurfaceSize>({ width: 1, height: 1 });
  const dprRef = useRef(DEFAULT_DPR);
  const modeRef = useRef<InteractionMode>("idle");
  const pinchRef = useRef<PinchState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const frameRef = useRef<number | null>(null);
  const hasFittedRef = useRef(false);
  const pendingSyncCountRef = useRef(0);
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());
  const snapshotsRef = useRef<SnapshotPreview | null>(null);
  const brushSettingsRef = useRef(DEFAULT_BRUSH_SETTINGS);
  const supabase = useMemo(() => createClient(), []);
  const remoteContext = useMemo<RemoteSceneContext>(
    () => ({ canvasId, projectId, userId }),
    [canvasId, projectId, userId],
  );
  const [tool, setTool] = useState<Tool>("pen");
  const toolRef = useRef<Tool>("pen");
  const [brushSettings, setBrushSettings] = useState(DEFAULT_BRUSH_SETTINGS);
  const [dpr, setDpr] = useState(DEFAULT_DPR);
  const [stressLoaded, setStressLoaded] = useState(false);
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotPreview | null>(null);
  const [snapshotState, setSnapshotState] = useState<
    "idle" | "preparing" | "ready" | "error"
  >("idle");
  const [stats, setStats] = useState<PrototypeStats>(INITIAL_STATS);

  const queueRemoteSync = useCallback((operation: () => Promise<void>) => {
    pendingSyncCountRef.current += 1;
    setStats((current) => ({ ...current, persistenceState: "saving" }));
    const next = syncChainRef.current.then(operation);
    syncChainRef.current = next.catch(() => undefined);
    void next
      .then(() => {
        pendingSyncCountRef.current -= 1;
        if (pendingSyncCountRef.current === 0) {
          setStats((current) => ({ ...current, persistenceState: "saved" }));
        }
      })
      .catch(() => {
        pendingSyncCountRef.current -= 1;
        setStats((current) => ({ ...current, persistenceState: "error" }));
      });
  }, []);

  const invalidateSnapshots = useCallback(() => {
    if (snapshotsRef.current) {
      Object.values(snapshotsRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
      snapshotsRef.current = null;
    }

    setSnapshots(null);
    setSnapshotState("idle");
  }, []);

  const updateDocumentStats = useCallback((renderDurationMs?: number) => {
    const strokes = strokesRef.current;
    let pointCount = 0;

    for (const stroke of strokes) {
      pointCount += stroke.points.length;
    }

    setStats((current) => ({
      ...current,
      strokeCount: strokes.length,
      pointCount,
      renderDurationMs: renderDurationMs ?? current.renderDurationMs,
    }));
  }, []);

  const renderScene = useCallback(() => {
    const canvas = sceneCanvasRef.current;

    if (!canvas) {
      return;
    }

    const startedAt = performance.now();
    const size = surfaceSizeRef.current;
    const pixelRatio = dprRef.current;
    const context = configureCanvas(canvas, size, pixelRatio, false);

    if (!context) {
      return;
    }

    renderViewport(
      context,
      size,
      pixelRatio,
      viewportRef.current,
      { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      {
        strokes: strokesRef.current,
        objects: objectsRef.current,
        imageSources: imageSourcesRef.current,
      },
      { workspace: WORKSPACE_COLOR, artboard: ARTBOARD_COLOR },
    );
    updateDocumentStats(performance.now() - startedAt);
  }, [updateDocumentStats]);

  const renderInteractions = useCallback(() => {
    const canvas = interactionCanvasRef.current;

    if (!canvas) {
      return;
    }

    const size = surfaceSizeRef.current;
    const pixelRatio = dprRef.current;
    const context = configureCanvas(canvas, size, pixelRatio, true);

    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const viewport = viewportRef.current;
    context.setTransform(
      pixelRatio * viewport.scale,
      0,
      0,
      pixelRatio * viewport.scale,
      pixelRatio * viewport.x,
      pixelRatio * viewport.y,
    );
    context.save();
    context.beginPath();
    context.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.clip();

    if (activePointsRef.current.length > 0) {
      drawStroke(context, {
        id: "active",
        points: activePointsRef.current,
        color: brushSettingsRef.current.color,
        width: brushSettingsRef.current.size,
        pressureEnabled: brushSettingsRef.current.pressureEnabled,
        createdAt: 0,
      });
    }

    const currentSelection = selectionRef.current;

    if (currentSelection) {
      context.strokeStyle = SELECTION_COLOR;
      context.lineWidth = 2 / viewport.scale;
      context.setLineDash([8 / viewport.scale, 5 / viewport.scale]);
      context.beginPath();

      if (currentSelection.type === "rectangle") {
        const { bounds } = currentSelection;
        context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      } else {
        currentSelection.path.forEach((point, index) => {
          if (index === 0) {
            context.moveTo(point.x, point.y);
          } else {
            context.lineTo(point.x, point.y);
          }
        });
        context.closePath();
      }

      context.stroke();
      context.setLineDash([]);
    }

    const selectedObject = objectsRef.current.find(
      (canvasObject) => canvasObject.id === selectedObjectIdRef.current,
    );

    if (selectedObject) {
      context.strokeStyle = SELECTION_COLOR;
      context.lineWidth = 2 / viewport.scale;
      context.strokeRect(
        selectedObject.x,
        selectedObject.y,
        selectedObject.width,
        selectedObject.height,
      );
      context.fillStyle = SELECTION_COLOR;
      context.fillRect(
        selectedObject.x + selectedObject.width - 7 / viewport.scale,
        selectedObject.y + selectedObject.height - 7 / viewport.scale,
        14 / viewport.scale,
        14 / viewport.scale,
      );
    }

    context.restore();
  }, []);

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      renderScene();
      renderInteractions();
    });
  }, [renderInteractions, renderScene]);

  const fitToScreen = useCallback(() => {
    const size = surfaceSizeRef.current;
    viewportRef.current = fitViewport(
      size.width,
      size.height,
      WORLD_WIDTH,
      WORLD_HEIGHT,
    );
    scheduleRender();
  }, [scheduleRender]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    let frame: number | null = null;

    try {
      const stored = localStorage.getItem(BRUSH_SETTINGS_STORAGE_KEY);

      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored) as Partial<BrushSettings>;
      const nextSettings: BrushSettings = {
        color:
          typeof parsed.color === "string"
            ? parsed.color
            : DEFAULT_BRUSH_SETTINGS.color,
        size:
          typeof parsed.size === "number" &&
          parsed.size >= 1 &&
          parsed.size <= 40
            ? parsed.size
            : DEFAULT_BRUSH_SETTINGS.size,
        pressureEnabled:
          typeof parsed.pressureEnabled === "boolean"
            ? parsed.pressureEnabled
            : DEFAULT_BRUSH_SETTINGS.pressureEnabled,
      };
      frame = requestAnimationFrame(() => {
        brushSettingsRef.current = nextSettings;
        setBrushSettings(nextSettings);
      });
    } catch {
      localStorage.removeItem(BRUSH_SETTINGS_STORAGE_KEY);
    }

    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  useEffect(() => {
    brushSettingsRef.current = brushSettings;
    localStorage.setItem(
      BRUSH_SETTINGS_STORAGE_KEY,
      JSON.stringify(brushSettings),
    );
    renderInteractions();
  }, [brushSettings, renderInteractions]);

  useEffect(() => {
    dprRef.current = Math.min(MAX_DPR, dpr);
    scheduleRender();
  }, [dpr, scheduleRender]);

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const preventNativeGesture = (event: TouchEvent) => {
      event.preventDefault();
    };
    const observer = new ResizeObserver(([entry]) => {
      surfaceSizeRef.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };

      if (!hasFittedRef.current) {
        hasFittedRef.current = true;
        fitToScreen();
      } else {
        scheduleRender();
      }
    });

    surface.addEventListener("touchstart", preventNativeGesture, {
      passive: false,
    });
    surface.addEventListener("touchmove", preventNativeGesture, {
      passive: false,
    });
    observer.observe(surface);

    return () => {
      observer.disconnect();
      surface.removeEventListener("touchstart", preventNativeGesture);
      surface.removeEventListener("touchmove", preventNativeGesture);
    };
  }, [fitToScreen, scheduleRender]);

  useEffect(() => {
    let cancelled = false;
    const imageSources = imageSourcesRef.current;

    const applyScene = async (
      strokes: Stroke[],
      objects: CanvasImageObject[],
    ) => {
      const decoded = await Promise.all(
        objects.map(async (canvasObject) => ({
          id: canvasObject.id,
          source: await decodeImageBlob(canvasObject.blob),
        })),
      );

      if (cancelled) {
        decoded.forEach(({ source }) => source.close());
        return;
      }

      imageSources.forEach((source) => source.close());
      imageSources.clear();
      strokesRef.current = strokes.sort(
        (first, second) => first.createdAt - second.createdAt,
      );
      objectsRef.current = objects.sort(
        (first, second) => first.zIndex - second.zIndex,
      );
      decoded.forEach(({ id, source }) => {
        imageSourcesRef.current.set(id, source);
      });
      setStats((current) => ({ ...current, persistenceState: "saved" }));
      scheduleRender();
    };

    void (async () => {
      try {
        const [storedStrokes, storedObjects, storedDeletions] =
          await Promise.all([
          loadStrokes(projectId),
          loadCanvasObjects(projectId),
          loadSceneDeletions(projectId),
        ]);
        const localStrokes = storedStrokes.map((stroke) =>
          isUuid(stroke.id) ? stroke : { ...stroke, id: createUuid() },
        );
        const localObjects = storedObjects.map((canvasObject) =>
          isUuid(canvasObject.id)
            ? canvasObject
            : {
                ...canvasObject,
                id: createUuid(),
                artifactId: undefined,
                storagePath: undefined,
              },
        );
        const deletions = storedDeletions.filter((deletion) =>
          isUuid(deletion.entityId),
        );
        await Promise.all(
          storedDeletions
            .filter((deletion) => !isUuid(deletion.entityId))
            .map((deletion) =>
              clearSceneDeletion(
                projectId,
                deletion.kind,
                deletion.entityId,
              ),
            ),
        );
        await applyScene(localStrokes, localObjects);

        const remote = await loadRemoteScene(supabase, remoteContext);
        const deletedStrokeIds = new Set(
          deletions
            .filter((deletion) => deletion.kind === "stroke")
            .map((deletion) => deletion.entityId),
        );
        const deletedObjectIds = new Set(
          deletions
            .filter((deletion) => deletion.kind === "object")
            .map((deletion) => deletion.entityId),
        );
        const strokeMap = new Map(
          remote.strokes
            .filter((stroke) => !deletedStrokeIds.has(stroke.id))
            .map((stroke) => [stroke.id, stroke]),
        );
        const objectMap = new Map(
          remote.objects
            .filter((canvasObject) => !deletedObjectIds.has(canvasObject.id))
            .map((canvasObject) => [canvasObject.id, canvasObject]),
        );
        localStrokes.forEach((stroke) => strokeMap.set(stroke.id, stroke));
        localObjects.forEach((canvasObject) =>
          objectMap.set(canvasObject.id, canvasObject),
        );
        const mergedStrokes = Array.from(strokeMap.values());
        const mergedObjects = Array.from(objectMap.values());

        await Promise.all([
          clearStrokes(projectId),
          clearCanvasObjects(projectId),
        ]);
        await Promise.all([
          ...mergedStrokes.map((stroke) => saveStroke(projectId, stroke)),
          ...mergedObjects.map((canvasObject) =>
            saveCanvasObject(projectId, canvasObject),
          ),
        ]);
        await applyScene(mergedStrokes, mergedObjects);

        const remoteStrokeIds = new Set(remote.strokes.map((stroke) => stroke.id));
        localStrokes
          .filter((stroke) => !remoteStrokeIds.has(stroke.id))
          .forEach((stroke, index) => {
            queueRemoteSync(() =>
              saveRemoteStroke(supabase, remoteContext, stroke, index),
            );
          });
        localObjects.forEach((canvasObject) => {
          queueRemoteSync(async () => {
            const saved = await saveRemoteObject(
              supabase,
              remoteContext,
              canvasObject,
            );
            objectsRef.current = objectsRef.current.map((current) =>
              current.id === saved.id ? saved : current,
            );
            await saveCanvasObject(projectId, saved);
          });
        });
        deletions.forEach((deletion) => {
          queueRemoteSync(async () => {
            if (deletion.kind === "stroke") {
              await deleteRemoteStroke(
                supabase,
                remoteContext,
                deletion.entityId,
              );
            } else {
              const remoteObject = remote.objects.find(
                (canvasObject) => canvasObject.id === deletion.entityId,
              );
              if (remoteObject) {
                await deleteRemoteObject(
                  supabase,
                  remoteContext,
                  remoteObject,
                );
              }
            }
            await clearSceneDeletion(
              projectId,
              deletion.kind,
              deletion.entityId,
            );
          });
        });
      } catch {
        if (!cancelled) {
          setStats((current) => ({ ...current, persistenceState: "error" }));
        }
      }
    })();

    return () => {
      cancelled = true;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      imageSources.forEach((source) => source.close());

      if (snapshotsRef.current) {
        Object.values(snapshotsRef.current).forEach((url) =>
          URL.revokeObjectURL(url),
        );
      }
    };
  }, [
    projectId,
    queueRemoteSync,
    remoteContext,
    scheduleRender,
    supabase,
  ]);

  const queueStrokeDeletion = useCallback(
    (strokeId: string) => {
      const tombstone = markSceneDeletion(projectId, "stroke", strokeId);
      queueRemoteSync(async () => {
        await tombstone;
        await deleteRemoteStroke(supabase, remoteContext, strokeId);
        await clearSceneDeletion(projectId, "stroke", strokeId);
      });
    },
    [projectId, queueRemoteSync, remoteContext, supabase],
  );

  const queueObjectDeletion = useCallback(
    (canvasObject: CanvasImageObject) => {
      const tombstone = markSceneDeletion(
        projectId,
        "object",
        canvasObject.id,
      );
      queueRemoteSync(async () => {
        await tombstone;
        await deleteRemoteObject(supabase, remoteContext, canvasObject);
        await clearSceneDeletion(projectId, "object", canvasObject.id);
      });
    },
    [projectId, queueRemoteSync, remoteContext, supabase],
  );

  const beginPinch = useCallback(() => {
    const touches = Array.from(pointersRef.current.values()).filter(
      (pointer) => pointer.pointerType === "touch",
    );

    if (touches.length < 2 || activePenPointerIdRef.current !== null) {
      return;
    }

    const [first, second] = touches;
    pinchRef.current = {
      firstId: first.id,
      secondId: second.id,
      initialCenter: midpoint(first.current, second.current),
      initialDistance: Math.max(1, distance(first.current, second.current)),
      initialViewport: { ...viewportRef.current },
    };
    panRef.current = null;
    modeRef.current = "viewport";
  }, []);

  const beginPan = useCallback((pointerId: number, point: ScreenPoint) => {
    panRef.current = {
      pointerId,
      initialPoint: point,
      initialViewport: { ...viewportRef.current },
    };
    pinchRef.current = null;
    modeRef.current = "viewport";
  }, []);

  const beginStroke = useCallback(
    (event: PointerEvent) => {
      const canvas = interactionCanvasRef.current;

      if (!canvas || stats.persistenceState === "loading") {
        return;
      }

      activePenPointerIdRef.current = event.pointerId;
      activeStrokeIdRef.current = createUuid();
      activePointsRef.current = [
        worldPointFromEvent(event, canvas, viewportRef.current),
      ];
      modeRef.current = "inking";
      pinchRef.current = null;
      panRef.current = null;
      renderInteractions();
    },
    [renderInteractions, stats.persistenceState],
  );

  const beginSelection = useCallback(
    (event: PointerEvent, selectionType: "rectangle" | "lasso") => {
      const canvas = interactionCanvasRef.current;

      if (!canvas) {
        return;
      }

      const point = worldPointFromEvent(event, canvas, viewportRef.current);
      selectionStartRef.current = point;
      selectionRef.current =
        selectionType === "rectangle"
          ? {
              type: "rectangle",
              bounds: { x: point.x, y: point.y, width: 0, height: 0 },
            }
          : {
              type: "lasso",
              bounds: { x: point.x, y: point.y, width: 0, height: 0 },
              path: [point],
            };
      setSelection(null);
      invalidateSnapshots();
      modeRef.current = "selecting";
      activePenPointerIdRef.current = event.pointerId;
      renderInteractions();
    },
    [invalidateSnapshots, renderInteractions],
  );

  const eraseAt = useCallback(
    (point: ScreenPoint) => {
      const radius = 18 / viewportRef.current.scale;

      for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
        const stroke = strokesRef.current[index];

        if (
          erasedStrokeIdsRef.current.has(stroke.id) ||
          !hitTestStroke(point, stroke, radius)
        ) {
          continue;
        }

        erasedStrokeIdsRef.current.add(stroke.id);
        strokesRef.current = strokesRef.current.filter(
          (candidate) => candidate.id !== stroke.id,
        );
        historyRef.current.push({ type: "stroke-delete", stroke, index });
        redoRef.current = [];
        invalidateSnapshots();
        void deleteStroke(stroke.id);
        queueStrokeDeletion(stroke.id);
        scheduleRender();
        break;
      }
    },
    [
      invalidateSnapshots,
      queueStrokeDeletion,
      scheduleRender,
    ],
  );

  const beginObjectTransform = useCallback(
    (event: PointerEvent) => {
      const canvas = interactionCanvasRef.current;

      if (!canvas) {
        return;
      }

      const point = screenToWorld(
        screenPointFromEvent(event, canvas),
        viewportRef.current,
      );
      const selectedObject = objectsRef.current.find(
        (canvasObject) => canvasObject.id === selectedObjectIdRef.current,
      );
      const target =
        selectedObject &&
        isResizeHandle(point, selectedObject, viewportRef.current.scale)
          ? selectedObject
          : hitTestObject(point, objectsRef.current);

      if (!target) {
        selectedObjectIdRef.current = null;
        setSelectedObjectId(null);
        renderInteractions();
        return;
      }

      selectedObjectIdRef.current = target.id;
      setSelectedObjectId(target.id);
      objectTransformRef.current = {
        pointerId: event.pointerId,
        kind:
          selectedObject?.id === target.id &&
          isResizeHandle(point, target, viewportRef.current.scale)
            ? "resize"
            : "move",
        initialPoint: point,
        initialObject: { ...target },
      };
      modeRef.current = "objectTransform";
      renderInteractions();
    },
    [renderInteractions],
  );

  const commitActiveStroke = useCallback(() => {
    const strokeId = activeStrokeIdRef.current;
    const points = activePointsRef.current;

    activePenPointerIdRef.current = null;
    activeStrokeIdRef.current = null;
    activePointsRef.current = [];
    modeRef.current = "idle";

    if (!strokeId || points.length === 0) {
      renderInteractions();
      return;
    }

    const stroke: Stroke = {
      id: strokeId,
      points,
      color: brushSettingsRef.current.color,
      width: brushSettingsRef.current.size,
      pressureEnabled: brushSettingsRef.current.pressureEnabled,
      createdAt: Date.now(),
    };
    strokesRef.current = [...strokesRef.current, stroke];
    historyRef.current.push({ type: "stroke-add", stroke });
    redoRef.current = [];
    invalidateSnapshots();
    setStats((current) => ({ ...current, persistenceState: "saving" }));
    scheduleRender();

    void saveStroke(projectId, stroke).catch(() => {
        setStats((current) => ({ ...current, persistenceState: "error" }));
      });
    queueRemoteSync(() =>
      saveRemoteStroke(
        supabase,
        remoteContext,
        stroke,
        strokesRef.current.length - 1,
      ),
    );
  }, [
    invalidateSnapshots,
    projectId,
    queueRemoteSync,
    remoteContext,
    renderInteractions,
    scheduleRender,
    supabase,
  ]);

  const handlePointerDown = useCallback(
    (reactEvent: ReactPointerEvent<HTMLCanvasElement>) => {
      const event = reactEvent.nativeEvent;
      const canvas = interactionCanvasRef.current;

      if (!canvas) {
        return;
      }

      reactEvent.preventDefault();

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Safari can reject capture after a system cancellation.
      }

      const current = screenPointFromEvent(event, canvas);
      pointersRef.current.set(event.pointerId, {
        id: event.pointerId,
        pointerType: event.pointerType,
        current,
      });

      if (event.pointerType === "touch") {
        const touchCount = Array.from(pointersRef.current.values()).filter(
          (pointer) => pointer.pointerType === "touch",
        ).length;

        if (touchCount >= 2) {
          beginPinch();
        } else if (
          toolRef.current === "hand" &&
          activePenPointerIdRef.current === null
        ) {
          beginPan(event.pointerId, current);
        }

        return;
      }

      if (!event.isPrimary || event.button !== 0) {
        return;
      }

      switch (toolRef.current) {
        case "pen":
          beginStroke(event);
          break;
        case "eraser":
          activePenPointerIdRef.current = event.pointerId;
          erasedStrokeIdsRef.current.clear();
          modeRef.current = "erasing";
          eraseAt(screenToWorld(current, viewportRef.current));
          break;
        case "rectangle":
          beginSelection(event, "rectangle");
          break;
        case "lasso":
          beginSelection(event, "lasso");
          break;
        case "object":
          beginObjectTransform(event);
          break;
        case "hand":
          beginPan(event.pointerId, current);
          break;
        default: {
          const exhaustiveTool: never = toolRef.current;
          throw new Error(`Unsupported tool: ${exhaustiveTool}`);
        }
      }
    },
    [
      beginObjectTransform,
      beginPan,
      beginPinch,
      beginSelection,
      beginStroke,
      eraseAt,
    ],
  );

  const handlePointerMove = useCallback(
    (reactEvent: ReactPointerEvent<HTMLCanvasElement>) => {
      const event = reactEvent.nativeEvent;
      const canvas = interactionCanvasRef.current;

      if (!canvas) {
        return;
      }

      reactEvent.preventDefault();
      const current = screenPointFromEvent(event, canvas);
      const tracked = pointersRef.current.get(event.pointerId);

      if (tracked) {
        tracked.current = current;
      }

      if (
        modeRef.current === "inking" &&
        activePenPointerIdRef.current === event.pointerId
      ) {
        const samples = event.getCoalescedEvents?.() ?? [];
        const events = samples.length > 0 ? samples : [event];

        for (const sample of events) {
          activePointsRef.current.push(
            worldPointFromEvent(sample, canvas, viewportRef.current),
          );
        }

        renderInteractions();
        return;
      }

      if (
        modeRef.current === "erasing" &&
        activePenPointerIdRef.current === event.pointerId
      ) {
        eraseAt(screenToWorld(current, viewportRef.current));
        return;
      }

      if (
        modeRef.current === "selecting" &&
        activePenPointerIdRef.current === event.pointerId
      ) {
        const worldPoint = worldPointFromEvent(
          event,
          canvas,
          viewportRef.current,
        );
        const currentSelection = selectionRef.current;
        const start = selectionStartRef.current;

        if (currentSelection?.type === "rectangle" && start) {
          selectionRef.current = {
            type: "rectangle",
            bounds: normalizeBounds(start, worldPoint),
          };
        } else if (currentSelection?.type === "lasso") {
          const path = [...currentSelection.path, worldPoint];
          selectionRef.current = {
            type: "lasso",
            path,
            bounds: boundsFromPoints(path),
          };
        }

        renderInteractions();
        return;
      }

      const objectTransform = objectTransformRef.current;

      if (
        modeRef.current === "objectTransform" &&
        objectTransform?.pointerId === event.pointerId
      ) {
        const worldPoint = screenToWorld(current, viewportRef.current);
        const deltaX = worldPoint.x - objectTransform.initialPoint.x;
        const deltaY = worldPoint.y - objectTransform.initialPoint.y;
        objectsRef.current = objectsRef.current.map((canvasObject) => {
          if (canvasObject.id !== objectTransform.initialObject.id) {
            return canvasObject;
          }

          if (objectTransform.kind === "move") {
            return {
              ...canvasObject,
              x: objectTransform.initialObject.x + deltaX,
              y: objectTransform.initialObject.y + deltaY,
            };
          }

          const aspectRatio =
            objectTransform.initialObject.width /
            objectTransform.initialObject.height;
          const width = Math.max(
            80,
            objectTransform.initialObject.width + deltaX,
          );

          return {
            ...canvasObject,
            width,
            height: width / aspectRatio,
          };
        });
        scheduleRender();
        return;
      }

      const pinch = pinchRef.current;

      if (modeRef.current === "viewport" && pinch) {
        const first = pointersRef.current.get(pinch.firstId);
        const second = pointersRef.current.get(pinch.secondId);

        if (first && second) {
          const currentCenter = midpoint(first.current, second.current);
          const currentDistance = Math.max(
            1,
            distance(first.current, second.current),
          );
          viewportRef.current = zoomViewport(
            pinch.initialViewport,
            pinch.initialCenter,
            currentCenter,
            currentDistance / pinch.initialDistance,
          );
          scheduleRender();
        }

        return;
      }

      const pan = panRef.current;

      if (
        modeRef.current === "viewport" &&
        pan?.pointerId === event.pointerId
      ) {
        viewportRef.current = {
          ...pan.initialViewport,
          x: pan.initialViewport.x + current.x - pan.initialPoint.x,
          y: pan.initialViewport.y + current.y - pan.initialPoint.y,
        };
        scheduleRender();
      }
    },
    [eraseAt, renderInteractions, scheduleRender],
  );

  const finishPointer = useCallback(
    (event: PointerEvent, wasCancelled: boolean) => {
      if (wasCancelled) {
        setStats((current) => ({
          ...current,
          pointerCancelCount: current.pointerCancelCount + 1,
        }));
      }

      if (
        modeRef.current === "inking" &&
        activePenPointerIdRef.current === event.pointerId
      ) {
        commitActiveStroke();
      } else if (
        modeRef.current === "erasing" &&
        activePenPointerIdRef.current === event.pointerId
      ) {
        activePenPointerIdRef.current = null;
        erasedStrokeIdsRef.current.clear();
        modeRef.current = "idle";
      } else if (
        modeRef.current === "selecting" &&
        activePenPointerIdRef.current === event.pointerId
      ) {
        activePenPointerIdRef.current = null;
        selectionStartRef.current = null;
        const completedSelection = selectionRef.current;

        if (
          completedSelection &&
          completedSelection.bounds.width >= MIN_SELECTION_SIZE &&
          completedSelection.bounds.height >= MIN_SELECTION_SIZE
        ) {
          setSelection(completedSelection);
        } else {
          selectionRef.current = null;
          setSelection(null);
        }

        modeRef.current = "idle";
        renderInteractions();
      } else {
        const objectTransform = objectTransformRef.current;

        if (
          modeRef.current === "objectTransform" &&
          objectTransform?.pointerId === event.pointerId
        ) {
          const updated = objectsRef.current.find(
            (canvasObject) =>
              canvasObject.id === objectTransform.initialObject.id,
          );

          if (updated) {
            historyRef.current.push({
              type: "object-update",
              before: objectTransform.initialObject,
              after: { ...updated },
            });
            redoRef.current = [];
            invalidateSnapshots();
            void saveCanvasObject(projectId, updated);
            queueRemoteSync(async () => {
              const saved = await saveRemoteObject(
                supabase,
                remoteContext,
                updated,
              );
              objectsRef.current = objectsRef.current.map((current) =>
                current.id === saved.id ? saved : current,
              );
              await saveCanvasObject(projectId, saved);
            });
          }

          objectTransformRef.current = null;
          modeRef.current = "idle";
        }
      }

      pointersRef.current.delete(event.pointerId);

      if (pinchRef.current) {
        const touches = Array.from(pointersRef.current.values()).filter(
          (pointer) => pointer.pointerType === "touch",
        );

        if (touches.length >= 2) {
          beginPinch();
        } else if (touches.length === 1 && toolRef.current === "hand") {
          beginPan(touches[0].id, touches[0].current);
        } else {
          pinchRef.current = null;
          modeRef.current = "idle";
        }
      } else if (panRef.current?.pointerId === event.pointerId) {
        panRef.current = null;
        modeRef.current = "idle";
      }
    },
    [
      beginPan,
      beginPinch,
      commitActiveStroke,
      invalidateSnapshots,
      projectId,
      queueRemoteSync,
      remoteContext,
      renderInteractions,
      supabase,
    ],
  );

  const applyHistoryCommand = useCallback(
    (command: HistoryCommand, forward: boolean) => {
      switch (command.type) {
        case "stroke-add":
          if (forward) {
            strokesRef.current = [...strokesRef.current, command.stroke];
            void saveStroke(projectId, command.stroke);
            queueRemoteSync(() =>
              saveRemoteStroke(
                supabase,
                remoteContext,
                command.stroke,
                strokesRef.current.length - 1,
              ),
            );
          } else {
            strokesRef.current = strokesRef.current.filter(
              (stroke) => stroke.id !== command.stroke.id,
            );
            void deleteStroke(command.stroke.id);
            queueStrokeDeletion(command.stroke.id);
          }
          break;
        case "stroke-delete":
          if (forward) {
            strokesRef.current = strokesRef.current.filter(
              (stroke) => stroke.id !== command.stroke.id,
            );
            void deleteStroke(command.stroke.id);
            queueStrokeDeletion(command.stroke.id);
          } else {
            const restored = [...strokesRef.current];
            restored.splice(command.index, 0, command.stroke);
            strokesRef.current = restored;
            void saveStroke(projectId, command.stroke);
            void clearSceneDeletion(projectId, "stroke", command.stroke.id);
            queueRemoteSync(() =>
              saveRemoteStroke(
                supabase,
                remoteContext,
                command.stroke,
                command.index,
              ),
            );
          }
          break;
        case "object-add":
          if (forward) {
            objectsRef.current = [...objectsRef.current, command.object];
            void saveCanvasObject(projectId, command.object);
            queueRemoteSync(async () => {
              const saved = await saveRemoteObject(
                supabase,
                remoteContext,
                command.object,
              );
              objectsRef.current = objectsRef.current.map((current) =>
                current.id === saved.id ? saved : current,
              );
              await saveCanvasObject(projectId, saved);
            });
          } else {
            objectsRef.current = objectsRef.current.filter(
              (canvasObject) => canvasObject.id !== command.object.id,
            );
            void deleteCanvasObject(command.object.id);
            queueObjectDeletion(command.object);
          }
          break;
        case "object-delete":
          if (forward) {
            objectsRef.current = objectsRef.current.filter(
              (canvasObject) => canvasObject.id !== command.object.id,
            );
            void deleteCanvasObject(command.object.id);
            queueObjectDeletion(command.object);
          } else {
            const restored = [...objectsRef.current];
            restored.splice(command.index, 0, command.object);
            objectsRef.current = restored;
            void saveCanvasObject(projectId, command.object);
            void clearSceneDeletion(projectId, "object", command.object.id);
            queueRemoteSync(async () => {
              const saved = await saveRemoteObject(
                supabase,
                remoteContext,
                command.object,
              );
              objectsRef.current = objectsRef.current.map((current) =>
                current.id === saved.id ? saved : current,
              );
              await saveCanvasObject(projectId, saved);
            });
          }
          break;
        case "object-update": {
          const nextObject = forward ? command.after : command.before;
          objectsRef.current = objectsRef.current.map((canvasObject) =>
            canvasObject.id === nextObject.id ? nextObject : canvasObject,
          );
          void saveCanvasObject(projectId, nextObject);
          queueRemoteSync(async () => {
            const saved = await saveRemoteObject(
              supabase,
              remoteContext,
              nextObject,
            );
            objectsRef.current = objectsRef.current.map((current) =>
              current.id === saved.id ? saved : current,
            );
            await saveCanvasObject(projectId, saved);
          });
          break;
        }
        default: {
          const exhaustiveCommand: never = command;
          throw new Error(`Unsupported history command: ${exhaustiveCommand}`);
        }
      }

      if (
        selectedObjectIdRef.current &&
        !objectsRef.current.some(
          (canvasObject) =>
            canvasObject.id === selectedObjectIdRef.current,
        )
      ) {
        selectedObjectIdRef.current = null;
        setSelectedObjectId(null);
      }

      invalidateSnapshots();
      scheduleRender();
    },
    [
      invalidateSnapshots,
      projectId,
      queueObjectDeletion,
      queueRemoteSync,
      queueStrokeDeletion,
      remoteContext,
      scheduleRender,
      supabase,
    ],
  );

  const undo = useCallback(() => {
    const command = historyRef.current.at(-1);

    if (!command) {
      return;
    }

    historyRef.current = historyRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, command];
    applyHistoryCommand(command, false);
  }, [applyHistoryCommand]);

  const redo = useCallback(() => {
    const command = redoRef.current.at(-1);

    if (!command) {
      return;
    }

    redoRef.current = redoRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current, command];
    applyHistoryCommand(command, true);
  }, [applyHistoryCommand]);

  const deleteSelectedObject = useCallback(() => {
    const objectId = selectedObjectIdRef.current;
    const index = objectsRef.current.findIndex(
      (canvasObject) => canvasObject.id === objectId,
    );

    if (index < 0) {
      return;
    }

    const canvasObject = objectsRef.current[index];
    objectsRef.current = objectsRef.current.filter(
      (candidate) => candidate.id !== canvasObject.id,
    );
    historyRef.current.push({
      type: "object-delete",
      object: canvasObject,
      index,
    });
    redoRef.current = [];
    selectedObjectIdRef.current = null;
    setSelectedObjectId(null);
    invalidateSnapshots();
    setStats((current) => ({ ...current, persistenceState: "saving" }));
    scheduleRender();

    void deleteCanvasObject(canvasObject.id).catch(() => {
        setStats((current) => ({ ...current, persistenceState: "error" }));
      });
    queueObjectDeletion(canvasObject);
  }, [
    invalidateSnapshots,
    queueObjectDeletion,
    scheduleRender,
  ]);

  const importImage = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file) {
        return;
      }

      setStats((current) => ({ ...current, persistenceState: "saving" }));

      try {
        const prepared = await prepareImportedImage(file);
        const maximumDisplayEdge = 820;
        const displayScale =
          maximumDisplayEdge / Math.max(prepared.width, prepared.height);
        const width = prepared.width * Math.min(1, displayScale);
        const height = prepared.height * Math.min(1, displayScale);
        const canvasObject: CanvasImageObject = {
          id: createUuid(),
          type: "image",
          x: (WORLD_WIDTH - width) / 2,
          y: (WORLD_HEIGHT - height) / 2,
          width,
          height,
          rotation: 0,
          zIndex:
            objectsRef.current.reduce(
              (highest, item) => Math.max(highest, item.zIndex),
              0,
            ) + 1,
          blob: prepared.blob,
          createdAt: Date.now(),
        };
        imageSourcesRef.current.set(canvasObject.id, prepared.source);
        objectsRef.current = [...objectsRef.current, canvasObject];
        historyRef.current.push({ type: "object-add", object: canvasObject });
        redoRef.current = [];
        invalidateSnapshots();
        selectedObjectIdRef.current = canvasObject.id;
        setSelectedObjectId(canvasObject.id);
        setTool("object");
        await saveCanvasObject(projectId, canvasObject);
        queueRemoteSync(async () => {
          const saved = await saveRemoteObject(
            supabase,
            remoteContext,
            canvasObject,
          );
          objectsRef.current = objectsRef.current.map((current) =>
            current.id === saved.id ? saved : current,
          );
          await saveCanvasObject(projectId, saved);
        });
        scheduleRender();
      } catch {
        setStats((current) => ({ ...current, persistenceState: "error" }));
      }
    },
    [
      invalidateSnapshots,
      projectId,
      queueRemoteSync,
      remoteContext,
      scheduleRender,
      supabase,
    ],
  );

  const prepareContext = useCallback(async () => {
    if (!selectionRef.current) {
      return;
    }

    setSnapshotState("preparing");

    try {
      const bundle = await renderSnapshotBundle({
        selection: selectionRef.current,
        strokes: strokesRef.current,
        objects: objectsRef.current,
        imageSources: imageSourcesRef.current,
        worldWidth: WORLD_WIDTH,
        worldHeight: WORLD_HEIGHT,
      });
      const nextSnapshots = {
        selectionUrl: URL.createObjectURL(bundle.selection),
        neighbourhoodUrl: URL.createObjectURL(bundle.neighbourhood),
        canvasUrl: URL.createObjectURL(bundle.canvas),
      };

      if (snapshotsRef.current) {
        Object.values(snapshotsRef.current).forEach((url) =>
          URL.revokeObjectURL(url),
        );
      }

      snapshotsRef.current = nextSnapshots;
      setSnapshots(nextSnapshots);
      setSnapshotState("ready");
    } catch {
      setSnapshotState("error");
    }
  }, []);

  const clearDocument = useCallback(() => {
    const tombstones = Promise.all([
      ...strokesRef.current.map((stroke) =>
        markSceneDeletion(projectId, "stroke", stroke.id),
      ),
      ...objectsRef.current.map((canvasObject) =>
        markSceneDeletion(projectId, "object", canvasObject.id),
      ),
    ]);
    strokesRef.current = [];
    objectsRef.current = [];
    historyRef.current = [];
    redoRef.current = [];
    imageSourcesRef.current.forEach((source) => source.close());
    imageSourcesRef.current.clear();
    selectionRef.current = null;
    selectedObjectIdRef.current = null;
    setSelection(null);
    setSelectedObjectId(null);
    setStressLoaded(false);
    invalidateSnapshots();

    setStats((current) => ({ ...current, persistenceState: "saving" }));
    scheduleRender();

    void Promise.all([
      clearStrokes(projectId),
      clearCanvasObjects(projectId),
    ])
      .then(() => {
        queueRemoteSync(async () => {
          await tombstones;
          await clearRemoteScene(supabase, remoteContext);
          await clearSceneDeletions(projectId);
        });
      })
      .catch(() => {
        setStats((current) => ({ ...current, persistenceState: "error" }));
      });
  }, [
    invalidateSnapshots,
    projectId,
    queueRemoteSync,
    remoteContext,
    scheduleRender,
    supabase,
  ]);

  const loadStressDocument = useCallback(() => {
    const generated: Stroke[] = [];
    const columns = 100;
    const rows = STRESS_STROKE_COUNT / columns;
    const cellWidth = WORLD_WIDTH / columns;
    const cellHeight = WORLD_HEIGHT / rows;

    for (let index = 0; index < STRESS_STROKE_COUNT; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const points: Point[] = [];

      for (
        let pointIndex = 0;
        pointIndex < STRESS_POINTS_PER_STROKE;
        pointIndex += 1
      ) {
        const progress = pointIndex / (STRESS_POINTS_PER_STROKE - 1);
        points.push({
          x: column * cellWidth + progress * cellWidth * 0.82,
          y:
            row * cellHeight +
            cellHeight * 0.5 +
            Math.sin(progress * Math.PI * 2 + row * 0.15) * cellHeight * 0.25,
          pressure: 0.3 + progress * 0.5,
          time: pointIndex,
        });
      }

      generated.push({
        id: `stress-${index}`,
        points,
        color: index % 8 === 0 ? "#716b63" : PEN_COLOR,
        width: 2.4,
        pressureEnabled: false,
        createdAt: index,
      });
    }

    strokesRef.current = generated;
    historyRef.current = [];
    redoRef.current = [];
    invalidateSnapshots();
    setStressLoaded(true);
    scheduleRender();
  }, [invalidateSnapshots, scheduleRender]);

  const handleToolChange = useCallback(
    (nextTool: Tool) => {
      setTool(nextTool);

      if (nextTool !== "object") {
        selectedObjectIdRef.current = null;
        setSelectedObjectId(null);
      }

      scheduleRender();
    },
    [scheduleRender],
  );

  return (
    <main className="prototype-shell">
      <header className="prototype-header">
        <div className="canvas-heading">
          <span className="canvas-back">{backLink}</span>
          <div>
            <p className="eyebrow">Phase 2 durable project</p>
            <h1>{projectTitle}</h1>
          </div>
        </div>
        <div className="target-badge">
          Private · local-first Supabase sync
        </div>
      </header>

      <section className="prototype-workspace">
        <CanvasToolbar
          brushSettings={brushSettings}
          onBrushSettingsChange={setBrushSettings}
          onFit={fitToScreen}
          onImport={() => fileInputRef.current?.click()}
          onRedo={redo}
          onToolChange={handleToolChange}
          onUndo={undo}
          tool={tool}
        />
        <input
          accept="image/*"
          className="visually-hidden"
          onChange={importImage}
          ref={fileInputRef}
          type="file"
        />

        <div
          className="canvas-surface"
          data-testid="canvas-surface"
          ref={surfaceRef}
        >
          <canvas className="canvas-layer" ref={sceneCanvasRef} />
          <canvas
            aria-label="Sketch canvas"
            className="canvas-layer canvas-input-layer"
            data-testid="input-canvas"
            onPointerCancel={(event) => {
              event.preventDefault();
              finishPointer(event.nativeEvent, true);
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => {
              event.preventDefault();
              finishPointer(event.nativeEvent, false);
            }}
            ref={interactionCanvasRef}
          />
          <div className="gesture-hint">
            Pencil uses the active tool · two fingers pan and zoom
          </div>
          {selection || selectedObjectId ? (
            <div className="contextual-actions">
              {selection ? (
                <button onClick={prepareContext} type="button">
                  Prepare context
                </button>
              ) : null}
              {selectedObjectId ? (
                <button
                  className="danger"
                  onClick={deleteSelectedObject}
                  type="button"
                >
                  Delete image
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <ContextPanel
          dpr={dpr}
          hasSelection={selection !== null}
          onClear={clearDocument}
          onDprChange={setDpr}
          onLoadStress={loadStressDocument}
          onPrepareContext={prepareContext}
          snapshotState={snapshotState}
          snapshots={snapshots}
          stats={stats}
          stressLoaded={stressLoaded}
        />
      </section>
    </main>
  );
}
