"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X } from "lucide-react";

import styles from "@/components/canvas/ObjectPropertiesPanel.module.css";
import type { CanvasImageObject, CanvasLayer } from "@/types/canvas";

const PANEL_WIDTH = 320;
const PANEL_HEIGHT_ESTIMATE = 420;

type ObjectPropertiesPanelProps = {
  canvasObject: CanvasImageObject;
  layers: CanvasLayer[];
  onChange: (next: CanvasImageObject) => void;
  onClose: () => void;
};

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function centeredPosition(): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: 24, y: 24 };
  }

  return {
    x: Math.max(16, (window.innerWidth - PANEL_WIDTH) / 2),
    y: Math.max(16, (window.innerHeight - PANEL_HEIGHT_ESTIMATE) / 2),
  };
}

export function ObjectPropertiesPanel({
  canvasObject,
  layers,
  onChange,
  onClose,
}: ObjectPropertiesPanelProps) {
  const [position, setPosition] = useState(centeredPosition);
  const dragRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const sortedLayers = [...layers].sort(
    (first, second) => second.order - first.order,
  );

  useEffect(() => {
    setPosition(centeredPosition());
  }, [canvasObject.id]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: position.x,
      startY: position.y,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const nextX = drag.startX + event.clientX - drag.originX;
    const nextY = drag.startY + event.clientY - drag.originY;
    const maxX = Math.max(16, window.innerWidth - 64);
    const maxY = Math.max(16, window.innerHeight - 64);
    setPosition({
      x: Math.min(maxX, Math.max(16, nextX)),
      y: Math.min(maxY, Math.max(16, nextY)),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already be released.
      }
    }
  };

  return (
    <section
      aria-label="Object properties"
      className={styles.panel}
      style={{ left: position.x, top: position.y }}
    >
      <header
        className={styles.header}
        onPointerCancel={endDrag}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <div>
          <p className="eyebrow">Selected object</p>
          <strong>Properties</strong>
        </div>
        <div className={styles.headerActions}>
          <button
            aria-label="Close object properties"
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <dl className={styles.meta}>
          <div>
            <dt>Type</dt>
            <dd>Image</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {Math.round(canvasObject.width)} × {Math.round(canvasObject.height)}
            </dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd>
              {Math.round(canvasObject.x)}, {Math.round(canvasObject.y)}
            </dd>
          </div>
          <div>
            <dt>Rotation</dt>
            <dd>{Math.round((canvasObject.rotation * 180) / Math.PI)}°</dd>
          </div>
          <div>
            <dt>Stack</dt>
            <dd>z-index {canvasObject.zIndex}</dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>
              {(canvasObject.mimeType ?? canvasObject.blob.type) || "image"} ·{" "}
              {formatBytes(canvasObject.blob.size)}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{new Date(canvasObject.createdAt).toLocaleString()}</dd>
          </div>
        </dl>

        <label className={styles.field}>
          <span>Layer</span>
          <select
            aria-label="Assign object layer"
            onChange={(event) =>
              onChange({ ...canvasObject, layerId: event.target.value })
            }
            value={canvasObject.layerId}
          >
            {sortedLayers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Opacity</span>
          <div className={styles.opacityRow}>
            <input
              aria-label="Object opacity"
              max={100}
              min={0}
              onChange={(event) =>
                onChange({
                  ...canvasObject,
                  opacity: Number(event.target.value) / 100,
                })
              }
              type="range"
              value={Math.round(canvasObject.opacity * 100)}
            />
            <output>{Math.round(canvasObject.opacity * 100)}%</output>
          </div>
        </label>
      </div>
    </section>
  );
}
