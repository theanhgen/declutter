// The welcome page (opened once after install, Chrome and Firefox): checks site access, says what this build does
// with pay walls, and ticks the "try it" lines live as declutter does its first work (stats from background.js bump).
import { applyI18n, t } from '../i18n.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const ALL = { origins: ['<all_urls>'] };
applyI18n();

// Chrome can install with site access restricted, Firefox asks per site: without it nothing happens anywhere.
async function access() {
  const ok = await api.permissions.contains(ALL).catch(() => true);
  $('access').hidden = ok;
  $('ready').textContent = t(ok ? 'welcome.ready' : 'welcome.once');
}
$('grant').onclick = async () => { await api.permissions.request(ALL).catch(() => false); access(); };
api.permissions.onAdded?.addListener(access);
api.permissions.onRemoved?.addListener(access);
access();

// The build's default (store builds: manual; local builds: auto).
if (__WALLS_DEFAULT__ === 'auto') {
  $('walls').textContent = t('welcome.wallsAuto');
}

function ticks(stats = {}) {
  const hidden = stats.shortsHidden ?? 0, opened = stats.shorts ?? 0;
  $('shortsTick').textContent = hidden ? t('welcome.shortsHidden', { n: hidden }) : opened ? t('welcome.shortsOpened', { n: opened }) : '';
  const banners = (stats.refused ?? 0) + (stats.choice ?? 0) + (stats.accepted ?? 0);
  const clicks = stats.clicks ?? 0;
  $('bannerTick').textContent = banners
    ? (banners === 1 ? t('welcome.banners1') : t('welcome.bannersN', { n: banners })) + (clicks ? t('welcome.clicks', { n: clicks }) : '')
    : '';
}
api.storage.local.get('stats').then(({ stats }) => ticks(stats));
api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.stats) ticks(changes.stats.newValue); });
