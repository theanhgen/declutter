const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function main() {
  $('settings').onclick = (e) => { e.preventDefault(); api.runtime.openOptionsPage(); window.close(); };
  const { settings = {} } = await api.storage.local.get('settings');
  const s = { shorts: true, consent: true, exceptions: [], ...settings };
  const save = (patch) => api.storage.local.set({ settings: { ...s, ...patch } }).then(() => Object.assign(s, patch));

  for (const k of ['shorts', 'consent']) {
    $(k).checked = s[k];
    $(k).onchange = () => save({ [k]: $(k).checked });
  }

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('http')) return;
  const host = new URL(tab.url).hostname;
  $('host').textContent = host;
  const state = (await api.storage.session.get(`tab-${tab.id}`))[`tab-${tab.id}`] ?? {};

  const c = $('consentStatus');
  const stuck = state.consent === 'working' && Date.now() - state.since > 15000;
  if (state.consent === 'done') { c.textContent = `Refused cookies (${state.cmp})`; c.className = 'ok'; }
  else if (state.consent === 'failed' || stuck) { c.textContent = `Banner not answered (${state.cmp})`; c.className = 'bad'; }
  else if (state.consent === 'wall') {
    c.textContent = state.looping
      ? 'This wall came back right after being accepted, so auto-accept paused here. Accept manually, or reload later.'
      : 'Consent-or-pay wall: agree to tracking or pay. There is no free refuse.';
    $('acceptWall').hidden = false;
    $('acceptWall').onclick = async () => {
      await api.runtime.sendMessage({ type: 'acceptWall', tabId: tab.id });
      window.close();
    };
  }
  else if (state.consent === 'accepting') { c.textContent = `Accepting the wall (${state.cmp})…`; }
  else if (state.consent === 'accepted') { c.textContent = `Accepted the pay wall (${state.cmp})`; c.className = 'muted'; }
  else if (state.consent === 'paused') { c.textContent = 'Paused on this site'; c.className = 'muted'; }
  else if (state.consent === 'working') { c.textContent = `Answering ${state.cmp}…`; }
  else { c.textContent = 'No cookie banner recognised'; c.className = 'muted'; }

  if (state.shortsLeak > 0) {
    $('shortsStatus').textContent = `${state.shortsLeak} Shorts link(s) got past the selectors on ${state.leakPath}`;
    $('shortsStatus').className = 'bad';
  }

  const paused = s.exceptions.includes(host);
  $('pause').hidden = false;
  $('pause').textContent = paused ? 'Answer banners on this site again' : 'Leave banners alone on this site';
  $('pause').onclick = async () => {
    await save({ exceptions: paused ? s.exceptions.filter((h) => h !== host) : [...s.exceptions, host] });
    api.tabs.reload(tab.id);
    window.close();
  };
}
main();
