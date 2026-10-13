// Settings popup: measure mode for this tab, plus the settings content.js reads from storage
// (it picks up changes live, in every tab).
const $ = id => document.getElementById(id);
const defaults = { bar: true, auto: false }; // rulers & guides are toggled with R on the page

chrome.storage.local.get(Object.keys(defaults)).then(s => {
  for (const [key, def] of Object.entries(defaults)) {
    $(key).checked = s[key] ?? def;
    $(key).onchange = e => chrome.storage.local.set({ [key]: e.target.checked });
  }
});

// Measure mode lives in the tab's page, so ask it (top frame) and toggle through the background.
chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  const box = $('measure');
  // On/off shown loud and clear: big state word, tinted block and the matching (colour/white) cube.
  const paint = on => {
    box.checked = on;
    $('status').classList.toggle('on', on);
    $('stateTitle').textContent = on ? 'On' : 'Off';
    $('stateHint').textContent = on ? 'Measuring this page' : 'Turn on to measure this page';
    $('logo').src = on ? 'icons/48.png' : 'icons/off-48.png';
  };
  const refresh = () => chrome.tabs.sendMessage(tab.id, 'state', { frameId: 0 }).then(r => paint(!!r?.on), () => paint(false));
  await refresh();
  box.onchange = async () => {
    const want = box.checked;
    await chrome.runtime.sendMessage({ toggle: tab.id });
    await refresh();
    // Didn't change: Chrome doesn't let extensions run on this page (chrome://, Web Store…).
    if (box.checked !== want) {
      $('measureRow').className = 'off';
      box.disabled = true;
      $('stateTitle').textContent = 'Unavailable';
      $('stateHint').textContent = "Extensions can't run on this page";
    }
  };
});
