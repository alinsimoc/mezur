# Mezur

Measuring tools for any page, as a Chrome extension.

- **Window size**: resize the browser and the size shows top-right, like DevTools, without DevTools open.
- **Rulers**: top and left, like Figma. Toggle with **Alt+Shift+R** (applies to every tab). Drag from a ruler to pull out a guide, drag a guide to move it, drop it back on the ruler to delete it.
- **Measure mode**: click the toolbar icon or press **Alt+Shift+M**. Then:
  - **⌥ Option** (hold): hover an element, hold Option, then move to another element to see the distances between the two
  - **B** (hold): box model of the hovered element (size, position, margin, border, padding) plus colors, border radius and font
  - **R**: rulers on/off
  - **Esc**: exit

Distances and the box model show only while their key is held. All values are CSS pixels relative to the viewport.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and pick this folder.

After editing, hit the reload icon on the extension card. Shortcuts can be changed at `chrome://extensions/shortcuts`.

## License

MIT
