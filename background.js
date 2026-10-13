// Measure mode on/off in a tab, from the popup's switch.
const toggle = async tabId => {
  try {
    await chrome.tabs.sendMessage(tabId, 'measure');
  } catch {
    // Tab was open before Mezur was installed or reloaded: inject now, then retry.
    // Pages Chrome won't let extensions touch (chrome://, the Web Store) just do nothing.
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, 'measure');
    } catch {}
  }
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  // The top page reports measure mode on/off: that tab's toolbar icon goes colour (on) or white (off).
  if (typeof msg?.icon === 'boolean' && sender.tab && sender.frameId === 0) {
    const v = msg.icon ? '' : 'off-';
    return void chrome.action.setIcon({ tabId: sender.tab.id, path: { 16: `icons/${v}16.png`, 32: `icons/${v}32.png` } }).catch(() => {});
  }
  // From the popup (it has no tab of its own): toggle the given tab, answer once done.
  if (msg?.toggle && !sender.tab) {
    toggle(msg.toggle).then(() => respond());
    return true; // keeps the channel open for the async answer
  }
  // Frame-to-frame messages from content.js: forwarded to Mezur in every frame of the same tab. Going
  // through the extension keeps them away from page scripts (window.postMessage would expose them).
  if (!sender.tab || !Array.isArray(msg?.mezur)) return;
  chrome.tabs.sendMessage(sender.tab.id, msg).catch(() => {});
});
