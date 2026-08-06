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
import { Settings, SlidersHorizontal } from "lucide-react";

import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { ContextPanel } from "@/components/canvas/ContextPanel";
import { ObjectPropertiesPanel } from "@/components/canvas/ObjectPropertiesPanel";
import {
  distance,
  fitViewport,
  midpoint,
  screenToWorld,
  worldToScreen,
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
  generationLayerName,
  isImageGenerationIntent,
} from "@/lib/canvas/generation";
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
import { renderProjectThumbnail } from "@/lib/canvas/project-thumbnail";
import { persistSelectionContext } from "@/lib/canvas/selection-persistence";
import { renderSnapshotBundle } from "@/lib/canvas/snapshots";
import {
  clearCanvasObjects,
  clearSceneDeletion,
  clearSceneDeletions,
  clearStrokes,
  deleteCanvasObject,
  deleteStroke,
  loadCanvasObjects,
  loadCanvasLayers,
  loadSceneDeletions,
  loadStrokes,
  markSceneDeletion,
  saveCanvasObject,
  saveCanvasLayer,
  saveStroke,
  type SceneDeletion,
} from "@/lib/canvas/storage";
import {
  clearRemoteScene,
  deleteRemoteObject,
  deleteRemoteStroke,
  loadRemoteScene,
  saveProjectThumbnail,
  saveRemoteObject,
  saveRemoteLayer,
  saveRemoteStroke,
  type RemoteSceneContext,
} from "@/lib/canvas/remote-persistence";
import { createClient } from "@/lib/supabase/client";
import {
  deleteUiConfiguration as deleteRemoteUiConfiguration,
  loadUiConfigurations,
  saveUiConfiguration as saveRemoteUiConfiguration,
} from "@/lib/ui-configurations";
import { createUuid, isUuid } from "@/lib/uuid";
import type {
  BrushSettings,
  Bounds,
  CanvasImageObject,
  CanvasLayer,
  CanvasSelection,
  ConversationMessage,
  GenerationPlacement,
  ImageGenerationIntent,
  ImageGenerationQuality,
  ImageGenerationSize,
  InteractionMode,
  PrototypeStats,
  SavedUiConfiguration,
  SnapshotPreview,
  Stroke,
  ThemeMode,
  Tool,
} from "@/types/canvas";

const WORLD_WIDTH = 2048;
const WORLD_HEIGHT = 1536;
const DEFAULT_DPR = 1.5;
const MAX_DPR = 2;
const PEN_COLOR = "#242220";
const BRUSH_SETTINGS_STORAGE_KEY = "wesketch-brush-settings-v1";
const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  color: PEN_COLOR,
  size: 4,
  pressureEnabled: true,
};
const SELECTION_COLOR = "#2468f2";
const LIGHT_WORKSPACE_COLOR = "#e9e7e2";
const DARK_WORKSPACE_COLOR = "#191817";
const UI_CONFIGURATION_STORAGE_KEY = "wesketch-ui-configurations-v1";
const MIN_SELECTION_SIZE = 8;
const THUMBNAIL_SAVE_DELAY_MS = 4000;

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;

  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return target.isContentEditable;
}

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
  persistenceError: null,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown persistence error.";
}

function base64ImageToBlob(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  return new Blob([bytes], { type: "image/webp" });
}

function parseBounds(value: unknown): Bounds | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<Bounds>;
  if (
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height) ||
    candidate.width <= 0 ||
    candidate.height <= 0
  ) {
    return undefined;
  }
  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  };
}

function parseGenerationPlacement(value: unknown): GenerationPlacement | undefined {
  const bounds = parseBounds(value);
  const mode =
    value && typeof value === "object"
      ? (value as { mode?: unknown }).mode
      : undefined;
  return bounds && isImageGenerationIntent(mode)
    ? { ...bounds, mode }
    : undefined;
}

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

function revokeSnapshotUrls(snapshot: SnapshotPreview) {
  [
    snapshot.selectionUrl,
    snapshot.neighbourhoodUrl,
    snapshot.canvasUrl,
  ].forEach((url) => URL.revokeObjectURL(url));
}

function screenPointFromEvent(
  event: { clientX: number; clientY: number },
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
  layers: CanvasLayer[],
): CanvasImageObject | null {
  const layerOrder = new Map(
    layers.map((layer) => [layer.id, layer.order] as const),
  );
  const sorted = [...objects].sort((first, second) => {
    const orderDifference =
      (layerOrder.get(second.layerId) ?? 0) -
      (layerOrder.get(first.layerId) ?? 0);
    return orderDifference || second.zIndex - first.zIndex;
  });
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

function isSavedUiConfiguration(
  value: unknown,
): value is SavedUiConfiguration {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SavedUiConfiguration>;
  return (
    typeof candidate.id === "string" &&
    isUuid(candidate.id) &&
    typeof candidate.name === "string" &&
    (candidate.themeMode === "light" || candidate.themeMode === "dark") &&
    typeof candidate.canvasColor === "string" &&
    /^#[0-9a-f]{6}$/i.test(candidate.canvasColor)
  );
}

function persistUiConfigurations(
  configurations: SavedUiConfiguration[],
): void {
  try {
    localStorage.setItem(
      UI_CONFIGURATION_STORAGE_KEY,
      JSON.stringify(configurations),
    );
  } catch {
    // Configurations remain available for this session.
  }
}

function createDefaultLayer(canvasId: string): CanvasLayer {
  return {
    id: canvasId,
    name: "Layer 1",
    order: 0,
    opacity: 1,
    visible: true,
    createdAt: Date.now(),
  };
}

type PhaseOneCanvasProps = {
  backLink: ReactNode;
  canvasId: string;
  initialCanvasColor: string;
  projectId: string;
  projectTitle: string;
  userId: string;
};

export function PhaseOneCanvas({
  backLink,
  canvasId,
  initialCanvasColor,
  projectId,
  projectTitle,
  userId,
}: PhaseOneCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultLayerRef = useRef(createDefaultLayer(canvasId));
  const strokesRef = useRef<Stroke[]>([]);
  const objectsRef = useRef<CanvasImageObject[]>([]);
  const layersRef = useRef<CanvasLayer[]>([defaultLayerRef.current]);
  const activeLayerIdRef = useRef(canvasId);
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
  const generationAbortRef = useRef<AbortController | null>(null);
  const thumbnailTimerRef = useRef<number | null>(null);
  const thumbnailSaveRef = useRef<Promise<void>>(Promise.resolve());
  const snapshotsRef = useRef<SnapshotPreview | null>(null);
  const messageSelectionUrlsRef = useRef(new Set<string>());
  const brushSettingsRef = useRef(DEFAULT_BRUSH_SETTINGS);
  const canvasColorRef = useRef(initialCanvasColor);
  const workspaceColorRef = useRef(LIGHT_WORKSPACE_COLOR);
  const supabase = useMemo(() => createClient(), []);
  const remoteContext = useMemo<RemoteSceneContext>(
    () => ({ canvasId, projectId, userId }),
    [canvasId, projectId, userId],
  );
  const [tool, setTool] = useState<Tool>("pen");
  const toolRef = useRef<Tool>("pen");
  const [brushSettings, setBrushSettings] = useState(DEFAULT_BRUSH_SETTINGS);
  const [canvasColor, setCanvasColor] = useState(initialCanvasColor);
  const [layers, setLayers] = useState<CanvasLayer[]>([
    defaultLayerRef.current,
  ]);
  const [activeLayerId, setActiveLayerId] = useState(canvasId);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [savedUiConfigurations, setSavedUiConfigurations] = useState<
    SavedUiConfiguration[]
  >([]);
  const [dpr, setDpr] = useState(DEFAULT_DPR);
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isObjectPropertiesOpen, setIsObjectPropertiesOpen] = useState(false);
  const [propertiesObject, setPropertiesObject] =
    useState<CanvasImageObject | null>(null);
  const objectPropertiesAnchorRef = useRef<HTMLButtonElement>(null);
  const [snapshots, setSnapshots] = useState<SnapshotPreview | null>(null);
  const [snapshotState, setSnapshotState] = useState<
    "idle" | "preparing" | "ready" | "error"
  >("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [aiState, setAiState] = useState<
    "idle" | "streaming" | "generating"
  >("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [includeNeighbourhood, setIncludeNeighbourhood] = useState(false);
  const [includeCanvas, setIncludeCanvas] = useState(false);
  const [imageQuality, setImageQuality] =
    useState<ImageGenerationQuality>("low");
  const [imageSize, setImageSize] = useState<ImageGenerationSize>("1024x1024");
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stats, setStats] = useState<PrototypeStats>(INITIAL_STATS);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      messageSelectionUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      messageSelectionUrlsRef.current.clear();
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id")
        .eq("canvas_id", canvasId)
        .order("updated_at", { ascending: false })
        .limit(1);
      const latestConversation = conversations?.[0];

      if (!latestConversation || cancelled) {
        return;
      }

      const { data: storedMessages } = await supabase
        .from("messages")
        .select("id, role, content, selection_id, ai_run_id, parent_message_id")
        .eq("conversation_id", latestConversation.id)
        .order("created_at", { ascending: true });
      const selectionIds = Array.from(
        new Set(
          (storedMessages ?? [])
            .map((message) => message.selection_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const selectionUrls = new Map<string, string>();
      const selectionGeometry = new Map<
        string,
        { type: CanvasSelection["type"]; bounds: Bounds }
      >();
      const generatedArtifacts = new Map<
        string,
        {
          artifactId: string;
          storagePath: string;
          url: string;
          intent?: ImageGenerationIntent;
          placement?: GenerationPlacement;
        }
      >();
      const generationIntents = new Map<string, ImageGenerationIntent>();
      const latestContexts = new Map<
        string,
        {
          id: string;
          selectionPath: string;
          neighbourhoodPath: string;
          canvasPath: string;
        }
      >();
      let restoredSnapshots: SnapshotPreview | null = null;

      if (selectionIds.length > 0) {
        const { data: storedSelections } = await supabase
          .from("selections")
          .select("id, selection_type, bounds")
          .in("id", selectionIds);
        (storedSelections ?? []).forEach((storedSelection) => {
          const bounds = parseBounds(storedSelection.bounds);
          if (
            bounds &&
            (storedSelection.selection_type === "rectangle" ||
              storedSelection.selection_type === "lasso")
          ) {
            selectionGeometry.set(storedSelection.id, {
              type: storedSelection.selection_type,
              bounds,
            });
          }
        });
        const { data: contexts } = await supabase
          .from("context_snapshots")
          .select(
            "id, selection_id, selection_asset_path, neighbourhood_asset_path, canvas_asset_path, created_at",
          )
          .in("selection_id", selectionIds)
          .order("created_at", { ascending: false });
        const latestPaths = new Map<string, string>();
        (contexts ?? []).forEach((context) => {
          if (!latestPaths.has(context.selection_id)) {
            latestPaths.set(context.selection_id, context.selection_asset_path);
            latestContexts.set(context.selection_id, {
              id: context.id,
              selectionPath: context.selection_asset_path,
              neighbourhoodPath: context.neighbourhood_asset_path,
              canvasPath: context.canvas_asset_path,
            });
          }
        });
        await Promise.all(
          Array.from(latestPaths.entries()).map(async ([selectionId, path]) => {
            const { data: blob } = await supabase.storage
              .from("project-assets")
              .download(path);
            if (blob) {
              const url = URL.createObjectURL(blob);
              messageSelectionUrlsRef.current.add(url);
              selectionUrls.set(selectionId, url);
            }
          }),
        );
        const activeSelectionId = [...(storedMessages ?? [])]
          .reverse()
          .find(
            (message) => message.role === "user" && message.selection_id,
          )?.selection_id;
        const activeContext = activeSelectionId
          ? latestContexts.get(activeSelectionId)
          : undefined;
        if (activeSelectionId && activeContext) {
          const restored = await Promise.all(
            [
              activeContext.selectionPath,
              activeContext.neighbourhoodPath,
              activeContext.canvasPath,
            ].map((path) =>
              supabase.storage.from("project-assets").download(path),
            ),
          );
          if (restored.every(({ data }) => Boolean(data))) {
            restoredSnapshots = {
              selectionUrl: URL.createObjectURL(restored[0].data!),
              neighbourhoodUrl: URL.createObjectURL(restored[1].data!),
              canvasUrl: URL.createObjectURL(restored[2].data!),
              contextSnapshotId: activeContext.id,
              selectionId: activeSelectionId,
              selectionType: selectionGeometry.get(activeSelectionId)?.type,
              selectionBounds: selectionGeometry.get(activeSelectionId)?.bounds,
            };
          }
        }
      }
      const aiRunIds = Array.from(
        new Set(
          (storedMessages ?? [])
            .map((message) => message.ai_run_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      if (aiRunIds.length > 0) {
        const { data: aiRuns } = await supabase
          .from("ai_runs")
          .select("id, action, request_metadata")
          .in("id", aiRunIds);
        (aiRuns ?? []).forEach((aiRun) => {
          const metadata = aiRun.request_metadata as {
            intent?: unknown;
          } | null;
          const intent = isImageGenerationIntent(metadata?.intent)
            ? metadata.intent
            : aiRun.action === "transform"
              ? "in_place"
              : "beside";
          generationIntents.set(aiRun.id, intent);
        });
        const { data: artifacts } = await supabase
          .from("artifacts")
          .select("id, source_ai_run_id, storage_path, metadata")
          .eq("artifact_type", "generated_image")
          .in("source_ai_run_id", aiRunIds);
        await Promise.all(
          (artifacts ?? []).map(async (artifact) => {
            if (!artifact.source_ai_run_id) {
              return;
            }
            const url = `/api/project-assets?path=${encodeURIComponent(artifact.storage_path)}`;
            generatedArtifacts.set(artifact.source_ai_run_id, {
              artifactId: artifact.id,
              storagePath: artifact.storage_path,
              url,
              intent: isImageGenerationIntent(
                (artifact.metadata as { intent?: unknown } | null)?.intent,
              )
                ? (artifact.metadata as { intent: ImageGenerationIntent }).intent
                : generationIntents.get(artifact.source_ai_run_id),
              placement: parseGenerationPlacement(
                (artifact.metadata as { placement?: unknown } | null)?.placement,
              ),
            });
          }),
        );
      }

      if (!cancelled) {
        if (restoredSnapshots) {
          if (snapshotsRef.current) {
            revokeSnapshotUrls(snapshotsRef.current);
          }
          snapshotsRef.current = restoredSnapshots;
          setSnapshots(restoredSnapshots);
          setSnapshotState("ready");
        }
        setConversationId(latestConversation.id);
        const userGenerationIntents = new Map<string, ImageGenerationIntent>();
        (storedMessages ?? []).forEach((message) => {
          if (message.parent_message_id && message.ai_run_id) {
            const intent = generationIntents.get(message.ai_run_id);
            if (intent) {
              userGenerationIntents.set(message.parent_message_id, intent);
            }
          }
        });
        setMessages(
          (storedMessages ?? []).map((message) => ({
            id: message.id,
            role: message.role as ConversationMessage["role"],
            content: message.content,
            selectionId: message.selection_id ?? undefined,
            selectionUrl:
              message.role === "user" && message.selection_id
                ? selectionUrls.get(message.selection_id)
                : undefined,
            generatedImageUrl: message.ai_run_id
              ? generatedArtifacts.get(message.ai_run_id)?.url
              : undefined,
            artifactId: message.ai_run_id
              ? generatedArtifacts.get(message.ai_run_id)?.artifactId
              : undefined,
            generatedStoragePath: message.ai_run_id
              ? generatedArtifacts.get(message.ai_run_id)?.storagePath
              : undefined,
            generationIntent: message.ai_run_id
              ? generatedArtifacts.get(message.ai_run_id)?.intent ??
                generationIntents.get(message.ai_run_id)
              : userGenerationIntents.get(message.id),
            generationPlacement: message.ai_run_id
              ? generatedArtifacts.get(message.ai_run_id)?.placement
              : undefined,
            insertionStatus:
              message.ai_run_id &&
              generatedArtifacts.get(message.ai_run_id)?.intent === "in_place"
                ? "inserted"
                : undefined,
          })),
        );
      } else if (restoredSnapshots) {
        revokeSnapshotUrls(restoredSnapshots);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canvasId, supabase]);

  useEffect(() => {
    const urls = messageSelectionUrlsRef.current;
    return () => {
      generationAbortRef.current?.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const scheduleThumbnailSaveRef = useRef<(() => void) | null>(null);

  const queueRemoteSync = useCallback((operation: () => Promise<void>) => {
    pendingSyncCountRef.current += 1;
    setStats((current) => ({
      ...current,
      persistenceState: "saving",
      persistenceError: null,
    }));
    const next = syncChainRef.current.then(operation);
    syncChainRef.current = next.catch(() => undefined);
    void next
      .then(() => {
        pendingSyncCountRef.current -= 1;
        if (pendingSyncCountRef.current === 0) {
          setStats((current) => ({ ...current, persistenceState: "saved" }));
          scheduleThumbnailSaveRef.current?.();
        }
      })
      .catch((error: unknown) => {
        pendingSyncCountRef.current -= 1;
        setStats((current) => ({
          ...current,
          persistenceState: "error",
          persistenceError: errorMessage(error),
        }));
      });
  }, []);

  const reportLocalCacheError = useCallback((error: unknown) => {
    setStats((current) => ({
      ...current,
      persistenceError: `Cloud sync continues, but this device's offline cache failed: ${errorMessage(error)}`,
    }));
  }, []);

  const saveProjectThumbnailSnapshot = useCallback(async () => {
    const thumbnail = await renderProjectThumbnail({
      strokes: strokesRef.current,
      objects: objectsRef.current,
      layers: layersRef.current,
      imageSources: imageSourcesRef.current,
      backgroundColor: canvasColorRef.current,
    });
    await saveProjectThumbnail(supabase, remoteContext, thumbnail);
  }, [remoteContext, supabase]);

  const scheduleThumbnailSave = useCallback(() => {
    if (thumbnailTimerRef.current !== null) {
      window.clearTimeout(thumbnailTimerRef.current);
    }

    thumbnailTimerRef.current = window.setTimeout(() => {
      thumbnailTimerRef.current = null;
      thumbnailSaveRef.current = thumbnailSaveRef.current
        .catch(() => undefined)
        .then(() => saveProjectThumbnailSnapshot())
        .catch(() => undefined);
    }, THUMBNAIL_SAVE_DELAY_MS);
  }, [saveProjectThumbnailSnapshot]);

  scheduleThumbnailSaveRef.current = scheduleThumbnailSave;

  const invalidateSnapshots = useCallback(() => {
    if (snapshotsRef.current) {
      revokeSnapshotUrls(snapshotsRef.current);
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
        layers: layersRef.current,
        strokes: strokesRef.current,
        objects: objectsRef.current,
        imageSources: imageSourcesRef.current,
      },
      {
        workspace: workspaceColorRef.current,
        artboard: canvasColorRef.current,
      },
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
      const activeLayer = layersRef.current.find(
        (layer) => layer.id === activeLayerIdRef.current,
      );
      if (activeLayer?.visible && activeLayer.opacity > 0) {
        context.save();
        context.globalAlpha *= activeLayer.opacity;
        drawStroke(context, {
          id: "active",
          layerId: activeLayerIdRef.current,
          points: activePointsRef.current,
          color: brushSettingsRef.current.color,
          width: brushSettingsRef.current.size,
          pressureEnabled: brushSettingsRef.current.pressureEnabled,
          createdAt: 0,
        });
        context.restore();
      }
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
    const propertiesAnchor = objectPropertiesAnchorRef.current;

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

      if (propertiesAnchor) {
        const anchor = worldToScreen(
          {
            x: selectedObject.x,
            y: selectedObject.y + selectedObject.height,
          },
          viewport,
        );
        propertiesAnchor.dataset.visible = "true";
        propertiesAnchor.style.transform = `translate(${anchor.x}px, ${anchor.y}px) translate(-50%, -50%)`;
      }
    } else if (propertiesAnchor) {
      propertiesAnchor.dataset.visible = "false";
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

  const changeThemeMode = useCallback(
    (nextTheme: ThemeMode) => {
      setThemeMode(nextTheme);
      workspaceColorRef.current =
        nextTheme === "dark" ? DARK_WORKSPACE_COLOR : LIGHT_WORKSPACE_COLOR;
      document.documentElement.dataset.theme = nextTheme;
      try {
        localStorage.setItem("wesketch-theme-v1", nextTheme);
      } catch {
        // The selected theme still applies for this session.
      }
      scheduleRender();
    },
    [scheduleRender],
  );

  const changeCanvasColor = useCallback(
    (nextColor: string) => {
      canvasColorRef.current = nextColor;
      setCanvasColor(nextColor);
      invalidateSnapshots();
      scheduleRender();
      queueRemoteSync(async () => {
        const supabase = createClient();
        const { error } = await supabase
          .from("canvases")
          .update({ background: { color: nextColor } })
          .eq("id", canvasId);
        if (error) {
          throw error;
        }
      });
    },
    [
      canvasId,
      invalidateSnapshots,
      queueRemoteSync,
      scheduleRender,
    ],
  );

  const saveUiConfiguration = useCallback(
    (name: string): string | null => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return null;
      }
      const existing = savedUiConfigurations.find(
        (configuration) =>
          configuration.name.toLocaleLowerCase() ===
          trimmedName.toLocaleLowerCase(),
      );
      const configuration: SavedUiConfiguration = {
        id: existing?.id ?? createUuid(),
        name: trimmedName,
        themeMode,
        canvasColor,
      };
      const nextConfigurations = existing
        ? savedUiConfigurations.map((item) =>
            item.id === existing.id ? configuration : item,
          )
        : [...savedUiConfigurations, configuration];
      setSavedUiConfigurations(nextConfigurations);
      persistUiConfigurations(nextConfigurations);
      queueRemoteSync(() =>
        saveRemoteUiConfiguration(userId, configuration),
      );
      return configuration.id;
    },
    [
      canvasColor,
      queueRemoteSync,
      savedUiConfigurations,
      themeMode,
      userId,
    ],
  );

  const applyUiConfiguration = useCallback(
    (configuration: SavedUiConfiguration) => {
      changeThemeMode(configuration.themeMode);
      changeCanvasColor(configuration.canvasColor);
    },
    [changeCanvasColor, changeThemeMode],
  );

  const deleteUiConfiguration = useCallback(
    (id: string) => {
      const nextConfigurations = savedUiConfigurations.filter(
        (configuration) => configuration.id !== id,
      );
      setSavedUiConfigurations(nextConfigurations);
      persistUiConfigurations(nextConfigurations);
      queueRemoteSync(() => deleteRemoteUiConfiguration(id));
    },
    [queueRemoteSync, savedUiConfigurations],
  );

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

  const handleWheelZoom = useCallback(
    (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }

      event.preventDefault();

      const canvas = interactionCanvasRef.current;
      if (!canvas) {
        return;
      }

      const center = screenPointFromEvent(event, canvas);
      const currentViewport = viewportRef.current;
      // DOM_DELTA_LINE (1) and DOM_DELTA_PAGE (2) need scaling to feel like pixel wheels.
      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * canvas.clientHeight
            : event.deltaY;
      viewportRef.current = zoomViewport(
        currentViewport,
        center,
        center,
        Math.exp(-delta * 0.0015),
      );
      scheduleRender();
    },
    [scheduleRender],
  );

  const persistLayerChanges = useCallback(
    (nextLayers: CanvasLayer[], changedLayers: CanvasLayer[]) => {
      layersRef.current = nextLayers;
      setLayers(nextLayers);
      invalidateSnapshots();
      scheduleRender();
      changedLayers.forEach((layer) => {
        void saveCanvasLayer(projectId, layer).catch(reportLocalCacheError);
        queueRemoteSync(() =>
          saveRemoteLayer(supabase, remoteContext, layer),
        );
      });
    },
    [
      invalidateSnapshots,
      projectId,
      queueRemoteSync,
      reportLocalCacheError,
      remoteContext,
      scheduleRender,
      supabase,
    ],
  );

  const addLayer = useCallback(() => {
    const nextLayer: CanvasLayer = {
      id: createUuid(),
      name: `Layer ${layersRef.current.length + 1}`,
      order:
        layersRef.current.reduce(
          (highest, layer) => Math.max(highest, layer.order),
          -1,
        ) + 1,
      opacity: 1,
      visible: true,
      createdAt: Date.now(),
    };
    const nextLayers = [...layersRef.current, nextLayer];
    activeLayerIdRef.current = nextLayer.id;
    setActiveLayerId(nextLayer.id);
    persistLayerChanges(nextLayers, [nextLayer]);
  }, [persistLayerChanges]);

  const changeLayer = useCallback(
    (nextLayer: CanvasLayer) => {
      const nextLayers = layersRef.current.map((layer) =>
        layer.id === nextLayer.id ? nextLayer : layer,
      );
      if (
        !nextLayer.visible &&
        objectsRef.current.some(
          (canvasObject) =>
            canvasObject.id === selectedObjectIdRef.current &&
            canvasObject.layerId === nextLayer.id,
        )
      ) {
        selectedObjectIdRef.current = null;
        setSelectedObjectId(null);
        setIsObjectPropertiesOpen(false);
        setPropertiesObject(null);
      }
      persistLayerChanges(nextLayers, [nextLayer]);
    },
    [persistLayerChanges],
  );

  const moveLayer = useCallback(
    (id: string, direction: "up" | "down") => {
      const ordered = [...layersRef.current].sort(
        (first, second) => first.order - second.order,
      );
      const index = ordered.findIndex((layer) => layer.id === id);
      const targetIndex = direction === "up" ? index + 1 : index - 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
        return;
      }
      [ordered[index], ordered[targetIndex]] = [
        ordered[targetIndex],
        ordered[index],
      ];
      const nextLayers = ordered.map((layer, order) => ({ ...layer, order }));
      const changedIds = new Set([id, ordered[index].id]);
      persistLayerChanges(
        nextLayers,
        nextLayers.filter((layer) => changedIds.has(layer.id)),
      );
    },
    [persistLayerChanges],
  );

  const activateLayer = useCallback((id: string) => {
    activeLayerIdRef.current = id;
    setActiveLayerId(id);
  }, []);

  useEffect(() => {
    hasFittedRef.current = false;
    const frame = requestAnimationFrame(() => {
      const size = surfaceSizeRef.current;
      if (size.width > 1 && size.height > 1) {
        hasFittedRef.current = true;
        fitToScreen();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasId, fitToScreen]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    const nextTheme: ThemeMode =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    workspaceColorRef.current =
      nextTheme === "dark" ? DARK_WORKSPACE_COLOR : LIGHT_WORKSPACE_COLOR;
    const frame = requestAnimationFrame(() => {
      setThemeMode(nextTheme);
      scheduleRender();
    });
    return () => cancelAnimationFrame(frame);
  }, [scheduleRender]);

  useEffect(() => {
    let cancelled = false;
    let localConfigurations: SavedUiConfiguration[] = [];

    try {
      const stored = JSON.parse(
        localStorage.getItem(UI_CONFIGURATION_STORAGE_KEY) ?? "[]",
      ) as unknown;
      if (Array.isArray(stored)) {
        localConfigurations = stored.filter(isSavedUiConfiguration);
      }
    } catch {
      // Ignore malformed or unavailable browser storage.
    }

    const initializeConfigurations = async () => {
      try {
        const remoteConfigurations = await loadUiConfigurations(userId);
        if (cancelled) {
          return;
        }

        const remoteNames = new Set(
          remoteConfigurations.map((configuration) =>
            configuration.name.toLocaleLowerCase(),
          ),
        );
        const localOnlyConfigurations = localConfigurations.filter(
          (configuration) =>
            !remoteNames.has(configuration.name.toLocaleLowerCase()),
        );
        const mergedConfigurations = [
          ...remoteConfigurations,
          ...localOnlyConfigurations,
        ];
        setSavedUiConfigurations(mergedConfigurations);
        persistUiConfigurations(mergedConfigurations);

        try {
          await Promise.all(
            localOnlyConfigurations.map((configuration) =>
              saveRemoteUiConfiguration(userId, configuration),
            ),
          );
        } catch (error: unknown) {
          if (!cancelled) {
            setStats((current) => ({
              ...current,
              persistenceState: "error",
              persistenceError: `UI configuration migration: ${errorMessage(error)}`,
            }));
          }
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setSavedUiConfigurations(localConfigurations);
          setStats((current) => ({
            ...current,
            persistenceState: "error",
            persistenceError: `UI configurations: ${errorMessage(error)}`,
          }));
        }
      }
    };

    void initializeConfigurations();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
    const canvas = interactionCanvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheelZoom);
    };
  }, [handleWheelZoom]);

  useEffect(() => {
    let cancelled = false;
    const imageSources = imageSourcesRef.current;

    const applyScene = async (
      strokes: Stroke[],
      objects: CanvasImageObject[],
      sceneLayers: CanvasLayer[],
      objectLoadErrorCount = 0,
    ) => {
      const decodedResults = await Promise.allSettled(
        objects.map(async (canvasObject) => ({
          id: canvasObject.id,
          source: await decodeImageBlob(canvasObject.blob),
        })),
      );
      const decoded = decodedResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failedObjectIds = new Set(
        decodedResults.flatMap((result, index) =>
          result.status === "rejected" ? [objects[index].id] : [],
        ),
      );
      const failedImageCount = objectLoadErrorCount + failedObjectIds.size;

      if (cancelled) {
        decoded.forEach(({ source }) => source.close());
        return;
      }

      imageSources.forEach((source) => source.close());
      imageSources.clear();
      const availableLayers =
        sceneLayers.length > 0 ? sceneLayers : [createDefaultLayer(canvasId)];
      layersRef.current = availableLayers.sort(
        (first, second) => first.order - second.order,
      );
      setLayers([...layersRef.current]);
      if (
        !layersRef.current.some(
          (layer) => layer.id === activeLayerIdRef.current,
        )
      ) {
        const topLayer = layersRef.current[layersRef.current.length - 1];
        activeLayerIdRef.current = topLayer.id;
        setActiveLayerId(topLayer.id);
      }
      strokesRef.current = strokes.sort(
        (first, second) => first.createdAt - second.createdAt,
      );
      objectsRef.current = objects
        .filter((canvasObject) => !failedObjectIds.has(canvasObject.id))
        .sort((first, second) => first.zIndex - second.zIndex);
      decoded.forEach(({ id, source }) => {
        imageSourcesRef.current.set(id, source);
      });
      setStats((current) => ({
        ...current,
        persistenceState: "saved",
        persistenceError:
          failedImageCount > 0
            ? `Skipped ${failedImageCount} image${failedImageCount === 1 ? "" : "s"} that could not be restored. Strokes and layers are synced.`
            : null,
      }));
      scheduleRender();
    };

    void (async () => {
      let localStrokes: Stroke[] = [];
      let localObjects: CanvasImageObject[] = [];
      let localLayers: CanvasLayer[] = [];
      let deletions: SceneDeletion[] = [];
      let localError: unknown;

      try {
        const [storedStrokes, storedObjects, storedLayers, storedDeletions] =
          await Promise.all([
            loadStrokes(projectId),
            loadCanvasObjects(projectId),
            loadCanvasLayers(projectId),
            loadSceneDeletions(projectId),
          ]);
        localLayers =
          storedLayers.length > 0
            ? storedLayers
            : [createDefaultLayer(canvasId)];
        const localLayerIds = new Set(localLayers.map((layer) => layer.id));
        localStrokes = storedStrokes.map((stroke) =>
          ({
            ...stroke,
            id: isUuid(stroke.id) ? stroke.id : createUuid(),
            layerId: localLayerIds.has(stroke.layerId)
              ? stroke.layerId
              : canvasId,
          }),
        );
        localObjects = storedObjects.map((canvasObject) =>
          ({
            ...canvasObject,
            id: isUuid(canvasObject.id) ? canvasObject.id : createUuid(),
            layerId: localLayerIds.has(canvasObject.layerId)
              ? canvasObject.layerId
              : canvasId,
            ...(isUuid(canvasObject.id)
              ? {}
              : { artifactId: undefined, storagePath: undefined }),
          }),
        );
        deletions = storedDeletions.filter((deletion) =>
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
        await applyScene(localStrokes, localObjects, localLayers);
      } catch (error) {
        localError = error;
      }

      try {
        const remote = await loadRemoteScene(supabase, remoteContext);
        const layerMap = new Map(
          remote.layers.map((layer) => [layer.id, layer]),
        );
        localLayers.forEach((layer) => {
          if (!layerMap.has(layer.id)) {
            layerMap.set(layer.id, layer);
          }
        });
        const mergedLayers = Array.from(layerMap.values());
        const mergedLayerIds = new Set(mergedLayers.map((layer) => layer.id));
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
        localStrokes.forEach((stroke) => {
          if (!strokeMap.has(stroke.id)) {
            strokeMap.set(stroke.id, stroke);
          }
        });
        localObjects.forEach((canvasObject) => {
          if (!objectMap.has(canvasObject.id)) {
            objectMap.set(canvasObject.id, canvasObject);
          }
        });
        const mergedStrokes = Array.from(strokeMap.values()).map((stroke) => ({
          ...stroke,
          layerId: mergedLayerIds.has(stroke.layerId)
            ? stroke.layerId
            : canvasId,
        }));
        const mergedObjects = Array.from(objectMap.values()).map(
          (canvasObject) => ({
            ...canvasObject,
            layerId: mergedLayerIds.has(canvasObject.layerId)
              ? canvasObject.layerId
              : canvasId,
          }),
        );

        await applyScene(
          mergedStrokes,
          mergedObjects,
          mergedLayers,
          remote.objectLoadErrorCount,
        );
        scheduleThumbnailSave();
        try {
          await Promise.all([
            clearStrokes(projectId),
            clearCanvasObjects(projectId),
          ]);
          await Promise.all([
            ...mergedStrokes.map((stroke) => saveStroke(projectId, stroke)),
            ...mergedObjects.map((canvasObject) =>
              saveCanvasObject(projectId, canvasObject),
            ),
            ...mergedLayers.map((layer) => saveCanvasLayer(projectId, layer)),
          ]);
        } catch {
          // The private remote scene remains usable when the local cache fails.
        }

        const remoteStrokeIds = new Set(remote.strokes.map((stroke) => stroke.id));
        const remoteLayerIds = new Set(remote.layers.map((layer) => layer.id));
        const remoteObjectIds = new Set(
          remote.objects.map((canvasObject) => canvasObject.id),
        );
        localLayers
          .filter((layer) => !remoteLayerIds.has(layer.id))
          .forEach((layer) => {
            queueRemoteSync(() =>
              saveRemoteLayer(supabase, remoteContext, layer),
            );
          });
        localStrokes
          .filter((stroke) => !remoteStrokeIds.has(stroke.id))
          .forEach((stroke, index) => {
            queueRemoteSync(() =>
              saveRemoteStroke(supabase, remoteContext, stroke, index),
            );
          });
        localObjects
          .filter((canvasObject) => !remoteObjectIds.has(canvasObject.id))
          .forEach((canvasObject) => {
            queueRemoteSync(async () => {
              const saved = await saveRemoteObject(
                supabase,
                remoteContext,
                canvasObject,
              );
              objectsRef.current = objectsRef.current.map((current) =>
                current.id === saved.id ? saved : current,
              );
              void saveCanvasObject(projectId, saved).catch(
                reportLocalCacheError,
              );
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
            void clearSceneDeletion(
              projectId,
              deletion.kind,
              deletion.entityId,
            ).catch(reportLocalCacheError);
          });
        });
      } catch (error) {
        if (!cancelled) {
          const localDetail = localError
            ? ` Local cache: ${errorMessage(localError)}`
            : "";
          setStats((current) => ({
            ...current,
            persistenceState: "error",
            persistenceError: `${errorMessage(error)}${localDetail}`,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;

      if (thumbnailTimerRef.current !== null) {
        window.clearTimeout(thumbnailTimerRef.current);
      }

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      imageSources.forEach((source) => source.close());

      if (snapshotsRef.current) {
        revokeSnapshotUrls(snapshotsRef.current);
      }
    };
  }, [
    canvasId,
    projectId,
    queueRemoteSync,
    reportLocalCacheError,
    remoteContext,
    scheduleRender,
    scheduleThumbnailSave,
    supabase,
  ]);

  const queueStrokeDeletion = useCallback(
    (strokeId: string) => {
      const tombstone = markSceneDeletion(projectId, "stroke", strokeId);
      queueRemoteSync(async () => {
        await tombstone.catch(reportLocalCacheError);
        await deleteRemoteStroke(supabase, remoteContext, strokeId);
        void clearSceneDeletion(projectId, "stroke", strokeId).catch(
          reportLocalCacheError,
        );
      });
    },
    [
      projectId,
      queueRemoteSync,
      reportLocalCacheError,
      remoteContext,
      supabase,
    ],
  );

  const queueObjectDeletion = useCallback(
    (canvasObject: CanvasImageObject) => {
      const tombstone = markSceneDeletion(
        projectId,
        "object",
        canvasObject.id,
      );
      queueRemoteSync(async () => {
        await tombstone.catch(reportLocalCacheError);
        await deleteRemoteObject(supabase, remoteContext, canvasObject);
        void clearSceneDeletion(projectId, "object", canvasObject.id).catch(
          reportLocalCacheError,
        );
      });
    },
    [
      projectId,
      queueRemoteSync,
      remoteContext,
      reportLocalCacheError,
      supabase,
    ],
  );

  const clearPan = useCallback(() => {
    panRef.current = null;
    const canvas = interactionCanvasRef.current;
    if (canvas) {
      canvas.style.cursor = "";
    }
  }, []);

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
    clearPan();
    modeRef.current = "viewport";
  }, [clearPan]);

  const beginPan = useCallback(
    (pointerId: number, point: ScreenPoint) => {
      panRef.current = {
        pointerId,
        initialPoint: point,
        initialViewport: { ...viewportRef.current },
      };
      pinchRef.current = null;
      modeRef.current = "viewport";
      const canvas = interactionCanvasRef.current;
      if (canvas) {
        canvas.style.cursor = "grabbing";
      }
    },
    [],
  );

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
      clearPan();
      renderInteractions();
    },
    [clearPan, renderInteractions, stats.persistenceState],
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
          stroke.layerId !== activeLayerIdRef.current ||
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
          : hitTestObject(
              point,
              objectsRef.current.filter((canvasObject) =>
                layersRef.current.some(
                  (layer) =>
                    layer.id === canvasObject.layerId &&
                    layer.visible &&
                    layer.opacity > 0,
                ),
              ),
              layersRef.current,
            );

      if (!target) {
        selectedObjectIdRef.current = null;
        setSelectedObjectId(null);
        setIsObjectPropertiesOpen(false);
        setPropertiesObject(null);
        renderInteractions();
        return;
      }

      selectedObjectIdRef.current = target.id;
      setSelectedObjectId(target.id);
      activeLayerIdRef.current = target.layerId;
      setActiveLayerId(target.layerId);
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
      layerId: activeLayerIdRef.current,
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

    void saveStroke(projectId, stroke).catch(reportLocalCacheError);
    queueRemoteSync(() =>
      saveRemoteStroke(
        supabase,
        remoteContext,
        stroke,
        strokesRef.current.length - 1,
      ),
    );
    scheduleThumbnailSave();
  }, [
    invalidateSnapshots,
    projectId,
    queueRemoteSync,
    reportLocalCacheError,
    remoteContext,
    renderInteractions,
    scheduleRender,
    scheduleThumbnailSave,
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

      // Middle mouse button pans without changing the active tool.
      if (event.pointerType === "mouse" && event.button === 1) {
        beginPan(event.pointerId, current);
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
              void saveCanvasObject(projectId, saved).catch(
                reportLocalCacheError,
              );
            });
            setPropertiesObject((current) =>
              current?.id === updated.id ? { ...updated } : current,
            );
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
        clearPan();
        modeRef.current = "idle";
      }
    },
    [
      beginPan,
      beginPinch,
      clearPan,
      commitActiveStroke,
      invalidateSnapshots,
      projectId,
      queueRemoteSync,
      reportLocalCacheError,
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
              void saveCanvasObject(projectId, saved).catch(
                reportLocalCacheError,
              );
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
              void saveCanvasObject(projectId, saved).catch(
                reportLocalCacheError,
              );
            });
          }
          break;
        case "object-update": {
          const nextObject = forward ? command.after : command.before;
          objectsRef.current = objectsRef.current.map((canvasObject) =>
            canvasObject.id === nextObject.id ? nextObject : canvasObject,
          );
          if (selectedObjectIdRef.current === nextObject.id) {
            activeLayerIdRef.current = nextObject.layerId;
            setActiveLayerId(nextObject.layerId);
          }
          setPropertiesObject((current) =>
            current?.id === nextObject.id ? { ...nextObject } : current,
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
            void saveCanvasObject(projectId, saved).catch(
              reportLocalCacheError,
            );
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
        setIsObjectPropertiesOpen(false);
        setPropertiesObject(null);
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
      reportLocalCacheError,
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (event.key.toLowerCase() !== "z") {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        redo();
        return;
      }

      undo();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo]);

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
    setIsObjectPropertiesOpen(false);
    setPropertiesObject(null);
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

  const openObjectProperties = useCallback(() => {
    const canvasObject = objectsRef.current.find(
      (candidate) => candidate.id === selectedObjectIdRef.current,
    );
    if (!canvasObject) {
      return;
    }
    setPropertiesObject({ ...canvasObject });
    setIsObjectPropertiesOpen(true);
  }, []);

  const updateSelectedObjectProperties = useCallback(
    (nextObject: CanvasImageObject) => {
      const before = objectsRef.current.find(
        (candidate) => candidate.id === nextObject.id,
      );
      if (!before) {
        return;
      }

      const after: CanvasImageObject = {
        ...nextObject,
        opacity: Math.min(1, Math.max(0, nextObject.opacity)),
      };

      if (
        before.layerId === after.layerId &&
        before.opacity === after.opacity &&
        before.x === after.x &&
        before.y === after.y &&
        before.width === after.width &&
        before.height === after.height
      ) {
        setPropertiesObject(after);
        return;
      }

      objectsRef.current = objectsRef.current.map((candidate) =>
        candidate.id === after.id ? after : candidate,
      );
      historyRef.current.push({ type: "object-update", before, after });
      redoRef.current = [];
      if (after.layerId !== activeLayerIdRef.current) {
        activeLayerIdRef.current = after.layerId;
        setActiveLayerId(after.layerId);
      }
      setPropertiesObject(after);
      invalidateSnapshots();
      setStats((current) => ({ ...current, persistenceState: "saving" }));
      scheduleRender();
      void saveCanvasObject(projectId, after).catch(reportLocalCacheError);
      queueRemoteSync(async () => {
        const saved = await saveRemoteObject(supabase, remoteContext, after);
        objectsRef.current = objectsRef.current.map((current) =>
          current.id === saved.id ? saved : current,
        );
        setPropertiesObject((current) =>
          current?.id === saved.id ? { ...saved } : current,
        );
        void saveCanvasObject(projectId, saved).catch(reportLocalCacheError);
      });
    },
    [
      invalidateSnapshots,
      projectId,
      queueRemoteSync,
      reportLocalCacheError,
      remoteContext,
      scheduleRender,
      supabase,
    ],
  );

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
          layerId: activeLayerIdRef.current,
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
          opacity: 1,
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
        void saveCanvasObject(projectId, canvasObject).catch(
          reportLocalCacheError,
        );
        queueRemoteSync(async () => {
          const saved = await saveRemoteObject(
            supabase,
            remoteContext,
            canvasObject,
          );
          objectsRef.current = objectsRef.current.map((current) =>
            current.id === saved.id ? saved : current,
          );
          void saveCanvasObject(projectId, saved).catch(reportLocalCacheError);
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
      reportLocalCacheError,
      remoteContext,
      scheduleRender,
      supabase,
    ],
  );

  const prepareContext = useCallback(async () => {
    const currentSelection = selectionRef.current;

    if (!currentSelection) {
      return;
    }

    setSnapshotState("preparing");

    try {
      const bundle = await renderSnapshotBundle({
        selection: currentSelection,
        layers: layersRef.current,
        strokes: strokesRef.current,
        objects: objectsRef.current,
        imageSources: imageSourcesRef.current,
        worldWidth: WORLD_WIDTH,
        worldHeight: WORLD_HEIGHT,
        backgroundColor: canvasColorRef.current,
      });
      const persisted = await persistSelectionContext(
        supabase,
        remoteContext,
        currentSelection,
        bundle,
        `${Date.now().toString(36)}:${strokesRef.current.length}:${objectsRef.current.length}:${layersRef.current
          .map(
            (layer) =>
              `${layer.id}:${layer.order}:${layer.visible ? 1 : 0}:${layer.opacity}`,
          )
          .join(",")}`,
      );
      const nextSnapshots = {
        selectionUrl: URL.createObjectURL(bundle.selection),
        neighbourhoodUrl: URL.createObjectURL(bundle.neighbourhood),
        canvasUrl: URL.createObjectURL(bundle.canvas),
        contextSnapshotId: persisted.id,
        selectionId: persisted.selectionId,
        selectionType: currentSelection.type,
        selectionBounds: { ...currentSelection.bounds },
      };

      if (snapshotsRef.current) {
        revokeSnapshotUrls(snapshotsRef.current);
      }

      snapshotsRef.current = nextSnapshots;
      setSnapshots(nextSnapshots);
      setSnapshotState("ready");
    } catch {
      setSnapshotState("error");
    }
  }, [remoteContext, supabase]);

  const sendPrompt = useCallback(async () => {
    const contextSnapshotId = snapshotsRef.current?.contextSnapshotId;
    const selectionId = snapshotsRef.current?.selectionId;
    const trimmedPrompt = prompt.trim();

    if (!contextSnapshotId || !selectionId || !trimmedPrompt || aiState === "streaming") {
      return;
    }

    let messageSelectionUrl: string | undefined;
    const currentSelectionUrl = snapshotsRef.current?.selectionUrl;
    if (currentSelectionUrl) {
      try {
        const selectionBlob = await fetch(currentSelectionUrl).then((response) =>
          response.blob(),
        );
        messageSelectionUrl = URL.createObjectURL(selectionBlob);
        messageSelectionUrlsRef.current.add(messageSelectionUrl);
      } catch {
        // The durable thumbnail will be restored from private storage on reload.
      }
    }

    const userMessage: ConversationMessage = {
      id: createUuid(),
      role: "user",
      content: trimmedPrompt,
      selectionId,
      selectionUrl: messageSelectionUrl,
    };
    const assistantMessage: ConversationMessage = {
      id: createUuid(),
      role: "assistant",
      content: "",
      selectionId,
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setPrompt("");
    setAiError(null);
    setAiState("streaming");

    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          canvasId,
          selectionId,
          contextSnapshotId,
          conversationId,
          prompt: trimmedPrompt,
          includeNeighbourhood,
          includeCanvas,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `AI request failed (${response.status}).`);
      }

      const nextConversationId = response.headers.get("x-conversation-id");
      if (nextConversationId) {
        setConversationId(nextConversationId);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("AI response stream was unavailable.");
      }

      const decoder = new TextDecoder();
      let completeText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          completeText += decoder.decode();
          break;
        }
        completeText += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: completeText }
              : message,
          ),
        );
      }

      if (!completeText.trim()) {
        throw new Error("The AI returned an empty response.");
      }
    } catch (error) {
      setMessages((current) =>
        current.filter((message) => message.id !== assistantMessage.id),
      );
      setAiError(errorMessage(error));
    } finally {
      setAiState("idle");
    }
  }, [
    aiState,
    canvasId,
    conversationId,
    includeCanvas,
    includeNeighbourhood,
    projectId,
    prompt,
  ]);

  const addGeneratedImageToCanvas = useCallback(
    async (message: ConversationMessage): Promise<boolean> => {
      if (
        !message.generatedImageUrl ||
        !message.artifactId ||
        !message.generatedStoragePath
      ) {
        setAiError("This generated image is missing its saved artifact details.");
        return false;
      }

      try {
        const blob = await fetch(message.generatedImageUrl).then((response) =>
          response.blob(),
        );
        const source = await decodeImageBlob(blob);
        const inPlace = message.generationIntent === "in_place";
        const placement = message.generationPlacement;
        if (inPlace && placement?.mode !== "in_place") {
          source.close();
          throw new Error("This generation is missing its in-place selection bounds.");
        }

        let layerId = activeLayerIdRef.current;
        let generatedLayerId = message.generatedLayerId;
        if (inPlace) {
          const existingLayer = generatedLayerId
            ? layersRef.current.find((layer) => layer.id === generatedLayerId)
            : undefined;
          if (existingLayer) {
            layerId = existingLayer.id;
          } else {
            const generationLayer: CanvasLayer = {
              id: createUuid(),
              name: generationLayerName(layersRef.current),
              order:
                layersRef.current.reduce(
                  (highest, layer) => Math.max(highest, layer.order),
                  -1,
                ) + 1,
              opacity: 1,
              visible: true,
              createdAt: Date.now(),
            };
            generatedLayerId = generationLayer.id;
            layerId = generationLayer.id;
            persistLayerChanges(
              [...layersRef.current, generationLayer],
              [generationLayer],
            );
            setMessages((current) =>
              current.map((currentMessage) =>
                currentMessage.id === message.id
                  ? { ...currentMessage, generatedLayerId }
                  : currentMessage,
              ),
            );
          }
        }

        const maximumEdge = 720;
        const scale = Math.min(
          1,
          maximumEdge / Math.max(source.width, source.height),
        );
        const adjacentWidth = source.width * scale;
        const adjacentHeight = source.height * scale;
        const activeBounds = selectionRef.current?.bounds;
        const proposedX = activeBounds
          ? activeBounds.x + activeBounds.width + 48
          : (WORLD_WIDTH - adjacentWidth) / 2;
        const canvasObject: CanvasImageObject = {
          id: createUuid(),
          layerId,
          type: "image",
          x:
            inPlace && placement
              ? placement.x
              : Math.max(0, Math.min(WORLD_WIDTH - adjacentWidth, proposedX)),
          y:
            inPlace && placement
              ? placement.y
              : Math.max(
                  0,
                  Math.min(
                    WORLD_HEIGHT - adjacentHeight,
                    activeBounds?.y ?? (WORLD_HEIGHT - adjacentHeight) / 2,
                  ),
                ),
          width: inPlace && placement ? placement.width : adjacentWidth,
          height: inPlace && placement ? placement.height : adjacentHeight,
          rotation: 0,
          zIndex:
            objectsRef.current.reduce(
              (highest, item) => Math.max(highest, item.zIndex),
              0,
            ) + 1,
          opacity: 1,
          blob,
          artifactId: message.artifactId,
          storagePath: message.generatedStoragePath,
          mimeType: "image/webp",
          createdAt: Date.now(),
        };

        imageSourcesRef.current.set(canvasObject.id, source);
        objectsRef.current = [...objectsRef.current, canvasObject];
        historyRef.current.push({ type: "object-add", object: canvasObject });
        redoRef.current = [];
        if (!inPlace) {
          selectedObjectIdRef.current = canvasObject.id;
          setSelectedObjectId(canvasObject.id);
          setTool("object");
        }
        setAiError(null);
        invalidateSnapshots();
        void saveCanvasObject(projectId, canvasObject).catch(
          reportLocalCacheError,
        );
        queueRemoteSync(async () => {
          const saved = await saveRemoteObject(
            supabase,
            remoteContext,
            canvasObject,
          );
          objectsRef.current = objectsRef.current.map((current) =>
            current.id === saved.id ? saved : current,
          );
          void saveCanvasObject(projectId, saved).catch(reportLocalCacheError);
        });
        scheduleRender();
        if (inPlace) {
          setMessages((current) =>
            current.map((currentMessage) =>
              currentMessage.id === message.id
                ? {
                    ...currentMessage,
                    insertionStatus: "inserted",
                    generatedLayerId,
                  }
                : currentMessage,
            ),
          );
        }
        return true;
      } catch (error) {
        setAiError(errorMessage(error));
        if (message.generationIntent === "in_place") {
          setMessages((current) =>
            current.map((currentMessage) =>
              currentMessage.id === message.id
                ? { ...currentMessage, insertionStatus: "failed" }
                : currentMessage,
            ),
          );
        }
        return false;
      }
    },
    [
      invalidateSnapshots,
      persistLayerChanges,
      projectId,
      queueRemoteSync,
      reportLocalCacheError,
      remoteContext,
      scheduleRender,
      supabase,
    ],
  );

  const generateImage = useCallback(async (intent: ImageGenerationIntent) => {
    const contextSnapshotId = snapshotsRef.current?.contextSnapshotId;
    const selectionId = snapshotsRef.current?.selectionId;
    const trimmedPrompt = prompt.trim();
    if (!contextSnapshotId || !selectionId || !trimmedPrompt || aiState !== "idle") {
      return;
    }
    if (
      intent === "in_place" &&
      snapshotsRef.current?.selectionType !== "rectangle"
    ) {
      setAiError("In-place generation currently requires a rectangular selection.");
      return;
    }

    let messageSelectionUrl: string | undefined;
    const currentSelectionUrl = snapshotsRef.current?.selectionUrl;
    if (currentSelectionUrl) {
      try {
        const selectionBlob = await fetch(currentSelectionUrl).then((response) =>
          response.blob(),
        );
        messageSelectionUrl = URL.createObjectURL(selectionBlob);
        messageSelectionUrlsRef.current.add(messageSelectionUrl);
      } catch {
        // The durable thumbnail will be restored from private storage on reload.
      }
    }

    const userMessage: ConversationMessage = {
      id: createUuid(),
      role: "user",
      content: trimmedPrompt,
      selectionId,
      selectionUrl: messageSelectionUrl,
      generationIntent: intent,
    };
    setMessages((current) => [
      ...current,
      userMessage,
    ]);
    setPrompt("");
    setAiError(null);
    setAiState("generating");
    const abortController = new AbortController();
    generationAbortRef.current = abortController;

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          canvasId,
          selectionId,
          contextSnapshotId,
          conversationId,
          prompt: trimmedPrompt,
          includeNeighbourhood,
          includeCanvas,
          imageQuality,
          imageSize,
          intent,
        }),
        signal: abortController.signal,
      });
      const data = (await response.json()) as {
        error?: string;
        conversationId?: string;
        messageId?: string;
        artifactId?: string;
        storagePath?: string;
        imageBase64?: string;
        text?: string;
        intent?: ImageGenerationIntent;
        placement?: GenerationPlacement;
      };
      if (!response.ok || !data.imageBase64) {
        throw new Error(data.error ?? `Image generation failed (${response.status}).`);
      }

      if (data.conversationId) {
        setConversationId(data.conversationId);
      }
      const generatedImageUrl = URL.createObjectURL(
        base64ImageToBlob(data.imageBase64),
      );
      messageSelectionUrlsRef.current.add(generatedImageUrl);
      const assistantMessage: ConversationMessage = {
        id: data.messageId ?? createUuid(),
        role: "assistant",
        content: data.text ?? "Generated one visual alternative.",
        selectionId,
        generatedImageUrl,
        artifactId: data.artifactId,
        generatedStoragePath: data.storagePath,
        generationIntent: data.intent ?? intent,
        generationPlacement: data.placement,
        insertionStatus: intent === "in_place" ? "pending" : undefined,
      };
      setMessages((current) => [...current, assistantMessage]);
      if (intent === "in_place") {
        await addGeneratedImageToCanvas(assistantMessage);
      }
    } catch (error) {
      setAiError(
        abortController.signal.aborted
          ? "Image generation cancelled."
          : errorMessage(error),
      );
    } finally {
      if (generationAbortRef.current === abortController) {
        generationAbortRef.current = null;
      }
      setAiState("idle");
    }
  }, [
    aiState,
    canvasId,
    conversationId,
    includeCanvas,
    includeNeighbourhood,
    imageQuality,
    imageSize,
    addGeneratedImageToCanvas,
    projectId,
    prompt,
  ]);

  const cancelImageGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
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
    setIsObjectPropertiesOpen(false);
    setPropertiesObject(null);
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

  const handleToolChange = useCallback(
    (nextTool: Tool) => {
      setTool(nextTool);

      if (nextTool !== "object") {
        selectedObjectIdRef.current = null;
        setSelectedObjectId(null);
        setIsObjectPropertiesOpen(false);
        setPropertiesObject(null);
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
          <h1>{projectTitle}</h1>
        </div>
        <div className="project-header-actions">
          <div className="target-badge">
            Private · local-first Supabase sync
          </div>
          <button
            aria-expanded={isSettingsOpen}
            aria-label="Project settings"
            className="project-settings-button"
            onClick={() => {
              if (!isSettingsOpen) {
                setIsAgentPanelOpen(true);
              }
              setIsSettingsOpen((current) => !current);
            }}
            type="button"
          >
            <Settings aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <section
        className={`prototype-workspace ${
          isAgentPanelOpen ? "agent-panel-open" : "agent-panel-collapsed"
        }`}
      >
        <CanvasToolbar
          activeLayerId={activeLayerId}
          brushSettings={brushSettings}
          isAgentPanelOpen={isAgentPanelOpen}
          layers={layers}
          onBrushSettingsChange={setBrushSettings}
          onFit={fitToScreen}
          onImport={() => fileInputRef.current?.click()}
          onLayerActivate={activateLayer}
          onLayerAdd={addLayer}
          onLayerChange={changeLayer}
          onLayerMove={moveLayer}
          onRedo={redo}
          onToggleAgentPanel={() =>
            setIsAgentPanelOpen((current) => !current)
          }
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
            data-tool={tool}
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
            onAuxClick={(event) => {
              // Prevent middle-click autoscroll / paste gestures on desktop.
              event.preventDefault();
            }}
            ref={interactionCanvasRef}
          />
          <div className="gesture-hint">
            Pencil uses the active tool · two fingers or scroll to zoom · middle
            mouse to pan
          </div>
          <button
            aria-label="Open object properties"
            className="object-properties-anchor"
            onClick={(event) => {
              event.stopPropagation();
              openObjectProperties();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            ref={objectPropertiesAnchorRef}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" />
          </button>
          {selectedObjectId ? (
            <div className="contextual-actions">
              <button
                className="danger"
                onClick={deleteSelectedObject}
                type="button"
              >
                Delete image
              </button>
            </div>
          ) : null}
        </div>

        {isObjectPropertiesOpen && propertiesObject ? (
          <ObjectPropertiesPanel
            canvasObject={propertiesObject}
            layers={layers}
            onChange={updateSelectedObjectProperties}
            onClose={() => {
              setIsObjectPropertiesOpen(false);
              setPropertiesObject(null);
            }}
          />
        ) : null}

        <div
          aria-hidden={!isAgentPanelOpen}
          className="agent-panel-shell"
          inert={!isAgentPanelOpen ? true : undefined}
        >
          <ContextPanel
            aiError={aiError}
            aiState={aiState}
            canvasColor={canvasColor}
            dpr={dpr}
            hasSelection={selection !== null}
            imageQuality={imageQuality}
            imageSize={imageSize}
            includeCanvas={includeCanvas}
            includeNeighbourhood={includeNeighbourhood}
            isSettingsOpen={isSettingsOpen}
            messages={messages}
            onAddGeneratedImage={addGeneratedImageToCanvas}
            onApplyUiConfiguration={applyUiConfiguration}
            onCancelGeneration={cancelImageGeneration}
            onCanvasColorChange={changeCanvasColor}
            onClear={clearDocument}
            onDprChange={setDpr}
            onDeleteUiConfiguration={deleteUiConfiguration}
            onIncludeCanvasChange={setIncludeCanvas}
            onIncludeNeighbourhoodChange={setIncludeNeighbourhood}
            onImageQualityChange={setImageQuality}
            onImageSizeChange={setImageSize}
            onGenerateImage={generateImage}
            onPrepareContext={prepareContext}
            onPromptChange={setPrompt}
            onSaveUiConfiguration={saveUiConfiguration}
            onSendPrompt={sendPrompt}
            onSettingsClose={() => setIsSettingsOpen(false)}
            onThemeModeChange={changeThemeMode}
            prompt={prompt}
            savedUiConfigurations={savedUiConfigurations}
            snapshotState={snapshotState}
            snapshots={snapshots}
            stats={stats}
            themeMode={themeMode}
          />
        </div>
      </section>
    </main>
  );
}
