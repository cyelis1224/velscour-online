import { Creature, RIM } from '../game/creature.js';
import { CLASSES } from '../data/classes.js';
import { isoX, isoY, camera } from '../core/view.js';
import { classSprite, A } from '../core/assets.js';
import { sfx } from '../core/audio.js';
import { floatText, sparkle, burst, addEffect, Ring } from '../gfx/vfx.js';
import { loadGearArt, heroLook, heroFrame, savedGearPreview, gearFxOf, finishOf } from '../core/gearart.js';
import { heldHero, drawHeldLayer, loadHeld } from '../gfx/heldart.js';
import { drawGearFx, updateGearFx } from '../gfx/gearfx.js';
import { fxColor } from '../data/gear.js';
import { gearSignature } from './network.js';
import { RemoteSummon } from './remotesummon.js';
import { G } from '../state.js';
import { sigOf, sigUpdate, sigCast, SIGNATURES } from '../game/signature.js';
import { bladeOnBack } from '../game/sigs/deathknight.js';
import { effects } from '../gfx/vfx.js';
import { castSkill } from '../game/skillrun.js';
import { castArtFx } from '../gfx/artfx.js';
import { SKILLS } from '../data/skills.js';
import { angleTo } from '../core/util.js';
import { bardScore, bardCompose, bardUpdate, bardRetune, ensureInstrumentsLoaded } from '../game/bard.js';

export class RemotePlayer extends Creature {
  constructor(info) {
    super({ team: 'player', r: 0.35, speed: 4.2 });
    this.id = info.id;
    this.name = info.name || 'Hero';
    this.classId = info.classId || 'paladin';
    this.cls = CLASSES[this.classId] || CLASSES.paladin;
    this.level = info.level || 1;
    this.title = info.title || 'Hero';
    this.isRemotePlayer = true;
    this.isPlayer = false;
    this.gear = info.gear || null;
    this.spriteH = 60;
    this.hp = 100;
    this.maxHp = 100;
    this.mana = 50;
    this.maxMana = 50;

    this.targetX = this.x;
    this.targetY = this.y;
    this.targetZ = 0;
    this.chatBubble = null;
    this.chatTimer = 0;
    this.chatAge = 0;

    this.gearArt = null;
    this._gearKey = null;
    this.summons = new Map();

    this.st = {
      areaPct: 0,
      extraProj: 0,
      projSpeed: 0,
      pierce: 0,
      chainPlus: 0,
      splitChance: 0,
      goldFind: 0,
      status: null,
      legendary: {},
      procs: [],
    };
    this.char = {
      level: this.level,
      classId: this.classId,
      rage: 100,
      skills: {},
      equip: this.gear || {},
      tabs: [],
      tabAt: 0,
    };

    if (info.bardTabs) {
      this.setBardTabs(info.bardTabs.tabs, info.bardTabs.tabAt);
    }

    this.updateGear(this.gear || {});
  }

  skillDamage(sk, L = 1) {
    return [0, 0];
  }
  skillLevel(sk) {
    const id = typeof sk === 'string' ? sk : sk?.id;
    return (this.char?.skills && id && this.char.skills[id]) || 1;
  }
  heal(amt, silent = false) {
    this.hp = Math.min(this.maxHp, this.hp + (amt || 0));
  }
  setBardTabs(tabs, tabAt = 0) {
    if (!this.char) this.char = {};
    this.char.tabs = (tabs || []).map(t => t ? ({
      uid: t.uid || ('tab_' + Math.random().toString(36).slice(2, 8)),
      type: 'sheet',
      title: t.title || 'Untitled Song',
      text: t.text || '',
      bpm: typeof t.bpm === 'number' ? t.bpm : null,
      inked: true,
    }) : null);
    this.char.tabAt = tabAt || 0;
    ensureInstrumentsLoaded();
    if (this.score) {
      this.score.fresh = true;
      if (!this.score.notes.length && !this.score.pending) {
        this.score.song = null;
        bardRetune(this, true);
      }
    }
  }
  mastery(sk) {
    return 1;
  }
  augFor(sk) {
    return null;
  }
  speedMul() {
    return 1;
  }

  async updateGear(gear) {
    this.gear = gear || {};
    if (!this.char) this.char = {};
    this.char.equip = this.gear;
    this._gearKey = gearSignature(this.gear);
    try {
      await Promise.all([
        loadGearArt(this.classId, false),
        loadHeld(this.classId, { equip: this.gear }),
      ]);
    } catch (e) {
      console.warn('RemotePlayer gear art failed:', e);
    }
  }

  artFrame() {
    const eq = this.gear || {};
    const base = heroLook(this.classId, eq.body, eq.head);
    if (!base) return null;
    const held = G.settings.heldGear !== false ? heldHero(base, this.classId, eq) : null;
    const img = held ? held.img : base;
    this.heldArt = { held, base };
    const f = heroFrame(this.classId, this.spriteH);
    return f ? { img, frame: 0, cw: img.width, ch: img.height, ax: f.ax, ay: f.ay, k: f.k } : null;
  }

  gearFx() {
    if (G.settings.gearFx === false) return null;
    const b = this.gear?.body, fx = b && gearFxOf(b, this.classId);
    return fx ? { fx, col: fxColor(fx, finishOf(b, this.classId), b.rarity || 0) } : null;
  }

  drawArtLayer(ctx, layer, art) {
    if (!art || typeof art !== 'object') return;
    try {
      const g = this.gearFx();
      if (g) drawGearFx(ctx, this, g.fx, g.col, layer, art);
      if (layer === 'front' && this.heldArt && G.settings.heldGear !== false) {
        drawHeldLayer(ctx, this, this.heldArt.held, this.heldArt.base, art);
      }
      if (layer === 'back' && this.classId === 'death_knight') {
        bladeOnBack(ctx, this, art, this.heldArt?.base);
      }
    } catch (e) {
      console.warn('RemotePlayer drawArtLayer error:', e);
    }
  }

  updateFromNetwork(state) {
    if (typeof state.x === 'number') { this.targetX = state.x; this.extrapolateT = 0; }
    if (typeof state.y === 'number') { this.targetY = state.y; this.extrapolateT = 0; }
    if (typeof state.z === 'number') this.targetZ = state.z;
    if (typeof state.vx === 'number') this.vx = state.vx;
    if (typeof state.vy === 'number') this.vy = state.vy;
    if (typeof state.facing === 'number') this.facing = state.facing;
    if (typeof state.flip === 'boolean') this.flip = state.flip;
    if (typeof state.moving === 'boolean') this.netMoving = state.moving;
    if (typeof state.animT === 'number') this.animT = state.animT;
    if (typeof state.hp === 'number') this.hp = state.hp;
    if (typeof state.maxHp === 'number') this.maxHp = state.maxHp;
    if (typeof state.mana === 'number') this.mana = state.mana;
    if (typeof state.maxMana === 'number') this.maxMana = state.maxMana;
    if (typeof state.level === 'number') {
      this.level = state.level;
      if (this.char) this.char.level = state.level;
    }
    if (state.worldKind) this.worldKind = state.worldKind;
    if (typeof state.depth === 'number') this.depth = state.depth;

    if (state.classId && state.classId !== this.classId) {
      this.destroySig();
      if (this._scoreFx) {
        const idx = effects.indexOf(this._scoreFx);
        if (idx !== -1) effects.splice(idx, 1);
        this._scoreFx = null;
      }
      this.score = null;
      this.classId = state.classId;
      if (this.char) this.char.classId = state.classId;
      this.cls = CLASSES[this.classId] || CLASSES.paladin;
      this.sig = null;
      this._img = null;
      this._gearKey = null;
    }

    if (state.gear) {
      const key = gearSignature(state.gear);
      if (this._gearKey !== key) {
        this._gearKey = key;
        this.updateGear(state.gear);
      }
    }
  }

  showChat(text) {
    this.chatBubble = text;
    this.chatTimer = 4.5;
    this.chatAge = 0;
  }

  update(dt) {
    this.animT = (this.animT || 0) + dt;
    this.spawnT = (this.spawnT || 0) + dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);

    if (this.classId === 'bard' && this.world && this.world.kind !== 'town') {
      try {
        bardUpdate(this, dt);
      } catch (e) {
        console.warn('RemotePlayer bardUpdate error:', e);
      }
    }

    if (this.chatTimer > 0) {
      this.chatTimer -= dt;
      this.chatAge = (this.chatAge || 0) + dt;
      if (this.chatTimer <= 0) {
        this.chatBubble = null;
        this.chatTimer = 0;
        this.chatAge = 0;
      }
    }

    // Smooth movement interpolation toward target unless actively channelled (e.g. Leap, Whirl, Dash)
    if (this.channel) {
      this.moving = true;
    } else {
      // Predictive dead-reckoning extrapolation between network packets (capped at 80ms)
      if (this.netMoving && (this.vx || this.vy) && (this.extrapolateT = (this.extrapolateT || 0) + dt) < 0.08) {
        this.targetX += this.vx * dt;
        this.targetY += this.vy * dt;
      }

      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 5) {
        // Teleport if too far
        this.x = this.targetX;
        this.y = this.targetY;
        this.moving = false;
      } else if (dist > 0.015) {
        // Adaptive multi-tier rate: fast catch-up when behind, smooth glide close-up
        const rate = dist > 1.2 ? 22 : dist > 0.35 ? 18 : 14;
        const step = Math.min(1, dt * rate);
        this.x += dx * step;
        this.y += dy * step;
        this.moving = true;
      } else {
        this.x = this.targetX;
        this.y = this.targetY;
        this.moving = !!this.netMoving;
      }

      if (typeof this.targetZ === 'number') {
        const dz = this.targetZ - this.z;
        if (Math.abs(dz) > 0.5) {
          this.z += dz * Math.min(1, dt * 20);
        } else {
          this.z = this.targetZ;
        }
      }
    }

    if (this.world) {
      sigUpdate(this, dt);
    }
    const gfx = this.gearFx();
    if (gfx) updateGearFx(this, gfx.fx, gfx.col, dt);
  }

  spriteImage() {
    if (this.customArt) return this.customArt;
    if (!this._img) {
      try {
        this._img = classSprite(this.classId, this.spriteH * 3, null);
      } catch (e) {}
    }
    return this._img || A.classes[this.classId] || A.classes.paladin;
  }

  rimColor() {
    return '#5a9aff'; // Friendly party blue rim
  }

  draw(ctx) {
    super.draw(ctx);
    const px = isoX(this.x, this.y);
    const py = isoY(this.x, this.y);
    const z = this.z;

    // Overhead Nameplate & Health Bar
    this.drawRemoteOverhead(ctx, px, py - 68 - z);
  }

  drawRemoteOverhead(ctx, x, y) {
    ctx.save();
    // Name + Level
    ctx.font = 'bold 12px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000';
    const label = `${this.name} (Lv ${this.level} ${this.cls.name})`;
    ctx.fillText(label, x + 1, y + 1);
    ctx.fillStyle = '#7ab8ff';
    ctx.fillText(label, x, y);

    // Mini Health Bar
    const barW = 38, barH = 4;
    const bx = x - barW / 2, by = y + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    const pct = Math.max(0, Math.min(1, this.hp / (this.maxHp || 1)));
    ctx.fillStyle = '#2de055';
    ctx.fillRect(bx, by, barW * pct, barH);
    ctx.restore();
  }

  drawChatBubble(ctx, x, y, text) {
    ctx.save();
    ctx.font = '12px "Alegreya Sans", sans-serif';
    const metrics = ctx.measureText(text);
    const w = Math.min(220, metrics.width + 16);
    const h = 22;
    const bx = x - w / 2, by = y - h;

    ctx.fillStyle = 'rgba(10, 8, 6, 0.92)';
    ctx.strokeStyle = '#d8b26a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, w, h, 4) : ctx.rect(bx, by, w, h);
    ctx.fill();
    ctx.stroke();

    // Small pointer triangle
    ctx.beginPath();
    ctx.moveTo(x - 5, by + h);
    ctx.lineTo(x + 5, by + h);
    ctx.lineTo(x, by + h + 5);
    ctx.closePath();
    ctx.fillStyle = '#d8b26a';
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, by + h / 2);
    ctx.restore();
  }

  onCastSkill(skillId, tx, ty, targetId = null, level = 1, extra = null) {
    const sk = SKILLS[skillId];
    if (tx !== undefined && ty !== undefined) {
      this.aim = [tx, ty];
      this.face(angleTo(this.x, this.y, tx, ty));
    }
    if (!sk) {
      sfx('swing');
      sparkle(this.x, this.y, 16, this.cls.color || '#ffd860', 10, 0.4);
      if (tx !== undefined && ty !== undefined) {
        burst(tx, ty, 12, this.cls.color || '#ff8030', 16, 2);
      }
      return;
    }

    this.lastEl = sk.el;

    // Play skill art FX animation strip
    try {
      castArtFx(this, sk, tx, ty);
    } catch (e) {
      console.warn('RemotePlayer castArtFx error:', e);
    }

    // Play class signature cast
    try {
      sigCast(this, sk, level || 1, tx, ty);
    } catch (e) {}

    // Bard notation & audio composition replication
    if (this.classId === 'bard') {
      try {
        const sc = bardScore(this);
        if (extra) {
          if (extra.tabAt != null && this.char) this.char.tabAt = extra.tabAt;
          if (extra.keyId && !sc.song) sc.keyId = extra.keyId;
          if (extra.mel != null && extra.mel >= 0 && !sc.song) sc.mel = extra.mel;
          if (extra.songI != null && sc.song) sc.song.i = extra.songI;
        }
        bardCompose(this, sk, level || 1);
      } catch (e) {
        console.warn('RemotePlayer bardCompose error:', e);
      }
    }

    // Execute skill hazard/visual replication
    const w = this.world || G.world;
    if (sk.kind !== 'summon' && w) {
      try {
        castSkill(this, sk, level || 1, tx, ty, { remote: true });
      } catch (e) {
        console.warn('RemotePlayer castSkill error:', e);
      }
    } else {
      sfx('swing');
    }
  }

  syncSummons(summonsList) {
    if (!this.summons) this.summons = new Map();
    const activeIds = new Set();
    const w = G.world;
    if (!w) return;

    for (const s of summonsList) {
      if (!s || !s.id) continue;
      activeIds.add(s.id);
      let rs = this.summons.get(s.id);
      if (!rs) {
        rs = new RemoteSummon(s, this);
        w.add(rs);
        this.summons.set(s.id, rs);
        burst(rs.x, rs.y, 12, '#60d0ff', 6, 1.5);
      } else {
        rs.updateFromNetwork(s);
      }
    }

    for (const [id, rs] of this.summons.entries()) {
      if (!activeIds.has(id)) {
        rs.dead = true;
        burst(rs.x, rs.y, 12, '#60d0ff', 6, 1.5);
        if (w.creatures) {
          const idx = w.creatures.indexOf(rs);
          if (idx !== -1) w.creatures.splice(idx, 1);
        }
        this.summons.delete(id);
      }
    }
  }

  destroySig() {
    if (this._sigTop) {
      const idx = effects.indexOf(this._sigTop);
      if (idx !== -1) effects.splice(idx, 1);
      this._sigTop = null;
    }
    if (this._sigGround) {
      const idx = effects.indexOf(this._sigGround);
      if (idx !== -1) effects.splice(idx, 1);
      this._sigGround = null;
    }
    if (this._sigBack && this.world && this.world.hazards) {
      const idx = this.world.hazards.indexOf(this._sigBack);
      if (idx !== -1) this.world.hazards.splice(idx, 1);
      this._sigBack = null;
    }
  }

  destroy() {
    this.dead = true;
    this.destroySummons();
    this.destroySig();
    if (this._scoreFx) {
      const idx = effects.indexOf(this._scoreFx);
      if (idx !== -1) effects.splice(idx, 1);
      this._scoreFx = null;
    }
    if (this.score && this.score.play) {
      this.score.play.flush && this.score.play.flush();
    }
    const w = this.world || G.world;
    if (w && w.creatures) {
      const idx = w.creatures.indexOf(this);
      if (idx !== -1) w.creatures.splice(idx, 1);
    }
  }

  destroySummons() {
    if (!this.summons) return;
    const w = G.world;
    for (const rs of this.summons.values()) {
      rs.dead = true;
      if (w && w.creatures) {
        const idx = w.creatures.indexOf(rs);
        if (idx !== -1) w.creatures.splice(idx, 1);
      }
    }
    this.summons.clear();
  }
}
