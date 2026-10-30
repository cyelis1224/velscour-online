// In-game HUD built on top of the provided skill-bar art.
import { G } from '../state.js';
import { el, fmt, fmtInt, fmtDmg, escapeHtml, clamp, drawFiltered } from '../core/util.js';
import { shownDmg, heroDmgLevel } from '../data/depth.js';
import { sfx } from '../core/audio.js';
import { A, potionIcon } from '../core/assets.js';
import { UI, $, droppable } from './ui.js';
import { skillIconURL, smiteIcon, madnessIcon } from './icons.js';
import { CLASSES } from '../data/classes.js';
import { SKILLS, effLevel, manaCost, rageCost, cooldown, CLASS_SKILLS } from '../data/skills.js';
import { xpToNext } from '../game/player.js';
import { drawMinimap } from '../game/render.js';
import { assign, SLOT_LABELS } from './skills.js';
import { elem } from '../gfx/vfx.js';
import { updateAutomapPartyRoster } from './partyroster.js';
import { pickTaunt } from '../data/taunts.js';

const TAUNT_KEY = 'velscour_taunts_v1'; // Velscour's level-up deck: the last mood and the lines already shown
import { Meter } from '../game/dpsmeter.js';
import { heroDamage } from '../game/autoplay.js';
import { madnessReady, madnessOn, unleashMadness } from '../game/mayhem.js';
import { smiteReady, smiteArmed, toggleSmite } from '../game/smite.js';
import { greedOf, hoardOf, hoardCap, greedMods, setGreed, GREED_MAX } from '../game/greed.js';
import { STANCES, Auto } from '../game/autoplay.js';
import { sealedCount, openNextSeal } from './sealed.js';
import { defianceText } from '../game/defiance.js';
import { capXp } from '../game/marks.js';

const POTIONS = ['hp', 'mp', 'rejuv', 'fury'];
// hud slot index -> bar index (skills) or potion kind: LMB, ` 1-9 0 - =, the potions, RMB
const SLOT_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 'hp', 'mp', 'rejuv', 'fury', 14];

/** [x, y, w, h] of a sprite's non-transparent pixels (monster sheets carry lots of padding), memoised per image. */
const boxes = new WeakMap();
const pct = (v, total) => (v / total) * 100 + '%';
function opaqueBox(img) {
  let b = boxes.get(img);
  if (b) return b;
  b = [0, 0, img.width, img.height];
  try {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] < 24) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 >= x0) b = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  } catch (e) { /* tainted or not ready: draw it whole */ }
  boxes.set(img, b);
  return b;
}

export const HUD = {
  slots: [],
  last: {},
  portraitOrbFrames: null,
  init() {
    UI.hud = this;
    const geo = A.hudGeo;
    // the bar's aspect (and how much room it takes at the bottom) comes from the art's geometry
    document.documentElement.style.setProperty('--hud-k', String(geo.h / geo.w));
    this.initFrames(geo);

    // Render special ability procedural icons onto their canvases
    const madIcon = $('#madness-btn .special-icon');
    if (madIcon) madIcon.getContext('2d').drawImage(madnessIcon(64), 0, 0);
    const smiteIconEl = $('#smite-btn .special-icon');
    if (smiteIconEl) smiteIconEl.getContext('2d').drawImage(smiteIcon(64), 0, 0);

    $('#madness-btn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); unleashMadness(); });
    $('#smite-btn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); toggleSmite(); });
    $('#sealed-btn').addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); openNextSeal(); });
    const toggleXpDetails = (e) => { e.stopPropagation(); $('#xp-text')?.classList.toggle('show-full'); };
    $('#xp-track')?.addEventListener('pointerdown', toggleXpDetails);
    $('#xp-text')?.addEventListener('pointerdown', toggleXpDetails);
    // the spectator's dials: auto-play's stance and the Greed lever (game/autoplay.js STANCES, game/greed.js)
    for (const b of document.querySelectorAll('#stance button')) b.addEventListener('click', (e) => { e.stopPropagation(); if (!G.char) return; G.char.stance = b.dataset.st; sfx('ui'); UI.log(`Auto-play stance: <b>${STANCES[b.dataset.st].name}</b>.`, '#8fe0ff'); });
    for (const b of document.querySelectorAll('#greed .gr-btn')) b.addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); setGreed(greedOf() + +b.dataset.d); });
    const pips = $('#greed-pips');
    for (let i = 0; i < GREED_MAX; i++) pips.appendChild(el('i'));
    UI.tip($('#stance'), () => `<b style="color:#8fe0ff">Auto-play stance</b>
      <div><b>Cautious</b>: kites anything that closes in, fights from the edge of its reach, drinks early, runs for town sooner, out-levels each depth before its guardian.</div>
      <div><b>Balanced</b>: the default: kites crowds and when hurt.</div>
      <div><b>Reckless</b>: stands in the thick of it, barely kites, drinks late, dives for the guardian under-levelled.</div>`);
    UI.tip($('#greed'), () => { const g = greedOf(), M = greedMods(g, hoardOf()); return `<b style="color:#ffc040">The Greed lever: ${g} / ${GREED_MAX}</b>
      <div>Each notch: +7% champion packs, +12% pack size, +8% monster traits, monsters +10% life and +6% damage. Pays +25% drops, +30% gold, +20% magic find.</div>
      <div>Every depth cleared with the lever up adds its level to the <b>Hoard</b>: +2% drops and gold a stack while greedy (drops up to 50 stacks). Its cap grows with your deepest depth (now ${hoardCap()}); stacks over 50 add gold only. A death loses the Hoard and drops the lever.</div>
      <div class="dim">Takes hold from the next depth. Now: ×${M.loot.toFixed(2)} drops, ×${M.gold.toFixed(2)} gold, +${M.mf}% magic find.</div>`; });
    // tap / click the target window to blow it up (about 2.25x, capped to the screen); again to shrink it back
    $('#target-box').addEventListener('click', (e) => { e.stopPropagation(); this.tbBig = !this.tbBig; this.last.tbCls = null; this.updateTarget(); });
    const wrap = $('#hud-slots');
    geo.slots.forEach((s, i) => {
      const d = el('div', 'slot');
      d.style.left = pct(s.x, geo.w); d.style.top = pct(s.y, geo.h);
      d.style.width = pct(s.w, geo.w); d.style.height = pct(s.h, geo.h);
      const map = SLOT_MAP[i];
      if (typeof map === 'string') { d.classList.add('potion-slot'); d.dataset.potion = map; }
      const icon = new Image(); icon.className = 'icon'; icon.draggable = false; icon.style.display = 'none';
      d.appendChild(icon);
      const nomana = el('div', 'nomana hidden');
      const cd = el('div', 'cd'); cd.style.height = '0%';
      const cdt = el('div', 'cdtext');
      const cnt = el('span', 'count');
      d.append(nomana, cd, cdt, cnt);
      const entry = { d, icon, cd, cdt, cnt, nomana, map, last: {} };
      this.slots.push(entry);
      if (typeof map === 'string') {
        d.title = { hp: 'Healing Potion (Z)', mp: 'Mana Potion (X)', rejuv: 'Rejuvenation Potion (C)', fury: 'Elixir of Fury (V)' }[map];
        d.addEventListener('pointerdown', (e) => { e.stopPropagation(); G.player && G.player.usePotion(map); });
      } else {
        d.title = `Skill slot ${SLOT_LABELS[map]}`;
        let pressT = 0, longT = null;
        d.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (e.pointerType !== 'mouse') {
            pressT = performance.now();
            longT = setTimeout(() => { longT = null; chooser(map); }, 550);
          }
        });
        d.addEventListener('pointerup', (e) => {
          if (e.pointerType === 'mouse') { if (e.button === 0) chooser(map); return; }
          if (longT) { clearTimeout(longT); longT = null; if (performance.now() - pressT < 550) G.controls && G.controls.useSlot(map); }
        });
        droppable(d, (data) => { assign(map, data.id); return true; }, (data) => data.type === 'skill');
      }
      UI.tip(d, () => slotTip(map));
      wrap.appendChild(d);
    });
    const xp = geo.xp;
    if (geo.barTop) $('#hud-rail').style.top = pct(geo.barTop, geo.h);
    const xt = $('#xp-track');
    xt.style.left = pct(xp.x, geo.w); xt.style.width = pct(xp.w, geo.w); xt.style.top = pct(xp.y, geo.h); xt.style.height = pct(xp.h, geo.h);
    for (const b of document.querySelectorAll('.hbtn')) {
      b.addEventListener('click', () => { sfx('ui'); G.game.hudAction(b.dataset.act); });
    }
    window.addEventListener('resize', () => this.layoutMobile());
    this.layoutMobile();
    $('#minimap').addEventListener('click', () => { G.showAutomap = !G.showAutomap; });
    $('#velscour-skull').addEventListener('click', () => { sfx('ui'); G.game.openVelscourContact(); });
    const spark = $('#hs-spark');
    spark.width = 150 * G.dpr; spark.height = 18 * G.dpr;
    UI.tip($('#hero-stats'), () => `<b style="color:#ffe2a0">Battle Ledger</b>
      <div><b>Attack</b>: the average hit of your main attack (left-click skill), crits included.</div>
      <div><b>DPS</b>: what your skill bar deals to one foe per second at your current stats: crits, attack and cast speed, cooldowns, mana and minions.</div>
      <div><b>Avg DPS · 30s</b>: the damage you and your minions really dealt over the last 30 seconds, divided by 30. The bars show each second.</div>
      <div><b>Player Deaths</b> and <b>Total Monsters Killed</b>: this hero's lifetime counts.</div>`);
    this.applyVisibilitySettings();
  },

  /** The minimap sits in the ring's open middle (a little oval); the ring overhangs it on every side. */
  initFrames(geo) {
    const r = geo.ring;
    if (!r) return;
    const h = r.hole, ring = $('#minimap-ring'), cvs = $('#minimap');
    $('#minimap-wrap').style.aspectRatio = `${h.rx} / ${h.ry}`;
    ring.style.width = (r.w / (2 * h.rx)) * 100 + '%';
    ring.style.left = -((h.cx - h.rx) / (2 * h.rx)) * 100 + '%';
    ring.style.top = -((h.cy - h.ry) / (2 * h.ry)) * 100 + '%';
    cvs.width = 200; cvs.height = Math.round((200 * h.ry) / h.rx);
  },

  /** Orb shading and numbers over the bar art's orbs, in % of the bar (portrait places its own in px, so redo this after a rotation). */
  placeOrbs(geo) {
    const [lo, mo] = geo.orbs;
    const place = (elx, o) => Object.assign(elx.style, { left: pct(o.cx - o.r, geo.w), top: pct(o.cy - o.r, geo.h), width: pct(o.r * 2, geo.w), height: pct(o.r * 2, geo.h) });
    const text = (elx, o) => Object.assign(elx.style, { left: pct(o.cx - 110, geo.w), width: pct(220, geo.w), top: pct(o.cy - 12, geo.h), fontSize: '' });
    place($('#life-cover'), lo); place($('#mana-cover'), mo);
    text($('#life-text'), lo); text($('#mana-text'), mo);
  },

  layoutMobile() {
    if (!A.hudGeo) return;
    const portrait = G.touch && innerHeight > innerWidth;
    // upright, the rift bar and the scenario objective join the left column's flow under the auto-play line (the
    // column's height changes with the area name, the target window and the stats, so a fixed place gets run into);
    // otherwise they stand after the boss bar, in the centre column (css: #boss-bar ~)
    const rift = $('#rift-bar'), obj = $('#sand-objective');
    if (portrait && rift.parentElement !== $('#hud-top-left')) $('#hud-top-left').append(rift, obj);
    else if (!portrait && rift.parentElement === $('#hud-top-left')) $('#boss-bar').after(rift, obj);
    const compact = G.touch && (portrait || !G.settings.mobileSkillBar);
    document.body.classList.toggle('compact-mobile-hud', compact);
    const hud = $('#hud'), img = $('#hud-img'), xp = $('#xp-track'), xpText = $('#xp-text'), rail = $('#hud-rail');
    hud.classList.toggle('compact-mobile', compact);
    img.src = compact ? 'assets/ui/hud-orbs.webp' : 'assets/ui/hud.webp';
    rail.classList.toggle('hidden', compact);
    const size = innerHeight > innerWidth ? 38 : 42;
    const bar = $('#hud-bar').getBoundingClientRect();
    if (compact) {
      img.style.display = 'none';
      if (!this.portraitOrbFrames) {
        const makeFrame = (name, src) => {
          const frame = new Image();
          frame.className = 'portrait-orb-frame mobile-orb-frame';
          frame.alt = '';
          frame.draggable = false;
          frame.src = src;
          frame.dataset.orb = name;
          const bar = $('#hud-bar');
          const ref = $('#life-cover');
          if (ref && ref.parentNode === bar) {
            bar.insertBefore(frame, ref);
          } else {
            bar.appendChild(frame);
          }
          return frame;
        };
        this.portraitOrbFrames = [
          makeFrame('life', 'assets/ui/hud-orb-life.webp'),
          makeFrame('mana', 'assets/ui/hud-orb-mana.webp'),
        ];
      }

      const potionSize = portrait ? 36 : 40;
      const potionGap = portrait ? 4 : 6;
      const potionRowW = potionSize * 4 + potionGap * 3;
      const x0 = (bar.width - potionRowW) / 2;

      const frameW = portrait ? 60 : 68;
      const scale = frameW / 270;
      const frameH = 296 * scale;
      const orbGap = portrait ? 4 : 8;

      const lifeFrameX = x0 - orbGap - frameW;
      const manaFrameX = x0 + potionRowW + orbGap;

      // Move potions up and position XP bar below them extending between the HP and MP orbs
      const xpTrackH = portrait ? 8 : 9;
      const bottomPadding = portrait ? 3 : 2; // lowered by 3px
      const xpTrackY = bar.height - xpTrackH - bottomPadding;
      const potionToXpGap = portrait ? 7 : 8; // keeps potions in place while giving xp bar 3px more separation
      const potionY = xpTrackY - potionToXpGap - potionSize;

      // Vertically center the orbs to bracket both the potions and the XP bar
      const clusterCenterY = (potionY + xpTrackY + xpTrackH) / 2;
      const frameY = clusterCenterY - 145.5 * scale;

      // Extend XP bar between HP and MP orbs (tucking slightly under their outer decorative bezels)
      const tuck = portrait ? 4 : 6;
      const xpLeft = lifeFrameX + frameW - tuck;
      const xpRight = manaFrameX + tuck;
      const xpWidth = xpRight - xpLeft;

      if (xp) {
        Object.assign(xp.style, {
          left: `${xpLeft}px`,
          top: `${xpTrackY}px`,
          width: `${xpWidth}px`,
          height: `${xpTrackH}px`,
          transform: 'none',
          display: 'block',
        });
      }

      if (xpText) {
        Object.assign(xpText.style, {
          left: `${xpLeft}px`,
          top: `${xpTrackY}px`,
          width: `${xpWidth}px`,
          height: `${xpTrackH}px`,
          transform: 'none',
          display: 'flex',
          fontSize: portrait ? '8px' : '9px',
        });
      }

      // Keep gauge-box (Rage, Madness, Smite meters) floating cleanly above the potions
      const gaugeBox = $('#gauge-box');
      if (gaugeBox) {
        gaugeBox.style.top = 'auto';
        gaugeBox.style.bottom = `${bar.height - potionY + 6}px`;
      }

      // Position #special-actions (Madness & Smite buttons): In portrait, Madness flanks HP orb on left, Smite flanks MP orb on right
      const madnessBtn = $('#madness-btn');
      const smiteBtn = $('#smite-btn');
      const spec = $('#special-actions');
      if (portrait) {
        const btnSize = 46;
        const hudBarBottom = window.innerHeight - bar.bottom;
        const btnBottom = hudBarBottom + (bar.height - frameY - frameH) + (frameH - btnSize) / 2;
        if (madnessBtn) {
          const mLeft = Math.max(4, lifeFrameX - btnSize - 6);
          Object.assign(madnessBtn.style, {
            position: 'absolute',
            left: `${mLeft}px`,
            right: 'auto',
            bottom: `${btnBottom}px`,
            top: 'auto',
            width: `${btnSize}px`,
            height: `${btnSize}px`,
            zIndex: '6',
          });
        }
        if (smiteBtn) {
          const sLeft = Math.min(bar.width - btnSize - 4, manaFrameX + frameW + 6);
          Object.assign(smiteBtn.style, {
            position: 'absolute',
            left: `${sLeft}px`,
            right: 'auto',
            bottom: `${btnBottom}px`,
            top: 'auto',
            width: `${btnSize}px`,
            height: `${btnSize}px`,
            zIndex: '6',
          });
        }
      } else {
        if (madnessBtn) madnessBtn.removeAttribute('style');
        if (smiteBtn) smiteBtn.removeAttribute('style');
        if (spec) {
          const hudBarRect = bar;
          const lifeScreenLeft = hudBarRect.left + lifeFrameX;
          const specW = 112;
          if (lifeScreenLeft > specW + 10) {
            const leftPos = Math.max(8, lifeScreenLeft - specW - 8);
            spec.style.left = `${leftPos}px`;
            spec.style.bottom = `${hudBarRect.height - potionY - potionSize}px`;
            spec.classList.remove('compact-portrait');
          } else {
            spec.style.left = '12px';
            spec.style.bottom = `${hudBarRect.height + 8}px`;
            spec.classList.add('compact-portrait');
          }
        }
      }

      this.portraitOrbFrames[0].style.cssText = `display:block;left:${lifeFrameX}px;top:${frameY}px;width:${frameW}px;height:${frameH}px;`;
      this.portraitOrbFrames[1].style.cssText = `display:block;left:${manaFrameX}px;top:${frameY}px;width:${frameW}px;height:${frameH}px;`;

      const [lifeGeo, manaGeo] = A.hudGeo.orbs;
      const orbPos = [
        { frameX: lifeFrameX, cx: lifeGeo.cx, cy: lifeGeo.cy, r: lifeGeo.r },
        { frameX: manaFrameX, cx: manaGeo.cx - 1730, cy: manaGeo.cy, r: manaGeo.r },
      ];
      const placeOrb = (cover, text, p) => {
        const cx = p.frameX + p.cx * scale;
        const cy = frameY + p.cy * scale;
        const diameter = p.r * 2 * scale;
        Object.assign(cover.style, { left: `${cx - diameter / 2}px`, top: `${cy - diameter / 2}px`, width: `${diameter}px`, height: `${diameter}px` });
        Object.assign(text.style, { left: `${cx - 42}px`, top: `${cy - 7}px`, width: '84px', fontSize: portrait ? '9.5px' : '10.5px' });
      };
      placeOrb($('#life-cover'), $('#life-text'), orbPos[0]);
      placeOrb($('#mana-cover'), $('#mana-text'), orbPos[1]);

      this.slots.forEach((s) => {
        const potion = typeof s.map === 'string';
        if (potion) s.icon.style.opacity = '1';
        s.d.classList.toggle('hidden', !potion);
        if (potion) {
          Object.assign(s.d.style, {
            left: `${x0 + POTIONS.indexOf(s.map) * (potionSize + potionGap)}px`,
            top: `${potionY}px`,
            width: `${potionSize}px`,
            height: `${potionSize}px`,
          });
        }
      });
    } else {
      img.style.display = '';
      img.src = 'assets/ui/hud.webp';
      if (this.portraitOrbFrames) {
        this.portraitOrbFrames.forEach((frame) => { frame.style.display = 'none'; });
      }
      this.placeOrbs(A.hudGeo);

      if (xp) xp.removeAttribute('style');
      if (xpText) xpText.removeAttribute('style');
      const gaugeBox = $('#gauge-box');
      if (gaugeBox) {
        gaugeBox.style.top = '';
        gaugeBox.style.bottom = '';
      }
      const spec = $('#special-actions');
      if (spec) spec.removeAttribute('style');
      const madnessBtn = $('#madness-btn');
      if (madnessBtn) madnessBtn.removeAttribute('style');
      const smiteBtn = $('#smite-btn');
      if (smiteBtn) smiteBtn.removeAttribute('style');

      this.slots.forEach((s) => {
        const potion = typeof s.map === 'string';
        if (potion) s.icon.style.opacity = '0';
        s.d.classList.remove('hidden');
        const g = A.hudGeo, m = SLOT_MAP.indexOf(s.map);
        const slot = g.slots[m];
        if (slot) {
          Object.assign(s.d.style, {
            left: `${(slot.x / g.w) * 100}%`,
            top: `${(slot.y / g.h) * 100}%`,
            width: `${(slot.w / g.w) * 100}%`,
            height: `${(slot.h / g.h) * 100}%`,
          });
        }
      });
    }
  },

  refreshStatic() {
    const c = G.char;
    if (!c) return;
    for (const s of this.slots) {
      if (typeof s.map === 'string') {
        if (s.last.icon !== s.map) { s.icon.src = potionIcon({ hp: 'red', mp: 'blue', rejuv: 'purple', fury: 'orange' }[s.map], 64).toDataURL(); s.icon.style.display = 'block'; s.last.icon = s.map; }
        s.icon.style.opacity = $('#hud').classList.contains('compact-mobile') ? '1' : '0';
        continue;
      }
      const id = c.bar[s.map];
      if (s.last.icon !== id) {
        s.last.icon = id;
        if (id && SKILLS[id]) { s.icon.src = skillIconURL(SKILLS[id]); s.icon.style.display = 'block'; } else s.icon.style.display = 'none';
      }
    }
    const sp = $('#sp-badge'), stb = $('#stat-badge');
    sp.textContent = c.skillPoints; sp.classList.toggle('hidden', !c.skillPoints);
    stb.textContent = c.statPoints; stb.classList.toggle('hidden', !c.statPoints);
    if (G.touchUI) G.touchUI.refresh();
  },

  update(dt) {
    const p = G.player, c = G.char, w = G.world;
    if (!p || !c) return;
    const set = (key, v, fn) => { if (this.last[key] !== v) { this.last[key] = v; fn(v); } };
    const lifeK = Math.round(clamp(1 - p.hp / p.maxHp, 0, 1) * 200) / 2;
    set('life', lifeK, (v) => { $('#life-cover .orb-empty').style.height = v + '%'; });
    set('mana', Math.round(clamp(1 - p.mana / p.maxMana, 0, 1) * 200) / 2, (v) => { $('#mana-cover .orb-empty').style.height = v + '%'; });
    set('rageClass', p.classId === 'barbarian', v => { $('#barbarian-rage').classList.toggle('hidden', !v); });
    if (p.classId === 'barbarian') {
      set('rageAmount', Math.round(p.rage), v => { $('#barbarian-rage-fill').style.width = v + '%'; $('#barbarian-rage-text').textContent = `Rage ${v}%`; });
    }
    set('lt', `${fmt(Math.max(0, p.hp))}/${fmt(p.maxHp)}`, (v) => { $('#life-text').textContent = v; });
    set('mt', `${fmt(p.mana)}/${fmt(p.maxMana)}`, (v) => { $('#mana-text').textContent = v; });
    const ready = madnessReady(), on = madnessOn();
    const madPct = on ? clamp((c.madT || 0) / 30, 0, 1) : clamp(c.madness || 0, 0, 1);
    const madK = Math.round(madPct * 1000) / 10;
    set('mad', madK, (v) => {
      const ringFill = $('#madness-btn .ring-fill');
      if (ringFill) ringFill.style.strokeDashoffset = (144.5 * (1 - v / 100)).toFixed(1);
      const fill = $('#mad-fill');
      if (fill) fill.style.width = v + '%';
    });
    set('madst', ready ? 'full' : on ? 'on' : '', (v) => {
      const btn = $('#madness-btn');
      if (btn) {
        btn.classList.toggle('hidden', v !== 'full');
        btn.classList.toggle('ready', v === 'full');
        btn.classList.toggle('active', v === 'on');
        btn.classList.toggle('charging', !v);
      }
      const madTrack = $('#mad-track');
      if (madTrack) {
        madTrack.classList.toggle('full', v === 'full');
        madTrack.classList.toggle('on', v === 'on');
      }
      const mad = $('#madness');
      if (mad) mad.className = v;
      if (v === 'full') { sfx('levelup', 0.4); UI.log('MADNESS is full: press the MADNESS button (G) to unleash it.', '#ff6090'); }
    });
    set('madt', on ? `${Math.ceil(c.madT)}s` : ready ? 'READY' : `${Math.floor(madPct * 100)}%`, (v) => {
      const st = $('#madness-btn .special-status');
      if (st) st.textContent = v;
      const madTxt = $('#mad-text');
      if (madTxt) madTxt.textContent = on ? `MADNESS ${Math.ceil(c.madT)}s` : ready ? 'Madness — ready' : `Madness ${Math.floor((c.madness || 0) * 100)}%`;
    });

    // SMITE (game/smite.js)
    const sReady = smiteReady(), sArmed = smiteArmed();
    const smitePct = clamp(c.smite || 0, 0, 1);
    const smiteK = Math.round(smitePct * 1000) / 10;
    set('smite', smiteK, (v) => {
      const ringFill = $('#smite-btn .ring-fill');
      if (ringFill) ringFill.style.strokeDashoffset = (144.5 * (1 - v / 100)).toFixed(1);
      const fill = $('#smite-fill');
      if (fill) fill.style.width = v + '%';
    });
    set('smitest', sArmed ? 'armed' : sReady ? 'full' : '', (v) => {
      const btn = $('#smite-btn');
      if (btn) {
        btn.classList.toggle('hidden', !v);
        btn.classList.toggle('ready', v === 'full');
        btn.classList.toggle('armed', v === 'armed');
        btn.classList.toggle('charging', !v);
      }
      const smiteTrack = $('#smite-track');
      if (smiteTrack) {
        smiteTrack.classList.toggle('full', v === 'full');
        smiteTrack.classList.toggle('armed', v === 'armed');
      }
    });
    set('smitet', sArmed ? 'AIM' : sReady ? 'READY' : `${Math.floor(smitePct * 100)}%`, (v) => {
      const st = $('#smite-btn .special-status');
      if (st) st.textContent = v;
      const smiteTxt = $('#smite-text');
      if (smiteTxt) smiteTxt.textContent = sArmed ? (G.touch ? 'Smite — tap the ground' : 'Smite — click the ground') : sReady ? 'Smite — ready' : `Smite ${Math.floor((c.smite || 0) * 100)}%`;
    });
    if (G.canvas) G.canvas.classList.toggle('aiming', sArmed);
    // sealed treasures waiting in the bag (ui/sealed.js)
    const nSeal = sealedCount(c);
    set('sealed', nSeal, (v) => { $('#sealed-btn').classList.toggle('hidden', !v); $('#sealed-text').textContent = `${v} SEALED`; });
    set('sealwait', !!(nSeal && Auto.on && Auto.sealWaiting && w && w.kind === 'town'), (v) => { $('#sealed-btn').classList.toggle('urgent', v); });
    // stance (shown while auto-play is on) and the Greed lever
    set('stance', G.autoplayOn ? (c.stance || 'balanced') : '', (v) => {
      $('#stance').classList.toggle('hidden', !v);
      for (const b of document.querySelectorAll('#stance button')) b.classList.toggle('on', b.dataset.st === v);
    });
    const g = greedOf(c), hd = hoardOf(c);
    set('greed', `${g}|${hd}|${w ? w.greed || 0 : 0}`, () => {
      document.querySelectorAll('#greed-pips i').forEach((p, i) => p.classList.toggle('on', i < g));
      $('#greed').classList.toggle('on', g > 0);
      $('#hoard').textContent = hd ? `Hoard ${hd}` : '';
    });
    const mk = capXp(c), need = mk ? mk.need : xpToNext(c.level), xpNow = mk ? mk.xp : c.xp;   // at the cap: towards the next Infernal Mark
    set('xp', Math.round((xpNow / need) * 1000) / 10, (v) => { $('#xp-fill').style.width = v + '%'; });
    set('xpmk', !!mk, (v) => { $('#xp-fill').classList.toggle('mk-xp', v); });
    const clsName = (CLASSES[c.classId] && CLASSES[c.classId].name) || (p && p.cls && p.cls.name) || 'Hero';
    const xpPct = Math.floor(clamp((xpNow / (need || 1)), 0, 1) * 100);
    const shortText = mk ? `Infernal Mark (${xpPct}%)` : `Level ${c.level} ${clsName}`;
    const fullText = mk
      ? `Level ${c.level} ${clsName} · ${fmtInt(xpNow)} / ${fmtInt(need)} XP (${xpPct}% to the next Infernal Mark)`
      : `Level ${c.level} ${clsName} · ${fmtInt(xpNow)} / ${fmtInt(need)} XP (${xpPct}%)`;
    set('xpt', `${shortText}|${fullText}`, () => {
      const elText = $('#xp-text');
      if (elText) {
        elText.innerHTML = `<span class="xp-text-short">${escapeHtml(shortText)}</span><span class="xp-text-full">${escapeHtml(fullText)}</span>`;
      }
    });
    for (const s of this.slots) {
      if (typeof s.map === 'string') {
        const n = c.potions[s.map] || 0;
        if (s.last.n !== n) { s.last.n = n; s.cnt.textContent = n; s.d.style.opacity = n ? '1' : '0.45'; }
        continue;
      }
      const id = c.bar[s.map];
      const sk = id && SKILLS[id];
      let cdK = 0, cdTxt = '', nm = false;
      if (sk) {
        const rem = p.cooldowns[id] || 0;
        const tot = cooldown(sk) * (1 - p.st.cdr / 100);
        if (rem > 0 && tot > 0) { cdK = Math.round((rem / tot) * 100); cdTxt = rem >= 1 ? Math.ceil(rem) + '' : ''; }
        const L = effLevel(p, sk);
        nm = L > 0 && (p.mana < manaCost(sk, L) || p.rage < rageCost(sk) ||
          (sk.classId === 'barbarian' && sk.kind === 'whirl' && p.rage < 10));
      }
      if (s.last.cd !== cdK) { s.last.cd = cdK; s.cd.style.height = cdK + '%'; }
      if (s.last.cdt !== cdTxt) { s.last.cdt = cdTxt; s.cdt.textContent = cdTxt; }
      if (s.last.nm !== nm) { s.last.nm = nm; s.nomana.classList.toggle('hidden', !nm); }
    }
    // boss bar
    const boss = w && w.boss && !w.boss.dead && w.boss.awake ? w.boss : null;
    set('boss', boss ? boss.id : 0, () => {
      $('#boss-bar').classList.toggle('hidden', !boss);
      if (boss) $('#boss-name').textContent = boss.name;
      // a raid boss's phase changes, as marks on the bar
      const tr = $('#boss-track');
      tr.querySelectorAll('.boss-mark').forEach((e) => e.remove());
      if (boss && boss.raid) for (const k of boss.raid.marks) { const d = el('div', 'boss-mark'); d.style.left = k * 100 + '%'; tr.appendChild(d); }
    });
    if (boss) set('bossHp', Math.round((boss.hp / boss.maxHp) * 500) / 5, (v) => { $('#boss-fill').style.width = v + '%'; });
    set('bossSub', boss && boss.raid ? boss.raid.label() : boss && boss.vel ? boss.vel.label() : '', (v) => { $('#boss-sub').textContent = v; });
    set('bossWard', !!(boss && boss.ward < 1), (v) => { $('#boss-bar').classList.toggle('warded', v); });
    // the Abyssal Rift's clock and quota (game/rifts.js)
    const R = w && w.rift;
    set('rift', R ? `${R.tier}|${Math.ceil(R.left)}|${R.pct}|${R.guardian ? 1 : 0}|${R.done ? 1 : 0}|${R.failed ? 1 : 0}|${boss ? 1 : 0}` : '', (v) => {
      $('#rift-bar').classList.toggle('hidden', !R);
      if (!R) return;
      const left = Math.ceil(R.left);
      $('#rift-tier').textContent = `Tier ${R.tier}`;
      $('#rift-clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      $('#rift-fill').style.width = (R.done ? 100 : R.pct) + '%';
      $('#rift-pct').textContent = R.done ? 'closed' : R.failed ? 'collapsed' : R.guardian ? 'the Guardian' : R.pct + '%';
      $('#rift-bar').classList.toggle('urgent', !R.done && !R.failed && left <= 60);
      $('#rift-bar').classList.toggle('boss', !!boss);
      $('#rift-bar').classList.toggle('guard', !!R.guardian && !R.done && !R.failed);
    });
    const forest = w?.biome?.id === 'dark_forest';
    const breach = !!w?.breach;
    const sand = (w?.biome?.id === 'sea_of_sand' || forest || breach) && w.overworldScenario?.hud ? w.overworldScenario.hud : null;
    set('sandHud', sand ? `${sand.title}|${sand.beat}|${sand.total}|${sand.progress}|${sand.timer}` : '', (v) => {
      const panel=$('#sand-objective');
      panel.classList.toggle('hidden',!sand);
      if(sand){
        $('#sand-title').textContent=sand.title;
        $('#sand-beat').textContent=forest?`Glades ${sand.beat}/${sand.total}`:breach?`Shrines ${sand.beat}/${sand.total}`:`Area ${sand.beat}/${sand.total}`;
        $('#sand-progress').textContent=sand.progress;
        $('#sand-timer').textContent=sand.timer?`Time ${sand.timer}`:'';
      }
    });
    // buffs
    this.buffT = (this.buffT || 0) - dt;
    if (this.buffT <= 0) {
      this.buffT = 0.25;
      const row = $('#buff-row');
      // Defiance stacks and the town's blessing ride on the save (game/defiance.js), shown as the first two
      const extra = [];
      if (c.defiance) extra.push({ name: `Defiance ${c.defiance.n}: ${defianceText(c.defiance.n)} until you clear Depth ${c.defiance.block + 4}`, color: '#ff5a2a', n: c.defiance.n });
      if (c.blessing) extra.push({ name: `${c.blessing.name}: ${c.blessing.left} more depth${c.blessing.left > 1 ? 's' : ''}`, color: '#ffe080', n: c.blessing.left });
      // minions out, per summoning skill (settings: minionCounts)
      const mins = new Map();
      if (G.settings.minionCounts !== false && w) for (const m of w.creatures) if (m.summon && !m.dead && m.owner === p && m.skillId && SKILLS[m.skillId]) mins.set(m.skillId, (mins.get(m.skillId) || 0) + 1);
      const key = extra.map((x) => x.name).join('|') + '|' + [...mins].join('|') + '|' + p.buffs.map((b) => b.id + ':' + Math.ceil(b.t)).join('|');
      if (key !== this.last.buffs) {
        this.last.buffs = key;
        row.innerHTML = '';
        for (const x of extra) {
          const d = el('div', 'buff');
          d.style.background = `radial-gradient(circle, ${x.color}, #200800)`;
          d.title = x.name;
          d.appendChild(el('span', '', x.n));
          row.appendChild(d);
        }
        for (const [id, n] of mins) {
          const d = el('div', 'buff minion'), sk = SKILLS[id];
          const im = new Image(); im.src = skillIconURL(sk); im.style.width = '100%'; d.appendChild(im);
          d.title = `${sk.name}: ${n} out`;
          d.appendChild(el('span', '', n));
          row.appendChild(d);
        }
        for (const b of p.buffs) {
          if (b.hidden) continue;
          const d = el('div', 'buff');
          const sk = SKILLS[b.id];
          if (sk) { const im = new Image(); im.src = skillIconURL(sk); im.style.width = '100%'; d.appendChild(im); }
          else { d.style.background = elem(b.el).glow; }
          d.title = b.name;
          if (!b.aura) d.appendChild(el('span', '', Math.ceil(b.t)));
          row.appendChild(d);
        }
      }
      // the message log grows up from the skill bar: keep it below the buff row (phones in landscape are short);
      // measured only when the row's size or the layout changed, since reading rects forces a layout mid frame
      // (below the whole left column: the target window and the auto-play line stand under the buff row)
      const lg = $('#log'), lk = row.children.length + '|' + innerWidth + 'x' + innerHeight + '|' + document.body.className + '|' + $('#target-box').className + '|' + $('#auto-status').className;
      const lr = lg && this.last.logFit !== lk && !document.body.classList.contains('portrait') && lg.getBoundingClientRect();
      if (lr && lr.width) {   // (not while the HUD is hidden: nothing has a size then)
        this.last.logFit = lk;
        const room = Math.floor(lr.bottom - $('#hud-top-left').getBoundingClientRect().bottom - 6);
        const v = Math.max(0, room) + 'px';
        if (lg.style.maxHeight !== v) lg.style.maxHeight = v;
      }
    }
    this.updateStats(dt);
    drawMinimap(w, dt, $('#minimap'));
    updateAutomapPartyRoster();
  },

  /** The stats plaque: level, attack, sheet DPS and the real 30 s average, refreshed every 0.1 s. */
  updateStats(dt) {
    const p = G.player, c = G.char;
    if (Meter.char !== c) { Meter.char = c; Meter.reset(); this.sheetT = 0; }
    const stats = $('#hero-stats');
    if (stats) stats.classList.toggle('hidden', G.settings.showHeroStats === false);
    if (G.settings.showHeroStats === false) {
      this.updateTarget();
      return;
    }
    this.statT = (this.statT || 0) - dt;
    if (this.statT > 0) return;
    this.statT = 0.1;
    this.sheetT = (this.sheetT || 0) - 0.1;
    if (this.sheetT <= 0) { this.sheetT = 0.5; this.sheet = heroDamage(p); }
    const set = (key, v, fn) => { if (this.last[key] !== v) { this.last[key] = v; fn(v); } };
    set('hsl', c.level, (v) => { $('#hs-lvl').textContent = v; });
    const dl = heroDmgLevel(c);
    set('hsa', fmtDmg(shownDmg(this.sheet.atk, dl)), (v) => { $('#hs-atk').textContent = v; });
    set('hsd', fmtDmg(shownDmg(this.sheet.dps, dl)), (v) => { $('#hs-dps').textContent = v; });
    set('hsv', fmtDmg(Meter.avg()), (v) => { $('#hs-avg').textContent = v; });
    set('hsk', fmtInt(c.kills || 0), (v) => { $('#hs-kills').textContent = v; });
    set('hsx', fmtInt(c.deaths || 0), (v) => { $('#hs-deaths').textContent = v; });
    // a bar per second for the last 30 s, with the average as a gold line
    const cv = $('#hs-spark'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const secs = Meter.perSecond(30), avg = Meter.avg(), top = Math.max(1, avg * 1.6, ...secs);
    g.clearRect(0, 0, W, H);
    const bw = W / 30;
    for (let i = 0; i < 30; i++) {
      const h = Math.round((secs[i] / top) * (H - 2));
      if (!h) continue;
      g.fillStyle = i === 29 ? '#ff7a30' : i > 24 ? '#c8200e' : '#7a1008';
      g.fillRect(Math.round(i * bw), H - h, Math.max(1, Math.round(bw) - 1), h);
    }
    if (avg > 0) { g.fillStyle = '#ffd860'; g.fillRect(0, Math.round(H - 1 - (avg / top) * (H - 2)), W, Math.max(1, G.dpr)); }
    this.updateTarget();
  },

  /** The target window: the hovered / attacked / last-hit monster's picture and name; it stays up, greyed, once slain. */
  updateTarget() {
    const p = G.player, w = G.world, box = $('#target-box');
    if (!box) return;
    box.classList.toggle('no-pic', G.settings.showTargetSprite === false);
    if (G.settings.showTargetBox === false) {
      box.classList.add('hidden');
      return;
    }
    if (this.tbWorld !== w) { this.tbWorld = w; this.tb = null; if (G.lastHit && !w.creatures.includes(G.lastHit)) G.lastHit = null; }
    const live = (m) => m && !m.dead && m.team === 'enemy' && m.targetable !== false;
    const at = p.attackTarget && p.attackTarget.target;
    const cur = live(G.hover) ? G.hover : live(at) ? at : live(G.lastHit) ? G.lastHit : null;
    if (cur) this.tb = cur;
    const t = this.tb, set = (key, v, fn) => { if (this.last[key] !== v) { this.last[key] = v; fn(v); } };
    set('tbOn', !!t, (v) => box.classList.toggle('hidden', !v));
    if (!t) return;
    const dead = !!t.dead || t.hp <= 0;
    const noPic = G.settings.showTargetSprite === false;
    set('tbCls', (dead ? 'dead ' : '') + (this.tbBig ? 'big ' : '') + (noPic ? 'no-pic ' : '') + 'r-' + (t.rank || 'normal'), (v) => { box.className = v; });
    set('tbName', t.name || '???', (v) => { $('#tb-name').textContent = v; box.title = v; });
    set('tbHp', dead ? 0 : Math.ceil(clamp(t.hp / t.maxHp, 0, 1) * 100), (v) => { $('#tb-fill').style.width = v + '%'; });
    const rank = { champion: 'Champion', unique: 'Unique', boss: 'Boss' }[t.rank] || '';
    set('tbSub', dead ? 'Slain' : [t.level ? 'Level ' + t.level : '', rank].filter(Boolean).join(' · '), (v) => { $('#tb-sub').textContent = v; });
    if (dead || noPic) return; // keep the last living picture or skip if sprite disabled
    const img = t.spriteImage && t.spriteImage();
    if (!img || !img.width || (this.tbImg === img && this.tbFor === t)) return;
    this.tbImg = img; this.tbFor = t;
    const cv = $('#tb-pic'), g = cv.getContext('2d'), S = cv.width, pad = Math.round(S * 0.05);
    const [bx, by, bw, bh] = opaqueBox(img);
    const k = Math.min((S - pad * 2) / bw, (S - pad * 2) / bh);
    const dw = bw * k, dh = bh * k;
    g.clearRect(0, 0, S, S);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    drawFiltered(g, 'brightness(1.35) contrast(1.1)', img, bx, by, bw, bh, (S - dw) / 2, S - pad - dh, dw, dh); // dungeon art is dark; lift it so it reads small
  },

  /** The level-up banner: a dark vignette, the title and new level bleeding in from blur, then Velscour's two lines. */
  levelUp(level, sound) {
    const box = $('#levelup'), num = $('#lu-num');
    num.textContent = level;
    const now = performance.now();
    if (this.lu && now < this.lu.end) { // more levels while it's up: punch the number again
      num.classList.remove('punch'); void num.offsetWidth; num.classList.add('punch');
      return;
    }
    if (this.lu) this.lu.timers.forEach(clearTimeout);
    const at = sound ? sound.voiceAt : 0.55, dur = 5;
    const lu = this.lu = { end: now + (at + dur + 0.6) * 1000, timers: [] };
    const later = (s, fn) => lu.timers.push(setTimeout(fn, s * 1000));
    let deck = {};
    try { deck = JSON.parse(localStorage.getItem(TAUNT_KEY) || '{}') || {}; } catch (e) { /* a fresh deck */ }
    const t = pickTaunt(G.char, deck);
    try { localStorage.setItem(TAUNT_KEY, JSON.stringify(deck)); } catch (e) { /* ignore */ }
    box.classList.remove('hidden', 'play', 'out'); num.classList.remove('punch');
    $('#center-msg')?.classList.add('below'); // a showing area title steps out of the banner's way
    box.dataset.mood = t.mood;
    $('#lu-l1').textContent = t.l1; $('#lu-l2').textContent = t.l2;
    // restart the animation on the next frame, not with a forced synchronous layout (offsetWidth) mid game frame
    requestAnimationFrame(() => requestAnimationFrame(() => { if (this.lu === lu) box.classList.add('play'); }));
    later(at + dur + 0.1, () => box.classList.add('out'));
    later(at + dur + 0.9, () => box.classList.add('hidden'));
  },

  applyVisibilitySettings() {
    const stats = $('#hero-stats');
    if (stats) stats.classList.toggle('hidden', G.settings.showHeroStats === false);
    const box = $('#target-box');
    if (box) {
      box.classList.toggle('no-pic', G.settings.showTargetSprite === false);
      if (G.settings.showTargetBox === false) {
        box.classList.add('hidden');
      }
    }
  },

  setArea(name, sub) { $('#area-name').textContent = name; $('#area-sub').textContent = sub || ''; },
  show(v) { $('#hud').classList.toggle('hidden', !v); if (v) { this.layoutMobile(); this.applyVisibilitySettings(); } },
};

function slotTip(map) {
  if (typeof map === 'string') return `<b>${{ hp: 'Healing Potion', mp: 'Mana Potion', rejuv: 'Rejuvenation Potion', fury: 'Elixir of Fury' }[map]}</b><div class="dim">Key ${{ hp: 'Z', mp: 'X', rejuv: 'C', fury: 'V' }[map]} · Buy more from the Alchemist</div>`;
  const id = G.char.bar[map];
  if (!id) return `<b>Empty slot [${SLOT_LABELS[map]}]</b><div class="dim">Click to choose a skill, or drag one here from the Skill Book (B).</div>`;
  const sk = SKILLS[id];
  return `<b style="color:#ffe2a0">${escapeHtml(sk.name)}</b> <span class="dim">[${SLOT_LABELS[map]}]</span><div class="dim">Click to change</div>`;
}

/** Pick a learned skill for a bar slot. */
export function chooser(slotIdx) {
  const c = G.char;
  const learned = CLASS_SKILLS[c.classId].filter((s) => (c.skills[s.id] || 0) > 0);
  const html = learned.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-height:55vh;overflow:auto">${learned.map((s) => `<button class="btn small" data-id="${s.id}" style="display:flex;align-items:center;gap:6px;padding:4px 8px"><img src="${skillIconURL(s)}" style="width:32px;height:32px">${escapeHtml(s.name)}</button>`).join('')}</div>`
    : '<p>You have not learned any skills yet. Open the Skill Tree (K).</p>';
  const d = UI.dialog({ title: `Assign slot ${SLOT_LABELS[slotIdx]}`, html, buttons: [{ label: 'Clear slot', fn: () => { c.bar[slotIdx] = null; UI.refresh(); } }, { label: 'Close' }] });
  d.box.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => { d.close(); assign(slotIdx, b.dataset.id); }; });
}
