import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import styles from "@/components/canvas/ContextPanel.module.css";
import type {
  ConversationMessage,
  ImageGenerationQuality,
  ImageGenerationSize,
  PrototypeStats,
  SavedUiConfiguration,
  SnapshotPreview,
  ThemeMode,
} from "@/types/canvas";

type SnapshotState = "idle" | "preparing" | "ready" | "error";

type ContextPanelProps = {
  stats: PrototypeStats;
  dpr: number;
  snapshots: SnapshotPreview | null;
  snapshotState: SnapshotState;
  hasSelection: boolean;
  messages: ConversationMessage[];
  prompt: string;
  aiState: "idle" | "streaming" | "generating";
  aiError: string | null;
  includeNeighbourhood: boolean;
  includeCanvas: boolean;
  imageQuality: ImageGenerationQuality;
  imageSize: ImageGenerationSize;
  isSettingsOpen: boolean;
  canvasColor: string;
  themeMode: ThemeMode;
  savedUiConfigurations: SavedUiConfiguration[];
  onDprChange: (value: number) => void;
  onIncludeNeighbourhoodChange: (value: boolean) => void;
  onIncludeCanvasChange: (value: boolean) => void;
  onImageQualityChange: (value: ImageGenerationQuality) => void;
  onImageSizeChange: (value: ImageGenerationSize) => void;
  onCanvasColorChange: (value: string) => void;
  onThemeModeChange: (value: ThemeMode) => void;
  onApplyUiConfiguration: (configuration: SavedUiConfiguration) => void;
  onDeleteUiConfiguration: (id: string) => void;
  onSaveUiConfiguration: (name: string) => string | null;
  onSettingsClose: () => void;
  onPrepareContext: () => void;
  onPromptChange: (value: string) => void;
  onSendPrompt: () => void;
  onGenerateImage: (intent: "beside" | "in_place") => void;
  onCancelGeneration: () => void;
  onAddGeneratedImage: (message: ConversationMessage) => void;
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
  snapshots,
  snapshotState,
  hasSelection,
  messages,
  prompt,
  aiState,
  aiError,
  includeNeighbourhood,
  includeCanvas,
  imageQuality,
  imageSize,
  isSettingsOpen,
  canvasColor,
  themeMode,
  savedUiConfigurations,
  onDprChange,
  onIncludeNeighbourhoodChange,
  onIncludeCanvasChange,
  onImageQualityChange,
  onImageSizeChange,
  onCanvasColorChange,
  onThemeModeChange,
  onApplyUiConfiguration,
  onDeleteUiConfiguration,
  onSaveUiConfiguration,
  onSettingsClose,
  onPrepareContext,
  onPromptChange,
  onSendPrompt,
  onGenerateImage,
  onCancelGeneration,
  onAddGeneratedImage,
  onClear,
}: ContextPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [configurationName, setConfigurationName] = useState("");
  const [selectedConfigurationId, setSelectedConfigurationId] = useState("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      panelRef.current?.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <aside className={`${styles.root} diagnostics-panel`}>
      <header className="panel-heading">
        <div>
          <p className="eyebrow">Selection conversation</p>
          <h2>Design partner</h2>
        </div>
      </header>

      {isSettingsOpen ? (
        <section
          aria-label="Canvas settings"
          className={`${styles.settingsOverlay} canvas-settings-popover`}
        >
          <div className="settings-title">
            <strong>Canvas settings</strong>
            <button
              aria-label="Close canvas settings"
              onClick={onSettingsClose}
              type="button"
            >
              ×
            </button>
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
          <div className="diagnostic-section">
            <label htmlFor="theme-mode">Interface theme</label>
            <select
              id="theme-mode"
              onChange={(event) =>
                onThemeModeChange(event.target.value as ThemeMode)
              }
              value={themeMode}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="canvas-colour-setting">
            <label htmlFor="canvas-colour">Canvas colour</label>
            <div>
              <input
                id="canvas-colour"
                onChange={(event) => onCanvasColorChange(event.target.value)}
                type="color"
                value={canvasColor}
              />
              <output htmlFor="canvas-colour">
                {canvasColor.toUpperCase()}
              </output>
            </div>
          </div>
          <div className="ui-configuration-settings">
            <label htmlFor="saved-ui-configuration">
              Saved UI configuration
            </label>
            <select
              id="saved-ui-configuration"
              onChange={(event) => {
                const id = event.target.value;
                setSelectedConfigurationId(id);
                const configuration = savedUiConfigurations.find(
                  (item) => item.id === id,
                );
                if (configuration) {
                  onApplyUiConfiguration(configuration);
                }
              }}
              value={selectedConfigurationId}
            >
              <option value="">Choose a saved configuration</option>
              {savedUiConfigurations.map((configuration) => (
                <option key={configuration.id} value={configuration.id}>
                  {configuration.name}
                </option>
              ))}
            </select>
            <div className="ui-configuration-save-row">
              <input
                aria-label="Configuration name"
                maxLength={40}
                onChange={(event) => setConfigurationName(event.target.value)}
                placeholder="Configuration name"
                type="text"
                value={configurationName}
              />
              <button
                disabled={!configurationName.trim()}
                onClick={() => {
                  const savedId = onSaveUiConfiguration(configurationName);
                  if (savedId) {
                    setSelectedConfigurationId(savedId);
                    setConfigurationName("");
                  }
                }}
                type="button"
              >
                Save current
              </button>
            </div>
            <button
              className="delete-ui-configuration"
              disabled={!selectedConfigurationId}
              onClick={() => {
                onDeleteUiConfiguration(selectedConfigurationId);
                setSelectedConfigurationId("");
              }}
              type="button"
            >
              Delete selected
            </button>
          </div>
          <fieldset className="context-image-settings">
            <legend>Images sent to AI</legend>
            <label>
              <input checked disabled type="checkbox" />
              Selection
            </label>
            <label>
              <input
                checked={includeNeighbourhood}
                onChange={(event) =>
                  onIncludeNeighbourhoodChange(event.target.checked)
                }
                type="checkbox"
              />
              Neighbourhood
            </label>
            <label>
              <input
                checked={includeCanvas}
                onChange={(event) => onIncludeCanvasChange(event.target.checked)}
                type="checkbox"
              />
              Whole canvas
            </label>
          </fieldset>
          <fieldset className="context-image-settings">
            <legend>Image generation</legend>
            <label className="settings-select-row">
              Quality
              <select
                onChange={(event) =>
                  onImageQualityChange(
                    event.target.value as ImageGenerationQuality,
                  )
                }
                value={imageQuality}
              >
                <option value="low">Fast draft</option>
                <option value="medium">Balanced</option>
                <option value="high">High detail · slow</option>
              </select>
            </label>
            <label className="settings-select-row">
              Shape
              <select
                onChange={(event) =>
                  onImageSizeChange(event.target.value as ImageGenerationSize)
                }
                value={imageSize}
              >
                <option value="1024x1024">Square · fastest</option>
                <option value="1536x1024">Landscape</option>
                <option value="1024x1536">Portrait</option>
              </select>
            </label>
          </fieldset>
          <div className="diagnostic-section">
            <p>
              Strokes and image placements are cached locally and synchronized
              to private Supabase storage.
            </p>
            {stats.persistenceError ? (
              <p className="error-note">{stats.persistenceError}</p>
            ) : null}
          </div>
          <button
            className="settings-clear-button"
            onClick={() => {
              onClear();
              onSettingsClose();
            }}
            type="button"
          >
            Clear canvas
          </button>
        </section>
      ) : null}

      <div className="panel-sync-row">
        <span className={`sync-state ${stats.persistenceState}`}>
          Project sync: {stats.persistenceState}
        </span>
      </div>
      {stats.persistenceError ? (
        <p className="error-note">{stats.persistenceError}</p>
      ) : null}

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
      </div>

      {snapshotState === "error" ? (
        <p className="error-note">
          Could not render or privately save the context snapshots.
        </p>
      ) : null}

      {snapshotState === "ready" && snapshots?.contextSnapshotId ? (
        <p className="context-ready-note">Private AI context saved.</p>
      ) : null}

      <div className="panel-scroll-content" ref={panelRef}>
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

        <section className="conversation-section" aria-label="AI conversation">
          <div className="conversation-messages" aria-live="polite">
            {messages.length > 0 ? (
              messages.map((message) => (
                <article
                  className={`conversation-message ${message.role}`}
                  key={message.id}
                >
                  <strong>
                    {message.role === "user" ? "You" : "WeSketch"}
                  </strong>
                  {message.generationIntent ? (
                    <span className="generation-intent">
                      {message.generationIntent === "in_place"
                        ? "In place"
                        : "Beside canvas"}
                    </span>
                  ) : null}
                  {message.role === "user" && message.selectionUrl ? (
                    <figure className="conversation-context">
                      <Image
                        alt="Selection referenced by this message"
                        height={72}
                        src={message.selectionUrl}
                        unoptimized
                        width={96}
                      />
                      <figcaption>Selected context</figcaption>
                    </figure>
                  ) : null}
                  <p>{message.content}</p>
                  {message.generatedImageUrl ? (
                    <div className="generated-image-actions">
                      <a
                      aria-label="Open generated image preview"
                      className="generated-image-button"
                        href={message.generatedImageUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Image
                          alt="AI-generated visual alternative"
                          className="generated-message-image"
                          height={240}
                          src={message.generatedImageUrl}
                          unoptimized
                          width={240}
                        />
                        <span>Tap for full-size preview</span>
                      </a>
                      {message.generationIntent === "in_place" ? (
                        <div className="generation-insertion-status">
                          {message.insertionStatus === "pending"
                            ? "Adding to a new layer…"
                            : message.insertionStatus === "failed"
                              ? "Could not add the layer."
                              : "Added on its own layer."}
                          {message.insertionStatus === "failed" ? (
                            <button
                              className="add-generated-button"
                              onClick={() => onAddGeneratedImage(message)}
                              type="button"
                            >
                              Retry adding in place
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          className="add-generated-button"
                          onClick={() => onAddGeneratedImage(message)}
                          type="button"
                        >
                          Add to canvas
                        </button>
                      )}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="conversation-empty">
                Prepare a selection, then ask for observations or design
                alternatives.
              </p>
            )}
          </div>
        </section>
      </div>

      <form
        className="prompt-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSendPrompt();
        }}
      >
        <label htmlFor="selection-prompt">Ask about this selection</label>
        <textarea
          disabled={!snapshots?.contextSnapshotId || aiState !== "idle"}
          id="selection-prompt"
          maxLength={4000}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="What would you like to ask about this selection?"
          rows={3}
          value={prompt}
        />
        <button
          disabled={
            !snapshots?.contextSnapshotId ||
            !prompt.trim() ||
            aiState !== "idle"
          }
          type="submit"
        >
          {aiState === "streaming" ? "Thinking…" : "Send"}
        </button>
        {aiState === "generating" ? (
          <button
            className="secondary is-generating"
            onClick={onCancelGeneration}
            type="button"
          >
            Stop generating
          </button>
        ) : (
          <div className="generation-actions">
            <button
              className="secondary"
              disabled={
                !snapshots?.contextSnapshotId ||
                !prompt.trim() ||
                aiState !== "idle"
              }
              onClick={() => onGenerateImage("beside")}
              type="button"
            >
              Generate beside
            </button>
            <button
              disabled={
                !snapshots?.contextSnapshotId ||
                snapshots.selectionType !== "rectangle" ||
                !prompt.trim() ||
                aiState !== "idle"
              }
              onClick={() => onGenerateImage("in_place")}
              title={
                snapshots?.selectionType === "lasso"
                  ? "In-place generation currently requires a rectangle."
                  : undefined
              }
              type="button"
            >
              Generate in place
            </button>
          </div>
        )}
        {aiError ? <p className="error-note">{aiError}</p> : null}
      </form>
    </aside>
  );
}
