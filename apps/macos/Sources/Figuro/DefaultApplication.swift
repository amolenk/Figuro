import AppKit
import UniformTypeIdentifiers

@MainActor
enum DefaultApplication {
    private static let didRequestKey = "DidRequestExcalidrawDefaultApplication"
    private static var requestInProgress = false

    static func requestOnFirstLaunch() {
        // UI tests must not change the Mac runner's file associations or show
        // a system consent dialog. Skipping also leaves the first-launch flag alone.
        guard ProcessInfo.processInfo.environment["FIGURO_SKIP_DEFAULT_APP_REQUEST"] != "1",
              !UserDefaults.standard.bool(forKey: didRequestKey) else { return }

        // Record the attempt, including a declined request, so a later launch
        // respects the user's choice. The menu action can always retry.
        UserDefaults.standard.set(true, forKey: didRequestKey)
        request()
    }

    static func request() {
        guard !requestInProgress else { return }
        requestInProgress = true

        Task { @MainActor in
            defer { requestInProgress = false }
            do {
                // Use the drawing's declared type, never its public.json parent.
                // macOS presents its own consent UI when required.
                try await NSWorkspace.shared.setDefaultApplication(
                    at: Bundle.main.bundleURL,
                    toOpen: UTType(importedAs: "com.excalidraw.excalidraw"))
            } catch {
                let error = error as NSError
                if (error.domain == NSCocoaErrorDomain && error.code == NSUserCancelledError)
                    || (error.domain == NSOSStatusErrorDomain && error.code == -128) {
                    return
                }
                NSApplication.shared.presentError(error)
            }
        }
    }
}
