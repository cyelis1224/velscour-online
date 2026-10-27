// Shared helpers for the class signatures (game/signature.js): timers, the hero's power, picking targets, drawing.
import { G } from '../../state.js';
import { rand, TAU, dist } from '../../core/util.js';
import { isoX, isoY } from '../../core/view.js';
import { glowSprite } from '../../gfx/vfx.js';
import { SKILLS } from '../../data/skills.js';

export { G };
class Wait {
  constructor(t, fn) { this.t = t; this.fn = fn; }
  update(dt) { this.t -= dt; if (this.t <= 0) { this.fn(); return false; } return true; }
  draw() {}
}
/** Run fn after t seconds of game time (on the world's clock, so a paused or stepped game waits too). */
export const later = (w, t, fn) => (t <= 0 ? fn() : w.addHazard(new Wait(t, fn)));
export const avg = (d) => (d[0] + d[1]) / 2;
export const stat = (cls, k) => {
  if (!G.sigStats) return;
  const s = G.sigStats[cls] || (G.sigStats[cls] = {});
  s[k] = (s[k] || 0) + 1;
};

/**
 * What a signature hits for: the running average of the hero's damaging casts (signature.js keeps it in s.pow),
 * never less than the basic attack.
 */
export function power(p) {
  const b = SKILLS[p.classId + '.0.0'];
  const basic = (b && typeof p.skillDamage === 'function') ? avg(p.skillDamage(b, Math.max(1, typeof p.skillLevel === 'function' ? p.skillLevel(b) : 1))) : 10;
  return Math.max(basic, (p.sig && p.sig.pow) || 0);
}
/** The hits a signature deals: tagged so they never charge the signature again. */
export const sigO = (o = {}) => ({ sig: true, crit: true, ...o });

/** Live hostiles near (x, y), nearest first. */
export function foesNear(p, x, y, r) {
  const w = p.world;
  if (!w) return [];
  return w.hostiles(p.team, x, y, r).filter((c) => !c.dead && c.team === 'enemy').sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y));
}
const RANK = { normal: 0, champion: 1, unique: 2, boss: 3 };
/** The toughest foe in reach (rank first, then life). */
export function toughest(p, r) {
  let best = null;
  for (const c of foesNear(p, p.x, p.y, r)) {
    const k = RANK[c.rank] || 0, b = best ? RANK[best.rank] || 0 : -1;
    if (k > b || (k === b && c.maxHp > best.maxHp)) best = c;
  }
  return best;
}
/** The point in reach with the most foes around it (a foe's spot), or null. */
export function crowd(p, r, around = 2.2) {
  let best = null, n = 0;
  for (const c of foesNear(p, p.x, p.y, r)) {
    const k = p.world.hostiles(p.team, c.x, c.y, around).length;
    if (k > n) { n = k; best = c; }
  }
  return best ? [best.x, best.y, n] : null;
}

/** Screen point over the hero's head (the overhead displays sit here). */
export function headAt(p, lift = 12) {
  const top = p.screenTop ?? isoY(p.x, p.y) - (p.spriteH || 60) * (p.scale || 1) - (p.z || 0);
  return [isoX(p.x, p.y), top - lift];
}
/** A soft additive glow. */
export function glow(ctx, color, x, y, r, a = 1) {
  if (a <= 0) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
/** Small pips under an overhead display: n lit of max. */
export function pips(ctx, x, y, n, max, color, dim = '#4a4040', gap = 5) {
  for (let i = 0; i < max; i++) {
    ctx.globalAlpha = i < n ? 1 : 0.4; ctx.fillStyle = i < n ? color : dim;
    ctx.fillRect(Math.round(x + (i - (max - 1) / 2) * gap) - 1, Math.round(y) - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
}
export const wobble = (t, s = 1) => Math.sin(t * 3.1 * s) * 0.5 + Math.sin(t * 5.3 * s + 1) * 0.5;
export { rand, TAU };
