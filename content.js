// Mezur: window size while resizing, rulers, and a measure mode (distances between two elements while
// Option is held, box model of the hovered element while B is held). Everything draws in a closed shadow root with
// pointer-events:none, so the page stays fully usable underneath.
(() => {
  document.querySelector('[data-mezur]')?.remove(); // leftover from before an extension reload

  const h = (tag, css, text) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };
  const Z = 'position:fixed;z-index:2147483647;pointer-events:none;';
  const FONT = 'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;';
  const ACCENT = '#ff2d78';
  const R = 14; // ruler thickness
  // DevTools box-model colours, same as Unhooded's Elements highlight.
  const BOX = { margin: '#f6b26b', border: '#ffe599', padding: '#93c47d', content: '#6fa8dc' };

  const host = h('div', 'all:initial');
  host.dataset.mezur = '';
  const root = host.attachShadow({ mode: 'closed' });
  document.documentElement.append(host);
  const add = (...els) => (root.append(...els), els[0]);
  const show = (el, on) => (el.style.display = on ? 'block' : 'none');
  const vw = () => document.documentElement.clientWidth; // excludes the scrollbar
  const vh = () => document.documentElement.clientHeight;
  let mx = -1, my = -1;

  // --- window size, top-right while resizing (like DevTools) ---
  const size = add(h('div', `${Z}${FONT}display:none;right:0;padding:2px 6px;background:#fffe;color:#333;border:1px solid #bbb`));
  let sizeT;
  addEventListener('resize', () => {
    size.textContent = `${innerWidth}px × ${innerHeight}px`;
    size.style.top = (rulers ? R : 0) + 'px';
    show(size, true);
    clearTimeout(sizeT);
    sizeT = setTimeout(() => show(size, false), 1000);
    drawRulers();
  });

  // --- rulers, top and left; on/off is shared by all tabs through storage ---
  let rulers = false;
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
    x.font = '8px ui-monospace,Menlo,monospace';
    x.textBaseline = 'top';
    x.lineWidth = 1;
    x.beginPath();
    for (let i = 0; i <= len; i += 10) {
      const t = i % 100 === 0 ? R : i % 50 === 0 ? R / 2 : R / 4;
      if (horiz) x.moveTo(i + 0.5, R), x.lineTo(i + 0.5, R - t);
      else x.moveTo(R, i + 0.5), x.lineTo(R - t, i + 0.5);
      if (i % 100 || !i) continue;
      if (horiz) x.fillText(i, i + 2, 1);
      else x.save(), x.translate(1, i - 2), x.rotate(-Math.PI / 2), x.fillText(i, 0, 0), x.restore();
    }
    if (horiz) x.moveTo(0, R - 0.5), x.lineTo(len, R - 0.5);
    else x.moveTo(R - 0.5, 0), x.lineTo(R - 0.5, len);
    x.stroke();
  };
  // Guides: drag out of a ruler, drag to move, drop back on a ruler to delete. Fixed to the viewport, like the rulers.
  // ponytail: 5px grab band takes clicks from the page underneath; guides are lost on reload.
  const drag = (g, e) => {
    e.preventDefault();
    e.stopPropagation();
    g.setPointerCapture(e.pointerId);
    const at = e => (g.horiz ? e.clientY : e.clientX);
    const move = e => {
      g.style[g.horiz ? 'top' : 'left'] = at(e) - 2 + 'px';
      gLabel.textContent = Math.round(at(e));
      Object.assign(gLabel.style, { display: 'block', left: e.clientX + 10 + 'px', top: e.clientY + 10 + 'px' });
    };
    const up = e => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      show(gLabel, false);
      if (at(e) < R) g.remove();
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    move(e);
  };
  const guide = (horiz, e) => {
    const g = h('div', `${Z}pointer-events:auto;${horiz ? 'left:0;width:100%;height:5px;cursor:row-resize' : 'top:0;height:100%;width:5px;cursor:col-resize'}`);
    g.append(h('div', `position:absolute;background:#00a2ff;${horiz ? 'left:0;right:0;top:2px;height:1px' : 'top:0;bottom:0;left:2px;width:1px'}`));
    g.horiz = horiz;
    g.addEventListener('pointerdown', e => drag(g, e));
    guides.append(g);
    drag(g, e);
  };
  rTop.addEventListener('pointerdown', e => guide(true, e));
  rLeft.addEventListener('pointerdown', e => guide(false, e));

  const drawRulers = () => {
    for (const el of [rTop, rLeft, guides]) show(el, rulers);
    if (rulers) drawRuler(rTop, vw(), true), drawRuler(rLeft, vh(), false);
    update();
  };
  const setRulers = v => ((rulers = !!v), drawRulers());
  chrome.storage.local.get('rulers').then(s => setRulers(s.rulers));
  chrome.storage.onChanged.addListener(c => c.rulers && setRulers(c.rulers.newValue));
  const toggleRulers = () => chrome.storage.local.set({ rulers: !rulers });

  // --- measure mode ---
  let on = false, box = false, picked = null; // picked: element hovered when Option went down, measured from
  const hint = add(h('div', `${Z}${FONT}display:none;bottom:8px;left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:4px;background:#222e;color:#fff;white-space:nowrap`,
    'hover an element, hold ⌥ and move to another to measure · hold B box · R rulers · Esc exit'));
  const marks = add(h('div', '')); // distance lines and outlines, rebuilt every frame
  const layerCss = 'box-sizing:border-box;border-style:solid;width:100%;height:100%';
  const hl = add(h('div', `${Z}display:none;${layerCss};border-color:${BOX.margin}80`));
  const hlBorder = h('div', `${layerCss};border-color:${BOX.border}80`);
  const hlPad = h('div', `${layerCss};border-color:${BOX.padding}80;background:${BOX.content}80;background-clip:content-box`);
  hl.append(hlBorder);
  hlBorder.append(hlPad);
  const tip = add(h('div', `${Z}${FONT}display:none;padding:6px;border-radius:4px;background:#fff;color:#222;box-shadow:0 2px 8px #0004;text-align:center`));
  // DevTools-style box-model diagram: each layer is a 3x3 grid, its four values around the next layer in.
  // rgb()/rgba() → #rrggbb(aa); other spaces (oklch, color()) are shown as Chrome reports them.
  const hex = c => {
    const n = c.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:[,/] ?([\d.]+))?\)$/);
    if (!n) return c;
    const a = n[4] == null ? 1 : +n[4];
    return '#' + [n[1], n[2], n[3], ...(a < 1 ? [a * 255] : [])].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  };
  // Font, colours and radius under the diagram; background and radius only when set.
  // ponytail: shows the font-family stack, not which font actually rendered (only DevTools knows that).
  const CLAMP2 = 'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden'; // wrap, max 2 lines then …
  const swatch = c => h('span', `flex:none;width:10px;height:10px;border-radius:2px;border:1px solid #0003;background:${c}`);
  // Value as the author wrote it (1rem, 50%, 8px…): Chrome's computed style only has px/%, so look
  // through the page's rules for declarations that match the element and resolve to the computed value;
  // the last one wins (later rules and inline style override earlier ones). If none is readable
  // (cross-origin stylesheet, calc()), the computed value is shown.
  // ponytail: px-equal candidates with different units (16px vs 1rem) resolve to the later one, ignoring specificity.
  const authoredCache = new WeakMap();
  const authored = (el, cs, prop) => {
    const computed = cs.getPropertyValue(prop).split(' ')[0];
    const key = prop + computed;
    const hit = authoredCache.get(el);
    if (hit?.[key]) return hit[key];
    const sub = v => v.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, n, fb) => cs.getPropertyValue(n).trim() || fb || '');
    // A shorthand using var() leaves its longhands empty in CSSOM, so expand border-radius ourselves.
    const corner = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].findIndex(c => prop === `border-${c}-radius`);
    const declared = st => {
      const v = st.getPropertyValue(prop);
      if (v || corner < 0) return v;
      const t = sub(st.getPropertyValue('border-radius')).split('/')[0].trim().split(/\s+/);
      return [t[0], t[1] ?? t[0], t[2] ?? t[0], t[3] ?? t[1] ?? t[0]][corner] || '';
    };
    const found = [];
    const walk = rules => {
      for (const r of rules) {
        try {
          if (r.selectorText && el.matches(r.selectorText)) found.push(declared(r.style));
        } catch {} // nested-CSS selectors with & don't parse in matches()
        if (r.cssRules && !(r.media && !matchMedia(r.media.mediaText).matches)) walk(r.cssRules);
      }
    };
    for (const sh of [...document.styleSheets, ...document.adoptedStyleSheets]) {
      try { walk(sh.cssRules); } catch {} // cross-origin sheets can't be read
    }
    found.push(declared(el.style));
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const toPx = v => {
      v = sub(v);
      const m = v.trim().split(/\s+/)[0].match(/^(-?[\d.]+)(px|rem|em|%)?$/);
      if (!m) return null;
      return m[2] === '%' ? m[1] + '%' : m[2] === 'rem' ? m[1] * rootPx : m[2] === 'em' ? m[1] * parseFloat(cs.fontSize) : +m[1];
    };
    const same = v => {
      const a = toPx(v);
      return typeof a === 'string' ? a === computed : a != null && Math.abs(a - parseFloat(computed)) < 0.01;
    };
    const winner = sub(found.filter(v => v && same(v)).pop() || '').trim().split(/\s+/)[0];
    // Non-px units also show their px value so both are visible.
    const out = !winner ? computed : /px$|%$|^0$/.test(winner) ? winner : `${winner} (${px(computed)}px)`;
    authoredCache.set(el, { ...hit, [key]: out });
    return out;
  };
  const styles = (el, cs) => {
    // width:0 + min-width:100%: fill the overlay's width (set by the box model) without ever widening it.
    const t = h('div', 'display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-top:8px;text-align:left;width:0;min-width:100%');
    const row = (k, v, icon, wrap) => {
      const val = h('div', 'display:flex;align-items:center;gap:5px;min-width:0');
      if (icon) val.append(icon);
      val.append(h('span', wrap ? CLAMP2 : 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', v));
      t.append(h('div', 'opacity:.6', k), val);
    };
    // Groups (shape, colours, type) share one grid so labels align; a divider separates non-empty groups.
    const group = () => t.childElementCount && t.append(h('div', 'grid-column:1/-1;height:1px;background:#0000001a;margin:3px 0'));
    // Radius, elliptical corners show their horizontal part.
    const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(c => `border-${c}-radius`);
    const r = corners.map(c => parseFloat(cs.getPropertyValue(c)));
    if (r.some(Boolean)) {
      const v = corners.map(c => authored(el, cs, c));
      // Like Figma: a 2×2 grid laid out like the corners themselves, each value next to an icon
      // of its own corner (rounded or square).
      const icon = (sides, i) => h('span', `flex:none;width:8px;height:8px;box-sizing:border-box;border:0 solid currentColor;${sides.map(sd => `border-${sd}-width:1.5px`).join(';')};border-${corners[i].slice(7, -7)}-radius:${r[i] ? 4 : 0}px`);
      // Full width, no label (the corner icons say it): corners at the outer edges, values facing inward.
      const grid = h('div', 'grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;align-items:center');
      for (const [i, sides, area] of [[0, ['top', 'left'], '1/1'], [1, ['top', 'right'], '1/2'], [3, ['bottom', 'left'], '2/1'], [2, ['bottom', 'right'], '2/2']]) {
        const right = sides[1] === 'right';
        const cell = h('div', `grid-area:${area};display:flex;align-items:center;gap:5px;white-space:nowrap;justify-self:${right ? 'end' : 'start'}`);
        cell.append(...(right ? [h('span', '', v[i]), icon(sides, i)] : [icon(sides, i), h('span', '', v[i])]));
        grid.append(cell);
      }
      t.append(grid);
    }
    group();
    row('text', hex(cs.color), swatch(cs.color));
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') row('background', hex(cs.backgroundColor), swatch(cs.backgroundColor));
    // Border colour only (widths are in the box model): one row when all visible sides match, else one per side.
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(sd => [sd, cs[`border${sd}Color`], px(cs[`border${sd}Width`]), cs[`border${sd}Style`]])
      .filter(([, , w, st]) => w && st !== 'none' && st !== 'hidden');
    const same = sides.length === 4 && sides.every(x => x[1] === sides[0][1]);
    for (const [sd, c] of same ? [sides[0]] : sides) row(same ? 'border' : 'border ' + sd.toLowerCase(), hex(c), swatch(c));
    group();
    row('font size', px(cs.fontSize) + 'px');
    row('font weight', cs.fontWeight);
    row('line height', cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight) + 'px');
    row('font family', cs.fontFamily, null, true);
    return t;
  };
  const layer = (name, color, vals, inner) => {
    const d = h('div', `position:relative;display:grid;grid-template:auto auto auto/auto 1fr auto;align-items:center;justify-items:center;gap:2px 6px;padding:2px 6px;background:${color};border:1px dashed #0005`);
    const v = (n, area) => d.append(h('div', `grid-area:${area}`, n ? String(n) : '–'));
    if (name) d.append(h('div', 'position:absolute;left:4px;top:2px;font-size:9px;opacity:.7', name));
    v(vals[0], '1/2'), v(vals[3], '2/1'), v(vals[1], '2/3'), v(vals[2], '3/2');
    inner.style.gridArea = '2/2';
    d.append(inner);
    return d;
  };

  const setOn = v => {
    on = v;
    box = false;
    picked = null;
    show(hint, on);
    update();
  };
  chrome.runtime.onMessage.addListener(m => m === 'measure' && setOn(!on));

  // A distance line from a to b along one axis, at cross position `at`, with end caps and a length label.
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
  const place = (el, l, t, w, ht) => Object.assign(el.style, { display: 'block', left: l + 'px', top: t + 'px', width: w + 'px', height: ht + 'px' });
  const clampTip = (el, l, t) => {
    show(el, true);
    const w = el.offsetWidth, ht = el.offsetHeight;
    el.style.left = Math.max(4, Math.min(l, vw() - w - 4)) + 'px';
    el.style.top = Math.max(4, Math.min(t, vh() - ht - 4)) + 'px';
  };

  const px = v => +parseFloat(v).toFixed(1);
  const sides = (cs, p) => ['top', 'right', 'bottom', 'left'].map(s => px(cs.getPropertyValue(p.replace('*', s))));
  const widths = a => a.map(v => Math.max(v, 0) + 'px').join(' '); // negative margins can't be drawn
  // Element name coloured like DevTools: tag purple, #id and .classes blue.
  const label = el => {
    const cls = typeof el.className === 'string' && el.className.trim();
    const d = h('div', `font-weight:bold;margin-bottom:6px;max-width:300px;text-align:left;word-break:break-all;${CLAMP2}`);
    d.append(h('span', 'color:#881280', el.localName), h('span', 'color:#1a1aa6', (el.id ? '#' + el.id : '') + (cls ? '.' + cls.split(/\s+/).join('.') : '')));
    return d;
  };

  let raf = 0;
  const update = () => (raf ||= requestAnimationFrame(render));
  const render = () => {
    raf = 0;
    const inside = mx >= 0 && my >= 0;
    show(markX, rulers && inside);
    show(markY, rulers && inside);
    markX.style.left = mx + 'px';
    markY.style.top = my + 'px';

    marks.replaceChildren();
    if (on && picked) {
      if (!picked.isConnected) picked = null;
      else {
        const A = picked.getBoundingClientRect();
        outline(A, 'solid');
        const hov = inside && document.elementFromPoint(mx, my);
        if (hov && hov !== host && hov !== picked) {
          const B = hov.getBoundingClientRect();
          outline(B, 'dashed');
          for (const horiz of [true, false]) {
            // Lines sit in the middle of where the two boxes overlap on the other axis, else through B's centre.
            const [lo, hi] = horiz ? [Math.max(A.top, B.top), Math.min(A.bottom, B.bottom)] : [Math.max(A.left, B.left), Math.min(A.right, B.right)];
            const at = lo < hi ? (lo + hi) / 2 : horiz ? B.top + B.height / 2 : B.left + B.width / 2;
            for (const [a, b] of gaps(A, B, horiz)) measure(horiz, a, b, at);
          }
        }
      }
    }

    const el = on && box && inside && document.elementFromPoint(mx, my);
    if (!el || el === host) return show(hl, false), show(tip, false);
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const m = sides(cs, 'margin-*'), b = sides(cs, 'border-*-width'), p = sides(cs, 'padding-*');
    const [mt, mr, mb, ml] = m.map(v => Math.max(v, 0));
    place(hl, r.left - ml, r.top - mt, r.width + ml + mr, r.height + mt + mb);
    hl.style.borderWidth = widths(m);
    hlBorder.style.borderWidth = widths(b);
    hlPad.style.borderWidth = widths(p);
    // Content size is what's inside the padding, like DevTools.
    const cw = px(r.width - b[1] - b[3] - p[1] - p[3]), ch = px(r.height - b[0] - b[2] - p[0] - p[2]);
    const content = h('div', `padding:4px 8px;background:${BOX.content}aa;border:1px solid #0005;white-space:nowrap`, `${cw} × ${ch}`);
    tip.replaceChildren(
      label(el),
      // Outermost ring: distance from the element's border box to each viewport edge (top/left = y/x).
      layer('position', 'transparent', [r.top, vw() - r.right, vh() - r.bottom, r.left].map(px),
        layer('margin', BOX.margin + 'aa', m, layer('border', BOX.border + 'aa', b, layer('padding', BOX.padding + 'aa', p, content)))),
      styles(el, cs),
    );
    clampTip(tip, r.left, r.bottom + mb + 6 + tip.offsetHeight > vh() ? r.top - mt - 6 - tip.offsetHeight : r.bottom + mb + 6);
  };

  addEventListener('mousemove', e => ((mx = e.clientX), (my = e.clientY), update()), { capture: true, passive: true });
  document.addEventListener('mouseleave', () => ((mx = my = -1), update()));
  addEventListener('scroll', update, { capture: true, passive: true });

  // Option (Alt) is held to measure: the element under the cursor when it goes down is picked, and
  // hovering any other element shows the distances between the two. B and Option show only while held.
  const keys = { Alt: 'pick', b: 'box', B: 'box', r: 'rulers', R: 'rulers', Escape: 'exit' };
  addEventListener('keydown', e => {
    const k = on && !e.metaKey && !e.ctrlKey && (!e.altKey || e.key === 'Alt') && keys[e.key];
    if (!k) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // the page's own shortcuts shouldn't fire
    if (e.repeat) return;
    if (k === 'exit') return setOn(false);
    if (k === 'box') box = true;
    else if (k === 'rulers') toggleRulers();
    else picked = mx >= 0 && document.elementFromPoint(mx, my);
    update();
  }, true);
  const release = () => ((picked = null), (box = false), update());
  addEventListener('keyup', e => {
    const k = keys[e.key];
    if (!on || (k !== 'pick' && k !== 'box')) return;
    e.stopImmediatePropagation();
    if (k === 'box') box = false;
    else picked = null;
    update();
  }, true);
  addEventListener('blur', release); // keyup never arrives if focus leaves mid-press
})();
