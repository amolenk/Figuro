import AppKit
import WebKit

@MainActor
protocol EditorViewControllerDelegate: AnyObject {
    /// The scene changed in a way that affects the saved file.
    ///
    /// View-only changes - scrolling, zooming, selection, tool switches - never
    /// reach here, so opening a document and panning around leaves it clean.
    func editor(_ editor: EditorViewController, didChangeSceneTo json: String)
}

/// Hosts the Excalidraw editor and owns the JavaScript bridge.
final class EditorViewController: NSViewController {
    /// A canvas has no intrinsic size, so the view controller states a default
    /// one. Without it, `NSWindow.contentViewController` sizes the window to
    /// the view's fitting size, which is zero.
    static let defaultSize = NSSize(width: 1280, height: 820)

    weak var delegate: EditorViewControllerDelegate?

    private var webView: WKWebView!
    private var isReady = false
    /// Document contents supplied before the host finished loading.
    private var pendingDocument: String?

    override func loadView() {
        guard let root = Bundle.main.url(forResource: "EditorHost", withExtension: nil) else {
            fatalError("EditorHost resources are missing from the app bundle.")
        }

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(
            EditorHostSchemeHandler(root: root),
            forURLScheme: EditorHostSchemeHandler.scheme)
        configuration.userContentController.add(MessageProxy(self), name: "figuro")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        #if DEBUG
            webView.isInspectable = true
        #endif

        // A web view has no intrinsic content size. Hosting it directly would
        // let Auto Layout resolve the window's content size to zero, which
        // AppKit then clamps to the minimum. The container carries a
        // low-priority preferred size instead, so the window opens at a sane
        // size and still resizes freely.
        let container = NSView(frame: NSRect(origin: .zero, size: Self.defaultSize))
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)

        let width = container.widthAnchor.constraint(equalToConstant: Self.defaultSize.width)
        let height = container.heightAnchor.constraint(equalToConstant: Self.defaultSize.height)
        width.priority = .defaultLow
        height.priority = .defaultLow

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            width,
            height,
        ])

        view = container
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: EditorHostSchemeHandler.indexURL))
    }

    /// Replaces the editor's scene with the given `.excalidraw` contents.
    func load(document json: String) {
        guard isReady else {
            pendingDocument = json
            return
        }
        call("loadDocument", arguments: ["json": json]) { _ in }
    }

    func exportSVG(completion: @escaping (Result<Data, Error>) -> Void) {
        call("exportSVG", arguments: [:]) { result in
            completion(
                result.flatMap { value in
                    guard let svg = value as? String, let data = svg.data(using: .utf8) else {
                        return .failure(BridgeError.unexpectedResult)
                    }
                    return .success(data)
                })
        }
    }

    func exportPNG(scale: Double, completion: @escaping (Result<Data, Error>) -> Void) {
        call("exportPNG", arguments: ["scale": scale]) { result in
            completion(
                result.flatMap { value in
                    guard let base64 = value as? String,
                        let data = Data(base64Encoded: base64)
                    else {
                        return .failure(BridgeError.unexpectedResult)
                    }
                    return .success(data)
                })
        }
    }

    // MARK: - Bridge plumbing

    /// Calls `window.figuro.<name>` with named arguments.
    ///
    /// Arguments are passed as real values rather than interpolated into a
    /// script string, so document contents can never be mistaken for code.
    private func call(
        _ name: String,
        arguments: [String: Any],
        completion: @escaping (Result<Any, Error>) -> Void
    ) {
        let names = arguments.keys.joined(separator: ", ")
        let script = "return await window.figuro.\(name)(\(names));"
        webView.callAsyncJavaScript(
            script, arguments: arguments, in: nil, in: .page
        ) { result in
            completion(result.mapError { $0 as Error })
        }
    }

    fileprivate func handle(message: [String: Any]) {
        switch message["type"] as? String {
        case "ready":
            isReady = true
            if let pending = pendingDocument {
                pendingDocument = nil
                load(document: pending)
            }
        case "sceneChanged":
            guard let json = message["json"] as? String else { return }
            delegate?.editor(self, didChangeSceneTo: json)
        case "log":
            let level = message["level"] as? String ?? "log"
            let text = message["message"] as? String ?? ""
            NSLog("[editor-host %@] %@", level, text)
        default:
            NSLog("[editor-host] unknown message: %@", String(describing: message))
        }
    }

    enum BridgeError: Error {
        case unexpectedResult
    }

    /// Breaks the retain cycle WKUserContentController would otherwise create
    /// by holding its message handlers strongly.
    private final class MessageProxy: NSObject, WKScriptMessageHandler {
        private weak var owner: EditorViewController?

        init(_ owner: EditorViewController) {
            self.owner = owner
        }

        func userContentController(
            _ controller: WKUserContentController, didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any] else { return }
            owner?.handle(message: body)
        }
    }
}

extension EditorViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error
    ) {
        NSLog("[editor-host] navigation failed: %@", error.localizedDescription)
    }

    func webView(
        _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        NSLog("[editor-host] load failed: %@", error.localizedDescription)
    }
}
