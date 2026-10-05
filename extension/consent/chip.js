// The chip: a small pill that says what declutter did with the banner, then goes away. Top frame only.
// No stylesheet and no innerHTML: a page's CSP or Trusted Types can block both, so everything is set through the
// DOM, element.style and element.animate(). A closed shadow root keeps the page's CSS out.
const SVG = 'http://www.w3.org/2000/svg';
// The glyph from popup/d.svg.
const GLYPH = 'M11.3 1.5L14 1.5L14 14L7.65 14C3.7 14 1.5 11.95 1.5 8.95C1.5 5.95 3.6 4 6.7 4C8.1 4 9.25 4.45 10.1 5.2L10.1 2.7C10.1 1.9 10.5 1.5 11.3 1.5ZM7.8 7C9.3 7 10.15 7.8 10.15 9.1L10.15 11.05L7.8 11.05C6.2 11.05 5.4 10.25 5.4 9.05C5.4 7.85 6.25 7 7.8 7Z';
const MARK = { ok: ['✓', '#4cc38a'], bad: ['✕', '#ff6369'], wait: ['', ''] };
const IN_MS = 450, HOLD_MS = 1500, OUT_MS = 300;
let timer, shown;

const el = (tag, style, text = '') => {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  e.textContent = text;
  return e;
};

function logo() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  Object.assign(svg.style, { width: '14px', height: '14px', flex: 'none' });
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('fill', '#e5899a');
  path.setAttribute('d', GLYPH);
  svg.append(path);
  return svg;
}

export function showChip({ text, tone, host: site }) {
  if (window !== window.top || site !== location.hostname) return;
  // At document_start there is no body and nothing to measure: wait for the page.
  if (!document.body) { document.addEventListener('DOMContentLoaded', () => showChip({ text, tone, host: site }), { once: true }); return; }
  shown?.remove();
  clearTimeout(timer);
  const narrow = window.innerWidth <= 600;
  const host = el('div', {
    all: 'initial', position: 'fixed', zIndex: '2147483647', bottom: 'max(16px, env(safe-area-inset-bottom))', pointerEvents: 'none',
    ...(narrow ? { left: '0', right: '0', display: 'flex', justifyContent: 'center' } : { right: '16px' }),
  });
  const pill = el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '7px', boxSizing: 'border-box', height: '32px',
    padding: '0 12px', borderRadius: '16px', overflow: 'hidden', whiteSpace: 'nowrap', background: '#1c1c1e', color: '#f2f2f2',
    font: '12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', boxShadow: '0 2px 10px rgba(0,0,0,.28)',
  });
  // Nothing on the host names declutter or the outcome: the page can't read either from the closed root.
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-label', `declutter: ${text}`);
  const [mark, color] = MARK[tone] ?? MARK.wait;
  pill.append(logo(), el('span', {}, text), ...(mark ? [el('span', { color, fontWeight: '700' }, mark)] : []));
  host.attachShadow({ mode: 'closed' }).append(pill);
  document.body.append(host);
  shown = host;

  const width = pill.getBoundingClientRect().width;
  // No width (not laid out yet, a hidden tab): fade only, or the pill would pop from nothing.
  const calm = !width || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // From a banner-wide bar down to the pill: the banner "folds" into declutter.
  const wide = Math.min((window.visualViewport?.width ?? window.innerWidth) - 32, 560);
  pill.animate(calm
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ width: `${wide}px`, opacity: 0 }, { width: `${wide}px`, opacity: 1, offset: 0.25 }, { width: `${width}px`, opacity: 1 }],
  { duration: IN_MS, easing: 'cubic-bezier(.2,.8,.2,1)' });
  timer = setTimeout(() => {
    const out = pill.animate(calm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }],
      { duration: OUT_MS, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = out.oncancel = () => host.remove();
  }, IN_MS + HOLD_MS);
}
