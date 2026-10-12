// Toolbar button / Alt+Shift+M toggles measure mode in the tab; Alt+Shift+R flips the rulers
// everywhere (every tab listens to the stored flag).
chrome.action.onClicked.addListener(async tab => {
  try {
    await chrome.tabs.sendMessage(tab.id, 'measure');
  } catch {
    // Tab was open before Mezur was installed or reloaded: inject now, then retry.
    // Pages Chrome won't let extensions touch (chrome://, the Web Store) just do nothing.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, 'measure');
    } catch {}
  }
});

chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== 'toggle-rulers') return;
  const { rulers } = await chrome.storage.local.get('rulers');
  chrome.storage.local.set({ rulers: !rulers });
});
