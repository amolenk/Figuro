import AppKit
import WebKit

@MainActor
final class EditorViewController: NSViewController, WKScriptMessageHandler {
    weak var document: Document?
    private var webView: HistoryWebView!
    private var statusLabel: NSTextField!
    private var documentStatus: [String: Any] = [:]
    private var sequence = 0
    private var waiting = false
    private var queued: [String] = []

    override func loadView() {
        let root = Bundle.main.url(forResource: "EditorHost", withExtension: nil)!
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(EditorHostSchemeHandler(root: root), forURLScheme: EditorHostSchemeHandler.scheme)
        config.userContentController.add(self, name: "figuro")
        webView = HistoryWebView(frame: .zero, configuration: config)
        webView.host = self
        let container = NSView(frame: NSRect(x: 0, y: 0, width: 1400, height: 1000))
        webView.frame = NSRect(x: 0, y: 60, width: 1400, height: 940)
        webView.autoresizingMask = [.width, .height]
        container.addSubview(webView)
        statusLabel = NSTextField(labelWithString: "Loading prototype")
        statusLabel.setAccessibilityIdentifier("native-history-state")
        statusLabel.frame = NSRect(x: 10, y: 32, width: 1350, height: 20)
        statusLabel.autoresizingMask = [.width]
        container.addSubview(statusLabel)
        let field = NSTextField(string: "")
        field.placeholderString = "Native text draft"
        field.setAccessibilityIdentifier("native-draft")
        field.frame = NSRect(x: 10, y: 3, width: 220, height: 25)
        container.addSubview(field)
        let save = NSButton(title: "Snapshot save", target: self, action: #selector(snapshotSave(_:)))
        save.setAccessibilityIdentifier("snapshot-save")
        save.frame = NSRect(x: 240, y: 3, width: 130, height: 25)
        container.addSubview(save)
        let focus = NSButton(title: "Focus drawing", target: self, action: #selector(focusDrawing(_:)))
        focus.frame = NSRect(x: 380, y: 3, width: 130, height: 25)
        container.addSubview(focus)
        view = container
        webView.load(URLRequest(url: EditorHostSchemeHandler.indexURL))
    }
    @objc private func snapshotSave(_ sender: Any?) {
        webView.callAsyncJavaScript("return window.historyPrototype.actions.save();", arguments: [:], in: nil, in: .page) { _ in }
    }
    @objc private func focusDrawing(_ sender: Any?) {
        view.window?.makeKeyAndOrderFront(nil)
        view.window?.makeFirstResponder(webView)
        webView.callAsyncJavaScript("document.querySelector('.excalidraw-container').focus();", arguments: [:], in: nil, in: .page) { [weak self] _ in self?.display() }
    }
    func execute(_ direction: String) {
        queued.append(direction)
        drain()
    }
    private func drain() {
        guard !waiting, !queued.isEmpty else { return }
        waiting = true
        let direction = queued.removeFirst()
        webView.callAsyncJavaScript("return await window.historyPrototype.command(direction);", arguments: ["direction": direction], in: nil, in: .page) { [weak self] result in
            guard let self else { return }
            self.waiting = false
            if case .success(let value) = result, let state = value as? [String: Any] { self.accept(state) }
            self.sequence += 1
            self.display()
            self.drain()
        }
    }
    func allowed(_ direction: String) -> Bool {
        guard !waiting, let history = documentStatus["history"] as? [String: Any] else { return false }
        return history["busy"] as? Bool != true && history[direction == "undo" ? "canUndo" : "canRedo"] as? Bool == true
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "prototypeState" else { return }
        accept(body)
    }
    private func accept(_ state: [String: Any]) {
        documentStatus = state
        if let text = state["editingText"] as? Bool { webView.domTextFocused = text }
        if let json = state["json"] as? String { document?.accept(json: json, dirty: state["dirty"] as? Bool == true) }
        display()
    }
    private func display() {
        let elements = documentStatus["elements"] as? [[String: Any]] ?? []
        let data = documentStatus["documentData"] as? [String: Any] ?? [:]
        let cards = data["cards"] as? [[String: Any]] ?? []
        let history = documentStatus["history"] as? [String: Any] ?? [:]
        statusLabel.stringValue = "Shapes=\(elements.count) X=\(elements.first?["x"] ?? "none") Cards=\(cards.count) Title=\(cards.first?["title"] ?? "none") Undo=\(history["undoEntries"] ?? 0) Redo=\(history["redoEntries"] ?? 0) Dirty=\(documentStatus["dirty"] as? Bool == true ? "yes" : "no") Requests=\(sequence) Text=\(webView.domTextFocused ? "yes" : "no") Key=\(view.window?.isKeyWindow == true ? "yes" : "no")"
    }
}

// Standard responder-chain undo/redo: native text controls keep their own manager;
// this WKWebView facade chooses DOM draft editing or the shared document history.
@MainActor
final class HistoryWebView: WKWebView, NSMenuItemValidation {
    weak var host: EditorViewController?
    var domTextFocused = false
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard window?.firstResponder === self else { return super.performKeyEquivalent(with: event) }
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        if event.charactersIgnoringModifiers?.lowercased() == "z",
           modifiers.contains(.command), !modifiers.contains(.option), !modifiers.contains(.control) {
            if modifiers.contains(.shift) { redo(nil) } else { undo(nil) }
            return true
        }
        return super.performKeyEquivalent(with: event)
    }
    @objc func undo(_ sender: Any?) {
        if domTextFocused { undoManager?.undo() } else { host?.execute("undo") }
    }
    @objc func redo(_ sender: Any?) {
        if domTextFocused { undoManager?.redo() } else { host?.execute("redo") }
    }
    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        if item.action == NSSelectorFromString("undo:") {
            return domTextFocused ? undoManager?.canUndo == true : host?.allowed("undo") == true
        }
        if item.action == NSSelectorFromString("redo:") {
            return domTextFocused ? undoManager?.canRedo == true : host?.allowed("redo") == true
        }
        return true
    }
}
