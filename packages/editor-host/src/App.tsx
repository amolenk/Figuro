import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { hasHost, postToHost } from "./bridge";
import "./App.css";

/**
 * App state keys that are part of the document rather than the view.
 *
 * Scrolling, zooming, selecting and switching tools must never mark the
 * document dirty: opening a file and panning around has to leave the bytes on
 * disk untouched.
 */
const DOCUMENT_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "gridStep",
  "gridModeEnabled",
  "name",
] as const;

/**
 * Element fields that change without the drawing changing.
 *
 * Excalidraw bumps these whenever it touches an element, including during the
 * normalisation it performs on load. Comparing them would report edits that
 * never happened. They are excluded from the dirty check only - the file
 * itself is written exactly as Excalidraw serialises it, churn included.
 */
const CHURN_KEYS = new Set(["version", "versionNonce", "updated"]);

type SceneSignature = string;

type FiguroMetadata = Record<string, unknown> & { v: 1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEditableFiguroMetadata(element: ExcalidrawElement): boolean {
  const metadata = element.customData?.figuro;
  return metadata === undefined || (isRecord(metadata) && metadata.v === 1);
}

function revealStepOf(element: ExcalidrawElement | null): number | null {
  if (!element) return null;
  const metadata = element.customData?.figuro;
  if (
    !isRecord(metadata) ||
    metadata.v !== 1 ||
    typeof metadata.step !== "number" ||
    !Number.isSafeInteger(metadata.step) ||
    metadata.step < 0
  ) {
    return null;
  }
  return metadata.step;
}

function revealStepLabel(element: ExcalidrawElement | null): string {
  if (!element) return "";
  const metadata = element.customData?.figuro;
  if (metadata === undefined) return "No step · visible initially";
  if (!isRecord(metadata) || metadata.v !== 1) return "Unsupported Figuro metadata";
  if (!("step" in metadata)) return "No step · visible initially";
  const step = revealStepOf(element);
  return step === null ? "Invalid reveal step" : `Step ${step}`;
}

function hasRevealStep(element: ExcalidrawElement | null): boolean {
  if (!element) return false;
  const metadata = element.customData?.figuro;
  return isRecord(metadata) && metadata.v === 1 && "step" in metadata;
}

function withRevealStep(
  element: ExcalidrawElement,
  step: number | null,
): ExcalidrawElement | null {
  const customData: Record<string, unknown> = { ...element.customData };
  const existing = customData.figuro;
  if (existing !== undefined && (!isRecord(existing) || existing.v !== 1)) return null;
  if (step === null && existing === undefined) return element;

  const metadata: FiguroMetadata = isRecord(existing)
    ? { ...existing, v: 1 }
    : { v: 1 };
  if (step === null) delete metadata.step;
  else metadata.step = step;

  if (Object.keys(metadata).every((key) => key === "v")) {
    delete customData.figuro;
  } else {
    customData.figuro = metadata;
  }

  return {
    ...element,
    customData: Object.keys(customData).length > 0 ? customData : undefined,
  } as ExcalidrawElement;
}

/**
 * A stable fingerprint of everything that belongs to the saved document.
 *
 * Two scenes with the same signature would serialise to files that differ only
 * in churn, so there is nothing worth writing to disk between them.
 */
function signature(api: ExcalidrawImperativeAPI): SceneSignature {
  const appState = api.getAppState();
  const elements = api.getSceneElements().map((element) => {
    const stable: Record<string, unknown> = {};
    for (const key of Object.keys(element).sort()) {
      if (!CHURN_KEYS.has(key)) {
        stable[key] = (element as unknown as Record<string, unknown>)[key];
      }
    }
    return stable;
  });
  const documentAppState = DOCUMENT_APP_STATE_KEYS.map((key) => [
    key,
    appState[key],
  ]);
  return JSON.stringify([
    elements,
    documentAppState,
    Object.keys(api.getFiles()).sort(),
  ]);
}

function serialize(api: ExcalidrawImperativeAPI): string {
  // `serializeAsJSON` produces the canonical Excalidraw file format with
  // stable key ordering, and passes `version`/`versionNonce`/`updated` through
  // untouched. Figuro deliberately does not normalise those.
  return serializeAsJSON(
    api.getSceneElements(),
    api.getAppState(),
    api.getFiles(),
    "local",
  );
}

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selectedElement, setSelectedElement] = useState<ExcalidrawElement | null>(null);
  const [selectionCount, setSelectionCount] = useState(0);
  const [stepDraft, setStepDraft] = useState("");
  const lastSignature = useRef<SceneSignature | null>(null);
  /**
   * Whether the user has touched the canvas since the document was loaded.
   *
   * Excalidraw normalises a scene when it restores it - filling in defaults,
   * assigning fractional indices, recomputing text metrics as fonts arrive -
   * and each of those bumps element versions. Those are not edits. Gating on
   * real user input, rather than on a settling timeout, is what guarantees
   * that opening a file and looking at it never rewrites it on disk.
   */
  const userHasEdited = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const flushTimer = useRef<number | null>(null);

  /**
   * Sends the document to the host, at most once per idle moment.
   *
   * Excalidraw reports a change on every pointer move, so a single drag
   * produces dozens of them. Serialising the whole scene that often would put
   * needless work on both sides of the bridge; the host only needs the state
   * the user came to rest on.
   */
  const scheduleFlush = useCallback(() => {
    if (!api) return;
    if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      postToHost({ type: "sceneChanged", json: serialize(api) });
    }, 250);
  }, [api]);

  const handleChange = useCallback(() => {
    if (!api) return;
    const selectedIds = api.getAppState().selectedElementIds;
    const selectedElements = api
      .getSceneElements()
      .filter((element) => selectedIds[element.id]);
    const singleSelection = selectedElements.length === 1 ? selectedElements[0] : null;
    setSelectionCount(selectedElements.length);
    setSelectedElement(singleSelection ?? null);
    setStepDraft(revealStepOf(singleSelection ?? null)?.toString() ?? "");

    const current = signature(api);
    // Until the user edits something, keep rebasing the baseline. Excalidraw
    // normalises a restored scene over several frames, and none of that is an
    // edit; folding it into the baseline means the first click or tool
    // shortcut cannot flush it to disk.
    if (!userHasEdited.current) {
      lastSignature.current = current;
      return;
    }
    if (current === lastSignature.current) return;
    lastSignature.current = current;
    scheduleFlush();
  }, [api, scheduleFlush]);

  const noteUserEdit = useCallback(() => {
    userHasEdited.current = true;
  }, []);

  const applyRevealStep = useCallback(
    (step: number | null) => {
      if (!api || !selectedElement) return;
      const elements = api.getSceneElementsIncludingDeleted().map((element) => {
        if (element.id !== selectedElement.id) return element;
        return withRevealStep(element, step) ?? element;
      });
      api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
    },
    [api, selectedElement],
  );

  /**
   * Keeps the drawing framed until the user takes over.
   *
   * The window is still settling to its final size when a document loads, so
   * fitting once would frame the scene against the wrong viewport and leave it
   * tucked under the toolbar. Re-fitting on resize, and only before the first
   * edit, gets it right without ever fighting the user's own panning.
   */
  const fitToViewport = useCallback(() => {
    if (!api || userHasEdited.current) return;
    const elements = api.getSceneElements();
    if (elements.length === 0) return;
    api.scrollToContent(elements, { fitToContent: true, animate: false });
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => fitToViewport());
    observer.observe(container);
    return () => observer.disconnect();
  }, [api, fitToViewport]);

  useEffect(() => {
    if (!api) return;

    /** Replaces the scene with the contents of a `.excalidraw` file. */
    const loadDocument = (json: string) => {
      // A pending flush belongs to the document being replaced.
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      const parsed = json.trim() === "" ? {} : JSON.parse(json);
      const scene = restore(parsed, null, null);
      api.updateScene({ ...scene, captureUpdate: "NEVER" });
      api.addFiles(Object.values(scene.files ?? {}));
      api.history.clear();
      userHasEdited.current = false;
      lastSignature.current = null;
      // The scene is committed after this turn of the event loop.
      requestAnimationFrame(() => fitToViewport());
    };

    const exportSVG = async (): Promise<string> => {
      const svg = await exportToSvg({
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
        exportPadding: 16,
      });
      return new XMLSerializer().serializeToString(svg);
    };

    /** Returns base64 because binary cannot cross the WKWebView bridge. */
    const exportPNG = async (scale: number): Promise<string> => {
      const blob = await exportToBlob({
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
        mimeType: "image/png",
        exportPadding: 16,
        getDimensions: (width: number, height: number) => ({
          width: width * scale,
          height: height * scale,
          scale,
        }),
      });
      const buffer = await blob.arrayBuffer();
      let binary = "";
      for (const byte of new Uint8Array(buffer)) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary);
    };

    window.figuro = {
      loadDocument,
      serialize: () => serialize(api),
      exportSVG,
      exportPNG,
    };

    postToHost({ type: "ready" });
    return () => {
      delete window.figuro;
    };
  }, [api, fitToViewport]);

  return (
    <div
      ref={containerRef}
      className="figuro-workspace"
      onPointerDownCapture={noteUserEdit}
      onKeyDownCapture={noteUserEdit}
      onPasteCapture={noteUserEdit}
      onDropCapture={noteUserEdit}
    >
      <div className="figuro-canvas">
        <Excalidraw
          excalidrawAPI={setApi}
          onChange={handleChange}
          // The macOS app owns the file lifecycle, so Excalidraw's own
          // open/save/export entries would be misleading.
          UIOptions={
            hasHost()
              ? {
                  canvasActions: {
                    loadScene: false,
                    saveToActiveFile: false,
                    export: false,
                    saveAsImage: false,
                  },
                }
              : undefined
          }
        />
      </div>

      <aside className="presentation-inspector" aria-label="Presentation inspector">
        <header className="inspector-heading">
          <div>
            <div className="inspector-eyebrow">Figuro metadata</div>
            <h1>Presentation</h1>
          </div>
          {selectionCount === 1 && <span className="selection-count">1 selected</span>}
        </header>

        {selectionCount === 0 ? (
          <p className="inspector-empty">
            Select one element in the drawing to edit its reveal step.
          </p>
        ) : selectionCount > 1 ? (
          <p className="inspector-empty">
            {selectionCount} elements selected. Select one element to edit its reveal step.
          </p>
        ) : (
          <>
            <section className="inspector-control">
              <label htmlFor="reveal-step-input">Reveal step</label>
              <p className="step-current">Current: {revealStepLabel(selectedElement)}</p>
              <div className="step-form">
                <input
                  id="reveal-step-input"
                  aria-label="Reveal step"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="e.g. 2"
                  value={stepDraft}
                  disabled={!selectedElement || !isEditableFiguroMetadata(selectedElement)}
                  onChange={(event) => setStepDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  onClick={() => applyRevealStep(Number(stepDraft))}
                  disabled={
                    !selectedElement ||
                    !isEditableFiguroMetadata(selectedElement) ||
                    stepDraft.trim() === "" ||
                    !Number.isSafeInteger(Number(stepDraft)) ||
                    Number(stepDraft) < 0
                  }
                >
                  Set step
                </button>
              </div>
              <button
                className="clear-step"
                type="button"
                onClick={() => applyRevealStep(null)}
                disabled={
                  !selectedElement ||
                  !isEditableFiguroMetadata(selectedElement) ||
                  !hasRevealStep(selectedElement)
                }
              >
                Clear step
              </button>
              <p className="inspector-help">
                Step 0 and elements without a step are visible initially.
              </p>
              {selectedElement && !isEditableFiguroMetadata(selectedElement) && (
                <p className="inspector-warning" role="status">
                  This element uses an unsupported Figuro metadata version. Its metadata is kept
                  unchanged.
                </p>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

declare global {
  interface Window {
    figuro?: {
      loadDocument: (json: string) => void;
      serialize: () => string;
      exportSVG: () => Promise<string>;
      exportPNG: (scale: number) => Promise<string>;
    };
  }
}
