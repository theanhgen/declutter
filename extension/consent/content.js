// Every frame. autoconsent asks the background for config + rules (initResp), then refuses the banner.
import AutoConsent, { evalSnippets } from '@duckduckgo/autoconsent';
import { declutterSnippets } from './snippets.js';

const api = globalThis.browser ?? globalThis.chrome;

Object.assign(evalSnippets, declutterSnippets);

const consent = new AutoConsent((msg) => api.runtime.sendMessage(msg).catch(() => {}));
api.runtime.onMessage.addListener((msg) => {
  consent.receiveMessageCallback(msg);
});
