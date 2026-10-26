import { siteHost, siteMode, siteModePatch, ruleListLine, updateOutcome } from '../lib.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

// Each setting is a line of words; the current one is shown as [word], the others are dimmed links.
const ONOFF = [[true, 'on'], [false, 'off']];
const CHOICES = {
  shorts: ONOFF,
  posts: ONOFF,
  playables: ONOFF,
  dates: ONOFF,
  consent: ONOFF,
  walls: [['auto', 'auto'], ['manual', 'manual']],
  display: [['hide', 'hide'], ['show', 'show']],
  chip: ONOFF,
  gpc: ONOFF,
  debug: [[false, 'off'], [true, 'on']],
  debugEvals: [[false, 'off'], [true, 'on']],
  clickDelay: [[false, 'off'], [true, 'on']],
};
// The popup's per-site words, same order.
const SITE_MODES = [['refuse', 'refuse'], ['accept', 'accept'], ['ignore', 'leave alone']];
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
  shorts: true, posts: true, playables: true, dates: true, consent: true, walls: __WALLS_DEFAULT__, display: 'hide', chip: true, gpc: false, debug: false, debugEvals: false, clickDelay: false,
  // Same default rule list as the background's (the build-time one), so adding or removing a list keeps it.
  exceptions: [], acceptSites: [], refuseSites: [], wallAskSites: [], dataUrls: __DATA_URL__ ? [__DATA_URL__] : [], categories: Object.fromEntries(CATEGORIES.map(([k]) => [k, false])),
};

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const link = (text, onclick) => el('a', { href: '#', textContent: text, onclick: (e) => { e.preventDefault(); onclick(); } });
const choiceLine = (options, current, onPick) => options.flatMap(([value, label], i) => [
  ...(i ? [' / '] : []),
  value === current ? el('span', { className: 'current', textContent: `[${label}]` }) : link(label, () => onPick(value)),
]);

// What the last "update rules now" ended in (checking…, up to date, new rules or the error), kept across renders.
let updateNote = '';
let updating = false;

async function render() {
  const { settings = {}, remoteStatus = {}, stats = {}, reports = [] } =
    await api.storage.local.get(['settings', 'remoteStatus', 'stats', 'reports']);
  const s = { ...DEFAULTS, ...settings, categories: { ...DEFAULTS.categories, ...settings.categories } };
  // Write only the changed keys over what is stored now: the page defaults must never be saved (they would pin
  // a default for good), and the popup may have changed something since this page rendered.
  // A function patch is computed from what is stored at the time of writing: this page may be stale.
  const save = async (patch) => {
    const { settings: current = {} } = await api.storage.local.get('settings');
    await api.storage.local.set({ settings: { ...current, ...(typeof patch === 'function' ? patch(current) : patch) } });
    // render() replaces the lines, which would drop keyboard focus to the top of the page: put it back on the line
    // that was changed.
    const line = document.activeElement?.closest('p, div[id]');
    const at = line && [...document.querySelectorAll('p, div[id]')].indexOf(line);
    await render();
    if (at >= 0) document.querySelectorAll('p, div[id]')[at]?.querySelector('a')?.focus();
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

  // Per site: one line per listed host with the popup's choice (lib.js), so a change here is what the popup shows
  // there. A subdomain listed under a listed parent keeps its own line.
  const hosts = [...new Set([...s.acceptSites, ...s.exceptions, ...s.refuseSites])].sort();
  $('sites').replaceChildren(...(hosts.length
    ? hosts.map((host) => el('p', { className: 'bullet', style: '--dot:#8d8d8d' }, `${host}: `,
      el('span', { className: 'choice' }, ...choiceLine(SITE_MODES, siteMode(host, s), (m) => save((cur) => siteModePatch(host, m, cur))))))
    : [el('p', { className: 'desc', textContent: 'no sites yet.' })]));
  const addSite = (mode) => (e) => {
    e.preventDefault();
    const host = siteHost($('newSite').value);
    if (!host) { $('newSite').focus(); return; }
    $('newSite').value = '';
    save((cur) => siteModePatch(host, mode, cur));
  };
  $('addAccept').onclick = addSite('accept');
  $('addIgnore').onclick = addSite('ignore');
  // Pay-wall sites set to "ask me" in the popup (wallMode in lib.js).
  $('wallAskSites').replaceChildren(...(s.wallAskSites.length
    ? s.wallAskSites.flatMap((host, i) => [...(i ? [', '] : []), `${host} (`, link('remove', () => save({ wallAskSites: s.wallAskSites.filter((h) => h !== host) })), ')'])
    : [el('span', { className: 'muted', textContent: 'no sites' })]));

  // rule lists
  const urls = [...new Set([...s.dataUrls, s.dataUrl].filter(Boolean))];
  const when = (t) => new Date(t).toLocaleString();
  $('ruleLists').replaceChildren(...urls.map((url) => {
    const line = ruleListLine(remoteStatus[url]);
    return el('p', { className: 'bullet', style: `--dot:${line.dot}` },
      `${url} `, el('span', { className: 'muted', textContent: `${line.text} ` }),
      link('remove', () => save({ dataUrls: s.dataUrls.filter((u) => u !== url), ...(s.dataUrl === url && { dataUrl: '' }) })));
  }));
  $('newList').oninput = () => { $('newListError').hidden = true; };
  $('addList').onclick = (e) => {
    e.preventDefault();
    const url = $('newList').value.trim();
    if (!/^https:\/\//.test(url)) { $('newListError').hidden = false; $('newList').focus(); return; }
    $('newListError').hidden = true;
    save({ dataUrls: [...new Set([...s.dataUrls, url])] });
  };
  const bundled = await (await fetch(api.runtime.getURL('data.json'))).json();
  $('data').replaceChildren(`built in: ${bundled.consent.rules.length} rules, ${bundled.shorts.hide.length} shorts selectors (${when(bundled.generated)}). `,
    ...(urls.length ? [link('update rules now', async () => {
      if (updating) return;
      updating = true;
      updateNote = 'checking…';
      render();
      try {
        await api.runtime.sendMessage({ type: 'updateData' });
        const { remoteStatus: after = {} } = await api.storage.local.get('remoteStatus');
        updateNote = updateOutcome(urls, remoteStatus, after);
      } catch (e) {
        updateNote = `couldn't update (${e?.message || e})`;
      } finally {
        updating = false;
        render();
      }
    }), ...(updateNote ? [' ', el('span', { className: 'muted', textContent: updateNote })] : [])] : []));
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
  // A send that could not go out waits on the report (background.js sendReport); cancel drops it before it is retried.
  const cancelSend = async (host) => {
    const { reports: current = [] } = await api.storage.local.get('reports');
    await api.storage.local.set({ reports: current.map(({ sendPending, ...r }) => (r.host === host ? r : { ...r, ...(sendPending && { sendPending }) })) });
    render();
  };
  const sendState = (r) => r.sendPending ? ['  ', el('span', { className: 'muted', textContent: 'waiting to send (' }), link('cancel', () => cancelSend(r.host)), el('span', { className: 'muted', textContent: ')' })]
    : r.sentAt ? ['  ', el('span', { className: 'muted', textContent: 'sent' })] : [];
  $('reports').replaceChildren(...(reports.length
    ? [...lines.map((t, i) => el('p', { className: 'bullet', style: '--dot:#e5484d' }, t, ...sendState(reports[i]))), actions]
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
