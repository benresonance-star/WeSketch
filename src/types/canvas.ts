import type { Point } from "@/lib/canvas/geometry";

export type Tool =
  | "pen"
  | "eraser"
  | "rectangle"
  | "lasso"
  | "object"
  | "hand";

export type BrushSettings = {
  color: string;
  size: number;
  pressureEnabled: boolean;
};

export type CanvasLayer = {
  id: string;
  name: string;
  order: number;
  opacity: number;
  visible: boolean;
  createdAt: number;
};

export type Stroke = {
  id: string;
  layerId: string;
  points: Point[];
  color: string;
  width: number;
  pressureEnabled?: boolean;
  createdAt: number;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasImageObject = Bounds & {
  id: string;
  layerId: string;
  type: "image";
  rotation: number;
  zIndex: number;
  blob: Blob;
  artifactId?: string;
  storagePath?: string;
  mimeType?: string;
  createdAt: number;
};

export type CanvasSelection =
  | {
      type: "rectangle";
      bounds: Bounds;
    }
  | {
      type: "lasso";
      bounds: Bounds;
      path: Point[];
    };

export type InteractionMode =
  | "idle"
  | "inking"
  | "erasing"
  | "selecting"
  | "objectTransform"
  | "viewport";

export type SnapshotPreview = {
  selectionUrl: string;
  neighbourhoodUrl: string;
  canvasUrl: string;
  contextSnapshotId?: string;
  selectionId?: string;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  selectionId?: string;
  selectionUrl?: string;
  generatedImageUrl?: string;
  artifactId?: string;
  generatedStoragePath?: string;
};

export type ImageGenerationQuality = "low" | "medium" | "high";
export type ImageGenerationSize =
  | "1024x1024"
  | "1536x1024"
  | "1024x1536";
export type ThemeMode = "light" | "dark";
export type SavedUiConfiguration = {
  id: string;
  name: string;
  themeMode: ThemeMode;
  canvasColor: string;
};

export type PrototypeStats = {
  strokeCount: number;
  pointCount: number;
  pointerCancelCount: number;
  renderDurationMs: number;
  persistenceState: "loading" | "saved" | "saving" | "error";
  persistenceError: string | null;
};
