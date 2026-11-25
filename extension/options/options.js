import { siteHost, siteMode, siteModePatch, ruleListLine, updateOutcome, reasonText, UNDO_MS, restoreItem, restoreReports, restoreStats, shortsStatsText, aboutSummary } from '../lib.js';
import { CATEGORIES, CATEGORIES_CS } from '../features.js';
import { applyI18n, LANG, t } from '../i18n.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
applyI18n();
// The intro line carries no key: test/unit.test.mjs pins its HTML to the feature line, word for word.
if (LANG !== 'en') document.querySelector('h1 + p').textContent = t('settings.intro');
// A sent reason word ("shorts:search") in the popup's words ("shorts got through (search)").
const reasonLabel = (w) => { const [k, type] = w.split(':'); return `· ${reasonText(k) ?? k}${type ? ` (${type})` : ''}`; };

// Each setting is a line of words; the current one is shown as [word], the others are dimmed links.
const ONOFF = [[true, t('on')], [false, t('off')]];
const OFFON = [[false, t('off')], [true, t('on')]];
const CHOICES = {
  shorts: ONOFF,
  posts: ONOFF,
  playables: ONOFF,
  dates: ONOFF,
  consent: ONOFF,
  walls: [['auto', t('walls.auto')], ['manual', t('walls.manual')]],
  display: [['hide', t('display.hide')], ['show', t('display.show')]],
  chip: ONOFF,
  gpc: ONOFF,
  debug: OFFON,
  debugEvals: OFFON,
  clickDelay: OFFON,
};
// The popup's per-site words, same order.
const SITE_MODES = [['refuse', t('site.refuse')], ['accept', t('site.accept')], ['ignore', t('site.ignore')]];
// A mode in an undo note: English keeps the mode's own word, as before.
const modeWord = (m) => (LANG === 'en' ? m : t(`site.${m}`));
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
  link(t('settings.undo'), () => { if (!undos.includes(u)) return; clearTimeout(u.timer); undos = undos.filter((x) => x !== u); u.undo(); }),
]);
const undoLine = (where) => (undos.some((u) => u.where === where) ? [el('p', { className: 'bullet' }, ...undoNotes(where))] : []);
const storedSettings = async () => (await api.storage.local.get('settings')).settings ?? {};

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

  $('categories').replaceChildren(...CATEGORIES.map(([k, ...en]) => [k, ...(LANG === 'cs' ? CATEGORIES_CS[k] : en)]).flatMap(([k, name, desc]) => [
    el('p', { className: 'bullet' }, `${name}: `,
      el('span', { className: 'choice' }, ...choiceLine(OFFON, s.categories[k], (v) => save({ categories: { ...s.categories, [k]: v } })))),
    el('p', { className: 'desc', textContent: desc }),
  ]));

  // A changed choice can be undone: back to the mode the host had, on what is stored by then (siteModePatch).
  const setSite = (host, m) => {
    const was = siteMode(host, s);
    if (m === was) return;
    offerUndo('sites', `${host}: ${modeWord(was)} → ${modeWord(m)}`, () => save((cur) => siteModePatch(host, was, cur)));
    save((cur) => siteModePatch(host, m, cur));
  };
  // Per site: one line per listed host with the popup's choice (lib.js), so a change here is what the popup shows
  // there. A subdomain listed under a listed parent keeps its own line.
  const hosts = [...new Set([...s.acceptSites, ...s.exceptions, ...s.refuseSites])].sort();
  $('sites').replaceChildren(...(hosts.length
    ? hosts.map((host) => el('p', { className: 'bullet' }, `${host}: `,
      el('span', { className: 'choice' }, ...choiceLine(SITE_MODES, siteMode(host, s), (m) => setSite(host, m)))))
    : [el('p', { className: 'desc', textContent: t('settings.noSites') })]), ...undoLine('sites'));
  const addSite = (mode) => (e) => {
    e.preventDefault();
    const host = siteHost($('newSite').value);
    if (!host) { $('newSite').focus(); return; }
    $('newSite').value = '';
    save((cur) => siteModePatch(host, mode, cur));
  };
  $('addAccept').onclick = addSite('accept');
  $('addIgnore').onclick = addSite('ignore');
  // Pay-wall sites set to "ask me" in the popup (wallMode in lib.js); a removal can be undone.
  const removeSite = (key, host) => {
    const at = s[key].indexOf(host);
    offerUndo(key, t('settings.removed', { item: host }), async () => {
      const c = await storedSettings();
      save({ [key]: restoreItem(c[key], host, at) });
    });
    save({ [key]: s[key].filter((h) => h !== host) });
  };
  const siteList = (key) => $(key).replaceChildren(...(s[key].length
    ? s[key].flatMap((host, i) => [...(i ? [', '] : []), `${host} (`, link(t('settings.remove'), () => removeSite(key, host)), ')'])
    : [el('span', { className: 'muted', textContent: t('settings.none') })]), ...undoNotes(key));
  siteList('wallAskSites');

  // rule lists
  const urls = [...new Set([...s.dataUrls, s.dataUrl].filter(Boolean))];
  const when = (t) => new Date(t).toLocaleString();
  const removeList = (url) => {
    const at = s.dataUrls.indexOf(url), wasLegacy = s.dataUrl === url;
    offerUndo('ruleLists', t('settings.removed', { item: url }), async () => {
      const c = await storedSettings();
      save({ ...(at >= 0 && { dataUrls: restoreItem(c.dataUrls ?? DEFAULTS.dataUrls, url, at) }), ...(wasLegacy && !c.dataUrl && { dataUrl: url }) });
    });
    save({ dataUrls: s.dataUrls.filter((u) => u !== url), ...(wasLegacy && { dataUrl: '' }) });
  };
  $('ruleLists').replaceChildren(...urls.map((url) => {
    const line = ruleListLine(remoteStatus[url]);
    return el('p', { className: 'bullet', style: `--dot:${line.dot}` },
      `${url} `, el('span', { className: 'muted', textContent: `${line.text} ` }),
      link(t('settings.remove'), () => removeList(url)));
  }), ...undoLine('ruleLists'));
  $('newList').oninput = () => { $('newListError').hidden = true; };
  $('addList').onclick = (e) => {
    e.preventDefault();
    const url = $('newList').value.trim();
    if (!/^https:\/\//.test(url)) { $('newListError').hidden = false; $('newList').focus(); return; }
    $('newListError').hidden = true;
    save({ dataUrls: [...new Set([...s.dataUrls, url])] });
  };
  const bundled = await (await fetch(api.runtime.getURL('data.json'))).json();
  $('data').replaceChildren(t('settings.builtIn', { rules: bundled.consent.rules.length, selectors: bundled.shorts.hide.length, date: when(bundled.generated) }),
    ...(urls.length ? [link(t('settings.updateNow'), async () => {
      if (updating) return;
      updating = true;
      updateNote = t('settings.checking');
      render();
      try {
        await api.runtime.sendMessage({ type: 'updateData' });
        const { remoteStatus: after = {} } = await api.storage.local.get('remoteStatus');
        updateNote = updateOutcome(urls, remoteStatus, after);
      } catch (e) {
        updateNote = t('settings.updateFailed', { error: e?.message || e });
      } finally {
        updating = false;
        render();
      }
    }), ...(updateNote ? [' ', el('span', { className: 'muted', textContent: updateNote })] : [])] : []));
  $('wallSites').textContent = bundled.consent.walls.join(', ');

  // about
  const n = (k) => stats[k] ?? 0;
  $('shortsStats').textContent = shortsStatsText(stats);
  const summary = aboutSummary(stats);
  $('summary').textContent = summary.headline;
  $('clicksSaved').textContent = summary.clicks;
  $('stats').hidden = !stats.since;
  $('stats').textContent = stats.since
    ? t('settings.stats', { refused: n('refused'), choice: n('choice'), accepted: n('accepted'), walls: n('walls'), shorts: n('shorts') })
    : '';
  const rows = Object.entries(stats.byCmp ?? {}).sort((a, b) => b[1].filled - a[1].filled);
  // Clears what is stored at the click (the background may have counted since this render), and offers that back.
  const clearStats = async () => {
    const { stats: old = {} } = await api.storage.local.get('stats');
    await api.storage.local.set({ stats: {} });
    const banners = ['refused', 'choice', 'accepted', 'walls'].reduce((t, k) => t + (old[k] ?? 0), 0);
    const since = old.since ? new Date(old.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    offerUndo('byCmp', t('settings.countersCleared', { n: banners, since }), async () => {
      const { stats: now = {} } = await api.storage.local.get('stats');
      await api.storage.local.set({ stats: restoreStats(old, now) });
      render();
    });
    render();
  };
  $('byCmp').replaceChildren(...(rows.length ? [
    el('table', {}, el('tr', {}, el('th', { textContent: t('settings.cmpBanner') }), el('th', { textContent: t('settings.cmpFilled') }), el('th', { textContent: t('settings.cmpClicks') })),
      ...rows.map(([cmp, r]) => el('tr', {}, el('td', { textContent: cmp }), el('td', { className: 'n', textContent: r.filled }), el('td', { className: 'n', textContent: r.clicks })))),
    el('p', { className: 'bullet' }, link(t('settings.clearCounters'), clearStats)),
  ] : []), ...undoLine('byCmp'));

  // reported sites; fixedAt: a later rule list added a rule or wall entry for the site (markFixed in lib.js)
  const lines = reports.map((r) => `${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}  ${r.url}  [${r.consent}${r.cmp ? ' ' + r.cmp : ''}]${r.reason ? ` ${reasonLabel(r.reason)}` : ''}` +
    (r.fixedAt ? t('settings.fixedIn', { date: new Date(r.fixedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }) : ''));
  const actions = el('p', { className: 'bullet' });
  actions.append(link(t('settings.copyList'), async () => { await navigator.clipboard.writeText(lines.join('\n')); actions.firstChild.textContent = t('settings.copied'); }), ' / ',
    link(t('settings.clear'), async () => {
      const { reports: old = [] } = await api.storage.local.get('reports');
      await api.storage.local.set({ reports: [] });
      offerUndo('reports', t('settings.reportsCleared', { n: old.length }), async () => {
        const { reports: now = [] } = await api.storage.local.get('reports');
        await api.storage.local.set({ reports: restoreReports(old, now) });
        render();
      });
      render();
    }));
  // A send that could not go out waits on the report (background.js sendReport); cancel drops it before it is retried.
  const cancelSend = async (host) => {
    const { reports: current = [] } = await api.storage.local.get('reports');
    await api.storage.local.set({ reports: current.map(({ sendPending, ...r }) => (r.host === host ? r : { ...r, ...(sendPending && { sendPending }) })) });
    render();
  };
  const sendState = (r) => r.sendPending ? ['  ', el('span', { className: 'muted', textContent: t('settings.waiting') }), link(t('settings.cancel'), () => cancelSend(r.host)), el('span', { className: 'muted', textContent: ')' })]
    : r.sentAt ? ['  ', el('span', { className: 'muted', textContent: t('settings.sent') })] : [];
  $('reports').replaceChildren(...(reports.length
    ? [...lines.map((t, i) => el('p', { className: 'bullet', style: `--dot:var(${reports[i].fixedAt ? '--ok' : '--bad'})` }, t, ...sendState(reports[i]))), actions]
    : [el('p', { className: 'muted', textContent: t('settings.noReports') })]), ...undoLine('reports'));
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
