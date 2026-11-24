// The welcome page (opened once after install, Chrome and Firefox): checks site access, says what this build does
// with pay walls, and ticks the "try it" lines live as declutter does its first work (stats from background.js bump).
const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const ALL = { origins: ['<all_urls>'] };

// Chrome can install with site access restricted, Firefox asks per site: without it nothing happens anywhere.
async function access() {
  const ok = await api.permissions.contains(ALL).catch(() => true);
  $('access').hidden = ok;
  $('ready').textContent = ok ? 'Nothing to set up. From now on:' : 'Once it is allowed:';
}
$('grant').onclick = async () => { await api.permissions.request(ALL).catch(() => false); access(); };
api.permissions.onAdded?.addListener(access);
api.permissions.onRemoved?.addListener(access);
access();

// The build's default (store builds: manual; local builds: auto).
if (__WALLS_DEFAULT__ === 'auto') {
  $('walls').textContent = 'pay walls ("agree to tracking or pay") are accepted for you (this build\'s default). To decide yourself, set settings → pay walls → manual.';
}

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
function ticks(stats = {}) {
  const hidden = stats.shortsHidden ?? 0, opened = stats.shorts ?? 0;
  $('shortsTick').textContent = hidden ? `✓ ${plural(hidden, 'short')} hidden` : opened ? `✓ ${plural(opened, 'short')} opened in the normal player` : '';
  const banners = (stats.refused ?? 0) + (stats.choice ?? 0) + (stats.accepted ?? 0);
  const clicks = stats.clicks ?? 0;
  $('bannerTick').textContent = banners
    ? `✓ ${banners === 1 ? 'first banner answered' : `${banners} banners answered`}${clicks ? `, ${plural(clicks, 'click')} saved` : ''}`
    : '';
}
api.storage.local.get('stats').then(({ stats }) => ticks(stats));
api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.stats) ticks(changes.stats.newValue); });
