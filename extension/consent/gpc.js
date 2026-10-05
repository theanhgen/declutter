// Global Privacy Control, the half a page's scripts can read (opt-in setting). background.js registers this in
// the page world at document_start, so consent platforms see it before they decide; the Sec-GPC request header
// is a declarativeNetRequest rule. Browsers that send GPC themselves already define the property.
if (!('globalPrivacyControl' in navigator)) {
  Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true, enumerable: true });
}
