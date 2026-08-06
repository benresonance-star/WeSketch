"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  Plus,
  SlidersHorizontal,
  Square,
  Unlink,
  X,
} from "lucide-react";

import styles from "@/components/canvas/LayersPanel.module.css";
import type { CanvasLayer } from "@/types/canvas";

type LayersPanelProps = {
  activeLayerId: string;
  layers: CanvasLayer[];
  maskEditingLayerId: string | null;
  onActivate: (id: string) => void;
  onAdd: () => void;
  onChange: (layer: CanvasLayer) => void;
  onClose: () => void;
  onMaskEditToggle: (id: string) => void;
  onMaskEnabledToggle: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
};

const INITIAL_POSITION = { x: 84, y: 88 };

export function LayersPanel({
  activeLayerId,
  layers,
  maskEditingLayerId,
  onActivate,
  onAdd,
  onChange,
  onClose,
  onMaskEditToggle,
  onMaskEnabledToggle,
  onMove,
}: LayersPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [position, setPosition] = useState(INITIAL_POSITION);
  const [isDetailedView, setIsDetailedView] = useState(false);
  const sortedLayers = [...layers].sort(
    (first, second) => second.order - first.order,
  );

  useLayoutEffect(() => {
    const list = listRef.current;
    const panel = panelRef.current;
    if (!list || !panel) {
      return;
    }

    const syncScrollbarSize = () => {
      const measuredSize = Math.max(0, list.offsetWidth - list.clientWidth);
      const scrollbarSize = measuredSize > 0 ? measuredSize : 12;
      panel.style.setProperty("--layers-scrollbar-size", `${scrollbarSize}px`);
    };

    syncScrollbarSize();

    const observer = new ResizeObserver(syncScrollbarSize);
    observer.observe(list);

    return () => observer.disconnect();
  }, [isDetailedView, sortedLayers.length]);

  const clampPosition = (x: number, y: number) => {
    const bounds = panelRef.current?.getBoundingClientRect();
    const width = bounds?.width ?? 240;
    const height = bounds?.height ?? 64;

    return {
      x: Math.min(Math.max(8, window.innerWidth - width - 8), Math.max(8, x)),
      y: Math.min(
        Math.max(8, window.innerHeight - Math.min(height, 64) - 8),
        Math.max(8, y),
      ),
    };
  };

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Safari can reject capture after a system cancellation.
    }
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: position.x,
      startY: position.y,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setPosition(
      clampPosition(
        drag.startX + event.clientX - drag.originX,
        drag.startY + event.clientY - drag.originY,
      ),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released after a system cancellation.
    }
  };

  return (
    <section
      aria-label="Layers"
      className={`${styles.panel} ${isDetailedView ? styles.detailed : ""}`}
      ref={panelRef}
      style={{ left: position.x, top: position.y }}
    >
      <header className={styles.header}>
        <button
          aria-label="Move layers panel"
          className={styles.dragHandle}
          onPointerCancel={endDrag}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          type="button"
        >
          <GripVertical aria-hidden="true" />
        </button>
        <strong className={styles.title}>Layers</strong>
        <div className={styles.headerActions}>
          <button aria-label="Add layer" onClick={onAdd} type="button">
            <Plus aria-hidden="true" />
          </button>
          <button
            aria-label={
              isDetailedView
                ? "Show simple layer list"
                : "Show layer opacity and order controls"
            }
            aria-pressed={isDetailedView}
            className={isDetailedView ? styles.detailToggleActive : undefined}
            onClick={() => setIsDetailedView((current) => !current)}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" />
          </button>
          <button aria-label="Close layers" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={styles.list} ref={listRef}>
        {sortedLayers.map((layer, index) => (
          <article
            className={`${styles.row} ${
              layer.id === activeLayerId ? styles.active : ""
            }`}
            key={layer.id}
            onClick={() => onActivate(layer.id)}
          >
            <div className={styles.rowMain}>
              <button
                aria-label={layer.visible ? "Hide layer" : "Show layer"}
                className={styles.visibility}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange({ ...layer, visible: !layer.visible });
                }}
                type="button"
              >
                {layer.visible ? (
                  <Eye aria-hidden="true" />
                ) : (
                  <EyeOff aria-hidden="true" />
                )}
              </button>
              <div className={styles.maskActions}>
                <button
                  aria-label={
                    maskEditingLayerId === layer.id
                      ? "Exit layer mask edit mode"
                      : "Edit layer mask"
                  }
                  aria-pressed={maskEditingLayerId === layer.id}
                  className={
                    maskEditingLayerId === layer.id
                      ? styles.maskEditActive
                      : undefined
                  }
                  disabled={!layer.visible}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMaskEditToggle(layer.id);
                  }}
                  title={
                    layer.visible
                      ? undefined
                      : "Show the layer before editing its mask"
                  }
                  type="button"
                >
                  <Square aria-hidden="true" />
                </button>
                {layer.hasMask ? (
                  <button
                    aria-label={
                      layer.maskEnabled
                        ? "Disable layer mask"
                        : "Enable layer mask"
                    }
                    aria-pressed={layer.maskEnabled}
                    className={layer.maskEnabled ? undefined : styles.maskEnableOff}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMaskEnabledToggle(layer.id);
                    }}
                    type="button"
                  >
                    {layer.maskEnabled ? (
                      <Link2 aria-hidden="true" />
                    ) : (
                      <Unlink aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </div>
              <input
                aria-label="Layer name"
                defaultValue={layer.name}
                key={`${layer.id}:${layer.name}`}
                maxLength={80}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== layer.name) {
                    onChange({ ...layer, name });
                  } else {
                    event.target.value = layer.name;
                  }
                }}
                onClick={(event) => event.stopPropagation()}
              />
              <div className={styles.orderActions}>
                <button
                  aria-label="Move layer up"
                  disabled={index === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(layer.id, "up");
                  }}
                  type="button"
                >
                  <ChevronUp aria-hidden="true" />
                </button>
                <button
                  aria-label="Move layer down"
                  disabled={index === sortedLayers.length - 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(layer.id, "down");
                  }}
                  type="button"
                >
                  <ChevronDown aria-hidden="true" />
                </button>
              </div>
            </div>
            <label className={styles.opacityRow}>
              <span>Opacity</span>
              <input
                max={100}
                min={0}
                onChange={(event) =>
                  onChange({
                    ...layer,
                    opacity: Number(event.target.value) / 100,
                  })
                }
                onClick={(event) => event.stopPropagation()}
                type="range"
                value={Math.round(layer.opacity * 100)}
              />
              <output>{Math.round(layer.opacity * 100)}%</output>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}
