import Image from "next/image";

import type {
  PrototypeStats,
  SnapshotPreview,
} from "@/types/canvas";

type SnapshotState = "idle" | "preparing" | "ready" | "error";

type ContextPanelProps = {
  stats: PrototypeStats;
  dpr: number;
  stressLoaded: boolean;
  snapshots: SnapshotPreview | null;
  snapshotState: SnapshotState;
  hasSelection: boolean;
  onDprChange: (value: number) => void;
  onPrepareContext: () => void;
  onLoadStress: () => void;
  onClear: () => void;
};

function SnapshotImage({ label, src }: { label: string; src: string }) {
  return (
    <figure className="snapshot-card">
      <Image
        alt={`${label} snapshot`}
        height={140}
        src={src}
        unoptimized
        width={240}
      />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function ContextPanel({
  stats,
  dpr,
  stressLoaded,
  snapshots,
  snapshotState,
  hasSelection,
  onDprChange,
  onPrepareContext,
  onLoadStress,
  onClear,
}: ContextPanelProps) {
  return (
    <aside className="diagnostics-panel">
      <div>
        <p className="eyebrow">Durable sketch core</p>
        <h2>Context laboratory</h2>
      </div>

      <dl className="metric-grid">
        <div>
          <dt>Strokes</dt>
          <dd>{stats.strokeCount.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Points</dt>
          <dd>{stats.pointCount.toLocaleString("en-US")}</dd>
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
          Project sync: {stats.persistenceState}
        </span>
        <p>
          User strokes and image placements are cached locally and synchronized
          to private Supabase storage. Selections remain transient until an AI
          action uses them.
        </p>
      </div>

      <div className="diagnostic-section">
        <label htmlFor="dpr-select">Canvas pixel ratio</label>
        <select
          id="dpr-select"
          onChange={(event) => onDprChange(Number(event.target.value))}
          value={dpr}
        >
          <option value={1}>1×</option>
          <option value={1.5}>1.5× recommended</option>
          <option value={2}>2× stress</option>
        </select>
      </div>

      <div className="diagnostic-actions">
        <button
          disabled={!hasSelection || snapshotState === "preparing"}
          onClick={onPrepareContext}
          type="button"
        >
          {snapshotState === "preparing"
            ? "Preparing context…"
            : "Prepare AI context"}
        </button>
        <button className="secondary" onClick={onLoadStress} type="button">
          Load 10k-stroke test
        </button>
        <button className="secondary" onClick={onClear} type="button">
          Clear canvas
        </button>
      </div>

      {snapshotState === "error" ? (
        <p className="error-note">Could not prepare context snapshots.</p>
      ) : null}

      {snapshots ? (
        <div className="snapshot-list">
          <SnapshotImage label="Selection" src={snapshots.selectionUrl} />
          <SnapshotImage
            label="Neighbourhood"
            src={snapshots.neighbourhoodUrl}
          />
          <SnapshotImage label="Whole canvas" src={snapshots.canvasUrl} />
        </div>
      ) : null}

      {stressLoaded ? (
        <p className="stress-note">
          Stress strokes are memory-only and disappear on reload.
        </p>
      ) : null}
    </aside>
  );
}
