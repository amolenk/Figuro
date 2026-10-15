import AppKit
import UniformTypeIdentifiers

final class Document: NSDocument {
    /// A minimal, valid `.excalidraw` file, used for new documents.
    private static let emptyScene = """
        {
          "type": "excalidraw",
          "version": 2,
          "source": "https://excalidraw.com",
          "elements": [],
          "appState": {
            "gridSize": null,
            "viewBackgroundColor": "#ffffff"
          },
          "files": {}
        }
        """

    /// The document's contents, exactly as they will be written to disk.
    ///
    /// The editor host pushes canonical Excalidraw JSON on every real change,
    /// so saving is a synchronous read of this cache rather than a round trip
    /// into the web view.
    private var contents: String = Document.emptyScene

    private weak var editor: EditorViewController?

    override class var autosavesInPlace: Bool { true }

    override func makeWindowControllers() {
        let editor = EditorViewController()
        editor.delegate = self
        self.editor = editor

        let window = NSWindow(contentViewController: editor)
        window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
        window.setContentSize(EditorViewController.defaultSize)
        window.contentMinSize = NSSize(width: 640, height: 480)
        window.tabbingMode = .preferred

        let controller = NSWindowController(window: window)
        // Document windows remember one shared frame, which is the standard
        // behaviour for a document application. Cascading is mutually
        // exclusive with a frame autosave name, so it stays off.
        controller.shouldCascadeWindows = false
        controller.windowFrameAutosaveName = "FiguroDocumentWindow"
        addWindowController(controller)

        editor.load(document: contents)
    }

    // MARK: - Reading and writing

    override func data(ofType typeName: String) throws -> Data {
        guard let data = contents.data(using: .utf8) else {
            throw CocoaError(.fileWriteInapplicableStringEncoding)
        }
        return data
    }

    override func read(from data: Data, ofType typeName: String) throws {
        guard let text = String(data: data, encoding: .utf8) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        contents = text
        // Reading also happens on Revert, when a window already exists.
        editor?.load(document: text)
    }

    // MARK: - Export

    @objc func exportSVG(_ sender: Any?) {
        export(extension: "svg", type: .svg) { editor, completion in
            editor.exportSVG(completion: completion)
        }
    }

    @objc func exportPNG(_ sender: Any?) {
        export(extension: "png", type: .png) { editor, completion in
            editor.exportPNG(scale: 2, completion: completion)
        }
    }

    private func export(
        extension pathExtension: String,
        type: UTType,
        using produce: @escaping (EditorViewController, @escaping (Result<Data, Error>) -> Void) ->
            Void
    ) {
        guard let editor, let window = windowControllers.first?.window else { return }

        let panel = NSSavePanel()
        panel.allowedContentTypes = [type]
        panel.nameFieldStringValue =
            (displayName as NSString).deletingPathExtension + "." + pathExtension
        // Exports almost always belong beside the drawing they came from.
        panel.directoryURL = fileURL?.deletingLastPathComponent()

        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            produce(editor) { result in
                switch result {
                case .success(let data):
                    do {
                        try data.write(to: url, options: .atomic)
                    } catch {
                        self.presentError(error)
                    }
                case .failure(let error):
                    self.presentError(error)
                }
            }
        }
    }
}

extension Document: EditorViewControllerDelegate {
    func editor(_ editor: EditorViewController, didChangeSceneTo json: String) {
        guard json != contents else { return }
        contents = json
        updateChangeCount(.changeDone)
    }
}
