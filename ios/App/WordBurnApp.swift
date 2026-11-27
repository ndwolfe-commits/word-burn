// The app is one screen: the game, shown in a web view and served from files inside the app.
import SwiftUI
import WebKit

@main
struct WordBurnApp: App {
    var body: some Scene { WindowGroup { GameView().ignoresSafeArea() } }
}

struct GameView: UIViewRepresentable {
    func makeCoordinator() -> Ears { Ears() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleFiles(), forURLScheme: "wordburn")
        config.userContentController.add(context.coordinator, name: "ears")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.bounces = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.page = view
        view.load(URLRequest(url: URL(string: "wordburn://game/index.html")!))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}
}

/// Serves the game's files from the "web" folder inside the app. Anything else is "not found".
final class BundleFiles: NSObject, WKURLSchemeHandler {
    private let types = ["html": "text/html", "js": "text/javascript", "json": "application/json", "png": "image/png",
                         "webmanifest": "application/manifest+json", "css": "text/css"]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let root = Bundle.main.resourceURL?.appendingPathComponent("web").standardizedFileURL else {
            task.didFailWithError(URLError(.badURL)); return
        }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
            task.didFinish(); return
        }
        let headers = ["Content-Type": types[file.pathExtension] ?? "application/octet-stream", "Cache-Control": "no-store"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
