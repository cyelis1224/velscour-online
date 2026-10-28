// Remote player entity representing other online players in the world
import { Creature, RIM } from '../game/creature.js';
import { CLASSES } from '../data/classes.js';
import { isoX, isoY, camera } from '../core/view.js';
import { classSprite } from '../core/assets.js';
import { sfx } from '../core/audio.js';
import { floatText, sparkle, burst, addEffect, Ring } from '../gfx/vfx.js';
import { loadGearArt, heroLook, heroFrame, savedGearPreview } from '../core/gearart.js';
import { RemoteSummon } from './remotesummon.js';
import { G } from '../state.js';
import { sigOf, sigUpdate, sigCast, SIGNATURES } from '../game/signature.js';
import { effects } from '../gfx/vfx.js';

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
    this.chatBubble = null;
    this.chatTimer = 0;
    this.chatAge = 0;

    this.gearArt = null;
    this._gearKey = null;
    this.summons = new Map();

    if (this.gear) {
      this.updateGear(this.gear);
    }
  }

  async updateGear(gear) {
    if (!gear) return;
    this.gear = gear;
    try {
      await loadGearArt(this.classId);
      const img = heroLook(this.classId, gear.body, gear.head);
      if (img) {
        const f = heroFrame(this.classId, this.spriteH);
        if (f) {
          this.gearArt = { img, frame: 0, cw: img.width, ch: img.height, ax: f.ax, ay: f.ay, k: f.k };
        }
      }
    } catch (e) {
      console.warn('RemotePlayer gear art failed:', e);
    }
  }

  artFrame() {
    return this.gearArt || null;
  }

  updateFromNetwork(state) {
    if (typeof state.x === 'number') this.targetX = state.x;
    if (typeof state.y === 'number') this.targetY = state.y;
    if (typeof state.vx === 'number') this.vx = state.vx;
    if (typeof state.vy === 'number') this.vy = state.vy;
    if (typeof state.facing === 'number') this.facing = state.facing;
    if (typeof state.flip === 'boolean') this.flip = state.flip;
    if (typeof state.moving === 'boolean') this.moving = state.moving;
    if (typeof state.animT === 'number') this.animT = state.animT;
    if (typeof state.hp === 'number') this.hp = state.hp;
    if (typeof state.maxHp === 'number') this.maxHp = state.maxHp;
    if (typeof state.mana === 'number') this.mana = state.mana;
    if (typeof state.maxMana === 'number') this.maxMana = state.maxMana;
    if (state.worldKind) this.worldKind = state.worldKind;
    if (typeof state.depth === 'number') this.depth = state.depth;

    if (state.gear) {
      const g = state.gear;
      const bKey = g.body ? (g.body.base || '') + (g.body.look ? g.body.look.join(',') : '') : '';
      const hKey = g.head ? (g.head.base || '') + (g.head.look ? g.head.look.join(',') : '') : '';
      const key = bKey + '|' + hKey;
      if (this._gearKey !== key) {
        this._gearKey = key;
        this.updateGear(g);
      }
    }
    if (state.classId && state.classId !== this.classId) {
      this.destroySig();
      this.classId = state.classId;
      this.cls = CLASSES[this.classId] || CLASSES.paladin;
      this.sig = null;
      this._img = null;
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

    if (this.chatTimer > 0) {
      this.chatTimer -= dt;
      this.chatAge = (this.chatAge || 0) + dt;
      if (this.chatTimer <= 0) {
        this.chatBubble = null;
        this.chatTimer = 0;
        this.chatAge = 0;
      }
    }

    // Smooth movement interpolation toward target
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 5) {
      // Teleport if too far
      this.x = this.targetX;
      this.y = this.targetY;
    } else if (dist > 0.02) {
      const step = Math.min(1, dt * 14);
      this.x += dx * step;
      this.y += dy * step;
      this.moving = true;
    } else {
      this.moving = false;
    }

    if (this.world) {
      sigUpdate(this, dt);
    }
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

  onCastSkill(skillId, tx, ty) {
    sfx('swing');
    sparkle(this.x, this.y, 16, this.cls.color || '#ffd860', 10, 0.4);
    if (tx !== undefined && ty !== undefined) {
      burst(tx, ty, 12, this.cls.color || '#ff8030', 16, 2);
    }
    if (this.sig) {
      const cid = this.classId === 'deathknight' ? 'death_knight' : this.classId;
      const M = SIGNATURES[cid] || SIGNATURES[this.classId];
      if (M && M.cast) {
        M.cast(this, this.sig.s, { id: skillId, kind: 'melee' }, 1, tx, ty);
      }
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
