// Values are supplied at Android build time from local.properties, never committed here.
window.LIFE_TERMINAL_CHAT_CONFIG = (() => {
  try {
    return JSON.parse(window.AndroidChatConfig.get());
  } catch {
    return {};
  }
})();
