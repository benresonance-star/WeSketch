import { useState } from "react";

import { BrushPalette } from "@/components/canvas/BrushPalette";
import type { BrushSettings, Tool } from "@/types/canvas";

type CanvasToolbarProps = {
  tool: Tool;
  brushSettings: BrushSettings;
  onBrushSettingsChange: (settings: BrushSettings) => void;
  onToolChange: (tool: Tool) => void;
  onImport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
};

const TOOLS: Array<{ tool: Tool; icon: string; label: string }> = [
  { tool: "eraser", icon: "◇", label: "Eraser" },
  { tool: "rectangle", icon: "□", label: "Select" },
  { tool: "lasso", icon: "◯", label: "Lasso" },
  { tool: "object", icon: "↖", label: "Object" },
  { tool: "hand", icon: "✣", label: "Hand" },
];

export function CanvasToolbar({
  tool,
  brushSettings,
  onBrushSettingsChange,
  onToolChange,
  onImport,
  onUndo,
  onRedo,
  onFit,
}: CanvasToolbarProps) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  return (
    <>
      <aside className="tool-rail" aria-label="Canvas tools">
        <button
          aria-pressed={tool === "pen"}
          className={tool === "pen" ? "tool-button active" : "tool-button"}
          onClick={() => {
            onToolChange("pen");
            setIsPaletteOpen((current) => (tool === "pen" ? !current : true));
          }}
          type="button"
        >
          <span className="tool-icon">╱</span>
          Pen
        </button>
        <button
          aria-expanded={isPaletteOpen}
          aria-label="Open pen palette"
          className="tool-button brush-tool-button"
          onClick={() => {
            onToolChange("pen");
            setIsPaletteOpen(true);
          }}
          type="button"
        >
          <span
            className="brush-tool-swatch"
            style={{
              backgroundColor: brushSettings.color,
              width: `${Math.min(28, 12 + brushSettings.size / 2)}px`,
              height: `${Math.min(28, 12 + brushSettings.size / 2)}px`,
            }}
          />
          {brushSettings.size.toFixed(1)}
        </button>
        {TOOLS.map((item) => (
          <button
            aria-pressed={tool === item.tool}
            className={tool === item.tool ? "tool-button active" : "tool-button"}
            key={item.tool}
            onClick={() => {
              setIsPaletteOpen(false);
              onToolChange(item.tool);
            }}
            type="button"
          >
            <span className="tool-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div className="tool-divider" />
        <button className="tool-button" onClick={onImport} type="button">
          <span className="tool-icon">＋</span>
          Image
        </button>
        <button className="tool-button" onClick={onUndo} type="button">
          <span className="tool-icon">↶</span>
          Undo
        </button>
        <button className="tool-button" onClick={onRedo} type="button">
          <span className="tool-icon">↷</span>
          Redo
        </button>
        <button className="tool-button" onClick={onFit} type="button">
          <span className="tool-icon">⌗</span>
          Fit
        </button>
      </aside>
      {isPaletteOpen ? (
        <BrushPalette
          onChange={onBrushSettingsChange}
          onClose={() => setIsPaletteOpen(false)}
          settings={brushSettings}
        />
      ) : null}
    </>
  );
}
