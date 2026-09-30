import StoreKit
import SwiftUI

// Tip jar: consumable in-app purchases (App Store rule 3.1.1: tips inside the app must use IAP, not a link).
// The product ids must exist in App Store Connect; locally, Declutter.storekit stands in for them.
@MainActor
final class TipJar: ObservableObject {
    static let shared = TipJar()
    static let productIDs = [
        "com.theanhgen.declutter.tip.small",
        "com.theanhgen.declutter.tip.medium",
        "com.theanhgen.declutter.tip.large",
    ]
    @Published var products: [Product] = []
    @Published var loaded = false
    @Published var loadFailed = false
    @Published var busy = false
    @Published var thanks = false
    @Published var note: String?
    private var updates: Task<Void, Never>?

    // Purchases that complete outside the sheet (Ask to Buy, interrupted payments). Tips unlock nothing, so every
    // transaction is finished, verified or not; only a verified, unrefunded one says thanks.
    func listen() {
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                await self?.handle(result)
            }
        }
    }

    private func handle(_ result: VerificationResult<StoreKit.Transaction>) async {
        switch result {
        case .verified(let t):
            await t.finish()
            if t.revocationDate == nil { thanks = true }
        case .unverified(let t, _):
            await t.finish()
        }
    }

    func load() async {
        do {
            products = try await Product.products(for: Self.productIDs).sorted { $0.price < $1.price }
            loadFailed = false
        } catch {
            loadFailed = true
        }
        loaded = true
    }

    func buy(_ product: Product) async {
        guard !busy else { return }
        busy = true
        note = nil
        defer { busy = false }
        do {
            switch try await product.purchase() {
            case .success(let result):
                await handle(result)
                if case .unverified = result { note = "the App Store could not verify that purchase." }
            case .pending:
                note = "waiting for approval. thanks!"
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            note = "could not reach the App Store. try again later."
        }
    }
}

struct TipJarView: View {
    @ObservedObject private var jar = TipJar.shared

    // Release: no section when the store has no products (not live yet, no agreement). A failed request
    // (offline) shows a retry instead of hiding the tip jar for the whole session.
    private var hidden: Bool {
        #if DEBUG
        false
        #else
        jar.loaded && !jar.loadFailed && jar.products.isEmpty
        #endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !hidden { content }
        }
        .task { await jar.load() }
    }

    @ViewBuilder private var content: some View {
        Text("tip jar").font(.system(.headline, design: .monospaced))
        Text(jar.thanks ? "thank you." : "declutter is free. If it saves you clicks, a tip keeps the rules up to date.")
            .font(.system(.callout, design: .monospaced))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        HStack(spacing: 8) {
            ForEach(jar.products, id: \.id) { p in
                Button(p.displayPrice) { Task { await jar.buy(p) } }
                    .buttonStyle(.bordered)
                    .font(.system(.body, design: .monospaced))
                    .disabled(jar.busy)
            }
            if jar.loadFailed {
                Button("retry") { Task { await jar.load() } }
                    .buttonStyle(.bordered)
                    .font(.system(.body, design: .monospaced))
            }
            #if DEBUG
            // Debug builds launched outside Xcode have no StoreKit config and the products are not live yet;
            // show the prices (from Declutter.storekit) so the layout can be seen and screenshotted.
            if jar.products.isEmpty && !jar.loadFailed {
                ForEach(["$0.99", "$2.99", "$4.99"], id: \.self) { price in
                    Button(price) {}.buttonStyle(.bordered).font(.system(.body, design: .monospaced))
                }
            }
            #endif
        }
        if let note = jar.note {
            Text(note).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
        }
    }
}
