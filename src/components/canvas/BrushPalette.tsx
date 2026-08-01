import type { BrushSettings } from "@/types/canvas";

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

type BrushPaletteProps = {
  settings: BrushSettings;
  onChange: (settings: BrushSettings) => void;
  onClose: () => void;
};

export function BrushPalette({
  settings,
  onChange,
  onClose,
}: BrushPaletteProps) {
  return (
    <section
      aria-label="Pen palette"
      className="brush-popover"
      data-testid="brush-palette"
    >
      <header className="brush-popover-header">
        <div>
          <p className="eyebrow">Brush</p>
          <h2>Studio Pen</h2>
        </div>
        <button aria-label="Close pen palette" onClick={onClose} type="button">
          ×
        </button>
      </header>

      <div className="brush-preview" aria-hidden="true">
        <span
          style={{
            backgroundColor: settings.color,
            height: `${Math.min(24, settings.size)}px`,
          }}
        />
      </div>

      <div className="brush-control">
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

      <div className="brush-control">
        <div className="brush-control-label">
          <label htmlFor="brush-color">Colour</label>
          <span>{settings.color.toUpperCase()}</span>
        </div>
        <div className="brush-colour-row">
          <input
            aria-label="Choose any pen colour"
            id="brush-color"
            onChange={(event) =>
              onChange({ ...settings, color: event.target.value })
            }
            type="color"
            value={settings.color}
          />
          <div className="brush-swatches" aria-label="Quick colours">
            {SWATCHES.map((color) => (
              <button
                aria-label={`Use colour ${color}`}
                aria-pressed={settings.color.toLowerCase() === color}
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
          <strong>Apple Pencil pressure</strong>
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
