import SafariServices
import SwiftUI

@main
struct DeclutterApp: App {
    var body: some Scene {
        Window("Declutter", id: "main") {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}

struct ContentView: View {
    private let extensionID = "com.theanhgen.declutter.extension"
    @State private var enabled: Bool?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Declutter").font(.title2.bold())
            Text(status)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Open Safari Extensions Settings…") {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionID) { _ in }
            }
            Divider().padding(.vertical, 4)
            TipJarView()
        }
        .padding(24)
        .frame(width: 380)
        .task { await refresh() }
    }

    private var status: String {
        switch enabled {
        case .some(true): "The extension is on. For cookie banners, allow it on every website."
        case .some(false): "The extension is off. Turn on Declutter in Safari Settings → Extensions."
        case .none: "Checking Safari…"
        }
    }

    private func refresh() async {
        let state = try? await SFSafariExtensionManager.stateOfSafariExtension(withIdentifier: extensionID)
        enabled = state?.isEnabled ?? false
    }
}
