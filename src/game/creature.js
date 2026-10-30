// Base class for every living thing: player, monsters, summons.
import { G } from '../state.js';
import { isoX, isoY, screenDirToTile } from '../core/view.js';
import { TAU, rand, chance, clamp, makeCanvas, drawFiltered } from '../core/util.js';
import { spawn, glowSprite, ELEM } from '../gfx/vfx.js';
import { pixelSprite } from '../gfx/pixelart.js';
import { classSprite } from '../core/assets.js';
import { enemyImage } from '../core/enemyart.js';
import { petAnimation, petTintImage } from '../core/petart.js';
import { drawRuneWeapon } from '../gfx/runeweapon.js';
import { drawSlime } from '../gfx/slimeart.js';
import { TURRET3D, drawTurret3D } from '../gfx/gunner3d.js';

let UID = 0;

// frozen / charmed tints: the CSS filter runs once into a cached copy of the image, not on every draw (a per-draw
// ctx.filter is a slow software path, in Safari above all); without ctx.filter support it is put through by hand
const FREEZE = 'hue-rotate(180deg) saturate(1.6) brightness(1.2)', CHARM = 'hue-rotate(90deg)';
const tints = { [FREEZE]: new WeakMap(), [CHARM]: new WeakMap() };
function tinted(img, f) {
  if (!f) return img;
  let c = tints[f].get(img);
  if (!c) {
    c = makeCanvas(img.width, img.height);
    const x = c.getContext('2d');
    drawFiltered(x, f, img, 0, 0);
    c._art = img._art;
    tints[f].set(img, c);
  }
  return c;
}

// A 1px screen-space rim round every monster, coloured like the target window's name (normal red, champion blue,
// unique gold, boss orange), green round the hero's summons and pale gold round the hero; in town and on the roads
// townsfolk get violet and vendors (shops, crafters) cyan (drawNpc in render.js). Each sprite frame's rim
// (its silhouette stamped 8 ways, in source px) is baked once per colour and thickness: one extra draw per creature.
export const RIM = { normal: '#e0302a', champion: '#5a9aff', unique: '#ffc040', boss: '#ff7a1a', ally: '#48e868', hero: '#ffe9a8', folk: '#c08cff', vendor: '#3ee0e0' };
const RIM_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
// One LRU over every sprite's rims (img id + frame/colour/thickness -> padded rim canvas): per-image maps kept every
// rim of every look ever seen, ~100 MB after a few levels, more than iOS lets a page hold in canvases. The see-through
// layer's rings (ringCanvas) share it, so it holds a frame's rim and ring for a screen of monsters and pets.
const rims = new Map(), rimIds = new WeakMap(), RIM_MAX = 384;
let rimSeq = 0, rimT = null, rimO = 0, scratch = null;
function rimKey(img, sx, sy, sw, sh, col, o) {
  let id = rimIds.get(img);
  if (!id) rimIds.set(img, (id = ++rimSeq));
  const key = id + ':' + sx + ',' + sy + ',' + sw + ',' + sh + col + o;
  const c = rims.get(key);
  if (c) { rims.delete(key); rims.set(key, c); return c; }
  if (rims.size >= RIM_MAX) rims.delete(rims.keys().next().value);
  return key;
}
// the sprite's silhouette stamped 8 ways o source px out, filled with col (x: a canvas padded p round the sprite)
function stamp(x, img, sx, sy, sw, sh, p, o, col) {
  x.globalCompositeOperation = 'source-over';
  for (const [ux, uy] of RIM_DIRS) x.drawImage(img, sx, sy, sw, sh, p + ux * o, p + uy * o, sw, sh);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, sw + p * 2, sh + p * 2);
}
function rimCanvas(img, sx, sy, sw, sh, col, o) {
  const key = rimKey(img, sx, sy, sw, sh, col, o);
  if (typeof key !== 'string') return key;
  const p = Math.ceil(o) + 1, c = makeCanvas(sw + p * 2, sh + p * 2);
  stamp(c.getContext('2d'), img, sx, sy, sw, sh, p, o, col);
  c._pad = p;
  rims.set(key, c);
  return c;
}
/** The see-through ring: col 1.4x the rim's thickness o in a dark halo out to 2.4x (both on its 2^(n/4) steps), the
 * body cut out of it, so the layer draws it in one go. */
function ringCanvas(img, sx, sy, sw, sh, col, o) {
  const key = rimKey(img, sx, sy, sw, sh, 'ring' + col, o);
  if (typeof key !== 'string') return key;
  const dO = Math.min(32, o * 2.378), cO = Math.min(32, o * 1.414), p = Math.ceil(dO) + 1, W = sw + p * 2, H = sh + p * 2;
  const c = makeCanvas(W, H), x = c.getContext('2d');
  stamp(x, img, sx, sy, sw, sh, p, dO, 'rgba(0,0,0,0.8)');
  if (!scratch || scratch.width < W || scratch.height < H) scratch = makeCanvas(Math.max(W, scratch ? scratch.width : 0), Math.max(H, scratch ? scratch.height : 0));
  const s = scratch.getContext('2d');
  s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, W, H);
  stamp(s, img, sx, sy, sw, sh, p, cO, col);
  x.globalCompositeOperation = 'source-over'; x.drawImage(scratch, 0, 0, W, H, 0, 0, W, H);
  x.globalCompositeOperation = 'destination-out'; x.drawImage(img, sx, sy, sw, sh, p, p, sw, sh);
  c._pad = p;
  rims.set(key, c);
  return c;
}

/** A new level starts the rim cache over (rims are cheap GPU bakes; the last level's would just sit there). */
export function clearRims() { rims.clear(); }

/** A col rim under a sprite: drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) args in the sprite's current transform.
 * grow: how far a spawning creature has grown in (0..1); the rim keeps its full-size thickness meanwhile (it shrinks
 * with the sprite): a thickness per growth step baked ~20 rims per spawn, some padded 33 px. under false: only work out
 * the thickness and transform (rimO, rimT), for a see-through ring that stands in for it. */
export function drawRim(ctx, col, img, sx, sy, sw, sh, dx, dy, dw, dh, grow = 1, under = true) {
  if (!col || !img || !img.width || dw < 4 || dh < 4) return false;
  // 1 CSS px in the sprite's source px, snapped to 2^(n/4) steps so zoom, squash and spawn growth reuse a few bakes
  const t = ctx.getTransform(), kx = dw / sw, ky = dh / sh, g = Math.max(0.1, Math.min(1, grow));
  const o = Math.min(32, Math.max(0.25, 2 ** (Math.round(Math.log2(G.dpr / ((Math.hypot(t.a, t.b) || 1) * (kx + ky) / 2 / g)) * 4) / 4)));
  if (under) { const c = rimCanvas(img, sx, sy, sw, sh, col, o), p = c._pad; ctx.drawImage(c, dx - p * kx, dy - p * ky, dw + p * 2 * kx, dh + p * 2 * ky); }
  rimT = t; rimO = o;
  return true;
}

// The see-through layer (render.js drawSeeThrough). While the world draws, each creature's rim and life bar are noted
// in depth order; after the spells and the lighting they are laid over the whole scene again, every body cutting out
// what was laid before it, so a hero, monster or pet shows through novas, walls and darkness but never over a nearer
// body. on: noting (the world's depth pass only); list[0..n): {who, t (transform), a (alpha), col, o, img, src/dst rect, bar}.
export const xray = { on: false, n: 0, list: [] };
// the device px bounds of rect (x, y, w, h) under transform t, written to out at i
const bounds = (out, i, t, x, y, w, h) => {
  out[i] = out[i + 1] = Infinity; out[i + 2] = out[i + 3] = -Infinity;
  for (let k = 0; k < 4; k++) {
    const u = k & 1 ? x + w : x, v = k & 2 ? y + h : y, X = t.a * u + t.c * v + t.e, Y = t.b * u + t.d * v + t.f;
    if (X < out[i]) out[i] = X; if (X > out[i + 2]) out[i + 2] = X; if (Y < out[i + 1]) out[i + 1] = Y; if (Y > out[i + 3]) out[i + 3] = Y;
  }
};
const at = [0, 0, 0, 0], laid = []; // laid: the bounds of every ring and bar on the layer so far, 4 numbers each

/** Lays the noted rims (rings: Settings › see-through outlines) and life bars on oc, which has the canvas's device
 * px; camT is the camera's transform; under: wall lines already lie everywhere. Grows box [x0, y0, x1, y1] round it. */
export function drawXray(oc, camT, rings, box, under) {
  let nl = 0;
  const lay = (t, x, y, w, h) => {
    bounds(laid, nl, t, x, y, w, h);
    if (laid[nl] < box[0]) box[0] = laid[nl]; if (laid[nl + 1] < box[1]) box[1] = laid[nl + 1];
    if (laid[nl + 2] > box[2]) box[2] = laid[nl + 2]; if (laid[nl + 3] > box[3]) box[3] = laid[nl + 3];
    nl += 4;
  };
  for (let i = 0; i < xray.n; i++) {
    const e = xray.list[i], kx = e.dw / e.sw, ky = e.dh / e.sh;
    oc.setTransform(e.t);
    oc.globalAlpha = e.a;
    // the body cuts out whatever farther rims, bars and wall lines lie under it; nothing laid there, nothing to cut
    let cut = under || nl > 4096;
    if (!cut) {
      bounds(at, 0, e.t, e.dx, e.dy, e.dw, e.dh);
      for (let j = 0; j < nl && !cut; j += 4) cut = at[0] < laid[j + 2] && at[2] > laid[j] && at[1] < laid[j + 3] && at[3] > laid[j + 1];
    }
    if (cut) {
      oc.globalCompositeOperation = 'destination-out';
      oc.drawImage(e.img, e.sx, e.sy, e.sw, e.sh, e.dx, e.dy, e.dw, e.dh);
    }
    if (rings) {
      oc.globalCompositeOperation = 'source-over';
      const c = ringCanvas(e.img, e.sx, e.sy, e.sw, e.sh, e.col, e.o), p = c._pad;
      oc.drawImage(c, e.dx - p * kx, e.dy - p * ky, e.dw + p * 2 * kx, e.dh + p * 2 * ky);
      lay(e.t, e.dx - p * kx, e.dy - p * ky, e.dw + p * 2 * kx, e.dh + p * 2 * ky);
    }
    if (e.bar) {
      oc.setTransform(camT);
      oc.globalCompositeOperation = 'source-over';
      oc.globalAlpha = Math.max(0.5, e.a);
      lifeBar(oc, e.bx, e.by, e.bw, e.bh, e.bf, e.bc);
      lay(camT, e.bx - 1, e.by, e.bw + 2, e.bh);
    }
    e.who = e.img = e.t = null; e.bar = false; // nothing held past the frame
  }
  oc.globalCompositeOperation = 'source-over'; oc.globalAlpha = 1;
  xray.n = 0;
}
function lifeBar(ctx, x, y, w, h, f, col) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 1, y, w + 2, h);
  ctx.fillStyle = col; ctx.fillRect(x, y + 1, w * f, h - 2);
}
const BAR = { normal: '#c02010', champion: '#4a8aff', unique: '#e0a030', boss: '#ff7a1a' };

export class Creature {
  constructor(o = {}) {
    this.id = ++UID;
    this.x = 0; this.y = 0; this.z = 0;
    this.r = 0.32;
    this.team = 'enemy';
    this.maxHp = 10; this.hp = 10;
    this.speed = 2.5;
    this.facing = 0;
    this.flip = false;
    this.flash = 0;
    this.hpShow = 0;
    this.animT = Math.random() * 10;
    this.moving = false;
    this.lunge = 0;
    this.attackAnimT = 0;
    this.kbx = 0; this.kby = 0;
    this.dead = false;
    this.level = 1;
    this.res = {};
    this.st = { status: null };
    this.status = {}; // burn, poison, bleed: {t, dps, src}; chill/slow: {t, amt}; freeze/stun/fear/confuse: {t}
    this.curses = {}; // amp, weaken, leech, thorns, decay, mark, bomb, doom: {t, amt, src}
    this.buffs = [];
    this.spawnT = 0;
    this.scale = 1;
    Object.assign(this, o);
    this.hp = this.hp > this.maxHp ? this.maxHp : this.hp;
  }

  get alive() { return !this.dead; }

  /** Movement speed multiplier from status effects. */
  speedMul() {
    let m = 1;
    const s = this.status;
    if (s.chill && s.chill.t > 0) m *= 1 - s.chill.amt;
    if (s.slow && s.slow.t > 0) m *= 1 - s.slow.amt;
    if (this.curses.slow && this.curses.slow.t > 0) m *= 1 - this.curses.slow.amt;
    if (this.isPlayer && G.char && G.char.madT > 0) m *= 2; // MADNESS
    if (this.hopGait) m *= this.hopGait; // court slimes move in hops (game/slimecourt.js)
    return Math.max(0.15, m);
  }
  disabled() {
    const s = this.status;
    return (s.freeze && s.freeze.t > 0) || (s.stun && s.stun.t > 0);
  }

  /** Tick status effects. Returns true if creature can act this frame. */
  tickStatus(dt, onDot) {
    const s = this.status;
    for (const k in s) {
      const e = s[k];
      if (!e || e.t <= 0) continue;
      e.t -= dt;
      if (e.dps) {
        e.acc = (e.acc || 0) + dt;
        if (e.acc >= 0.5) {
          e.acc -= 0.5;
          onDot && onDot(k, e.dps * 0.5, e.src);
        }
        // visuals
        if (k === 'burn' && chance(dt * 12)) spawn({ type: 'glow', x: this.x + rand(-0.2, 0.2), y: this.y + rand(-0.2, 0.2), z: rand(10, 40), vz: 30, life: 0.5, size: 3, size1: 0, color: chance(0.5) ? '#ff8020' : '#ffd040', add: true });
        if (k === 'poison' && chance(dt * 8)) spawn({ type: 'glow', x: this.x + rand(-0.2, 0.2), y: this.y + rand(-0.2, 0.2), z: rand(10, 40), vz: 15, life: 0.7, size: 2, size1: 3, color: '#80ff30', add: true });
        if (k === 'bleed' && chance(dt * 10)) spawn({ type: 'blood', x: this.x, y: this.y, z: rand(15, 30), vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), vz: 10, g: 260, life: 1, size: 1.6, color: this.bloodColor || '#8a0b08' });
      }
      if (k === 'chill' && chance(dt * 6)) spawn({ type: 'dot', x: this.x + rand(-0.3, 0.3), y: this.y + rand(-0.3, 0.3), z: rand(10, 40), vz: -10, life: 0.6, size: 1.5, color: '#c8f0ff' });
    }
    for (const k in this.curses) {
      const c = this.curses[k];
      if (!c || c.t <= 0) continue;
      c.t -= dt;
      if (k === 'decay') {
        c.acc = (c.acc || 0) + dt;
        if (c.acc >= 0.5) { c.acc -= 0.5; onDot && onDot('decay', c.dps * 0.5, c.src); }
      }
      if ((k === 'bomb' || k === 'doom') && c.t <= 0 && c.onExpire) c.onExpire(this);
    }
    // knockback
    if (this.kbx || this.kby) {
      if (this.world) this.world.map.move(this, this.kbx * dt, this.kby * dt, this.ghost);
      const f = Math.pow(0.0015, dt);
      this.kbx *= f; this.kby *= f;
      if (Math.abs(this.kbx) + Math.abs(this.kby) < 0.05) this.kbx = this.kby = 0;
    }
    if (this.flash > 0) this.flash -= dt;
    if (this.hpShow > 0) this.hpShow -= dt;
    if (this.lunge > 0) this.lunge = Math.max(0, this.lunge - dt * 4);
    if (this.attackAnimT > 0) this.attackAnimT = Math.max(0, this.attackAnimT - dt);
    if (this.cheerT > 0) this.cheerT -= dt;
    this.spawnT += dt;
    if (this.idleArt) { this.stillT = this.x === this._sx && this.y === this._sy ? (this.stillT || 0) + dt : 0; this._sx = this.x; this._sy = this.y; }
    return !this.disabled();
  }

  /** Move toward a point, returns remaining distance. */
  moveToward(tx, ty, dt, speed = this.speed) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) { this.moving = false; return 0; }
    const step = Math.min(d, speed * this.speedMul() * dt);
    const moved = this.world.map.move(this, (dx / d) * step, (dy / d) * step, this.ghost);
    this.moving = moved;
    this.face(Math.atan2(dy, dx));
    return d - step;
  }

  face(ang) {
    this.facing = ang;
    // screen-space horizontal component decides sprite flip
    const sx = Math.cos(ang) - Math.sin(ang);
    if (Math.abs(sx) <= 0.15) return;
    // a facing change must hold for a moment: auto-play and kiting alternate move/attack directions frame to frame,
    // which strobed the sprite left-right. Deliberate turns (a held direction) still land within a tenth of a second.
    const want = sx < 0;
    if (want === this.flip) { this.flipAt = -1; return; }
    const t = G.time || 0;
    if (!(this.flipAt >= 0) || t < this.flipAt) this.flipAt = t;
    if (t - this.flipAt >= (this.isPlayer && !G.autoplayOn ? 0.06 : 0.14)) { this.flip = want; this.flipAt = -1; }
  }

  // ------------------------------------------------------------- drawing
  spriteImage() {
    // memoised per creature: building cache keys every frame is surprisingly costly
    const art = this.idleArt && this.stillT > 0.8 ? this.idleArt : this.art; // a pet that sits when it stands still
    const id = art || this.classId || this.sprite, pal = art ? this.swap : this.classPal || this.pal;
    if (this._img && this._imgSprite === id && this._imgPal === pal) return this._img;
    if (art) {
      const img = enemyImage(art, this.swap);
      if (!img) return pixelSprite(this.sprite, this.pal, 6); // monster art still loading: the old pixel look
      this._imgSprite = id; this._imgPal = pal; this._flashImg = null;
      return (this._img = img);
    }
    this._imgSprite = id;
    this._imgPal = pal;
    this._flashImg = null;
    this._img = this.classId ? classSprite(this.classId, this.spriteH * 3, this.classPal || null) : pixelSprite(this.sprite, this.pal, 6, this.dark ? { dark: true } : null);
    return this._img;
  }
  tintFilter() {
    return this.status.freeze && this.status.freeze.t > 0 ? FREEZE : this.curses.charm && this.curses.charm.t > 0 ? CHARM : '';
  }
  flashImage(img) {
    if (img && img._art) return enemyImage(img === this._img ? this._imgSprite : this.riseArt, this.swap, 'flash');
    if (this.classId) return null;
    if (!this._flashImg) this._flashImg = pixelSprite(this.sprite, this.pal, 6, { flash: true });
    return this._flashImg;
  }
  rimColor() {
    if (this.dead || this.targetable === false) return null;
    if (this.isPlayer) return RIM.hero;
    return this.team === 'enemy' ? RIM[this.rank] || RIM.normal : this.summon ? RIM.ally : null;
  }
  /** The rim under the sprite: drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) args in the sprite's current transform. */
  drawRim(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    const col = this.rimColor(), note = xray.on && !this.ghostDraw && xray.n < 2000; // the cap: noting left on outside a world frame
    // with see-through outlines on, the ring laid over the scene stands in for the rim under the sprite
    if (!drawRim(ctx, col, img, sx, sy, sw, sh, dx, dy, dw, dh, this.spawnT < 0.3 ? this.spawnT / 0.3 : 1, !note || G.settings.outlines === false) || !note) return;
    const e = xray.list[xray.n] || (xray.list[xray.n] = { bar: false });
    xray.n++;
    e.who = this; e.t = rimT; e.o = rimO; e.a = ctx.globalAlpha; e.col = col; e.img = img;
    e.sx = sx; e.sy = sy; e.sw = sw; e.sh = sh; e.dx = dx; e.dy = dy; e.dw = dw; e.dh = dh;
  }
  /** World-px size of the sprite. */
  spriteDims(img) {
    if (img._art) { const h = this.artH * this.scale * (this.artRef ? img.height / this.artRef : 1); return [h * img.width / img.height, h]; }
    if (this.classId) { const h = this.spriteH * this.scale; return [h * img.width / img.height, h]; }
    const px = (this.px || 2.3) * this.scale / 6;
    return [img.width * px, img.height * px];
  }

  draw(ctx) {
    if (this.summonKey === 'runeweapon' && drawRuneWeapon(ctx, this)) return; // the Death Knight's 3D Runeblade
    if (TURRET3D.has(this.summonKey) && drawTurret3D(ctx, this)) return; // the Gunner's 3D turrets
    const art = this.artFrame && this.artFrame();
    if (art) return this.drawArt(ctx, art);
    if (this.slime && drawSlime(ctx, this)) return;
    const pet = petAnimation(this);
    if (pet) return this.drawPet(ctx, pet);
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    let img = this.spriteImage();
    const rising = this.riseArt && this.spawnT < 0.5 && enemyImage(this.riseArt);
    if (rising && this.spawnT < 0.22) img = rising; // a blue slime pools up as a puddle, then pops up out of it
    let [w, h] = this.spriteDims(img);
    // appear animation
    if (rising) { const k = this.spawnT < 0.22 ? 0.35 + this.spawnT / 0.22 * 0.65 : 1; w *= k; if (this.spawnT >= 0.22) { const t = (this.spawnT - 0.22) / 0.28; h *= 1 + 0.3 * Math.sin(t * Math.PI); w *= 1 - 0.15 * Math.sin(t * Math.PI); } }
    else if (this.spawnT < 0.3) { const k = this.spawnT / 0.3; w *= k; h *= k; }
    let bob, squash, sx = 1, sy = 1, rot = 0, lean = 0;
    const isHero = !!(this.isPlayer || this.isRemotePlayer);
    if (isHero) {
      const running = this.moving && ((this.speed * (this.speedMul ? this.speedMul() : 1) > 5.5) || (this.char && this.char.madT > 0));
      const f = running ? 13 : 9;
      if (this.moving) {
        bob = Math.abs(Math.sin(this.animT * f)) * (running ? 4.2 : 2.8);
        const s = Math.sin(this.animT * f * 2) * (running ? 0.05 : 0.035);
        sy = 1 + s;
        sx = 1 - s * 0.6;
        rot = Math.sin(this.animT * f) * (running ? 0.035 : 0.045);
        lean = running ? 0.07 : 0.02;
      } else {
        const b = Math.sin(this.animT * 2.1);
        sy = 1 + b * 0.012;
        sx = 1 - b * 0.006;
        bob = Math.sin(this.animT * 2) * 0.6;
      }
      squash = sy;
    } else {
      bob = this.moving ? Math.abs(Math.sin(this.animT * 9)) * 2.2 : Math.sin(this.animT * 2) * 0.6;
      squash = this.moving ? 1 + Math.sin(this.animT * 18) * 0.03 : 1;
      if (this.hop) { // slimes: stretch in the air, splat on landing; a slow wobble at rest
        const s = this.moving ? Math.sin(this.animT * 8) : 0;
        bob = Math.max(0, s) * 7 * this.scale;
        squash = this.moving ? 1 + (s > 0 ? s * 0.14 : s * 0.22) : 1 + Math.sin(this.animT * 3) * 0.04;
        w *= 2 - squash;
      }
    }
    const fly = this.fly ? 16 + Math.sin(this.animT * 3) * 4 : 0;
    const z = this.z + fly + bob;
    // shadow (none under Velscour's Mirror of Sin copies: game/velscour.js)
    if (!this.noShadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      const sw = Math.max(8, Math.min(w, h) * 0.32);
      const sh = Math.max(4, Math.min(w, h) * 0.14);
      const bobR = isHero ? bob * 0.5 : 0;
      ctx.beginPath(); ctx.ellipse(px, py, Math.max(4, sw - bobR), Math.max(2, sh - bobR * 0.35), 0, 0, TAU); ctx.fill();
    }
    // elite aura
    if (this.aura) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + Math.sin(this.animT * 4) * 0.2;
      const g = glowSprite(this.aura);
      ctx.drawImage(g, px - w * 0.8, py - h * 0.75 - z, w * 1.6, h * 1.3);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // lunge offset (screen-space direction of facing)
    const lx = this.lunge > 0 ? (Math.cos(this.facing) - Math.sin(this.facing)) * this.lunge * 8 : 0;
    const ly = this.lunge > 0 ? (Math.cos(this.facing) + Math.sin(this.facing)) * this.lunge * 4 : 0;
    // monster art is anchored at its feet (weapons stick out to one side), mirrored with the sprite
    const ax = img._art ? (this.flip ? 1 - img._art.fx / img.width : img._art.fx / img.width) : 0.5;
    const dx = px - w * ax + lx, dy = py - h * squash - z + ly;
    ctx.save();
    if (this.alpha !== undefined) ctx.globalAlpha = this.alpha;
    const ti = tinted(img, this.tintFilter());
    if (isHero) {
      ctx.translate(px + lx, py + ly - z);
      if (this.flip) ctx.scale(-1, 1);
      ctx.rotate(rot + (this.moving ? lean : 0));
      ctx.scale(sx, sy);
      this.drawRim(ctx, img, 0, 0, img.width, img.height, -w * 0.5, -h, w, h);
      ctx.drawImage(ti, -w * 0.5, -h, w, h);
      if (this.flash > 0) {
        const f = this.flashImage(img);
        ctx.globalAlpha = Math.min(1, this.flash * 8) * 0.85;
        if (f) ctx.drawImage(f, -w * 0.5, -h, w, h);
        else { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(img, -w * 0.5, -h, w, h); }
      }
    } else {
      if (this.flip) {
        ctx.translate(dx + w, dy); ctx.scale(-1, 1);
        this.drawRim(ctx, img, 0, 0, img.width, img.height, 0, 0, w, h * squash);
        ctx.drawImage(ti, 0, 0, w, h * squash);
      } else { this.drawRim(ctx, img, 0, 0, img.width, img.height, dx, dy, w, h * squash); ctx.drawImage(ti, dx, dy, w, h * squash); }
      if (this.flash > 0) {
        const f = this.flashImage(img);
        ctx.globalAlpha = Math.min(1, this.flash * 8) * 0.85;
        if (f) {
          if (this.flip) ctx.drawImage(f, 0, 0, w, h * squash); else ctx.drawImage(f, dx, dy, w, h * squash);
        } else {
          ctx.globalCompositeOperation = 'lighter';
          if (this.flip) ctx.drawImage(img, 0, 0, w, h * squash); else ctx.drawImage(img, dx, dy, w, h * squash);
        }
      }
    }
    ctx.restore();
    this.screenTop = py - h - z; // for overhead UI
    this.drawOverhead(ctx, px, py - h - z - 4, w);
  }

  /** Draw an animal or humanoid summon from its dedicated animation atlas. */
  drawPet(ctx, a) {
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    // the atlas has its own summon frames, so the pet only fades in; it stands on the cell's floor line
    const k = a.k * this.scale, dw = a.cw * k, dh = a.ch * k, foot = a.floor * k;
    const z = this.z + (this.fly ? 16 + Math.sin(this.animT * 3) * 4 : 0) +
      (this.moving ? Math.abs(Math.sin(this.animT * 9)) * 2.2 : Math.sin(this.animT * 2) * 0.6);
    const rest = a.restH * k; // the rest pose's height: the body's size for the shadow, aura and overhead bar
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(px, py, Math.max(8, rest * 0.32), Math.max(4, rest * 0.14), 0, 0, TAU); ctx.fill();
    if (this.aura) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + Math.sin(this.animT * 4) * 0.2;
      const g = glowSprite(this.aura);
      ctx.drawImage(g, px - rest * 0.8, py - rest * 0.75 - z, rest * 1.6, rest * 1.3);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const lx = this.lunge > 0 ? (Math.cos(this.facing) - Math.sin(this.facing)) * this.lunge * 8 : 0;
    const ly = this.lunge > 0 ? (Math.cos(this.facing) + Math.sin(this.facing)) * this.lunge * 4 : 0;
    ctx.save();
    ctx.globalAlpha = (this.alpha ?? 1) * (this.spawnT < 0.15 ? this.spawnT / 0.15 : 1);
    // humanoids have no walk frames: they rock from foot to foot round the feet instead
    ctx.translate(px + lx, py - z + ly);
    if (a.walk) ctx.rotate(Math.sin(this.animT * 9) * 0.05);
    if (this.flip) ctx.scale(-1, 1);
    const dx = -dw / 2, dy = -foot;
    const img = petTintImage(a.img, this.tintFilter());
    this.drawRim(ctx, a.img, a.sx, a.sy, a.cw, a.ch, dx, dy, dw, dh);
    ctx.drawImage(img, a.sx, a.sy, a.cw, a.ch, dx, dy, dw, dh);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash * 8) * 0.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(a.img, a.sx, a.sy, a.cw, a.ch, dx, dy, dw, dh);
    }
    ctx.restore();
    const top = py - z - rest;
    this.screenTop = top;
    this.drawOverhead(ctx, px, top - 4, rest);
  }

  /**
   * Draw a single-image hero ({img, frame, cw, ch, ax, ay, k}: cell size, feet anchor in the cell, world px
   * per image px), with the same bob and squash as the class sprites. The art faces right; it is mirrored
   * when the creature faces left. drawArtLayer(ctx, 'back' | 'front', where), if defined, draws effects
   * behind and in front of it.
   */
  drawArt(ctx, a) {
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    let k = a.k * this.scale;
    if (this.spawnT < 0.3) k *= this.spawnT / 0.3;
    const isHero = !!(this.isPlayer || this.isRemotePlayer);
    let bob, sx = 1, sy = 1, rot = 0, lean = 0;
    if (isHero) {
      const running = this.moving && ((this.speed * (this.speedMul ? this.speedMul() : 1) > 5.5) || (this.char && this.char.madT > 0));
      const f = running ? 13 : 9;
      if (this.moving) {
        bob = Math.abs(Math.sin(this.animT * f)) * (running ? 4.2 : 2.8);
        const s = Math.sin(this.animT * f * 2) * (running ? 0.05 : 0.035);
        sy = 1 + s;
        sx = 1 - s * 0.6;
        rot = Math.sin(this.animT * f) * (running ? 0.035 : 0.045);
        lean = running ? 0.07 : 0.02;
      } else {
        const b = Math.sin(this.animT * 2.1);
        sy = 1 + b * 0.012;
        sx = 1 - b * 0.006;
        bob = Math.sin(this.animT * 2) * 0.6;
      }
    } else {
      bob = this.moving ? Math.abs(Math.sin(this.animT * 9)) * 2.2 : Math.sin(this.animT * 2) * 0.6;
      sy = this.moving ? 1 + Math.sin(this.animT * 18) * 0.03 : 1;
    }
    const z = this.z + bob;
    const w = a.cw * k, h = a.ch * k * (isHero ? 1 : sy);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    const sw = 13 * this.scale;
    const sh = 5.5 * this.scale;
    const bobR = isHero ? bob * 0.5 : 0;
    ctx.beginPath(); ctx.ellipse(px, py, Math.max(5, sw - bobR), Math.max(2.5, sh - bobR * 0.35), 0, 0, TAU); ctx.fill();
    const lx = this.lunge > 0 ? (Math.cos(this.facing) - Math.sin(this.facing)) * this.lunge * 8 : 0;
    const ly = this.lunge > 0 ? (Math.cos(this.facing) + Math.sin(this.facing)) * this.lunge * 4 : 0;
    const squash = isHero ? 1 : sy;
    const dx = -a.ax * k, dy = -a.ay * k * squash;
    const where = { img: a.img, x: px + lx, y: py + ly - z, dx, dy, k, sq: squash, flip: this.flip, rot: rot + (this.moving ? lean : 0), sx, sy };
    if (this.drawArtLayer) this.drawArtLayer(ctx, 'back', where);
    ctx.save();
    if (this.alpha !== undefined) ctx.globalAlpha = this.alpha;
    ctx.translate(where.x, where.y);
    if (this.flip) ctx.scale(-1, 1);
    ctx.rotate(rot + (this.moving ? lean : 0));
    ctx.scale(sx, sy);
    this.drawRim(ctx, a.img, a.frame * a.cw, 0, a.cw, a.ch, dx, dy, w, h);
    ctx.drawImage(tinted(a.img, this.tintFilter()), a.frame * a.cw, 0, a.cw, a.ch, dx, dy, w, h);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash * 8) * 0.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(a.img, a.frame * a.cw, 0, a.cw, a.ch, dx, dy, w, h);
    }
    ctx.restore();
    if (this.drawArtLayer) this.drawArtLayer(ctx, 'front', where);
    const top = py - this.spriteH * this.scale - z;
    this.screenTop = top;
    this.drawOverhead(ctx, px, top - 4, w * 0.6);
  }

  drawOverhead(ctx, px, py, w) {
    if (this.ghostDraw) return; // a see-through copy (the Astronomer's Celestial Mirror) carries no overhead marks
    // stun stars / curse marks
    const s = this.status;
    if ((s.stun && s.stun.t > 0) || (s.fear && s.fear.t > 0)) {
      const fear = s.fear && s.fear.t > 0;
      for (let i = 0; i < 3; i++) {
        const a = this.animT * 5 + (i * TAU) / 3;
        ctx.fillStyle = fear ? '#c080ff' : '#ffe060';
        ctx.fillRect(px + Math.cos(a) * 9 - 1.5, py + Math.sin(a) * 3 - 1.5, 3, 3);
      }
    }
    const cursed = Object.keys(this.curses).filter((k) => this.curses[k] && this.curses[k].t > 0);
    if (cursed.length) {
      ctx.strokeStyle = this.curses.mark || this.curses.doom ? '#ff3030' : '#b060ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py - 6, 4 + Math.sin(this.animT * 6), 0, TAU); ctx.stroke();
    }
    // life bars: over every enemy, bosses too (Settings › life bars; off, one only flashes up over a monster that was
    // hit, bosses aside) and over hurt summons. In the world's frame they go on the see-through layer, over the spells.
    let col = null, bw = 24, bh = 4;
    if (this.team === 'enemy' && (G.settings.lifeBars !== false ? this.targetable !== false : this.hpShow > 0 && this.rank !== 'boss')) {
      const big = this.rank === 'boss';
      bw = big ? Math.max(40, Math.min(84, w * 0.75)) : Math.max(22, Math.min(46, w * 0.8)); bh = big ? 6 : 4;
      col = BAR[this.rank] || BAR.normal;
    } else if (this.team === 'player' && !this.isPlayer && this.summon && this.maxHp > 0 && this.hp < this.maxHp) col = '#30c040';
    this.barTop = null;
    if (!col) return;
    const x = px - bw / 2, y = py - 4 - bh, f = clamp(this.hp / this.maxHp, 0, 1);
    this.barTop = y; // champion and unique names sit above it (render.js drawOverheadNames)
    const e = xray.on && xray.n && xray.list[xray.n - 1];
    if (e && e.who === this) { e.bar = true; e.bx = x; e.by = y; e.bw = bw; e.bh = bh; e.bf = f; e.bc = col; }
    else lifeBar(ctx, x, y, bw, bh, f, col);
  }
}

export { screenDirToTile, ELEM };
