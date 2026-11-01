import SafariServices
import SwiftUI

@main
struct DeclutterApp: App {
    // Start listening for StoreKit transactions at launch, not when the tip jar view appears: an Ask to Buy
    // approval can arrive while no window is open.
    init() { TipJar.shared.listen() }

    var body: some Scene {
        Window("declutter", id: "main") {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}

struct ContentView: View {
    private let extensionID = "com.theanhgen.declutter.extension"
    private enum ExtensionState { case checking, on, off, unknown }
    @State private var state: ExtensionState = .checking

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image("Logo").resizable().scaledToFit().frame(width: 28, height: 28)
                    .accessibilityHidden(true)  // repeats the name next to it
                Text("declutter").font(.title2.bold())
            }
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
        // Back from Safari Settings: read the state again, or the window keeps saying "off" after it was turned on.
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await refresh() }
        }
    }

    private var status: String {
        switch state {
        case .on: "The extension is on. For cookie banners, allow it on every website."
        case .off: "The extension is off. Turn on declutter in Safari Settings → Extensions."
        case .unknown: "Couldn't check Safari. Open Safari Settings → Extensions to see whether declutter is on."
        case .checking: "Checking Safari…"
        }
    }

    // A failed check is not "off": telling someone whose extension is on to turn it on is wrong.
    private func refresh() async {
        do {
            state = try await SFSafariExtensionManager.stateOfSafariExtension(withIdentifier: extensionID).isEnabled ? .on : .off
        } catch {
            state = .unknown
        }
    }
}
