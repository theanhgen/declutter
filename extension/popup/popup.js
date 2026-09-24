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
  const s = { shorts: true, consent: true, exceptions: [], acceptSites: [], ...settings };
  const save = (patch) => api.storage.local.set({ settings: { ...s, ...patch } }).then(() => Object.assign(s, patch));
  for (const k of ['shorts', 'consent']) {
    $(k).checked = s[k];
    $(k).onchange = () => save({ [k]: $(k).checked });
  }

  // ?tab=<id> renders the popup for a given tab (tests open it as a page).
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  const [tab] = forced ? [await api.tabs.get(forced)] : await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('http')) return;
  const host = new URL(tab.url).hostname;
  $('host').textContent = host.replace(/^www\./, '');
  const state = (await api.storage.session.get(`tab-${tab.id}`))[`tab-${tab.id}`] ?? {};

  const rows = [];
  const stuck = state.consent === 'working' && Date.now() - state.since > 15000;
  if (state.consent === 'done') rows.push(statusRow('ok', 'cookies refused', state.choiceFallback ? `${state.cmp} — your mix isn't supported by this banner, so everything was refused` : state.cmp));
  else if (state.consent === 'choice') rows.push(statusRow('ok', 'your choice applied', `${state.cmp} via ${state.adapter}`));
  else if (state.consent === 'failed' || stuck) rows.push(statusRow('bad', 'banner not answered', state.cmp));
  else if (state.consent === 'wall') {
    rows.push(statusRow('wall', 'pay wall: agree or pay', state.looping
      ? 'it came back right after accepting, so auto-accept paused here'
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
  else rows.push(statusRow('', 'no cookie banner here'));
  if (state.shortsLeak > 0) rows.push(statusRow('bad', `${state.shortsLeak} shorts got through`, `on ${state.leakPath}`));
  $('status').replaceChildren(...rows);
  $('pageSection').hidden = false;

  // Per-site choice: refuse (default) / accept / leave alone.
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
  $('report').onclick = async () => {
    await api.runtime.sendMessage({ type: 'report', tabId: tab.id });
    $('report').querySelector('.label').textContent = 'reported, thanks';
    $('report').disabled = true;
    $('reported').hidden = false;
  };
}
main();
