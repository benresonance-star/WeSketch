import { PanelLeft, PanelTop, X } from "lucide-react";

import styles from "@/components/canvas/BrushPalette.module.css";
import type { BrushSettings } from "@/types/canvas";

export type BrushPaletteLayout = "standard" | "horizontal";

const SWATCHES = [
  "#242220",
  "#5f5a54",
  "#ffffff",
  "#c43d32",
  "#e37b2c",
  "#e2b93b",
  "#3f8d57",
  "#2f74c8",
  "#6a52ad",
  "#b84f8d",
];

const MASK_GREYSCALE_SWATCHES = Array.from({ length: 10 }, (_, index) => {
  const channel = Math.round((index / 9) * 255);
  const hex = channel.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
});

type BrushPaletteProps = {
  settings: BrushSettings;
  layout: BrushPaletteLayout;
  maskMode?: boolean;
  onChange: (settings: BrushSettings) => void;
  onLayoutChange: (layout: BrushPaletteLayout) => void;
  onClose: () => void;
};

export function BrushPalette({
  settings,
  layout,
  maskMode = false,
  onChange,
  onLayoutChange,
  onClose,
}: BrushPaletteProps) {
  const swatches = maskMode ? MASK_GREYSCALE_SWATCHES : SWATCHES;
  const normalizedColor = settings.color.toLowerCase();

  return (
    <section
      aria-label="Pen palette"
      className={`${styles.root} ${
        layout === "horizontal" ? styles.horizontal : styles.standard
      } brush-popover ${layout}`}
      data-testid="brush-palette"
    >
      <header className="brush-popover-header">
        <div>
          <p className="eyebrow">Brush</p>
          <h2>Studio Pen</h2>
        </div>
        <div className="brush-popover-actions">
          <div className="brush-layout-toggle" aria-label="Pen palette layout">
            <button
              aria-pressed={layout === "standard"}
              onClick={() => onLayoutChange("standard")}
              type="button"
            >
              <PanelLeft aria-hidden="true" />
              <span className={styles.visuallyHidden}>Standard palette</span>
            </button>
            <button
              aria-pressed={layout === "horizontal"}
              onClick={() => onLayoutChange("horizontal")}
              type="button"
            >
              <PanelTop aria-hidden="true" />
              <span className={styles.visuallyHidden}>Horizontal palette</span>
            </button>
          </div>
          <button
            aria-label="Close pen palette"
            className="brush-close-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="brush-preview" aria-hidden="true">
        <span
          style={{
            backgroundColor: settings.color,
            height: `${Math.min(24, settings.size)}px`,
          }}
        />
      </div>

      <div className="brush-control brush-size-control">
        <div className="brush-control-label">
          <label htmlFor="brush-size">Size</label>
          <output htmlFor="brush-size">{settings.size.toFixed(1)} px</output>
        </div>
        <input
          id="brush-size"
          max={40}
          min={1}
          onChange={(event) =>
            onChange({ ...settings, size: Number(event.target.value) })
          }
          step={0.5}
          type="range"
          value={settings.size}
        />
      </div>

      <div className="brush-control brush-colour-control">
        <div className="brush-control-label">
          <label htmlFor="brush-color">{maskMode ? "Mask" : "Colour"}</label>
          <span>{settings.color.toUpperCase()}</span>
        </div>
        <div className="brush-colour-row">
          <input
            aria-label={
              maskMode ? "Choose any mask greyscale" : "Choose any pen colour"
            }
            id="brush-color"
            onChange={(event) =>
              onChange({ ...settings, color: event.target.value })
            }
            type="color"
            value={settings.color}
          />
          <div
            className="brush-swatches"
            aria-label={maskMode ? "Mask greyscale steps" : "Quick colours"}
          >
            {swatches.map((color) => (
              <button
                aria-label={
                  maskMode
                    ? `Use mask density ${color}`
                    : `Use colour ${color}`
                }
                aria-pressed={normalizedColor === color}
                className="brush-swatch"
                key={color}
                onClick={() => onChange({ ...settings, color })}
                style={{ backgroundColor: color }}
                type="button"
              />
            ))}
          </div>
        </div>
      </div>

      <label className="brush-pressure-toggle">
        <span>
          <strong>
            {layout === "horizontal" ? "Pressure" : "Apple Pencil pressure"}
          </strong>
          <small>Light touch stays fine; firm strokes reach full size.</small>
        </span>
        <input
          checked={settings.pressureEnabled}
          onChange={(event) =>
            onChange({
              ...settings,
              pressureEnabled: event.target.checked,
            })
          }
          type="checkbox"
        />
      </label>
    </section>
  );
}
