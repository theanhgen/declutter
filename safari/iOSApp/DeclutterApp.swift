import SwiftUI

@main
struct DeclutterApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image("Logo").resizable().scaledToFit().frame(width: 40, height: 40)
                Text("declutter")
                    .font(.system(.largeTitle, design: .monospaced))
            }
            Text("Hides YouTube Shorts and answers cookie banners in Safari.")
                .font(.system(.body, design: .monospaced))
            VStack(alignment: .leading, spacing: 8) {
                Text("to turn it on:")
                Text("1. Settings → Apps → Safari → Extensions → declutter")
                Text("2. Allow Extension, and set All Websites to Allow")
                Text("3. In Safari, tap the page menu (the icon at the left of the address bar) to see what it did on a page")
            }
            .font(.system(.callout, design: .monospaced))
            .foregroundStyle(.secondary)
            TipJarView().padding(.top, 8)
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
