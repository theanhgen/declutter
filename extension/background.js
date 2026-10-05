// Background: settings, data (bundled + remote, D6), autoconsent wiring, per-tab status and badge.
import { evalSnippets, filterCompactRules } from '@duckduckgo/autoconsent';
import { applyCategories } from './consent/categories.js';
import { declutterSnippets } from './consent/snippets.js';
import { badgeFor, chipFor, choiceMode, GPC_RULE_ID, gpcExcludeMatches, gpcRule, hostMatches, keepRemoteLists, mergeData, reportUrl, validData } from './lib.js';

const api = globalThis.browser ?? globalThis.chrome;
Object.assign(evalSnippets, declutterSnippets);

const DEFAULT_SETTINGS = {
  shorts: true,
  posts: true,
  consent: true,
  // Rule lists (Consent-O-Matic's "Rule Lists"): extra data.json URLs merged over the bundled data. The one baked
  // in at build time (DECLUTTER_DATA_URL) comes first; dataUrl is the older single-URL setting.
  // eslint-disable-next-line no-undef
  dataUrls: __DATA_URL__ ? [__DATA_URL__] : [],
  dataUrl: '',
  // "Your choice" (Consent-O-Matic's categories). All off = refuse everything (default).
  categories: { A: false, B: false, D: false, E: false, F: false, X: false },
  // Display: 'hide' the banner while answering (prehide), or 'show' it.
  display: 'hide',
  // The chip: a short note on the page when a banner was answered (consent/chip.js).
  chip: true,
  // Global Privacy Control: tell sites "do not sell or share" (header + navigator property). Off by default: few EU
  // sites act on it today, and it makes the browser a little more distinguishable.
  gpc: false,
  // Dev: autoconsent's eval log and a delay before each click (to watch it work).
  debugEvals: false,
  clickDelay: false,
  // Per-site choices: banners left alone (exceptions) or accepted (acceptSites). Everywhere else: refused.
  exceptions: [],
  acceptSites: [],
  // Consent-or-pay walls: 'auto' (default; 'manual' in store builds, see build.mjs --store) = accept (Souhlasím) automatically; 'manual' = detect, show a currency
  // badge, accept only when asked from the popup. Walls are never refused or hidden either way.
  walls: __WALLS_DEFAULT__,
  // autoconsent's own console logging, for diagnosing a site (canary: DEBUG=1).
  debug: false,
};
const DATA_REFRESH_MINUTES = 12 * 60;
const isWallRule = (name) => /^(cz-)?wall-/.test(name);
// autoconsent's code-based rules are compiled in and run whatever rules we pass. On a wall site they must be
// off, or e.g. the generic Sourcepoint rule claims Spiegel's wall frame before the wall rule sees its buttons.
// Names from node_modules/@duckduckgo/autoconsent/lib/cmps/*.ts (unit-tested against the installed version).
export const BUILTIN_CMPS = ['TrustArc-top', 'Cybotcookiebot', 'Sourcepoint-frame', 'consentmanager.net', 'Evidon',
  'Onetrust', 'Klaro', 'Uniconsent', 'Conversant', 'tiktok.com', 'Admiral'];
// Loop guard: if a site keeps re-showing its wall after we accepted, stop auto-accepting in that tab.
const WALL_AUTO_LIMIT = 2;
const WALL_AUTO_WINDOW_MS = 60000;
const wallLogKey = (tabId) => `wall-log-${tabId}`;
// cz-wall-seznam-teaser and cz-wall-seznam-page are one flow: count them together.
const wallFamily = (name) => name.replace(/^(cz-)?wall-/, '').split('-')[0];
async function wallLog(tabId) {
  const log = (await api.storage.session.get(wallLogKey(tabId)))[wallLogKey(tabId)] ?? [];
  return log.filter((e) => Date.now() - e.at < WALL_AUTO_WINDOW_MS);
}
async function isLooping(tabId, families) {
  const log = await wallLog(tabId);
  return families.some((f) => log.filter((e) => e.family === f).length >= WALL_AUTO_LIMIT);
}
async function logAutoAccept(tabId, cmp) {
  await api.storage.session.set({ [wallLogKey(tabId)]: [...await wallLog(tabId), { family: wallFamily(cmp), at: Date.now() }] });
}

// Settings and merged data are read for every frame's init; keep them for the worker's lifetime and drop them
// when storage changes (the listener below). Promises, so concurrent frames share one read. Treat as read-only.
let settingsCache;
let dataCache;
api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) settingsCache = null;
  if (changes.remoteData) dataCache = null;
});

function getSettings() {
  settingsCache ??= api.storage.local.get('settings').then(({ settings }) => ({ ...DEFAULT_SETTINGS, ...settings }));
  settingsCache.catch(() => { settingsCache = null; });
  return settingsCache;
}

// ---- data: bundled data.json merged with every rule list (D6) ----
let bundledData;
async function getBundledData() {
  bundledData ??= await (await fetch(api.runtime.getURL('data.json'))).json();
  return bundledData;
}

// remoteData = the rule lists already merged together (also read by the Shorts content script).
function getData() {
  dataCache ??= Promise.all([api.storage.local.get('remoteData'), getBundledData()])
    .then(([{ remoteData }, bundled]) => mergeData(bundled, validData(remoteData) ? remoteData : null));
  // A failed read must not stick for the worker's lifetime.
  dataCache.catch(() => { dataCache = null; });
  return dataCache;
}

// Wall rules' urlPatterns, compiled once per pattern instead of on every frame's init.
const patterns = new Map();
const pattern = (source = '') => {
  if (!patterns.has(source)) patterns.set(source, new RegExp(source));
  return patterns.get(source);
};

const ruleListUrls = (s) => [...new Set([...(s.dataUrls ?? []), s.dataUrl].filter(Boolean))];

async function refreshRemoteData() {
  const urls = ruleListUrls(await getSettings());
  const { remoteStatus = {}, remoteLists: previous } = await api.storage.local.get(['remoteStatus', 'remoteLists']);
  const fetched = {};
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok || !validData(d)) throw new Error(`invalid payload (${res.status})`);
      fetched[url] = d;
      remoteStatus[url] = { ok: true, at: Date.now(), generated: d.generated, rules: d.consent.rules.length };
    } catch (e) {
      remoteStatus[url] = { ok: false, at: Date.now(), error: String(e.message || e) };
    }
  }
  for (const url of Object.keys(remoteStatus)) if (!urls.includes(url)) delete remoteStatus[url];
  const remoteLists = keepRemoteLists(urls, previous, fetched);
  const merged = urls.map((u) => remoteLists[u]).filter(Boolean).reduce((acc, d) => mergeData(acc, d), null);
  await api.storage.local.set({ remoteData: merged, remoteLists, remoteStatus,
    // kept for older settings pages / tests
    remoteDataStatus: urls.length ? { ok: Object.keys(fetched).length === urls.length, at: Date.now(), ...(merged && { generated: merged.generated }) } : undefined });
}

// ---- autoconsent rules ----
let compactRules;
async function getCompactRules() {
  compactRules ??= await (await fetch(api.runtime.getURL('consent/compact-rules.json'))).json();
  return compactRules;
}

// ---- per-tab status (session storage survives the worker being suspended) ----
const tabKey = (tabId) => `tab-${tabId}`;
async function getTab(tabId) {
  return (await api.storage.session.get(tabKey(tabId)))[tabKey(tabId)] ?? {};
}
async function setTab(tabId, patch, reset = false) {
  const prev = await getTab(tabId);
  const next = { ...(reset ? {} : prev), ...patch };
  await api.storage.session.set({ [tabKey(tabId)]: next });
  await paintBadge(tabId, next);
  if ('consent' in patch) await showChip(tabId, prev, next, reset);
  return next;
}

const chipKey = (tabId) => `chip-${tabId}`;
async function showChip(tabId, prev, next, reloaded) {
  const last = (await api.storage.session.get(chipKey(tabId)))[chipKey(tabId)];
  const chip = chipFor(prev, next, last, Date.now(), reloaded);
  if (!chip || !next.host || !(await getSettings()).chip) return;
  await api.storage.session.set({ [chipKey(tabId)]: { host: next.host, consent: next.consent, text: chip.text, at: Date.now() } });
  // host: the tab may have moved on while this was awaited; the page shows the chip only if it is still that site.
  api.tabs.sendMessage(tabId, { type: 'chip', host: next.host, ...chip }, { frameId: 0 }).catch(() => { /* page gone */ });
}

async function paintBadge(tabId, state) {
  const b = badgeFor(state);
  try {
    await api.action.setBadgeText({ tabId, text: b.text });
    await api.action.setBadgeBackgroundColor({ tabId, color: b.color });
    await api.action.setTitle({ tabId, title: b.title });
  } catch { /* tab closed */ }
}

// ---- counters (Settings → about); local only ----
async function bump(patch, cmp, clicks = 0) {
  const { stats = {} } = await api.storage.local.get('stats');
  for (const [k, v] of Object.entries(patch)) stats[k] = (stats[k] ?? 0) + v;
  if (cmp) {
    stats.byCmp ??= {};
    const row = (stats.byCmp[cmp] ??= { filled: 0, clicks: 0 });
    row.filled += 1;
    row.clicks += clicks;
  }
  stats.since ??= Date.now();
  await api.storage.local.set({ stats });
}

// "report this site" from the popup: kept locally so rules can be written for it later.
async function report(tabId) {
  const tab = await api.tabs.get(tabId);
  const state = await getTab(tabId);
  const { reports = [] } = await api.storage.local.get('reports');
  const entry = { url: tab.url, host: new URL(tab.url).hostname, at: Date.now(), consent: state.consent ?? 'none', cmp: state.cmp ?? '' };
  await api.storage.local.set({ reports: [entry, ...reports.filter((r) => r.host !== entry.host)].slice(0, 100) });
  return true;
}

// ---- Global Privacy Control (opt-in; see gpcRule in lib.js) ----
// Re-applied when settings or rule lists change. Queued: overlapping runs would register the script twice.
async function applyGpc() {
  const [s, data] = await Promise.all([getSettings(), getData()]);
  const on = s.gpc && s.consent;
  const skip = [...new Set([...(s.acceptSites ?? []), ...s.exceptions, ...data.consent.walls])];
  try {
    await api.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [GPC_RULE_ID], ...(on && { addRules: [gpcRule(skip)] }) });
  } catch (e) {
    console.warn('declutter: GPC header rule', e);
  }
  try {
    if ((await api.scripting.getRegisteredContentScripts({ ids: ['gpc'] })).length) await api.scripting.unregisterContentScripts({ ids: ['gpc'] });
    if (on) {
      await api.scripting.registerContentScripts([{ id: 'gpc', js: ['consent/gpc.js'], matches: ['<all_urls>'],
        excludeMatches: gpcExcludeMatches(skip), runAt: 'document_start', allFrames: true, world: 'MAIN' }]);
    }
  } catch (e) {
    console.warn('declutter: GPC script', e);
  }
}
let gpcQueue = Promise.resolve();
const queueGpc = () => (gpcQueue = gpcQueue.then(applyGpc, applyGpc));

async function applyShortsRedirect() {
  const { shorts } = await getSettings();
  await api.declarativeNetRequest.updateEnabledRulesets(
    shorts ? { enableRulesetIds: ['shorts'] } : { disableRulesetIds: ['shorts'] });
}

// ---- messages from the content scripts ----
async function onConsentMessage(msg, sender) {
  const tabId = sender.tab.id;
  const frameId = sender.frameId ?? 0;
  const senderUrl = sender.url || `${sender.origin}/`;
  // The main frame knows its own URL; sub-frames use the host the main frame recorded, because
  // sender.tab.url can still be the previous page while a navigation is in flight.
  const tabHost = frameId === 0
    ? new URL(senderUrl).hostname
    : (await getTab(tabId)).host ?? new URL(sender.tab.url || senderUrl).hostname;

  switch (msg.type) {
    case 'init': {
      const [settings, data] = await Promise.all([getSettings(), getData()]);
      const wall = hostMatches(tabHost, data.consent.walls);
      const excepted = hostMatches(tabHost, settings.exceptions);
      const accepting = hostMatches(tabHost, settings.acceptSites ?? []);
      const prev = await getTab(tabId);
      // "Accept" on Seznam's/Mafra's bottom bar navigates to their consent page; accept there too.
      const wallRules = data.consent.rules.filter((r) => isWallRule(r.name));
      const families = wallRules.filter((r) => pattern(r.runContext?.urlPattern).test(senderUrl)).map((r) => wallFamily(r.name));
      const looping = wall && await isLooping(tabId, families);
      const acceptPending = prev.acceptUntil > Date.now() && !looping;
      if (frameId === 0) {
        // Many sites reload themselves after the choice is saved; keep showing that it was refused.
        const kept = ['done', 'acceptedSite', 'choice'].includes(prev.consent) && prev.host === tabHost && Date.now() - prev.doneAt < 60000
          ? { consent: prev.consent, cmp: prev.cmp, doneAt: prev.doneAt, cosmetic: prev.cosmetic, adapter: prev.adapter } : {};
        await setTab(tabId, { host: tabHost, ...(acceptPending && { acceptUntil: prev.acceptUntil }),
          ...(excepted ? { consent: 'paused' } : kept) }, true);
      }
      const logs = { lifecycle: settings.debug, rulesteps: settings.debug, detectionsteps: settings.debug, evals: settings.debugEvals, errors: true };
      // refuse (all categories off) / accept (all on) / mix (applied per CMP on popupFound, else refused).
      const mode = accepting ? 'accept' : choiceMode(settings.categories);
      // On a wall site only the wall rules run: nothing else on the page is refused, hidden or pre-hidden.
      // Manual mode detects the wall and waits for an optIn from the popup; auto mode accepts at once.
      const config = wall
        ? { enabled: settings.consent && !excepted, autoAction: (settings.walls === 'auto' && !looping) || acceptPending ? 'optIn' : null,
          enablePrehide: false, enableCosmeticRules: false, enableGeneratedRules: false, disabledCmps: BUILTIN_CMPS,
          // Sourcepoint wall frames (Spiegel) sometimes render late; look for longer than the default 20 tries.
          detectRetries: 60, logs }
        : { enabled: settings.consent && !excepted, autoAction: { refuse: 'optOut', accept: 'optIn', mix: null }[mode],
          disabledCmps: data.consent.disabledCmps, enablePrehide: settings.display !== 'show', enableCosmeticRules: true,
          visualTest: settings.clickDelay, logs };
      const rules = wall
        ? { autoconsent: wallRules }
        : {
          // Our Czech rules go first so they win over a generic rule for the same page.
          autoconsent: data.consent.rules.filter((r) => !isWallRule(r.name)),
          compact: filterCompactRules(await getCompactRules(), { url: senderUrl, mainFrame: frameId === 0 }),
        };
      await api.tabs.sendMessage(tabId, { type: 'initResp', rules, config }, { frameId });
      break;
    }
    case 'eval': {
      let result = false;
      try {
        const [r] = await api.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          world: 'MAIN',
          func: evalSnippets[msg.snippetId],
        });
        result = r?.result;
      } catch (e) {
        console.warn('declutter: eval failed', msg.snippetId, e);
      }
      await api.tabs.sendMessage(tabId, { id: msg.id, type: 'evalResp', result }, { frameId });
      break;
    }
    case 'popupFound':
      if (isWallRule(msg.cmp)) {
        // Mirrors the autoAction chosen at init: auto mode (unless looping) or a pending accept.
        const { walls } = await getSettings();
        const looping = await isLooping(tabId, [wallFamily(msg.cmp)]);
        const accepting = (walls === 'auto' && !looping) || (await getTab(tabId)).acceptUntil > Date.now();
        if (accepting) await logAutoAccept(tabId, msg.cmp);
        await setTab(tabId, accepting
          ? { consent: 'accepting', cmp: msg.cmp, wallFrame: frameId }
          : { consent: 'wall', cmp: msg.cmp, wallFrame: frameId, looping });
      } else {
        await setTab(tabId, { consent: 'working', cmp: msg.cmp, since: Date.now() });
        const settings = await getSettings();
        const siteAccepted = hostMatches(tabHost, settings.acceptSites ?? []);
        if (!siteAccepted && choiceMode(settings.categories) === 'mix') await applyChoice(tabId, frameId, msg.cmp, settings.categories);
      }
      break;
    case 'optOutResult':
    case 'optInResult':
      if (!msg.result) await setTab(tabId, { consent: 'failed', cmp: msg.cmp });
      break;
    case 'autoconsentDone': {
      const siteAccepted = hostMatches(tabHost, (await getSettings()).acceptSites ?? []);
      const mode = siteAccepted ? 'accept' : choiceMode((await getSettings()).categories);
      // What is recorded is what was done: accepted (this site, or every category switched on), refused, or, for a
      // cosmetic rule, only hidden.
      await setTab(tabId, isWallRule(msg.cmp)
        ? { consent: 'accepted', cmp: msg.cmp, acceptUntil: 0 }
        : { consent: mode === 'accept' ? 'acceptedSite' : 'done', cmp: msg.cmp, doneAt: Date.now(), cosmetic: !!msg.isCosmetic });
      await bump({ clicks: msg.totalClicks ?? 0, ...(isWallRule(msg.cmp) ? { walls: 1 } : mode === 'accept' ? { accepted: 1 } : { refused: 1 }) },
        msg.cmp, msg.totalClicks ?? 0);
      break;
    }
    case 'autoconsentError':
      console.warn('declutter: autoconsent error', msg.details);
      break;
  }
}

// "Your choice" with a mix of categories: autoconsent found a banner and waits (autoAction null). Apply the mix
// through the CMP's own API when there is an adapter; otherwise refuse everything, which is the safe side.
async function applyChoice(tabId, frameId, cmp, categories) {
  let adapter = '';
  try {
    const [r] = await api.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, world: 'MAIN', func: applyCategories, args: [categories, cmp] });
    adapter = r?.result ?? '';
  } catch (e) {
    console.warn('declutter: category adapter failed', cmp, e);
  }
  if (adapter) {
    await setTab(tabId, { consent: 'choice', cmp, adapter, doneAt: Date.now() });
    await bump({ choice: 1 }, cmp);
  } else {
    await setTab(tabId, { choiceFallback: true });
    await api.tabs.sendMessage(tabId, { type: 'optOut' }, { frameId });
  }
}

// Popup: "Accept this wall" in manual mode. autoconsent in that frame is waiting for exactly this.
async function acceptWall(tabId) {
  const state = await getTab(tabId);
  if (state.consent !== 'wall') return false;
  // A bottom-bar rule only opens the consent page; let that page accept too (and nothing else later).
  await setTab(tabId, { consent: 'accepting', ...(state.cmp.endsWith('-teaser') && { acceptUntil: Date.now() + 30000 }) });
  await api.tabs.sendMessage(tabId, { type: 'optIn' }, { frameId: state.wallFrame ?? 0 });
  return true;
}

// "send to developer": only when the user presses it in the popup, after seeing the address. Goes to an
// insert-only Supabase table (supabase/migrations); the publishable key can add rows, never read them.
const REPORTS_URL = 'https://wpsmgzihqgdmsrvzpcca.supabase.co/rest/v1/reports';
const REPORTS_KEY = 'sb_publishable_TxwGZ6G_q388MjPCCrFs6w_s9nu8hvC';
// url: the address the popup showed. If the tab has moved to another site since, send nothing.
async function sendReport(tabId, { url }) {
  const tab = await api.tabs.get(tabId);
  if (!url || reportUrl(tab.url) !== url) return false;
  const state = await getTab(tabId);
  const res = await fetch(REPORTS_URL, {
    method: 'POST',
    headers: { apikey: REPORTS_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ url, consent: state.consent ?? 'none', cmp: (state.cmp ?? '').slice(0, 60),
      version: api.runtime.getManifest().version, browser: __TARGET__ }),
  });
  return res.ok;
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Popup / settings requests come from extension pages only. autoconsent's content script sends its own 'report'
  // (on every state update), which must not reach the popup's handler. Extension pages can be in a tab (tests), so
  // check the sender's URL, not sender.tab (falling back to it if a browser leaves sender.url out).
  const fromExtension = sender.url ? sender.url.startsWith(api.runtime.getURL('')) : !sender.tab;
  const popupRequest = { acceptWall, report, sendReport }[msg.type];
  if (fromExtension && popupRequest) {
    popupRequest(msg.tabId, msg).then(sendResponse, () => sendResponse(false));
    return true;
  }
  if (fromExtension && msg.type === 'updateData') {
    refreshRemoteData().then(() => sendResponse(true));
    return true;
  }
  if (!sender.tab) return;
  if (msg.type === 'shortsLeak') {
    setTab(sender.tab.id, { shortsLeak: msg.count, leakPath: msg.path });
  } else if (msg.type === 'shortsRedirect') {
    bump({ shorts: 1 });
  } else if (msg.type === 'shortsNav') {
    setTab(sender.tab.id, { shortsLeak: 0 });
  } else {
    onConsentMessage(msg, sender).catch((e) => console.warn('declutter:', msg.type, e));
  }
});

api.tabs.onRemoved.addListener((tabId) => api.storage.session.remove([tabKey(tabId), chipKey(tabId), wallLogKey(tabId)]));

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // After the cache listener above, so a new wall list from a rule list is what applyGpc reads.
  if (changes.settings || changes.remoteData) queueGpc();
  if (!changes.settings) return;
  applyShortsRedirect();
  const urls = (x) => JSON.stringify(ruleListUrls(x ?? {}));
  if (urls(changes.settings.newValue) !== urls(changes.settings.oldValue)) refreshRemoteData();
});

api.alarms.onAlarm.addListener((a) => { if (a.name === 'data') refreshRemoteData(); });

async function start() {
  await applyShortsRedirect();
  await queueGpc();
  // eslint-disable-next-line no-undef
  if (__UNINSTALL_URL__) api.runtime.setUninstallURL?.(__UNINSTALL_URL__)?.catch?.(() => { /* not supported */ });
  if (!(await api.alarms.get('data'))) api.alarms.create('data', { periodInMinutes: DATA_REFRESH_MINUTES });
  await refreshRemoteData();
}
api.runtime.onInstalled.addListener(({ reason }) => {
  start();
  // Safari's container app already walks through setup; there a tab would open on every enable.
  if (reason === 'install' && __TARGET__ !== 'safari') api.tabs.create({ url: api.runtime.getURL('welcome/welcome.html') });
});
api.runtime.onStartup.addListener(start);
