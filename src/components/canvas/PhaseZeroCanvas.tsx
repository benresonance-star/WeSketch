"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  distance,
  fitViewport,
  midpoint,
  screenToWorld,
  zoomViewport,
  type Point,
  type ScreenPoint,
  type Viewport,
} from "@/lib/canvas/geometry";
import {
  clearStrokes,
  deleteStroke,
  loadStrokes,
  saveStroke,
} from "@/lib/canvas/storage";
import { createUuid } from "@/lib/uuid";
import type {
  InteractionMode,
  PrototypeStats,
  Stroke,
  Tool,
} from "@/types/canvas";

const WORLD_WIDTH = 2048;
const WORLD_HEIGHT = 1536;
const DEFAULT_DPR = 1.5;
const MAX_DPR = 2;
const STRESS_STROKE_COUNT = 10_000;
const STRESS_POINTS_PER_STROKE = 12;
const PEN_COLOR = "#242220";
const ARTBOARD_COLOR = "#fbfaf6";
const WORKSPACE_COLOR = "#e9e7e2";

type SurfaceSize = {
  width: number;
  height: number;
};

type TrackedPointer = {
  id: number;
  pointerType: string;
  current: ScreenPoint;
};

type PinchState = {
  firstId: number;
  secondId: number;
  initialCenter: ScreenPoint;
  initialDistance: number;
  initialViewport: Viewport;
};

type PanState = {
  pointerId: number;
  initialPoint: ScreenPoint;
  initialViewport: Viewport;
};

const INITIAL_STATS: PrototypeStats = {
  strokeCount: 0,
  pointCount: 0,
  pointerCancelCount: 0,
  renderDurationMs: 0,
  persistenceState: "loading",
};

function averagePressure(points: Point[]): number {
  if (points.length === 0) {
    return 0.5;
  }

  return points.reduce((total, point) => total + point.pressure, 0) / points.length;
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  const { points } = stroke;

  if (points.length === 0) {
    return;
  }

  const pressureWidth = stroke.width * (0.65 + averagePressure(points) * 0.7);
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = pressureWidth;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, pressureWidth / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length - 1; index += 1) {
    const nextMidpoint = midpoint(points[index], points[index + 1]);
    context.quadraticCurveTo(
      points[index].x,
      points[index].y,
      nextMidpoint.x,
      nextMidpoint.y,
    );
  }

  const lastPoint = points[points.length - 1];
  context.lineTo(lastPoint.x, lastPoint.y);
  context.stroke();
}

function configureCanvas(
  canvas: HTMLCanvasElement,
  size: SurfaceSize,
  dpr: number,
  alpha: boolean,
): CanvasRenderingContext2D | null {
  const width = Math.max(1, Math.round(size.width * dpr));
  const height = Math.max(1, Math.round(size.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return canvas.getContext("2d", { alpha });
}

function createPoint(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  viewport: Viewport,
): Point {
  const bounds = canvas.getBoundingClientRect();
  const screenPoint = {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
  const worldPoint = screenToWorld(screenPoint, viewport);

  return {
    ...worldPoint,
    pressure: event.pressure > 0 ? event.pressure : 0.5,
    time: event.timeStamp,
  };
}

function screenPointFromEvent(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
): ScreenPoint {
  const bounds = canvas.getBoundingClientRect();

  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

export function PhaseZeroCanvas() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const redoRef = useRef<Stroke[]>([]);
  const activePointsRef = useRef<Point[]>([]);
  const activeStrokeIdRef = useRef<string | null>(null);
  const activePenPointerIdRef = useRef<number | null>(null);
  const pointersRef = useRef(new Map<number, TrackedPointer>());
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const surfaceSizeRef = useRef<SurfaceSize>({ width: 1, height: 1 });
  const dprRef = useRef(DEFAULT_DPR);
  const modeRef = useRef<InteractionMode>("idle");
  const pinchRef = useRef<PinchState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const frameRef = useRef<number | null>(null);
  const hasFittedRef = useRef(false);
  const [tool, setTool] = useState<Tool>("pen");
  const toolRef = useRef<Tool>("pen");
  const [dpr, setDpr] = useState(DEFAULT_DPR);
  const [stressLoaded, setStressLoaded] = useState(false);
  const [stats, setStats] = useState<PrototypeStats>(INITIAL_STATS);

  const updateDocumentStats = useCallback((renderDurationMs?: number) => {
    const strokes = strokesRef.current;
    const pointCount = strokes.reduce(
      (total, stroke) => total + stroke.points.length,
      0,
    );

    setStats((current) => ({
      ...current,
      strokeCount: strokes.length,
      pointCount,
      renderDurationMs: renderDurationMs ?? current.renderDurationMs,
    }));
  }, []);

  const renderScene = useCallback(() => {
    const canvas = sceneCanvasRef.current;

    if (!canvas) {
      return;
    }

    const startedAt = performance.now();
    const size = surfaceSizeRef.current;
    const pixelRatio = dprRef.current;
    const context = configureCanvas(canvas, size, pixelRatio, false);

    if (!context) {
      return;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = WORKSPACE_COLOR;
    context.fillRect(0, 0, size.width, size.height);

    const viewport = viewportRef.current;
    context.setTransform(
      pixelRatio * viewport.scale,
      0,
      0,
      pixelRatio * viewport.scale,
      pixelRatio * viewport.x,
      pixelRatio * viewport.y,
    );
    context.fillStyle = ARTBOARD_COLOR;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.save();
    context.beginPath();
    context.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.clip();

    for (const stroke of strokesRef.current) {
      drawStroke(context, stroke);
    }

    context.restore();
    updateDocumentStats(performance.now() - startedAt);
  }, [updateDocumentStats]);

  const renderLiveStroke = useCallback(() => {
    const canvas = liveCanvasRef.current;

    if (!canvas) {
      return;
    }

    const size = surfaceSizeRef.current;
    const pixelRatio = dprRef.current;
    const context = configureCanvas(canvas, size, pixelRatio, true);

    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (activePointsRef.current.length === 0) {
      return;
    }

    const viewport = viewportRef.current;
    context.setTransform(
      pixelRatio * viewport.scale,
      0,
      0,
      pixelRatio * viewport.scale,
      pixelRatio * viewport.x,
      pixelRatio * viewport.y,
    );
    context.save();
    context.beginPath();
    context.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.clip();
    drawStroke(context, {
      id: "active",
      points: activePointsRef.current,
      color: PEN_COLOR,
      width: 4,
      createdAt: 0,
    });
    context.restore();
  }, []);

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      renderScene();
      renderLiveStroke();
    });
  }, [renderLiveStroke, renderScene]);

  const fitToScreen = useCallback(() => {
    const size = surfaceSizeRef.current;
    viewportRef.current = fitViewport(
      size.width,
      size.height,
      WORLD_WIDTH,
      WORLD_HEIGHT,
    );
    scheduleRender();
  }, [scheduleRender]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    dprRef.current = Math.min(MAX_DPR, dpr);
    scheduleRender();
  }, [dpr, scheduleRender]);

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const preventNativeGesture = (event: TouchEvent) => {
      event.preventDefault();
    };
    const observer = new ResizeObserver(([entry]) => {
      surfaceSizeRef.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };

      if (!hasFittedRef.current) {
        hasFittedRef.current = true;
        fitToScreen();
      } else {
        scheduleRender();
      }
    });

    surface.addEventListener("touchstart", preventNativeGesture, {
      passive: false,
    });
    surface.addEventListener("touchmove", preventNativeGesture, {
      passive: false,
    });
    observer.observe(surface);

    return () => {
      observer.disconnect();
      surface.removeEventListener("touchstart", preventNativeGesture);
      surface.removeEventListener("touchmove", preventNativeGesture);
    };
  }, [fitToScreen, scheduleRender]);

  useEffect(() => {
    let cancelled = false;

    void loadStrokes("phase-zero")
      .then((strokes) => {
        if (cancelled) {
          return;
        }

        strokesRef.current = strokes.sort(
          (first, second) => first.createdAt - second.createdAt,
        );
        setStats((current) => ({ ...current, persistenceState: "saved" }));
        scheduleRender();
      })
      .catch(() => {
        if (!cancelled) {
          setStats((current) => ({ ...current, persistenceState: "error" }));
        }
      });

    return () => {
      cancelled = true;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [scheduleRender]);

  const beginPinch = useCallback(() => {
    const touches = Array.from(pointersRef.current.values()).filter(
      (pointer) => pointer.pointerType === "touch",
    );

    if (touches.length < 2 || activePenPointerIdRef.current !== null) {
      return;
    }

    const [first, second] = touches;
    pinchRef.current = {
      firstId: first.id,
      secondId: second.id,
      initialCenter: midpoint(first.current, second.current),
      initialDistance: Math.max(1, distance(first.current, second.current)),
      initialViewport: { ...viewportRef.current },
    };
    panRef.current = null;
    modeRef.current = "viewport";
  }, []);

  const beginPan = useCallback(
    (pointerId: number, point: ScreenPoint) => {
      panRef.current = {
        pointerId,
        initialPoint: point,
        initialViewport: { ...viewportRef.current },
      };
      pinchRef.current = null;
      modeRef.current = "viewport";
    },
    [],
  );

  const beginStroke = useCallback((event: PointerEvent) => {
    const canvas = liveCanvasRef.current;

    if (!canvas || stats.persistenceState === "loading") {
      return;
    }

    activePenPointerIdRef.current = event.pointerId;
    activeStrokeIdRef.current = createUuid();
    activePointsRef.current = [
      createPoint(event, canvas, viewportRef.current),
    ];
    modeRef.current = "inking";
    pinchRef.current = null;
    panRef.current = null;
    renderLiveStroke();
  }, [renderLiveStroke, stats.persistenceState]);

  const commitActiveStroke = useCallback(() => {
    const strokeId = activeStrokeIdRef.current;
    const points = activePointsRef.current;

    activePenPointerIdRef.current = null;
    activeStrokeIdRef.current = null;
    activePointsRef.current = [];
    modeRef.current = "idle";

    if (!strokeId || points.length === 0) {
      renderLiveStroke();
      return;
    }

    const stroke: Stroke = {
      id: strokeId,
      points,
      color: PEN_COLOR,
      width: 4,
      createdAt: Date.now(),
    };
    strokesRef.current = [...strokesRef.current, stroke];
    redoRef.current = [];
    setStats((current) => ({ ...current, persistenceState: "saving" }));
    scheduleRender();

    void saveStroke("phase-zero", stroke)
      .then(() => {
        setStats((current) => ({ ...current, persistenceState: "saved" }));
      })
      .catch(() => {
        setStats((current) => ({ ...current, persistenceState: "error" }));
      });
  }, [renderLiveStroke, scheduleRender]);

  const handlePointerDown = useCallback(
    (reactEvent: ReactPointerEvent<HTMLCanvasElement>) => {
      const event = reactEvent.nativeEvent;
      const canvas = liveCanvasRef.current;

      if (!canvas) {
        return;
      }

      reactEvent.preventDefault();

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Safari may reject capture for an already-cancelled pointer.
      }

      const current = screenPointFromEvent(event, canvas);
      pointersRef.current.set(event.pointerId, {
        id: event.pointerId,
        pointerType: event.pointerType,
        current,
      });

      if (event.pointerType === "touch") {
        const touchCount = Array.from(pointersRef.current.values()).filter(
          (pointer) => pointer.pointerType === "touch",
        ).length;

        if (touchCount >= 2) {
          beginPinch();
        } else if (
          toolRef.current === "hand" &&
          activePenPointerIdRef.current === null
        ) {
          beginPan(event.pointerId, current);
        }

        return;
      }

      if (
        toolRef.current === "pen" &&
        event.isPrimary &&
        event.button === 0
      ) {
        beginStroke(event);
      } else if (toolRef.current === "hand" && event.button === 0) {
        beginPan(event.pointerId, current);
      }
    },
    [beginPan, beginPinch, beginStroke],
  );

  const handlePointerMove = useCallback(
    (reactEvent: ReactPointerEvent<HTMLCanvasElement>) => {
      const event = reactEvent.nativeEvent;
      const canvas = liveCanvasRef.current;

      if (!canvas) {
        return;
      }

      reactEvent.preventDefault();
      const current = screenPointFromEvent(event, canvas);
      const tracked = pointersRef.current.get(event.pointerId);

      if (tracked) {
        tracked.current = current;
      }

      if (
        modeRef.current === "inking" &&
        activePenPointerIdRef.current === event.pointerId
      ) {
        const samples = event.getCoalescedEvents?.() ?? [];
        const events = samples.length > 0 ? samples : [event];

        for (const sample of events) {
          activePointsRef.current.push(
            createPoint(sample, canvas, viewportRef.current),
          );
        }

        renderLiveStroke();
        return;
      }

      const pinch = pinchRef.current;

      if (modeRef.current === "viewport" && pinch) {
        const first = pointersRef.current.get(pinch.firstId);
        const second = pointersRef.current.get(pinch.secondId);

        if (first && second) {
          const currentCenter = midpoint(first.current, second.current);
          const currentDistance = Math.max(
            1,
            distance(first.current, second.current),
          );
          viewportRef.current = zoomViewport(
            pinch.initialViewport,
            pinch.initialCenter,
            currentCenter,
            currentDistance / pinch.initialDistance,
          );
          scheduleRender();
        }

        return;
      }

      const pan = panRef.current;

      if (
        modeRef.current === "viewport" &&
        pan &&
        pan.pointerId === event.pointerId
      ) {
        viewportRef.current = {
          ...pan.initialViewport,
          x: pan.initialViewport.x + current.x - pan.initialPoint.x,
          y: pan.initialViewport.y + current.y - pan.initialPoint.y,
        };
        scheduleRender();
      }
    },
    [renderLiveStroke, scheduleRender],
  );

  const finishPointer = useCallback(
    (event: PointerEvent, wasCancelled: boolean) => {
      if (wasCancelled) {
        setStats((current) => ({
          ...current,
          pointerCancelCount: current.pointerCancelCount + 1,
        }));
      }

      if (
        modeRef.current === "inking" &&
        activePenPointerIdRef.current === event.pointerId
      ) {
        commitActiveStroke();
      }

      pointersRef.current.delete(event.pointerId);

      if (pinchRef.current) {
        const touches = Array.from(pointersRef.current.values()).filter(
          (pointer) => pointer.pointerType === "touch",
        );

        if (touches.length >= 2) {
          beginPinch();
        } else if (touches.length === 1 && toolRef.current === "hand") {
          beginPan(touches[0].id, touches[0].current);
        } else {
          pinchRef.current = null;
          modeRef.current = "idle";
        }
      } else if (panRef.current?.pointerId === event.pointerId) {
        panRef.current = null;
        modeRef.current = "idle";
      }
    },
    [beginPan, beginPinch, commitActiveStroke],
  );

  const handlePointerUp = useCallback(
    (reactEvent: ReactPointerEvent<HTMLCanvasElement>) => {
      reactEvent.preventDefault();
      finishPointer(reactEvent.nativeEvent, false);
    },
    [finishPointer],
  );

  const handlePointerCancel = useCallback(
    (reactEvent: ReactPointerEvent<HTMLCanvasElement>) => {
      reactEvent.preventDefault();
      finishPointer(reactEvent.nativeEvent, true);
    },
    [finishPointer],
  );

  const undo = useCallback(() => {
    const stroke = strokesRef.current.at(-1);

    if (!stroke) {
      return;
    }

    strokesRef.current = strokesRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, stroke];
    scheduleRender();

    if (!stroke.id.startsWith("stress-")) {
      void deleteStroke(stroke.id).catch(() => {
        setStats((current) => ({ ...current, persistenceState: "error" }));
      });
    }
  }, [scheduleRender]);

  const redo = useCallback(() => {
    const stroke = redoRef.current.at(-1);

    if (!stroke) {
      return;
    }

    redoRef.current = redoRef.current.slice(0, -1);
    strokesRef.current = [...strokesRef.current, stroke];
    scheduleRender();

    if (!stroke.id.startsWith("stress-")) {
      void saveStroke("phase-zero", stroke).catch(() => {
        setStats((current) => ({ ...current, persistenceState: "error" }));
      });
    }
  }, [scheduleRender]);

  const clearDocument = useCallback(() => {
    strokesRef.current = [];
    redoRef.current = [];
    setStressLoaded(false);
    setStats((current) => ({ ...current, persistenceState: "saving" }));
    scheduleRender();

    void clearStrokes("phase-zero")
      .then(() => {
        setStats((current) => ({ ...current, persistenceState: "saved" }));
      })
      .catch(() => {
        setStats((current) => ({ ...current, persistenceState: "error" }));
      });
  }, [scheduleRender]);

  const loadStressDocument = useCallback(() => {
    const generated: Stroke[] = [];
    const columns = 100;
    const rows = STRESS_STROKE_COUNT / columns;
    const cellWidth = WORLD_WIDTH / columns;
    const cellHeight = WORLD_HEIGHT / rows;

    for (let index = 0; index < STRESS_STROKE_COUNT; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const points: Point[] = [];

      for (
        let pointIndex = 0;
        pointIndex < STRESS_POINTS_PER_STROKE;
        pointIndex += 1
      ) {
        const progress = pointIndex / (STRESS_POINTS_PER_STROKE - 1);
        points.push({
          x: column * cellWidth + progress * cellWidth * 0.82,
          y:
            row * cellHeight +
            cellHeight * 0.5 +
            Math.sin(progress * Math.PI * 2 + row * 0.15) * cellHeight * 0.25,
          pressure: 0.3 + progress * 0.5,
          time: pointIndex,
        });
      }

      generated.push({
        id: `stress-${index}`,
        points,
        color: index % 8 === 0 ? "#716b63" : PEN_COLOR,
        width: 2.4,
        createdAt: index,
      });
    }

    strokesRef.current = generated;
    redoRef.current = [];
    setStressLoaded(true);
    scheduleRender();
  }, [scheduleRender]);

  return (
    <main className="prototype-shell">
      <header className="prototype-header">
        <div>
          <p className="eyebrow">Phase 0 hardware prototype</p>
          <h1>WeSketch input laboratory</h1>
        </div>
        <div className="target-badge">
          iPad Pro 12.9″ (1st gen) · iPadOS 16.7.16
        </div>
      </header>

      <section className="prototype-workspace">
        <aside className="tool-rail" aria-label="Drawing tools">
          <button
            className={tool === "pen" ? "tool-button active" : "tool-button"}
            onClick={() => setTool("pen")}
            type="button"
          >
            <span className="tool-icon">╱</span>
            Pen
          </button>
          <button
            className={tool === "hand" ? "tool-button active" : "tool-button"}
            onClick={() => setTool("hand")}
            type="button"
          >
            <span className="tool-icon">✣</span>
            Hand
          </button>
          <button className="tool-button" onClick={undo} type="button">
            <span className="tool-icon">↶</span>
            Undo
          </button>
          <button className="tool-button" onClick={redo} type="button">
            <span className="tool-icon">↷</span>
            Redo
          </button>
          <button className="tool-button" onClick={fitToScreen} type="button">
            <span className="tool-icon">□</span>
            Fit
          </button>
        </aside>

        <div
          className="canvas-surface"
          data-testid="canvas-surface"
          ref={surfaceRef}
        >
          <canvas className="canvas-layer" ref={sceneCanvasRef} />
          <canvas
            aria-label="Sketch canvas"
            className="canvas-layer canvas-input-layer"
            data-testid="input-canvas"
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            ref={liveCanvasRef}
          />
          <div className="gesture-hint">
            Pencil draws · two fingers pan and zoom
          </div>
        </div>

        <aside className="diagnostics-panel">
          <div>
            <p className="eyebrow">Live diagnostics</p>
            <h2>Target-device gate</h2>
          </div>
          <dl className="metric-grid">
            <div>
              <dt>Strokes</dt>
              <dd>{stats.strokeCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Points</dt>
              <dd>{stats.pointCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Render</dt>
              <dd>{stats.renderDurationMs.toFixed(1)} ms</dd>
            </div>
            <div>
              <dt>Cancels</dt>
              <dd>{stats.pointerCancelCount}</dd>
            </div>
          </dl>

          <div className="diagnostic-section">
            <span className={`sync-state ${stats.persistenceState}`}>
              Local store: {stats.persistenceState}
            </span>
            <p>
              Completed strokes are committed to IndexedDB before any future
              network sync.
            </p>
          </div>

          <div className="diagnostic-section">
            <label htmlFor="dpr-select">Canvas pixel ratio</label>
            <select
              id="dpr-select"
              onChange={(event) => setDpr(Number(event.target.value))}
              value={dpr}
            >
              <option value={1}>1×</option>
              <option value={1.5}>1.5× recommended</option>
              <option value={2}>2× stress</option>
            </select>
          </div>

          <div className="diagnostic-actions">
            <button onClick={loadStressDocument} type="button">
              Load 10k-stroke test
            </button>
            <button className="secondary" onClick={clearDocument} type="button">
              Clear canvas
            </button>
          </div>

          {stressLoaded ? (
            <p className="stress-note">
              Stress strokes are intentionally memory-only and disappear on
              reload.
            </p>
          ) : null}

          <ol className="test-script">
            <li>Draw continuously for ten minutes.</li>
            <li>Add and remove two-finger gestures while drawing.</li>
            <li>Reload and confirm completed strokes return.</li>
            <li>Load 10k strokes and record render time.</li>
          </ol>
        </aside>
      </section>
    </main>
  );
}
