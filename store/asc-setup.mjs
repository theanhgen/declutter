// Fills the App Store Connect record through the API: tip products (consumables, price, all territories,
// en-US text) and the listing text (subtitle, privacy URL, category, description, keywords, URLs).
// Idempotent: existing tips are left alone, text fields are overwritten with what is here.
// Never submits anything for review.   node store/asc-setup.mjs
import { asc } from '../scripts/asc.mjs';

const APP = '6816072545';
const SITE = 'https://theanhgen.github.io/declutter/';

const TIPS = [
  { productId: 'com.theanhgen.declutter.tip.small', name: 'Small tip', price: '0.99', text: 'A small thank-you.' },
  { productId: 'com.theanhgen.declutter.tip.medium', name: 'Medium tip', price: '2.99', text: 'A medium thank-you.' },
  { productId: 'com.theanhgen.declutter.tip.large', name: 'Large tip', price: '4.99', text: 'A large thank-you.' },
];

const SUBTITLE = 'Hide Shorts, answer cookies'; // 30 chars max
const KEYWORDS = 'cookie,consent,banner,gdpr,youtube,shorts,privacy,extension,reject,popup,tracking,block,safari';
const PROMO = 'Free. Cookie banners answered the way you choose, YouTube Shorts gone. Nothing leaves your browser.';
const DESCRIPTION = `declutter is a Safari extension that does two things, entirely on your device.

YOUTUBE SHORTS
Removes the Shorts shelf, the Shorts tab and Shorts in search and subscriptions, on desktop and mobile YouTube. A Shorts link opens in the normal video player instead.

COOKIE BANNERS
Answers cookie-consent banners for you. By default it refuses everything that is not strictly necessary. You can instead allow categories (preferences, analytics, storage, content, ads, other); where the site uses Cookiebot, Didomi, OneTrust or cookieconsent, your exact mix is applied through the banner's own settings, and elsewhere a mix is answered by refusing.
• per site: refuse, accept, or leave the banner alone
• works on sites worldwide: hundreds of consent platforms (via DuckDuckGo's open-source autoconsent) plus its own rules for sites autoconsent misses
• pay walls ("agree to tracking or subscribe") are never hidden or refused; declutter shows a badge and lets you decide, or agrees automatically if you turn that on
• a counter of clicks saved, and a "not handled right" list you keep on your device

PRIVACY
No account, no analytics, no servers. Settings and counters stay in Safari's extension storage on your device.

FREE
Everything is free. If it saves you clicks, there is an optional tip jar in the app.

To turn it on: Settings → Apps → Safari → Extensions → declutter (iPhone, iPad), or Safari → Settings → Extensions (Mac). Allow it on all websites so it can answer banners everywhere.

Open source (MIT): https://github.com/theanhgen/declutter`;

const all = async (path) => {
  const out = [];
  for (let next = path; next; ) {
    const r = await asc('GET', next.replace('https://api.appstoreconnect.apple.com', ''));
    out.push(...r.data);
    next = r.links?.next;
  }
  return out;
};

// ---- tips ----
const existing = await all(`/v1/apps/${APP}/inAppPurchasesV2?limit=50`);
const territories = (await all('/v1/territories?limit=200')).map((t) => ({ type: 'territories', id: t.id }));
for (const tip of TIPS) {
  if (existing.some((i) => i.attributes.productId === tip.productId)) { console.log(`tip ${tip.productId}: exists`); continue; }
  const { data: iap } = await asc('POST', '/v2/inAppPurchases', { data: { type: 'inAppPurchases',
    attributes: { name: tip.name, productId: tip.productId, inAppPurchaseType: 'CONSUMABLE',
      reviewNote: 'Optional tip. Unlocks nothing; the app and extension are fully free. Shown in the app under "tip jar".' },
    relationships: { app: { data: { type: 'apps', id: APP } } } } });
  await asc('POST', '/v1/inAppPurchaseLocalizations', { data: { type: 'inAppPurchaseLocalizations',
    attributes: { locale: 'en-US', name: tip.name, description: tip.text },
    relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iap.id } } } } });
  const points = await all(`/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=USA&limit=8000`);
  const point = points.find((p) => p.attributes.customerPrice === tip.price);
  if (!point) throw new Error(`no USA price point ${tip.price}`);
  await asc('POST', '/v1/inAppPurchasePriceSchedules', {
    data: { type: 'inAppPurchasePriceSchedules', relationships: {
      inAppPurchase: { data: { type: 'inAppPurchases', id: iap.id } },
      baseTerritory: { data: { type: 'territories', id: 'USA' } },
      manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${p0}' }] } } },
    included: [{ type: 'inAppPurchasePrices', id: '${p0}', attributes: { startDate: null },
      relationships: { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: point.id } } } }],
  });
  await asc('POST', '/v1/inAppPurchaseAvailabilities', { data: { type: 'inAppPurchaseAvailabilities',
    attributes: { availableInNewTerritories: true },
    relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id: iap.id } },
      availableTerritories: { data: territories } } } });
  console.log(`tip ${tip.productId}: created at $${tip.price}`);
}

// ---- app info: subtitle, privacy URL, category ----
const [info] = await all(`/v1/apps/${APP}/appInfos`);
const infoLocs = await all(`/v1/appInfos/${info.id}/appInfoLocalizations`);
for (const l of infoLocs.filter((l) => l.attributes.locale === 'en-US')) {
  await asc('PATCH', `/v1/appInfoLocalizations/${l.id}`, { data: { type: 'appInfoLocalizations', id: l.id,
    attributes: { subtitle: SUBTITLE, privacyPolicyUrl: `${SITE}privacy.html` } } });
}
await asc('PATCH', `/v1/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id, relationships: {
  primaryCategory: { data: { type: 'appCategories', id: 'PRODUCTIVITY' } },
  secondaryCategory: { data: { type: 'appCategories', id: 'UTILITIES' } } } } });
console.log('app info: subtitle, privacy URL, categories set');

// ---- version text, both platforms ----
const versions = await all(`/v1/apps/${APP}/appStoreVersions`);
for (const v of versions) {
  const locs = await all(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
  for (const l of locs.filter((l) => l.attributes.locale === 'en-US')) {
    await asc('PATCH', `/v1/appStoreVersionLocalizations/${l.id}`, { data: { type: 'appStoreVersionLocalizations', id: l.id,
      attributes: { description: DESCRIPTION, keywords: KEYWORDS, promotionalText: PROMO,
        supportUrl: 'https://github.com/theanhgen/declutter/issues', marketingUrl: SITE } } });
  }
  await asc('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id,
    attributes: { copyright: '2026 theanhgen' } } });
  console.log(`${v.attributes.platform} ${v.attributes.versionString}: text set`);
}

// ---- age rating: none of the content descriptors apply (a Safari extension + a settings screen) ----
const decl = (await asc('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
const level = 'NONE';
await asc('PATCH', `/v1/ageRatingDeclarations/${decl.id}`, { data: { type: 'ageRatingDeclarations', id: decl.id, attributes: {
  alcoholTobaccoOrDrugUseOrReferences: level, contests: level, gamblingSimulated: level, gunsOrOtherWeapons: level,
  horrorOrFearThemes: level, matureOrSuggestiveThemes: level, medicalOrTreatmentInformation: level,
  profanityOrCrudeHumor: level, sexualContentGraphicAndNudity: level, sexualContentOrNudity: level,
  violenceCartoonOrFantasy: level, violenceRealistic: level, violenceRealisticProlongedGraphicOrSadistic: level,
  advertising: false, gambling: false, healthOrWellnessTopics: false, lootBox: false, messagingAndChat: false,
  parentalControls: false, ageAssurance: false, socialMedia: false, unrestrictedWebAccess: false,
  userGeneratedContent: false,
} } });
console.log('age rating: all none');

// ---- content rights: no third-party content (autoconsent is code, MPL-2.0) ----
await asc('PATCH', `/v1/apps/${APP}`, { data: { type: 'apps', id: APP,
  attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } } });
console.log('content rights: does not use third-party content');

// ---- price: free ----
const freePoint = (await all(`/v1/apps/${APP}/appPricePoints?filter[territory]=USA&limit=200`))
  .find((p) => Number(p.attributes.customerPrice) === 0);
await asc('POST', '/v1/appPriceSchedules', {
  data: { type: 'appPriceSchedules', relationships: {
    app: { data: { type: 'apps', id: APP } },
    baseTerritory: { data: { type: 'territories', id: 'USA' } },
    manualPrices: { data: [{ type: 'appPrices', id: '${p0}' }] } } },
  included: [{ type: 'appPrices', id: '${p0}', attributes: { startDate: null },
    relationships: { appPricePoint: { data: { type: 'appPricePoints', id: freePoint.id } } } }],
});
console.log('price: free');

// ---- availability: every territory, and new ones automatically ----
try {
  await asc('POST', '/v2/appAvailabilities', {
    data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: true }, relationships: {
      app: { data: { type: 'apps', id: APP } },
      territoryAvailabilities: { data: territories.map((t, i) => ({ type: 'territoryAvailabilities', id: `\${t${i}}` })) } } },
    included: territories.map((t, i) => ({ type: 'territoryAvailabilities', id: `\${t${i}}`, attributes: { available: true },
      relationships: { territory: { data: t } } })),
  });
  console.log(`availability: ${territories.length} territories`);
} catch (e) { if (/already|exists|409/.test(e.message)) console.log('availability: already set'); else throw e; }

// ---- attach the newest valid build to each 1.0 version ----
const builds = (await asc('GET', `/v1/builds?filter[app]=${APP}&filter[processingState]=VALID&include=preReleaseVersion&sort=-uploadedDate`));
const pre = Object.fromEntries((builds.included ?? []).map((v) => [v.id, v.attributes]));
for (const v of versions) {
  const b = builds.data.find((b) => pre[b.relationships.preReleaseVersion.data.id]?.platform === v.attributes.platform);
  if (!b) { console.log(`${v.attributes.platform}: no valid build yet`); continue; }
  await asc('PATCH', `/v1/appStoreVersions/${v.id}/relationships/build`, { data: { type: 'builds', id: b.id } });
  console.log(`${v.attributes.platform} ${v.attributes.versionString}: build ${b.attributes.version} attached`);
}
