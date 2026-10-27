// Ranger: the Hunt. A golden phoenix circles high over the field and marks the toughest foe in reach as her QUARRY (a
// reticle under it, the phoenix wheeling over it). Every arrow that strikes the quarry earns a feather (other hits a
// little). Six feathers and the phoenix folds its wings and STOOPS: a screaming dive that tears into the quarry and
// rakes the foes beside it. Taking the quarry down by any means grants Hunter's Focus (crit, damage) and a feather.
// The phoenix is a 3D model (src/gfx/phoenix3d.js) that banks into its turns, beats and glides, and trails embers.
import { G, stat, power, sigO, toughest, foesNear, headAt, glow, rand, TAU } from './common.js';
import { isoX, isoY, HW, HH, camera } from '../../core/view.js';
import { sfx } from '../../core/audio.js';
import { addEffect, Ring, floatText, spawn, burst } from '../../gfx/vfx.js';
import { hit } from '../combat.js';
import { drawPhoenix3D, phoenixPoints, PHOENIX_TILE } from '../../gfx/phoenix3d.js';

const FEATHERS = 6, HAWK_Z = 96, GREEN = '#7ccf5a', CREAM = '#f0e6c8', GOLD = '#ffd25a', FLAME = '#ff7a1c';
const EMBERS = ['#fff0a0', '#ffd050', '#ffa028', '#ff6414'];
const phoenixK = () => (G.touch ? 1.05 : 1.3);   // px per model unit: a wingspan of ~58 px on phones, ~72 on desktop
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The flat bird for when WebGL is missing, in screen space: wings spread (k = flap) or folded (fold = 1) into a stoop. */
function drawHawk(ctx, x, y, head, flap, fold = 0, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(head); ctx.scale(s, s);
  const up = Math.sin(flap) * 5 * (1 - fold), span = 13 * (1 - 0.7 * fold);
  const wingPath = () => {
    ctx.beginPath();
    ctx.moveTo(-2, 0); ctx.quadraticCurveTo(-4, -span * 0.6 - up, -6, -span - up); ctx.quadraticCurveTo(-1, -span * 0.4, 2, -1.5);
    ctx.moveTo(-2, 0); ctx.quadraticCurveTo(-4, span * 0.6 + up, -6, span + up); ctx.quadraticCurveTo(-1, span * 0.4, 2, 1.5);
  };
  wingPath(); ctx.strokeStyle = 'rgba(255,150,40,0.6)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(); // a flame rim
  wingPath(); ctx.fillStyle = '#ffd860'; ctx.fill(); // golden wings
  ctx.fillStyle = '#ff6a18'; // flame at the wing tips
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-6, sg * (span + up)); ctx.lineTo(-3.2, sg * (span * 0.55 + up * 0.6)); ctx.lineTo(-1.5, sg * (span * 0.6 + up * 0.5)); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = '#f0a830'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.4, 0, 0, TAU); ctx.fill(); // body
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-14, -3.5); ctx.lineTo(-12, 0); ctx.lineTo(-14, 3.5); ctx.closePath(); ctx.fill(); // tail plumes
  ctx.fillStyle = '#ffe080'; ctx.beginPath(); ctx.arc(5.5, 0, 2, 0, TAU); ctx.fill(); // head
  ctx.fillStyle = CREAM; ctx.fillRect(7, -0.6, 2, 1.2); // beak
  ctx.restore();
}
/** A feather icon. */
function feather(ctx, x, y, a, lit, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  ctx.globalAlpha = lit ? 1 : 0.3;
  ctx.fillStyle = lit ? GOLD : '#6a6050';
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(2.6, -1, 0, 4); ctx.quadraticCurveTo(-2.6, -1, 0, -5); ctx.fill();
  ctx.strokeStyle = lit ? '#6a4a28' : '#403a30'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(0, 5.5); ctx.stroke();
  if (lit) { ctx.fillStyle = FLAME; ctx.fillRect(-1, -4, 2, 1.4); }
  ctx.restore(); ctx.globalAlpha = 1;
}
const featherBurst = (x, y, z, n) => { for (let i = 0; i < n; i++) { const a = rand(TAU), v = rand(1, 3); spawn({ type: 'shard', x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(10, 70), g: 40, drag: 2, life: rand(0.6, 1.2), size: rand(2, 3.5), size1: 1, color: i % 3 ? GOLD : FLAME, rot: a, vr: rand(-6, 6) }); } };

class Stoop {
  constructor(p, s, q) { Object.assign(this, { p, s, q, t: 0, dur: 0.5, hitDone: false, x0: s.hx, y0: s.hy, z0: s.hz }); }
  update(dt) {
    const s = this.s, q = this.q, p = this.p;
    this.t += dt;
    const k = Math.min(1, this.t / this.dur), e = k * k;
    if (k < 1) { s.hx = this.x0 + (q.x - this.x0) * e; s.hy = this.y0 + (q.y - this.y0) * e; s.hz = this.z0 + (24 - this.z0) * e; s.fold = 1; }
    else if (!this.hitDone) {
      this.hitDone = true; s.fold = 0;
      const P = power(p);
      if (!q.dead) hit(p, q, P * 8, 'phys', sigO({ bleed: true, knock: 0.6 }));
      for (const c of foesNear(p, q.x, q.y, 2.2).filter((c) => c !== q).slice(0, 2)) { hit(p, c, P * 3, 'phys', sigO({ bleed: true })); featherBurst(c.x, c.y, 26, 5); }
      featherBurst(q.x, q.y, 30, G.touch ? 10 : 20);
      addEffect(new Ring(q.x, q.y, 0.1, 1.8, 0.35, GOLD, 4));
      burst(q.x, q.y, 26, 'blood', 12, 3); burst(q.x, q.y, 30, 'fire', G.touch ? 8 : 16, 3.5);
      camera.shake(5); sfx('crit', 0.9);
    }
    if (k >= 1) { s.hz += dt * 160; s.dive = null; return this.t < this.dur + 0.4 ? true : false; }
    if (Math.random() < 0.7) spawn({ type: 'streak', x: s.hx, y: s.hy, z: s.hz, vx: (this.x0 - q.x) * 0.6, vy: (this.y0 - q.y) * 0.6, vz: (this.z0 - 24) * 0.6, life: 0.22, size: 2.5, color: Math.random() < 0.5 ? GOLD : FLAME, add: true });
    return true;
  }
  draw() {}
}

export default {
  id: 'ranger', name: 'The Hunt', color: GREEN,
  desc: 'A golden phoenix marks the toughest foe as her quarry. Arrows that strike it earn feathers; six feathers and the phoenix stoops on it in a screaming dive. Taking the quarry grants Hunter\'s Focus.',
  init: (p) => ({ quarry: null, feathers: 0, gap: 0, look: 0, hx: p.x, hy: p.y, hz: HAWK_Z, ang: 0, flap: 0, fold: 0, dive: null, flash: 0,
    yaw: 0, pitch: 0, roll: 0, turn: 0, fv: 0, amp: 1, glide: 2, emit: 0, clock: 0 }),
  enter(p, s) { s.quarry = null; s.dive = null; s.hx = p.x; s.hy = p.y; s.hz = HAWK_Z; s.px = s.py = s.pz = undefined; },
  hit(p, s, tgt) {
    if (tgt === s.quarry) { if (s.gap <= 0) { s.gap = 0.25; this.add(s, 1); } }
    else this.add(s, 0.1);
  },
  add(s, n) { const was = Math.floor(s.feathers); s.feathers = Math.min(FEATHERS, s.feathers + n); if (Math.floor(s.feathers) > was) s.flash = 0.5; },
  kill(p, s, tgt) {
    if (tgt !== s.quarry) return;
    s.quarry = null; s.look = 0;
    p.addBuff({ id: 'sig_focus', name: "Hunter's Focus: +20% crit, +25% damage", el: 'phys', fx: 'aura', stats: { crit: 80, dmg: 25 }, t: 8, max: 8 });
    floatText(tgt.x, tgt.y, 70, 'Quarry Taken!', GREEN, 15, { life: 1.6 });
    this.add(s, 1);
    stat('ranger', 'quarry');
  },
  update(p, s, dt) {
    s.gap -= dt; s.flash = Math.max(0, s.flash - dt * 2);
    const q = s.quarry;
    if (q && (q.dead || q.world !== p.world || Math.hypot(q.x - p.x, q.y - p.y) > 12)) s.quarry = null;
    if (!p.isRemotePlayer && (s.look -= dt) <= 0 && !s.dive) { s.look = 0.6; const t = toughest(p, 9); if (t && (!s.quarry || (t.rank !== 'normal' && s.quarry.rank === 'normal'))) s.quarry = t; }
    if (!s.dive) { // wheel over the quarry, or over her
      const c = s.quarry || p, a = (s.ang += dt * 1.6), r = s.quarry ? 1.1 : 1.5;
      const tx = c.x + Math.cos(a) * r, ty = c.y + Math.sin(a) * r, k = Math.min(1, dt * 3);
      s.hx += (tx - s.hx) * k; s.hy += (ty - s.hy) * k; s.hz += (HAWK_Z + Math.sin(s.clock * 1.3) * 8 - s.hz) * Math.min(1, dt * 2);
    }
    const sx = isoX(s.hx, s.hy), sy = isoY(s.hx, s.hy) - s.hz, dx = sx - (s.sx ?? sx), dy = sy - (s.sy ?? sy);
    if (dx * dx + dy * dy > 0.01) s.head = Math.atan2(dy, dx);
    s.sx = sx; s.sy = sy;
    if (dt > 0) this.fly(p, s, dt);
    if (!p.isRemotePlayer && s.feathers >= FEATHERS && s.quarry && !s.dive) this.fire(p, s);
  },
  /** The phoenix's flight pose from how it moved (heading, pitch, bank, wing beat), and its trail of embers. */
  fly(p, s, dt) {
    s.clock += dt;
    const vx = (s.hx - (s.px ?? s.hx)) / dt, vy = (s.hy - (s.py ?? s.hy)) / dt, vz = (s.hz - (s.pz ?? s.hz)) / dt;
    s.px = s.hx; s.py = s.hy; s.pz = s.hz;
    const vh = Math.hypot(vx, vy) * PHOENIX_TILE, e = (r) => Math.min(1, dt * r);
    if (vh > 6) { const d = wrap(Math.atan2(vy, vx) - s.yaw); s.turn += (d / dt * e(10) - s.turn) * e(4); s.yaw = wrap(s.yaw + d * e(10)); }
    else s.turn *= 1 - e(3);
    s.pitch += (Math.max(-0.6, Math.min(1.25, Math.atan2(-vz, Math.max(vh, 20)))) - s.pitch) * e(6);
    s.roll += ((s.dive ? 0 : Math.max(-0.45, Math.min(0.45, -s.turn * 0.3))) - s.roll) * e(4);
    s.fv += (s.fold - s.fv) * e(s.fold ? 14 : 5);
    if ((s.glide -= dt) <= 0) s.glide = s.amp > 0.5 ? rand(1.2, 2.4) : rand(1.6, 3.2), s.gliding = s.amp > 0.5;   // beat a while, then glide
    s.amp += ((s.gliding && !s.dive && vz > -40 ? 0.12 : 1) - s.amp) * e(2.5);
    s.flap += dt * (6.5 + 2 * s.amp) * (1 - s.fv);
    // embers off the tail plumes and wing tips, left behind where it flew
    const heat = s.feathers / FEATHERS, rate = (G.touch ? 26 : 56) * (0.7 + 0.5 * heat) * (s.dive ? 2.2 : 1);
    s.emit = Math.min(s.emit + dt * rate, 8);
    if (s.emit < 1) return;
    const P = phoenixPoints(this.pose(s, 0));
    for (; s.emit >= 1; s.emit--) {
      const r = Math.random(), a = r < 0.62 ? P.tail[Math.floor(Math.random() * 5)] : r < 0.9 ? P.wings[r < 0.76 ? 0 : 1] : P.crest;
      const x = s.hx + a[0], y = s.hy + a[1], z = s.hz + a[2], c = EMBERS[Math.floor(Math.random() * EMBERS.length)];
      if (Math.random() < 0.55) spawn({ type: 'glow', x, y, z, vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25), vz: rand(-4, 14), g: -14, drag: 1.5, life: rand(0.45, 0.95), size: rand(1.1, 2.1) * (1 + heat * 0.4), size1: 0.2, color: c, add: true });
      else if (Math.random() < 0.9) spawn({ type: 'dot', x, y, z, vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), vz: rand(-12, 22), g: 28, drag: 1.2, life: rand(0.35, 0.8), size: rand(1, 1.8), size1: 0.4, color: c, add: true });
      else spawn({ type: 'shard', x, y, z, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(0, 15), g: 22, drag: 2, life: rand(0.8, 1.3), size: rand(1.4, 2.1), size1: 0.6, color: Math.random() < 0.5 ? GOLD : FLAME, rot: rand(TAU), vr: rand(-5, 5), add: true });
    }
  },
  pose: (s, t) => ({ yaw: s.yaw, pitch: s.pitch, roll: s.roll, flap: s.flap, amp: s.amp, fold: s.fv, t: s.clock || t, k: phoenixK(), heat: Math.min(1, s.feathers / FEATHERS + s.flash) }),
  fill: (s) => s.feathers / FEATHERS,
  fire(p, s) {
    const q = s.quarry || toughest(p, 10);
    if (!q) return;
    s.quarry = q; s.feathers = 0;
    s.dive = p.world.addHazard(new Stoop(p, s, q));
    floatText(q.x, q.y, 90, 'STOOP!', CREAM, 16, { life: 1.2 });
    sfx('roar', 0.35); sfx('bow', 0.8);
    stat('ranger', 'fire');
  },
  draw(ctx, p, s, t) {
    if (!p.isRemotePlayer) {
      const [cx, cy] = headAt(p, 4);
      for (let i = 0; i < FEATHERS; i++) { // a fan of feathers over her head
        const a = (i - (FEATHERS - 1) / 2) * 0.32, x = cx + Math.sin(a) * 24, y = cy - Math.cos(a) * 10 + 4, lit = i < Math.floor(s.feathers);
        feather(ctx, x, y, a, lit, G.touch ? 1.1 : 1.4);
        if (lit && s.flash > 0 && i === Math.floor(s.feathers) - 1) glow(ctx, CREAM, x, y, 9, s.flash * 2);
      }
      const q = s.quarry;
      if (q && !q.dead) { // reticle brackets over the quarry
        const qx = isoX(q.x, q.y), qy = (q.screenTop ?? isoY(q.x, q.y) - 50) - 8, k = 6 + Math.sin(t * 6) * 1.5;
        ctx.strokeStyle = s.feathers >= FEATHERS - 1 ? '#ffffff' : GREEN; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(qx + sx * k, qy + sy * (k - 3)); ctx.lineTo(qx + sx * k, qy + sy * k); ctx.lineTo(qx + sx * (k - 3), qy + sy * k); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    // the phoenix itself, with its shadow on the floor
    const hx = isoX(s.hx, s.hy), hy = isoY(s.hx, s.hy), heat = s.feathers / FEATHERS;
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(hx, hy, 11, 4, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    glow(ctx, FLAME, hx, hy - s.hz, 34, 0.3 + 0.25 * heat + s.flash * 0.4);
    if (!drawPhoenix3D(ctx, hx, hy - s.hz, this.pose(s, t))) drawHawk(ctx, hx, hy - s.hz, s.head || 0, s.flap, s.fv, G.touch ? 1.6 : 2);
    glow(ctx, GOLD, hx, hy - s.hz, 16, 0.15 + 0.2 * heat);
  },
  ground(ctx, p, s, t) {
    const q = s.quarry;
    if (!q || q.dead) return;
    const px = isoX(q.x, q.y), py = isoY(q.x, q.y), R = (q.r || 0.4) + 0.45;
    ctx.strokeStyle = GREEN; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.75;
    ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.ellipse(px, py, R * HW * 1.41, R * HH * 1.41, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  },
};
