// Mobile touch controls: virtual joystick (handled in input.js) + skill button cluster.
import { G } from '../state.js';
import { el } from '../core/util.js';
import { $ } from './ui.js';
import { skillIcon } from './icons.js';
import { SKILLS, cooldown, manaCost, rageCost, effLevel } from '../data/skills.js';
import { SLOT_LABELS, RMB } from '../data/bar.js';
import { chooser } from './hud.js';

// Landscape uses the original radial skill cluster; portrait shows all 14 skill
// slots as a compact bottom tray, with LMB kept as the large attack control.
const POS = [[1, 180], [1, 225], [1, 270], [2, 198], [2, 213.4], [2, 228.8], [2, 244.2], [2, 259.6], [2, 275]];
const PAGES = [[RMB, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 12, 13, 1]]; // RMB 1-8 | 9 0 - = `
const FLIP = [1.5, 186]; // between the arcs, left of RMB

export const TouchUI = {
  btns: [],
  page: 0,
  init() {
    G.touchUI = this;
    const root = $('#touch-buttons');
    for (let bar = 0; bar < 15; bar++) {
      const pos = POS[bar - 1] || [0, 0];
      const [ring, ang] = bar === 0 ? [0, 0] : pos;
      const b = el('div', 'tbtn' + (bar === 0 ? ' main' : ' skill'));
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      const cd = el('div', 'cd'); cd.style.height = '0%';
      const k = el('div', 'k');
      b.append(cv, cd, k);
      const t = { b, cv, cd, k, bar, ring, ang, last: {} };
      let holdT = null, longT = null, fired = false;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        clearInterval(holdT); clearTimeout(longT);   // a second finger on the button: the first one's repeat must not run on forever
        b.classList.add('pressed');
        fired = false;
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        const bar = t.bar;
        const id = G.char && G.char.bar[bar];
        if (!id) { longT = setTimeout(() => chooser(bar), 10); return; }
        G.controls.useSlot(bar); fired = true;
        holdT = setInterval(() => G.controls.useSlot(bar), 120);
        longT = setTimeout(() => { clearInterval(holdT); holdT = null; if (!fired) chooser(bar); }, 1200);
      });
      const up = () => { b.classList.remove('pressed'); clearInterval(holdT); clearTimeout(longT); holdT = null; longT = null; };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); chooser(t.bar); });
      root.appendChild(b);
      this.btns.push(t);
    }
    const f = this.flipBtn = el('div', 'tbtn flip', '&#8644;<span>1/2</span>');
    f.title = 'More skills';
    f.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.setPage(1 - this.page); });
    root.appendChild(f);
    this.madnessBtn = $('#madness-btn');
    this.madnessHome = $('#gauge-buttons') || $('#madness');
    this.madnessBtn.classList.add('touch-madness');
    this.smiteBtn = $('#smite-btn'); // SMITE (game/smite.js) moves with it in portrait
    this.smiteBtn.classList.add('touch-smite');
    window.addEventListener('resize', () => this.layout());
    this.setPage(0);
  },
  /** Select a landscape skill page; portrait keeps every slot visible. */
  setPage(n) {
    this.page = n;
    this.layout();
    this.refresh();
  },
  layout() {
    const W = innerWidth, H = innerHeight;
    const portrait = H > W;
    const s = Math.max(0.72, Math.min(1.15, Math.min(W, H) / 400));
    const main = 72 * s, small = 44 * s;
    const cx = W - 14 - main / 2;
    const cy = H - 14 - main / 2 - (H < 420 ? 0 : 10);
    const radii = [0, 92 * s, 170 * s];
    const rad = (ring) => (ring % 1 ? (radii[Math.floor(ring)] + radii[Math.ceil(ring)]) / 2 : radii[ring]);
    const root = $('#touch-buttons');
    root.style.width = W + 'px'; root.style.height = H + 'px';
    root.style.left = '0'; root.style.top = '0'; root.style.right = 'auto'; root.style.bottom = 'auto';
    root.classList.toggle('portrait-grid', portrait);
    const put = (b, ring, ang, size) => {
      const r = rad(ring), a = (ang * Math.PI) / 180;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      Object.assign(b.style, { width: size + 'px', height: size + 'px', left: x - size / 2 + 'px', top: y - size / 2 + 'px' });
    };
    if (portrait) {
      if (this.madnessBtn.parentElement !== root) root.appendChild(this.madnessBtn);
      if (this.smiteBtn.parentElement !== root) root.appendChild(this.smiteBtn);
      const tile = Math.min(44, Math.max(32, (W - 40 - 24) / 7)), gap = 4;
      const trayH = tile * 2 + gap;
      const safeBottom = parseFloat(getComputedStyle(document.body).getPropertyValue('--portrait-safe-bottom')) || 0;
      // sit above the corner orb frames (hud.js layoutMobile sizes them the same way)
      const orbTop = $('#hud-bar').getBoundingClientRect().bottom - Math.max(74, Math.min(98, W * .24)) * 296 / 270;
      const trayTop = Math.max(H * .34, Math.min(H - trayH - safeBottom - 12, orbTop - trayH - 6));
      const mainSize = Math.min(92, Math.max(72, W * .22));
      const logHeight = Math.min(H * .13, 100);
      const logTop = Math.max(H * .34, trayTop - mainSize - logHeight - 32);
      Object.assign($('#log').style, { left: '8px', right: '8px', top: `${logTop}px`, bottom: 'auto', height: `${logHeight}px`, maxHeight: 'none' });
      const trayW = tile * 7 + gap * 6, x0 = (W - trayW) / 2;
      this.btns.forEach((t, i) => {
        if (t.bar !== i) { t.last = {}; t.b.style.filter = ''; t.cd.style.height = '0%'; }
        t.bar = i; t.k.textContent = i === 0 ? 'ATK' : SLOT_LABELS[i];
        t.b.classList.remove('hidden');
        if (i === 0) {
          const size = mainSize, x = W - size / 2 - 16, y = trayTop - size / 2 - 12;
          Object.assign(t.b.style, { width: size + 'px', height: size + 'px', left: x - size / 2 + 'px', top: y - size / 2 + 'px' });
        } else {
          const n = i - 1, col = n % 7, row = Math.floor(n / 7);
          Object.assign(t.b.style, { width: tile + 'px', height: tile + 'px', left: (x0 + col * (tile + gap)) + 'px', top: (trayTop + row * (tile + gap)) + 'px' });
        }
        t.b.classList.toggle('portrait-tile', i > 0);
      });
      const madnessW = Math.min(W * .36, 132);
      Object.assign(this.madnessBtn.style, { boxSizing: 'border-box', width: madnessW + 'px', height: '36px', left: ((W - madnessW) / 2) + 'px', top: (trayTop - 46) + 'px', transform: 'none' });
      Object.assign(this.smiteBtn.style, { boxSizing: 'border-box', width: madnessW + 'px', height: '36px', left: ((W - madnessW) / 2) + 'px', top: (trayTop - 90) + 'px', transform: 'none' });
    } else {
      Object.assign($('#log').style, { left: '', right: '', top: '', bottom: '', height: '', maxHeight: '' });
      if (this.madnessBtn.parentElement !== this.madnessHome) this.madnessHome.insertBefore(this.madnessBtn, this.madnessHome.firstChild);
      if (this.smiteBtn.parentElement !== this.madnessHome) this.madnessBtn.after(this.smiteBtn);
      this.btns.forEach((t, i) => {
        if (i === 0) { t.bar = 0; t.k.textContent = 'ATK'; t.b.classList.remove('hidden'); put(t.b, 0, 0, main); return; }
        const bar = i <= POS.length ? PAGES[this.page][i - 1] : undefined;
        t.b.classList.toggle('hidden', bar === undefined);
        t.b.classList.remove('portrait-tile');
        if (bar === undefined) return;
        if (t.bar !== bar) { t.last = {}; t.b.style.filter = ''; t.cd.style.height = '0%'; }
        t.bar = bar; t.k.textContent = SLOT_LABELS[bar];
        put(t.b, t.ring, t.ang, small);
      });
      if (this.flipBtn) {
        this.flipBtn.classList.remove('hidden');
        this.flipBtn.querySelector('span').textContent = `${this.page + 1}/${PAGES.length}`;
        this.flipBtn.classList.toggle('on', this.page > 0);
        put(this.flipBtn, FLIP[0], FLIP[1], 32 * s);
      }
      Object.assign(this.madnessBtn.style, { width: '', height: '', left: '', top: '', transform: '' });
      Object.assign(this.smiteBtn.style, { width: '', height: '', left: '', top: '', transform: '' });
    }
    this.flipBtn?.classList.toggle('hidden', portrait);
    this.refresh();
  },
  refresh() {
    for (const t of this.btns) {
      const id = G.char ? G.char.bar[t.bar] : null;
      if (t.last.id === id) continue;
      t.last.id = id;
      const x = t.cv.getContext('2d');
      x.clearRect(0, 0, 64, 64);
      if (id && SKILLS[id]) x.drawImage(skillIcon(SKILLS[id], 64), 0, 0);
      t.b.style.opacity = id ? '1' : '0.45';
    }
  },
  update() {
    const p = G.player;
    if (!p) return;
    for (const t of this.btns) {
      const id = G.char.bar[t.bar];
      const sk = id && SKILLS[id];
      let k = 0;
      if (sk) {
        const rem = p.cooldowns[id] || 0, tot = cooldown(sk) * (1 - p.st.cdr / 100);
        if (rem > 0 && tot > 0) k = Math.round((rem / tot) * 100);
        const L = effLevel(p, sk);
        const nm = L > 0 && (p.mana < manaCost(sk, L) || p.rage < rageCost(sk) ||
          (sk.classId === 'barbarian' && sk.kind === 'whirl' && p.rage < 10));
        if (t.last.nm !== nm) { t.last.nm = nm; t.b.style.filter = nm ? 'saturate(0.3) brightness(0.7)' : ''; }
      }
      if (t.last.k !== k) { t.last.k = k; t.cd.style.height = k + '%'; }
    }
  },
  show(v) { $('#touch-ui').classList.toggle('hidden', !v); if (v) { this.layout(); this.refresh(); } },
};
