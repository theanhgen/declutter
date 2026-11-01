import SafariServices
import SwiftUI

@main
struct DeclutterApp: App {
    // Start listening for StoreKit transactions at launch, not when the tip jar view appears: an Ask to Buy
    // approval can arrive while no window is open.
    init() { TipJar.shared.listen() }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        // Scrolls: in landscape and at large text sizes the steps and tip jar can be taller than the screen.
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Logo beside the name while it fits; stacked at large text sizes.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) { logo; title }
                    VStack(alignment: .leading, spacing: 8) { logo; title }
                }
                Text("hides YouTube Shorts and answers cookie banners in Safari.")
                    .font(.system(.body, design: .monospaced))
                VStack(alignment: .leading, spacing: 8) {
                    Text("to turn it on:")
                    Text("1. Settings → Apps → Safari → Extensions → declutter")
                    Text("2. Allow Extension, and set Other Websites to Allow")
                    Text("3. in Safari, tap the page menu (the icon at the left of the address bar) to see what it did on a page")
                }
                .font(.system(.callout, design: .monospaced))
                .foregroundStyle(.secondary)
                // iOS 26.2+ can open declutter's page in Safari's extension settings directly; older systems keep only
                // the steps above. It fails unless the app is in the foreground, which a tap guarantees; on any other
                // failure the written steps are still there.
                if #available(iOS 26.2, *) {
                    Button("open declutter in settings") {
                        Task { try? await SFSafariSettings.openExtensionsSettings(forIdentifiers: ["com.theanhgen.declutter.extension"]) }
                    }
                    .buttonStyle(.bordered)
                    .font(.system(.body, design: .monospaced))
                }
                TipJarView().padding(.top, 8)
                Spacer()
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var logo: some View {
        Image("Logo").resizable().scaledToFit().frame(width: 40, height: 40)
            .accessibilityHidden(true)  // repeats the name next to it
    }

    private var title: some View {
        Text("declutter")
            .font(.system(.largeTitle, design: .monospaced))
    }
}
