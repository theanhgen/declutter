// Background: settings, data (bundled + remote, D6), autoconsent wiring, per-tab status and badge.
import { evalSnippets, filterCompactRules } from '@duckduckgo/autoconsent';
import { declutterSnippets } from './consent/snippets.js';
import { badgeFor, hostMatches, validData } from './lib.js';

const api = globalThis.browser ?? globalThis.chrome;
Object.assign(evalSnippets, declutterSnippets);

const DEFAULT_SETTINGS = {
  shorts: true,
  consent: true,
  // Remote copy of build/data.json, baked in at build time (DECLUTTER_DATA_URL). Empty = bundled copy only.
  // eslint-disable-next-line no-undef
  dataUrl: __DATA_URL__,
  // Hosts where the consent module stays out (user's own choice, on top of the walls).
  exceptions: [],
  // Consent-or-pay walls: 'manual' = detect and show a Kč badge, accept only when asked from the popup;
  // 'auto' = accept (Souhlasím) automatically. Walls are never refused or hidden either way.
  walls: 'manual',
  // autoconsent's own console logging, for diagnosing a site (canary: DEBUG=1).
  debug: false,
};
const DATA_REFRESH_MINUTES = 12 * 60;
const isWallRule = (name) => /^(cz-)?wall-/.test(name);
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

async function getSettings() {
  const { settings } = await api.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

// ---- data: bundled data.json, replaced by a newer valid remote copy ----
let bundledData;
async function getBundledData() {
  bundledData ??= await (await fetch(api.runtime.getURL('data.json'))).json();
  return bundledData;
}

async function getData() {
  const bundled = await getBundledData();
  const { remoteData } = await api.storage.local.get('remoteData');
  return validData(remoteData) && remoteData.generated > bundled.generated ? remoteData : bundled;
}

async function refreshRemoteData() {
  const { dataUrl } = await getSettings();
  if (!dataUrl) return;
  try {
    const res = await fetch(dataUrl, { cache: 'no-store' });
    const d = await res.json();
    if (!res.ok || !validData(d)) throw new Error(`invalid payload (${res.status})`);
    await api.storage.local.set({ remoteData: d, remoteDataStatus: { ok: true, at: Date.now(), generated: d.generated } });
  } catch (e) {
    await api.storage.local.set({ remoteDataStatus: { ok: false, at: Date.now(), error: String(e.message || e) } });
  }
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
  const next = { ...(reset ? {} : await getTab(tabId)), ...patch };
  await api.storage.session.set({ [tabKey(tabId)]: next });
  await paintBadge(tabId, next);
  return next;
}

async function paintBadge(tabId, state) {
  const b = badgeFor(state);
  try {
    await api.action.setBadgeText({ tabId, text: b.text });
    await api.action.setBadgeBackgroundColor({ tabId, color: b.color });
    await api.action.setTitle({ tabId, title: b.title });
  } catch { /* tab closed */ }
}

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
      const prev = await getTab(tabId);
      // "Accept" on Seznam's/Mafra's bottom bar navigates to their consent page; accept there too.
      const wallRules = data.consent.rules.filter((r) => isWallRule(r.name));
      const families = wallRules.filter((r) => new RegExp(r.runContext?.urlPattern ?? '').test(senderUrl)).map((r) => wallFamily(r.name));
      const looping = wall && await isLooping(tabId, families);
      const acceptPending = prev.acceptUntil > Date.now() && !looping;
      if (frameId === 0) {
        // Many sites reload themselves after the choice is saved; keep showing that it was refused.
        const kept = prev.consent === 'done' && prev.host === tabHost && Date.now() - prev.doneAt < 60000
          ? { consent: 'done', cmp: prev.cmp, doneAt: prev.doneAt } : {};
        await setTab(tabId, { host: tabHost, ...(acceptPending && { acceptUntil: prev.acceptUntil }),
          ...(excepted ? { consent: 'paused' } : kept) }, true);
      }
      const logs = { lifecycle: settings.debug, rulesteps: settings.debug, detectionsteps: settings.debug, errors: true };
      // On a wall site only the wall rules run: nothing else on the page is refused, hidden or pre-hidden.
      // Manual mode detects the wall and waits for an optIn from the popup; auto mode accepts at once.
      const config = wall
        ? { enabled: settings.consent && !excepted, autoAction: (settings.walls === 'auto' && !looping) || acceptPending ? 'optIn' : null,
          enablePrehide: false, enableCosmeticRules: false, enableGeneratedRules: false, logs }
        : { enabled: settings.consent && !excepted, autoAction: 'optOut', disabledCmps: data.consent.disabledCmps,
          enablePrehide: true, enableCosmeticRules: true, logs };
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
      }
      break;
    case 'optOutResult':
    case 'optInResult':
      if (!msg.result) await setTab(tabId, { consent: 'failed', cmp: msg.cmp });
      break;
    case 'autoconsentDone':
      await setTab(tabId, isWallRule(msg.cmp)
        ? { consent: 'accepted', cmp: msg.cmp, acceptUntil: 0 }
        : { consent: 'done', cmp: msg.cmp, doneAt: Date.now() });
      break;
    case 'autoconsentError':
      console.warn('declutter: autoconsent error', msg.details);
      break;
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

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'acceptWall') {
    acceptWall(msg.tabId).then(sendResponse, () => sendResponse(false));
    return true;
  }
  if (!sender.tab) return;
  if (msg.type === 'shortsLeak') {
    setTab(sender.tab.id, { shortsLeak: msg.count, leakPath: msg.path });
  } else if (msg.type === 'shortsNav') {
    setTab(sender.tab.id, { shortsLeak: 0 });
  } else {
    onConsentMessage(msg, sender).catch((e) => console.warn('declutter:', msg.type, e));
  }
});

api.tabs.onRemoved.addListener((tabId) => api.storage.session.remove([tabKey(tabId), wallLogKey(tabId)]));

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  applyShortsRedirect();
  if (changes.settings.newValue?.dataUrl !== changes.settings.oldValue?.dataUrl) refreshRemoteData();
});

api.alarms.onAlarm.addListener((a) => { if (a.name === 'data') refreshRemoteData(); });

async function start() {
  await applyShortsRedirect();
  if (!(await api.alarms.get('data'))) api.alarms.create('data', { periodInMinutes: DATA_REFRESH_MINUTES });
  await refreshRemoteData();
}
api.runtime.onInstalled.addListener(start);
api.runtime.onStartup.addListener(start);
