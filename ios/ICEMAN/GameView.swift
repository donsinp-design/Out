import SwiftUI
import WebKit

/// The game is the same single self-contained HTML file the web build produces, loaded from the app bundle, so it
/// runs with no network at all. The web view is stripped of everything that would fight a game: no scrolling or
/// bounce, no pinch or double-tap zoom, no selection or callout, and audio that may start without a tap.
struct GameView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []   // the soundtrack can start itself
        config.suppressesIncrementalRendering = false

        // Belt and braces on top of the page's own CSS: kill the gestures at the web view level too.
        let css = """
        html,body{-webkit-user-select:none!important;user-select:none!important;
        -webkit-touch-callout:none!important;touch-action:none!important;
        -webkit-tap-highlight-color:transparent!important;overscroll-behavior:none!important}
        """
        let js = "var s=document.createElement('style');s.textContent=`\(css)`;document.head.appendChild(s);"
        config.userContentController.addUserScript(
            WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.bounces = false
        web.scrollView.isScrollEnabled = false
        web.scrollView.pinchGestureRecognizer?.isEnabled = false
        web.scrollView.maximumZoomScale = 1
        web.scrollView.minimumZoomScale = 1
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { web.isInspectable = true }

        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
