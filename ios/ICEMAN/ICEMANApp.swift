import SwiftUI

@main
struct ICEMANApp: App {
    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()          // edge to edge, including under the notch
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)  // dims the home indicator so it stops covering the road
        }
    }
}
