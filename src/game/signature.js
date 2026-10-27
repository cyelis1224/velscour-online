// Class signatures: the thing each class builds up on top of its skills, the way the Bard composes (bard.js) and the
// Astronomer charts the sky (astronomer.js). Each lives in game/sigs/<class>.js and gets the hero's casts, hits and
// kills; it draws its charge over (or behind) the hero and pays off by itself when full. Signature hits carry
// o.sig so they never charge it again. G.settings.signatures = false turns them all off.
//
// A signature module: { id, name, desc, color, init(p) -> state, enter?(p, s) (a new map), cast?(p, s, sk, L, tx, ty),
//   hit?(p, s, tgt, dmg, el, o), kill?(p, s, tgt, src), update?(p, s, dt), draw?(ctx, p, s, t) (over the head, top
//   layer), ground?(ctx, p, s, t) (ground layer), back?(ctx, p, s, t) (depth sorted just behind the hero),
//   fill(s) -> 0..1, fire(p, s) (the payoff; tests call it too) }
import { G } from '../state.js';
import { effects, addEffect } from '../gfx/vfx.js';
import { avg } from './sigs/common.js';
import paladin from './sigs/paladin.js';
import ranger from './sigs/ranger.js';
import wizard from './sigs/wizard.js';
import necromancer from './sigs/necromancer.js';
import barbarian from './sigs/barbarian.js';
import dragoon from './sigs/dragoon.js';
import totem_master from './sigs/totem.js';
import death_knight from './sigs/deathknight.js';
import carrion_witch from './sigs/witch.js';
import slime_lord from './sigs/slime.js';
import boomerang_knight from './sigs/boomerang.js';
import lancer from './sigs/lancer.js';
import dragon_knight from './sigs/dragonknight.js';
import gunner from './sigs/gunner.js';

export const SIGNATURES = { paladin, ranger, wizard, necromancer, barbarian, dragoon, totem_master, death_knight, carrion_witch, slime_lord, boomerang_knight, lancer, dragon_knight, gunner };
const NO_DMG = new Set(['buff', 'heal', 'summon']);
export const on = (p) => G.settings.signatures !== false && p.world && !p.dead;

/** The hero's signature state (null for the Bard and the Astronomer, whose gimmicks live in their own files). */
export function sigOf(p) {
  const cid = p.classId === 'deathknight' ? 'death_knight' : p.classId;
  const M = SIGNATURES[cid] || SIGNATURES[p.classId];
  if (!M) return null;
  if (!p.sig || p.sig.cls !== M.id) p.sig = { cls: M.id, s: M.init(p), pow: 0, world: null };
  const S = p.sig;
  if (S.world !== p.world) { S.world = p.world; if (M.enter) M.enter(p, S.s); }
  return S;
}

export function sigCast(p, sk, L, tx, ty) {
  const S = sigOf(p);
  if (!S || !on(p) || p.world.kind === 'town') return;
  if (!NO_DMG.has(sk.kind)) { const d = avg(p.skillDamage(sk, L)); S.pow = S.pow ? S.pow * 0.85 + d * 0.15 : d; }
  const cid = p.classId === 'deathknight' ? 'death_knight' : p.classId;
  const M = SIGNATURES[cid] || SIGNATURES[p.classId];
  if (M.cast) M.cast(p, S.s, sk, L, tx, ty);
}
/** A hit the hero himself dealt (Player.onHit); DoT ticks and the signature's own hits do not count. */
export function sigHit(p, tgt, dmg, el, o) {
  if (o.dot || o.sig || !p.sig) return;
  const S = sigOf(p);
  const cid = p.classId === 'deathknight' ? 'death_knight' : p.classId;
  const M = SIGNATURES[cid] || SIGNATURES[p.classId];
  if (S && M.hit && on(p) && p.world.kind !== 'town') M.hit(p, S.s, tgt, dmg, el, o);
}
/** A monster died to the hero or his minions (combat.kill). */
export function sigKill(p, tgt, src) {
  const S = p.sig && sigOf(p);
  const cid = p.classId === 'deathknight' ? 'death_knight' : p.classId;
  const M = SIGNATURES[cid] || SIGNATURES[p.classId];
  if (S && M.kill && on(p) && p.world.kind !== 'town' && tgt.team === 'enemy') M.kill(p, S.s, tgt, src);
}

export function sigUpdate(p, dt) {
  const S = sigOf(p);
  if (!S || !p.world) return;
  const cid = p.classId === 'deathknight' ? 'death_knight' : p.classId;
  const M = SIGNATURES[cid] || SIGNATURES[p.classId];
  if (!M) return;
  if (M.update && on(p)) M.update(p, S.s, dt);
  else p.sigScale = 1;
  if (M.draw && (!p._sigTop || !effects.includes(p._sigTop))) addEffect(p._sigTop = new SigLayer(p, M, 'draw'), 'top');
  if (M.ground && (!p._sigGround || !effects.includes(p._sigGround))) addEffect(p._sigGround = new SigLayer(p, M, 'ground'), 'ground');
  if (M.back && (!p._sigBack || p._sigBack.world !== p.world || !p.world.hazards.includes(p._sigBack))) p.world.addHazard(p._sigBack = new SigBack(p, M));
}
/** Fill the meter and pay off at once (tests, previews). */
export function sigFire(p) {
  if (p.world && p.world.kind === 'town') return;
  const S = sigOf(p);
  const cid = p.classId === 'deathknight' ? 'death_knight' : p.classId;
  const M = SIGNATURES[cid] || SIGNATURES[p.classId];
  if (S && M) M.fire(p, S.s);
}

class SigLayer {
  constructor(p, M, fn) { Object.assign(this, { p, M, fn, t: 0 }); }
  update(dt) {
    this.t += dt;
    const p = this.p;
    return (G.player === p || p.isRemotePlayer) && !p.dead && p.world && p.sig && p.sig.cls === this.M.id;
  }
  draw(ctx) {
    const p = this.p;
    if (!on(p) || p.ghostDraw) return;
    ctx.save();
    try { this.M[this.fn](ctx, p, p.sig.s, this.t); } finally { ctx.restore(); }
  }
}
/** Drawn in the depth-sorted pass just before the hero, so it reads as behind his back (wings, spears, banners). */
class SigBack {
  constructor(p, M) { Object.assign(this, { p, M, t: 0 }); }
  get depth() { return this.p.x + this.p.y + (this.p.fly ? 0.2 : 0) - 0.01; }
  update(dt) {
    this.t += dt;
    const p = this.p;
    return (G.player === p || p.isRemotePlayer) && !p.dead && p.world === this.world && p.sig && p.sig.cls === this.M.id;
  }
  draw(ctx) {
    const p = this.p;
    if (!on(p)) return;
    ctx.save();
    try { this.M.back(ctx, p, p.sig.s, this.t); } finally { ctx.restore(); }
  }
}
