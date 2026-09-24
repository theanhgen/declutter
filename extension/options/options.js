const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function render() {
  const { settings = {}, remoteData, remoteDataStatus } = await api.storage.local.get(['settings', 'remoteData', 'remoteDataStatus']);
  const s = { shorts: true, consent: true, debug: false, exceptions: [], ...settings };
  const save = (patch) => api.storage.local.set({ settings: { ...s, ...patch } }).then(render);

  for (const k of ['shorts', 'consent', 'debug']) {
    $(k).checked = s[k];
    $(k).onchange = () => save({ [k]: $(k).checked });
  }

  $('exceptions').replaceChildren(...s.exceptions.map((host) => {
    const li = document.createElement('li');
    const b = Object.assign(document.createElement('button'), { textContent: 'Remove' });
    b.onclick = () => save({ exceptions: s.exceptions.filter((h) => h !== host) });
    li.append(host, b);
    return li;
  }));
  $('noExceptions').hidden = s.exceptions.length > 0;

  const bundled = await (await fetch(api.runtime.getURL('data.json'))).json();
  const data = remoteData?.generated > bundled.generated ? remoteData : bundled;
  $('walls').textContent = data.consent.walls.join(', ');
  const when = (iso) => new Date(iso).toLocaleString();
  $('data').textContent = `${data.consent.rules.length} Czech rules, ${data.shorts.hide.length} Shorts selectors, ` +
    `from ${data === bundled ? 'this build' : 'the update server'} (${when(data.generated)}). ` +
    (s.dataUrl || remoteDataStatus
      ? (remoteDataStatus?.ok ? `Last update check ${when(remoteDataStatus.at)}.` : `Last update check failed: ${remoteDataStatus?.error ?? 'not run yet'}.`)
      : 'No update server configured.');
}
render();
