// Death Knight: the Runeblade. A spectral greatsword flies round him like a familiar, with six rune slots down its
// blade. His blows carve runes into it by their nature: frost (cold, the Frost tree), unholy (shadow, poison, Unholy),
// blood (blood, the Blood tree). Six runes and the blade swells to giant size for RUNIC OBLITERATION, one colossal
// cleave. The runes decide what follows: mostly frost freezes everything it struck, mostly unholy bursts into plague,
// mostly blood drinks their life back into him. All six of one kind is PERFECT: half again as strong.
// The sword is a 3D model (src/gfx/runeblade3d.js, docs/RUNEBLADE_3D.md). As a familiar it flies one of fifteen idle
// patterns round him (PATTERNS, a new one every few seconds, now and then one that dances 2-3 tiles out), swings its
// own way for each kind of skill he casts (SWINGS) and fights on its own with five sword skills (PET: Runic Lunge,
// Reaping Arc, Grave Plunge, Blade Waltz, Wheel of Rime). It twirls when it takes a rune, and the same model, scaled up, makes the Obliteration swing. Its
// skin changes every 10 levels and its palette every 50 (runebladeLook), announced as the blade is reforged.
const look = (p) => runebladeLook((p === G.player && G.char ? G.char.level : p.level) || 1);
import { G, stat, power, sigO, crowd, toughest, foesNear, glow, rand, TAU } from './common.js';
import { isoX, isoY, camera, HW, HH } from '../../core/view.js';
import { sfx } from '../../core/audio.js';
import { addEffect, Ring, Slash, floatText, spawn, burst, bloodSpray, addDecal } from '../../gfx/vfx.js';
import { hit, aoe } from '../combat.js';
import { coneTargets, lineTargets } from '../hazards.js';
import { angleDiff } from '../../core/util.js';
import { drawRuneblade3D, runeblade3DReady, runebladeLook, preloadRuneblade, RUNEBLADE_LEN } from '../../gfx/runeblade3d.js';

const RUNES = 6;
const RC = { frost: '#7ad0ff', unholy: '#70e050', blood: '#ff2a30' };
const EL = { frost: 'cold', unholy: 'shadow', blood: 'blood' };
const TREE = ['frost', 'unholy', 'blood', 'frost'];

/** The blade from its hilt (x, y) along angle a (screen space), `len` long, runes lit along it. */
function blade(ctx, x, y, a, len, runes, t, scale = 1) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, W = 3.2 * scale;
  ctx.save();
  glow(ctx, runes.length ? RC[runes[runes.length - 1]] : '#7ad0ff', x + dx * len * 0.5, y + dy * len * 0.5, len * 0.6, 0.25 + runes.length * 0.06);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#9ab8d8';
  ctx.beginPath(); // the blade: broad, with a long point
  ctx.moveTo(x + nx * W, y + ny * W); ctx.lineTo(x + dx * len * 0.85 + nx * W * 0.9, y + dy * len * 0.85 + ny * W * 0.9);
  ctx.lineTo(x + dx * len, y + dy * len); ctx.lineTo(x + dx * len * 0.85 - nx * W * 0.9, y + dy * len * 0.85 - ny * W * 0.9); ctx.lineTo(x - nx * W, y - ny * W); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.9; ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 0.8 * scale; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * len * 0.92, y + dy * len * 0.92); ctx.stroke(); // the fuller
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a3040'; // crossguard, grip, pommel
  ctx.beginPath(); ctx.moveTo(x + nx * W * 3, y + ny * W * 3); ctx.lineTo(x - nx * W * 3, y - ny * W * 3); ctx.lineWidth = 2.6 * scale; ctx.strokeStyle = '#3a4258'; ctx.stroke();
  ctx.strokeStyle = '#1a1a24'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 9 * scale, y - dy * 9 * scale); ctx.stroke();
  ctx.fillStyle = runes.length === RUNES ? '#ffffff' : '#5a6a8a'; ctx.beginPath(); ctx.arc(x - dx * 10 * scale, y - dy * 10 * scale, 2 * scale, 0, TAU); ctx.fill();
  for (let i = 0; i < RUNES; i++) { // rune slots down the blade
    const k = 0.14 + i * 0.12, rx = x + dx * len * k, ry = y + dy * len * k, r = runes[i];
    if (r) { glow(ctx, RC[r], rx, ry, 5 * scale, 0.9); ctx.fillStyle = '#ffffff'; }
    else ctx.fillStyle = 'rgba(30,40,60,0.6)';
    const s = 1.3 * scale; ctx.fillRect(rx - s, ry - s, s * 2, s * 2);
    if (r) { ctx.fillStyle = RC[r]; ctx.fillRect(rx - s * 0.5, ry - s * 2, s, s * 4); }
  }
  ctx.restore();
}

/** The Runeblade: the 3D model with its lit runes, or the flat blade above until the model can draw. */
function sword(ctx, p, x, y, a, len, runes, t, scale, spin, tilt) {
  const L = look(p);
  if (!runeblade3DReady(L.skin)) return blade(ctx, x, y, a, len, runes, t, scale);
  const col = runes.length ? RC[runes[runes.length - 1]] : L.glow, ga = ctx.globalAlpha;  // glow() resets the alpha
  glow(ctx, col, x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, len * 0.6, (0.25 + runes.length * 0.06) * ga);
  ctx.globalAlpha = ga;
  const v = drawRuneblade3D(ctx, x, y, a, len, { skin: L.skin, palette: L.palette, spin, tilt, glow: col, glowAmt: 0.12 + runes.length * 0.07 });
  if (!v) return;
  const f = Math.min(1, v.face * 1.6), s = Math.max(1, 5 * v.k);  // runes fade edge-on
  for (let i = 0; i < runes.length && i < RUNES; i++) {
    const [rx, ry] = v.slots[i], r = runes[i];
    glow(ctx, RC[r], rx, ry, Math.max(4.5, 28 * v.k), 0.9 * f * ga);
    ctx.globalAlpha = f * ga; ctx.fillStyle = '#ffffff'; ctx.fillRect(rx - s * 0.7, ry - s * 0.7, s * 1.4, s * 1.4);
    ctx.fillStyle = RC[r]; ctx.fillRect(rx - s * 0.35, ry - s * 1.6, s * 0.7, s * 3.2); ctx.globalAlpha = ga;
  }
}

class Obliteration {
  constructor(p, s, ang, runes) { Object.assign(this, { p, ang, runes, t: 0, dur: 0.75, hitAt: 0.32, done: false }); }
  get depth() { return this.p.x + this.p.y + 0.6; }
  update(dt) {
    this.t += dt;
    const p = this.p, w = this.world;
    if (!this.done && this.t >= this.hitAt) {
      this.done = true;
      const cnt = { frost: 0, unholy: 0, blood: 0 };
      for (const r of this.runes) cnt[r]++;
      const main = Object.keys(cnt).reduce((a, b) => (cnt[b] > cnt[a] ? b : a)), perfect = cnt[main] === RUNES;
      const P = power(p) * 7 * (perfect ? 1.5 : 1), el = EL[main], targets = coneTargets(w, p.team, p.x, p.y, this.ang, 4.8, 1.05);
      for (const c of targets) hit(p, c, P, el, sigO({ knock: 1.2, freeze: main === 'frost' && cnt.frost >= 4, slow: true }));
      addEffect(new Slash(p.x, p.y, this.ang, 2.2, 4.2, 0.35, RC[main], { width: 22, z: 20 }));
      addEffect(new Slash(p.x, p.y, this.ang, 2.0, 3.4, 0.3, '#ffffff', { width: 8, z: 22 }));
      const fx = p.x + Math.cos(this.ang) * 2.6, fy = p.y + Math.sin(this.ang) * 2.6;
      if (cnt[main] >= 4 || perfect) {
        if (main === 'frost') { addDecal(fx, fy, 'rgba(160,220,255,0.5)', 2, 'frost', 0.8); for (let i = 0; i < 20; i++) spawn({ type: 'shard', x: fx + rand(-1.5, 1.5), y: fy + rand(-1.5, 1.5), z: 0, vz: rand(80, 160), g: 280, life: rand(0.5, 0.8), size: rand(3, 5), size1: 1, color: i % 2 ? '#c8f0ff' : '#ffffff', rot: -Math.PI / 2, add: true }); }
        else if (main === 'unholy') { aoe(w, p, fx, fy, 3.2, P * 0.3, 'poison', sigO({ poison: true })); addEffect(new Ring(fx, fy, 0.2, 3.2, 0.6, RC.unholy, 5, { fill: true })); burst(fx, fy, 20, 'poison', 30, 3, { up: 1.5 }); }
        else { p.heal(p.maxHp * 0.12); for (const c of targets) bloodSpray(c.x, c.y, 26, Math.atan2(p.y - c.y, p.x - c.x), 12, '#a00808', 1.2); floatText(p.x, p.y, 70, 'Blood drunk', RC.blood, 12); }
      }
      if (perfect) floatText(p.x, p.y, 120, 'PERFECT RUNES', RC[main], 15, { life: 1.6 });
      camera.shake(10); G.hitStop = Math.max(G.hitStop || 0, 0.07);
      sfx('crit', 1); sfx(main === 'frost' ? 'cold' : main === 'blood' ? 'blood' : 'shadow', 0.9);
    }
    return this.t < this.dur;
  }
  draw(ctx) {
    const p = this.p, t = this.t, px = isoX(p.x, p.y), py = isoY(p.x, p.y) - 30;
    const sa = Math.atan2((Math.cos(this.ang) + Math.sin(this.ang)) * HH, (Math.cos(this.ang) - Math.sin(this.ang)) * HW); // to screen
    // raised overhead, then brought down through the target direction
    const k = Math.min(1, t / this.hitAt), a = t < this.hitAt ? -Math.PI / 2 - 0.6 + (sa + Math.PI / 2 + 0.6) * k * k : sa;
    const grow = Math.min(1, t / 0.15), fade = t > this.hitAt ? 1 - (t - this.hitAt) / (this.dur - this.hitAt) : 1;
    // in 3D: raised leaning away and turned, it comes round flat to the camera as it falls, then rolls on
    const spin = t < this.hitAt ? (1 - k) * 1.3 : -(t - this.hitAt) * 0.9, tilt = t < this.hitAt ? -0.55 * (1 - k) : 0.12;
    ctx.globalAlpha = fade;
    sword(ctx, p, px + Math.cos(a) * 8, py + Math.sin(a) * 8, a, 125 * grow, this.runes, t, 2.4, spin, tilt);
    ctx.globalAlpha = 1;
  }
}

// ---- the familiar: where the Runeblade flies, how it swings, what it does by itself ----
// A pose: (x, y) in tiles and z in px above the floor is its anchor, `piv` how far along the blade the anchor sits (0 the
// hilt, 0.5 the middle), `a` the screen angle from hilt to point, `spin` the turn round its length, `tilt` the point
// tipped toward the viewer, `len` its size (1 = RUNEBLADE_LEN, 52 px).
const BLADE = RUNEBLADE_LEN;
const SA = (wa) => Math.atan2((Math.cos(wa) + Math.sin(wa)) * HH, (Math.cos(wa) - Math.sin(wa)) * HW);   // floor angle -> screen
const scr = (sx, sy) => ({ dx: (sx / HW + sy / HH) / 2, dy: (sy / HH - sx / HW) / 2 });                 // screen px -> tiles
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const lerp = (a, b, k) => a + (b - a) * k;
const lerpA = (a, b, k) => a + angleDiff(a, b) * k;
/** Screen angle from a point at height z0 to one at z1. */
const aimA = (x0, y0, z0, x1, y1, z1) => Math.atan2(isoY(x1, y1) - z1 - (isoY(x0, y0) - z0), isoX(x1, y1) - isoX(x0, y0));
/** Turn from a0 to a1 the `dir` way round (+1 clockwise on screen), k of the way. */
const sweep = (a0, a1, dir, k) => { let d = (a1 - a0) % TAU; if (dir > 0 && d < 0) d += TAU; if (dir < 0 && d > 0) d -= TAU; return a0 + d * k; };
const tint = (s) => RC[s.runes[s.runes.length - 1]] || RC.frost;
const elOf = (s) => EL[s.runes[s.runes.length - 1]] || 'cold';

/** Idle flight round him: offsets (dx, dy tiles, z px) from his feet; a: 'vel' points it along its path. */
export const PATTERNS = {
  shoulder: (t) => ({ ...scr(24, 0), z: 70 + Math.sin(t * 2) * 2, a: Math.PI / 2 + 0.12 + Math.sin(t * 1.3) * 0.06, spin: Math.sin(t * 0.7) * 0.75, tilt: 0.18 }),
  orbit: (t) => { const w = t * 1.7; return { dx: Math.cos(w) * 1.15, dy: Math.sin(w) * 1.15, z: 36 + Math.sin(w * 2) * 5, a: 'vel', spin: w * 0.5, tilt: 0.25, piv: 0.5 }; },
  figure8: (t) => { const w = t * 1.3; return { ...scr(46 * Math.sin(w), 16 * Math.sin(2 * w)), z: 46 + Math.cos(w) * 10, a: 'vel', spin: w, tilt: 0.3, piv: 0.5 }; },
  helix: (t) => { const w = t * 2.2; return { dx: Math.cos(w) * 0.95, dy: Math.sin(w) * 0.95, z: 72 + Math.sin(t * 1.1) * 14, a: Math.PI / 2, spin: t * 6, tilt: 0.1 }; },
  wheel: (t) => ({ dx: 0, dy: 0, z: 112 + Math.sin(t * 2) * 3, a: t * 7, spin: 0, tilt: 0.5, piv: 0.5, len: 0.8 }),
  sentinel: (t) => ({ ...scr(-34, 8), z: BLADE + 3 + Math.sin(t * 1.6) * 1.5, a: Math.PI / 2, spin: t * 1.2, tilt: 0 }),
  pendulum: (t) => ({ ...scr(0, -8), z: 136, a: Math.PI / 2 + Math.sin(t * 2.4) * 0.95, spin: Math.sin(t * 1.2) * 0.4, tilt: 0.1 }),
  star: (t) => { // darts between the five points of a star round him, in star order
    const seg = t / 0.42, i = Math.floor(seg), k = ease(seg - i);
    const pt = (n) => { const a = (((n * 2) % 5) / 5) * TAU - Math.PI / 4; return [Math.cos(a) * 1.35, Math.sin(a) * 1.35]; };
    const [x0, y0] = pt(i), [x1, y1] = pt(i + 1);
    return { dx: lerp(x0, x1, k), dy: lerp(y0, y1, k), z: 42 + Math.sin(seg * Math.PI) * 6, a: 'vel', spin: seg * 1.2, tilt: 0.3, piv: 0.5 };
  },
  loop: (t) => { const w = t * 3; return { ...scr(36 + Math.cos(w) * 22, 0), z: 54 + Math.sin(w) * 22, a: 'vel', spin: 0.3, tilt: 0.2, piv: 0.5 }; },
  guard: (t, p) => { const f = p.facing || 0; return { dx: Math.cos(f) * 0.85, dy: Math.sin(f) * 0.85, z: 64 + Math.sin(t * 2) * 2, a: Math.PI / 2 + Math.sin(t * 1.5) * 0.12, spin: Math.sin(t * 0.9) * 0.5, tilt: 0.15 }; },
  comet: (t) => { const w = t * 2.6; return { dx: Math.cos(w) * 1.9, dy: Math.sin(w) * 1.9, z: 42 + Math.sin(w * 1.5) * 14, a: 'vel', spin: w * 2, tilt: 0.35, piv: 0.5 }; },
  drift: (t) => { // lazy and curious, with a flip every few seconds
    const f = (t % 4.5) / 4.5, flip = f > 0.8 ? ease((f - 0.8) / 0.2) : 0;
    return { ...scr(26 * Math.sin(t * 0.7) + 10 * Math.sin(t * 1.9), 8 * Math.sin(t * 1.1)), z: 62 + 10 * Math.sin(t * 0.9), a: Math.PI / 2 + 0.4 * Math.sin(t * 0.6) - flip * TAU, spin: t * 0.6, tilt: 0.2, piv: 0.3 };
  },
  // the far ones: it dances out 2-3 tiles from him and back
  rove: (t) => { // wanders out and in on a winding path
    const r = 1.1 + 1.7 * (0.5 - 0.5 * Math.cos(t * 0.9)), w = t * 0.7 + Math.sin(t * 0.4) * 2;
    return { dx: Math.cos(w) * r, dy: Math.sin(w) * r, z: 50 + 14 * Math.sin(t * 2.3), a: 'vel', spin: t * 2, tilt: 0.3, piv: 0.5 };
  },
  dance: (t) => ({ dx: 2.6 * Math.sin(t * 0.8), dy: 2.1 * Math.sin(t * 1.3 + 1), z: 48 + 12 * Math.sin(t * 3), a: 'vel', spin: t * 3, tilt: 0.35, piv: 0.5 }),
  scout: (t) => { // darts out to a far point, loops there, comes back
    const seg = t / 1.7, i = Math.floor(seg), k = seg - i, h = Math.sin(i * 12.9898 + 4.1) * 43758.5453, th = (h - Math.floor(h)) * TAU;
    const out = k < 0.35 ? ease(k / 0.35) : k < 0.65 ? 1 : 1 - ease((k - 0.65) / 0.35), lw = clamp01((k - 0.35) / 0.3) * TAU, lr = k > 0.35 && k < 0.65 ? 0.45 : 0;
    const r = 0.8 + 2.2 * out;
    return { dx: Math.cos(th) * r + Math.cos(lw) * lr, dy: Math.sin(th) * r + Math.sin(lw) * lr, z: 46 + 18 * Math.sin(k * Math.PI), a: 'vel', spin: seg * 4, tilt: 0.3, piv: 0.5 };
  },
};
const PAT_IDS = Object.keys(PATTERNS), FAR = ['rove', 'dance', 'scout'], NEAR = PAT_IDS.filter((id) => !FAR.includes(id));

function idlePose(p, F) {
  const f = PATTERNS[F.pat], q = f(F.patT, p), z0 = p.z || 0;
  if (q.a === 'vel') {
    const n = f(F.patT + 0.04, p), ddx = n.dx - q.dx, ddy = n.dy - q.dy;
    const sx = (ddx - ddy) * HW, sy = (ddx + ddy) * HH - (n.z - q.z);
    q.a = Math.hypot(sx, sy) > 0.3 ? Math.atan2(sy, sx) : F.a;
  }
  return { ...q, x: p.x + q.dx, y: p.y + q.dy, z: q.z + z0 };
}

/** The swing for each kind of skill he casts (visual: the skill itself does the damage). */
const MOVE = { proj: 'thrust', chain: 'thrust', nova: 'spin', aoe: 'plunge', zone: 'plunge', rain: 'plunge', fissure: 'plunge', wall: 'plunge', trap: 'plunge',
  beam: 'lance', buff: 'salute', heal: 'salute', aura: 'salute', shield: 'salute', transform: 'salute', summon: 'sigil', totem: 'sigil', curse: 'jab',
  whirl: 'whirl', cyclone: 'whirl', orbit: 'whirl', dash: 'charge', leap: 'charge', blink: 'charge' };
export function swingFor(sk) { return sk.kind === 'melee' ? (sk.m.arc ? 'scythe' : sk.fx === 'smash' ? 'chop' : 'slash') : MOVE[sk.kind] || 'slash'; }
const at = (p, th, r) => [p.x + Math.cos(th) * r, p.y + Math.sin(th) * r];

export const SWINGS = {
  slash(p, s, th) { // a cleave past him, alternating sides
    const side = (s.fam.side = -(s.fam.side || 1));
    return { dur: 0.3, pose(k) { const w = th + side * (-1.25 + 2.5 * ease(k)), [x, y] = at(p, w, 0.3); return { x, y, z: 34 + (p.z || 0), a: SA(w), spin: 0.2 * side, tilt: 0.35 }; } };
  },
  scythe(p, s, th) { // a wide reaping sweep, grown a size
    const side = (s.fam.side = -(s.fam.side || 1));
    return { dur: 0.42, pose(k) { const w = th + side * (-2 + 4 * ease(k)), [x, y] = at(p, w, 0.3); return { x, y, z: 30 + (p.z || 0), a: SA(w), spin: 0.3 * side, tilt: 0.45, len: 1.25 }; } };
  },
  chop(p, s, th) { // raised overhead, then brought down on the spot in front of him
    return { dur: 0.44, pose(k) {
      const [x, y] = at(p, th, 0.45), [tx, ty] = at(p, th, 1.7), up = ease(k / 0.45), dn = clamp01((k - 0.45) / 0.2) ** 2;
      const z = 34 + 40 * up * (1 - dn) + (p.z || 0), a1 = aimA(x, y, 36, tx, ty, 0), side = Math.cos(a1) >= 0 ? 1 : -1, a0 = -Math.PI / 2 - side * 0.6;
      return { x, y, z, a: sweep(a0, a1, side, dn), spin: 0, tilt: 0.2, len: 1.1 };
    } };
  },
  thrust(p, s, th, d) { // straight out at the target, point first, turning like a drill, and back
    return { dur: 0.48, pose(k) { const u = k < 0.4 ? ease(k / 0.4) : 1 - ease((k - 0.4) / 0.6), [x, y] = at(p, th, 0.4 + u * d); return { x, y, z: 30 + (p.z || 0), a: SA(th), spin: k * TAU * 1.5, tilt: 0.1, piv: 0.5 }; } };
  },
  spin(p, s, th) { // a full turn round him, hilt in, a size bigger
    return { dur: 0.45, pose(k) { const w = th + ease(k) * TAU * 1.25, [x, y] = at(p, w, 0.25); return { x, y, z: 30 + (p.z || 0), a: SA(w), spin: 0, tilt: 0.4, len: 1.15 }; } };
  },
  plunge(p, s, th, d) { // up over the spot, then down into the floor, point first
    const [x0, y0] = [p.x, p.y], [tx, ty] = at(p, th, d);
    return { dur: 0.62, pose(k) {
      if (k < 0.5) { const e = ease(k / 0.5); return { x: lerp(x0, tx, e), y: lerp(y0, ty, e), z: 40 + 76 * e, a: lerpA(SA(th), Math.PI / 2, e), spin: e * TAU, tilt: 0.1 }; }
      const dn = clamp01((k - 0.5) / 0.12) ** 2, out = clamp01((k - 0.85) / 0.15);
      return { x: tx, y: ty, z: 116 - (114 - BLADE) * dn + 30 * out, a: Math.PI / 2, spin: 0, tilt: 0 };
    }, hits: [{ at: 0.62, fn: () => addEffect(new Ring(tx, ty, 0.1, 1.1, 0.35, tint(s), 3)) }] };
  },
  lance(p, s, th) { // held point-first in front of him, quivering with the beam
    return { dur: 0.7, pose(k, T) { const [x, y] = at(p, th, 0.75 + Math.sin(T * 50) * 0.03); return { x, y, z: 34 + (p.z || 0), a: SA(th), spin: Math.sin(T * 40) * 0.3, tilt: 0.1, piv: 0.3 }; } };
  },
  salute(p, s) { // raised point-up over his head, spinning
    return { dur: 0.75, pose(k) { return { x: p.x, y: p.y, z: 72 + 30 * ease(k / 0.4) + (p.z || 0), a: -Math.PI / 2, spin: ease(k) * TAU * 2, tilt: 0, piv: 0.5 }; },
      hits: [{ at: 0.5, fn: () => { s.flash = Math.max(s.flash, 0.3); } }] };
  },
  sigil(p, s, th) { // the point draws a circle on the floor in front of him
    return { dur: 0.8, pose(k) {
      const [cx, cy] = at(p, th, 1.2), w = th + ease(k) * TAU, tx = cx + Math.cos(w) * 0.7, ty = cy + Math.sin(w) * 0.7;
      return { x: cx, y: cy, z: 50 + (p.z || 0), a: aimA(cx, cy, 50, tx, ty, 0), spin: 0, tilt: 0.1 };
    }, hits: [{ at: 0.95, fn: () => { const [cx, cy] = at(p, th, 1.2); addEffect(new Ring(cx, cy, 0.6, 0.75, 0.4, tint(s), 2)); } }] };
  },
  jab(p, s, th) { // two quick jabs at the target
    return { dur: 0.36, pose(k) { const [x, y] = at(p, th, 0.4 + 0.9 * Math.abs(Math.sin(k * TAU))); return { x, y, z: 36 + (p.z || 0), a: SA(th), spin: k * 2, tilt: 0.15, piv: 0.5 }; } };
  },
  whirl(p, s, th) { // two fast laps round him, edge first
    return { dur: 0.8, pose(k) { const w = th + k * TAU * 2, [x, y] = at(p, w, 0.95); return { x, y, z: 30 + (p.z || 0), a: SA(w + Math.PI / 2), spin: w, tilt: 0.4, piv: 0.5 }; } };
  },
  charge(p, s, th) { // flies ahead of him, point first, rolling
    return { dur: 0.45, pose(k) { const [x, y] = at(p, th, 1); return { x, y, z: 30 + (p.z || 0), a: SA(th), spin: ease(k) * TAU, tilt: 0.1, piv: 0.5 }; } };
  },
};

/** The sword's own skills: it picks one that has a target whenever it is free (signature hits: they never charge it). */
export const PET = [
  { id: 'lunge', name: 'Runic Lunge', cd: 2.6, pick: (p) => foesNear(p, p.x, p.y, 5)[0], make: lunge },
  { id: 'reap', name: 'Reaping Arc', cd: 5, pick: (p) => (foesNear(p, p.x, p.y, 2.4).length >= 2 ? p : null), make: reap },
  { id: 'plunge', name: 'Grave Plunge', cd: 7, pick: (p) => toughest(p, 6), make: gravePlunge, say: true },
  { id: 'waltz', name: 'Blade Waltz', cd: 8, pick: (p) => toughest(p, 5), make: waltz, say: true },
  { id: 'wheel', name: 'Wheel of Rime', cd: 6.5, pick: (p) => { const c = crowd(p, 5, 1.6); return c && c[2] >= 2 ? c : null; }, make: wheel, say: true },
];
function lunge(p, s, c) { // darts through the nearest foe and back, cutting everything on the line
  const x0 = p.x, y0 = p.y, th = Math.atan2(c.y - y0, c.x - x0), D = Math.min(5.5, Math.hypot(c.x - x0, c.y - y0) + 0.9), P = power(p), el = elOf(s);
  return { dur: 0.7, pose(k) {
    const u = k < 0.35 ? ease(k / 0.35) : k < 0.5 ? 1 : 1 - ease((k - 0.5) / 0.5), [ex, ey] = [x0 + Math.cos(th) * D, y0 + Math.sin(th) * D];
    return { x: lerp(p.x, ex, u), y: lerp(p.y, ey, u), z: 30 + (p.z || 0), a: k < 0.5 ? SA(th) : SA(th + Math.PI), spin: k * TAU * 2, tilt: 0.2, piv: 0.5 };
  }, hits: [{ at: 0.3, fn: () => {
    for (const t of lineTargets(p.world, p.team, x0, y0, x0 + Math.cos(th) * D, y0 + Math.sin(th) * D, 0.55)) hit(p, t, P * 0.5, el, sigO({ slow: el === 'cold' }));
    sfx('swing', 0.5);
  } }] };
}
function reap(p, s) { // one great sweep round him, the blade swelling as it goes
  const th = p.facing || 0, P = power(p), el = elOf(s);
  return { dur: 0.6, pose(k) { const w = th + ease(k) * TAU, [x, y] = at(p, w, 0.3); return { x, y, z: 28 + (p.z || 0), a: SA(w), spin: 0.2, tilt: 0.45, len: 1.25 + 0.3 * Math.sin(k * Math.PI) }; },
    hits: [{ at: 0.5, fn: () => {
      aoe(p.world, p, p.x, p.y, 2.4, P * 0.45, el, sigO({ knock: 0.6 }));
      addEffect(new Ring(p.x, p.y, 0.4, 2.4, 0.3, tint(s), 4));
      sfx('swing', 0.7);
    } }] };
}
function gravePlunge(p, s, c) { // climbs over the toughest foe, hangs, and drops on it point first
  const P = power(p), el = elOf(s), T = { x: c.x, y: c.y };
  return { dur: 0.95, pose(k) {
    if (k < 0.55 && !c.dead) { T.x = c.x; T.y = c.y; }
    if (k < 0.45) { const e = ease(k / 0.45); return { x: lerp(p.x, T.x, e), y: lerp(p.y, T.y, e), z: 40 + 100 * e, a: lerpA(SA(Math.atan2(T.y - p.y, T.x - p.x)), Math.PI / 2, e), spin: e * TAU * 2, tilt: 0.1 }; }
    if (k < 0.55) return { x: T.x, y: T.y, z: 140 + Math.sin(k * 90) * 1.5, a: Math.PI / 2, spin: 0, tilt: 0 };
    const dn = clamp01((k - 0.55) / 0.1) ** 2, out = clamp01((k - 0.85) / 0.15);
    return { x: T.x, y: T.y, z: 140 - (138 - BLADE) * dn + 40 * out, a: Math.PI / 2, spin: 0, tilt: 0 };
  }, hits: [{ at: 0.65, fn: () => {
    aoe(p.world, p, T.x, T.y, 1.4, P * 1.1, el, sigO({ stun: true, knock: 0.8 }));
    for (let i = 0; i < 2; i++) addEffect(new Ring(T.x, T.y, 0.1, 1.4 + i * 0.4, 0.35 + i * 0.1, i ? '#ffffff' : tint(s), 5 - i * 2, { fill: !i }));
    burst(T.x, T.y, 8, el, G.touch ? 10 : 18, 3, { up: 1.5 });
    camera.shake(5); sfx('thud', 0.7); sfx(el === 'cold' ? 'cold' : el, 0.5);
  } }] };
}
function waltz(p, s, c) { // flies to a foe and dances round it, cutting four times
  const P = power(p), el = elOf(s), T = { x: c.x, y: c.y }, th0 = Math.atan2(p.y - c.y, p.x - c.x);
  const cut = () => { if (!c.dead) { hit(p, c, P * 0.3, el, sigO()); addEffect(new Slash(T.x, T.y, rand(TAU), 1.6, 0.8, 0.18, tint(s), { width: 6, z: 30 })); } };
  return { dur: 1.4, pose(k) {
    if (!c.dead) { T.x = c.x; T.y = c.y; }
    const w = th0 + clamp01((k - 0.18) / 0.74) * TAU * 2, [ox, oy] = [T.x + Math.cos(w) * 0.75, T.y + Math.sin(w) * 0.75];
    const e = k < 0.18 ? ease(k / 0.18) : k > 0.92 ? 1 - ease((k - 0.92) / 0.08) : 1;
    return { x: lerp(p.x, ox, e), y: lerp(p.y, oy, e), z: 32 + (p.z || 0) * (1 - e), a: k < 0.18 ? aimA(p.x, p.y, 32, T.x, T.y, 32) : SA(w + Math.PI / 2), spin: w, tilt: 0.4, piv: 0.5 };
  }, hits: [0.3, 0.48, 0.66, 0.84].map((a) => ({ at: a, fn: cut })) };
}
function wheel(p, s, cr) { // spins end over end out through a crowd and back, cutting it both ways
  const th = Math.atan2(cr[1] - p.y, cr[0] - p.x), D = Math.min(5, Math.hypot(cr[0] - p.x, cr[1] - p.y) + 1.5), P = power(p), el = elOf(s), x0 = p.x, y0 = p.y;
  const cut = () => {
    for (const t of lineTargets(p.world, p.team, p.x, p.y, x0 + Math.cos(th) * D, y0 + Math.sin(th) * D, 0.7)) hit(p, t, P * 0.45, el, sigO({ slow: true }));
    sfx('swing', 0.5);
  };
  return { dur: 1.1, pose(k, T) {
    const u = k < 0.5 ? ease(k / 0.5) : 1 - ease((k - 0.5) / 0.5), ex = x0 + Math.cos(th) * D, ey = y0 + Math.sin(th) * D;
    return { x: lerp(p.x, ex, u), y: lerp(p.y, ey, u), z: 30 + (p.z || 0) * (1 - u), a: T * 24, spin: 0, tilt: 0.3, piv: 0.5, len: 1.1 };
  }, hits: [{ at: 0.45, fn: cut }, { at: 0.95, fn: cut }] };
}

function famInit(p) {
  const pat = 'shoulder', F = { pat, patT: 0, patDur: 6, x: p.x, y: p.y, z: 62, a: Math.PI / 2, spin: 0, tilt: 0.18, piv: 0, len: 1, act: null, cd: {}, gcd: 1, say: 0, side: 1, trail: [], clock: 0 };
  Object.assign(F, idlePose(p, F));
  return F;
}
/** Start a cast swing (skips while the sword is busy with its own skill or the Obliteration). */
function startSwing(p, s, name, th, d = 2) {
  const F = s.fam;
  if (!F || s.swing > 0 || (F.act && F.act.pet)) return;
  F.act = { ...SWINGS[name](p, s, th, Math.min(4, Math.max(1.2, d))), name, t: 0, pet: false };
  stat('death_knight', 'swing_' + name);
}
function startPet(p, s, q, tgt) {
  const F = s.fam;
  F.act = { ...q.make(p, s, tgt), name: q.id, t: 0, pet: true };
  F.cd[q.id] = q.cd; F.gcd = F.act.dur + 0.8;
  if (q.say && F.say <= 0) { floatText(p.x, p.y, 96, q.name, tint(s), 11, { life: 1, vz: 22 }); F.say = 5; }
  stat('death_knight', 'pet_' + q.id);
}
/** Where the hilt is drawn (world px) and how long the blade is. */
function hiltOf(F) {
  const L = BLADE * (G.touch ? 0.85 : 1) * F.len;
  return [isoX(F.x, F.y) - Math.cos(F.a) * L * F.piv, isoY(F.x, F.y) - F.z - Math.sin(F.a) * L * F.piv, L];
}
function famUpdate(p, s, dt) {
  let F = s.fam;
  if (!F || Math.hypot(F.x - p.x, F.y - p.y) > 9) F = s.fam = famInit(p);
  F.clock += dt; F.gcd -= dt; F.say -= dt;
  for (const k in F.cd) F.cd[k] -= dt;
  if (s.swing > 0) { F.act = null; F.trail.length = 0; return; }
  // its own skills, when it is free and there is something to cut
  if (!p.isRemotePlayer && !(F.act && F.act.pet) && F.gcd <= 0) {
    const ready = PET.filter((q) => (F.cd[q.id] || 0) <= 0).sort(() => Math.random() - 0.5);
    let go = null;
    if (ready.length && foesNear(p, p.x, p.y, 6).length) for (const q of ready) { const tg = q.pick(p); if (tg) { go = [q, tg]; break; } }
    if (go) startPet(p, s, ...go); else F.gcd = 0.25;
  }
  let q;
  if (F.act) {
    const A = F.act;
    A.t += dt;
    const k = Math.min(1, A.t / A.dur);
    for (const h of A.hits || []) if (!h.done && k >= h.at) { h.done = true; h.fn(); }
    q = A.pose(k, A.t);
    if (A.t >= A.dur) F.act = null;
  } else {
    if ((F.patT += dt) > F.patDur) { // a new pattern every few seconds, never the same twice running
      const pick = (Math.random() < 0.3 ? FAR : NEAR).filter((id) => id !== F.pat);   // now and then it dances out further
      F.pat = pick[Math.floor(Math.random() * pick.length)]; F.patT = 0; F.patDur = rand(5, 9);
    }
    q = idlePose(p, F);
  }
  const kp = 1 - Math.exp(-dt * (F.act ? 28 : 9)), ka = 1 - Math.exp(-dt * (F.act ? 30 : 12));
  F.x = lerp(F.x, q.x, kp); F.y = lerp(F.y, q.y, kp); F.z = lerp(F.z, q.z, kp);
  F.a = lerpA(F.a, q.a, ka); F.spin = lerpA(F.spin, q.spin || 0, ka); F.tilt = lerp(F.tilt, q.tilt || 0, ka);
  F.piv = lerp(F.piv, q.piv || 0, kp); F.len = lerp(F.len, q.len || 1, kp);
  // the trail: where the point and the middle of the blade have been
  const [hx, hy, L] = hiltOf(F), dx = Math.cos(F.a), dy = Math.sin(F.a);
  F.trail.push({ t: F.clock, tx: hx + dx * L, ty: hy + dy * L, mx: hx + dx * L * 0.4, my: hy + dy * L * 0.4 });
  while (F.trail.length && (F.clock - F.trail[0].t > 0.16 || F.trail.length > 14)) F.trail.shift();
}
function drawTrail(ctx, F, col) {
  const T = F.trail;
  if (T.length < 2) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col;
  for (let i = 1; i < T.length; i++) {
    const a = T[i - 1], b = T[i], sp = Math.hypot(b.tx - a.tx, b.ty - a.ty), k = 1 - (F.clock - b.t) / 0.16;
    if (sp < 1.5 || k <= 0) continue;
    ctx.globalAlpha = Math.min(1, sp / 6) * 0.4 * k;
    ctx.beginPath(); ctx.moveTo(a.tx, a.ty); ctx.lineTo(b.tx, b.ty); ctx.lineTo(b.mx, b.my); ctx.lineTo(a.mx, a.my); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawFam(ctx, p, s, t) {
  const F = s.fam;
  if (!F || s.swing > 0) return;
  const col = s.runes.length ? tint(s) : look(p).glow, [hx, hy, L] = hiltOf(F);
  drawTrail(ctx, F, col);
  if (s.flash > 0 && s.runes.length) glow(ctx, tint(s), hx + Math.cos(F.a) * L * 0.45, hy + Math.sin(F.a) * L * 0.45, 18, s.flash);
  const u = s.flash > 0 ? 1 - s.flash / 0.5 : 1;  // a full twirl as it takes a rune
  sword(ctx, p, hx, hy, F.a, L, s.runes, t, (G.touch ? 0.85 : 1) * F.len, F.spin + TAU * (1 - (1 - u) ** 3), F.tilt);
}
/** Behind him when it is further from the camera than he is (drawn before him), else on top. */
const behind = (p, s) => s.fam && s.fam.x + s.fam.y < p.x + p.y - 0.05;

export default {
  id: 'death_knight', name: 'Runeblade', color: '#7ad0ff',
  desc: 'A spectral greatsword flies round him like a familiar, swinging with his skills and fighting on its own. It takes a rune for every blow: frost, unholy or blood by its nature. Six runes and RUNIC OBLITERATION, one colossal cleave; the runes decide whether it freezes, spreads plague or drinks life.',
  init: () => ({ runes: [], gap: 0, flash: 0, swing: 0, fam: null }),
  enter(p, s) { s.fam = null; },
  cast(p, s, sk, L, tx, ty) {
    const th = tx != null && (tx !== p.x || ty !== p.y) ? Math.atan2(ty - p.y, tx - p.x) : p.facing || 0;
    startSwing(p, s, swingFor(sk), th, tx != null ? Math.hypot(tx - p.x, ty - p.y) : 2);
  },
  hit(p, s, tgt, dmg, el, o) {
    if (s.gap > 0 || s.runes.length >= RUNES || s.swing > 0) return;
    s.gap = 0.5; s.flash = 0.5;
    const r = el === 'cold' ? 'frost' : el === 'shadow' || el === 'poison' ? 'unholy' : el === 'blood' ? 'blood' : TREE[Number(String(o.sk || '').split('.')[1]) || 0];
    s.runes.push(r);
  },
  update(p, s, dt) {
    s.gap -= dt; s.flash = Math.max(0, s.flash - dt * 2); s.swing = Math.max(0, s.swing - dt);
    const L = look(p);
    if (s.band !== L.band) {   // a new skin every 10 levels: reforged with a twirl
      if (s.band !== undefined && p === G.player) { s.flash = 0.5; floatText(p.x, p.y, 110, 'Runeblade reforged: ' + L.name, L.glow, 14, { life: 2.2, vz: 14 }); sfx('cold', 0.6); }
      s.band = L.band; preloadRuneblade(L.skin);
    }
    if (!p.isRemotePlayer && s.runes.length >= RUNES && s.swing <= 0 && (s.wait = (s.wait || 0) - dt) <= 0) { s.wait = 0.2; if (crowd(p, 4.5)) this.fire(p, s); }
    famUpdate(p, s, dt);
  },
  fill: (s) => s.runes.length / RUNES,
  fire(p, s) {
    while (s.runes.length < RUNES) s.runes.push(TREE[s.runes.length % 3]);
    const c = crowd(p, 5), ang = c ? Math.atan2(c[1] - p.y, c[0] - p.x) : p.facing || 0;
    p.world.addHazard(new Obliteration(p, s, ang, s.runes.splice(0)));
    s.swing = 0.8;
    if (s.fam) { // it comes back from the end of the cleave
      const F = s.fam; F.act = null; F.trail.length = 0;
      F.x = p.x + Math.cos(ang) * 1.6; F.y = p.y + Math.sin(ang) * 1.6; F.z = 24; F.a = SA(ang); F.piv = 0.5;
    }
    floatText(p.x, p.y, 110, 'RUNIC OBLITERATION', '#c8ecff', 17, { life: 1.6, vz: 16 });
    sfx('cold', 0.5);
    stat('death_knight', 'fire');
  },
  draw(ctx, p, s, t) { if (!behind(p, s)) drawFam(ctx, p, s, t); },
  back(ctx, p, s, t) { if (behind(p, s)) drawFam(ctx, p, s, t); },
  ground(ctx, p, s) { // its shadow on the floor, fainter the higher it flies
    const F = s.fam;
    if (!F || s.swing > 0) return;
    const [hx, , L] = hiltOf(F), cx = hx + Math.cos(F.a) * L * 0.5, k = clamp01(1 - (F.z - (p.z || 0)) / 160);
    ctx.globalAlpha = 0.28 * k; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, isoY(F.x, F.y), 4 + Math.abs(Math.cos(F.a)) * L * 0.4, 3, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  },
  // tests: fly a pattern now, or make the sword use one of its skills
  pattern(p, s, id) { if (!s.fam) s.fam = famInit(p); s.fam.act = null; s.fam.pat = id; s.fam.patT = 0; s.fam.patDur = 99; },
  pet(p, s, id) {
    if (!s.fam) s.fam = famInit(p);
    const q = PET.find((k) => k.id === id), tg = q && q.pick(p);
    if (tg) startPet(p, s, q, tg);
    return !!tg;
  },
  swingNow(p, s, name, th = p.facing || 0, d = 2) { if (!s.fam) s.fam = famInit(p); s.fam.act = null; startSwing(p, s, name, th, d); },
};
