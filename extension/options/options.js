const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

// Each setting is a line of words; the current one is shown as [word], the others are links.
const CHOICES = {
  shorts: [[true, 'on'], [false, 'off']],
  consent: [[true, 'on'], [false, 'off']],
  walls: [['manual', 'manual'], ['auto', 'auto']],
  debug: [[false, 'off'], [true, 'on']],
};
const DEFAULTS = { shorts: true, consent: true, walls: 'manual', debug: false, exceptions: [], acceptSites: [] };

const link = (text, onclick) => Object.assign(document.createElement('a'), { href: '#', textContent: text, onclick: (e) => { e.preventDefault(); onclick(); } });

async function render() {
  const { settings = {}, remoteData, remoteDataStatus, stats = {}, reports = [] } =
    await api.storage.local.get(['settings', 'remoteData', 'remoteDataStatus', 'stats', 'reports']);
  const s = { ...DEFAULTS, ...settings };
  const save = (patch) => api.storage.local.set({ settings: { ...s, ...patch } }).then(render);

  for (const el of document.querySelectorAll('[data-choice]')) {
    const key = el.dataset.choice;
    const parts = CHOICES[key].flatMap(([value, label], i) => [
      ...(i ? [' / '] : []),
      value === s[key] ? `[${label}]` : link(label, () => save({ [key]: value })),
    ]);
    el.replaceChildren(...parts);
  }

  const siteList = (key, empty) => $(key).replaceChildren(...(s[key].length
    ? s[key].flatMap((host, i) => [...(i ? [', '] : []), `${host} (`,
      link('remove', () => save({ [key]: s[key].filter((h) => h !== host) })), ')'])
    : [Object.assign(document.createElement('span'), { className: 'muted', textContent: empty })]));
  siteList('acceptSites', 'no sites');
  siteList('exceptions', 'no sites');

  const n = (k) => stats[k] ?? 0;
  $('stats').textContent = stats.since
    ? `${n('refused')} banners refused, ${n('accepted')} accepted by your choice, ${n('walls')} pay walls accepted, ` +
      `${n('clicks')} clicks saved, ${n('shorts')} shorts sent to the normal player — since ${new Date(stats.since).toLocaleDateString()}.`
    : 'nothing yet.';

  const lines = reports.map((r) => `${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}  ${r.url}  [${r.consent}${r.cmp ? ' ' + r.cmp : ''}]`);
  $('reports').replaceChildren(...(reports.length
    ? [...reports.map((r, i) => Object.assign(document.createElement('p'), { className: 'bullet', style: '--dot:#e5484d', textContent: lines[i] })),
      Object.assign(document.createElement('p'), {}),
    ]
    : [Object.assign(document.createElement('p'), { className: 'muted', textContent: 'none.' })]));
  if (reports.length) {
    const actions = $('reports').lastChild;
    actions.append(link('copy list', async () => { await navigator.clipboard.writeText(lines.join('\n')); actions.firstChild.textContent = 'copied'; }), ' / ',
      link('clear', () => api.storage.local.set({ reports: [] }).then(render)));
  }

  const bundled = await (await fetch(api.runtime.getURL('data.json'))).json();
  const data = remoteData?.generated > bundled.generated ? remoteData : bundled;
  $('walls').textContent = data.consent.walls.join(', ');
  const when = (iso) => new Date(iso).toLocaleString();
  $('data').textContent = `${data.consent.rules.length} czech rules, ${data.shorts.hide.length} shorts selectors, ` +
    `from ${data === bundled ? 'this build' : 'the update server'} (${when(data.generated)}). ` +
    (s.dataUrl || remoteDataStatus
      ? (remoteDataStatus?.ok ? `last update check ${when(remoteDataStatus.at)}.` : `last update check failed: ${remoteDataStatus?.error ?? 'not run yet'}.`)
      : 'no update server configured.');
  if (s.dataUrl) {
    $('data').append(' ', link('update now', async () => { await api.runtime.sendMessage({ type: 'updateData' }); render(); }));
  }
}
render();
