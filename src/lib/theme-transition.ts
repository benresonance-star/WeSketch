type ViewTransition = {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
};

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransition;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function runThemeTransition(apply: () => void): void {
  const doc = document as DocumentWithViewTransition;

  if (prefersReducedMotion() || typeof doc.startViewTransition !== "function") {
    apply();
    return;
  }

  doc.startViewTransition(apply);
}
