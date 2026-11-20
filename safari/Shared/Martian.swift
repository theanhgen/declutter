import CoreText
import SwiftUI
#if os(iOS)
import UIKit
#endif

// Martian Mono (OFL-1.1, google/fonts ofl/martianmono; licence in MartianMono-OFL.txt), the extension's typeface.
// Registered for this process at launch. The variable font defaults to semi-expanded width (112.5), so every font
// asks for width 100 explicitly, like the popup's font-stretch: 100%.
enum Martian {
    static func register() {
        guard let url = Bundle.main.url(forResource: "MartianMono", withExtension: "ttf") else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }

    static func font(_ style: Font.TextStyle, weight: CGFloat = 400) -> Font {
        let wght = 0x7767_6874, wdth = 0x7764_7468 // 'wght', 'wdth'
        let base = CTFontDescriptorCreateWithAttributes([kCTFontFamilyNameAttribute: "Martian Mono"] as CFDictionary)
        let descriptor = CTFontDescriptorCreateCopyWithAttributes(base,
            [kCTFontVariationAttribute: [wght: weight, wdth: 100]] as CFDictionary)
        return Font(CTFontCreateWithFontDescriptor(descriptor, size(style), nil))
    }

    // The system size of each text style; on iOS scaled with Dynamic Type, as .system(style) was.
    private static func size(_ style: Font.TextStyle) -> CGFloat {
        #if os(iOS)
        let ui: UIFont.TextStyle
        switch style {
        case .largeTitle: ui = .largeTitle
        case .title: ui = .title1
        case .title2: ui = .title2
        case .title3: ui = .title3
        case .headline: ui = .headline
        case .callout: ui = .callout
        case .subheadline: ui = .subheadline
        case .footnote: ui = .footnote
        case .caption: ui = .caption1
        case .caption2: ui = .caption2
        default: ui = .body
        }
        return UIFont.preferredFont(forTextStyle: ui).pointSize
        #else
        switch style {
        case .largeTitle: return 26
        case .title: return 22
        case .title2: return 17
        case .title3: return 15
        case .callout: return 12
        case .subheadline: return 11
        case .footnote, .caption, .caption2: return 10
        default: return 13
        }
        #endif
    }
}
