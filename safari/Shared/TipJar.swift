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
    // The last tip, kept across launches: "thank you for the $2.99 tip on Oct 26."
    @Published private(set) var lastTip: Tip? = Tip.saved
    var thanks: Bool { lastTip != nil }
    @Published var note: String?
    private var updates: Task<Void, Never>?

    struct Tip: Codable, Equatable {
        let price: String
        let date: Date
        static let key = "lastTip"
        static var saved: Tip? {
            UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(Tip.self, from: $0) }
        }
        var text: String {
            // Some locales end the date with a period (cs: "24. 11."); don't add a second one.
            let day = date.formatted(.dateTime.month(.abbreviated).day())
            return "thank you for the \(price) tip on \(day.hasSuffix(".") ? String(day.dropLast()) : day). it pays for keeping the rules current."
        }
    }

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
            guard t.revocationDate == nil else { return }
            // An approved Ask to Buy arrives here: the "waiting for approval" note is done.
            note = nil
            let price = products.first { $0.id == t.productID }?.displayPrice
                ?? t.price.map { $0.formatted(.currency(code: t.currency?.identifier ?? "USD")) } ?? "your"
            let tip = Tip(price: price, date: t.purchaseDate)
            lastTip = tip
            if let data = try? JSONEncoder().encode(tip) { UserDefaults.standard.set(data, forKey: Tip.key) }
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
                // Cleared when the approved purchase arrives (handle).
                note = "waiting for approval. thanks!"
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch Product.PurchaseError.purchaseNotAllowed {
            note = "purchases are turned off on this device (Screen Time)."
        } catch StoreKitError.notAvailableInStorefront {
            note = "tips aren't available in your country's App Store."
        } catch StoreKitError.networkError {
            note = "couldn't reach the App Store. try again later."
        } catch {
            note = "the tip didn't go through. try again later."
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
        Text("tip jar").font(Martian.font(.headline, weight: 600))
        Text(jar.lastTip?.text ?? "declutter is free. If it saves you clicks, a tip keeps the rules up to date.")
            .font(Martian.font(.callout, weight: 300))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        HStack(spacing: 8) {
            // Until the store answers, the row would be empty; show that it's loading.
            if !jar.loaded {
                ProgressView().controlSize(.small)
            }
            ForEach(jar.products, id: \.id) { p in
                Button(p.displayPrice) { Task { await jar.buy(p) } }
                    .buttonStyle(.bordered)
                    .font(Martian.font(.body))
                    .disabled(jar.busy)
                    .accessibilityLabel("Tip \(p.displayPrice)")  // the price alone doesn't say what the button does
            }
            if jar.loadFailed {
                Button("retry") { Task { await jar.load() } }
                    .buttonStyle(.bordered)
                    .font(Martian.font(.body))
            }
            #if DEBUG
            // Debug builds launched outside Xcode have no StoreKit config and the products are not live yet;
            // show the prices (from Declutter.storekit) so the layout can be seen and screenshotted.
            if jar.products.isEmpty && !jar.loadFailed {
                ForEach(["$0.99", "$2.99", "$4.99"], id: \.self) { price in
                    Button(price) {}.buttonStyle(.bordered).font(Martian.font(.body))
                }
            }
            #endif
        }
        if let note = jar.note ?? (jar.loadFailed ? "couldn't reach the App Store." : nil) {
            Text(note).font(Martian.font(.caption, weight: 300)).foregroundStyle(.secondary)
        }
    }
}
