// UI core: panels, dialogs, tooltips, drag & drop, message log.
import { onArtLoad } from '../core/classart.js';
import { G } from '../state.js';
import { el, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';

export const $ = (s, root = document) => root.querySelector(s);

export const UI = {
  panels: new Map(),
  renderers: new Map(),
  modalCount: 0,
  selected: null,
  windowOrder: 30,
  windowPositions: new Map(),
  get modal() { return this.modalCount > 0; },

  init() {
    G.ui = this;
    onArtLoad(() => this.refresh()); // armor icons and the portrait appear once their strips arrive
    this.panelsEl = $('#panels');
    this.screensEl = $('#screens');
    this.tipEl = $('#tooltip');
    this.logEl = $('#log');
    this.msgEl = $('#center-msg');
    this.ghost = $('#drag-ghost');
    initDnD();
    window.addEventListener('resize', () => this.layoutPanels());
    document.addEventListener('pointermove', (e) => { if (!this.tipEl.classList.contains('hidden') && e.pointerType === 'mouse') this.placeTip(e.clientX, e.clientY); });
  },

  // ------------------------------------------------------------- panels
  /** Create (or reuse) a panel. render(body, panel) is called on open and refresh(). */
  openPanel(name, title, render, opts = {}) {
    let p = this.panels.get(name);
    if (!p) {
      const root = el('div', 'panel ' + (opts.cls || ''));
      root.dataset.panel = name;
      if (opts.width) root.style.width = opts.width;
      const head = el('div', 'panel-head', `<h2>${escapeHtml(title)}</h2>`);
      const close = el('button', 'panel-close', '&times;');
      close.title = 'Close (Esc)';
      close.onclick = () => { sfx('ui'); this.closePanel(name); };
      head.appendChild(close);
      head.addEventListener('pointerdown', (e) => this.startPanelMove(e, name));
      root.addEventListener('pointerdown', () => this.focusPanel(name));
      root.appendChild(head);
      const body = el('div', 'panel-body');
      root.appendChild(body);
      if (opts.order === 'first') this.panelsEl.prepend(root); else this.panelsEl.appendChild(root);
      p = { root, head, body, title, opts };
      this.panels.set(name, p);
    }
    p.head.querySelector('h2').textContent = title;
    p.opts = opts;
    this.renderers.set(name, render);
    render(p.body, p);
    this.focusPanel(name);
    this.layoutPanels();
    this.onPanelsChanged();
    return p;
  },
  closePanel(name) {
    const p = this.panels.get(name);
    if (!p) return;
    p.root.remove();
    this.panels.delete(name);
    this.renderers.delete(name);
    if (p.opts.onClose) p.opts.onClose();
    if (!this.panels.size) { this.selected = null; this.hideTip(); }
    this.layoutPanels();
    this.onPanelsChanged();
  },
  closeAll() {
    for (const k of [...this.panels.keys()]) this.closePanel(k);
    this.closeAllDialogs();
  },
  closeAllDialogs() {
    if (this.screensEl) {
      const screens = this.screensEl.querySelectorAll('.screen');
      screens.forEach((s) => s.remove());
    }
    this.modalCount = 0;
  },
  isOpen(name) { return this.panels.has(name); },
  anyOpen() { return this.panels.size > 0; },
  refresh() {
    for (const [name, r] of this.renderers) {
      const p = this.panels.get(name);
      if (p) {
        const st = p.body.scrollTop;
        const expanded = p.body.querySelector('.character-more')?.open;
        r(p.body, p);
        p.body.scrollTop = st;
        if (expanded) p.body.querySelector('.character-more')?.setAttribute('open', '');
      }
    }
    if (this.hud) this.hud.refreshStatic();
  },
  onPanelsChanged() { if (this.hud) this.hud.refreshStatic(); },

  desktopPanels() { return !G.touch && !document.body.classList.contains('touch'); },
  focusPanel(name) {
    const p = this.panels.get(name);
    if (p && this.desktopPanels()) p.root.style.zIndex = ++this.windowOrder;
  },
  panelBounds(p) {
    const host = this.panelsEl.getBoundingClientRect();
    return { w: host.width, h: host.height, pw: p.root.offsetWidth, ph: p.root.offsetHeight };
  },
  placePanel(name, x, y) {
    const p = this.panels.get(name);
    if (!p) return;
    const { w, h, pw, ph } = this.panelBounds(p);
    const left = Math.max(0, Math.min(x, Math.max(0, w - pw)));
    const top = Math.max(0, Math.min(y, Math.max(0, h - Math.min(ph, 48))));
    p.root.style.left = `${left}px`;
    p.root.style.top = `${top}px`;
    this.windowPositions.set(name, { x: left, y: top, moved: true });
  },
  layoutPanels() {
    if (!this.panelsEl || !this.desktopPanels()) return;
    const host = this.panelsEl.getBoundingClientRect();
    const inventory = this.panels.get('inventory');
    const partner = [...this.panels].find(([name]) => ['vendor', 'stash', 'reliquary'].includes(name));
    const canPair = inventory && partner && host.width >= inventory.root.offsetWidth + partner[1].root.offsetWidth + 22;
    for (const [name, p] of this.panels) {
      const saved = this.windowPositions.get(name);
      if (saved?.moved && !(canPair && (name === 'inventory' || name === partner[0]))) {
        this.placePanel(name, saved.x, saved.y);
        continue;
      }
      const pw = p.root.offsetWidth, ph = p.root.offsetHeight;
      let x = Math.max(0, (host.width - pw) / 2);
      if (canPair) {
        const total = inventory.root.offsetWidth + partner[1].root.offsetWidth + 12;
        const start = (host.width - total) / 2;
        if (name === 'inventory') x = start + partner[1].root.offsetWidth + 12;
        else if (name === partner[0]) x = start;
      }
      p.root.style.left = `${Math.round(x)}px`;
      p.root.style.top = `${Math.max(0, Math.min(10, host.height - ph))}px`;
    }
  },
  startPanelMove(e, name) {
    if (!this.desktopPanels() || e.button !== 0 || e.target.closest('button, input, select')) return;
    const p = this.panels.get(name);
    if (!p) return;
    e.preventDefault();
    this.focusPanel(name);
    const host = this.panelsEl.getBoundingClientRect();
    const r = p.root.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    p.head.setPointerCapture(e.pointerId);
    p.root.classList.add('moving');
    const move = (ev) => this.placePanel(name, ev.clientX - host.left - dx, ev.clientY - host.top - dy);
    const end = () => {
      p.root.classList.remove('moving');
      p.head.removeEventListener('pointermove', move);
      p.head.removeEventListener('pointerup', end);
      p.head.removeEventListener('pointercancel', end);
    };
    p.head.addEventListener('pointermove', move);
    p.head.addEventListener('pointerup', end);
    p.head.addEventListener('pointercancel', end);
  },

  log(html, color, skipChat = false) {
    if (!skipChat && G.gameChat) {
      G.gameChat.addSystemLog(html, color);
    }
    if (this.logEl) {
      const d = el('div', '', html);
      if (color) d.style.color = color;
      this.logEl.appendChild(d);
      while (this.logEl.children.length > 6) this.logEl.firstChild.remove();
      setTimeout(() => d.remove(), 6200);
    }
  },

  logParty(from, text) {
    if (G.settings?.chatInSideLog === false) return;
    const formatted = `<span style="color:#60c8ff;font-weight:600">[Party] ${escapeHtml(from)}:</span> <span style="color:#e6f0fa">${escapeHtml(text)}</span>`;
    this.log(formatted, null, true);
  },

  logWhisper(from, text) {
    if (G.settings?.chatInSideLog === false) return;
    const formatted = `<span style="color:#ff80df;font-weight:600">[Whisper] ${escapeHtml(from)}:</span> <span style="color:#fae6f5">${escapeHtml(text)}</span>`;
    this.log(formatted, null, true);
  },
  centerMsg(title, sub = '', dur = 2.6) {
    this.msgEl.innerHTML = `${escapeHtml(title)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    const lu = this.hud && this.hud.lu;
    this.msgEl.classList.toggle('below', !!(lu && performance.now() < lu.end));
    this.msgEl.style.opacity = '1';
    clearTimeout(this.msgT);
    this.msgT = setTimeout(() => { this.msgEl.style.opacity = '0'; }, dur * 1000);
  },

  // ------------------------------------------------------------- dialogs
  dialog({ title, html, buttons = [], closable = true, cls = '' }) {
    const wrap = el('div', 'screen');
    wrap.style.background = 'rgba(0,0,0,.6)';
    wrap.style.zIndex = 40;
    const box = el('div', 'dialog-box ' + cls, `${title ? `<h2>${title}</h2>` : ''}<div class="dlg-body">${html || ''}</div>`);
    const row = el('div', 'row');
    row.style.justifyContent = 'center';
    row.style.marginTop = '10px';
    const close = () => { if (wrap.parentNode) { wrap.remove(); this.modalCount = Math.max(0, this.modalCount - 1); } };
    for (const b of buttons) {
      const btn = el('button', 'btn ' + (b.cls || ''), b.label);
      btn.onclick = () => { sfx('ui'); if (b.keepOpen) { b.fn && b.fn(close); return; } close(); b.fn && b.fn(); };
      row.appendChild(btn);
    }
    box.appendChild(row);
    wrap.appendChild(box);
    if (closable) wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
    this.screensEl.appendChild(wrap);
    this.modalCount++;
    return { close, box, wrap };
  },
  confirm(title, text, yes, yesLabel = 'Yes', noLabel = 'Cancel') {
    return this.dialog({ title, html: `<p>${text}</p>`, buttons: [{ label: noLabel }, { label: yesLabel, cls: 'red', fn: yes }] });
  },

  // ------------------------------------------------------------- tooltip
  showTip(html, x, y) {
    if (G.touch) return;
    this.tipEl.innerHTML = html;
    this.tipEl.classList.remove('hidden');
    this.placeTip(x, y);
  },
  placeTip(x, y) {
    const t = this.tipEl, r = t.getBoundingClientRect();
    let nx = x + 18, ny = y + 12;
    if (nx + r.width > innerWidth - 4) nx = x - r.width - 14;
    if (ny + r.height > innerHeight - 4) ny = innerHeight - r.height - 4;
    t.style.left = Math.max(4, nx) + 'px';
    t.style.top = Math.max(4, ny) + 'px';
  },
  hideTip() { this.tipEl.classList.add('hidden'); },
  /** Attach hover tooltip to an element. html may be a function. */
  tip(elm, html) {
    elm.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !drag.active) this.showTip(typeof html === 'function' ? html() : html, e.clientX, e.clientY); });
    elm.addEventListener('pointerleave', () => this.hideTip());
  },
};

// ================================================================ drag & drop
const drag = { active: false, data: null, src: null, sx: 0, sy: 0, pid: -1, pending: null, lastOver: null };

/**
 * Make an element draggable.
 * opts: { data: () => any, icon: () => url|canvas, onClick(e), onDouble(e), onRight(e), onDropWorld(data, x, y) }
 */
export function draggable(elm, opts) {
  elm.style.touchAction = 'none';
  elm.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    drag.pending = { elm, opts, x: e.clientX, y: e.clientY, pid: e.pointerId, t: performance.now() };
  });
  elm.addEventListener('contextmenu', (e) => { e.preventDefault(); if (opts.onRight) opts.onRight(e); });
}

/** Register a drop target. handler(data) returns true if accepted. canDrop(data) highlights. */
export function droppable(elm, handler, canDrop) {
  elm._drop = handler;
  elm._canDrop = canDrop || (() => true);
}

function findDrop(x, y) {
  let n = document.elementFromPoint(x, y);
  while (n && !n._drop) n = n.parentElement;
  return n;
}

let lastClick = { key: null, t: 0 };
function initDnD() {
  document.addEventListener('pointermove', (e) => {
    const p = drag.pending;
    if (p && !drag.active && e.pointerId === p.pid && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 7) {
      drag.active = true;
      drag.data = p.opts.data ? p.opts.data() : null;
      drag.opts = p.opts;
      if (!drag.data) { drag.active = false; drag.pending = null; return; }
      const g = UI.ghost;
      g.innerHTML = '';
      const icon = p.opts.icon ? p.opts.icon() : null;
      if (icon) {
        if (typeof icon === 'string') { const im = new Image(); im.src = icon; im.style.width = '100%'; g.appendChild(im); } else { g.appendChild(icon); }
      }
      g.classList.remove('hidden');
      UI.hideTip();
    }
    if (drag.active) {
      UI.ghost.style.left = e.clientX + 'px';
      UI.ghost.style.top = e.clientY + 'px';
      const over = findDrop(e.clientX, e.clientY);
      if (drag.lastOver && drag.lastOver !== over) drag.lastOver.classList.remove('drop-target');
      if (over && over._canDrop(drag.data)) over.classList.add('drop-target');
      drag.lastOver = over;
    }
  });
  const end = (e) => {
    const p = drag.pending;
    if (drag.active) {
      UI.ghost.classList.add('hidden');
      if (drag.lastOver) drag.lastOver.classList.remove('drop-target');
      const over = findDrop(e.clientX, e.clientY);
      let ok = false;
      if (over && over._canDrop(drag.data)) ok = over._drop(drag.data) !== false;
      else if (!over && drag.opts.onDropWorld && e.target && e.target.id === 'game') ok = drag.opts.onDropWorld(drag.data, e.clientX, e.clientY);
      if (ok) sfx('ui');
      drag.active = false; drag.data = null; drag.lastOver = null;
    } else if (p && e.pointerId === p.pid) {
      const now = performance.now();
      // compare a stable key: clicks often re-render the panel, replacing the element
      const key = p.opts.key !== undefined ? p.opts.key : p.elm;
      if (lastClick.key === key && now - lastClick.t < 350 && p.opts.onDouble) { lastClick = { key: null, t: 0 }; p.opts.onDouble(e); }
      else { lastClick = { key, t: now }; p.opts.onClick && p.opts.onClick(e); }
    }
    drag.pending = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', () => { drag.pending = null; drag.active = false; UI.ghost.classList.add('hidden'); });
}

export { el, escapeHtml };
