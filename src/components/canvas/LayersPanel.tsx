import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  X,
} from "lucide-react";

import styles from "@/components/canvas/LayersPanel.module.css";
import type { CanvasLayer } from "@/types/canvas";

type LayersPanelProps = {
  activeLayerId: string;
  layers: CanvasLayer[];
  onActivate: (id: string) => void;
  onAdd: () => void;
  onChange: (layer: CanvasLayer) => void;
  onClose: () => void;
  onMove: (id: string, direction: "up" | "down") => void;
};

export function LayersPanel({
  activeLayerId,
  layers,
  onActivate,
  onAdd,
  onChange,
  onClose,
  onMove,
}: LayersPanelProps) {
  const sortedLayers = [...layers].sort(
    (first, second) => second.order - first.order,
  );

  return (
    <section aria-label="Layers" className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Canvas stack</p>
          <strong>Layers</strong>
        </div>
        <div className={styles.headerActions}>
          <button aria-label="Add layer" onClick={onAdd} type="button">
            <Plus aria-hidden="true" />
          </button>
          <button aria-label="Close layers" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={styles.list}>
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
            <label>
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
