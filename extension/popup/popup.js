import { choiceMode, reportUrl } from '../lib.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

// iPhone/iPad: full-width sheet with larger touch targets.
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent) && matchMedia('(pointer: coarse)').matches)) {
  document.documentElement.classList.add('ios');
}

function statusRow(kind, text, sub) {
  const row = document.createElement('div');
  row.className = 'row';
  const dot = Object.assign(document.createElement('span'), { className: `dot ${kind}` });
  const label = Object.assign(document.createElement('span'), { className: 'label', textContent: text });
  if (sub) label.append(Object.assign(document.createElement('span'), { className: 'sub', textContent: sub }));
  row.append(dot, label);
  return row;
}

async function main() {
  $('settings').onclick = () => { api.runtime.openOptionsPage(); window.close(); };

  const { settings = {} } = await api.storage.local.get('settings');
  const s = { shorts: true, posts: true, consent: true, ...settings };
  for (const k of ['exceptions', 'acceptSites']) if (!Array.isArray(s[k])) s[k] = [];
  // Only the changed keys over what is stored now (never the defaults above, and Settings may be open too).
  const save = async (patch) => {
    const { settings: current = {} } = await api.storage.local.get('settings');
    await api.storage.local.set({ settings: { ...current, ...patch } });
    Object.assign(s, patch);
  };
  for (const k of ['shorts', 'posts', 'consent']) {
    $(k).checked = s[k];
    $(k).onchange = () => save({ [k]: $(k).checked });
  }

  // ?tab=<id> renders the popup for a given tab (tests open it as a page).
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  const [tab] = forced ? [await api.tabs.get(forced)] : await api.tabs.query({ active: true, currentWindow: true });
  if (!/^https?:/.test(tab?.url ?? '')) {
    $('status').replaceChildren(statusRow('', "declutter doesn't run on browser pages"));
    $('pageSection').hidden = false;
    return;
  }
  const host = new URL(tab.url).hostname;
  $('host').textContent = host.replace(/^www\./, '');
  const state = (await api.storage.session.get(`tab-${tab.id}`))[`tab-${tab.id}`] ?? {};

  const rows = [];
  const stuck = state.consent === 'working' && Date.now() - state.since > 15000;
  // A tab opened before declutter was installed or updated has no live content script: nothing will happen there
  // until it is reloaded. Only asked when nothing was recorded for the tab.
  const running = state.host ? true : await api.tabs.sendMessage(tab.id, { type: 'ping' }, { frameId: 0 }).then((r) => !!r, () => false);
  const failed = state.consent === 'failed' || stuck;
  // Safari runs nothing on a site until the user allows it there ("Always Allow on Every Website"), and Chrome can
  // restrict site access too. Say so instead of "no cookie banner here".
  const allowed = await api.permissions.contains({ origins: [`${new URL(tab.url).origin}/*`] }).catch(() => true);
  if (!allowed && !state.consent) {
    rows.push(statusRow('bad', 'not allowed on this site', {
      safari: 'allow it on every website: Safari → Settings → Extensions (iPhone: Settings → Apps → Safari → Extensions) → declutter',
      firefox: 'the extensions button → declutter → always allow on all sites',
      chrome: 'right-click the declutter button → "This can read and change site data" → on all sites',
    }[__TARGET__]));
  } else if (!s.consent) rows.push(statusRow('', 'cookie banners: off', 'switch "answer cookie banners" on above'));
  else if (!running) {
    rows.push(statusRow('bad', "declutter isn't running on this page yet", 'it was open before declutter was installed or updated'));
    $('reload').hidden = false;
    $('reload').onclick = () => { api.tabs.reload(tab.id); window.close(); };
  } else if (state.consent === 'done') rows.push(statusRow('ok', state.cosmetic ? 'banner hidden' : 'cookies refused', state.choiceFallback ? `${state.cmp} — your mix isn't supported by this banner, so everything was refused` : state.cmp));
  else if (state.consent === 'choice') rows.push(statusRow('ok', 'your choice applied', `${state.cmp} via ${state.adapter}`));
  else if (failed) rows.push(statusRow('bad', "declutter couldn't answer this banner", 'answer it yourself on the page. reporting it helps get it fixed.'));
  else if (state.consent === 'wall') {
    rows.push(statusRow('wall', 'pay wall: agree or pay', state.looping
      ? 'it came back twice within a minute after accepting, so auto-accept is paused in this tab'
      : 'there is no free refuse on this site'));
    $('acceptWall').hidden = false;
    $('acceptWall').onclick = async () => {
      await api.runtime.sendMessage({ type: 'acceptWall', tabId: tab.id });
      window.close();
    };
  } else if (state.consent === 'accepting') rows.push(statusRow('wall', 'accepting the wall…', state.cmp));
  else if (state.consent === 'accepted') rows.push(statusRow('wall', 'pay wall accepted', state.cmp));
  else if (state.consent === 'paused') rows.push(statusRow('', 'banners left alone here'));
  else if (state.consent === 'acceptedSite') rows.push(statusRow('ok', 'cookies accepted (your choice)', state.cmp));
  else if (state.consent === 'working') rows.push(statusRow('', `answering ${state.cmp}…`));
  else rows.push(statusRow('', 'no known cookie banner found'));
  if (state.shortsLeak > 0) {
    rows.push(statusRow('', `${state.shortsLeak} shorts caught by the backup check, hidden`,
      `on ${state.leakPath}: report it so the main list learns them`));
  }
  $('status').replaceChildren(...rows);
  $('pageSection').hidden = false;

  // Per-site choice: the global answer (refuse / your mix / accept, from Settings → your choice) / accept / leave alone.
  $('siteMode').querySelector('[data-mode=refuse]').textContent = { refuse: 'refuse', mix: 'your mix', accept: 'accept all' }[choiceMode(s.categories)];
  const mode = s.exceptions.includes(host) ? 'ignore' : s.acceptSites.includes(host) ? 'accept' : 'refuse';
  for (const b of $('siteMode').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    b.onclick = async () => {
      const m = b.dataset.mode;
      await save({
        exceptions: [...s.exceptions.filter((h) => h !== host), ...(m === 'ignore' ? [host] : [])],
        acceptSites: [...s.acceptSites.filter((h) => h !== host), ...(m === 'accept' ? [host] : [])],
      });
      api.tabs.reload(tab.id);
      window.close();
    };
  }
  $('siteSection').hidden = false;

  $('report').hidden = false;
  // When declutter failed, reporting is the next step: put it first.
  if (failed) $('actions').prepend($('report'));
  const sendUrl = reportUrl(tab.url);
  $('report').onclick = async () => {
    await api.runtime.sendMessage({ type: 'report', tabId: tab.id });
    $('report').querySelector('.label').textContent = 'reported, thanks';
    $('report').disabled = true;
    $('reported').hidden = false;
    // Offer to send it, showing exactly what goes out. Nothing is sent without this second press.
    if (!sendUrl) return;
    $('sendNote').textContent = `sends ${sendUrl} (the site, not the page), what declutter saw here, and its version. nothing else.`;
    $('sendNote').hidden = false;
    $('send').hidden = false;
  };
  $('send').onclick = async () => {
    // Firefox: sending a page address is optional data collection, granted in its own prompt (from this click).
    if (__TARGET__ === 'firefox' && !(await api.permissions.request({ data_collection: ['browsingActivity'] }))) return;
    $('send').disabled = true;
    // The background sends this exact address, and nothing if the tab has moved to another site since.
    const ok = await api.runtime.sendMessage({ type: 'sendReport', tabId: tab.id, url: sendUrl });
    $('send').querySelector('.label').textContent = ok ? 'sent, thanks' : 'could not send, try later';
    if (!ok) $('send').disabled = false;
  };
}
main();
