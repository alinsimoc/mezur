# Mezur

Measuring tools for any page, as a Chrome extension.

- **Window size**: resize the browser and the size shows bottom-right without DevTools open.
- **Settings**: click the toolbar icon for a panel with the measure-mode switch for the tab, and settings: show toolbar, turn on when a page loads.
- **Measure mode**: switch it on in the panel. While it's on:
  - **⌥ Option** (hold): hover an element, hold Option, then move to another element to see the distances between the two. Before you move, it shows the spacing between every item of the list or grid the element is in
  - **⌘ Cmd** (hold), Inspect: box model of the hovered element (size, position, margin, border, padding) plus colors, border radius and font
  - **R**: rulers and guides on/off (on by default, remembered across tabs). Rulers sit top and left, like Figma. Drag from a ruler to pull out a guide, drag a guide to move it, drop it back on the ruler to delete it. Guides are saved per site (host and port, so each local dev server keeps its own) and stay visible, click-through, outside measure mode.

Distances and the box model show only while their key is held. Measuring and inspecting also work inside iframes. All values are CSS pixels relative to the viewport.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and pick this folder.

After editing, hit the reload icon on the extension card. To open the panel from the keyboard, set a shortcut for "Activate the extension" at `chrome://extensions/shortcuts`.

## License

MIT
