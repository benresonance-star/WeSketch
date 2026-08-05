import { Fragment, useEffect, useState } from "react";
import {
  Bot,
  Eraser,
  Hand,
  ImagePlus,
  LassoSelect,
  Layers as LayersIcon,
  Maximize,
  MousePointer2,
  PenLine,
  Redo2,
  ScanSearch,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import {
  BrushPalette,
  type BrushPaletteLayout,
} from "@/components/canvas/BrushPalette";
import { LayersPanel } from "@/components/canvas/LayersPanel";
import type { BrushSettings, CanvasLayer, Tool } from "@/types/canvas";

type CanvasToolbarProps = {
  isAgentPanelOpen: boolean;
  tool: Tool;
  brushSettings: BrushSettings;
  layers: CanvasLayer[];
  activeLayerId: string;
  onBrushSettingsChange: (settings: BrushSettings) => void;
  onToolChange: (tool: Tool) => void;
  onImport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
  onLayerActivate: (id: string) => void;
  onLayerAdd: () => void;
  onLayerChange: (layer: CanvasLayer) => void;
  onLayerMove: (id: string, direction: "up" | "down") => void;
  onToggleAgentPanel: () => void;
};

const TOOLS: Array<{
  tool: Tool;
  icon: LucideIcon;
  label: string;
  separatorBefore?: boolean;
}> = [
  { tool: "lasso", icon: LassoSelect, label: "Lasso" },
  {
    tool: "object",
    icon: MousePointer2,
    label: "Object",
    separatorBefore: true,
  },
  { tool: "hand", icon: Hand, label: "Hand" },
];
const BRUSH_PALETTE_LAYOUT_KEY = "wesketch-brush-palette-layout-v1";

export function CanvasToolbar({
  isAgentPanelOpen,
  tool,
  brushSettings,
  layers,
  activeLayerId,
  onBrushSettingsChange,
  onToolChange,
  onImport,
  onUndo,
  onRedo,
  onFit,
  onLayerActivate,
  onLayerAdd,
  onLayerChange,
  onLayerMove,
  onToggleAgentPanel,
}: CanvasToolbarProps) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [paletteLayout, setPaletteLayout] =
    useState<BrushPaletteLayout>("standard");

  useEffect(() => {
    const storedLayout = window.localStorage.getItem(BRUSH_PALETTE_LAYOUT_KEY);
    if (storedLayout === "standard" || storedLayout === "horizontal") {
      const frame = requestAnimationFrame(() => setPaletteLayout(storedLayout));
      return () => cancelAnimationFrame(frame);
    }
  }, []);

  const changePaletteLayout = (layout: BrushPaletteLayout) => {
    setPaletteLayout(layout);
    window.localStorage.setItem(BRUSH_PALETTE_LAYOUT_KEY, layout);
  };

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
          <PenLine aria-hidden="true" className="tool-icon" />
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
        <button
          aria-pressed={tool === "eraser"}
          className={tool === "eraser" ? "tool-button active" : "tool-button"}
          onClick={() => {
            setIsPaletteOpen(false);
            onToolChange("eraser");
          }}
          type="button"
        >
          <Eraser aria-hidden="true" className="tool-icon" />
          Eraser
        </button>
        <div aria-hidden="true" className="tool-divider" />
        <button
          aria-expanded={isAgentPanelOpen}
          aria-label="Toggle design partner panel"
          className={isAgentPanelOpen ? "tool-button active" : "tool-button"}
          onClick={onToggleAgentPanel}
          type="button"
        >
          <Bot aria-hidden="true" className="tool-icon" />
          Agent
        </button>
        <button
          aria-pressed={tool === "rectangle"}
          className={tool === "rectangle" ? "tool-button active" : "tool-button"}
          onClick={() => {
            setIsPaletteOpen(false);
            onToolChange("rectangle");
          }}
          type="button"
        >
          <ScanSearch aria-hidden="true" className="tool-icon" />
          Select for AI
        </button>
        <div aria-hidden="true" className="tool-divider" />
        <button
          aria-expanded={isLayersOpen}
          className={isLayersOpen ? "tool-button active" : "tool-button"}
          onClick={() => setIsLayersOpen((current) => !current)}
          type="button"
        >
          <LayersIcon aria-hidden="true" className="tool-icon" />
          Layers
        </button>
        <button className="tool-button" onClick={onImport} type="button">
          <ImagePlus aria-hidden="true" className="tool-icon" />
          Image
        </button>
        <div aria-hidden="true" className="tool-divider" />
        {TOOLS.map((item) => {
          const Icon = item.icon;
          return (
            <Fragment key={item.tool}>
              {item.separatorBefore ? (
                <div aria-hidden="true" className="tool-divider" />
              ) : null}
              <button
                aria-pressed={tool === item.tool}
                className={
                  tool === item.tool ? "tool-button active" : "tool-button"
                }
                onClick={() => {
                  setIsPaletteOpen(false);
                  onToolChange(item.tool);
                }}
                type="button"
              >
                <Icon aria-hidden="true" className="tool-icon" />
                {item.label}
              </button>
            </Fragment>
          );
        })}
        <button className="tool-button" onClick={onUndo} type="button">
          <Undo2 aria-hidden="true" className="tool-icon" />
          Undo
        </button>
        <button className="tool-button" onClick={onRedo} type="button">
          <Redo2 aria-hidden="true" className="tool-icon" />
          Redo
        </button>
        <button className="tool-button" onClick={onFit} type="button">
          <Maximize aria-hidden="true" className="tool-icon" />
          Fit
        </button>
      </aside>
      {isPaletteOpen ? (
        <BrushPalette
          layout={paletteLayout}
          onChange={onBrushSettingsChange}
          onClose={() => setIsPaletteOpen(false)}
          onLayoutChange={changePaletteLayout}
          settings={brushSettings}
        />
      ) : null}
      {isLayersOpen ? (
        <LayersPanel
          activeLayerId={activeLayerId}
          layers={layers}
          onActivate={onLayerActivate}
          onAdd={onLayerAdd}
          onChange={onLayerChange}
          onClose={() => setIsLayersOpen(false)}
          onMove={onLayerMove}
        />
      ) : null}
    </>
  );
}
