// Background: settings, data (bundled + remote, D6), autoconsent wiring, per-tab status and badge.
import { evalSnippets, filterCompactRules } from '@duckduckgo/autoconsent';

const api = globalThis.browser ?? globalThis.chrome;

const DEFAULT_SETTINGS = {
  shorts: true,
  consent: true,
  // Remote copy of build/data.json. Empty = use the bundled copy only.
  dataUrl: '',
  // Hosts where the consent module stays out (user's own choice, on top of the walls).
  exceptions: [],
};
const DATA_REFRESH_MINUTES = 12 * 60;
const STUCK_AFTER_MS = 15000;

export async function getSettings() {
  const { settings } = await api.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

// ---- data: bundled data.json, replaced by a newer valid remote copy ----
let bundledData;
async function getBundledData() {
  bundledData ??= await (await fetch(api.runtime.getURL('data.json'))).json();
  return bundledData;
}

export function validData(d) {
  return !!d && d.schema === 1 && typeof d.generated === 'string' &&
    Array.isArray(d.shorts?.hide) && Array.isArray(d.shorts?.cards) &&
    Array.isArray(d.consent?.walls) && Array.isArray(d.consent?.rules) &&
    Array.isArray(d.consent?.disabledCmps);
}

export async function getData() {
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

export const hostMatches = (host, domains) =>
  domains.some((d) => host === d || host.endsWith('.' + d));

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

export function badgeFor(state, now = Date.now()) {
  const stuck = state.consent === 'working' && now - (state.since ?? now) > STUCK_AFTER_MS;
  if (state.shortsLeak > 0) return { text: '!', color: '#d93025', title: `Declutter: ${state.shortsLeak} Shorts link(s) got past the selectors` };
  if (state.consent === 'failed' || stuck) return { text: '!', color: '#d93025', title: `Declutter: cookie banner (${state.cmp}) not answered` };
  if (state.consent === 'wall') return { text: '', color: '#777', title: 'Declutter: consent-or-pay wall, left to you' };
  if (state.consent === 'done') return { text: '', color: '#1e8e3e', title: `Declutter: refused ${state.cmp}` };
  return { text: '', color: '#777', title: 'Declutter' };
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
  const tabHost = new URL(sender.tab.url || senderUrl).hostname;

  switch (msg.type) {
    case 'init': {
      const [settings, data] = await Promise.all([getSettings(), getData()]);
      const wall = hostMatches(tabHost, data.consent.walls);
      const excepted = hostMatches(tabHost, settings.exceptions);
      if (frameId === 0) {
        await setTab(tabId, wall ? { consent: 'wall' } : excepted ? { consent: 'paused' } : {}, true);
      }
      const enabled = settings.consent && !wall && !excepted;
      const rules = {
        // Our Czech rules go first so they win over a generic rule for the same page.
        autoconsent: data.consent.rules,
        compact: filterCompactRules(await getCompactRules(), { url: senderUrl, mainFrame: frameId === 0 }),
      };
      await api.tabs.sendMessage(tabId, {
        type: 'initResp',
        rules,
        config: { enabled, autoAction: 'optOut', disabledCmps: data.consent.disabledCmps, enablePrehide: true, enableCosmeticRules: true },
      }, { frameId });
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
      await setTab(tabId, { consent: 'working', cmp: msg.cmp, since: Date.now() });
      break;
    case 'optOutResult':
      if (!msg.result) await setTab(tabId, { consent: 'failed', cmp: msg.cmp });
      break;
    case 'autoconsentDone':
      await setTab(tabId, { consent: 'done', cmp: msg.cmp });
      break;
    case 'autoconsentError':
      console.warn('declutter: autoconsent error', msg.details);
      break;
  }
}

api.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  if (msg.type === 'shortsLeak') {
    setTab(sender.tab.id, { shortsLeak: msg.count, leakPath: msg.path });
  } else if (msg.type === 'shortsNav') {
    setTab(sender.tab.id, { shortsLeak: 0 });
  } else {
    onConsentMessage(msg, sender).catch((e) => console.warn('declutter:', msg.type, e));
  }
});

api.tabs.onRemoved.addListener((tabId) => api.storage.session.remove(tabKey(tabId)));

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
