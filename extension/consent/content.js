// Every frame. autoconsent asks the background for config + rules (initResp), then refuses the banner.
import AutoConsent from '@duckduckgo/autoconsent';

const api = globalThis.browser ?? globalThis.chrome;

const consent = new AutoConsent((msg) => api.runtime.sendMessage(msg).catch(() => {}));
api.runtime.onMessage.addListener((msg) => {
  consent.receiveMessageCallback(msg);
});
