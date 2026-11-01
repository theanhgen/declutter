import SafariServices
import SwiftUI

@main
struct DeclutterApp: App {
    // Start listening for StoreKit transactions at launch, not when the tip jar view appears: an Ask to Buy
    // approval can arrive while no window is open.
    init() {
        Martian.register()
        TipJar.shared.listen()
    }

    var body: some Scene {
        Window("declutter", id: "main") {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}

struct ContentView: View {
    private let extensionID = "com.theanhgen.declutter.extension"
    @State private var safari: SafariState = .checking
    // Set when a check finds it on and the one before found it off: the user just turned it on, so say what is left.
    @State private var justTurnedOn = false
    // Each check is numbered; only the newest may set the state, so a slow earlier check (launch, the Settings
    // button) can't overwrite a newer answer.
    @State private var checks = 0

    private enum SafariState { case checking, on, off, unknown }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image("Logo").resizable().scaledToFit().frame(width: 28, height: 28)
                    .accessibilityHidden(true)  // repeats the name next to it
                Text("declutter").font(Martian.font(.title2, weight: 600))
            }
            Text(status)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Open Safari Extensions Settings…") {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionID) { _ in
                    Task { await refresh() }
                }
            }
            Divider().padding(.vertical, 4)
            TipJarView()
        }
        .font(Martian.font(.body))
        .padding(24)
        .frame(width: 380)
        .task { await refresh() }
        // The user turns it on in Safari and switches back here: check again, or the text stays "off".
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await refresh() }
        }
    }

    private var status: String {
        switch safari {
        case .on where justTurnedOn:
            "declutter is on. Last step: Always Allow on Every Website, or cookie banners won't be answered."
        case .on: "The extension is on. For cookie banners, allow it on every website."
        case .off: "The extension is off. Turn on declutter in Safari Settings → Extensions."
        case .unknown: "Couldn't ask Safari. Open Safari Settings → Extensions to check."
        case .checking: "Checking Safari…"
        }
    }

    @MainActor private func refresh() async {
        checks += 1
        let check = checks
        let result: SafariState
        // A failed check is not "off": saying so would send the user to turn on something that may be on.
        do {
            result = try await SFSafariExtensionManager.stateOfSafariExtension(withIdentifier: extensionID).isEnabled ? .on : .off
        } catch {
            result = .unknown
        }
        guard check == checks else { return }
        justTurnedOn = result == .on && safari == .off
        safari = result
    }
}
