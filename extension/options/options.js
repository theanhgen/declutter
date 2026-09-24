const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

// Each setting is a line of words; the current one is shown as [word], the others are links.
const CHOICES = {
  shorts: [[true, 'on'], [false, 'off']],
  consent: [[true, 'on'], [false, 'off']],
  walls: [['manual', 'manual'], ['auto', 'auto']],
  debug: [[false, 'off'], [true, 'on']],
};
const DEFAULTS = { shorts: true, consent: true, walls: 'manual', debug: false, exceptions: [] };

const link = (text, onclick) => Object.assign(document.createElement('a'), { href: '#', textContent: text, onclick: (e) => { e.preventDefault(); onclick(); } });

async function render() {
  const { settings = {}, remoteData, remoteDataStatus } = await api.storage.local.get(['settings', 'remoteData', 'remoteDataStatus']);
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

  $('exceptions').replaceChildren(...(s.exceptions.length
    ? s.exceptions.flatMap((host, i) => [...(i ? [', '] : []), `${host} (`,
      link('remove', () => save({ exceptions: s.exceptions.filter((h) => h !== host) })), ')'])
    : [Object.assign(document.createElement('span'), { className: 'muted', textContent: 'no sites — add one from the toolbar menu on that site' })]));

  const bundled = await (await fetch(api.runtime.getURL('data.json'))).json();
  const data = remoteData?.generated > bundled.generated ? remoteData : bundled;
  $('walls').textContent = data.consent.walls.join(', ');
  const when = (iso) => new Date(iso).toLocaleString();
  $('data').textContent = `${data.consent.rules.length} czech rules, ${data.shorts.hide.length} shorts selectors, ` +
    `from ${data === bundled ? 'this build' : 'the update server'} (${when(data.generated)}). ` +
    (s.dataUrl || remoteDataStatus
      ? (remoteDataStatus?.ok ? `last update check ${when(remoteDataStatus.at)}.` : `last update check failed: ${remoteDataStatus?.error ?? 'not run yet'}.`)
      : 'no update server configured.');
}
render();
