const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

// Each setting is a line of words; the current one is shown as [word], the others are dimmed links.
const ONOFF = [[true, 'on'], [false, 'off']];
const CHOICES = {
  shorts: ONOFF,
  consent: ONOFF,
  walls: [['auto', 'auto'], ['manual', 'manual']],
  display: [['hide', 'hide'], ['show', 'show']],
  debug: [[false, 'off'], [true, 'on']],
  debugEvals: [[false, 'off'], [true, 'on']],
  clickDelay: [[false, 'off'], [true, 'on']],
};
// Consent-O-Matic's categories, same letters and meaning.
const CATEGORIES = [
  ['A', 'preferences and functionality', 'remember your choices (language, region, login) and enhanced personal features; not used to track you on other sites.'],
  ['B', 'performance and analytics', 'count visits and traffic sources, and see how visitors move around the site.'],
  ['D', 'information storage and access', 'store or read identifiers on your device (cookies, advertising and device ids).'],
  ['E', 'content selection, delivery, and reporting', 'personalise content from a profile of your interests, and measure it.'],
  ['F', 'ad selection, delivery, and reporting', 'personalise ads from a profile of your interests, and measure them. includes Google.'],
  ['X', 'other purposes', 'anything the site does not describe clearly or that fits no other category.'],
];
const DEFAULTS = {
  shorts: true, consent: true, walls: __WALLS_DEFAULT__, display: 'hide', debug: false, debugEvals: false, clickDelay: false,
  exceptions: [], acceptSites: [], dataUrls: [], categories: Object.fromEntries(CATEGORIES.map(([k]) => [k, false])),
};

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const link = (text, onclick) => el('a', { href: '#', textContent: text, onclick: (e) => { e.preventDefault(); onclick(); } });
const choiceLine = (options, current, onPick) => options.flatMap(([value, label], i) => [
  ...(i ? [' / '] : []),
  value === current ? el('span', { className: 'current', textContent: `[${label}]` }) : link(label, () => onPick(value)),
]);

async function render() {
  const { settings = {}, remoteStatus = {}, stats = {}, reports = [] } =
    await api.storage.local.get(['settings', 'remoteStatus', 'stats', 'reports']);
  const s = { ...DEFAULTS, ...settings, categories: { ...DEFAULTS.categories, ...settings.categories } };
  const save = (patch) => api.storage.local.set({ settings: { ...s, ...patch } }).then(render);

  for (const node of document.querySelectorAll('[data-choice]')) {
    const key = node.dataset.choice;
    node.replaceChildren(...choiceLine(CHOICES[key], s[key], (v) => save({ [key]: v })));
  }

  $('categories').replaceChildren(...CATEGORIES.flatMap(([k, name, desc]) => [
    el('p', { className: 'bullet', style: '--dot:#3e63dd' }, `${name}: `,
      el('span', { className: 'choice' }, ...choiceLine([[false, 'off'], [true, 'on']], s.categories[k], (v) => save({ categories: { ...s.categories, [k]: v } })))),
    el('p', { className: 'desc', textContent: desc }),
  ]));

  const siteList = (key) => $(key).replaceChildren(...(s[key].length
    ? s[key].flatMap((host, i) => [...(i ? [', '] : []), `${host} (`, link('remove', () => save({ [key]: s[key].filter((h) => h !== host) })), ')'])
    : [el('span', { className: 'muted', textContent: 'no sites' })]));
  siteList('acceptSites');
  siteList('exceptions');

  // rule lists
  const urls = [...new Set([...s.dataUrls, s.dataUrl].filter(Boolean))];
  const when = (t) => new Date(t).toLocaleString();
  $('ruleLists').replaceChildren(...urls.map((url) => {
    const st = remoteStatus[url];
    return el('p', { className: 'bullet', style: `--dot:${st?.ok ? '#30a46c' : st ? '#e5484d' : '#8d8d8d'}` },
      `${url} `, el('span', { className: 'muted', textContent: st ? (st.ok ? `(${st.rules} rules, checked ${when(st.at)}) ` : `(failed: ${st.error}) `) : '(not checked yet) ' }),
      link('remove', () => save({ dataUrls: s.dataUrls.filter((u) => u !== url), ...(s.dataUrl === url && { dataUrl: '' }) })));
  }));
  $('addList').onclick = (e) => {
    e.preventDefault();
    const url = $('newList').value.trim();
    if (!/^https:\/\//.test(url)) { $('newList').focus(); return; }
    save({ dataUrls: [...new Set([...s.dataUrls, url])] });
  };
  const bundled = await (await fetch(api.runtime.getURL('data.json'))).json();
  $('data').replaceChildren(`built in: ${bundled.consent.rules.length} rules, ${bundled.shorts.hide.length} shorts selectors (${when(bundled.generated)}). `,
    ...(urls.length ? [link('update rules now', async () => { await api.runtime.sendMessage({ type: 'updateData' }); render(); })] : []));
  $('wallSites').textContent = bundled.consent.walls.join(', ');

  // about
  const n = (k) => stats[k] ?? 0;
  $('clicksSaved').textContent = n('clicks');
  $('stats').textContent = stats.since
    ? `${n('refused')} banners refused, ${n('choice')} answered with your mix, ${n('accepted')} accepted, ${n('walls')} pay walls accepted, ` +
      `${n('shorts')} shorts sent to the normal player — since ${new Date(stats.since).toLocaleDateString()}.`
    : 'nothing yet.';
  const rows = Object.entries(stats.byCmp ?? {}).sort((a, b) => b[1].filled - a[1].filled);
  $('byCmp').replaceChildren(...(rows.length ? [
    el('table', {}, el('tr', {}, el('th', { textContent: 'banner (cmp)' }), el('th', { textContent: 'filled' }), el('th', { textContent: 'clicks' })),
      ...rows.map(([cmp, r]) => el('tr', {}, el('td', { textContent: cmp }), el('td', { className: 'n', textContent: r.filled }), el('td', { className: 'n', textContent: r.clicks })))),
    el('p', { className: 'bullet', style: '--dot:#8d8d8d' }, link('clear counters', () => api.storage.local.set({ stats: {} }).then(render))),
  ] : []));

  // reported sites
  const lines = reports.map((r) => `${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}  ${r.url}  [${r.consent}${r.cmp ? ' ' + r.cmp : ''}]`);
  const actions = el('p', { className: 'bullet', style: '--dot:#8d8d8d' });
  actions.append(link('copy list', async () => { await navigator.clipboard.writeText(lines.join('\n')); actions.firstChild.textContent = 'copied'; }), ' / ',
    link('clear', () => api.storage.local.set({ reports: [] }).then(render)));
  $('reports').replaceChildren(...(reports.length
    ? [...lines.map((t) => el('p', { className: 'bullet', style: '--dot:#e5484d', textContent: t })), actions]
    : [el('p', { className: 'muted', textContent: 'none.' })]));
}
render();

// One section at a time, picked by the #hash (so a tab survives reload and the back button works).
function showSection() {
  // data-tab, not id: an id would also be a scroll anchor and push the nav off screen.
  const want = location.hash.slice(1);
  const id = document.querySelector(`section[data-tab="${CSS.escape(want)}"]`) ? want : 'youtube';
  for (const sec of document.querySelectorAll('section')) sec.classList.toggle('shown', sec.dataset.tab === id);
  for (const a of document.querySelectorAll('nav a')) a.classList.toggle('current', a.getAttribute('href') === `#${id}`);
}
addEventListener('hashchange', showSection);
showSection();

// Tip link: set at build time (DECLUTTER_TIP_URL), always empty in Safari builds.
if (__TIP_URL__) { document.getElementById('tipLink').href = __TIP_URL__; document.getElementById('tip').hidden = false; }
