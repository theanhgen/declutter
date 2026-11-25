import { choiceMode, reportUrl, siteModePatch, siteMode, wallMode, wallModePatch, outcomeDetail, reasonText, reasonsFor, shortsSummary, statusWords, statusKey } from '../lib.js';
import { declutterSnippets } from '../consent/snippets.js';
import { applyI18n, t } from '../i18n.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
applyI18n();

// iPhone/iPad: full-width sheet with larger touch targets.
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent) && matchMedia('(pointer: coarse)').matches)) {
  document.documentElement.classList.add('ios');
}

// One status line and a quieter sub-line. kind 'done': the line names what was handled ("cookie banner") and is struck
// through on a filled row; what was done with it goes in the sub-line ("refused · onetrust").
function statusRow(kind, text, sub) {
  const row = document.createElement('div');
  row.className = kind ? `status ${kind}` : 'status';
  row.append(Object.assign(document.createElement(kind === 'done' ? 's' : 'span'), { className: 'line', textContent: text }));
  if (sub) row.append(Object.assign(document.createElement('span'), { className: 'sub', textContent: sub }));
  return row;
}
// The shared status words (lib.js STATUS), the same as the chip's and the badge tooltip's, in the UI language.
const STATUS = statusWords();
const label = (state) => STATUS[statusKey(state)]?.label ?? '';
const handled = (thing, ...sub) => statusRow('done', thing, sub.filter(Boolean).join(' · '));

async function main() {
  $('settings').onclick = () => { api.runtime.openOptionsPage(); window.close(); };
  // A report that could not be sent earlier goes out now if it can (the background keeps it, see sendReport).
  api.runtime.sendMessage({ type: 'retrySends' }).catch(() => { /* worker busy starting; the alarm retries too */ });

  const { settings = {}, reports = [] } = await api.storage.local.get(['settings', 'reports']);
  const s = { shorts: true, posts: true, playables: true, consent: true, walls: __WALLS_DEFAULT__, ...settings };
  for (const k of ['exceptions', 'acceptSites', 'wallAskSites']) if (!Array.isArray(s[k])) s[k] = [];
  // Only the changed keys over what is stored now (never the defaults above, and Settings may be open too). A function
  // patch is computed from what is stored at the time of writing, not from this popup's copy.
  const save = async (patch) => {
    const { settings: current = {} } = await api.storage.local.get('settings');
    const p = typeof patch === 'function' ? patch(current) : patch;
    await api.storage.local.set({ settings: { ...current, ...p } });
    Object.assign(s, p);
  };
  for (const k of ['shorts', 'posts', 'playables', 'consent']) {
    $(k).checked = Boolean(s[k]);
    $(k).onchange = () => save({ [k]: $(k).checked });
  }

  // ?tab=<id> renders the popup for a given tab (tests open it as a page).
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  const [tab] = forced ? [await api.tabs.get(forced)] : await api.tabs.query({ active: true, currentWindow: true });
  if (!/^https?:/.test(tab?.url ?? '')) {
    $('status').replaceChildren(statusRow('', t('popup.browserPage')));
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
    rows.push(statusRow('bad', t('popup.notAllowed'), t(`popup.allow.${__TARGET__}`)));
  } else if (!s.consent) rows.push(statusRow('', t('popup.consentOff'), t('popup.consentOffSub')));
  else if (!running) {
    rows.push(statusRow('bad', t('popup.notRunning'), t('popup.notRunningSub')));
    $('reload').hidden = false;
    $('reload').onclick = () => { api.tabs.reload(tab.id); window.close(); };
  } else if (state.consent === 'done' || state.consent === 'choice') rows.push(handled(t('popup.cookieBanner'), label(state), outcomeDetail(state)));
  else if (failed) rows.push(statusRow('bad', STATUS.failed.label, t('popup.failedSub')));
  else if (state.consent === 'wall') {
    rows.push(statusRow('wall', STATUS.wall.label, state.looping
      ? t('popup.wallLooping')
      : t('popup.wallNoRefuse')));
    $('acceptWall').hidden = false;
    $('acceptWall').querySelector('.label').replaceChildren(t('popup.agreeOn', { host: host.replace(/^www\./, '') }),
      Object.assign(document.createElement('span'), { className: 'sub', textContent: t('popup.agreeUndo') }));
    $('acceptWall').onclick = async () => {
      await api.runtime.sendMessage({ type: 'acceptWall', tabId: tab.id });
      window.close();
    };
  } else if (state.consent === 'accepting') rows.push(statusRow('wall', STATUS.accepting.label, state.cmp));
  else if (state.consent === 'accepted') rows.push(handled(t('popup.payWall'), label(state), outcomeDetail(state)));
  else if (state.consent === 'paused') rows.push(statusRow('', STATUS.paused.label));
  else if (state.consent === 'acceptedSite') rows.push(handled(t('popup.cookieBanner'), label(state), outcomeDetail(state)));
  else if (state.consent === 'working') rows.push(statusRow('', STATUS.working.label, state.cmp));
  else if (state.banner === 'suspected') {
    // Cookie-banner wording no rule matched (bannerSuspected in lib.js). The report row goes right under it.
    rows.push(statusRow('wall', t('popup.suspected'), t('popup.suspectedSub')), $('report'));
  } else rows.push(statusRow('', t('popup.noBanner')));
  if (s.shorts && /^(www|m)\.youtube\.com$/.test(host)) {
    rows.push(statusRow(state.shortsHidden || state.shortsRedirects ? 'ok' : '', shortsSummary(state)));
  }
  if (state.shortsLeak > 0) {
    rows.push(statusRow('', t('popup.leak', { n: state.shortsLeak }), t('popup.leakSub', { path: state.leakPath })));
  }
  // A site the user reported that a later rule list now covers (markFixed in lib.js).
  const reported = reports.find((r) => r.host === host);
  if (reported?.fixedAt) rows.push(statusRow('', t('popup.fixedSince', { date: new Date(reported.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })));
  $('status').replaceChildren(...rows);
  // On a failure reporting is the next step (#11): the report button goes right under the status, with its note on
  // what it sends and the reasons that follow a send (outside the live region, which only speaks the status).
  if (failed) $('status').after($('report'), $('sendNote'), $('reasonSection'));
  $('pageSection').hidden = false;

  // Per-site choice: the global answer (refuse / your mix / accept, from Settings → your choice) / accept / leave alone.
  $('siteMode').querySelector('[data-mode=refuse]').textContent = t({ refuse: 'site.refuse', mix: 'site.mix', accept: 'site.acceptAll' }[choiceMode(s.categories)]);
  // Matched the way the background matches (lib.js): a choice made for a parent domain shows here. Changing it here
  // sets this host only; the parent's other subdomains keep theirs. A pay wall can't be refused (D5), so a wall site
  // gets its own control: agree for me / ask me / leave alone, defaulting to the global walls mode (wallMode).
  const wall = await api.runtime.sendMessage({ type: 'wallSite', tabId: tab.id, url: tab.url }).catch(() => false);
  const mode = wall ? wallMode(host, s) : siteMode(host, s);
  for (const b of $(wall ? 'wallMode' : 'siteMode').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    b.onclick = async () => {
      const m = b.dataset.mode;
      await save((current) => (wall ? wallModePatch(host, m, current) : siteModePatch(host, m, current)));
      if (!wall && m === 'accept' && mode !== 'accept') await api.runtime.sendMessage({ type: 'reopen', tabId: tab.id });
      api.tabs.reload(tab.id);
      window.close();
    };
  }
  $(wall ? 'wallSection' : 'siteSection').hidden = false;
  // After a switch to accept the reload asks again a CMP DECLUTTER_REOPEN knows (not on a wall site, where only the
  // wall rules run). Any other change, and any other CMP, keeps the answer the site already has: say so before the press.
  if (wall) { /* the wall control has no refuse to undo */ } else if (mode === 'accept' || /^(cz-)?wall-/.test(state.cmp ?? '')) $('siteNote').hidden = false;
  else {
    api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'MAIN', func: declutterSnippets.DECLUTTER_CAN_REOPEN })
      .then(([r] = []) => { $('siteNote').hidden = !!r?.result; }, () => { $('siteNote').hidden = false; });
  }

  $('report').hidden = false;
  // One press saves the site on this device (settings → reported sites, with the page's full address) and sends it.
  // The note says exactly what goes out before the press.
  const sendUrl = reportUrl(tab.url);
  $('sendNote').textContent = t('popup.sendNote', { url: sendUrl });
  $('sendNote').hidden = false;
  $('report').onclick = async () => {
    // Firefox: sending a page address is optional data collection, granted in its own prompt (from this click, so
    // first). Refused: the site is still saved here, just not sent.
    const mayCollect = __TARGET__ !== 'firefox'
      || await api.permissions.request({ data_collection: ['browsingActivity'] }).catch(() => false);
    $('report').disabled = true;
    await api.runtime.sendMessage({ type: 'report', tabId: tab.id });
    // The background sends this exact address, and nothing if the tab has moved to another site since.
    // true: sent. 'pending': kept on the report, and the background tries again (alarm, next popup open). false: nothing sent.
    const sent = mayCollect && await api.runtime.sendMessage({ type: 'sendReport', tabId: tab.id, url: sendUrl });
    const outcome = t(sent === 'pending' ? 'popup.sendPending' : sent ? 'popup.sent' : mayCollect ? 'popup.sendFailed' : 'popup.notSent');
    $('report').querySelector('.label').textContent = outcome;
    // The button label changes under the focus; say it too, for screen readers.
    $('announce').textContent = outcome;
    if (mayCollect && !sent) $('report').disabled = false;
    // Optional, after the send: what went wrong, from fixed words that fit this page (lib.js REASONS, reasonText).
    if (sent) {
      const choose = async (r) => {
        const noted = await api.runtime.sendMessage({ type: 'sendReason', tabId: tab.id, url: sendUrl, reason: r });
        const text = noted ? t('popup.noted', { reason: reasonText(r) }) : t('popup.notNoted');
        $('reasons').replaceChildren(Object.assign(document.createElement('p'), { className: 'note', textContent: text }));
        $('announce').textContent = text;
      };
      $('reasons').replaceChildren(...reasonsFor(state).map((r) => {
        const b = Object.assign(document.createElement('button'), { className: 'row', type: 'button', onclick: () => choose(r) });
        b.append(Object.assign(document.createElement('span'), { className: 'label', textContent: reasonText(r) }));
        return b;
      }));
      $('reasonSection').hidden = false;
    }
  };
}
main();
