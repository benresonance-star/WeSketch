import { describe, expect, it } from "vitest";

import {
  fitViewport,
  screenToWorld,
  worldToScreen,
  zoomViewport,
  type Viewport,
} from "@/lib/canvas/geometry";

describe("canvas coordinate transforms", () => {
  it("round-trips between world and screen coordinates", () => {
    const viewport: Viewport = { x: 84, y: -32, scale: 1.75 };
    const worldPoint = { x: 540.25, y: 810.5 };

    const screenPoint = worldToScreen(worldPoint, viewport);

    expect(screenToWorld(screenPoint, viewport)).toEqual(worldPoint);
  });

  it("fits a finite artboard inside the available viewport", () => {
    const viewport = fitViewport(1024, 700, 2048, 1536, 24);

    expect(viewport.scale).toBeCloseTo(652 / 1536);
    expect(viewport.x).toBeGreaterThanOrEqual(24);
    expect(viewport.y).toBeCloseTo(24);
  });

  it("keeps the initial pinch anchor under the moving gesture center", () => {
    const initialViewport: Viewport = { x: 40, y: 30, scale: 0.5 };
    const initialCenter = { x: 400, y: 300 };
    const currentCenter = { x: 440, y: 320 };
    const worldAnchor = screenToWorld(initialCenter, initialViewport);

    const nextViewport = zoomViewport(
      initialViewport,
      initialCenter,
      currentCenter,
      1.8,
    );

    expect(worldToScreen(worldAnchor, nextViewport).x).toBeCloseTo(
      currentCenter.x,
    );
    expect(worldToScreen(worldAnchor, nextViewport).y).toBeCloseTo(
      currentCenter.y,
    );
  });

  it("clamps pinch zoom to the supported range", () => {
    const viewport: Viewport = { x: 0, y: 0, scale: 1 };

    expect(
      zoomViewport(viewport, { x: 0, y: 0 }, { x: 0, y: 0 }, 100).scale,
    ).toBe(6);
    expect(
      zoomViewport(viewport, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.001).scale,
    ).toBe(0.2);
  });
});
