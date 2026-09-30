// Every frame. autoconsent asks the background for config + rules (initResp), then refuses the banner.
import AutoConsent, { evalSnippets } from '@duckduckgo/autoconsent';
import { declutterSnippets } from './snippets.js';

const api = globalThis.browser ?? globalThis.chrome;

Object.assign(evalSnippets, declutterSnippets);

// init is the one message whose loss leaves the frame unhandled for good: nothing asks again. It fails while the
// background is not listening yet (just after an update, or Safari's event page starting), so try it twice more.
const send = (msg, retries = msg.type === 'init' ? 2 : 0) => api.runtime.sendMessage(msg).catch(() => {
  if (retries) return new Promise((r) => setTimeout(r, 500)).then(() => send(msg, retries - 1));
});
const consent = new AutoConsent((msg) => send(msg));
api.runtime.onMessage.addListener((msg) => {
  consent.receiveMessageCallback(msg);
});
