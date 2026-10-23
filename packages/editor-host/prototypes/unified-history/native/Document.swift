import AppKit

// THROWAWAY: prototype save cache and semantic clean/dirty comparison.
final class Document: NSDocument {
    var contents = "{}"
    var edited = false
    override class var autosavesInPlace: Bool { false }
    override var isDocumentEdited: Bool { edited }
    override func makeWindowControllers() {
        let editor = EditorViewController()
        editor.document = self
        let window = NSWindow(contentViewController: editor)
        window.title = "History prototype \(UUID().uuidString.prefix(8))"
        let identifier = "history-window-\(UUID().uuidString)"
        window.setAccessibilityIdentifier(identifier)
        window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
        window.setContentSize(NSSize(width: 1400, height: 1000))
        addWindowController(NSWindowController(window: window))
        let activate = NSMenuItem(title: "Activate \(identifier)", action: #selector(NSWindow.makeKeyAndOrderFront(_:)), keyEquivalent: "")
        activate.target = window
        NSApplication.shared.windowsMenu?.addItem(activate)
    }
    override func data(ofType typeName: String) throws -> Data { Data(contents.utf8) }
    override func read(from data: Data, ofType typeName: String) throws {
        MainActor.assumeIsolated { contents = String(decoding: data, as: UTF8.self) }
    }
    func accept(json: String, dirty: Bool) {
        contents = json
        guard edited != dirty else { return }
        edited = dirty
        updateChangeCount(dirty ? .changeDone : .changeCleared)
    }
}
