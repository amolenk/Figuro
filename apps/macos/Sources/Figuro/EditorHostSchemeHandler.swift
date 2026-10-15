import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the bundled editor host over a custom URL scheme.
///
/// `file://` cannot be used: ES module scripts loaded from a file URL have a
/// null origin and are blocked. A custom scheme gives the host a real origin
/// while keeping everything inside the app bundle and entirely offline.
final class EditorHostSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "figuro"
    static let host = "editor"

    /// The URL of the editor host's entry point.
    static var indexURL: URL {
        URL(string: "\(scheme)://\(host)/index.html")!
    }

    private let root: URL

    /// - Parameter root: directory containing the built editor host.
    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(HostError.notFound)
            return
        }

        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }

        let resolved = root.appendingPathComponent(path).standardizedFileURL

        // Reject anything that escapes the bundle, however it was encoded.
        guard resolved.path.hasPrefix(root.path + "/") else {
            task.didFailWithError(HostError.forbidden)
            return
        }

        guard let data = try? Data(contentsOf: resolved) else {
            task.didFailWithError(HostError.notFound)
            return
        }

        let response = URLResponse(
            url: url,
            mimeType: Self.mimeType(for: resolved),
            expectedContentLength: data.count,
            textEncodingName: nil)

        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private static func mimeType(for url: URL) -> String {
        // The system's type table misses some web types, so the ones the host
        // actually depends on are stated explicitly.
        switch url.pathExtension.lowercased() {
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "html": return "text/html"
        case "json", "map": return "application/json"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "wasm": return "application/wasm"
        default:
            return UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
                ?? "application/octet-stream"
        }
    }

    enum HostError: Error {
        case notFound
        case forbidden
    }
}
