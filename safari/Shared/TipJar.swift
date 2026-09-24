import StoreKit
import SwiftUI

// Tip jar: consumable in-app purchases (App Store rule 3.1.1: tips inside the app must use IAP, not a link).
// The product ids must exist in App Store Connect; locally, Declutter.storekit stands in for them.
@MainActor
final class TipJar: ObservableObject {
    static let productIDs = [
        "com.theanhgen.declutter.tip.small",
        "com.theanhgen.declutter.tip.medium",
        "com.theanhgen.declutter.tip.large",
    ]
    @Published var products: [Product] = []
    @Published var thanks = false
    private var updates: Task<Void, Never>?

    init() {
        // Finish purchases that complete outside the sheet (Ask to Buy, interrupted payments).
        updates = Task {
            for await result in Transaction.updates {
                if case .verified(let t) = result { await t.finish(); thanks = true }
            }
        }
    }

    func load() async {
        products = ((try? await Product.products(for: Self.productIDs)) ?? []).sorted { $0.price < $1.price }
    }

    func buy(_ product: Product) async {
        guard case .success(.verified(let t)) = try? await product.purchase() else { return }
        await t.finish()
        thanks = true
    }
}

struct TipJarView: View {
    @StateObject private var jar = TipJar()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("tip jar").font(.system(.headline, design: .monospaced))
            Text(jar.thanks ? "thank you." : "Declutter is free. If it saves you clicks, a tip keeps the rules up to date.")
                .font(.system(.callout, design: .monospaced))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                ForEach(jar.products, id: \.id) { p in
                    Button(p.displayPrice) { Task { await jar.buy(p) } }
                        .buttonStyle(.bordered)
                        .font(.system(.body, design: .monospaced))
                }
            }
        }
        .task { await jar.load() }
    }
}
