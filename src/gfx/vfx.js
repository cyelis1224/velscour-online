// Particles, blood & gore, decals, spell effects and floating combat text.
import { drawDkSkull } from './dkskull.js';
import { G } from '../state.js';
import { A } from '../core/assets.js';
import { camera, isoX, isoY, HW, HH, screenDirToTile } from '../core/view.js';
import { makeCanvas, rand, TAU, shade, randi, pick, fmt, shuffle, clamp, colourSprites, measureCtx } from '../core/util.js';
import { groundHidden } from './terrain.js';
import { bonesReady, boneDeck, boneLook, drawBoneGib } from './bonegibs.js';

export const ELEM = {
  phys: { name: 'Physical', core: '#ffffff', glow: '#e0d8c8', dark: '#7a7060', sfx: 'phys' },
  fire: { name: 'Fire', core: '#fff3a0', glow: '#ff7a10', dark: '#c02000', sfx: 'fire' },
  cold: { name: 'Cold', core: '#f0ffff', glow: '#60c8ff', dark: '#1a50d0', sfx: 'cold' },
  light: { name: 'Lightning', core: '#ffffff', glow: '#a8ccff', dark: '#4a64ff', sfx: 'light' },
  poison: { name: 'Poison', core: '#e8ff90', glow: '#70e020', dark: '#206010', sfx: 'poison' },
  arcane: { name: 'Arcane', core: '#ffe0ff', glow: '#c060ff', dark: '#5a10c0', sfx: 'arcane' },
  holy: { name: 'Holy', core: '#fffff0', glow: '#ffd860', dark: '#d08a00', sfx: 'holy' },
  shadow: { name: 'Shadow', core: '#e8c0ff', glow: '#9030d0', dark: '#280038', sfx: 'shadow' },
  blood: { name: 'Blood', core: '#ffa0a0', glow: '#e01010', dark: '#5a0000', sfx: 'blood' },
  acid: { name: 'Acid', core: '#d8f0ff', glow: '#3a8cff', dark: '#0c2aa0', sfx: 'acid' }, // the Slime Lord's blue ooze
  // the Astronomer's starlight: his arcane spells fly as 'astral' (blue) and hit as arcane (combat.js)
  astral: { name: 'Arcane', core: '#f2fbff', glow: '#4aa8ff', dark: '#1430a0', sfx: 'arcane' },
};
export const elem = (k) => ELEM[k] || ELEM.phys;

const MAX_P = () => (G.touch ? 1400 : 3000);
export const particles = [];
export const decals = []; // live decals: growing pools, scorch, frost (capped, drawn every frame)
// Finished blood (splats, grown pools) never changes again: it is stamped once into the baked floor chunks
// (render.js drawFloors -> stampDecals) and costs nothing per frame after that, so it isn't capped like the live ones.
// Each has a rising `seq`; a chunk remembers the last seq it has stamped.
export const bakedDecals = [];
let decalSeq = 0;
const BAKED_MAX = 8000; // bounds what a chunk rebake has to replay
function bake(d) {
  d.seq = ++decalSeq; d.spr = splatSprite(d.color, d.idx);
  d.r = d.size * HW * 1.6 * 1.42; // bounding radius in world px (the rotated square, squashed to half height)
  bakedDecals.push(d);
  if (bakedDecals.length > BAKED_MAX) bakedDecals.shift();
}
export const effects = [];
export const texts = [];
export const lights = [];

// ---------------------------------------------------------------- caches
// colour-keyed sprites: snapped colours, bounded, repainted in place (util.colourSprites)
export const glowSprite = colourSprites(192, 64, (x, r, g, b) => {
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},.6)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
});

// a filled antialiased disc per colour, for smoke puffs: one drawImage instead of building and filling an arc path
const discSprite = colourSprites(64, 64, (x, r, g, b) => { x.fillStyle = `rgb(${r},${g},${b})`; x.beginPath(); x.arc(32, 32, 32, 0, TAU); x.fill(); });

const splatMasks = [];
function makeSplatMasks() {
  for (let i = 0; i < 8; i++) {
    const c = makeCanvas(64, 64);
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    const blobs = randi(5, 11);
    x.beginPath(); x.arc(32, 32, rand(9, 14), 0, TAU); x.fill();
    for (let j = 0; j < blobs; j++) {
      const a = rand(TAU), d = rand(4, 22), r = rand(2, 8);
      x.beginPath(); x.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, TAU); x.fill();
      if (Math.random() < 0.5) { x.beginPath(); x.arc(32 + Math.cos(a) * (d + r + 3), 32 + Math.sin(a) * (d + r + 3), r * 0.4, 0, TAU); x.fill(); }
    }
    splatMasks.push(c);
  }
}
const splatCache = new Map();
function splatSprite(color, idx) {
  if (!splatMasks.length) makeSplatMasks();
  const key = color + idx;
  let c = splatCache.get(key);
  if (c) return c;
  // decals keep their sprite (d.spr), so an evicted one is only dropped from the cache, never repainted
  if (splatCache.size >= 256) splatCache.delete(splatCache.keys().next().value);
  c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  x.drawImage(splatMasks[idx], 0, 0);
  x.globalCompositeOperation = 'source-in';
  const grad = x.createRadialGradient(28, 26, 2, 32, 32, 34);
  grad.addColorStop(0, shade(color, 0.12)); grad.addColorStop(1, shade(color, -0.35));
  x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
  splatCache.set(key, c);
  return c;
}

// ------------------------------------------------------------- particles
/**
 * type: 'dot' | 'glow' | 'blood' | 'gib' | 'streak' | 'smoke' | 'shard' | 'img'
 */
// At the cap the oldest particle goes, as before, but by marking it dead (life -1: not drawn, compacted out in
// updateVfx) instead of particles.shift(), which moved the whole array on every spawn in a busy fight.
let evict = 0, dead = 0;
function kill(p) { if (p.life > 0) { p.life = -1; dead++; if (p.spr) spriteGibs--; } }
export function spawn(p) {
  if (particles.length - dead >= MAX_P()) {
    while (evict < particles.length && particles[evict].life <= 0) evict++;
    if (evict < particles.length) kill(particles[evict++]);
  }
  p.life = p.life ?? 0.6; p.max = p.life;
  p.z = p.z ?? 0; p.vx = p.vx ?? 0; p.vy = p.vy ?? 0; p.vz = p.vz ?? 0;
  p.g = p.g ?? 0; p.drag = p.drag ?? 0; p.size = p.size ?? 2; p.size1 = p.size1 ?? p.size;
  p.rot = p.rot ?? 0; p.vr = p.vr ?? 0;
  particles.push(p);
  return p;
}

export function burst(x, y, z, el, n = 12, speed = 3, opts = {}) {
  const E = elem(el);
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(0.3, 1) * speed;
    spawn({
      type: opts.type || (i % 3 === 0 ? 'glow' : 'dot'), x, y, z: z + rand(-4, 4),
      vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(-20, 60) * (opts.up ?? 1),
      g: opts.g ?? 60, drag: 2, life: rand(0.25, 0.7) * (opts.life ?? 1),
      size: rand(1.5, 3.5) * (opts.size ?? 1), size1: 0.3, color: i % 2 ? E.core : E.glow, add: true,
    });
  }
}

export function sparkle(x, y, z, color, n = 1, spread = 0.3) {
  for (let i = 0; i < n; i++) {
    spawn({ type: 'glow', x: x + rand(-spread, spread), y: y + rand(-spread, spread), z: z + rand(-6, 6), vz: rand(5, 30), life: rand(0.3, 0.7), size: rand(2, 4.5), size1: 0, color, add: true });
  }
}

export function smoke(x, y, z, color = '#2a2420', n = 4, size = 8) {
  for (let i = 0; i < n; i++) {
    spawn({ type: 'smoke', x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.3), z: z + rand(0, 10), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(10, 30), life: rand(0.8, 1.6), size: size * rand(0.6, 1), size1: size * 2.2, color, alpha: 0.45 });
  }
}

/** Blood spray: angle = direction of travel in tile space. */
export function bloodSpray(x, y, z, angle, n, color, force = 1) {
  if (G.settings.gore === 0) { burst(x, y, z, 'phys', Math.ceil(n / 3), 2); return; }
  n = Math.round(n * (G.settings.gore === 2 ? 1.6 : 1));
  for (let i = 0; i < n; i++) {
    const a = angle + rand(-0.9, 0.9), s = rand(0.8, 4.5) * force;
    spawn({
      type: 'blood', x, y, z: z + rand(-6, 6), vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      vz: rand(20, 110) * force, g: 260, drag: 0.6, life: 2, size: rand(1.2, 3.2), color: i % 4 ? color : shade(color, -0.3),
    });
  }
}

/** Gore chunks. `sets` names gib-sprite sets (assets/sprites/gibs.json: flesh, bone, limb, bug, demon, eye); about
 *  half the chunks become sprites (capped). The rest are three.js bones (gfx/bonegibs.js: skulls, rib cages, femurs
 *  ...), a third in `boneColor`, the others in `color`, now and then bloodied with `o.blood` (default `color`; null:
 *  none, a skeleton's); `o.scale` sizes them, `o.loose` keeps out skulls and rib cages. Coloured rects until the
 *  bone sheet has loaded. */
let spriteGibs = 0;
export function gibs(x, y, z, n, color, boneColor = '#e8dcc0', force = 1, sets = null, o = {}) {
  if (G.settings.gore === 0) return;
  n = Math.round(n * (G.settings.gore === 2 ? 1.5 : 1));
  const M = sets && A.gibImg && A.gibMeta;
  const deck = bonesReady() ? boneDeck(n, o.loose) : null, coat = o.blood === undefined ? color : o.blood;
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(1, 5) * force;
    const bone = Math.random() < 0.3;
    if (M && i % 2 === 0 && spriteGibs < (G.touch ? 40 : 90)) {
      const list = M[pick(sets)];
      if (list) {
        spriteGibs++;
        spawn({ type: 'gib', spr: pick(list), x, y, z: z + rand(0, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(60, 200) * force,
          g: 420, drag: 0.5, life: rand(4, 9), size: rand(0.55, 0.85), blood: color, rot: rand(-0.6, 0.6), vr: rand(-8, 8), bounces: 0 });
        continue;
      }
    }
    if (deck) {
      const look = boneLook(coat);
      spawn({ type: 'gib', bone: deck[i], look, color: bone ? boneColor : color, coat, blood: look ? coat : null, rest: randi(0, 99),
        x, y, z: z + rand(0, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(60, 200) * force,
        g: 420, drag: 0.5, life: rand(4, 9), size: (o.scale || 1) * rand(0.85, 1.15), rot: rand(TAU), vr: rand(-12, 12), bounces: 0, w: 1 });
      continue;
    }
    spawn({
      type: 'gib', x, y, z: z + rand(0, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(60, 200) * force,
      g: 420, drag: 0.5, life: rand(4, 9), size: rand(2, 5.5), color: bone ? boneColor : color,
      blood: bone ? null : color, rot: rand(TAU), vr: rand(-12, 12), bounces: 0, w: rand(0.6, 1.4),
    });
  }
}

// ----------------------------------------------------------------- decals
export function addDecal(x, y, color, size = 1, kind = 'splat', alpha = 0.9) {
  if (kind === 'splat' && G.settings.gore === 0) return;
  const max = G.touch ? 500 : 1100;
  const d = { x, y, color, size, kind, alpha, rot: rand(TAU), idx: randi(0, 7), grow: kind === 'pool' ? 0 : 1, life: kind === 'scorch' || kind === 'frost' ? 14 : 9999, t: 0 };
  if (kind === 'splat') { bake(d); return; }
  if (decals.length >= max) decals.shift();
  decals.push(d);
}

// ---------------------------------------------------------------- effects
export class Ring {
  constructor(x, y, r0, r1, dur, color, width = 4, opts = {}) {
    Object.assign(this, { x, y, r0, r1, dur, color, width, t: 0, z: opts.z || 2, fill: opts.fill || false, add: opts.add ?? true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur, r = this.r0 + (this.r1 - this.r0) * (1 - Math.pow(1 - k, 2));
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y) - this.z;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = this.color; ctx.lineWidth = this.width * (1 - k * 0.5);
    ctx.beginPath(); ctx.ellipse(px, py, r * HW * 1.41, r * HH * 1.41, 0, 0, TAU); ctx.stroke();
    if (this.fill) { ctx.globalAlpha = (1 - k) * 0.25; ctx.fillStyle = this.color; ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

export class Slash {
  constructor(x, y, ang, arc, r, dur, color, opts = {}) {
    Object.assign(this, { x, y, ang, arc, r, dur, color, t: 0, z: opts.z ?? 22, width: opts.width || 10, style: opts.style || 'slash', flip: opts.flip ? -1 : 1 });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y) - this.z;
    // convert tile angle into screen ellipse arc
    const R = this.r * HW * 1.41;
    ctx.save();
    ctx.translate(px, py); ctx.scale(1, 0.55);
    const sa = screenAngle(this.ang);
    const span = this.arc;
    const head = sa - this.flip * span / 2 + this.flip * span * Math.min(1, k * 1.8);
    const tail = sa - this.flip * span / 2 + this.flip * span * Math.max(0, k * 1.8 - 0.7);
    ctx.globalAlpha = 1 - k * k;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 0 ? this.color : i === 1 ? shade(this.color, 0.5) : '#ffffff';
      ctx.lineWidth = this.width * (1 - i * 0.33);
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (this.flip > 0) ctx.arc(0, 0, R * (1 - i * 0.04), tail, head); else ctx.arc(0, 0, R * (1 - i * 0.04), head, tail);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
/** Tile-space angle -> screen-space angle (iso), used to orient 2D effects. */
export function screenAngle(a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  return Math.atan2((dx + dy) * HH, (dx - dy) * HW);
}

export class Bolt {
  // jagged lightning between two points (tile coords + z)
  constructor(x0, y0, z0, x1, y1, z1, color, dur = 0.25, width = 3) {
    Object.assign(this, { x0, y0, z0, x1, y1, z1, color, dur, width, t: 0, seg: null, regen: 0 });
  }
  build() {
    const ax = isoX(this.x0, this.y0), ay = isoY(this.x0, this.y0) - this.z0;
    const bx = isoX(this.x1, this.y1), by = isoY(this.x1, this.y1) - this.z1;
    // the tower's warp throws cut-away points 1e7 px off: such a bolt would need a million segments
    if (Math.abs(ax) > 1e6 || Math.abs(ay) > 1e6 || Math.abs(bx) > 1e6 || Math.abs(by) > 1e6) { this.seg = []; return; }
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.min(48, Math.max(3, Math.floor(len / 12)));
    const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
    const pts = [[ax, ay]];
    for (let i = 1; i < n; i++) {
      const t = i / n, off = rand(-1, 1) * Math.min(18, len * 0.12);
      pts.push([ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off]);
    }
    pts.push([bx, by]);
    this.seg = pts;
  }
  update(dt) {
    this.t += dt; this.regen -= dt;
    if (this.regen <= 0) { this.build(); this.regen = 0.05; }
    return this.t < this.dur;
  }
  draw(ctx) {
    if (!this.seg) this.build();
    if (this.seg.length < 2) return;
    const k = this.t / this.dur;
    ctx.globalAlpha = 1 - k * 0.7;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? '#ffffff' : this.color;
      ctx.lineWidth = pass ? this.width * 0.4 : this.width * 1.8;
      ctx.beginPath();
      this.seg.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export class Beam {
  constructor(x0, y0, x1, y1, color, width, dur, opts = {}) {
    Object.assign(this, { x0, y0, x1, y1, color, width, dur, t: 0, z: opts.z ?? 24, core: opts.core || '#ffffff', wobble: opts.wobble ?? 1 });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const ax = isoX(this.x0, this.y0), ay = isoY(this.x0, this.y0) - this.z;
    const bx = isoX(this.x1, this.y1), by = isoY(this.x1, this.y1) - this.z * 0.6;
    const w = this.width * (1 - k * 0.6) * (1 + Math.sin(G.time * 40) * 0.12 * this.wobble);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.35 * (1 - k); ctx.strokeStyle = this.color; ctx.lineWidth = w * 2.6;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.globalAlpha = 0.9 * (1 - k * 0.5); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = this.core; ctx.lineWidth = w * 0.35;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export class Column {
  // vertical light/fire column from the sky: a round shaft whose foot is the front of the floor ellipse it stands on,
  // with its light pooled on the floor round it
  constructor(x, y, color, dur = 0.5, width = 18, height = 260) { Object.assign(this, { x, y, color, dur, width, height, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y), top = py - this.height;
    const w = Math.max(0, this.width * (1 - k)), op = ctx.globalCompositeOperation, s = this.width * 1.2;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8 * (1 - k);
    ctx.drawImage(glowSprite(this.color), px - s, py - s * HH / HW, s * 2, s * 2 * HH / HW);
    ctx.globalCompositeOperation = op;
    const g = ctx.createLinearGradient(px, top, px, py);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, this.color); g.addColorStop(1, '#ffffff');
    ctx.globalAlpha = 1 - k * 0.5;
    ctx.fillStyle = g; shaft(ctx, px, py, top, w / 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; shaft(ctx, px, py, top, w / 6); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
// a light shaft's outline: straight sides down to the floor, closed by the front half of the floor ellipse under it
function shaft(ctx, px, py, top, r) {
  ctx.beginPath(); ctx.moveTo(px - r, top); ctx.lineTo(px + r, top);
  ctx.ellipse(px, py, r, r * HH / HW, 0, 0, Math.PI); ctx.closePath();
}

export class Sigil {
  // a burning summoning circle on the ground (level up): rings, a seven-point star and rune ticks, turning
  constructor(x, y, r, dur, color = '#ff3018', glow = '#ffd860') { Object.assign(this, { x, y, r, dur, color, glow, t: 0, add: true }); }
  update(dt) { this.t += dt; return this.t < this.dur; }
  get R() { return this.r * HW * 1.41 * (0.6 + 0.4 * Math.min(1, this.t / 0.35)); } // outer ring, world px (before the iso squash)
  get rot() { return this.t * 0.9; }
  draw(ctx) {
    const k = this.t / this.dur, a = Math.min(1, this.t / 0.25) * (k > 0.7 ? (1 - k) / 0.3 : 1);
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.R, rot = this.rot;
    ctx.save(); ctx.translate(px, py); ctx.scale(1, HH / HW);
    ctx.lineJoin = 'miter';
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = a * (pass ? 1 : 0.45);
      ctx.strokeStyle = pass ? this.glow : this.color; ctx.lineWidth = pass ? 1.6 : 6;
      this.trace(ctx, R, rot);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // stroke the lines round the centre in the current style (one path, one stroke)
  trace(ctx, R, rot) {
    ctx.beginPath();
    ctx.moveTo(R, 0); ctx.arc(0, 0, R, 0, TAU);
    ctx.moveTo(R * 0.8, 0); ctx.arc(0, 0, R * 0.8, 0, TAU);
    for (let i = 0; i <= 7; i++) { const q = rot + (i * 3 * TAU) / 7; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(q) * R * 0.8, Math.sin(q) * R * 0.8); }
    for (let i = 0; i < 21; i++) { // rune ticks between the rings, turning the other way
      const q = -rot * 0.6 + (i * TAU) / 21, r0 = R * 0.84, r1 = R * (i % 3 ? 0.92 : 0.97);
      ctx.moveTo(Math.cos(q) * r0, Math.sin(q) * r0); ctx.lineTo(Math.cos(q + 0.06) * r1, Math.sin(q + 0.06) * r1);
    }
    ctx.stroke();
  }
}

// a Sigil's lines, in units of its outer radius R: the outer ring, the inner ring, the star's seven strokes, the runes
const SIG_LEN = [TAU, TAU * 0.8, 7 * 1.6 * Math.sin((3 * Math.PI) / 7), 21 * 0.1];
const SIG_SUM = SIG_LEN.reduce((a, b) => a + b);
export class SigilFlames {
  // flames rising off a Sigil's lines (level up): once it has grown to full size every ring, star stroke and rune
  // catches, a burst first, then a burn that dies down. The fire is particles (type 'flame'); this draws the lines
  // glowing hot under it.
  constructor(sig, dur = 2.5) { Object.assign(this, { sig, dur, t: 0, n: 0, add: true }); }
  // a random point on the lines, weighted by length so the fire is even along them: [tile angle, tile radius, turn
  // rate]. The ground plane is the sigil's circle space turned 45 degrees, so its turns are the same in tiles.
  spot() {
    const s = this.sig, R = s.r * HW * 1.41, rot = s.rot, u = Math.random() * SIG_SUM;
    let ox, oy, omega = 0.9;
    if (u < SIG_LEN[0] + SIG_LEN[1]) {
      const q = rand(TAU), r = u < SIG_LEN[0] ? R : R * 0.8;
      ox = Math.cos(q) * r; oy = Math.sin(q) * r;
    } else if (u < SIG_LEN[0] + SIG_LEN[1] + SIG_LEN[2]) {
      const a = rot + (randi(0, 6) * 3 * TAU) / 7, b = a + (3 * TAU) / 7, f = Math.random();
      ox = (Math.cos(a) + (Math.cos(b) - Math.cos(a)) * f) * R * 0.8; oy = (Math.sin(a) + (Math.sin(b) - Math.sin(a)) * f) * R * 0.8;
    } else { // a rune tick, as Sigil.draw turns them (the other way)
      const i = randi(0, 20), q = -rot * 0.6 + (i * TAU) / 21, f = Math.random(), r = R * (0.84 + f * ((i % 3 ? 0.92 : 0.97) - 0.84));
      ox = Math.cos(q + 0.06 * f) * r; oy = Math.sin(q + 0.06 * f) * r; omega = -0.54;
    }
    const [dx, dy] = screenDirToTile(ox, oy * HH / HW);
    return [Math.atan2(dy, dx), Math.hypot(dx, dy), omega];
  }
  flame(burst) {
    const s = this.sig, [angle, radius, omega] = this.spot(), x = s.x + Math.cos(angle) * radius, y = s.y + Math.sin(angle) * radius;
    if (Math.random() < 0.08) { // a spark that breaks loose, flies higher and lasts
      spawn({ type: 'glow', x, y, z: 2, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(60, 160), g: -40, drag: 1, life: rand(0.7, 1.3), size: rand(1.2, 2), size1: 0, color: pick(['#ffc050', '#ff7a20']), add: true });
      return;
    }
    // rides the turning sigil (the vortex follow in updateVfx) straight up off its line, so the fire keeps its shape
    spawn({ type: 'flame', x, y, z: 0, life: rand(0.25, burst ? 0.5 : 0.42), size: rand(2.2, burst ? 3.8 : 3), size1: 0.3, add: true,
      vortex: { owner: s, angle, radius, omega, radial: 0, rise: burst ? rand(35, 100) : rand(15, 48) } });
  }
  update(dt) {
    const t = (this.t += dt), k = G.touch ? 0.45 : 1;
    if (t < 0.32) return true; // the sigil is still growing
    if (t < this.dur - 0.3) addLight(this.sig.x, this.sig.y, 5 + Math.sin(t * 19) * 0.5, 1, 24, '#ff6a20');
    // a roaring burst, then a burn that dies down, stopping in time for the last flames to fade with the sigil
    const rate = t < 0.7 ? 2000 : t < this.dur - 0.55 ? 1700 - 800 * ((t - 0.7) / (this.dur - 1.25)) : 0;
    for (this.n += dt * rate * k; this.n >= 1; this.n--) this.flame(t < 0.7);
    return t < this.dur;
  }
  draw(ctx) {
    const s = this.sig, t = this.t, heat = Math.min(1, (t - 0.32) / 0.1) * (0.6 + 0.4 * Math.max(0, 1 - (t - 0.7) / 0.6)) * Math.min(1, (this.dur - t) / 0.5);
    if (heat <= 0) return;
    ctx.save(); ctx.translate(isoX(s.x, s.y), isoY(s.x, s.y)); ctx.scale(1, HH / HW);
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = heat * 0.5; ctx.strokeStyle = '#ff5a10'; ctx.lineWidth = 5; s.trace(ctx, s.R, s.rot);
    ctx.globalAlpha = heat; ctx.strokeStyle = '#ffd860'; ctx.lineWidth = 1.4; s.trace(ctx, s.R, s.rot);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

const RAINBOW = ['#ff2020', '#ff8a10', '#ffe820', '#30ff40', '#20d0ff', '#4050ff', '#c030ff'];
export class SkyBolts {
  // rainbow lightning from the hero into the sky (level up): seven bolts fan out, red leaning left to violet right,
  // and halfway from the hero to the top of the screen each forks into 2-5 bolts that run off the top edge
  constructor(x, y, dur = 1) {
    const order = shuffle([0, 1, 2, 3, 4, 5, 6]);
    Object.assign(this, { x, y, dur, t: 0, add: true });
    this.bolts = RAINBOW.map((color, i) => ({ color, ang: ((i - 3) / 3) * 0.95 + rand(-0.12, 0.12), z0: rand(26, 52), t0: 0.03 + order[i] * 0.05 + rand(0, 0.03), ends: null, segs: null, regen: 0 }));
  }
  // laid out in world px the moment a bolt fires, against the view as it is then: the trunk, then the forks
  aim(b) {
    const ox = isoX(this.x, this.y), oy = isoY(this.x, this.y) - b.z0, top = camera.viewRect().y0;
    const sy = (oy + top) / 2, sx = ox + Math.tan(b.ang) * (oy - sy), n = randi(2, 5);
    b.ends = [[ox, oy, sx, sy]];
    for (let j = 0; j < n; j++) {
      const a = clamp(b.ang + ((j + 0.5) / n - 0.5) * 1.2 + rand(-0.12, 0.12), -1.1, 1.1);
      b.ends.push([sx, sy, sx + Math.tan(a) * (sy - top + 40), top - 40]);
    }
  }
  update(dt) {
    this.t += dt;
    const gx = isoX(this.x, this.y), gy = isoY(this.x, this.y);
    for (const b of this.bolts) {
      const a = this.t - b.t0;
      if (a < 0 || a > 0.6) continue;
      if (!b.ends) { this.aim(b); G.flash = Math.max(G.flash || 0, 0.1); }
      if ((b.regen -= dt) <= 0) { b.regen = 0.05; b.segs = b.ends.map(([ax, ay, bx, by]) => jag(ax, ay, bx, by)); }
      // its colour lights the dark halfway up the trunk and at the fork
      for (const f of [0.5, 1]) {
        const [ax, ay, bx, by] = b.ends[0], wx = ax + (bx - ax) * f, wy = ay + (by - ay) * f, [dx, dy] = screenDirToTile(wx - gx, 0);
        addLight(this.x + dx, this.y + dy, 3, 0.9 * (1 - a / 0.6), gy - wy, b.color);
      }
    }
    return this.t < this.dur;
  }
  draw(ctx) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const b of this.bolts) {
      const a = this.t - b.t0;
      if (a < 0 || a > 0.6 || !b.segs) continue;
      const k = a / 0.6, alpha = (1 - k * k) * (0.7 + 0.3 * Math.sin(a * 80 + b.z0));
      b.segs.forEach((p, j) => {
        const grow = j ? (a - 0.06) / 0.08 : a / 0.06; // the trunk strikes, then the forks
        if (grow > 0) strokeBolt(ctx, p, Math.min(1, grow), b.color, alpha, j ? 0.7 : 1);
      });
    }
    ctx.globalAlpha = 1;
  }
}
// a jagged lightning path from a to b by midpoint displacement, as a flat [x, y, x, y, ...] list
function jag(ax, ay, bx, by, out = [ax, ay]) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  if (len < 18) { out.push(bx, by); return out; }
  const off = rand(-0.2, 0.2) * len, mx = (ax + bx) / 2 - (dy / len) * off, my = (ay + by) / 2 + (dx / len) * off;
  jag(ax, ay, mx, my, out);
  return jag(mx, my, bx, by, out);
}
// a bolt drawn `frac` of the way along: a wide coloured halo, the coloured bolt, a white-hot core
function strokeBolt(ctx, p, frac, color, alpha, w) {
  const n = p.length / 2 - 1, end = n * frac, last = Math.floor(end), f = end - last;
  ctx.beginPath(); ctx.moveTo(p[0], p[1]);
  for (let i = 1; i <= last; i++) ctx.lineTo(p[i * 2], p[i * 2 + 1]);
  if (last < n) ctx.lineTo(p[last * 2] + (p[last * 2 + 2] - p[last * 2]) * f, p[last * 2 + 1] + (p[last * 2 + 3] - p[last * 2 + 1]) * f);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * 0.25; ctx.lineWidth = 11 * w; ctx.stroke();
  ctx.globalAlpha = alpha; ctx.lineWidth = 3.6 * w; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4 * w; ctx.stroke();
}

export class Telegraph {
  // ground warning marker for enemy attacks: circle or line
  constructor(opts) { Object.assign(this, { t: 0, color: '#ff2a10' }, opts); }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    ctx.save();
    if (this.kind === 'line') {
      const ax = isoX(this.x, this.y), ay = isoY(this.x, this.y);
      const bx = isoX(this.x + Math.cos(this.ang) * this.len, this.y + Math.sin(this.ang) * this.len);
      const by = isoY(this.x + Math.cos(this.ang) * this.len, this.y + Math.sin(this.ang) * this.len);
      ctx.globalAlpha = 0.25 + k * 0.35; ctx.strokeStyle = this.color; ctx.lineWidth = this.w * HW;
      ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    } else if (this.kind === 'cone') {
      // a sector: ang +- half, out to len, filling from the apex as it nears
      const pts = (L) => {
        ctx.beginPath(); ctx.moveTo(isoX(this.x, this.y), isoY(this.x, this.y));
        for (let i = 0; i <= 16; i++) {
          const a = this.ang - this.half + (i / 16) * this.half * 2, x = this.x + Math.cos(a) * L, y = this.y + Math.sin(a) * L;
          ctx.lineTo(isoX(x, y), isoY(x, y));
        }
        ctx.closePath();
      };
      ctx.globalAlpha = 0.6; ctx.strokeStyle = this.color; ctx.lineWidth = 2; pts(this.len); ctx.stroke();
      ctx.globalAlpha = 0.15 + 0.25 * k; ctx.fillStyle = this.color; pts(this.len * k); ctx.fill();
    } else {
      const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = this.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(px, py, this.r * HW * 1.41, this.r * HH * 1.41, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.18 + 0.2 * k; ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.ellipse(px, py, this.r * HW * 1.41 * k, this.r * HH * 1.41 * k, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

export class Sprite {
  // a sprite that fades / scales out at a world position
  constructor(x, y, z, img, w, h, dur, opts = {}) { Object.assign(this, { x, y, z, img, w, h, dur, t: 0, add: opts.add || false, rise: opts.rise || 0, grow: opts.grow || 0 }); }
  update(dt) { this.t += dt; this.z += this.rise * dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur, s = 1 + this.grow * k;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y) - this.z;
    ctx.globalAlpha = 1 - k;
    ctx.drawImage(this.img, px - this.w * s / 2, py - this.h * s / 2, this.w * s, this.h * s);
    ctx.globalAlpha = 1;
  }
}

export function addEffect(e, layer = 'top') { e.layer = layer; effects.push(e); return e; }

export function floatText(x, y, z, text, color = '#fff', size = 14, opts = {}) {
  if (texts.length > 120) texts.shift();
  texts.push({ x, y, z, text, color, size, life: opts.life || 0.9, max: opts.life || 0.9, vz: opts.vz ?? 45, dx: rand(-10, 10), crit: opts.crit, dmg: opts.dmg });
}

// --------------------------------------------------------- damage numbers
// Plain, heavy serif numbers with a black outline, rendered once at 1/PIX resolution for a chunky retro edge and cached.
// Hits drift up and fade. Crits are blood: dark red, they hang in the air while drips run off the glyphs and fall.
const DMG_STYLE = {
  hit: { size: 19, life: 0.95, pop: 1.12, fill: ['#e8dcc4', '#c8b898', '#8a7a62'] },
  crit: { size: 30, life: 2.1, pop: 1.3, fill: ['#e83020', '#a00a06', '#4a0202'], blood: true },
  hurt: { size: 17, life: 1, pop: 1.1, fill: ['#e05a40', '#b01810', '#5a0604'] },
  dot: { size: 13, life: 0.85, pop: 1 },
};
const PIX = 1.5;
// Numbers are put together from glyphs baked once per style/colour (an outline layer and a fill layer, so every fill
// sits over every outline as with one strokeText + fillText): a new value used to shape its text again, make two
// canvases and, for a crit, read its pixels back from the GPU to find the drip roots. Sprites the LRU drops are reused.
const numCache = new Map(), glyphSets = new Map(), numFree = [];
function glyphSet(style, color) {
  const key = style + '|' + (color || '');
  let G_ = glyphSets.get(key);
  if (G_) return G_;
  const S = DMG_STYLE[style], fs = Math.round(S.size / PIX), font = `900 ${fs}px Cinzel, Georgia, serif`;
  const o = Math.max(1, Math.round(fs * 0.12)), h = Math.ceil(fs * 1.25) + o * 2 + 4;
  G_ = { key, S, fs, font, o, h, cy: h / 2, ty: h / 2 + fs * 0.06, color, map: new Map() };
  // keep the fallback font out of the cache until Cinzel has loaded
  if (!document.fonts || document.fonts.check(font)) glyphSets.set(key, G_);
  return G_;
}
function glyph(gs, ch) {
  let e = gs.map.get(ch);
  if (e) return e;
  const { S, fs, font, o, h, ty } = gs, adv = measureCtx(font).measureText(ch).width, w = Math.ceil(adv) + o * 2 + 4;
  const prep = (c) => { const g = c.getContext('2d'); g.font = font; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round'; return g; };
  const line = makeCanvas(w, h), fill = makeCanvas(w, h);
  let g = prep(line); g.lineWidth = o * 2; g.strokeStyle = '#0a0303'; g.strokeText(ch, o + 2, ty);
  g = prep(fill);
  if (S.fill) {
    const lg = g.createLinearGradient(0, ty - fs * 0.45, 0, ty + fs * 0.45);
    lg.addColorStop(0, S.fill[0]); lg.addColorStop(0.5, S.fill[1]); lg.addColorStop(1, S.fill[2]);
    g.fillStyle = lg;
  } else g.fillStyle = gs.color || '#ffffff';
  g.fillText(ch, o + 2, ty);
  e = { line, fill, adv, w, low: null };
  if (S.blood) {   // the lowest inked pixel of each column (read once per glyph)
    const a = line.getContext('2d').getImageData(0, 0, w, h).data, b = g.getImageData(0, 0, w, h).data;
    e.low = new Int16Array(w).fill(-1);
    for (let x = 0; x < w; x++) for (let y = h - 1; y > gs.cy; y--) { const k = (y * w + x) * 4 + 3; if (a[k] > 200 || b[k] > 200) { e.low[x] = y; break; } }
  }
  if (glyphSets.get(gs.key) === gs) gs.map.set(ch, e);
  return e;
}
function numSprite(text, style, color) {
  const key = style + '|' + (color || '') + '|' + text;
  let c = numCache.get(key);
  if (c) { numCache.delete(key); numCache.set(key, c); return c; }
  const gs = glyphSet(style, color), { o, h } = gs, gl = [];
  let tw = 0;
  for (const ch of text) { const e = glyph(gs, ch); gl.push(e); tw += e.adv; }
  const w = Math.ceil(tw) + o * 2 + 4;
  c = numFree.pop() || makeCanvas(w, h);
  c.width = w; c.height = h; c.roots = null;   // (also clears a reused canvas)
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // centred like the whole-string text was: the pen starts where a centred string of width tw would
  const x0 = Math.round(w / 2 - tw / 2) - o - 2;
  for (const layer of ['line', 'fill']) { let pen = x0; for (const e of gl) { g.drawImage(e[layer], Math.round(pen), 0); pen += e.adv; } }
  if (gs.S.blood) {
    const low = new Int16Array(w).fill(-1), cx = w / 2, cy = gs.cy, roots = [];
    let pen = x0;
    for (const e of gl) { const p0 = Math.round(pen); for (let x = 0; x < e.w; x++) { const X = p0 + x; if (X >= 0 && X < w && e.low[x] > low[X]) low[X] = e.low[x]; } pen += e.adv; }
    for (let x = 2; x < w - 2; x++) if (low[x] >= 0) roots.push([x - cx, low[x] - cy]);
    c.roots = roots;
  }
  if (glyphSets.get(gs.key) === gs) {
    numCache.set(key, c);
    if (numCache.size > 400) { const k = numCache.keys().next().value, old = numCache.get(k); numCache.delete(k); if (numFree.length < 32) numFree.push(old); }
  }
  return c;
}

/** A damage number. style: hit | crit (bleeds) | hurt (damage the hero takes) | dot (colour = element glow). */
export function damageText(x, y, z, amount, style = 'hit', color = null) {
  const S = DMG_STYLE[style];
  if (texts.length > 120) texts.shift();
  const crit = style === 'crit';
  texts.push({
    x, y, z: z + rand(-4, 6), text: fmt(amount), color, style, life: S.life, max: S.life, dmg: true, comic: true,
    vz: style === 'dot' ? 24 : crit ? 14 : rand(38, 50), dx: rand(-12, 12), vx: rand(-1, 1) * (crit ? 2 : 6),
    drips: crit ? Array.from({ length: 4 + Math.floor(rand(0, 3)) }, () => ({ r: Math.random(), len: rand(4, 13), at: rand(0.05, 0.5), sp: rand(0.5, 1.1), w: rand(1, 2) | 0 || 1 })) : null,
  });
}

/** Blood running off a crit number, in sprite pixels around its centre (the caller scales to the screen). */
function drawDrips(ctx, t, spr, age) {
  if (!spr.roots || !spr.roots.length) return;
  for (const d of t.drips) {
    const [rx, ry] = spr.roots[Math.floor(d.r * spr.roots.length)];
    const k = Math.max(0, Math.min(1, (age - d.at) / d.sp));
    if (k <= 0) continue;
    const len = d.len * (1 - Math.pow(1 - k, 2));
    ctx.fillStyle = '#4a0202'; ctx.fillRect(rx - 1, ry - 1, d.w + 2, len + 2);
    ctx.fillStyle = '#9a0a06'; ctx.fillRect(rx, ry - 1, d.w, len);
    ctx.fillStyle = '#c81810'; ctx.fillRect(rx, ry + len - 1, d.w + 1, 2);   // the swelling bead
    if (k >= 1) {   // the bead lets go and falls
      const ft = age - d.at - d.sp, fy = ry + len + 2 + 60 * ft * ft;
      if (ft < 0.6) { ctx.fillStyle = '#8a0806'; ctx.fillRect(rx, fy, d.w + 1, 2); }
    }
  }
}

// light records are pooled: dozens are added every frame
const lightPool = [];
/** A light for this frame; `color` also tints the scene around it (render.js drawLighting's glow pass). */
export function addLight(x, y, radius, intensity = 1, z = 20, color = null) {
  if (lights.length >= 48) return;
  const l = lightPool[lights.length] || (lightPool[lights.length] = {});
  l.x = x; l.y = y; l.radius = radius; l.intensity = intensity; l.z = z; l.color = color;
  lights.push(l);
}

export function clearVfx() {
  particles.length = 0; spriteGibs = 0; evict = 0; dead = 0; decals.length = 0; bakedDecals.length = 0; effects.length = 0; texts.length = 0; lights.length = 0;
}

// --------------------------------------------------------------- update
export function updateVfx(dt, world) {
  // Bursts often expire hundreds of particles together. Compact once instead
  // of shifting the surviving array on every expired particle (quadratic work).
  let live = 0;
  for (const p of particles) {
    if (p.life <= 0) continue; // killed since the last update (kill() already counted its gib)
    p.life -= dt;
    if (p.life <= 0) { if (p.spr) spriteGibs--; }
    else particles[live++] = p;
  }
  particles.length = live; evict = 0; dead = 0;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    // Cyclone wind (and captured gib sprites) follow the caster's moving isometric spiral.
    if (p.vortex && !p.vortex.owner.dead) {
      const v = p.vortex;
      v.angle += v.omega * dt;
      v.radius = Math.max(v.gib ? 0.12 : 0.24, v.radius + v.radial * dt);
      p.vx = -Math.sin(v.angle) * v.radius * v.omega;
      p.vy = Math.cos(v.angle) * v.radius * v.omega;
      p.x = v.owner.x + Math.cos(v.angle) * v.radius;
      p.y = v.owner.y + Math.sin(v.angle) * v.radius;
      p.z = Math.min(110, p.z + v.rise * dt);
      p.rot += p.vr * dt;
      continue;
    }
    const drag = Math.max(0, 1 - p.drag * dt);
    p.vx *= drag; p.vy *= drag;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vz -= p.g * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
    if (p.type === 'blood') {
      if (p.z <= 0) {
        if (world && world.map.isFloor(p.x, p.y) && Math.random() < 0.55) addDecal(p.x, p.y, p.color, rand(0.12, 0.3) * p.size / 2);
        kill(p); // gone from the next update's compaction (a splice here was O(n) per landing drop)
      }
    } else if (p.type === 'gib') {
      if (world && !world.map.isFloor(p.x, p.y)) { p.vx *= -0.5; p.vy *= -0.5; p.x += p.vx * dt * 2; p.y += p.vy * dt * 2; }
      if (p.z <= 0) {
        p.z = 0;
        if (p.vz < -40 && p.bounces < 2) {
          p.vz *= -0.35; p.bounces++; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.5;
          if (p.blood) addDecal(p.x, p.y, p.blood, rand(0.25, 0.5));
        } else { p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; p.vr = 0; }
      } else if (p.blood && Math.random() < dt * 14) {
        spawn({ type: 'blood', x: p.x, y: p.y, z: p.z, vz: 0, g: 260, life: 1, size: 1.4, color: p.blood });
      }
    } else if (p.type !== 'smoke' && p.g > 0 && p.z < 0) { p.z = 0; p.vz *= -0.3; }
  }
  for (const d of decals) {
    if (d.grow < 1) d.grow = Math.min(1, d.grow + dt * 1.2);
    if (d.life < 9999) d.life -= dt;
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i];
    if (d.life <= 0) decals.splice(i, 1);
    else if (d.kind === 'pool' && d.grow >= 1) { decals.splice(i, 1); bake(d); } // a grown pool is finished blood
  }
  for (let i = effects.length - 1; i >= 0; i--) if (!effects[i].update(dt)) effects.splice(i, 1);
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt; t.z += t.vz * dt;
    if (t.comic) { t.vz *= Math.pow(0.03, dt); t.dx += t.vx * dt; } else t.vz *= 0.94;
    if (t.life <= 0) texts.splice(i, 1);
  }
}

// ----------------------------------------------------------------- draw
// a splat's translate/scale(1, .5)/rotate folded into one setTransform on the base matrix (5 state calls -> 1)
function drawSplat(ctx, d, s, ba, bb, bc, bd, be, bf) {
  const px = isoX(d.x, d.y), py = isoY(d.x, d.y);
  const c = d.cos ?? (d.cos = Math.cos(d.rot)), sn = d.sin ?? (d.sin = Math.sin(d.rot));
  const la = c, lb = 0.5 * sn, lc = -sn, ld = 0.5 * c;
  ctx.setTransform(ba * la + bc * lb, bb * la + bd * lb, ba * lc + bc * ld, bb * lc + bd * ld, ba * px + bc * py + be, bb * px + bd * py + bf);
  ctx.drawImage(d.spr || splatSprite(d.color, d.idx), -s, -s, s * 2, s * 2);
  ctx.setTransform(ba, bb, bc, bd, be, bf);
}

/** Stamp the baked decals with seq > `after` that touch the world rect into a floor chunk (its context carries the
 * chunk's world transform). Returns the last seq stamped. */
export function stampDecals(g, after, x0, y0, x1, y1) {
  const n = bakedDecals.length;
  if (!n || bakedDecals[n - 1].seq <= after) return after;
  let i = n - 1;
  while (i > 0 && bakedDecals[i - 1].seq > after) i--;
  const B = g.getTransform(), ba = B.a, bb = B.b, bc = B.c, bd = B.d, be = B.e, bf = B.f;
  for (; i < n; i++) {
    const d = bakedDecals[i], px = isoX(d.x, d.y), py = isoY(d.x, d.y);
    if (px + d.r < x0 || px - d.r > x1 || py + d.r < y0 || py - d.r > y1 || groundHidden(d.x, d.y)) continue;
    g.globalAlpha = d.alpha;
    drawSplat(g, d, d.size * HW * 1.6, ba, bb, bc, bd, be, bf);
  }
  g.globalAlpha = 1;
  return bakedDecals[n - 1].seq;
}

/** Live decals, plus baked ones over floor that isn't in a stamped chunk yet (`stamped(d)`: render.js). */
export function drawDecals(ctx, vr, stamped = null) {
  const B = ctx.getTransform(), ba = B.a, bb = B.b, bc = B.c, bd = B.d, be = B.e, bf = B.f;
  for (const d of bakedDecals) {
    const px = isoX(d.x, d.y), py = isoY(d.x, d.y);
    if (px < vr.x0 - 80 || px > vr.x1 + 80 || py < vr.y0 - 60 || py > vr.y1 + 60) continue;
    if ((stamped && stamped(d, px, py)) || groundHidden(d.x, d.y)) continue;
    ctx.globalAlpha = d.alpha;
    drawSplat(ctx, d, d.size * HW * 1.6, ba, bb, bc, bd, be, bf);
  }
  for (const d of decals) {
    const px = isoX(d.x, d.y), py = isoY(d.x, d.y);
    if (px < vr.x0 - 80 || px > vr.x1 + 80 || py < vr.y0 - 60 || py > vr.y1 + 60 || groundHidden(d.x, d.y)) continue;
    const s = d.size * HW * 1.6 * (d.kind === 'pool' ? 0.3 + 0.7 * d.grow : 1);
    let a = d.alpha;
    if (d.life < 3) a *= d.life / 3;
    ctx.globalAlpha = a;
    if (d.kind === 'splat' || d.kind === 'pool') drawSplat(ctx, d, s, ba, bb, bc, bd, be, bf);
    else if (d.kind === 'scorch') {
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.ellipse(px, py, s, s * 0.5, 0, 0, TAU); ctx.fill();
    } else if (d.kind === 'frost') {
      ctx.fillStyle = 'rgba(180,230,255,0.35)';
      ctx.beginPath(); ctx.ellipse(px, py, s, s * 0.5, 0, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawEffects(ctx, layer) {
  for (const e of effects) {
    if (e.layer !== layer) continue;
    if (e.add) ctx.globalCompositeOperation = 'lighter';
    e.draw(ctx);
    ctx.globalCompositeOperation = 'source-over';
  }
}

const FIRE = ['#fff4c0', '#ffd860', '#ff9a28', '#ff5a10', '#d02008', '#7a0a04']; // a 'flame' particle's colour over its life
export function drawParticles(ctx, vr) {
  let mode = 'source-over';
  const B = ctx.getTransform(), ba = B.a, bb = B.b, bc = B.c, bd = B.d, be = B.e, bf = B.f; // rotated particles reset to it (cheaper than a full save/restore each)
  for (const p of particles) {
    if (p.life <= 0) continue;
    const px = isoX(p.x, p.y), py = isoY(p.x, p.y) - p.z;
    if (px < vr.x0 - 20 || px > vr.x1 + 20 || py < vr.y0 - 40 || py > vr.y1 + 20) continue;
    const k = 1 - p.life / p.max;
    const size = p.size + (p.size1 - p.size) * k;
    const want = p.add ? 'lighter' : 'source-over';
    if (want !== mode) { ctx.globalCompositeOperation = want; mode = want; }
    switch (p.type) {
      case 'glow': {
        ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
        const s = size * 3;
        ctx.drawImage(glowSprite(p.color), px - s, py - s, s * 2, s * 2);
        break;
      }
      case 'flame': { // fire: white-yellow, orange, red, ember as it burns out; a soft lick, tall and narrow
        ctx.globalAlpha = 0.75 * Math.min(1, (1 - k) * 1.8);
        const s = size * 3;
        ctx.drawImage(glowSprite(FIRE[(k * FIRE.length) | 0]), px - s * 0.5, py - s * 1.5, s, s * 3);
        break;
      }
      case 'smoke':
        ctx.globalAlpha = (p.alpha ?? 0.4) * (1 - k);
        if (size > 0) ctx.drawImage(discSprite(p.color), px - size, py - size, size * 2, size * 2);
        break;
      case 'streak': {
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = p.color; ctx.lineWidth = size;
        const ex = isoX(p.x - p.vx * 0.05, p.y - p.vy * 0.05), ey = isoY(p.x - p.vx * 0.05, p.y - p.vy * 0.05) - p.z + p.vz * 0.05;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
        break;
      }
      case 'gib': {
        ctx.globalAlpha = Math.min(1, p.life);
        if (p.bone) { drawBoneGib(ctx, p, px, py); break; }
        if (p.spr) {
          const [sx, sy, sw, sh] = p.spr, w = sw * p.size, h = sh * p.size;
          ctx.translate(px, py); ctx.rotate(p.rot);
          ctx.drawImage(A.gibImg, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
          ctx.setTransform(ba, bb, bc, bd, be, bf);
          break;
        }
        ctx.translate(px, py); ctx.rotate(p.rot);
        ctx.fillStyle = '#100404'; ctx.fillRect(-size * p.w - 0.6, -size / 2 - 0.6, size * p.w * 2 + 1.2, size + 1.2);
        ctx.fillStyle = p.color; ctx.fillRect(-size * p.w, -size / 2, size * p.w * 2, size);
        ctx.fillStyle = p.shade || (p.shade = shade(p.color, 0.25)); ctx.fillRect(-size * p.w, -size / 2, size * p.w, size / 2.5);
        ctx.setTransform(ba, bb, bc, bd, be, bf);
        break;
      }
      case 'shard':
        ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color;
        ctx.translate(px, py); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(0, -size * 1.6); ctx.lineTo(size * 0.6, 0); ctx.lineTo(0, size * 1.6); ctx.lineTo(-size * 0.6, 0); ctx.fill();
        ctx.setTransform(ba, bb, bc, bd, be, bf);
        break;
      case 'skull': { // the Death Knight's casts and hits: the contact skull in frost, or a little pixel skull while it loads
        ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
        if (drawDkSkull(ctx, px, py, size * 2.4, p.color)) break;
        const u = Math.max(1, size / 3), x0 = px - u * 2.5, y0 = py - u * 3;
        ctx.fillStyle = p.color; ctx.fillRect(x0, y0, u * 5, u * 4); ctx.fillRect(x0 + u, y0 + u * 4, u * 3, u * 2);
        ctx.fillStyle = p.eye || '#102040'; ctx.fillRect(x0 + u * 0.6, y0 + u * 1.6, u * 1.4, u * 1.4); ctx.fillRect(x0 + u * 3, y0 + u * 1.6, u * 1.4, u * 1.4);
        ctx.fillRect(x0 + u * 2.2, y0 + u * 3.2, u * 0.6, u * 0.8); ctx.fillRect(x0 + u * 1.5, y0 + u * 5, u * 0.5, u); ctx.fillRect(x0 + u * 3, y0 + u * 5, u * 0.5, u);
        break;
      }
      case 'img':
        ctx.globalAlpha = 1 - k;
        ctx.drawImage(p.img, px - size / 2, py - size / 2, size, size);
        break;
      default:
        ctx.globalAlpha = p.type === 'blood' ? 1 : 1 - k * 0.6;
        ctx.fillStyle = p.color;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Floating combat text in screen space (call with identity transform). */
// Floating text with a black outline, baked once per text/font/colour while its size holds still (stroke + fill
// shape the glyphs again on every call; a fight keeps dozens of these up).
const textCache = new Map();
function outlinedText(text, font, color, lw) {
  const key = font + '|' + color + '|' + text;
  let c = textCache.get(key);
  if (c) return c;
  const m = measureCtx(font).measureText(text), pad = Math.ceil(lw) + 2, fs = parseFloat(font.split(' ')[1]) || 12;
  const asc = Math.ceil(m.actualBoundingBoxAscent || fs * 0.8), desc = Math.ceil(m.actualBoundingBoxDescent || fs * 0.25);
  c = makeCanvas(Math.ceil(m.width) + pad * 2, asc + desc + pad * 2);
  const g = c.getContext('2d');
  g.font = font; g.textAlign = 'center'; g.lineWidth = lw; g.strokeStyle = '#000';
  g.strokeText(text, c.width / 2, pad + asc); g.fillStyle = color; g.fillText(text, c.width / 2, pad + asc);
  c._ox = c.width / 2; c._oy = pad + asc;
  if (!document.fonts || document.fonts.check(font)) { textCache.set(key, c); if (textCache.size > 240) textCache.delete(textCache.keys().next().value); }
  return c;
}

export function drawTexts(ctx) {
  ctx.textAlign = 'center';
  const dpr = G.dpr, mob = G.touch ? 0.8 : 1;
  ctx.imageSmoothingEnabled = false;
  for (let pass = 0; pass < 2; pass++) { // crits over everything else
    for (const t of texts) {
      if (!t.comic || (t.style === 'crit') !== (pass === 1) || !G.settings.dmgNumbers) continue;
      const S = DMG_STYLE[t.style], age = t.max - t.life, k = t.life / t.max;
      const pin = Math.min(1, age / 0.12);
      let sc = 1 + (S.pop - 1) * Math.pow(1 - pin, 2);
      if (k < 0.2) sc *= 0.85 + 0.15 * (k / 0.2);
      const spr = numSprite(t.text, t.style, t.color);
      const [sx, sy] = camera.tileToScreen(t.x, t.y, t.z);
      ctx.globalAlpha = Math.min(1, k / 0.25);
      const f = PIX * dpr * sc * mob, w = spr.width * f, h = spr.height * f, tx = (sx + t.dx) * dpr, ty = sy * dpr;
      if (!t.drips) { ctx.drawImage(spr, tx - w / 2, ty - h / 2, w, h); continue; } // screen space: no transform needed
      ctx.save();
      ctx.translate(tx, ty);
      ctx.drawImage(spr, -w / 2, -h / 2, w, h);
      ctx.scale(f, f); drawDrips(ctx, t, spr, age);
      ctx.restore();
    }
  }
  ctx.imageSmoothingEnabled = true;
  for (const t of texts) {
    if (t.comic || (!G.settings.dmgNumbers && t.dmg)) continue;
    const [sx, sy] = camera.tileToScreen(t.x, t.y, t.z);
    const k = t.life / t.max;
    const pop = t.crit ? 1 + Math.max(0, (k - 0.75)) * 3 : 1;
    ctx.globalAlpha = Math.min(1, k * 2.5);
    const font = `${t.crit ? 900 : 700} ${Math.round(t.size * pop * G.dpr)}px Cinzel, Georgia, serif`;
    if (pop === 1) {
      const c = outlinedText(t.text, font, t.color, 3 * G.dpr);
      ctx.drawImage(c, Math.round((sx + t.dx) * G.dpr - c._ox), Math.round(sy * G.dpr - c._oy));
      continue;
    }
    ctx.font = font;
    ctx.lineWidth = 3 * G.dpr; ctx.strokeStyle = '#000';
    ctx.strokeText(t.text, (sx + t.dx) * G.dpr, sy * G.dpr);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, (sx + t.dx) * G.dpr, sy * G.dpr);
  }
  ctx.globalAlpha = 1;
}

export { pick };
