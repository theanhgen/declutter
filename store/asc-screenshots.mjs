// Uploads dist/appstore-screenshots/* to both 1.0 versions and store/review/tipjar-iphone.png as each tip's
// review screenshot. Replaces existing screenshots of the same display type.   node store/asc-screenshots.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { asc } from '../scripts/asc.mjs';

const APP = '6816072545';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SETS = { MAC_OS: { mac: 'APP_DESKTOP' }, IOS: { iphone: 'APP_IPHONE_67', ipad: 'APP_IPAD_PRO_3GEN_129' } };

// Reserve -> PUT the bytes per upload operation -> commit with the MD5.
async function upload(type, relName, relType, relId, file) {
  const bytes = fs.readFileSync(file);
  const { data } = await asc('POST', `/v1/${type}`, { data: { type,
    attributes: { fileName: path.basename(file), fileSize: bytes.length },
    relationships: { [relName]: { data: { type: relType, id: relId } } } } });
  for (const op of data.attributes.uploadOperations) {
    const res = await fetch(op.url, { method: op.method, body: bytes.subarray(op.offset, op.offset + op.length),
      headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])) });
    if (!res.ok) throw new Error(`upload ${file}: ${res.status}`);
  }
  await asc('PATCH', `/v1/${type}/${data.id}`, { data: { type, id: data.id,
    attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(bytes).digest('hex') } } });
}

const versions = (await asc('GET', `/v1/apps/${APP}/appStoreVersions`)).data;
for (const v of versions) {
  const loc = (await asc('GET', `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
  const sets = (await asc('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data;
  for (const [device, displayType] of Object.entries(SETS[v.attributes.platform] ?? {})) {
    let set = sets.find((s) => s.attributes.screenshotDisplayType === displayType);
    if (set) for (const s of (await asc('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data) await asc('DELETE', `/v1/appScreenshots/${s.id}`);
    else set = (await asc('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: displayType },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } })).data;
    const dir = path.join(root, 'dist/appstore-screenshots', device);
    for (const f of fs.readdirSync(dir).sort()) await upload('appScreenshots', 'appScreenshotSet', 'appScreenshotSets', set.id, path.join(dir, f));
    console.log(`${v.attributes.platform} ${displayType}: ${fs.readdirSync(dir).length} screenshots`);
  }
}

const iaps = (await asc('GET', `/v1/apps/${APP}/inAppPurchasesV2?limit=50`)).data;
for (const iap of iaps) {
  const cur = await asc('GET', `/v2/inAppPurchases/${iap.id}/appStoreReviewScreenshot`).catch(() => null);
  if (cur?.data) await asc('DELETE', `/v1/inAppPurchaseAppStoreReviewScreenshots/${cur.data.id}`);
  await upload('inAppPurchaseAppStoreReviewScreenshots', 'inAppPurchaseV2', 'inAppPurchases', iap.id, path.join(root, 'store/review/tipjar-iphone.png'));
  console.log(`${iap.attributes.productId}: review screenshot`);
}
