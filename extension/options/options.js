import { UNDO_MS, restoreItem, restoreReports, restoreStats } from '../lib.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

// Each setting is a line of words; the current one is shown as [word], the others are dimmed links.
const ONOFF = [[true, 'on'], [false, 'off']];
const CHOICES = {
  shorts: ONOFF,
  posts: ONOFF,
  consent: ONOFF,
  walls: [['auto', 'auto'], ['manual', 'manual']],
  display: [['hide', 'hide'], ['show', 'show']],
  chip: ONOFF,
  gpc: ONOFF,
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
  shorts: true, posts: true, consent: true, walls: __WALLS_DEFAULT__, display: 'hide', chip: true, gpc: false, debug: false, debugEvals: false, clickDelay: false,
  // Same default rule list as the background's (the build-time one), so adding or removing a list keeps it.
  exceptions: [], acceptSites: [], dataUrls: __DATA_URL__ ? [__DATA_URL__] : [], categories: Object.fromEntries(CATEGORIES.map(([k]) => [k, false])),
};

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const link = (text, onclick) => el('a', { href: '#', textContent: text, onclick: (e) => { e.preventDefault(); onclick(); } });
const choiceLine = (options, current, onPick) => options.flatMap(([value, label], i) => [
  ...(i ? [' / '] : []),
  value === current ? el('span', { className: 'current', textContent: `[${label}]` }) : link(label, () => onPick(value)),
]);

// Removals and clears wait UNDO_MS for an undo, shown as a note where they happened. Each undo reads storage again
// and adds back only what was taken (lib.js), so a change the popup or background made meanwhile is kept.
let undos = [];
const offerUndo = (where, text, undo) => {
  const u = { where, text, undo };
  u.timer = setTimeout(() => { undos = undos.filter((x) => x !== u); render(); }, UNDO_MS);
  undos.push(u);
};
const undoNotes = (where) => undos.filter((u) => u.where === where).flatMap((u) => [
  el('span', { className: 'muted', textContent: ` ${u.text}. ` }),
  link('undo', () => { if (!undos.includes(u)) return; clearTimeout(u.timer); undos = undos.filter((x) => x !== u); u.undo(); }),
]);
const undoLine = (where) => (undos.some((u) => u.where === where) ? [el('p', { className: 'bullet', style: '--dot:#8d8d8d' }, ...undoNotes(where))] : []);
const storedSettings = async () => (await api.storage.local.get('settings')).settings ?? {};

async function render() {
  const { settings = {}, remoteStatus = {}, stats = {}, reports = [] } =
    await api.storage.local.get(['settings', 'remoteStatus', 'stats', 'reports']);
  const s = { ...DEFAULTS, ...settings, categories: { ...DEFAULTS.categories, ...settings.categories } };
  // Write only the changed keys over what is stored now: the page defaults must never be saved (they would pin
  // a default for good), and the popup may have changed something since this page rendered.
  const save = async (patch) => {
    const { settings: current = {} } = await api.storage.local.get('settings');
    await api.storage.local.set({ settings: { ...current, ...patch } });
    render();
  };

  for (const node of document.querySelectorAll('[data-choice]')) {
    const key = node.dataset.choice;
    node.replaceChildren(...choiceLine(CHOICES[key], s[key], (v) => save({ [key]: v })));
  }

  $('categories').replaceChildren(...CATEGORIES.flatMap(([k, name, desc]) => [
    el('p', { className: 'bullet', style: '--dot:#3e63dd' }, `${name}: `,
      el('span', { className: 'choice' }, ...choiceLine([[false, 'off'], [true, 'on']], s.categories[k], (v) => save({ categories: { ...s.categories, [k]: v } })))),
    el('p', { className: 'desc', textContent: desc }),
  ]));

  const SITE_LISTS = { acceptSites: ['always accept', 'exceptions'], exceptions: ['leave alone', 'acceptSites'] };
  const removeSite = (key, host) => {
    const [name, other] = SITE_LISTS[key], at = s[key].indexOf(host);
    offerUndo(key, `removed ${host} from ${name}`, async () => {
      const c = await storedSettings();
      save({ [key]: restoreItem(c[key], host, at, c[other]) });
    });
    save({ [key]: s[key].filter((h) => h !== host) });
  };
  const siteList = (key) => $(key).replaceChildren(...(s[key].length
    ? s[key].flatMap((host, i) => [...(i ? [', '] : []), `${host} (`, link('remove', () => removeSite(key, host)), ')'])
    : [el('span', { className: 'muted', textContent: 'no sites' })]), ...undoNotes(key));
  siteList('acceptSites');
  siteList('exceptions');

  // rule lists
  const urls = [...new Set([...s.dataUrls, s.dataUrl].filter(Boolean))];
  const when = (t) => new Date(t).toLocaleString();
  const removeList = (url) => {
    const at = s.dataUrls.indexOf(url), wasLegacy = s.dataUrl === url;
    offerUndo('ruleLists', `removed ${url}`, async () => {
      const c = await storedSettings();
      save({ ...(at >= 0 && { dataUrls: restoreItem(c.dataUrls ?? DEFAULTS.dataUrls, url, at) }), ...(wasLegacy && !c.dataUrl && { dataUrl: url }) });
    });
    save({ dataUrls: s.dataUrls.filter((u) => u !== url), ...(wasLegacy && { dataUrl: '' }) });
  };
  $('ruleLists').replaceChildren(...urls.map((url) => {
    const st = remoteStatus[url];
    return el('p', { className: 'bullet', style: `--dot:${st?.ok ? '#30a46c' : st ? '#e5484d' : '#8d8d8d'}` },
      `${url} `, el('span', { className: 'muted', textContent: st ? (st.ok ? `(${st.rules} rules, checked ${when(st.at)}) ` : `(failed: ${st.error}) `) : '(not checked yet) ' }),
      link('remove', () => removeList(url)));
  }), ...undoLine('ruleLists'));
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
  // Clears what is stored at the click (the background may have counted since this render), and offers that back.
  const clearStats = async () => {
    const { stats: old = {} } = await api.storage.local.get('stats');
    await api.storage.local.set({ stats: {} });
    const banners = ['refused', 'choice', 'accepted', 'walls'].reduce((t, k) => t + (old[k] ?? 0), 0);
    const since = old.since ? ` since ${new Date(old.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
    offerUndo('byCmp', `counters cleared (${banners} banners${since})`, async () => {
      const { stats: now = {} } = await api.storage.local.get('stats');
      await api.storage.local.set({ stats: restoreStats(old, now) });
      render();
    });
    render();
  };
  $('byCmp').replaceChildren(...(rows.length ? [
    el('table', {}, el('tr', {}, el('th', { textContent: 'banner (cmp)' }), el('th', { textContent: 'filled' }), el('th', { textContent: 'clicks' })),
      ...rows.map(([cmp, r]) => el('tr', {}, el('td', { textContent: cmp }), el('td', { className: 'n', textContent: r.filled }), el('td', { className: 'n', textContent: r.clicks })))),
    el('p', { className: 'bullet', style: '--dot:#8d8d8d' }, link('clear counters', clearStats)),
  ] : []), ...undoLine('byCmp'));

  // reported sites
  const lines = reports.map((r) => `${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}  ${r.url}  [${r.consent}${r.cmp ? ' ' + r.cmp : ''}]`);
  const actions = el('p', { className: 'bullet', style: '--dot:#8d8d8d' });
  actions.append(link('copy list', async () => { await navigator.clipboard.writeText(lines.join('\n')); actions.firstChild.textContent = 'copied'; }), ' / ',
    link('clear', async () => {
      const { reports: old = [] } = await api.storage.local.get('reports');
      await api.storage.local.set({ reports: [] });
      offerUndo('reports', `cleared ${old.length} reported site${old.length === 1 ? '' : 's'}`, async () => {
        const { reports: now = [] } = await api.storage.local.get('reports');
        await api.storage.local.set({ reports: restoreReports(old, now) });
        render();
      });
      render();
    }));
  $('reports').replaceChildren(...(reports.length
    ? [...lines.map((t) => el('p', { className: 'bullet', style: '--dot:#e5484d', textContent: t })), actions]
    : [el('p', { className: 'muted', textContent: 'none.' })]), ...undoLine('reports'));
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
