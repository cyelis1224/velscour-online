// Remote summon entity representing other players' active minions, totems, familiars, etc.
import { Creature } from '../game/creature.js';
import { KINDS } from '../game/slimecourt.js';
import { SUMMONS } from '../data/summons.js';
import { petCorpse } from '../core/petart.js';
import { burst } from '../gfx/vfx.js';

const TINT = { red: '#ff4a30', gold: '#ffc83a', green: '#5ee05a', blue: '#4aa8ff', purple: '#b060ff', pink: '#ff70c0' };

export class RemoteSummon extends Creature {
  constructor(info, owner) {
    const def = SUMMONS[info.key] || {};
    super({
      team: 'player',
      r: info.r || (info.px && info.px > 3.5 ? 0.5 : 0.3),
      speed: info.speed || def.spd || 3,
    });
    this.summonId = info.id;
    this.owner = owner;
    this.isRemoteSummon = true;
    this.summon = true;
    this.summonKey = info.key;
    this.name = info.name || def.name || 'Minion';
    this.x = info.x;
    this.y = info.y;
    this.targetX = info.x;
    this.targetY = info.y;
    this.facing = info.facing || 0;
    this.flip = !!info.flip;
    this.moving = !!info.moving;
    this.animT = info.animT || 0;
    this.attackAnimT = info.attackAnimT || 0;
    this.lunge = info.lunge || 0;
    this.scale = info.scale || 1;
    this.fly = info.fly !== undefined ? !!info.fly : !!def.fly;
    this.static = info.static !== undefined ? !!info.static : !!def.static;
    this.alpha = info.alpha !== undefined ? info.alpha : (def.alpha !== undefined ? def.alpha : 1);
    this.aura = info.aura || def.aura || null;
    this.summonEl = info.summonEl || def.el || 'phys';
    this.hp = info.hp || 10;
    this.maxHp = info.maxHp || 10;

    // Visual attributes
    this.art = info.art || (def.look && def.look.art) || null;
    if (Array.isArray(this.art)) this.art = this.art[0];
    this.artH = info.artH || (def.look && def.look.h) || null;
    this.artRef = info.artRef || (def.look && def.look.ref) || null;
    this.swap = info.swap || (def.look && def.look.swap) || null;
    this.sprite = info.sprite || (def.look && def.look.sprite) || 'skeleton';
    this.pal = info.pal || (def.look && def.look.pal) || null;
    this.px = info.px || (def.look && def.look.px) || 2.3;
    this.classId = info.classId || (def.look && def.look.cls) || null;
    if (this.classId === true && owner) this.classId = owner.classId;

    if (info.slime || def.slime) {
      this.attachRemoteSlime(info.slime || { kind: def.slime, h: def.look?.h, mini: !!def.mini });
    }
  }

  attachRemoteSlime(s) {
    const kind = s.kind;
    const K = KINDS[kind] || { hue: 'blue', color: '#4aa8ff' };
    const color = K.color || TINT[K.hue] || '#4aa8ff';
    this.slime = {
      kind,
      K: { ...K, color },
      set: s.set || `sl_${K.hue || 'blue'}`,
      mini: !!s.mini,
      h: s.h || 28,
      anim: s.anim || 'idle',
      animT: s.animT || 0,
      fps: 1,
      lock: 0,
      z: s.z || 0,
      sqx: 0,
      sqy: 0,
      sqv: 0,
      alpha: 1,
      tilt: s.tilt || 0,
      glowT: 0,
      act: null,
      hopPh: 0,
      lag: 0,
      cds: {},
      emote: null,
      ride: null,
      rage: 0,
      rageT: 0,
      hits: 0,
      kids: 0,
    };
    this.hop = false;
  }

  updateFromNetwork(info) {
    this.targetX = info.x;
    this.targetY = info.y;
    if (typeof info.vx === 'number') this.vx = info.vx;
    if (typeof info.vy === 'number') this.vy = info.vy;
    if (typeof info.facing === 'number') this.facing = info.facing;
    if (typeof info.flip === 'boolean') this.flip = info.flip;
    if (typeof info.moving === 'boolean') this.moving = info.moving;
    if (typeof info.animT === 'number') this.animT = info.animT;
    if (typeof info.attackAnimT === 'number') this.attackAnimT = info.attackAnimT;
    if (typeof info.lunge === 'number') this.lunge = info.lunge;
    if (typeof info.hp === 'number') this.hp = info.hp;
    if (typeof info.maxHp === 'number') this.maxHp = info.maxHp;
    if (typeof info.scale === 'number') this.scale = info.scale;
    if (info.aura !== undefined) this.aura = info.aura;

    if (info.slime && this.slime) {
      if (info.slime.anim) this.slime.anim = info.slime.anim;
      if (typeof info.slime.animT === 'number') this.slime.animT = info.slime.animT;
      if (typeof info.slime.z === 'number') this.slime.z = info.slime.z;
      if (typeof info.slime.tilt === 'number') this.slime.tilt = info.slime.tilt;
    } else if (info.slime && !this.slime) {
      this.attachRemoteSlime(info.slime);
    }
  }

  update(dt) {
    this.animT = (this.animT || 0) + dt;
    this.spawnT = (this.spawnT || 0) + dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    if (this.attackAnimT > 0) this.attackAnimT = Math.max(0, this.attackAnimT - dt);
    if (this.lunge > 0) this.lunge = Math.max(0, this.lunge - dt * 3);
    if (this.slime) {
      this.slime.animT = (this.slime.animT || 0) + dt;
    }

    if (this.targetX !== undefined && this.targetY !== undefined) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 8) {
        this.x = this.targetX;
        this.y = this.targetY;
      } else if (dist > 0.05) {
        const lerpFactor = Math.min(1, dt * 15);
        this.x += dx * lerpFactor;
        this.y += dy * lerpFactor;
      } else {
        this.x = this.targetX;
        this.y = this.targetY;
      }
    }
  }
}
