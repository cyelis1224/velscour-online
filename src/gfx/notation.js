// The Bard's notation art: procedural glyphs (notes, beamed groups, triplets, rests, clefs) cut into cached sprites,
// the wavy five-line staff of glowing particles that trails every note, cosmetic note flights for skills that are not
// projectiles, and the 4/4 measure over the Bard's head. Colours and particles step up at skill ranks 5/10/15/20.
import { G } from '../state.js';
import { makeCanvas, rand, TAU, chance } from '../core/util.js';
import { isoX, isoY, HW } from '../core/view.js';
import { glowSprite, spawn, addEffect, Ring } from './vfx.js';
import { NOTES, MEASURE } from '../data/notation.js';
import { melodies, sigAcc } from '../data/melodies.js';
import { drawn } from '../game/bardmusic.js';

// staff / glyph / glow / spark colours per tier (4 = rainbow staff and a gold glyph)
export const TIERS = [
  { staff: '#f2e6c4', note: '#fff8e2', glow: '#ffc860', spark: '#fff0b0' },
  { staff: '#7cd4ff', note: '#effaff', glow: '#3aa0ff', spark: '#c8f0ff' },
  { staff: '#62ffa4', note: '#effff5', glow: '#18d070', spark: '#c0ffd8' },
  { staff: '#ff72d2', note: '#fff0fb', glow: '#e028b4', spark: '#ffc8f0' },
  { staff: '#ffe070', note: '#fff2a0', glow: '#ffa818', spark: '#ffffff' },
];
const RAINBOW = ['#ff4a4a', '#ff8a2a', '#ffd030', '#c8ff30', '#50ff60', '#30ffb8', '#30e0ff', '#3a90ff', '#6a5aff', '#b048ff', '#ff48e0', '#ff4a9a'];
const OUT = '#1a0c22';

// ---------------------------------------------------------------- glyph paths (unit = 1 px at scale 1, centre 0,0)
function head(x, y, ctx, o, filled = true, big = false) {
  ctx.beginPath(); ctx.ellipse(x, y, (big ? 4.1 : 3.3) + o / 2, (big ? 2.7 : 2.35) + o / 2, big ? -0.12 : -0.38, 0, TAU);
  if (filled) ctx.fill();
  else {
    ctx.lineWidth = (big ? 2.3 : 1.6) + o; ctx.stroke();
    if (o) { ctx.beginPath(); ctx.ellipse(x, y, big ? 1.6 : 1.4, big ? 1.3 : 0.9, big ? 0.9 : -0.38, 0, TAU); ctx.lineWidth = o; ctx.stroke(); }
  }
}
function line(ctx, o, w, pts) { ctx.lineWidth = w + o; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); }
function flags(ctx, o, x, y, k) {
  ctx.lineWidth = 1.7 + o;
  for (let i = 0; i < k; i++) { const yy = y + i * 3.4; ctx.beginPath(); ctx.moveTo(x, yy); ctx.bezierCurveTo(x + 1, yy + 3, x + 5.6, yy + 3.6, x + 4.3, yy + 8.6); ctx.stroke(); }
}
function single(ctx, o, k) { head(-1.6, 5, ctx, o); line(ctx, o, 1.4, [1.45, 4.6, 1.45, -9.5]); if (k) flags(ctx, o, 1.45, -9.5, k); }
function beamed(ctx, o, n, k, trip) {
  const sp = n === 2 ? 9 : n === 3 ? 7.2 : 6.6, x0 = -((n - 1) * sp) / 2 - 1.5;
  for (let i = 0; i < n; i++) {
    const hx = x0 + i * sp, top = -9.5 - i * 0.5;
    head(hx, 5 - i * 0.5, ctx, o);
    line(ctx, o, 1.3, [hx + 3.05, 4.4 - i * 0.5, hx + 3.05, top]);
  }
  const xa = x0 + 3.05 - 0.6, xb = x0 + (n - 1) * sp + 3.05 + 0.6, ya = -9.5, yb = -9.5 - (n - 1) * 0.5;
  for (let j = 0; j < k; j++) {
    const d = j * 3.1;
    ctx.beginPath(); ctx.moveTo(xa - o / 2, ya + d - o / 2); ctx.lineTo(xb + o / 2, yb + d - o / 2); ctx.lineTo(xb + o / 2, yb + d + 2.1 + o / 2); ctx.lineTo(xa - o / 2, ya + d + 2.1 + o / 2); ctx.closePath(); ctx.fill();
  }
  if (trip) { // the bracketed "3" over a triplet
    const cx = (xa + xb) / 2, ty = yb - 4.2;
    line(ctx, o, 0.9, [xa, ty + 1.4, xa, ty, cx - 2.6, ty]); line(ctx, o, 0.9, [cx + 2.6, ty, xb, ty, xb, ty + 1.4]);
    ctx.font = 'bold 7px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (o) { ctx.lineWidth = o + 0.6; ctx.strokeText('3', cx, ty); } else ctx.fillText('3', cx, ty);
  }
}
function dot(ctx, o) { ctx.beginPath(); ctx.arc(4.6, 4.2, 1.3 + o / 2, 0, TAU); ctx.fill(); }
function restFlags(ctx, o, k) { // eighth / sixteenth / thirty-second rests: k dotted hooks on a slanted stem
  const top = -6 - (k - 1) * 2.1, x0 = 2.6 + (k - 1) * 0.8;
  line(ctx, o, 1.5, [x0 + 0.4, top - 1.4, -1.2 - (k - 1) * 0.6, 8]);
  for (let i = 0; i < k; i++) {
    const yy = top + i * 4.2, xx = x0 - i * 1.05;
    ctx.beginPath(); ctx.arc(xx - 4.4, yy - 0.6, 1.8 + o / 2, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.3 + o; ctx.beginPath(); ctx.moveTo(xx - 5, yy + 0.6); ctx.quadraticCurveTo(xx - 1.8, yy + 2, xx + 0.2, yy - 0.6); ctx.stroke();
  }
}
const DRAW = {
  q: (c, o) => single(c, o, 0), e: (c, o) => single(c, o, 1), s: (c, o) => single(c, o, 2),
  e2: (c, o) => beamed(c, o, 2, 1), s2: (c, o) => beamed(c, o, 2, 2), s3: (c, o) => beamed(c, o, 3, 2), s4: (c, o) => beamed(c, o, 4, 2),
  t8: (c, o) => beamed(c, o, 3, 1, true), t16: (c, o) => beamed(c, o, 3, 2, true), t32: (c, o) => beamed(c, o, 3, 3, true),
  w: (c, o) => head(0, 1, c, o, false, true),
  h: (c, o) => { head(-1.6, 5, c, o, false); line(c, o, 1.4, [1.6, 4.4, 1.6, -9.5]); },
  qd: (c, o) => { single(c, o, 0); dot(c, o); }, hd: (c, o) => { DRAW.h(c, o); dot(c, o); },
  rw: (c, o) => { line(c, o, 1, [-7, -2, 7, -2]); c.fillRect(-3.8 - o / 2, -2 - o / 2, 7.6 + o, 3.4 + o); },
  rh: (c, o) => { line(c, o, 1, [-7, 2, 7, 2]); c.fillRect(-3.8 - o / 2, -1.4 - o / 2, 7.6 + o, 3.4 + o); },
  rq: (c, o) => {
    c.lineWidth = 2.3 + o; c.beginPath(); c.moveTo(-1.6, -10); c.lineTo(2.6, -5.2); c.lineTo(-1.6, -0.8); c.lineTo(2.5, 3.6);
    c.bezierCurveTo(-2.4, 1.6, -3.2, 6.8, 0.6, 9.6); c.stroke();
  },
  re: (c, o) => restFlags(c, o, 1), rs: (c, o) => restFlags(c, o, 2), rt: (c, o) => restFlags(c, o, 3),
  treble: (c, o) => {
    c.lineWidth = 1.9 + o; c.beginPath(); c.moveTo(-1.9, 2.6);
    c.bezierCurveTo(-1.5, -1.4, 4.8, -0.8, 4.5, 2.8); c.bezierCurveTo(4.2, 6.8, -5.2, 7.4, -5.5, 1.8);
    c.bezierCurveTo(-5.8, -3.6, 2.6, -6.4, 2.8, -11.4); c.bezierCurveTo(2.9, -15.4, -0.6, -15.8, -0.9, -11.8);
    c.bezierCurveTo(-1.3, -7.6, 0.6, 2.4, 0.9, 10); c.bezierCurveTo(1, 13.2, -2.7, 13.6, -3.4, 11);
    c.stroke(); c.beginPath(); c.arc(-2.4, 10.4, 1.7 + o / 2, 0, TAU); c.fill();
  },
  bass: (c, o) => {
    c.beginPath(); c.arc(-4.4, -3.6, 2.3 + o / 2, 0, TAU); c.fill();
    c.lineWidth = 2.1 + o; c.beginPath(); c.moveTo(-6.2, -3.8); c.bezierCurveTo(-5.6, -9.4, 5.4, -9.6, 5.2, -2.4);
    c.bezierCurveTo(5, 3.8, -0.6, 8, -6, 10.4); c.stroke();
    c.beginPath(); c.arc(8.2, -5.4, 1.3 + o / 2, 0, TAU); c.arc(8.2, -0.8, 1.3 + o / 2, 0, TAU); c.fill();
  },
};

const K = 3, BOX = 40; // sprites are 40 units square at 3x for crisp scaling
const sprites = new Map();
/** Cached square sprite of a glyph in one colour (BOX*K px). */
export function glyphSprite(id, col) {
  const key = id + col;
  let c = sprites.get(key);
  if (c) return c;
  c = makeCanvas(BOX * K, BOX * K);
  const x = c.getContext('2d');
  x.translate(BOX * K / 2, BOX * K / 2); x.scale(K, K); x.lineCap = 'round'; x.lineJoin = 'round';
  const f = DRAW[id] || DRAW.q;
  x.fillStyle = x.strokeStyle = OUT; x.globalAlpha = 0.9; f(x, 2);
  x.fillStyle = x.strokeStyle = col; x.globalAlpha = 1; f(x, 0);
  sprites.set(key, c);
  return c;
}
/** Draw glyph `id` centred at screen (x, y): s = scale (1 = a quarter note about 20 px tall), rot in radians. */
export function drawGlyph(ctx, id, x, y, s, col, rot = 0, alpha = 1) {
  const spr = glyphSprite(id, col), d = BOX * s;
  ctx.globalAlpha = alpha;
  if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(spr, -d / 2, -d / 2, d, d); ctx.restore(); }
  else ctx.drawImage(spr, x - d / 2, y - d / 2, d, d);
  ctx.globalAlpha = 1;
}
/** A projectile-sized glyph with its halo (used by drawShape for any 'n_*' fx: orbiters, rain, minion notes). */
export function drawNoteShape(ctx, id, s, t, tier = 0) {
  const T = TIERS[tier] || TIERS[0], r = 12 * s;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.42;
  ctx.drawImage(glowSprite(T.glow), -r, -r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  drawGlyph(ctx, id, 0, 0, s * 1.15, T.note, Math.sin(t * 7 + s) * 0.22);
}

// ---------------------------------------------------------------- the particle staff
/**
 * Five wavy staff lines of glowing particles through screen points `pts` (newest first): tier colours,
 * t = time (the wave travels), s = scale, alpha; fade = thin out toward the tail. Lines are offset perpendicular to the path.
 */
export function drawStaff(ctx, pts, tier, t, s = 1, alpha = 1, seed = 0, fade = true) {
  const n = pts.length;
  if (n < 2) return;
  const T = TIERS[tier] || TIERS[0], gap = 2.6 * s, amp = (1.1 + tier * 0.75) * s, step = G.touch ? 2 : 1;
  const dot = (1.5 + tier * 0.3) * s;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.lineWidth = tier >= 2 ? 1.3 : 1;
  for (let li = 0; li < 5; li++) {
    const col = tier === 4 ? RAINBOW[(li * 2 + Math.floor(t * 9)) % 12] : T.staff;
    const spr = glowSprite(col);
    ctx.strokeStyle = col;
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = a[0] - b[0], dy = a[1] - b[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.01) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
      const k = fade ? i / (n - 1) : 0;
      const off = (li - 2) * gap * (1 + k * 0.35) + Math.sin(i * 0.8 - t * 9 + seed + li * 0.35) * amp * (fade ? Math.min(1, i / 3) : 1);
      const x = pts[i][0] - dy * off, y = pts[i][1] + dx * off;
      xs.push(x); ys.push(y);
      if (i % step === 0) { ctx.globalAlpha = alpha * (1 - k); const r = dot * (1 - k * 0.5) * 2.2; ctx.drawImage(spr, x - r, y - r, r * 2, r * 2); }
    }
    // the thin line under the dots, in one stroke (its far half fainter)
    const half = Math.ceil(n / 2);
    for (let h = 0; h < 2; h++) {
      ctx.globalAlpha = alpha * (h ? (fade ? 0.18 : 0.45) : 0.45);
      ctx.beginPath();
      for (let i = h ? half - 1 : 0; i < (h ? n : half); i++) i === (h ? half - 1 : 0) ? ctx.moveTo(xs[i], ys[i]) : ctx.lineTo(xs[i], ys[i]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Tier particles shed by a flying note (motes, falling mini notes, light, rainbow sparks). */
export function noteParticles(x, y, z, tier, dt, s = 1) {
  if (tier <= 0) { if (chance(dt * 4)) spawn({ type: 'glow', x, y, z, vz: rand(-6, 6), life: 0.35, size: 1.6 * s, size1: 0, color: TIERS[0].spark, add: true }); return; }
  const T = TIERS[tier], mob = G.touch ? 0.5 : 1;
  if (chance(dt * 12 * mob)) spawn({ type: 'glow', x: x + rand(-0.15, 0.15), y: y + rand(-0.15, 0.15), z: z + rand(-6, 6), vz: rand(-10, 25), drag: 2, life: rand(0.3, 0.6), size: rand(1.4, 2.4) * s, size1: 0, color: T.spark, add: true });
  if (tier >= 2 && chance(dt * 3.5 * mob)) spawn({ type: 'img', img: glyphSprite(['q', 'e', 's', 'e2'][Math.floor(rand(4))], tier === 4 ? RAINBOW[Math.floor(rand(12))] : T.staff), x, y, z, vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.6), vz: rand(10, 40), g: 30, life: rand(0.6, 1), size: rand(14, 20) * s, size1: 6 });
  if (tier >= 4 && chance(dt * 14 * mob)) { const a = rand(TAU); spawn({ type: 'streak', x, y, z, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, vz: rand(-20, 40), drag: 3, life: 0.35, size: 1.6, color: RAINBOW[Math.floor(rand(12))], add: true }); }
}

/** A burst of glyphs and motes where a note lands or a cadence plays. */
export function noteBurst(x, y, z, tier, n = 6, glyphs = ['q', 'e', 's', 'e2']) {
  const T = TIERS[tier] || TIERS[0], mob = G.touch ? 0.6 : 1;
  for (let i = 0; i < n * mob; i++) {
    const a = rand(TAU), v = rand(1, 3);
    spawn({ type: 'img', img: glyphSprite(glyphs[i % glyphs.length], tier === 4 ? RAINBOW[i % 12] : T.staff), x, y, z: z + rand(-4, 8), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(40, 110), g: 120, drag: 1.2, life: rand(0.6, 1.1), size: rand(14, 22), size1: 4 });
  }
  for (let i = 0; i < n * 1.5 * mob; i++) { const a = rand(TAU), v = rand(1.5, 4); spawn({ type: 'glow', x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(-20, 60), drag: 2, life: rand(0.3, 0.7), size: rand(1.5, 3), size1: 0, color: i % 2 ? T.spark : T.glow, add: true }); }
}

// ---------------------------------------------------------------- cosmetic note flights
/** A glyph with its staff flying from one point to another (tile coords + z): the visible "shot" of non-projectile skills. */
export class NoteFlight {
  constructor(o) {
    Object.assign(this, { t: 0, dur: 0.45, arc: 0, s: 1, tier: 0, glyph: 'q', delay: 0, seed: rand(TAU), burst: 4 }, o);
    this.hist = []; this.x = this.x0; this.y = this.y0; this.z = this.z0;
  }
  update(dt) {
    if (this.delay > 0) { this.delay -= dt; return true; }
    this.t += dt;
    const k = Math.min(1, this.t / this.dur), e = this.ease ? 1 - (1 - k) * (1 - k) : k;
    this.x = this.x0 + (this.x1 - this.x0) * e; this.y = this.y0 + (this.y1 - this.y0) * e;
    this.z = this.z0 + (this.z1 - this.z0) * e + this.arc * 4 * k * (1 - k);
    const h = this.hist;
    h.unshift([this.x, this.y, this.z]); if (h.length > 14) h.pop();
    noteParticles(this.x, this.y, this.z, this.tier, dt, this.s);
    if (k >= 1) { if (this.burst) noteBurst(this.x, this.y, this.z, this.tier, this.burst, [this.glyph]); return false; }
    return true;
  }
  draw(ctx) {
    if (this.delay > 0 || !this.hist.length) return;
    const pts = this.hist.map(([x, y, z]) => [isoX(x, y), isoY(x, y) - z]);
    drawStaff(ctx, pts, this.tier, this.t, this.s, 0.9, this.seed);
    ctx.save(); ctx.translate(pts[0][0], pts[0][1]); drawNoteShape(ctx, this.glyph, this.s, this.t, this.tier); ctx.restore();
  }
}
export const flyNote = (o) => addEffect(new NoteFlight(o));

// ---------------------------------------------------------------- engraving: the measure as real sheet music
// Steps count staff positions from the bottom line (0) up (middle line = step 4, top line = step 8); u = line spacing.
const CLEF_BOTTOM = { treble: 30, bass: 18 };   // diatonic index (octave*7 + letter) of the bottom line: E4 / G2
export const staffStep = (clef, L) => L - (CLEF_BOTTOM[clef] ?? 30);
const SIG_STEPS = { 1: [8, 5, 9, 6, 3, 7, 4], [-1]: [4, 7, 3, 6, 2, 5, 1] };   // treble; the bass clef sits two steps lower
const BEAMS = { e: 1, s: 2, e2: 1, s2: 2, s3: 2, s4: 2, t8: 1, t16: 2, t32: 3 };
const TRIP = { t8: 1, t16: 1, t32: 1 };
const mod7 = (n) => ((n % 7) + 7) % 7;

function accidental(ctx, a, x, y, u) {
  const thin = Math.max(0.7, u * 0.11), thick = Math.max(1, u * 0.3);
  ctx.beginPath();
  if (a > 0) { // sharp: two uprights, two rising bars
    ctx.lineWidth = thin;
    ctx.moveTo(x - 0.22 * u, y - 1.1 * u); ctx.lineTo(x - 0.22 * u, y + 1.3 * u);
    ctx.moveTo(x + 0.22 * u, y - 1.3 * u); ctx.lineTo(x + 0.22 * u, y + 1.1 * u); ctx.stroke();
    ctx.lineWidth = thick; ctx.beginPath();
    ctx.moveTo(x - 0.5 * u, y - 0.25 * u); ctx.lineTo(x + 0.5 * u, y - 0.55 * u);
    ctx.moveTo(x - 0.5 * u, y + 0.55 * u); ctx.lineTo(x + 0.5 * u, y + 0.25 * u); ctx.stroke();
  } else if (a < 0) { // flat: a tall stem and a bowl on the line
    ctx.lineWidth = Math.max(0.8, u * 0.16);
    ctx.moveTo(x - 0.3 * u, y - 1.75 * u); ctx.lineTo(x - 0.3 * u, y + 0.5 * u);
    ctx.bezierCurveTo(x + 0.35 * u, y + 0.05 * u, x + 0.85 * u, y - 0.5 * u, x + 0.25 * u, y - 0.55 * u);
    ctx.quadraticCurveTo(x - 0.05 * u, y - 0.5 * u, x - 0.3 * u, y - 0.2 * u); ctx.stroke();
  } else { // natural
    ctx.lineWidth = thin;
    ctx.moveTo(x - 0.28 * u, y - 1.3 * u); ctx.lineTo(x - 0.28 * u, y + 0.55 * u);
    ctx.moveTo(x + 0.28 * u, y - 0.55 * u); ctx.lineTo(x + 0.28 * u, y + 1.3 * u); ctx.stroke();
    ctx.lineWidth = thick * 0.85; ctx.beginPath();
    ctx.moveTo(x - 0.28 * u, y - 0.2 * u); ctx.lineTo(x + 0.28 * u, y - 0.45 * u);
    ctx.moveTo(x - 0.28 * u, y + 0.45 * u); ctx.lineTo(x + 0.28 * u, y + 0.2 * u); ctx.stroke();
  }
}
function notehead(ctx, x, y, u, hollow, whole) {
  ctx.beginPath(); ctx.ellipse(x, y, (whole ? 0.78 : 0.62) * u, 0.45 * u, whole ? 0 : -0.35, 0, TAU);
  if (!hollow) { ctx.fill(); return; }
  ctx.lineWidth = Math.max(0.8, u * (whole ? 0.26 : 0.19)); ctx.stroke();
}
/** Glyph paths reused from the projectile art (rests, clefs), placed on the staff: k = units -> px. */
function path(ctx, id, x, y, k) { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); DRAW[id](ctx, 0); ctx.restore(); }
function rest(ctx, g, x, Y, u) {
  if (g === 'rw') ctx.fillRect(x - 0.6 * u, Y(6), 1.2 * u, 0.5 * u);                  // hangs from the fourth line
  else if (g === 'rh') ctx.fillRect(x - 0.6 * u, Y(4) - 0.5 * u, 1.2 * u, 0.5 * u);   // sits on the middle line
  else path(ctx, g, x, Y(4) + (g === 'rq' ? 0 : 0.25 * u), u * (g === 'rq' ? 0.18 : 0.15));
}
/** Highest and lowest staff step a measure's ink reaches (stems and flags included). */
export function measureSpan(clef, notes) {
  let hi = 8, lo = 0;
  for (const n of notes) for (const h of n.heads || []) {
    const s = staffStep(clef, h.L), up = s < 4;
    hi = Math.max(hi, s + (up ? 7 : 1)); lo = Math.min(lo, s - (up ? 1 : 7));
  }
  return [hi, lo];
}
/** Width of the clef + key signature + time signature, in line spacings. */
const headerU = (key) => 2.9 + Math.abs(key ? key.sig : 0) * 0.85 + 1.9;
/** x of beat position `b` (0..4) in a measure drawn at x with width w. */
export const measureX = (x, w, u, key, b) => { const x0 = x + headerU(key) * u + 1.2 * u; return x0 + (b / MEASURE) * (x + w - 1.4 * u - x0); };

/**
 * Engrave one 4/4 measure: staff, clef, key signature, 4/4, then each written note at its true pitch and its beat
 * position (proportional spacing): accidentals against the key signature and earlier ones in the bar, ledger lines,
 * stems (up below the middle line), flags, beamed groups, triplet numbers, rests. top = y of the top line.
 * o.play = playhead beat (notes it has passed light up), o.colOf(note, lit) picks note colours.
 */
export function drawMeasure(ctx, o) {
  const { x, top, w, u, clef = 'treble', key, notes = [], col, play = -1, final = false } = o;
  const Y = (s) => top + (8 - s) * u / 2, X = (b) => measureX(x, w, u, key, b);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(0.9, u * 0.1);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { ctx.moveTo(x, Y(i * 2)); ctx.lineTo(x + w, Y(i * 2)); }
  ctx.moveTo(x + w, Y(8)); ctx.lineTo(x + w, Y(0)); ctx.stroke();
  if (final) { ctx.lineWidth = Math.max(1.4, u * 0.42); ctx.beginPath(); ctx.moveTo(x + w - 0.5 * u, Y(8)); ctx.lineTo(x + w - 0.5 * u, Y(0)); ctx.stroke(); }
  // clef: the treble curl wraps the G line, the bass dots straddle the F line
  if (clef === 'bass') path(ctx, 'bass', x + 1.4 * u, Y(6) + 3.1 * 0.17 * u, 0.17 * u);
  else path(ctx, 'treble', x + 1.3 * u, Y(2) - 2.6 * 0.215 * u, 0.215 * u);
  let hx = x + 2.9 * u;
  if (key && key.sig) {
    const a = Math.sign(key.sig), st = SIG_STEPS[a];
    for (let i = 0; i < Math.abs(key.sig); i++) accidental(ctx, a, hx + (i + 0.4) * 0.85 * u, Y(st[i] - (clef === 'bass' ? 2 : 0)), u);
    hx += Math.abs(key.sig) * 0.85 * u;
  }
  ctx.font = `bold ${Math.round(u * 2.3)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('4', hx + 0.9 * u, Y(6) + 0.1 * u); ctx.fillText('4', hx + 0.9 * u, Y(2) + 0.1 * u);
  const cur = {};   // accidentals in force this bar, per staff position
  const stemW = Math.max(0.8, u * 0.12), beamT = Math.max(1.2, u * 0.45);
  for (const n of notes) {
    const N = NOTES[n.g];
    if (!N || N.clef) continue;
    const lit = play >= 0 && play >= n.at - 1e-6, c = o.colOf ? o.colOf(n, lit) : col;
    ctx.fillStyle = ctx.strokeStyle = c;
    if (N.rest) { rest(ctx, n.g, n.g === 'rw' ? X(2) : X(n.at) + 0.2 * u, Y, u); continue; }   // a whole-bar rest sits mid-bar
    const hs = n.heads.map((h) => ({ s: staffStep(clef, h.L), L: h.L, acc: h.acc, x: X(h.at) }));
    for (const h of hs) { // accidentals, then ledger lines
      const want = h.L in cur ? cur[h.L] : (key ? sigAcc(key, mod7(h.L)) : 0);
      if (h.acc !== want) { accidental(ctx, h.acc, h.x - 1.25 * u, Y(h.s), u); cur[h.L] = h.acc; }
      ctx.lineWidth = Math.max(0.7, u * 0.1); ctx.beginPath();
      for (let s = -2; s >= h.s; s -= 2) { ctx.moveTo(h.x - 0.95 * u, Y(s)); ctx.lineTo(h.x + 0.95 * u, Y(s)); }
      for (let s = 10; s <= h.s; s += 2) { ctx.moveTo(h.x - 0.95 * u, Y(s)); ctx.lineTo(h.x + 0.95 * u, Y(s)); }
      ctx.stroke();
    }
    for (const h of hs) notehead(ctx, h.x, Y(h.s), u, n.g === 'h' || n.g === 'hd' || n.g === 'w', n.g === 'w');
    if (n.g === 'qd' || n.g === 'hd') for (const h of hs) { // the augmentation dot sits in a space
      ctx.beginPath(); ctx.arc(h.x + 1.15 * u, Y(h.s % 2 ? h.s : h.s + 1), 0.22 * u, 0, TAU); ctx.fill();
    }
    if (n.g === 'w') continue;
    const k = BEAMS[n.g] || 0;
    ctx.lineWidth = stemW;
    if (hs.length === 1) {
      const h = hs[0], up = h.s < 4, sx = h.x + (up ? 0.56 : -0.56) * u, ey = Y(h.s) + (up ? -3.4 : 3.4) * u;
      ctx.beginPath(); ctx.moveTo(sx, Y(h.s)); ctx.lineTo(sx, ey); ctx.stroke();
      ctx.lineWidth = Math.max(0.9, u * 0.26);
      for (let i = 0; i < k; i++) { // flags always fly to the right
        const dd = up ? 1 : -1, y0 = ey + dd * i * 0.8 * u;
        ctx.beginPath(); ctx.moveTo(sx, y0); ctx.bezierCurveTo(sx + 0.15 * u, y0 + dd * 0.9 * u, sx + 1.15 * u, y0 + dd * 1.1 * u, sx + 0.9 * u, y0 + dd * 2.1 * u); ctx.stroke();
      }
      continue;
    }
    // a beamed group: one stem direction, a straight beam that keeps every stem at least 2.8 spaces long
    const up = hs.reduce((a, h) => a + h.s, 0) / hs.length < 4, d = up ? -1 : 1;
    const xs = hs.map((h) => h.x + (up ? 0.56 : -0.56) * u), x0 = xs[0], x1 = xs[xs.length - 1];
    const natural = hs.map((h) => Y(h.s) + d * 3.3 * u);
    const slope = Math.max(-0.22, Math.min(0.22, (natural[natural.length - 1] - natural[0]) / Math.max(1, x1 - x0)));
    let b0 = natural[0];
    hs.forEach((h, i) => { const need = Y(h.s) + d * 2.8 * u - slope * (xs[i] - x0); b0 = up ? Math.min(b0, need) : Math.max(b0, need); });
    const by = (xx) => b0 + slope * (xx - x0);
    ctx.beginPath(); hs.forEach((h, i) => { ctx.moveTo(xs[i], Y(h.s)); ctx.lineTo(xs[i], by(xs[i])); }); ctx.stroke();
    for (let j = 0; j < k; j++) { // beams stack toward the heads
      const t0 = by(x0) - d * j * 0.75 * u - (up ? 0 : beamT), t1 = by(x1) - d * j * 0.75 * u - (up ? 0 : beamT);
      ctx.beginPath(); ctx.moveTo(x0 - stemW / 2, t0); ctx.lineTo(x1 + stemW / 2, t1); ctx.lineTo(x1 + stemW / 2, t1 + beamT); ctx.lineTo(x0 - stemW / 2, t0 + beamT); ctx.closePath(); ctx.fill();
    }
    if (TRIP[n.g]) { // the triplet's 3 on the beam side
      const mx = (x0 + x1) / 2;
      ctx.font = `italic bold ${Math.max(6, Math.round(u * 1.7))}px Georgia, serif`;
      ctx.fillText('3', mx, by(mx) + d * 1.1 * u + (up ? 0 : beamT));
    }
  }
  if (play >= 0 && play <= MEASURE + 0.01) { // the playhead
    const px = X(Math.min(MEASURE, play));
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.8;
    ctx.fillStyle = col; ctx.fillRect(px - 0.2 * u, Y(10), 0.4 * u, Y(-2) - Y(10));
    ctx.globalAlpha *= 0.35; ctx.fillRect(px - u, Y(9), 2 * u, Y(-1) - Y(9));
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the measure over the Bard's head
const HARM = ['#f2e6c4', '#7cd4ff', '#62ffa4', '#ffd84a', '#ff72d2', '#ffffff'];
const melodyOf = (sc) => (sc && sc.song) || melodies()[sc && sc.mel >= 0 ? sc.mel : 0];   // a Music Sheet's song, or the bar's melody
/** Layout of the Bard's composing staff (world px): left x, top line y, width, line spacing. */
export function scoreLayout(p) {
  const u = G.touch ? 4 : 5, w = G.touch ? 140 : 172;
  return { u, w, x: isoX(p.x, p.y) - w / 2, top: isoY(p.x, p.y) - (p.spriteH || 60) - 34 - 4 * u };
}
/** Screen position (world px) of beat position `at` on the Bard's staff. */
export function scoreSlot(p, at) {
  const L = scoreLayout(p);
  return [measureX(L.x, L.w, L.u, melodyOf(p.score).key, at), L.top + 2 * L.u];
}
/** Tile-space offset (dx, dy, z) of a staff slot, so cadence notes can launch from the very spot they were written. */
export function scoreWorld(p, at) {
  const [sx, sy] = scoreSlot(p, at), bx = isoX(p.x, p.y), by = isoY(p.x, p.y);
  const d = (sx - bx) / (2 * HW);
  return [p.x + d, p.y - d, by - sy];
}
export class ScoreFx {
  constructor(p) { this.p = p; this.layer = 'top'; this.t = 0; }
  update(dt) { this.t += dt; return !this.p.dead && this.p.score && this.p.world; }
  draw(ctx) {
    const p = this.p, sc = p.score;
    if (!sc || (p.world && p.world.kind === 'town') || G.settings.bardScore === false) return;
    const { u, w, x, top } = scoreLayout(p), J = melodyOf(sc), pl = sc.play, live = pl && !pl.done && pl.w === p.world && pl.w.hazards.includes(pl);
    // one song at a time: while the written bar is performed it takes the staff's place and nothing new is written;
    // during its finishing bar the next bar is written (silently) on the staff again
    const playing = live && pl.t < pl.lock + 0.25, base = playing ? 0 : 1, notes = drawn(sc.notes);
    const busy = sc.notes.length || sc.flash > 0 || sc.discord > 0, a = busy ? 1 : 0.5;
    const shake = sc.discord > 0 ? Math.sin(this.t * 70) * 2.5 * sc.discord : 0;
    const col = sc.discord > 0 ? '#ff5050' : HARM[Math.min(5, sc.harmony)];
    const [hi, lo] = measureSpan(sc.key, notes);
    ctx.save();
    ctx.translate(shake, 0);
    // a dark card so the notation reads over any floor, sized to the ink (ledger lines, stems)
    const cy0 = top - Math.max(0, hi - 8) * u / 2 - 1.4 * u, cy1 = top + 4 * u + Math.max(0, -lo) * u / 2 + 2.6 * u;
    ctx.globalAlpha = 0.72 * a * base; ctx.fillStyle = '#0a0610';
    ctx.fillRect(x - 4, cy0, w + 8, cy1 - cy0);
    const fill = Math.min(1, sc.beats / MEASURE);
    if (fill > 0) {
      const f0 = measureX(x, w, u, J.key, 0) - 0.9 * u, f1 = measureX(x, w, u, J.key, MEASURE) - 0.9 * u;
      ctx.globalAlpha = 0.14 * a * base; ctx.fillStyle = col; ctx.fillRect(f0, top - u, (f1 - f0) * fill, 6 * u);
    }
    ctx.globalAlpha = (0.85 + 0.15 * sc.flash) * a * base;
    drawMeasure(ctx, { x, top, w, u, clef: sc.key, key: J.key, notes, col: sc.flash > 0.5 ? '#ffffff' : col, colOf: (n) => TIERS[n.tier].note });
    if (live && !playing && !G.touch) { // the finishing bar plays on: its name over the staff
      ctx.globalAlpha = Math.min(1, (pl.end - pl.t) / 0.4) * 0.9 * base; ctx.font = 'italic 8px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffd88a';
      ctx.fillText(`♪ ${pl.M.name}`, x + w / 2, cy0 - 2);
    }
    // harmony pips
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = (i < sc.harmony ? 1 : 0.25) * a * base; ctx.fillStyle = i < sc.harmony ? HARM[Math.min(5, i + 1)] : '#806a80';
      ctx.beginPath(); ctx.arc(x + w / 2 - 10 + i * 5, cy1 - 2.5, 1.5, 0, TAU); ctx.fill();
    }
    // the measure being performed floats above, read by a playhead
    if (playing) {
      const [phi, plo] = measureSpan(pl.clef, pl.drawn), k = 1, out = Math.max(0, Math.min(1, (pl.lock + 0.25 - pl.t) / 0.25));
      const ptop = top, beat = pl.t / pl.spb;
      const py0 = ptop - Math.max(0, phi - 8) * u / 2 - (G.touch ? 1.4 * u : 3.6 * u), py1 = ptop + 4 * u + Math.max(0, -plo) * u / 2 + 1.4 * u;
      ctx.globalAlpha = 0.75 * k * out; ctx.fillStyle = '#0a0610'; ctx.fillRect(x - 4, py0, w + 8, py1 - py0);
      ctx.globalAlpha = k * out;
      if (!G.touch) {
        ctx.font = 'italic 8px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffd88a';
        ctx.fillText(`♪ ${pl.M.name}`, x + w / 2, py0 + 8);
      }
      const gold = TIERS[4].note;
      drawMeasure(ctx, { x, top: ptop, w, u, clef: pl.clef, key: pl.M.key, notes: pl.drawn, col: '#fff2c8', play: beat, final: true,
        colOf: (n, lit) => (lit ? (beat - n.at < 0.5 ? '#ffffff' : gold) : 'rgba(255,248,226,0.55)') });
      // a glow on each note as the playhead strikes it
      ctx.globalCompositeOperation = 'lighter';
      for (const n of pl.drawn) for (const h of n.heads || []) {
        const since = beat - h.at;
        if (since < 0 || since > 0.6) continue;
        const gx = measureX(x, w, u, pl.M.key, h.at), gy = ptop + (8 - staffStep(pl.clef, h.L)) * u / 2, r = u * (3 - since * 3);
        ctx.globalAlpha = (1 - since / 0.6) * 0.8 * out; ctx.drawImage(glowSprite(TIERS[n.tier].glow), gx - r, gy - r, r * 2, r * 2);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
/** A Music Sheet's icon: a curled page of parchment with a staff; written ones carry notes, locked ones a wax seal. */
const sheetIcons = new Map();
export function sheetIcon(item, size = 48) {
  const key = `${item.locked ? 1 : 0}${item.text && item.text.trim() ? 1 : 0}|${size}`;
  let c = sheetIcons.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const x = c.getContext('2d'), k = size / 48;
  x.save(); x.translate(size / 2, size / 2); x.rotate(-0.12); x.scale(k, k);
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(-14, -17, 30, 38);
  const g = x.createLinearGradient(-15, -19, 15, 19); g.addColorStop(0, '#f4e6c0'); g.addColorStop(1, '#c8aa72');
  x.fillStyle = g; x.beginPath(); x.moveTo(-16, -19); x.lineTo(13, -19); x.quadraticCurveTo(17, -19, 15, -15); x.lineTo(15, 19); x.lineTo(-12, 19); x.quadraticCurveTo(-17, 19, -16, 15); x.closePath(); x.fill();
  x.strokeStyle = '#6a4a26'; x.lineWidth = 1.2; x.stroke();
  x.strokeStyle = 'rgba(60,40,24,0.75)'; x.lineWidth = 0.8;
  for (const y0 of [-13, 2]) for (let l = 0; l < 5; l++) { x.beginPath(); x.moveTo(-12, y0 + l * 2.4); x.lineTo(12, y0 + l * 2.4); x.stroke(); }
  if (item.text && item.text.trim()) { drawGlyph(x, 'e2', -4, -9, 0.75, '#2a1a0c'); drawGlyph(x, 'q', 6, -11, 0.75, '#2a1a0c'); drawGlyph(x, 's2', 0, 6, 0.75, '#2a1a0c'); }
  if (item.locked) {
    x.fillStyle = '#9a1a1a'; x.beginPath(); x.arc(9, 14, 6, 0, TAU); x.fill();
    x.fillStyle = '#d84040'; x.beginPath(); x.arc(8, 13, 3.6, 0, TAU); x.fill();
    drawGlyph(x, 'e', 8.5, 13.5, 0.4, '#ffd88a');
  }
  x.restore();
  sheetIcons.set(key, c);
  return c;
}

/** A ring of glyphs springing off the staff when a measure completes. */
export function cadenceFx(p, tier, glyphs) {
  addEffect(new Ring(p.x, p.y, 0.2, 2.4, 0.5, TIERS[tier].glow, 4, { fill: true }));
  addEffect(new Ring(p.x, p.y, 0.1, 3.2, 0.7, TIERS[tier].staff, 2));
  const [wx, wy, wz] = scoreWorld(p, 2);
  noteBurst(wx, wy, wz, tier, 8, glyphs.length ? glyphs : ['q']);
}
