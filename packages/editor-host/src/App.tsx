import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  newElementWith,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import { inspectFiguroMetadata, isNonNegativeInteger } from "@figuro/schema";
import type { FiguroMetadataV1 } from "@figuro/schema";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  type KeyboardEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
type SceneInteraction = {
  kind: "pointer" | "keyboard";
  signature: SceneSignature;
  activeTool: string;
  canCreateSceneElement: boolean;
  isEditorControl: boolean;
  isPanGesture: boolean;
  hitElement: boolean;
  dragged: boolean;
};
type PendingContent = { elementIds: Set<string>; fileIds: Set<string> };

function isEditableFiguroMetadata(element: ExcalidrawElement): boolean {
  return inspectFiguroMetadata(element.customData?.figuro).kind !== "opaque";
}

function revealStepOf(element: ExcalidrawElement | null): number | null {
  if (!element) return null;
  const state = inspectFiguroMetadata(element.customData?.figuro);
  if (state.kind !== "v1" || !isNonNegativeInteger(state.metadata.step)) return null;
  return state.metadata.step;
}

function revealStepLabel(element: ExcalidrawElement | null): string {
  if (!element) return "";
  const state = inspectFiguroMetadata(element.customData?.figuro);
  if (state.kind === "unannotated") return "No step · visible initially";
  if (state.kind === "opaque") return "Unsupported Figuro metadata";
  if (!("step" in state.metadata)) return "No step · visible initially";
  const step = isNonNegativeInteger(state.metadata.step) ? state.metadata.step : null;
  return step === null ? "Invalid reveal step" : `Step ${step}`;
}

function hasRevealStep(element: ExcalidrawElement | null): boolean {
  if (!element) return false;
  const state = inspectFiguroMetadata(element.customData?.figuro);
  return state.kind === "v1" && "step" in state.metadata;
}

function semanticStyleRoleOf(element: ExcalidrawElement | null): string | null {
  if (!element) return null;
  const state = inspectFiguroMetadata(element.customData?.figuro);
  if (state.kind !== "v1" || typeof state.metadata.role !== "string") return null;
  return state.metadata.role;
}

function semanticStyleRoleLabel(element: ExcalidrawElement | null): string {
  if (!element) return "";
  const state = inspectFiguroMetadata(element.customData?.figuro);
  if (state.kind === "unannotated") return "No role";
  if (state.kind === "opaque") return "Unsupported Figuro metadata";
  if (!("role" in state.metadata)) return "No role";
  return typeof state.metadata.role === "string"
    ? `Role ${state.metadata.role}`
    : "Invalid semantic style role";
}

function hasSemanticStyleRole(element: ExcalidrawElement | null): boolean {
  if (!element) return false;
  const state = inspectFiguroMetadata(element.customData?.figuro);
  return state.kind === "v1" && "role" in state.metadata;
}

type PresentationEdit =
  | { field: "step"; value: number | null }
  | { field: "role"; value: string | null };

function withPresentationEdit(
  element: ExcalidrawElement,
  edit: PresentationEdit,
): ExcalidrawElement | null {
  const customData: Record<string, unknown> = { ...element.customData };
  const existing = inspectFiguroMetadata(customData.figuro);
  if (existing.kind === "opaque") return null;
  if (edit.value === null && existing.kind === "unannotated") return element;
  if (
    existing.kind === "v1" &&
    ((edit.value === null && !(edit.field in existing.metadata)) ||
      (edit.value !== null && existing.metadata[edit.field] === edit.value))
  ) {
    return element;
  }

  const metadata: FiguroMetadataV1 =
    existing.kind === "v1" ? { ...existing.metadata } : { v: 1 };
  if (edit.value === null) delete metadata[edit.field];
  else if (edit.field === "step") metadata.step = edit.value;
  else metadata.role = edit.value;

  if (Object.keys(metadata).every((key) => key === "v")) {
    delete customData.figuro;
  } else {
    customData.figuro = metadata;
  }

  return newElementWith(
    element,
    { customData: Object.keys(customData).length > 0 ? customData : undefined },
    // Clearing the last annotation also needs a version bump when customData becomes undefined.
    true,
  );
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
  const [roleDraft, setRoleDraft] = useState("");
  const selectedElementId = useRef<string | null>(null);
  const selectedRevealStep = useRef<number | null>(null);
  const selectedSemanticStyleRole = useRef<string | null>(null);
  const lastSignature = useRef<SceneSignature | null>(null);
  const sceneInteraction = useRef<SceneInteraction | null>(null);
  const pendingContent = useRef<PendingContent | null>(null);
  /**
   * Whether an actual document edit has occurred since the document was loaded.
   *
   * Excalidraw normalises a scene when it restores it - filling in defaults,
   * assigning fractional indices, recomputing text metrics as fonts arrive -
   * and each of those can change fields that belong to the saved scene. Those
   * normalisations are rebased until an actual scene edit occurs; view-only
   * actions never release the guard.
   */
  const userHasEdited = useRef(false);
  const userHasInteracted = useRef(false);
  const spacebarHeld = useRef(false);
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
    const singleSelectionId = singleSelection?.id ?? null;
    const singleSelectionStep = revealStepOf(singleSelection ?? null);
    const singleSelectionRole = semanticStyleRoleOf(singleSelection ?? null);
    setSelectionCount(selectedElements.length);
    setSelectedElement(singleSelection ?? null);
    if (
      singleSelectionId !== selectedElementId.current ||
      singleSelectionRole !== selectedSemanticStyleRole.current
    ) {
      selectedSemanticStyleRole.current = singleSelectionRole;
      setRoleDraft(singleSelectionRole ?? "");
    }
    if (
      singleSelectionId !== selectedElementId.current ||
      singleSelectionStep !== selectedRevealStep.current
    ) {
      selectedElementId.current = singleSelectionId;
      selectedRevealStep.current = singleSelectionStep;
      setStepDraft(singleSelectionStep?.toString() ?? "");
    }

    const current = signature(api);
    if (!userHasEdited.current && pendingContent.current) {
      const pending = pendingContent.current;
      const addedElement = api
        .getSceneElements()
        .some((element) => !pending.elementIds.has(element.id));
      const addedFile = Object.keys(api.getFiles()).some((id) => !pending.fileIds.has(id));
      if (addedElement || addedFile) {
        userHasEdited.current = true;
        userHasInteracted.current = true;
        pendingContent.current = null;
        sceneInteraction.current = null;
        lastSignature.current = current;
        scheduleFlush();
        return;
      }
    }
    if (userHasEdited.current) pendingContent.current = null;
    // Rebase through restore normalisation until a real scene edit occurs.
    // While a pointer interaction is in progress, hold the starting signature
    // so its completion can distinguish an edit from a view-only action.
    if (!userHasEdited.current) {
      if (sceneInteraction.current === null) {
        lastSignature.current = current;
      }
      return;
    }
    if (current === lastSignature.current) return;
    lastSignature.current = current;
    scheduleFlush();
  }, [api, scheduleFlush]);

  const noteUserEdit = useCallback(() => {
    userHasEdited.current = true;
    userHasInteracted.current = true;
  }, []);

  const beginSceneInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    userHasInteracted.current = true;
    if (!api) return;
    const activeTool = api.getAppState().activeTool.type;
    const target = event.target;
    sceneInteraction.current = {
      kind: "pointer",
      signature: signature(api),
      activeTool,
      canCreateSceneElement: !["selection", "hand", "laser", "custom"].includes(activeTool),
      isEditorControl:
        target instanceof Element &&
        target.closest("button, input, select, [role='button']") !== null,
      isPanGesture: event.button !== 0 || spacebarHeld.current,
      hitElement: false,
      dragged: false,
    };
  }, [api]);

  const beginKeyboardSceneInteraction = useCallback(() => {
    userHasInteracted.current = true;
    if (!api || sceneInteraction.current?.kind === "keyboard") return;
    if (sceneInteraction.current !== null) return;

    sceneInteraction.current = {
      kind: "keyboard",
      signature: signature(api),
      activeTool: api.getAppState().activeTool.type,
      canCreateSceneElement: false,
      isEditorControl: false,
      isPanGesture: false,
      hitElement: false,
      dragged: false,
    };
  }, [api]);

  const beginExternalContentInteraction = useCallback(() => {
    if (!api || pendingContent.current) return;
    pendingContent.current = {
      elementIds: new Set(api.getSceneElements().map((element) => element.id)),
      fileIds: new Set(Object.keys(api.getFiles())),
    };
    userHasInteracted.current = true;
  }, [api]);

  const finishSceneInteraction = useCallback(() => {
    if (!api) return;
    const before = sceneInteraction.current;
    sceneInteraction.current = null;
    if (before === null) return;

    const current = signature(api);
    const activeTool = api.getAppState().activeTool.type;
    const wasViewOnlyToolGesture =
      before.activeTool === "hand" ||
      activeTool !== before.activeTool ||
      before.isPanGesture;
    const couldEditScene =
      before.kind === "keyboard" ||
      before.canCreateSceneElement ||
      before.isEditorControl ||
      (before.activeTool === "selection" && before.hitElement && before.dragged);
    if (
      !userHasEdited.current &&
      current !== before.signature &&
      couldEditScene &&
      !wasViewOnlyToolGesture
    ) {
      userHasEdited.current = true;
      lastSignature.current = current;
      scheduleFlush();
    } else if (!userHasEdited.current) {
      lastSignature.current = current;
    }
  }, [api, scheduleFlush]);

  const noteCanvasKeyEdit = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      userHasInteracted.current = true;
      if (event.code === "Space") spacebarHeld.current = true;
      const key = event.key.toLowerCase();
      const isTextEditor =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target instanceof HTMLTextAreaElement);
      const hasSelection =
        api !== null && Object.values(api.getAppState().selectedElementIds).some(Boolean);
      const editsText =
        isTextEditor &&
        (key.length === 1 || ["enter", "backspace", "delete"].includes(key));
      const editsSelection =
        !isTextEditor &&
        hasSelection &&
        [
          "backspace",
          "delete",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(key);
      const editsWithShortcut =
        (event.metaKey || event.ctrlKey) &&
        (key === "v" || (hasSelection && ["x", "y", "z", "d", "g"].includes(key)));

      if (editsText || editsSelection || editsWithShortcut) {
        beginKeyboardSceneInteraction();
      }
    },
    [api, beginKeyboardSceneInteraction],
  );

  const handleCanvasPaste = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.clipboardData.types.length === 0
      ) {
        return;
      }
      const isTextEditor =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target instanceof HTMLTextAreaElement);
      if (isTextEditor) {
        beginKeyboardSceneInteraction();
        window.setTimeout(() => {
          if (sceneInteraction.current?.kind === "keyboard") finishSceneInteraction();
        }, 0);
        return;
      }
      if (event.clipboardData.types.length > 0) beginExternalContentInteraction();
    },
    [beginExternalContentInteraction, beginKeyboardSceneInteraction, finishSceneInteraction],
  );

  const handleCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        (event.dataTransfer.files.length === 0 && event.dataTransfer.types.length === 0)
      ) {
        return;
      }
      beginExternalContentInteraction();
    },
    [beginExternalContentInteraction],
  );

  const releaseCanvasKey = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.code === "Space") spacebarHeld.current = false;
  }, []);

  useEffect(() => {
    const finishAfterPointerEvents = () => {
      // Excalidraw's click handlers may apply a scene update after pointerup.
      if (sceneInteraction.current?.kind !== "pointer") return;
      window.setTimeout(() => {
        if (sceneInteraction.current?.kind === "pointer") finishSceneInteraction();
      }, 0);
    };
    const finishAfterKeyboardEvent = () => {
      if (sceneInteraction.current?.kind !== "keyboard") return;
      window.setTimeout(() => {
        if (sceneInteraction.current?.kind === "keyboard") finishSceneInteraction();
      }, 0);
    };
    window.addEventListener("pointerup", finishAfterPointerEvents);
    window.addEventListener("pointercancel", finishAfterPointerEvents);
    window.addEventListener("keyup", finishAfterKeyboardEvent);
    return () => {
      window.removeEventListener("pointerup", finishAfterPointerEvents);
      window.removeEventListener("pointercancel", finishAfterPointerEvents);
      window.removeEventListener("keyup", finishAfterKeyboardEvent);
    };
  }, [finishSceneInteraction]);

  const applyPresentationEdit = useCallback(
    (edit: PresentationEdit) => {
      if (!api || !selectedElement) return;
      let changed = false;
      const elements = api.getSceneElementsIncludingDeleted().map((element) => {
        if (element.id !== selectedElement.id) return element;
        const updated = withPresentationEdit(element, edit);
        if (updated && updated !== element) changed = true;
        return updated ?? element;
      });
      if (!changed) return;
      noteUserEdit();
      api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
    },
    [api, noteUserEdit, selectedElement],
  );

  /**
   * Keeps the drawing framed until the user takes over.
   *
   * The window is still settling to its final size when a document loads, so
   * fitting once would frame the scene against the wrong viewport and leave it
   * tucked under the toolbar. Re-fitting on resize, and only before the user
   * takes over the view or edits the scene, gets it right without fighting the
   * user's own panning.
   */
  const fitToViewport = useCallback(() => {
    if (!api || userHasInteracted.current) return;
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
      userHasInteracted.current = false;
      lastSignature.current = null;
      sceneInteraction.current = null;
      pendingContent.current = null;
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

  const parsedStepDraft = Number(stepDraft);
  const canSetStep =
    selectedElement !== null &&
    isEditableFiguroMetadata(selectedElement) &&
    stepDraft.trim() !== "" &&
    isNonNegativeInteger(parsedStepDraft);
  const canSetRole =
    selectedElement !== null &&
    isEditableFiguroMetadata(selectedElement) &&
    roleDraft.trim() !== "";

  return (
    <div
      ref={containerRef}
      className="figuro-workspace"
    >
      <div
        className="figuro-canvas"
        onPointerDownCapture={beginSceneInteraction}
        onKeyDownCapture={noteCanvasKeyEdit}
        onKeyUpCapture={releaseCanvasKey}
        onPasteCapture={handleCanvasPaste}
        onDropCapture={handleCanvasDrop}
        onWheelCapture={() => {
          userHasInteracted.current = true;
        }}
      >
        <Excalidraw
          excalidrawAPI={setApi}
          onChange={handleChange}
          onPointerDown={(_activeTool, pointerDownState) => {
            if (!sceneInteraction.current) return;
            sceneInteraction.current.hitElement =
              pointerDownState.hit.element !== null || pointerDownState.resize.isResizing;
          }}
          onPointerUp={(_activeTool, pointerDownState) => {
            if (!sceneInteraction.current) return;
            sceneInteraction.current.dragged = pointerDownState.drag.hasOccurred;
          }}
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
            Select one element in the drawing to edit its reveal step and semantic style role.
          </p>
        ) : selectionCount > 1 ? (
          <p className="inspector-empty">
            {selectionCount} elements selected. Select one element to edit its reveal step and
            semantic style role.
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
                  onClick={() =>
                    canSetStep && applyPresentationEdit({ field: "step", value: parsedStepDraft })
                  }
                  disabled={!canSetStep}
                >
                  Set step
                </button>
              </div>
              <button
                className="clear-step"
                type="button"
                onClick={() => applyPresentationEdit({ field: "step", value: null })}
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
            </section>
            <section className="inspector-control">
              <label htmlFor="semantic-style-role-input">Semantic style role</label>
              <p className="role-current">Current: {semanticStyleRoleLabel(selectedElement)}</p>
              <div className="role-form">
                <input
                  id="semantic-style-role-input"
                  aria-label="Semantic style role"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="e.g. primary"
                  value={roleDraft}
                  disabled={!selectedElement || !isEditableFiguroMetadata(selectedElement)}
                  onChange={(event) => setRoleDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  onClick={() =>
                    canSetRole && applyPresentationEdit({ field: "role", value: roleDraft })
                  }
                  disabled={!canSetRole}
                >
                  Set role
                </button>
              </div>
              <button
                className="clear-role"
                type="button"
                onClick={() => applyPresentationEdit({ field: "role", value: null })}
                disabled={
                  !selectedElement ||
                  !isEditableFiguroMetadata(selectedElement) ||
                  !hasSemanticStyleRole(selectedElement)
                }
              >
                Clear role
              </button>
              <p className="inspector-help">
                A presentation stylesheet can style this role. The drawing's appearance stays the
                same in Figuro.
              </p>
            </section>
            {selectedElement && !isEditableFiguroMetadata(selectedElement) && (
              <p className="inspector-warning" role="status">
                This element uses an unsupported Figuro metadata version. Its metadata is kept
                unchanged.
              </p>
            )}
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
