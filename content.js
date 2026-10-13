// Mezur: window size while resizing; rulers and guides; and a measure mode where holding ⌥ measures
// distances between elements and holding ⌘ inspects one (box model and styles). Runs in every frame:
// the top page owns measure mode, rulers, guides and the shortcut bar; each frame measures its own
// elements, since only it gets the mouse over them. Everything draws in a closed shadow root with
// pointer-events:none, except rulers and guides while measure mode is on.
(() => {
  // Reloading the extension leaves the old copy running in open tabs: its page listeners still fire,
  // but its chrome.* calls throw "Extension context invalidated". Tell it to shut down (it drops every
  // listener and its overlay), then start fresh.
  document.dispatchEvent(new Event('mezur:reload'));
  const ac = new AbortController(), signal = ac.signal;
  const isTop = window === window.top;
  let depth = 0; // how many frames deep this one is (0 = top page)
  for (let w = window; w !== w.parent; w = w.parent) depth++;
  const shutdown = () => (ac.abort(), host.remove());
  document.addEventListener('mezur:reload', shutdown, { signal });
  // Every chrome.* call goes through here: a copy whose extension was reloaded or removed shuts itself
  // down instead of throwing. Returns a promise either way, so callers can .then() it.
  const ext = fn => {
    try {
      if (chrome.runtime?.id) return Promise.resolve(fn()).catch(() => {});
    } catch {}
    shutdown();
    return Promise.resolve();
  };
  // chrome.* listeners can't take an AbortSignal; this makes them no-ops once this copy shut down.
  const live = fn => (...a) => void (signal.aborted || fn(...a));
  // Frames talk only through the extension: background.js forwards each message to Mezur in every frame
  // of the tab. Pages and other sites' frames can't see or fake it (window.postMessage they could).
  // `src` lets a frame skip its own message when it comes back.
  const self = Math.random().toString(36).slice(2);
  const send = m => ext(() => chrome.runtime.sendMessage({ mezur: m, src: self }));

  const h = (tag, css, text) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };
  const Z = 'position:fixed;z-index:2147483647;pointer-events:none;';
  const FONT = 'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;';
  const ACCENT = '#ff2d78';
  const R = 16; // ruler thickness
  // DevTools box-model colours, same as Unhooded's Elements highlight.
  const BOX = { margin: '#f6b26b', border: '#ffe599', padding: '#93c47d', content: '#6fa8dc' };
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

  const host = h('div', 'all:initial');
  host.dataset.mezur = '';
  const root = host.attachShadow({ mode: 'closed' });
  document.documentElement.append(host);
  const add = (...els) => (root.append(...els), els[0]);
  const show = (el, visible) => (el.style.display = visible ? 'block' : 'none');
  const vw = () => document.documentElement.clientWidth; // excludes the scrollbar
  const vh = () => document.documentElement.clientHeight;
  const hasArea = r => r.width && r.height;
  const px = v => +parseFloat(v).toFixed(1);
  let mx = -1, my = -1;
  let on = false, picked = null, group = null; // picked: element under the cursor when ⌥ went down; group: its list/grid
  const held = { pick: false, box: false }; // ⌥ / ⌘ held right now, in any frame

  // --- window size, bottom-right while resizing ---
  const size = add(h('div', `${Z}${FONT}display:none;right:0;bottom:0;padding:3px 8px;font-size:13px;background:#fffe;color:#333;border:1px solid #bbb`));
  let sizeT;
  if (isTop) addEventListener('resize', () => {
    size.textContent = `${innerWidth}px × ${innerHeight}px`;
    show(size, true);
    clearTimeout(sizeT);
    sizeT = setTimeout(() => show(size, false), 1000);
    rulersDirty = true;
    if (on) update();
  }, { signal });

  // --- rulers (measure mode only) and guides (always visible, movable in measure mode) ---
  let rulers = false, rulersDirty = true, bar = true; // bar: shortcut bar shown (popup setting)
  const rulersShown = () => rulers && on && isTop;
  const guides = add(h('div', 'display:none')); // before the rulers, so rulers paint over guide ends
  const rTop = add(h('canvas', `${Z}display:none;left:0;top:0;pointer-events:auto;cursor:row-resize`));
  const rLeft = add(h('canvas', `${Z}display:none;left:0;top:0;pointer-events:auto;cursor:col-resize`));
  const gLabel = add(h('div', `${Z}${FONT}display:none;padding:1px 5px;border-radius:3px;background:#00a2ff;color:#fff`));
  const markX = add(h('div', `${Z}display:none;top:0;width:1px;height:${R}px;background:${ACCENT}`));
  const markY = add(h('div', `${Z}display:none;left:0;height:1px;width:${R}px;background:${ACCENT}`));
  const drawRuler = (c, len, horiz) => {
    const d = devicePixelRatio, w = horiz ? len : R, ht = horiz ? R : len;
    Object.assign(c, { width: w * d, height: ht * d });
    Object.assign(c.style, { width: w + 'px', height: ht + 'px' });
    const x = c.getContext('2d');
    x.scale(d, d);
    x.fillStyle = '#f5f5f5ee';
    x.fillRect(0, 0, w, ht);
    x.fillStyle = x.strokeStyle = '#666';
    x.font = '9px ui-monospace,Menlo,monospace';
    x.textBaseline = 'top';
    x.lineWidth = 1;
    x.beginPath();
    for (let i = 0; i <= len; i += 10) {
      const t = i % 100 === 0 ? R : i % 50 === 0 ? R / 2 : R / 4;
      if (horiz) x.moveTo(i + 0.5, R), x.lineTo(i + 0.5, R - t);
      else x.moveTo(R, i + 0.5), x.lineTo(R - t, i + 0.5);
      if (i % 100 || !i) continue;
      if (horiz) x.fillText(i, i + 2, 2);
      else x.save(), x.translate(2, i - 2), x.rotate(-Math.PI / 2), x.fillText(i, 0, 0), x.restore();
    }
    if (horiz) x.moveTo(0, R - 0.5), x.lineTo(len, R - 0.5);
    else x.moveTo(R - 0.5, 0), x.lineTo(R - 0.5, len);
    x.stroke();
  };
  // Guides: drag out of a ruler, drag to move, drop back on a ruler to delete. Fixed to the viewport, like the rulers.
  // Saved per website (host incl. port, so every page and tab on that site shares them; subdomains and
  // local dev servers on different ports are separate).
  // ponytail: in measure mode, each guide's 5px grab band takes clicks from the page underneath.
  const siteKey = 'guides:' + location.host;
  const saveGuides = () => ext(() => chrome.storage.local.set({ [siteKey]: [...guides.children].map(g => [g.horiz ? 1 : 0, g.pos]) }));
  const loadGuides = list => {
    guides.replaceChildren();
    for (const [horiz, pos] of list || []) setPos(guide(!!horiz), pos);
  };
  const setPos = (g, v) => ((g.pos = Math.round(v)), (g.style[g.horiz ? 'top' : 'left'] = g.pos - 2 + 'px'));
  const drag = (g, e) => {
    e.preventDefault();
    e.stopPropagation();
    g.setPointerCapture(e.pointerId);
    const at = e => (g.horiz ? e.clientY : e.clientX);
    const move = e => {
      setPos(g, at(e));
      gLabel.textContent = g.pos;
      clampTip(gLabel, e.clientX + 10, e.clientY + 10);
    };
    const up = e => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      show(gLabel, false);
      if (at(e) < R) g.remove();
      saveGuides();
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    move(e);
  };
  // Guides inherit pointer-events from the container, which drawRulers switches with measure mode.
  const guide = horiz => {
    const g = h('div', `${Z}pointer-events:inherit;${horiz ? 'left:0;width:100%;height:5px;cursor:row-resize' : 'top:0;height:100%;width:5px;cursor:col-resize'}`);
    g.append(h('div', `position:absolute;background:#00a2ff;${horiz ? 'left:0;right:0;top:2px;height:1px' : 'top:0;bottom:0;left:2px;width:1px'}`));
    g.horiz = horiz;
    g.addEventListener('pointerdown', e => drag(g, e));
    return guides.appendChild(g);
  };
  rTop.addEventListener('pointerdown', e => drag(guide(true), e));
  rLeft.addEventListener('pointerdown', e => drag(guide(false), e));

  // Visibility only; the canvases are (re)drawn in render, at most once per frame.
  const drawRulers = () => {
    for (const el of [rTop, rLeft]) show(el, rulersShown());
    show(guides, rulers && isTop);
    guides.style.pointerEvents = on ? 'auto' : 'none';
    rulersDirty = true;
    update();
  };
  const setRulers = v => ((rulers = !!v), paintHint(), drawRulers());
  // R turns rulers and guides off or on, remembered across tabs; on by default. Rulers live in the top
  // page, so an iframe with keyboard focus passes R up to it.
  const toggleRulers = () => (isTop ? ext(() => chrome.storage.local.set({ rulers: !rulers })) : send(['rulers']));
  // The shortcut bar can be hidden from the popup (so it doesn't sit over the page's own UI).
  const showBar = () => (hint.style.display = on && isTop && bar ? 'flex' : 'none');
  if (isTop) {
    ext(() => chrome.storage.local.get(['rulers', 'bar', 'auto', siteKey])).then(s => {
      (bar = s?.bar ?? true), showBar(), setRulers(s?.rulers ?? true), loadGuides(s?.[siteKey]);
      if (s?.auto) setOn(true), send(['on', true]); // popup setting: measure mode on as soon as a page loads
    });
    // Changes from other tabs (the R toggle, guides on the same site) show up here too.
    ext(() => chrome.storage.onChanged.addListener(live(c => {
      if (c.rulers) setRulers(c.rulers.newValue);
      if (c.bar) (bar = c.bar.newValue ?? true), showBar();
      if (c[siteKey]) loadGuides(c[siteKey].newValue);
    })));
  }

  // --- measure mode ---
  // Shortcut bar: a floating pill, each shortcut a key cap plus a label. Caps light up while held;
  // Rulers dims when rulers are off.
  const hint = add(h('div', `${Z}display:none;bottom:16px;left:50%;transform:translateX(-50%);align-items:center;gap:16px;padding:6px 14px 6px 6px;border-radius:999px;background:rgba(24,24,27,.82);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(255,255,255,.08);box-shadow:0 8px 24px rgba(0,0,0,.24),0 1px 2px rgba(0,0,0,.2);color:#e4e4e7;font:500 12px/1 system-ui,-apple-system,sans-serif;white-space:nowrap`));
  const hintItem = (key, label) => {
    const cap = h('span', 'display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:22px;border-radius:999px;background:rgba(255,255,255,.1);box-shadow:inset 0 -1px 0 rgba(255,255,255,.08);font-size:12px;transition:background .12s,color .12s', key);
    const item = h('span', 'display:inline-flex;align-items:center;gap:7px;transition:opacity .12s');
    item.append(cap, h('span', '', label));
    hint.append(item);
    return cap;
  };
  const capPick = hintItem('⌥', 'Measure'), capBox = hintItem('⌘', 'Inspect'), capRulers = hintItem('R', 'Rulers');
  const lit = (cap, active) => Object.assign(cap.style, { background: active ? ACCENT : 'rgba(255,255,255,.1)', color: active ? '#fff' : '' });
  const paintHint = () => (lit(capPick, held.pick), lit(capBox, held.box), (capRulers.parentNode.style.opacity = rulers ? 1 : 0.45));
  const marks = add(h('div', '')); // distance lines and outlines, rebuilt every frame
  const layerCss = 'box-sizing:border-box;border-style:solid;width:100%;height:100%';
  const hl = add(h('div', `${Z}display:none;${layerCss};border-color:${BOX.margin}80`));
  const hlBorder = h('div', `${layerCss};border-color:${BOX.border}80`);
  const hlPad = h('div', `${layerCss};border-color:${BOX.padding}80;background:${BOX.content}80;background-clip:content-box`);
  hl.append(hlBorder);
  hlBorder.append(hlPad);
  const tip = add(h('div', `${Z}${FONT}display:none;padding:6px;border-radius:4px;background:#fff;color:#222;box-shadow:0 2px 8px #0004;text-align:center`));

  // rgb()/rgba() → #rrggbb(aa); other spaces (oklch, color()) are shown as Chrome reports them.
  const hex = c => {
    const n = c.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:[,/] ?([\d.]+))?\)$/);
    if (!n) return c;
    const a = n[4] == null ? 1 : +n[4];
    return '#' + [n[1], n[2], n[3], ...(a < 1 ? [a * 255] : [])].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  };
  const painted = c => c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c);
  const visibleBorders = cs => SIDES.filter(sd => parseFloat(cs[`border${sd}Width`]) && !['none', 'hidden'].includes(cs[`border${sd}Style`]) && painted(cs[`border${sd}Color`]));
  const CLAMP2 = 'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden'; // wrap, max 2 lines then …
  const swatch = c => {
    const e = h('span', 'flex:none;width:10px;height:10px;border-radius:2px;border:1px solid #0003');
    e.style.backgroundColor = c; // CSSOM, not cssText: only a colour can land here, even from another frame's data
    return e;
  };

  // The page's declarations that apply to el, in cascade order (inline style last). Walking every rule is
  // the expensive part, so it's done once per element (again if its class or inline style changes).
  // ponytail: ignores specificity; later rules win, which is right for typical stylesheets.
  const declsCache = new WeakMap();
  const declsOf = el => {
    const key = el.getAttribute('class') + '|' + el.getAttribute('style');
    const hit = declsCache.get(el);
    if (hit?.key === key) return hit.decls;
    const decls = [];
    const walk = rules => {
      for (const r of rules) {
        try {
          if (r.selectorText && el.matches(r.selectorText)) decls.push(r.style);
        } catch {} // nested-CSS selectors with & don't parse in matches()
        if (r.cssRules && !(r.media && !matchMedia(r.media.mediaText).matches)) walk(r.cssRules);
      }
    };
    for (const sh of [...document.styleSheets, ...document.adoptedStyleSheets]) {
      try { walk(sh.cssRules); } catch {} // cross-origin sheets can't be read
    }
    decls.push(el.style);
    declsCache.set(el, { key, decls });
    return decls;
  };
  // Corner i's radius as the author wrote it (1rem, 50%, 8px…): computed style only has px/%, so pick the
  // last declaration that resolves to the computed value. If none is readable (cross-origin stylesheet,
  // calc()), the computed value is shown. Non-px units also show their px value.
  const radius = (el, cs, i) => {
    const prop = `border-${CORNERS[i]}-radius`, computed = cs.getPropertyValue(prop).split(' ')[0];
    const sub = v => v.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, n, fb) => cs.getPropertyValue(n).trim() || fb || '');
    // A border-radius shorthand using var() leaves its longhands empty in CSSOM, so expand it ourselves.
    const declared = st => {
      const v = st.getPropertyValue(prop);
      if (v) return v;
      const t = sub(st.getPropertyValue('border-radius')).split('/')[0].trim().split(/\s+/);
      return [t[0], t[1] ?? t[0], t[2] ?? t[0], t[3] ?? t[1] ?? t[0]][i] || '';
    };
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const toPx = v => {
      const m = sub(v).trim().split(/\s+/)[0].match(/^(-?[\d.]+)(px|rem|em|%)?$/);
      if (!m) return null;
      return m[2] === '%' ? m[1] + '%' : m[2] === 'rem' ? m[1] * rootPx : m[2] === 'em' ? m[1] * parseFloat(cs.fontSize) : +m[1];
    };
    const matches = v => {
      const a = toPx(v);
      return typeof a === 'string' ? a === computed : a != null && Math.abs(a - parseFloat(computed)) < 0.01;
    };
    const winner = sub(declsOf(el).map(declared).filter(v => v && matches(v)).pop() || '').trim().split(/\s+/)[0];
    return !winner ? computed : /px$|%$|^0$/.test(winner) ? winner : `${winner} (${px(computed)}px)`;
  };
  // ⌘ Inspect works on plain data (numbers and strings), built from the element by inspectData. An iframe
  // can't draw a panel bigger than itself (a chat bubble is a few dozen px), so it posts the data up and
  // the top page draws it over the iframe. Plain data, never HTML: a page in an iframe can't inject markup.
  // Each level up moves it by the position of the iframe the cursor is over (overFrame) in that frame.
  // ponytail: the top page re-reads iframe offsets only when the iframe sends, so scrolling the top page
  // while inspecting inside an iframe leaves the panel behind until the cursor moves.
  const inspectData = el => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const rows = [['color', hex(cs.color), cs.color]];
    if (painted(cs.backgroundColor)) rows.push(['background-color', hex(cs.backgroundColor), cs.backgroundColor]);
    // Border colour only (widths are in the box model): one row when all sides match, else one per visible side.
    const bs = visibleBorders(cs);
    const one = bs.length === 4 && bs.every(sd => cs[`border${sd}Color`] === cs.borderTopColor);
    for (const sd of one ? ['Top'] : bs) rows.push([one ? 'border-color' : `border-${sd.toLowerCase()}-color`, hex(cs[`border${sd}Color`]), cs[`border${sd}Color`]]);
    rows.push(null); // divider
    rows.push(['font-size', px(cs.fontSize) + 'px'], ['font-weight', cs.fontWeight], ['line-height', cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight) + 'px'], ['font-family', cs.fontFamily, null, true]);
    const rad = CORNERS.map(c => parseFloat(cs.getPropertyValue(`border-${c}-radius`)));
    return {
      tag: el.localName, id: el.id, cls: typeof el.className === 'string' ? el.className.trim() : '',
      pos: cs.position === 'static' ? '' : cs.position, // absolute, relative, fixed, sticky; static is the default
      rect: [r.left, r.top, r.width, r.height],
      m: sidesOf(cs, 'margin-*'), b: sidesOf(cs, 'border-*-width'), p: sidesOf(cs, 'padding-*'),
      radii: rad.some(Boolean) ? rad.map((v, i) => [radius(el, cs, i), v > 0]) : null, // [as written, rounded?]
      rows, // [label, value, swatch colour?, wrap?], null = divider
    };
  };
  // Data from a child frame: coerced to the expected shape and moved into this frame's coordinates.
  const str = v => String(v ?? ''), nums = a => [0, 1, 2, 3].map(i => +a?.[i] || 0);
  const clean = (d, dx, dy) => d && {
    tag: str(d.tag), id: str(d.id), cls: str(d.cls), pos: str(d.pos),
    rect: (r => [r[0] + dx, r[1] + dy, r[2], r[3]])(nums(d.rect)),
    m: nums(d.m), b: nums(d.b), p: nums(d.p),
    radii: Array.isArray(d.radii) ? [0, 1, 2, 3].map(i => [str(d.radii[i]?.[0]), !!d.radii[i]?.[1]]) : null,
    rows: Array.isArray(d.rows) ? d.rows.slice(0, 20).map(r => r && [str(r[0]), str(r[1]), r[2] == null ? null : str(r[2]), !!r[3]]) : [],
  };
  // Radius, colours and font under the diagram.
  // ponytail: shows the font-family stack, not which font actually rendered (only DevTools knows that).
  const styles = d => {
    // width:0 + min-width:100%: fill the overlay's width (set by the box model) without ever widening it.
    const t = h('div', 'display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-top:8px;text-align:left;width:0;min-width:100%');
    // Groups (shape, colours, type) share one grid so labels align; a divider separates non-empty groups.
    const divider = () => t.childElementCount && t.append(h('div', 'grid-column:1/-1;height:1px;background:#0000001a;margin:3px 0'));
    // Radius, like Figma: a 2×2 grid laid out like the corners themselves, each value next to an icon
    // of its own corner (rounded or square), values facing inward. Elliptical corners show their horizontal part.
    if (d.radii) {
      const grid = h('div', 'grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;align-items:center');
      for (const i of [0, 1, 3, 2]) { // top-left, top-right, bottom-left, bottom-right
        const [vert, hz] = CORNERS[i].split('-');
        const icon = h('span', `flex:none;width:8px;height:8px;box-sizing:border-box;border:0 solid currentColor;border-${vert}-width:1.5px;border-${hz}-width:1.5px;border-${CORNERS[i]}-radius:${d.radii[i][1] ? 4 : 0}px`);
        const value = h('span', '', d.radii[i][0]);
        const cell = h('div', `display:flex;align-items:center;gap:5px;white-space:nowrap;justify-self:${hz === 'right' ? 'end' : 'start'}`);
        cell.append(...(hz === 'right' ? [value, icon] : [icon, value]));
        grid.append(cell);
      }
      t.append(grid);
    }
    divider();
    for (const row of d.rows) {
      if (!row) { divider(); continue; }
      const [k, v, color, wrap] = row;
      const val = h('div', 'display:flex;align-items:center;gap:5px;min-width:0');
      if (color) val.append(swatch(color));
      val.append(h('span', wrap ? CLAMP2 : 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', v));
      t.append(h('div', 'opacity:.6', k), val);
    }
    return t;
  };
  // DevTools-style box-model diagram: each layer is a 3x3 grid, its four values around the next layer in.
  const layer = (name, color, vals, inner) => {
    const d = h('div', `position:relative;display:grid;grid-template:auto auto auto/auto 1fr auto;align-items:center;justify-items:center;gap:2px 6px;padding:2px 6px;background:${color};border:1px dashed #0005`);
    const v = (n, area) => d.append(h('div', `grid-area:${area}`, n ? String(n) : '–'));
    if (name) d.append(h('div', 'position:absolute;left:4px;top:2px;font-size:9px;opacity:.7', name));
    v(vals[0], '1/2'), v(vals[3], '2/1'), v(vals[1], '2/3'), v(vals[2], '3/2');
    inner.style.gridArea = '2/2';
    d.append(inner);
    return d;
  };
  const sidesOf = (cs, p) => ['top', 'right', 'bottom', 'left'].map(s => px(cs.getPropertyValue(p.replace('*', s))));
  const widths = a => a.map(v => Math.max(v, 0) + 'px').join(' '); // negative margins can't be drawn
  // Element name coloured like DevTools: tag purple, #id and .classes blue.
  const label = d => {
    const e = h('div', `font-weight:bold;margin-bottom:6px;max-width:300px;text-align:left;word-break:break-all;${CLAMP2}`);
    e.append(h('span', 'color:#881280', d.tag), h('span', 'color:#1a1aa6', (d.id ? '#' + d.id : '') + (d.cls ? '.' + d.cls.split(/\s+/).join('.') : '')));
    return e;
  };
  // Box-model highlight on the page plus the panel, drawn in this frame's viewport. Redrawn only when the data changes.
  let drawn = null;
  const drawInspect = d => {
    if (d === drawn) return;
    drawn = d;
    if (!d) return show(hl, false), show(tip, false);
    const [left, top, width, height] = d.rect, { m, b, p } = d;
    const [mt, mr, mb, ml] = m.map(v => Math.max(v, 0));
    place(hl, left - ml, top - mt, width + ml + mr, height + mt + mb);
    hl.style.borderWidth = widths(m);
    hlBorder.style.borderWidth = widths(b);
    hlPad.style.borderWidth = widths(p);
    // Content size is what's inside the padding, like DevTools.
    const cw = px(width - b[1] - b[3] - p[1] - p[3]), ch = px(height - b[0] - b[2] - p[0] - p[2]);
    const content = h('div', `padding:4px 8px;background:${BOX.content}aa;border:1px solid #0005;white-space:nowrap`, `${cw} × ${ch}`);
    tip.replaceChildren(
      label(d),
      // Outermost ring: distance from the element's border box to each viewport edge (top/left = y/x).
      layer(d.pos ? `position: ${d.pos}` : 'position', 'transparent', [top, vw() - left - width, vh() - top - height, left].map(px),
        layer('margin', BOX.margin + 'aa', m, layer('border', BOX.border + 'aa', b, layer('padding', BOX.padding + 'aa', p, content)))),
      styles(d),
    );
    show(tip, true);
    const below = top + height + mb + 6;
    clampTip(tip, left, below + tip.offsetHeight > vh() ? top - mt - 6 - tip.offsetHeight : below);
  };
  // ⌘ Inspect for el (or null): rebuilt only when the element, its box or the styles it shows change.
  // The top page draws its own element, else what a child frame sent up; other frames only post up.
  let inspected = null, inspectedKey = '', local = null, remote = null;
  const inspect = el => {
    const r = el?.getBoundingClientRect(), cs = el && getComputedStyle(el);
    const key = r && [r.left, r.top, r.width, r.height, cs.color, cs.backgroundColor, cs.borderColor, cs.borderRadius, cs.font].join();
    if (el !== inspected || key !== inspectedKey) {
      (inspected = el), (inspectedKey = key), (local = el ? inspectData(el) : null);
      if (!isTop) send(['inspect', local, depth]);
    }
    if (isTop) drawInspect(local || (held.box ? remote : null));
  };

  // A distance line from a to b along one axis, at cross position `at`, with end caps and a length label.
  // ponytail: each label is measured right after it's added (one forced layout per label); fine for a
  // few dozen gaps, batch the reads if huge grids get slow.
  const measure = (horiz, a, b, at) => {
    const bar = (l, t, w, ht) => place(marks.appendChild(h('div', `${Z}background:${ACCENT}`)), l, t, w, ht);
    if (horiz) bar(a, at, b - a, 1), bar(a, at - 4, 1, 9), bar(b - 1, at - 4, 1, 9);
    else bar(at, a, 1, b - a), bar(at - 4, a, 9, 1), bar(at - 4, b - 1, 9, 1);
    const tag = marks.appendChild(h('div', `${Z}${FONT}padding:1px 5px;border-radius:3px;background:${ACCENT};color:#fff`, Math.round(b - a)));
    if (horiz) clampTip(tag, (a + b - tag.offsetWidth) / 2, at - tag.offsetHeight - 4);
    else clampTip(tag, at + 6, (a + b - tag.offsetHeight) / 2);
  };
  const outline = (r, style) => place(marks.appendChild(h('div', `${Z}box-sizing:border-box;border:1px ${style} ${ACCENT}`)), r.left, r.top, r.width, r.height);
  // Gaps between boxes A and B along one axis: the space between them when they're apart, else the
  // distance between matching edges (B inside A, or overlapping), skipping edges that line up.
  const gaps = (A, B, horiz) => {
    const [a1, a2, b1, b2] = horiz ? [A.left, A.right, B.left, B.right] : [A.top, A.bottom, B.top, B.bottom];
    if (a2 <= b1) return [[a2, b1]];
    if (b2 <= a1) return [[b2, a1]];
    return [[a1, b1], [a2, b2]].map(([p, q]) => [Math.min(p, q), Math.max(p, q)]).filter(([p, q]) => q - p >= 0.5);
  };
  // Where a line between A and B sits on the other axis: the middle of their overlap, else through B's centre.
  const cross = (A, B, horiz) => {
    const [lo, hi] = horiz ? [Math.max(A.top, B.top), Math.min(A.bottom, B.bottom)] : [Math.max(A.left, B.left), Math.min(A.right, B.right)];
    return lo < hi ? (lo + hi) / 2 : horiz ? B.top + B.height / 2 : B.left + B.width / 2;
  };
  const measureBetween = (A, B) => {
    for (const horiz of [true, false]) for (const [a, b] of gaps(A, B, horiz)) measure(horiz, a, b, cross(A, B, horiz));
  };
  // What a list item actually draws: drill through invisible single-child wrappers with no text of their
  // own (li > a > span), so gaps are measured between visible things, not padded boxes. Stops at anything
  // that paints (a button's background, a card's border…): its edge is what you see.
  const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'embed', 'object', 'input', 'textarea', 'select', 'hr']);
  const paints = el => {
    const cs = getComputedStyle(el);
    return REPLACED.has(el.localName) || cs.backgroundImage !== 'none' || painted(cs.backgroundColor) || cs.boxShadow !== 'none' || visibleBorders(cs).length > 0;
  };
  const drill = el => {
    while (el.childElementCount === 1 && !paints(el) && [...el.childNodes].every(n => n.nodeType !== Node.TEXT_NODE || !n.data.trim())) el = el.firstElementChild;
    return el;
  };
  // Neighbour pairs for boxes laid out in rows (a column, a row, or a wrapping grid): each box with the one
  // before it in its row (horizontal) and with the box above it that overlaps it most (vertical). Null if
  // the boxes aren't in rows: within a row they go left to right, rows go top to bottom, no overlaps.
  // ponytail: masonry and RTL/reversed orders don't qualify.
  const pairsOf = rects => {
    const rows = [];
    let bottom = -Infinity; // lowest edge of the current row
    for (const r of rects) {
      const row = rows.at(-1);
      if (row && r.top < bottom - 0.5) {
        if (r.left < row.at(-1).right - 0.5) return null; // overlaps or goes backwards
        row.push(r);
        bottom = Math.max(bottom, r.bottom);
      } else rows.push([r]), (bottom = r.bottom);
    }
    const pairs = [];
    rows.forEach((row, i) => row.forEach((r, j) => {
      if (j) pairs.push([row[j - 1], r, true]);
      let above, most = 0;
      for (const u of rows[i - 1] || []) {
        const o = Math.min(u.right, r.right) - Math.max(u.left, r.left);
        if (o > most) (most = o), (above = u);
      }
      if (above) pairs.push([above, r, false]);
    }));
    return pairs;
  };
  // The visible items of the nearest ancestor of el whose (2+) children are laid out in rows. Found once
  // when ⌥ goes down (it reads styles of every child up the tree); their boxes are re-read each frame.
  const groupOf = el => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const items = [...p.children].map(drill).filter(c => hasArea(c.getBoundingClientRect()));
      if (items.length > 1 && pairsOf(items.map(c => c.getBoundingClientRect()))) return items;
    }
    return null;
  };
  const place = (el, l, t, w, ht) => Object.assign(el.style, { display: 'block', left: l + 'px', top: t + 'px', width: w + 'px', height: ht + 'px' });
  const clampTip = (el, l, t) => {
    show(el, true);
    const w = el.offsetWidth, ht = el.offsetHeight;
    el.style.left = Math.max(4, Math.min(l, vw() - w - 4)) + 'px';
    el.style.top = Math.max(4, Math.min(t, vh() - ht - 4)) + 'px';
  };

  // An <iframe> element is left to the Mezur running inside it, which has the mouse when it's over it.
  const mine = el => (el && el !== host && el.localName !== 'iframe' && el.localName !== 'frame' ? el : null);
  // The element under the cursor, as you see it. Plain elementFromPoint is fooled by "stretched link"
  // overlays (a link's ::after covering a whole card) and skips pointer-events:none elements. So: take
  // the topmost element whose own box contains the point, then descend to the deepest child that does,
  // later siblings first since they paint on top.
  // ponytail: children clipped by overflow or hidden by visibility can still win; fine in practice.
  const hit = (x, y) => {
    const has = e => {
      const r = e.getBoundingClientRect();
      return hasArea(r) && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    let el = mine(document.elementsFromPoint(x, y).find(e => e !== host && has(e)));
    if (!el) return null;
    for (let c = el.lastElementChild; c; ) {
      if (has(c)) (el = c), (c = c.lastElementChild);
      else c = c.previousElementSibling;
    }
    return mine(el);
  };

  let raf = 0;
  const update = () => (raf ||= requestAnimationFrame(render));
  const render = () => {
    raf = 0;
    if (rulersDirty && rulersShown()) (rulersDirty = false), drawRuler(rTop, vw(), true), drawRuler(rLeft, vh(), false);
    const inside = on && mx >= 0 && my >= 0;
    // Cursor position marked on both rulers.
    const marked = rulersShown() && inside;
    show(markX, marked);
    show(markY, marked);
    if (marked) (markX.style.left = mx + 'px'), (markY.style.top = my + 'px');

    marks.replaceChildren();
    const under = inside && (picked || held.box) ? hit(mx, my) : null;
    if (picked && !picked.isConnected) picked = group = null;
    if (picked) {
      const A = picked.getBoundingClientRect();
      outline(A, 'solid');
      if (under && under !== picked) {
        const B = under.getBoundingClientRect();
        outline(B, 'dashed');
        measureBetween(A, B);
      } else if (group) {
        // Still on the picked element: the spacing inside the nearest list or grid around it.
        const rects = group.filter(c => c.isConnected).map(c => c.getBoundingClientRect()); // re-rendered lists detach items
        for (const r of rects) outline(r, 'dashed');
        // Each neighbour pair only along the axis it sits on (side by side → horizontal, stacked → vertical).
        for (const [P, B, horiz] of pairsOf(rects) || []) for (const [a, b] of gaps(P, B, horiz)) measure(horiz, a, b, cross(P, B, horiz));
      }
    }
    inspect(held.box ? under : null);
  };

  // Idle pages pay nothing: outside measure mode only the cursor position is tracked.
  // pointermove, not mousemove: it keeps firing while a guide is dragged (pointer capture).
  // Over an <iframe> the cursor belongs to the frame inside (this one stops getting moves), so it counts as gone.
  let overFrame = null; // the <iframe> element the cursor is over, to place what that frame sends up
  const track = e => {
    const t = e.target.localName;
    if (t === 'iframe' || t === 'frame') (overFrame = e.target), (mx = my = -1);
    else (overFrame = remote = null), (mx = e.clientX), (my = e.clientY);
    if (on) update();
  };
  addEventListener('pointermove', track, { capture: true, passive: true, signal });
  addEventListener('pointerover', track, { capture: true, passive: true, signal });
  // Leaving the window: mouseout with no element to go to (mouseleave on document isn't reliable).
  addEventListener('mouseout', e => e.relatedTarget || ((overFrame = remote = null), (mx = my = -1), on && update()), { capture: true, passive: true, signal });
  addEventListener('scroll', () => on && update(), { capture: true, passive: true, signal });

  // ⌥ / ⌘ go down or up. Only the frame under the cursor picks something; the list/grid around the picked
  // element is found once here, not every frame.
  const press = (down, k) => {
    held[k] = down;
    if (k === 'pick') {
      picked = down && mx >= 0 ? hit(mx, my) : null;
      group = picked && groupOf(picked);
    }
    paintHint();
    update();
  };
  const release = () => {
    held.pick = held.box = false;
    remote = null;
    picked = group = null;
    paintHint();
    update();
  };
  const setOn = v => {
    if (v === on) return;
    on = v;
    release();
    showBar();
    drawRulers();
    if (isTop) ext(() => chrome.runtime.sendMessage({ icon: on })); // toolbar icon: colour while on
  };

  // Measure mode is owned by the top page; the popup switch message reaches every frame,
  // and a late frame asks for the current state. Key presses go to every frame (only the focused one gets
  // them), R goes to the top page (rulers live there), and Inspect data climbs one level at a time.
  ext(() => chrome.runtime.onMessage.addListener(live((msg, sender, respond) => {
    if (msg === 'measure') return void (isTop && (setOn(!on), send(['on', on])));
    if (msg === 'state') return void (isTop && respond({ on })); // the popup asks whether measure mode is on
    const m = msg?.mezur;
    if (!Array.isArray(m) || msg.src === self) return;
    const [type, a, b] = m;
    if (type === 'ask') isTop && send(['on', on]);
    else if (type === 'on') isTop || setOn(!!a);
    else if (type === 'rulers') isTop && toggleRulers();
    else if (type === 'key') on && press(!!a, b);
    else if (type === 'inspect' && b === depth + 1 && overFrame?.isConnected) {
      const fr = overFrame.getBoundingClientRect(), fcs = getComputedStyle(overFrame);
      const d = clean(a, fr.left + overFrame.clientLeft + parseFloat(fcs.paddingLeft), fr.top + overFrame.clientTop + parseFloat(fcs.paddingTop));
      if (isTop) (remote = d), update();
      else send(['inspect', d, depth]);
    }
  })));
  if (!isTop) send(['ask']);
  else ext(() => chrome.runtime.sendMessage({ icon: false })); // a fresh page starts off (the tab's icon may still say on)

  // ⌥ measures, ⌘ inspects, both only while held; R toggles rulers. ⌘ shortcuts (⌘C…) still reach the page.
  const keys = { Alt: 'pick', Meta: 'box', r: 'rulers', R: 'rulers' };
  const editable = t => t.isContentEditable || ['input', 'textarea', 'select'].includes(t.localName);
  addEventListener('keydown', e => {
    const k = on && !e.ctrlKey && (!e.metaKey || e.key === 'Meta') && (!e.altKey || e.key === 'Alt') && keys[e.key];
    if (!k || (k === 'rulers' && editable(e.target))) return; // typing an r in a field stays typing
    e.preventDefault();
    e.stopImmediatePropagation(); // the page's own shortcuts shouldn't fire
    if (e.repeat) return;
    if (k === 'rulers') return toggleRulers();
    press(true, k);
    send(['key', 1, k]);
  }, { capture: true, signal });
  addEventListener('keyup', e => {
    const k = keys[e.key];
    if (!on || !k || k === 'rulers') return;
    e.stopImmediatePropagation();
    press(false, k);
    send(['key', 0, k]);
  }, { capture: true, signal });
  addEventListener('blur', release, { signal }); // keyup never arrives if focus leaves mid-press
})();
