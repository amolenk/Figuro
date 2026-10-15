import AppKit

/// Figuro is a document-based AppKit application.
///
/// `NSDocument` is what makes the app feel native: proxy icons, Versions,
/// autosave in place, revert, and correct Finder integration. SwiftUI's
/// `DocumentGroup` cannot express that faithfully, so AppKit owns the document
/// and window layer while SwiftUI is reserved for inspector UI later.
///
/// The app is launched from `main.swift` rather than by `@main` on this class.
/// AppKit's own `@main` defers to `NSApplicationMain`, which instantiates the
/// delegate from the main nib; with no nib there is no delegate, and none of
/// these methods ever run.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        // Instantiating the shared controller is what makes the app
        // document-based: it installs the open/save behaviour and lets Finder
        // hand files to us.
        let controller = NSDocumentController.shared
        // Autosave in place is inert without a delay: the default of zero
        // means "never autosave periodically". Documents would then only be
        // written on close or deactivation, which is not what a user editing a
        // local file expects.
        controller.autosavingDelay = 5

        MainMenu.install(into: NSApplication.shared)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

}
