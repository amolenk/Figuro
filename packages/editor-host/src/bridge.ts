/**
 * The JavaScript half of the Figuro bridge.
 *
 * Swift calls into `window.figuro.*`; the host calls back through the
 * `figuro` WKScriptMessageHandler. Everything crossing the boundary is plain
 * JSON so that neither side needs to know about the other's object graph.
 */

export type HostMessage =
  | { type: "ready" }
  | { type: "sceneChanged"; json: string }
  | { type: "log"; level: "warn" | "error"; message: string };

interface WebKitBridge {
  messageHandlers?: {
    figuro?: { postMessage: (message: HostMessage) => void };
  };
}

declare global {
  interface Window {
    webkit?: WebKitBridge;
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

/**
 * True when running inside the macOS app. During `pnpm dev` in a browser there
 * is no host, and the editor simply runs standalone.
 */
export const hasHost = (): boolean =>
  typeof window.webkit?.messageHandlers?.figuro?.postMessage === "function";

export function postToHost(message: HostMessage): void {
  window.webkit?.messageHandlers?.figuro?.postMessage(message);
}

/**
 * Forwards uncaught errors to the host.
 *
 * Without this, a failure inside the web view is invisible: the window simply
 * stays blank with nothing in the app's log.
 */
export function reportErrorsToHost(): void {
  window.addEventListener("error", (event) => {
    postToHost({
      type: "log",
      level: "error",
      message: `${event.message} (${event.filename}:${event.lineno})`,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    postToHost({
      type: "log",
      level: "error",
      message: `Unhandled rejection: ${String(event.reason)}`,
    });
  });
}

