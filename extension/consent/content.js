// Every frame. autoconsent asks the background for config + rules (initResp), then refuses the banner.
import AutoConsent, { evalSnippets } from '@duckduckgo/autoconsent';
import { showChip } from './chip.js';
import { declutterSnippets } from './snippets.js';

const api = globalThis.browser ?? globalThis.chrome;

Object.assign(evalSnippets, declutterSnippets);

// init is the one message whose loss leaves the frame unhandled for good: nothing asks again. It fails while the
// background is not listening yet (just after an update, or Safari's event page starting), so try it twice more.
// After an update, a tab opened before it keeps this script but loses the extension (runtime.id goes away), and
// sendMessage then throws before it returns a promise: stay quiet instead.
const send = (msg, retries = msg.type === 'init' ? 2 : 0) => {
  if (!api.runtime?.id) return Promise.resolve();
  try {
    return api.runtime.sendMessage(msg).catch(() => {
      if (retries) return new Promise((r) => setTimeout(r, 500)).then(() => send(msg, retries - 1));
    });
  } catch {
    return Promise.resolve();
  }
};
const consent = new AutoConsent((msg) => send(msg));
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // The popup asks whether this page has a live content script (tabs opened before an install or update do not).
  if (msg.type === 'ping') { sendResponse(true); return; }
  if (msg.type === 'chip') return showChip(msg);
  consent.receiveMessageCallback(msg);
});
