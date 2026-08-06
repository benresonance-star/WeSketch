import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { brushSizeFromVerticalDrag } from "@/lib/canvas/brush-size";
import type { BrushSettings, CanvasLayer, Tool } from "@/types/canvas";

type CanvasToolbarProps = {
  isAgentPanelOpen: boolean;
  tool: Tool;
  brushSettings: BrushSettings;
  layers: CanvasLayer[];
  activeLayerId: string;
  isolatingLayerId: string | null;
  isolateBackgroundOpacity: number;
  maskEditingLayerId: string | null;
  onBrushSettingsChange: (settings: BrushSettings) => void;
  onToolChange: (tool: Tool) => void;
  onImport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
  onLayerActivate: (id: string) => void;
  onLayerAdd: () => void;
  onLayerChange: (layer: CanvasLayer) => void;
  onLayerDelete: (id: string) => void;
  onLayerMove: (id: string, direction: "up" | "down") => void;
  onIsolateToggle: (id: string) => void;
  onIsolateBackgroundOpacityChange: (opacity: number) => void;
  onMaskEditToggle: (id: string) => void;
  onMaskEnabledToggle: (id: string) => void;
  onToggleAgentPanel: () => void;
};

const TOOLS: Array<{
  tool: Tool;
  icon: LucideIcon;
  label: string;
  separatorBefore?: boolean;
}> = [
  { tool: "lasso", icon: LassoSelect, label: "Lasso" },
  { tool: "object", icon: MousePointer2, label: "Object" },
  { tool: "hand", icon: Hand, label: "Pan", separatorBefore: true },
];
const BRUSH_PALETTE_LAYOUT_KEY = "wesketch-brush-palette-layout-v1";
const LAYERS_BELOW_PEN_HUD_GAP_PX = 8;
const SWATCH_PEN_DRAG_THRESHOLD_PX = 4;

type SwatchPenDragState = {
  moved: boolean;
  pointerId: number;
  startSize: number;
  startY: number;
};

export function CanvasToolbar({
  isAgentPanelOpen,
  tool,
  brushSettings,
  layers,
  isolatingLayerId,
  isolateBackgroundOpacity,
  maskEditingLayerId,
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
  onLayerDelete,
  onLayerMove,
  onIsolateToggle,
  onIsolateBackgroundOpacityChange,
  onMaskEditToggle,
  onMaskEnabledToggle,
  onToggleAgentPanel,
}: CanvasToolbarProps) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [paletteLayout, setPaletteLayout] =
    useState<BrushPaletteLayout>("standard");
  const swatchPenDragRef = useRef<SwatchPenDragState | null>(null);
  const suppressSwatchClickRef = useRef(false);
  const brushPaletteRef = useRef<HTMLElement>(null);
  const [layersPreferredTop, setLayersPreferredTop] = useState<number | null>(
    null,
  );

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

  const syncLayersPreferredTop = useCallback(() => {
    if (!isPaletteOpen || paletteLayout !== "horizontal") {
      setLayersPreferredTop(null);
      return;
    }

    const palette = brushPaletteRef.current;
    if (!palette) {
      return;
    }

    setLayersPreferredTop(
      palette.getBoundingClientRect().bottom + LAYERS_BELOW_PEN_HUD_GAP_PX,
    );
  }, [isPaletteOpen, paletteLayout]);

  useLayoutEffect(() => {
    syncLayersPreferredTop();
  }, [
    syncLayersPreferredTop,
    brushSettings.size,
    maskEditingLayerId,
    isLayersOpen,
  ]);

  useLayoutEffect(() => {
    if (!isPaletteOpen || paletteLayout !== "horizontal") {
      return;
    }

    const palette = brushPaletteRef.current;
    if (!palette) {
      return;
    }

    const observer = new ResizeObserver(syncLayersPreferredTop);
    observer.observe(palette);
    window.addEventListener("resize", syncLayersPreferredTop);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncLayersPreferredTop);
    };
  }, [isPaletteOpen, paletteLayout, syncLayersPreferredTop]);

  const togglePenPalette = () => {
    onToolChange("pen");
    setIsPaletteOpen((current) => (tool === "pen" ? !current : true));
  };

  const handleSwatchPenPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.pointerType !== "pen") {
      return;
    }

    swatchPenDragRef.current = {
      moved: false,
      pointerId: event.pointerId,
      startSize: brushSettings.size,
      startY: event.clientY,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleSwatchPenPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = swatchPenDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (
      !drag.moved &&
      Math.abs(event.clientY - drag.startY) >= SWATCH_PEN_DRAG_THRESHOLD_PX
    ) {
      drag.moved = true;
    }

    if (!drag.moved) {
      return;
    }

    const nextSize = brushSizeFromVerticalDrag(
      drag.startSize,
      drag.startY,
      event.clientY,
    );

    if (nextSize !== brushSettings.size) {
      onBrushSettingsChange({ ...brushSettings, size: nextSize });
    }

    event.preventDefault();
  };

  const finishSwatchPenPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = swatchPenDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    swatchPenDragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!drag.moved) {
      suppressSwatchClickRef.current = true;
      togglePenPalette();
    } else {
      suppressSwatchClickRef.current = true;
    }

    event.preventDefault();
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
          aria-label="Toggle pen palette"
          className="tool-button brush-tool-button"
          onClick={() => {
            if (suppressSwatchClickRef.current) {
              suppressSwatchClickRef.current = false;
              return;
            }

            togglePenPalette();
          }}
          onPointerCancel={finishSwatchPenPointer}
          onPointerDown={handleSwatchPenPointerDown}
          onPointerMove={handleSwatchPenPointerMove}
          onPointerUp={finishSwatchPenPointer}
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
        <div aria-hidden="true" className="tool-divider" />
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
          maskMode={maskEditingLayerId !== null}
          onChange={onBrushSettingsChange}
          onClose={() => setIsPaletteOpen(false)}
          onLayoutChange={changePaletteLayout}
          panelRef={brushPaletteRef}
          settings={brushSettings}
        />
      ) : null}
      {isLayersOpen ? (
        <LayersPanel
          activeLayerId={activeLayerId}
          isolatingLayerId={isolatingLayerId}
          isolateBackgroundOpacity={isolateBackgroundOpacity}
          layers={layers}
          maskEditingLayerId={maskEditingLayerId}
          preferredTop={layersPreferredTop}
          onActivate={onLayerActivate}
          onAdd={onLayerAdd}
          onChange={onLayerChange}
          onClose={() => setIsLayersOpen(false)}
          onDelete={onLayerDelete}
          onIsolateToggle={onIsolateToggle}
          onIsolateBackgroundOpacityChange={onIsolateBackgroundOpacityChange}
          onMaskEditToggle={onMaskEditToggle}
          onMaskEnabledToggle={onMaskEnabledToggle}
          onMove={onLayerMove}
        />
      ) : null}
    </>
  );
}
