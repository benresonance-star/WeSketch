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

export type Stroke = {
  id: string;
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
};

export type PrototypeStats = {
  strokeCount: number;
  pointCount: number;
  pointerCancelCount: number;
  renderDurationMs: number;
  persistenceState: "loading" | "saved" | "saving" | "error";
};
