// The Slime Lord's court: a rainbow of slimes, two kinds to a colour, each with its own job.
//   red    Pouncer (leaps on foes from far off, burning bites)      Berserker (rolls into crowds, cleaves, rage quake)
//   gold   Bulwark (taunts, body-blocks, Gilded Aegis on the Lord)   Warden (Amber Barrier, sticky honey, shoves foes off him)
//   green  Mender (sap tether that heals the Lord, Sap Burst)        Druid (healing blossoms, thorn snares)
//   blue   Tide Mage (homing orbs, bubble traps)                    Frost Sage (lightning chains, ice fans, freezing nova)
//   purple Hexer (amp + weaken curses, void orbs that drag)         Venom Spitter (poison lobs, toxic puddles and clouds)
//   pink   Idol (a serenade: the Lord and court hit harder, faster) Charmer (hit-and-run kisses, charms foes)
// plus the Mother Ooze (births little slimes) and the Volatile Slime (pounces and bursts).
// Every kind is played by a handful of same-coloured Glymmora sprite sets (gfx/slimeart.js). They hop rather than
// walk, in waves that ripple through each colour; the blues blink short hops through the air. Out of a fight the
// court plays: leapfrog, races, blink parades, bumping, dancing round the Lord, riding on the big ones, sparring, naps,
// merging and popping apart, tag. Monster.update hands a court slime to slimeUpdate; Creature.draw to drawSlime.
import { G } from '../state.js';
import { rand, chance, TAU, angleTo, dist, pick } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { isoX, isoY, HW, HH, camera } from '../core/view.js';
import { addEffect, Ring, Beam, Column, sparkle, spawn, addDecal, floatText } from '../gfx/vfx.js';
import { aoe, chainHit } from './combat.js';
import { Projectile, Area } from './hazards.js';
import { bodyR } from '../world/map.js';
import { SLIME_SETS, setsOf } from '../gfx/slimeart.js';
import { buildSummon } from './monster.js';
import { SUMMONS } from '../data/summons.js';

export const COLORS = { red: ['pouncer', 'berserker'], gold: ['bulwark', 'warden'], green: ['mender', 'druid'], blue: ['tide', 'frost'], purple: ['hexer', 'venom'], pink: ['idol', 'charmer'] };
const HUES = Object.keys(COLORS);
export const TINT = { red: '#ff4a30', gold: '#ffc83a', green: '#5ee05a', blue: '#4aa8ff', purple: '#b060ff', pink: '#ff70c0' };
const PALE = { red: '#ffc0a0', gold: '#fff0b0', green: '#c8ffb0', blue: '#c8ecff', purple: '#e8c8ff', pink: '#ffd0ec' };
// hop: hops a second; hopH: how high (world px); aggro: goes for foes the Lord hasn't reached yet
export const KINDS = {
  pouncer: { hue: 'red', hop: 2.8, hopH: 9, aggro: 12 },
  berserker: { hue: 'red', hop: 1.8, hopH: 7, aggro: 10 },
  bulwark: { hue: 'gold', hop: 1.5, hopH: 5 },
  warden: { hue: 'gold', hop: 1.9, hopH: 6 },
  mender: { hue: 'green', hop: 2.2, hopH: 7 },
  druid: { hue: 'green', hop: 2, hopH: 7 },
  tide: { hue: 'blue', hop: 2.3, hopH: 8, blink: true },
  frost: { hue: 'blue', hop: 2.1, hopH: 7, blink: true },
  hexer: { hue: 'purple', hop: 2, hopH: 6 },
  venom: { hue: 'purple', hop: 2.2, hopH: 7 },
  idol: { hue: 'pink', hop: 2.6, hopH: 9 },
  charmer: { hue: 'pink', hop: 2.8, hopH: 10 },
  mother: { hue: 'blue', hop: 1.2, hopH: 4, sets: ['tidal_beast', 'ice_emperor', 'deep_diver', 'music'] },
  volatile: { hue: 'red', hop: 3.2, hopH: 10, aggro: 12, sets: ['ember', 'volcano', 'ember_2', 'doom', 'blood_moon'] },
};
for (const k in KINDS) { const K = KINDS[k]; K.color = TINT[K.hue]; K.pale = PALE[K.hue]; }

// ------------------------------------------------------------------ summoning
/**
 * The summon to build for a court key: `rainbow` pools go round the colours (each cast the next ones, so a brood is a
 * rainbow), other pools pick at random; a `mini` pool keeps its own (small) stats and makes little slimes.
 */
export function courtDef(key, owner) {
  const P = SUMMONS[key];
  if (!P || !P.pool) return [key, P];
  let k;
  if (P.rainbow) {
    const i = owner ? (owner._slimeHue = ((owner._slimeHue ?? Math.floor(rand(6))) + 1) % 6) : Math.floor(rand(6));
    const kinds = COLORS[HUES[i]], want = P.pool.filter((p) => kinds.includes(SUMMONS[p] && SUMMONS[p].slime));
    k = want.length ? pick(want) : pick(P.pool);
  } else k = pick(P.pool);
  const D = SUMMONS[k];
  if (!P.mini) return [k, D];
  return [k, { ...D, name: 'Little ' + D.name, hp: P.hp, dmg: P.dmg, spd: (D.spd || 3) * 1.1, mini: true, look: { ...D.look, px: 2 } }];
}

/** A court slime summoned by something other than a skill (the Royal Belly Flop, the Mother Ooze). */
export function courtSummon(owner, key, x, y, dmg, hp, life) {
  const [k, def] = courtDef(key, owner);
  if (!def) return null;
  return buildSummon(owner, def, k, x, y, dmg, hp, life);
}

export function attachSlime(m, def) {
  const kind = def.slime, K = KINDS[kind];
  m.slime = {
    kind, K, set: pickSet(kind), mini: !!def.mini, h: def.look.h * (def.mini ? 0.72 : 1),
    anim: 'idle', animT: rand(2), fps: 1, lock: 0, z: 0, sqx: 0, sqy: 0, sqv: 0, alpha: 1, tilt: 0, glowT: 0,
    act: null, hopPh: rand(), lag: rand(0.25), cds: { leap: rand(0, 0.4), blink: rand(1, 3) }, emote: null, ride: null, rage: 0, rageT: 0, hits: 0, kids: 0,
  };
  m.hop = false;
  if (def.mini) m.r = 0.26;
}
function pickSet(kind) {
  const K = KINDS[kind], list = (K.sets || setsOf(kind)).filter((s) => SLIME_SETS[s]);
  return list.length ? pick(list) : null;
}
const cdk = (S) => (S.mini ? 1.45 : 1);

// ------------------------------------------------------------------ the court (once a frame for every slime)
function court(w, dt) {
  const C = w.slimeCourt || (w.slimeCourt = { frame: -1, next: rand(1.5, 3), list: [], ids: new Set(), mean: {}, ox: 0, oy: 0, oh: 0, still: 0, refresh: 0, games: {} });
  if (C.frame === w.time) return C;
  C.frame = w.time;
  if ((C.refresh -= dt) <= 0 || C.list.some((c) => c.dead)) {
    C.refresh = 0.3;
    const now = w.creatures.filter((c) => c.slime && !c.dead);
    for (const c of C.list) if (c.dead && !c.slime.popped) splat(c); // a slime that dies bursts into goo
    C.list = now;
  }
  // the hop of each colour ripples: everyone drifts toward the colour's mean phase (plus their own little lag)
  const acc = {};
  for (const c of C.list) {
    const S = c.slime;
    if (!c.moving) continue;
    const a = acc[S.K.hue] || (acc[S.K.hue] = [0, 0]);
    a[0] += Math.cos(S.hopPh * TAU); a[1] += Math.sin(S.hopPh * TAU);
  }
  C.mean = {};
  for (const h in acc) C.mean[h] = (Math.atan2(acc[h][1], acc[h][0]) / TAU + 1) % 1;
  const o = C.list[0] && C.list[0].owner;
  if (o) {
    const mx = o.x - C.ox, my = o.y - C.oy;
    if (mx * mx + my * my > 0.0004) { C.oh = Math.atan2(my, mx); C.still = 0; } else C.still += dt;
    C.ox = o.x; C.oy = o.y;
    if ((C.next -= dt) <= 0) { C.next = rand(1.4, 3) * (C.list.length > 8 ? 0.7 : 1); play(w, C, o); }
  }
  return C;
}

function splat(c) {
  const S = c.slime;
  S.popped = true;
  const n = G.touch ? 8 : 16;
  for (let i = 0; i < n; i++) { const a = rand(TAU), v = rand(1.5, 4); spawn({ type: 'blood', x: c.x, y: c.y, z: 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(40, 140), g: 380, drag: 0.8, life: rand(0.5, 0.9), size: rand(2, 3.6), size1: 1.5, color: i % 3 ? S.K.color : S.K.pale }); }
  addDecal(c.x, c.y, S.K.color, S.mini ? 0.45 : 0.7, 'pool', 0.55);
  sfx('squish', 0.35, rand(1.1, 1.5));
}

// ------------------------------------------------------------------ update
export function slimeUpdate(m, dt) {
  const S = m.slime, w = m.world;
  if (!S.set) S.set = pickSet(S.kind);
  const C = court(w, dt);
  S.animT += dt;
  if (S.lock > 0) S.lock -= dt;
  if (S.glowT > 0) S.glowT -= dt;
  if (S.emote && (S.emote.t += dt) > S.emote.dur) S.emote = null;
  for (const k in S.cds) S.cds[k] -= dt;
  // jelly: a damped spring for squash and stretch
  S.sqv += (-S.sqy * 140 - S.sqv * 10) * dt; S.sqy += S.sqv * dt;
  S.sqx = -S.sqy * 0.9;
  m.hopGait = 1;
  if (S.act) {
    const a = S.act;
    if (a.social && !a.air && hostileNear(m, 8)) endAct(m, S, a);
    else {
      a.t += dt;
      if (ACTS[a.type](m, S, a, dt) === false) endAct(m, S, a);
      finish(m, S, C, dt, true);
      return;
    }
  }
  let t = m.pickTarget();
  const K = S.K;
  if (!t && K.aggro && m.owner) { // the reds don't wait for the Lord: anything in sight near him is fair game
    const e = w.nearestHostile(m.team, m.x, m.y, K.aggro, true);
    if (e && dist(e.x, e.y, m.owner.x, m.owner.y) < 16) t = e;
  }
  m.target = t;
  if (FIGHT[S.kind].always) FIGHT[S.kind].always(m, S, t, dt);
  if (S.act) { finish(m, S, C, dt, true); return; }
  if (!t) idle(m, S, C, dt);
  else {
    if (S.emote && S.emote.k === 'zz') S.emote = null;
    const d = dist(m.x, m.y, t.x, t.y);
    m.trackTarget(t, dt);
    FIGHT[S.kind](m, S, t, d, dt);
  }
  finish(m, S, C, dt, false);
}

/** Hops: the slime moves in bounds, quick in the air and slow on the ground, and the animation follows. */
function finish(m, S, C, dt, acting) {
  const K = S.K;
  if (!acting || S.act && S.act.hop) {
    if (m.moving) {
      const before = S.hopPh % 1;
      S.hopPh += dt * K.hop * (S.mini ? 1.25 : 1) * (S.fast ? 1.35 : 1);
      const mean = C.mean[K.hue];
      if (mean !== undefined) { let df = (mean + S.lag) - S.hopPh; df -= Math.round(df); S.hopPh += df * dt * 1.6; }
      const p = S.hopPh % 1, A = 0.6;
      if (p < A) { S.z = Math.sin(Math.PI * p / A) * K.hopH * (S.mini ? 0.8 : 1); m.hopGait = 1.5; }
      else { S.z = 0; m.hopGait = 0.25; }
      if (before < A && p >= A) { S.sqv -= 2.6; if (chance(0.35)) dust(m, S, 3); } // landed
      else if (before >= A && p < A) S.sqv += 1.6; // took off
    } else {
      S.z = Math.max(0, S.z - dt * 80);
      S.hopPh = 0.6 + rand(0.05);
    }
  }
  let want = S.act && S.act.anim ? S.act.anim : S.lock > 0 ? S.lockAnim : null;
  if (!want) want = S.z > 2.5 ? 'jump' : m.moving ? (m.hopGait > 1 && S.fast ? 'run' : 'walk') : 'idle';
  if (want !== S.anim) { S.anim = want; S.animT = 0; }
  S.fps = S.act && S.act.fps || (S.anim === 'idle' ? 0.8 + (m.id % 5) * 0.08 : 1);
  S.fast = false;
}

function dust(m, S, n) {
  for (let i = 0; i < n; i++) { const a = rand(TAU); spawn({ type: 'dot', x: m.x + Math.cos(a) * 0.2, y: m.y + Math.sin(a) * 0.2, z: 1, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, vz: rand(5, 18), g: 60, life: 0.4, size: 1.6, size1: 0.5, color: S.K.pale }); }
}
const lockAnim = (S, anim, t) => { S.lockAnim = anim; S.lock = t; S.anim = anim; S.animT = 0; };
const emote = (S, k, dur = 1.4) => { S.emote = { k, t: 0, dur }; };
function hostileNear(m, r) { return !!m.world.nearestHostile(m.team, m.x, m.y, r); }
/** Act a is over (an act's own callbacks may already have started the next one). */
function endAct(m, S, a) {
  if (S.act === a) S.act = null;
  S.alpha = 1; S.tilt = 0; m.z = 0;
  if (!S.act || S.act.type !== 'ride') S.ride = null;
  if (a && a.end) a.end(m, S);
}
function canStand(w, x, y, m) { return w.map.circleFree(x, y, bodyR(m) + 0.03); }
/** The farthest free spot up to len along ang (in sight), or null. */
function spotToward(m, ang, len, min = 0.8) {
  const w = m.world;
  for (let l = len; l >= min; l -= 0.4) {
    const x = m.x + Math.cos(ang) * l, y = m.y + Math.sin(ang) * l;
    if (canStand(w, x, y, m) && w.map.los(m.x, m.y, x, y)) return [x, y];
  }
  return null;
}

// ------------------------------------------------------------------ actions (S.act): return false when done
const ACTS = {
  // a jump through the air to (x1, y1), or after a moving target; land(m, S) on touching down
  leap(m, S, a) {
    if (a.t < a.squat) { if (!a.sq) { a.sq = true; S.sqv -= 2.2; } a.anim = a.squatAnim || 'idle'; return; }
    if (!a.up) { a.up = true; a.air = true; S.sqv += 3; if (a.whoosh) sfx('swing', 0.3, 1.4); }
    const k = Math.min(1, (a.t - a.squat) / a.dur);
    if (a.follow && !a.follow.dead) { a.x1 += (a.follow.x - a.x1) * 0.15; a.y1 += (a.follow.y - a.y1) * 0.15; }
    const x = a.x0 + (a.x1 - a.x0) * k, y = a.y0 + (a.y1 - a.y0) * k;
    if (m.world.map.walkable(x, y)) { m.x = x; m.y = y; }
    S.z = a.h * 4 * k * (1 - k);
    a.anim = 'jump';
    m.face(angleTo(a.x0, a.y0, a.x1, a.y1));
    if (a.trail && chance(0.6)) spawn({ type: 'glow', x: m.x, y: m.y, z: S.z + 8, life: 0.3, size: 4, size1: 0, color: S.K.color, add: true });
    if (k >= 1) { S.z = 0; S.sqv -= 3.4; dust(m, S, 6); if (a.land) a.land(m, S); return false; }
  },
  // blue blink: bob up, wink out in a swirl of sparkles, pop back in a few tiles on and drop down
  blink(m, S, a) {
    a.anim = 'jump';
    if (a.t < 0.16) { S.z = (a.t / 0.16) * 16; return; }
    if (a.t < 0.28) {
      S.alpha = 1 - (a.t - 0.16) / 0.12; S.z = 16;
      if (!a.gone && a.t > 0.24) {
        a.gone = true;
        sparkle(m.x, m.y, 20, S.K.pale, G.touch ? 4 : 8, 0.35);
        addEffect(new Ring(m.x, m.y, 0.1, 0.7, 0.3, S.K.color, 2));
        m.x = a.x1; m.y = a.y1; if (m.nav) m.nav.path = null;
        sparkle(m.x, m.y, 20, S.K.pale, G.touch ? 4 : 8, 0.35);
      }
      return;
    }
    S.alpha = Math.min(1, (a.t - 0.28) / 0.08); S.z = Math.max(0, 16 - (a.t - 0.28) * 110);
    if (S.z <= 0) { S.sqv -= 2.4; addEffect(new Ring(m.x, m.y, 0.1, 0.55, 0.25, S.K.pale, 1.5)); return false; }
  },
  // a straight rush: the Berserker's roll, the Charmer's dash in
  dash(m, S, a, dt) {
    const step = a.speed * dt;
    const moved = m.world.map.move(m, Math.cos(a.ang) * step, Math.sin(a.ang) * step);
    a.len -= step; m.moving = true; m.face(a.ang);
    a.anim = a.dashAnim || 'run';
    if (a.spin) S.tilt = Math.sin(a.t * 30) * 0.25;
    if (a.hit) for (const c of m.world.hostiles(m.team, m.x, m.y, m.r + 0.45)) if (!a.seen.has(c)) { a.seen.add(c); a.hit(m, S, c); }
    if (chance(0.5)) dust(m, S, 1);
    if (a.len <= 0 || !moved || (a.target && !a.target.dead && dist(m.x, m.y, a.target.x, a.target.y) < m.atkRange(a.target))) { if (a.arrive) a.arrive(m, S); return false; }
  },
  // an animation with something that happens part way through
  cast(m, S, a) {
    if (a.target && !a.target.dead) m.face(angleTo(m.x, m.y, a.target.x, a.target.y));
    m.moving = false;
    if (!a.done && a.t >= a.at) { a.done = true; a.fn(m, S, a); }
    if (a.t >= a.dur) return false;
  },
  // walk (hop) to a spot, then then(m, S)
  go(m, S, a, dt) {
    const x = a.to ? a.to.x : a.x, y = a.to ? a.to.y : a.y;
    if (a.to && a.to.dead) return false;
    S.fast = a.fast;
    const left = m.navTo(x, y, dt, m.speed * (a.fast ? 1.5 : 0.9));
    if (left < (a.near || 0.35)) { m.moving = false; if (a.then) a.then(m, S); return false; }
    if (a.t > (a.max || 5)) return false;
  },
  // stay put for a while (an animation, an emote)
  wait(m, S, a) { m.moving = false; if (a.tick) a.tick(m, S, a); if (a.t >= a.dur) return false; },
  // hop round a centre (the dance round the Lord)
  orbit(m, S, a, dt) {
    const o = a.c;
    if (!o || o.dead) return false;
    a.ang += dt * a.spd;
    const x = o.x + Math.cos(a.ang) * a.r, y = o.y + Math.sin(a.ang) * a.r;
    if (canStand(m.world, x, y, m)) m.moveToward(x, y, dt, m.speed * 1.2); else a.ang += 0.6;
    m.moving = true;
    if (chance(dt * 0.6)) emote(S, 'note', 1);
    if (a.t >= a.dur) return false;
  },
  // ride on top of a bigger slime
  ride(m, S, a) {
    const h = a.host;
    if (!h || h.dead || h.slime.act && h.slime.act.type === 'blink') return false;
    S.ride = h; m.x = h.x; m.y = h.y + 0.01; m.moving = false; a.anim = a.t % 1.2 < 0.6 ? 'idle' : 'open';
    if (a.t >= a.dur) { const sp = spotToward(m, rand(TAU), 1.4); S.ride = null; if (sp) startLeap(m, S, sp[0], sp[1], 22, 0.35, { social: true }); return; }
  },
  nap(m, S, a) {
    m.moving = false; a.anim = 'idle'; a.fps = 0.25;
    S.sqy = -0.12;
    if (!S.emote || S.emote.k !== 'zz') emote(S, 'zz', a.dur - a.t);
    if (a.t >= a.dur) { emote(S, 'bang', 0.6); S.sqv += 2; return false; }
  },
  // play-fight another slime: bonks back and forth
  spar(m, S, a) {
    const o = a.other;
    if (!o || o.dead) return false;
    m.moving = false; m.face(angleTo(m.x, m.y, o.x, o.y));
    if ((a.next -= 1 / 60) <= 0) { a.next = rand(0.4, 0.8); lockAnim(S, 'attack', 0.3); m.lunge = 0.8; sparkle((m.x + o.x) / 2, (m.y + o.y) / 2, 16, S.K.pale, 2, 0.1); o.slime.sqv -= 1.5; }
    a.anim = S.lock > 0 ? 'attack' : 'idle';
    if (a.t >= a.dur) { lockAnim(S, 'open', 0.8); emote(S, 'star', 1); return false; }
  },
  // squish together into one blob, then pop apart
  merge(m, S, a, dt) {
    const o = a.other;
    if (!o || o.dead) return false;
    const mx = (a.cx), my = (a.cy);
    m.moveToward(mx, my, dt, m.speed * 0.6); m.moving = false;
    const k = Math.min(1, a.t / 0.9);
    S.sqx = 0.45 * k; S.sqy = -0.25 * k; S.glowT = 0.2;
    if (a.t >= 1.3) {
      S.sqy = 0; S.sqv = 4;
      const sp = spotToward(m, a.away, 1.3);
      sparkle(mx, my, 10, S.K.pale, 6, 0.3); sfx('squish', 0.3, 1.6);
      if (sp) startLeap(m, S, sp[0], sp[1], 24, 0.4, { social: true });
      return;
    }
  },
};

function startLeap(m, S, x, y, h, dur, o = {}) {
  S.act = { type: 'leap', t: 0, squat: o.squat ?? 0.1, x0: m.x, y0: m.y, x1: x, y1: y, h, dur, ...o };
}
function startBlink(m, S, x, y, o = {}) {
  S.act = { type: 'blink', t: 0, x1: x, y1: y, ...o };
  S.cds.blink = rand(2.2, 4) * cdk(S);
  sfx('arcane', 0.18, 1.6);
}
function cast(m, S, anim, dur, at, fn, target = null) { S.act = { type: 'cast', t: 0, anim, dur, at, fn, target }; }
/** A bite / bash at t: the attack animation, the hit a beat later. */
function bite(m, S, t, o, then) {
  m.cd = (m.atkCd || 1) * (o.cdMul || 1);
  m.face(angleTo(m.x, m.y, t.x, t.y));
  cast(m, S, o.anim || 'attack', 0.34, 0.12, () => {
    if (t.dead || dist(m.x, m.y, t.x, t.y) > m.atkRange(t) + 0.6) return;
    m.lunge = 1;
    const dmg = m.dmg * (o.mul || 1), el = m.summonEl || 'phys', opt = { melee: true, ang: m.facing, ...o.hit };
    if (o.aoe) aoe(m.world, m, t.x, t.y, o.aoe, dmg, el, opt); else m.deal(t, dmg, el, opt);
    t.sqv && (t.sqv -= 1);
    spawn({ type: 'glow', x: t.x, y: t.y, z: 18, life: 0.2, size: 6, size1: 14, color: S.K.color, add: true });
    if (chance(0.35)) sfx('squish', 0.3, rand(1.2, 1.7));
    if (then) then(m, S, t);
  }, t);
}
function shot(m, S, t, o) {
  const w = m.world, n = o.n || 1, base = angleTo(m.x, m.y, t.x, t.y);
  for (let i = 0; i < n; i++) {
    const ang = base + (n > 1 ? (i - (n - 1) / 2) * (o.spread || 0.22) : 0);
    w.addHazard(new Projectile({ world: w, src: m, x: m.x, y: m.y, z: 14 + S.h * 0.3, ang, speed: o.speed || 8, range: (o.range || 7) + 1.5, fx: o.fx, el: o.el || m.summonEl, dmg: [m.dmg * (o.mul || 1) * 0.85, m.dmg * (o.mul || 1) * 1.15], home: o.home ? 1 : 0, size: o.size || 1, pull: o.pull || false, lob: !!o.lob, tx: t.x, ty: t.y, exp: o.exp || 0, onLand: o.onLand, o: o.o || {} }));
  }
}
/** A caster's footwork: walk into range and sight, back off when crowded, sidestep now and then. True when it can cast. */
function engage(m, S, t, d, dt, range) {
  const w = m.world, los = w.map.los(m.x, m.y, t.x, t.y);
  if (d > range || !los) { m.chase(dt, t); return false; }
  m.face(angleTo(m.x, m.y, t.x, t.y));
  if (d < 2.3) {
    if (S.K.blink && !(S.cds.blink > 0)) { const sp = spotToward(m, angleTo(t.x, t.y, m.x, m.y) + rand(-0.7, 0.7), 3.4, 1.6); if (sp) { startBlink(m, S, sp[0], sp[1]); return false; } }
    const a = angleTo(t.x, t.y, m.x, m.y);
    m.moveToward(m.x + Math.cos(a), m.y + Math.sin(a), dt, m.speed * 0.9);
  } else if ((S.strafeT = (S.strafeT || rand(1, 2.5)) - dt) < 0.6) {
    const a = angleTo(t.x, t.y, m.x, m.y) + (m.strafe || 1) * 1.57;
    if (!w.map.move(m, Math.cos(a) * m.speed * 0.5 * dt, Math.sin(a) * m.speed * 0.5 * dt)) m.strafe = -(m.strafe || 1);
    m.moving = true;
    if (S.strafeT < 0) { S.strafeT = rand(1.5, 3.5); if (chance(0.5)) m.strafe = -(m.strafe || 1); }
  } else m.moving = false;
  return true;
}
function ring(x, y, r, col, w = 3, o) { addEffect(new Ring(x, y, 0.2, r, 0.5, col, w, o)); }
function petals(x, y, col, n) { for (let i = 0; i < n; i++) { const a = rand(TAU), v = rand(0.5, 2); spawn({ type: 'glow', x, y, z: rand(4, 26), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(10, 40), g: 30, drag: 1.5, life: rand(0.5, 1), size: rand(1.5, 3), size1: 0, color: col, add: true }); } }

// ------------------------------------------------------------------ out of a fight
function idle(m, S, C, dt) {
  const o = m.owner;
  if (!o) { m.moving = false; return; }
  const d = dist(m.x, m.y, o.x, o.y);
  // blues blink along when they have ground to make up
  if (S.K.blink && d > 3.2 && d < 12 && !(S.cds.blink > 0) && chance(dt * 0.8)) {
    const sp = spotToward(m, angleTo(m.x, m.y, o.x, o.y), Math.min(3.4, d - 1.2), 1.4);
    if (sp) { startBlink(m, S, sp[0], sp[1]); return; }
  }
  m.followOwner(dt);
  if (m.moving) {
    S.fast = d > 3;
    // a liquid sway: each slime weaves a little across the line of travel, out of step with its neighbours
    const a = C.oh + Math.PI / 2, sway = Math.cos(m.world.time * 2.4 + m.id * 0.9) * 0.55 * dt * m.speed * 0.35;
    m.world.map.move(m, Math.cos(a) * sway, Math.sin(a) * sway);
  } else if (!S.act && chance(dt * 0.25)) {
    // little things a slime does on its own: a happy wobble, a look round, a hop in place
    const r = Math.random();
    if (r < 0.35) { lockAnim(S, 'open', 0.7); S.sqv += 1.5; }
    else if (r < 0.6) { m.face(rand(TAU)); if (chance(0.4)) emote(S, 'ask', 1); }
    else startLeap(m, S, m.x, m.y, 10 + rand(8), 0.3, { social: true });
  }
}

// ------------------------------------------------------------------ the court at play
function play(w, C, o) {
  const free = C.list.filter((c) => !c.slime.act && !c.target && dist(c.x, c.y, o.x, o.y) < 7 && !c.slime.ride);
  if (free.length < 1 || hostileNear(o, 9)) return;
  const moving = C.still < 0.4;
  const blues = free.filter((c) => c.slime.K.blink);
  const opts = moving
    ? [[0.35, leapfrog], [blues.length >= 2 ? 0.35 : 0, blinkParade], [0.2, race], [0.15, cheer]]
    : [[0.18, bump], [free.length >= 3 ? 0.14 : 0, dance], [0.14, ride], [0.12, spar], [0.1, nap], [0.1, merge], [0.1, tag], [0.08, hearts], [blues.length >= 2 ? 0.1 : 0, blinkParade], [0.06, cheer]];
  let r = Math.random() * opts.reduce((s, x) => s + x[0], 0);
  for (const [p, fn] of opts) if ((r -= p) <= 0) { C.games[fn.name] = (C.games[fn.name] || 0) + 1; fn(w, C, o, free, blues); return; }
}
const two = (free, ok = () => true) => {
  const a = pick(free), others = free.filter((c) => c !== a && ok(a, c) && dist(a.x, a.y, c.x, c.y) < 5);
  return others.length ? [a, pick(others)] : null;
};
const social = (o) => ({ social: true, ...o });

function leapfrog(w, C, o, free) {
  const p = two(free); if (!p) return;
  const [a, b] = p, ang = C.oh, x = b.x + Math.cos(ang) * 1.3, y = b.y + Math.sin(ang) * 1.3;
  if (!canStand(w, x, y, a)) return;
  startLeap(a, a.slime, x, y, 34, 0.5, social({ squat: 0.12, whoosh: true, land: (m, S) => { if (chance(0.5)) emote(S, 'star', 0.8); } }));
  b.slime.sqv -= 2; emote(b.slime, 'bang', 0.6);
}
function blinkParade(w, C, o, free, blues) {
  const n = Math.min(blues.length, 3 + Math.floor(rand(4))), ang = C.still < 0.4 ? C.oh : rand(TAU), len = rand(2, 3.2);
  blues.slice(0, n).forEach((c, i) => {
    c.slime.act = { type: 'wait', t: 0, dur: i * 0.13, social: true, anim: 'idle', end: (m, S) => { const sp = spotToward(m, ang, len, 1); if (sp && !m.target) startBlink(m, S, sp[0], sp[1], { social: true }); } };
  });
}
function race(w, C, o, free) {
  const p = two(free); if (!p) return;
  const ang = C.oh + rand(-0.4, 0.4), d = rand(3, 4.5);
  for (const c of p) {
    const x = o.x + Math.cos(ang) * d + rand(-0.6, 0.6), y = o.y + Math.sin(ang) * d + rand(-0.6, 0.6);
    if (!canStand(w, x, y, c)) continue;
    emote(c.slime, 'bang', 0.7);
    c.slime.act = { type: 'go', t: 0, x, y, fast: true, hop: true, max: 3, social: true, then: (m, S) => { S.sqv += 2.5; emote(S, 'star', 0.8); } };
  }
}
function cheer(w, C, o, free) {
  for (const c of free.slice(0, 4)) { if (chance(0.6)) startLeap(c, c.slime, c.x, c.y, 16 + rand(10), 0.32, social({ squat: rand(0.05, 0.3), land: (m, S) => emote(S, pick(['star', 'note', 'heart']), 0.9) })); }
}
function bump(w, C, o, free) {
  const p = two(free); if (!p) return;
  const [a, b] = p, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  for (const [c, other] of [[a, b], [b, a]]) {
    c.slime.act = { type: 'go', t: 0, x: cx, y: cy, near: 0.4, hop: true, max: 3, social: true,
      then: (m, S) => { const away = angleTo(other.x, other.y, m.x, m.y), sp = spotToward(m, away, 1.1, 0.4); S.sqv -= 3; emote(S, 'bang', 0.6); sfx('squish', 0.2, 1.8); if (sp) startLeap(m, S, sp[0], sp[1], 14, 0.3, social({ squat: 0.02 })); } };
  }
}
function dance(w, C, o, free) {
  const n = Math.min(free.length, 6), base = rand(TAU), dir = chance(0.5) ? 1 : -1;
  free.slice(0, n).forEach((c, i) => { c.slime.act = { type: 'orbit', t: 0, c: o, r: 1.7, ang: base + (i / n) * TAU, spd: 1.3 * dir, dur: rand(3, 4.5), hop: true, social: true }; });
}
function ride(w, C, o, free) {
  const bigs = C.list.filter((c) => !c.slime.mini && c.slime.h >= 30 && !c.slime.ride);
  const small = free.filter((c) => (c.slime.mini || c.slime.h < 30) && !bigs.includes(c));
  if (!bigs.length || !small.length) return bump(w, C, o, free);
  const r = pick(small), h = bigs.reduce((b, c) => (dist(c.x, c.y, r.x, r.y) < dist(b.x, b.y, r.x, r.y) ? c : b));
  if (dist(r.x, r.y, h.x, h.y) > 6) return;
  startLeap(r, r.slime, h.x, h.y, 30, 0.45, social({ follow: h, land: (m, S) => { S.act = { type: 'ride', t: 0, host: h, dur: rand(3, 6), social: true }; emote(S, 'heart', 1); h.slime.sqv -= 2.5; } }));
}
function spar(w, C, o, free) {
  const p = two(free, (a, b) => a.slime.K.hue === b.slime.K.hue || chance(0.4)); if (!p) return;
  const [a, b] = p, dur = rand(1.8, 3);
  a.slime.act = { type: 'go', t: 0, to: b, near: 0.9, hop: true, max: 3, social: true, then: (m, S) => { S.act = { type: 'spar', t: 0, other: b, dur, next: 0, social: true }; emote(S, 'anger', 0.8); if (!b.slime.act) { b.slime.act = { type: 'spar', t: 0, other: m, dur, next: 0.3, social: true }; } } };
}
function nap(w, C, o, free) { const c = pick(free); c.slime.act = { type: 'nap', t: 0, dur: rand(4, 8), social: true }; }
function merge(w, C, o, free) {
  const p = two(free, (a, b) => a.slime.K.hue === b.slime.K.hue); if (!p) return hearts(w, C, o, free);
  const [a, b] = p, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, away = angleTo(a.x, a.y, b.x, b.y);
  a.slime.act = { type: 'go', t: 0, x: cx, y: cy, near: 0.5, hop: true, social: true, max: 3, then: (m, S) => { S.act = { type: 'merge', t: 0, other: b, cx, cy, away: away + Math.PI, social: true }; } };
  b.slime.act = { type: 'go', t: 0, x: cx, y: cy, near: 0.5, hop: true, social: true, max: 3, then: (m, S) => { S.act = { type: 'merge', t: 0, other: a, cx, cy, away, social: true }; } };
}
function tag(w, C, o, free) {
  const p = two(free); if (!p) return;
  const [it, run] = p;
  emote(it.slime, 'bang', 0.8); emote(run.slime, 'heart', 0.8);
  const flee = (m, S, k) => { if (k <= 0) return; const sp = spotToward(m, rand(TAU), rand(1.5, 2.5)); if (sp && dist(sp[0], sp[1], o.x, o.y) < 5) S.act = { type: 'go', t: 0, x: sp[0], y: sp[1], fast: true, hop: true, max: 2, social: true, then: (mm, SS) => flee(mm, SS, k - 1) }; };
  flee(run, run.slime, 4);
  it.slime.act = { type: 'go', t: 0, to: run, near: 0.6, fast: true, hop: true, max: 5, social: true, then: (m, S) => { emote(S, 'star', 0.8); run.slime.sqv -= 2; emote(run.slime, 'bang', 0.6); } };
}
function hearts(w, C, o, free) {
  const p = two(free); if (!p) return;
  const [a, b] = p;
  a.face(angleTo(a.x, a.y, b.x, b.y));
  emote(a.slime, 'heart', 1.6); lockAnim(a.slime, 'open', 0.8);
  if (chance(0.6)) setTimeoutWorld(w, 0.5, () => { if (!b.dead) { emote(b.slime, 'heart', 1.3); b.slime.sqv += 2; } });
}
function setTimeoutWorld(w, t, fn) { w.addHazard({ t, update(dt) { this.t -= dt; if (this.t <= 0) { fn(); return false; } return true; }, draw() {} }); }

// ------------------------------------------------------------------ fighting, kind by kind
const FIGHT = {
  pouncer(m, S, t, d, dt) {
    // leap ready but already in a brawl: bounce on to the next foe, the Lord's attackers first
    if (!(S.cds.leap > 0) && d <= 1.8) {
      const w = m.world, o = m.owner;
      let best = null, bs = Infinity;
      for (const e of w.hostiles(m.team, m.x, m.y, 9)) {
        const de = dist(m.x, m.y, e.x, e.y);
        if (e === t || e.dead || de < 3 || !w.map.los(m.x, m.y, e.x, e.y)) continue;
        const sc = de - (o && e.target === o ? 3 : 0);
        if (sc < bs) { bs = sc; best = e; }
      }
      if (best) { m.foe = best; m.foeT = w.time + 1.5; t = best; d = dist(m.x, m.y, t.x, t.y); }
    }
    const los = m.world.map.los(m.x, m.y, t.x, t.y);
    if (!(S.cds.leap > 0) && d > 1.8 && d < 9.5 && los) {
      if (chance(0.4)) emote(S, 'bang', 0.5);
      startLeap(m, S, t.x, t.y, 22 + d * 5, 0.26 + d * 0.045, { squat: 0.12, squatAnim: 'open', follow: t, trail: true, whoosh: true, air: true,
        land: (mm, SS) => {
          aoe(mm.world, mm, mm.x, mm.y, 1.1, mm.dmg * 1.6, 'fire', { burn: true, knock: 0.5, melee: true });
          ring(mm.x, mm.y, 1.2, SS.K.color, 3, { fill: true });
          for (let i = 0; i < 6; i++) { const a = rand(TAU); spawn({ type: 'glow', x: mm.x, y: mm.y, z: 4, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, vz: rand(20, 60), g: 120, life: 0.4, size: 3, size1: 0, color: i % 2 ? '#ffd040' : SS.K.color, add: true }); }
          sfx('squish', 0.45, 0.9); SS.cds.leap = rand(2.6, 3.8) * cdk(SS); mm.cd = 0.15;
        } });
      return;
    }
    if (d <= m.atkRange(t)) { m.moving = false; m.face(angleTo(m.x, m.y, t.x, t.y)); if (m.cd <= 0) bite(m, S, t, { hit: { burn: chance(0.35) } }); }
    else { S.fast = true; m.chase(dt, t, m.speed * 1.25); }
  },
  berserker(m, S, t, d, dt) {
    if ((S.rageT -= dt) <= 0 && S.rage > 0) { S.rage--; S.rageT = 1.6; }
    if (S.rage >= 5 && d < 2.6) { // RAGE: up and down in a quake
      S.rage = 0;
      emote(S, 'anger', 1);
      startLeap(m, S, m.x, m.y, 30, 0.42, { squat: 0.2, squatAnim: 'ability', air: true,
        land: (mm, SS) => {
          aoe(mm.world, mm, mm.x, mm.y, 2.3, mm.dmg * 2.4, 'fire', { knock: 1.3, stun: true });
          for (let i = 0; i < 3; i++) addEffect(new Ring(mm.x, mm.y, 0.3, 2.4 + i * 0.4, 0.45 + i * 0.1, i ? '#ffd040' : SS.K.color, 6 - i * 2, { fill: !i }));
          addDecal(mm.x, mm.y, '#3a1008', 1.3, 'scorch', 0.6);
          camera.shake(6); sfx('thud', 0.8); lockAnim(SS, 'special', 0.5);
        } });
      return;
    }
    if (!(S.cds.roll > 0) && d <= 2.4) { // in a brawl with the roll ready: roll on through the pack to another foe
      const e = m.world.hostiles(m.team, m.x, m.y, 7).find((c) => !c.dead && c !== t && dist(m.x, m.y, c.x, c.y) > 2.6 && m.world.map.los(m.x, m.y, c.x, c.y));
      if (e) { t = e; d = dist(m.x, m.y, e.x, e.y); }
    }
    if (!(S.cds.roll > 0) && d > 2.4 && d < 7 && m.world.map.los(m.x, m.y, t.x, t.y)) { // roll through the pack
      S.cds.roll = rand(4.5, 6.5) * cdk(S);
      S.act = { type: 'dash', t: 0, ang: angleTo(m.x, m.y, t.x, t.y), len: d + 1.4, speed: 10.5, spin: true, dashAnim: 'run', seen: new Set(),
        hit: (mm, SS, c) => { mm.deal(c, mm.dmg * 1.3, 'fire', { knock: 0.9, ang: mm.facing, melee: true }); SS.rage = Math.min(5, SS.rage + 1); SS.rageT = 4; spawn({ type: 'glow', x: c.x, y: c.y, z: 16, life: 0.25, size: 8, size1: 16, color: '#ff8030', add: true }); } };
      sfx('roar', 0.25, 1.6);
      return;
    }
    if (d <= m.atkRange(t)) {
      m.moving = false; m.face(angleTo(m.x, m.y, t.x, t.y));
      if (m.cd <= 0) bite(m, S, t, { aoe: 1.3, cdMul: 1 / (1 + 0.16 * S.rage), anim: S.rage >= 3 ? 'special' : 'attack' }, (mm, SS) => { SS.rage = Math.min(5, SS.rage + 1); SS.rageT = 4; if (SS.rage >= 3) SS.glowT = 0.3; });
    } else { S.fast = true; m.chase(dt, t, m.speed * 1.1); }
  },
  bulwark(m, S, t, d, dt) {
    const o = m.owner;
    if (o && !(S.cds.aegis > 0) && o.hp < o.maxHp * 0.55 && dist(m.x, m.y, o.x, o.y) < 9) {
      S.cds.aegis = 16 * cdk(S);
      const a = rand(TAU), x = o.x + Math.cos(a) * 0.9, y = o.y + Math.sin(a) * 0.9;
      emote(S, 'bang', 0.8);
      startLeap(m, S, canStand(m.world, x, y, m) ? x : m.x, canStand(m.world, x, y, m) ? y : m.y, 34, 0.45, { air: true, land: (mm, SS) => {
        o.addBuff({ id: 'slime_aegis', name: 'Gilded Aegis', el: 'holy', stats: { reduce: SS.mini ? 12 : 25, armor: SS.mini ? 25 : 50 }, t: 5, max: 5 });
        addEffect(new Dome(o, SS.K.color, 5));
        ring(o.x, o.y, 1.6, SS.K.color, 4, { fill: true }); lockAnim(SS, 'ability', 0.6); sfx('block', 0.6); sfx('holy', 0.4);
        floatText(o.x, o.y, 70, 'Gilded Aegis', '#ffe080', 12, { life: 1.1 });
      } });
      return;
    }
    if (d <= m.atkRange(t)) {
      m.moving = false; m.face(angleTo(m.x, m.y, t.x, t.y));
      if (m.cd <= 0) {
        const bash = ++S.hits % 3 === 0;
        bite(m, S, t, bash ? { anim: 'special', mul: 1.4, hit: { stun: true, knock: 1.4 } } : { hit: { knock: 0.3 } }, bash ? (mm, SS) => { ring(t.x, t.y, 1.1, SS.K.color, 3); sfx('block', 0.5); } : null);
      }
      return;
    }
    // stand between the Lord and the foe
    if (o && dist(t.x, t.y, o.x, o.y) > 2.2) {
      const a = angleTo(t.x, t.y, o.x, o.y), gx = t.x + Math.cos(a) * (m.atkRange(t) - 0.1), gy = t.y + Math.sin(a) * (m.atkRange(t) - 0.1);
      if (canStand(m.world, gx, gy, m)) { m.navTo(gx, gy, dt, m.speed * 1.1); return; }
    }
    m.chase(dt, t);
  },
  warden(m, S, t, d, dt) {
    const o = m.owner, w = m.world;
    if (o && !(S.cds.repel > 0)) {
      const close = w.hostiles(m.team, o.x, o.y, 1.9).filter((c) => !c.dead);
      if (close.length) {
        S.cds.repel = 8 * cdk(S);
        const a = rand(TAU), x = o.x + Math.cos(a) * 0.7, y = o.y + Math.sin(a) * 0.7, ok = canStand(w, x, y, m);
        startLeap(m, S, ok ? x : m.x, ok ? y : m.y, 26, 0.35, { air: true, land: (mm, SS) => {
          aoe(w, mm, o.x, o.y, 2.6, mm.dmg * 0.7, 'holy', { knock: 1.7, slow: true });
          for (const c of w.hostiles(mm.team, o.x, o.y, 2.6)) c.curses.slow = { t: 2.5, amt: 0.5 };
          addEffect(new Ring(o.x, o.y, 0.3, 2.8, 0.5, '#ffb020', 6, { fill: true })); petals(o.x, o.y, '#ffd060', 14);
          lockAnim(SS, 'special', 0.5); sfx('sonic', 0.4);
        } });
        return;
      }
    }
    if (o && !(S.cds.barrier > 0) && (o.hp < o.maxHp * 0.9 || hostileNear(o, 5))) {
      S.cds.barrier = 11 * cdk(S);
      cast(m, S, 'ability', 0.7, 0.4, (mm, SS) => {
        if (dist(mm.x, mm.y, o.x, o.y) > 8) return;
        o.addBuff({ id: 'slime_barrier', name: 'Amber Barrier', el: 'holy', stats: { res: SS.mini ? 10 : 20, reduce: SS.mini ? 6 : 12, regen: SS.mini ? 10 : 20 }, t: 6, max: 6 });
        addEffect(new Dome(o, '#ffb020', 6, true));
        addEffect(new Beam(mm.x, mm.y, o.x, o.y, '#ffc040', 3, 0.35, { z: 18 }));
        for (const c of w.alliesOf(mm.team, o.x, o.y, 5)) if (c.slime) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.1);
        sfx('buff', 0.4);
      });
      return;
    }
    if (o && dist(m.x, m.y, o.x, o.y) > 3.4) { m.navTo(o.x, o.y, dt, m.speed * 1.1); return; }
    if (d < 6.5 && w.map.los(m.x, m.y, t.x, t.y)) {
      m.face(angleTo(m.x, m.y, t.x, t.y)); m.moving = false;
      if (m.cd <= 0) { m.cd = m.atkCd; cast(m, S, 'attack', 0.3, 0.12, (mm, SS) => shot(mm, SS, t, { fx: 'blob', el: 'holy', speed: 7, range: 6.5, o: { slow: true }, size: 1.2 }), t); }
    } else m.chase(dt, t);
  },
  mender(m, S, t, d, dt) {
    const o = m.owner;
    if (S.healing) { m.moving = false; return; }
    if (o) { // keep behind the Lord, away from the foe
      const a = angleTo(t.x, t.y, o.x, o.y), gx = o.x + Math.cos(a) * 2, gy = o.y + Math.sin(a) * 2;
      if (dist(m.x, m.y, gx, gy) > 1 && canStand(m.world, gx, gy, m)) { m.navTo(gx, gy, dt, m.speed); return; }
    }
    if (d < 6.5 && m.world.map.los(m.x, m.y, t.x, t.y)) {
      m.face(angleTo(m.x, m.y, t.x, t.y)); m.moving = false;
      if (m.cd <= 0) { m.cd = m.atkCd; cast(m, S, 'attack', 0.3, 0.12, (mm, SS) => shot(mm, SS, t, { fx: 'shard', el: 'poison', speed: 9, range: 6.5, o: { poison: true } }), t); }
    } else m.moving = false;
  },
  druid(m, S, t, d, dt) {
    const w = m.world;
    if (!(S.cds.snare > 0) && d < 7 && w.map.los(m.x, m.y, t.x, t.y)) {
      S.cds.snare = 6 * cdk(S);
      cast(m, S, 'special', 0.55, 0.3, (mm, SS) => {
        aoe(w, mm, t.x, t.y, 1.4, mm.dmg * 1.2, 'poison', { poison: true });
        for (const c of w.hostiles(mm.team, t.x, t.y, 1.4)) c.curses.slow = { t: 2.5, amt: 0.75 };
        for (let i = 0; i < (G.touch ? 7 : 14); i++) { const a = rand(TAU), r = rand(1.3); spawn({ type: 'streak', x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, z: 0, vz: rand(60, 120), g: 200, life: 0.45, size: 2, color: i % 3 ? '#3a8a20' : '#a0ff60' }); }
        ring(t.x, t.y, 1.5, '#60c030', 3, { fill: true }); sfx('poison', 0.4);
      }, t);
      return;
    }
    if (engage(m, S, t, d, dt, 6) && m.cd <= 0) { m.cd = m.atkCd; cast(m, S, 'attack', 0.3, 0.12, (mm, SS) => shot(mm, SS, t, { fx: 'shard', el: 'poison', speed: 9, range: 6.5, n: 2, spread: 0.15 }), t); }
  },
  tide(m, S, t, d, dt) {
    if (!(S.cds.bubble > 0) && d < 7 && m.world.map.los(m.x, m.y, t.x, t.y)) {
      S.cds.bubble = 8 * cdk(S);
      cast(m, S, 'special', 0.5, 0.25, (mm, SS) => shot(mm, SS, t, { fx: 'orb', el: 'acid', speed: 5, range: 7.5, size: 1.8, mul: 0.6, o: { stun: true } }), t);
      return;
    }
    if (engage(m, S, t, d, dt, 6.5) && m.cd <= 0) { m.cd = m.atkCd; cast(m, S, 'attack', 0.3, 0.12, (mm, SS) => shot(mm, SS, t, { fx: 'orb', el: 'acid', speed: 7.5, range: 7.5, n: 2, spread: 0.5, home: true, mul: 0.6 }), t); }
  },
  frost(m, S, t, d, dt) {
    const w = m.world;
    if (!(S.cds.nova > 0) && w.hostiles(m.team, m.x, m.y, 2).length) {
      S.cds.nova = 7 * cdk(S);
      cast(m, S, 'special', 0.45, 0.2, (mm, SS) => {
        aoe(w, mm, mm.x, mm.y, 2.2, mm.dmg * 1.2, 'cold', { freeze: true, slow: true });
        addEffect(new Ring(mm.x, mm.y, 0.2, 2.3, 0.45, '#c8f0ff', 5, { fill: true }));
        for (let i = 0; i < (G.touch ? 8 : 16); i++) { const a = (i / 16) * TAU; spawn({ type: 'glow', x: mm.x, y: mm.y, z: 10, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, drag: 2, life: 0.45, size: 3, size1: 0, color: '#e0f8ff', add: true }); }
        sfx('cold', 0.5);
        SS.cds.blink = 0;
      });
      return;
    }
    if (engage(m, S, t, d, dt, 7) && m.cd <= 0) {
      m.cd = m.atkCd;
      const chain = (S.hits = (S.hits || 0) + 1) % 2 === 0;
      cast(m, S, chain ? 'ability' : 'attack', 0.32, 0.14, (mm, SS) => {
        if (chain) { chainHit(w, mm, mm.x, mm.y, t, SS.mini ? 2 : 4, mm.dmg * 0.9, 'light', '#a0d8ff'); sfx('light', 0.3); }
        else shot(mm, SS, t, { fx: 'shard', el: 'cold', speed: 10, range: 7.5, n: 3, spread: 0.18, mul: 0.55, o: { slow: true } });
      }, t);
    }
  },
  hexer(m, S, t, d, dt) {
    const w = m.world;
    if (!(S.cds.hex > 0) && d < 7) {
      S.cds.hex = 6 * cdk(S);
      cast(m, S, 'ability', 0.55, 0.3, (mm, SS) => {
        for (const c of w.hostiles(mm.team, t.x, t.y, 2.6)) { c.curses.amp = { t: 5, amt: SS.mini ? 10 : 20, src: mm.owner }; c.curses.weaken = { t: 5, amt: SS.mini ? 10 : 20, src: mm.owner }; }
        addEffect(new Ring(t.x, t.y, 2.6, 0.3, 0.6, '#b060ff', 3, { fill: true }));
        petals(t.x, t.y, '#c080ff', 10); sfx('shadow', 0.4);
      }, t);
      return;
    }
    if (!(S.cds.void > 0) && d < 7 && w.map.los(m.x, m.y, t.x, t.y)) {
      S.cds.void = 9 * cdk(S);
      cast(m, S, 'special', 0.5, 0.25, (mm, SS) => shot(mm, SS, t, { fx: 'void', el: 'shadow', speed: 3.2, range: d + 1, size: 1.5, pull: 1, mul: 0.5 }), t);
      return;
    }
    if (engage(m, S, t, d, dt, 7) && m.cd <= 0) { m.cd = m.atkCd; cast(m, S, 'attack', 0.3, 0.12, (mm, SS) => shot(mm, SS, t, { fx: 'skull', el: 'shadow', speed: 8, range: 7.5, home: true }), t); }
  },
  venom(m, S, t, d, dt) {
    const w = m.world;
    const puddle = (r, dur, mul) => (x, y) => w.addHazard(new Area({ world: w, src: m, x, y, r, dur, tick: 0.5, dmg: [m.dmg * mul * 0.8, m.dmg * mul * 1.2], el: 'poison', fx: 'poison', o: { poison: true } }));
    if (!(S.cds.cloud > 0) && d < 6.5) {
      S.cds.cloud = 9 * cdk(S);
      cast(m, S, 'special', 0.6, 0.3, (mm, SS) => { puddle(SS.mini ? 1.4 : 2, 4, 0.3)(t.x, t.y); ring(t.x, t.y, 2, '#80ff40', 3, { fill: true }); sfx('poison', 0.5); }, t);
      return;
    }
    if (engage(m, S, t, d, dt, 6.5) && m.cd <= 0) { m.cd = m.atkCd; cast(m, S, 'attack', 0.3, 0.14, (mm, SS) => shot(mm, SS, t, { fx: 'blob', el: 'poison', lob: true, exp: 0.9, range: 7, o: { poison: true }, onLand: puddle(1, 2.5, 0.22) }), t); }
  },
  idol(m, S, t, d, dt) {
    if (!(S.cds.song > 0)) { serenade(m, S); return; }
    if (engage(m, S, t, d, dt, 7) && m.cd <= 0) { m.cd = m.atkCd; cast(m, S, 'attack', 0.3, 0.12, (mm, SS) => shot(mm, SS, t, { fx: 'note', el: 'holy', speed: 8, range: 7.5, home: true }), t); }
  },
  charmer(m, S, t, d, dt) {
    const w = m.world;
    if (!(S.cds.charm > 0)) {
      const c = w.hostiles(m.team, m.x, m.y, 6.5).find((e) => !e.dead && e.rank !== 'boss' && e.rank !== 'unique' && !e.summon && !(e.curses.charm && e.curses.charm.t > 0) && w.map.los(m.x, m.y, e.x, e.y));
      if (c) {
        S.cds.charm = 10 * cdk(S);
        cast(m, S, 'ability', 0.55, 0.3, (mm, SS) => {
          if (c.dead || c.team === mm.team || (c.curses.charm && c.curses.charm.t > 0)) return; // another charmer got there first
          c.curses.charm = { t: SS.mini ? 3 : 5, src: mm.owner, team: c.team }; c.team = mm.team; c.aggro = null;
          for (let i = 0; i < 6; i++) spawn({ type: 'glow', x: c.x + rand(-0.3, 0.3), y: c.y + rand(-0.3, 0.3), z: rand(20, 40), vz: 25, life: 0.8, size: 3, size1: 0, color: '#ff70c0', add: true });
          addEffect(new Beam(mm.x, mm.y, c.x, c.y, '#ff80c8', 2, 0.3, { z: 16 })); floatText(c.x, c.y, 50, '♥', '#ff70c0', 16, { life: 1 }); sfx('arcane', 0.4, 1.3);
        }, c);
        emote(S, 'heart', 1.2);
        return;
      }
    }
    if (d <= m.atkRange(t)) {
      m.moving = false; m.face(angleTo(m.x, m.y, t.x, t.y));
      if (m.cd <= 0) bite(m, S, t, { hit: {} }, (mm, SS) => { if (chance(0.55)) { const sp = spotToward(mm, angleTo(t.x, t.y, mm.x, mm.y) + rand(-0.8, 0.8), 1.6, 0.8); if (sp) startLeap(mm, SS, sp[0], sp[1], 16, 0.28, { squat: 0.2 }); } });
    } else if (!(S.cds.dash > 0) && d < 5 && w.map.los(m.x, m.y, t.x, t.y)) {
      S.cds.dash = rand(2.5, 4) * cdk(S);
      S.act = { type: 'dash', t: 0, ang: angleTo(m.x, m.y, t.x, t.y), len: d, speed: 11, target: t, seen: new Set(), arrive: (mm, SS) => { mm.cd = 0; } };
      petals(m.x, m.y, '#ff90d0', 6);
    } else { S.fast = true; m.chase(dt, t, m.speed * 1.15); }
  },
  mother(m, S, t, d, dt) {
    if (d <= m.atkRange(t)) { m.moving = false; m.face(angleTo(m.x, m.y, t.x, t.y)); if (m.cd <= 0) bite(m, S, t, { aoe: 1.4 }); }
    else m.chase(dt, t);
  },
  volatile(m, S, t, d, dt) {
    if (d < 9 && m.world.map.los(m.x, m.y, t.x, t.y)) {
      emote(S, 'bang', 0.6);
      startLeap(m, S, t.x, t.y, 26 + d * 5, 0.26 + d * 0.045, { squat: 0.14, squatAnim: 'open', follow: t, trail: true, air: true, land: (mm, SS) => {
        aoe(mm.world, mm, mm.x, mm.y, 1.7, mm.dmg * 1.7, 'fire', { burn: true, knock: 0.8 });
        for (let i = 0; i < 3; i++) addEffect(new Ring(mm.x, mm.y, 0.2, 1.9 + i * 0.3, 0.4 + i * 0.1, i ? '#ffd040' : SS.K.color, 5 - i, { fill: !i }));
        sfx('explode', 0.6); camera.shake(4); mm.hp = 0; mm.dead = true;
      } });
      return;
    }
    S.fast = true; m.chase(dt, t, m.speed * 1.2);
  },
};
// support work that goes on with or without a foe: the Mender's tether, the Druid's blossoms, the Idol's songs,
// the Mother's brood
FIGHT.mender.always = (m, S, t, dt) => {
  const o = m.owner;
  S.healing = false;
  if (!o || o.dead || S.act) return;
  const d = dist(m.x, m.y, o.x, o.y);
  if (!(S.cds.burst > 0) && o.hp < o.maxHp * 0.4 && d < 8) {
    S.cds.burst = 18 * cdk(S);
    cast(m, S, 'special', 0.6, 0.3, (mm, SS) => { o.heal(o.maxHp * (SS.mini ? 0.08 : 0.15)); addEffect(new Column(o.x, o.y, '#80ff80', 0.6, 22, 200)); ring(o.x, o.y, 1.6, '#80ff60', 4, { fill: true }); petals(o.x, o.y, '#a0ff80', 16); sfx('heal', 0.6); });
    return;
  }
  let who = o.hp < o.maxHp * 0.97 && d < 7 ? o : null;
  if (!who) { let worst = 0.85; for (const c of m.world.alliesOf(m.team, m.x, m.y, 6)) if (c.slime && c !== m && c.hp / c.maxHp < worst) { worst = c.hp / c.maxHp; who = c; } }
  if (!who || !m.world.map.los(m.x, m.y, who.x, who.y)) return;
  S.healing = true;
  if (who === o) o.heal(o.maxHp * (S.mini ? 0.008 : 0.016) * dt, true); else who.hp = Math.min(who.maxHp, who.hp + who.maxHp * 0.06 * dt);
  m.face(angleTo(m.x, m.y, who.x, who.y));
  if (S.anim !== 'open' && S.lock <= 0) lockAnim(S, 'open', 0.6); else S.lock = 0.3;
  if ((S.beamT = (S.beamT || 0) - dt) <= 0) {
    S.beamT = 0.09;
    addEffect(new Beam(m.x, m.y, who.x, who.y, '#70ff60', S.mini ? 1.5 : 2.4, 0.13, { z: 12 + S.h * 0.3, core: '#e0ffd0' }));
    if (chance(0.5)) sparkle(who.x, who.y, rand(10, 40), '#a0ff80', 1, 0.3);
  }
};
FIGHT.druid.always = (m, S, t) => {
  const o = m.owner;
  if (!o || S.act || S.cds.bloom > 0) return;
  const hurt = o.hp < o.maxHp * 0.9 || m.world.alliesOf(m.team, o.x, o.y, 5).some((c) => c.slime && c.hp < c.maxHp * 0.8);
  if (!hurt && !t) return;
  if (dist(m.x, m.y, o.x, o.y) > 7) return;
  S.cds.bloom = 9 * cdk(S);
  cast(m, S, 'ability', 0.7, 0.4, (mm, SS) => { mm.world.addHazard(new Bloom(mm, o.x, o.y, SS.mini ? 1.2 : 1.7)); sfx('heal', 0.35); }, o);
};
FIGHT.idol.always = (m, S, t) => { if (!t && !S.act && !(S.cds.song > 0) && m.owner && m.owner.hp < m.owner.maxHp * 0.8) serenade(m, S); };
FIGHT.mother.always = (m, S, t) => {
  if (S.act || S.cds.brood > 0) return;
  const kids = m.world.creatures.filter((c) => c.parentId === m.id && !c.dead).length;
  if (kids >= 5) return;
  S.cds.brood = t ? 4 : 7;
  cast(m, S, 'open', 0.7, 0.45, (mm) => {
    const a = rand(TAU), x = mm.x + Math.cos(a) * 1, y = mm.y + Math.sin(a) * 1;
    if (!mm.world.map.walkable(x, y)) return;
    const c = courtSummon(mm.owner, 'slimeling', x, y, mm.dmg * 0.5, mm.maxHp * 0.15, 15);
    if (!c) return;
    c.parentId = mm.id; c.skillId = mm.skillId;
    mm.world.add(c);
    startLeap(c, c.slime, x + Math.cos(a) * 0.6, y + Math.sin(a) * 0.6, 20, 0.35, {});
    sfx('squish', 0.4, 0.8);
  });
};
function serenade(m, S) {
  S.cds.song = 9 * cdk(S);
  emote(S, 'note', 1.5);
  cast(m, S, 'ability', 0.9, 0.45, (mm, SS) => {
    const o = mm.owner, w = mm.world;
    if (o && dist(mm.x, mm.y, o.x, o.y) < 7) { o.addBuff({ id: 'slime_song', name: 'Slime Serenade', el: 'arcane', stats: { dmg: SS.mini ? 8 : 15, as: SS.mini ? 8 : 15 }, t: 7, max: 7 }); o.heal(o.maxHp * 0.03, true); }
    for (const c of w.alliesOf(mm.team, mm.x, mm.y, 6)) if (c.summon) c.partyBuff = { stats: { dmg: 20, as: 15 }, t: 7 };
    addEffect(new Ring(mm.x, mm.y, 0.2, 6, 0.8, '#ff80d0', 2));
    for (let i = 0; i < (G.touch ? 6 : 12); i++) { const a = rand(TAU); spawn({ type: 'glow', x: mm.x, y: mm.y, z: 20, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, vz: 30, drag: 1, life: 1, size: 3, size1: 0, color: i % 2 ? '#ffe070' : '#ff80d0', add: true }); }
    sfx('note', 0.4); sfx('buff', 0.3);
  });
}

// ------------------------------------------------------------------ effects of their own
/** The Bulwark's Gilded Aegis and the Warden's Amber Barrier: a jelly dome over the Lord. */
class Dome {
  constructor(target, color, dur, honey = false) { Object.assign(this, { target, color, dur, honey, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.dur && !this.target.dead; }
  draw(ctx) {
    const o = this.target, px = isoX(o.x, o.y), py = isoY(o.x, o.y);
    const fade = Math.min(1, this.t * 4) * Math.min(1, (this.dur - this.t) * 2), R = 26 + Math.sin(this.t * 5) * 1.2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 * fade; ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.ellipse(px, py - 20, R, R * 1.15, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = this.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(px, py - 20, R, R * 1.15, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.35 * fade; ctx.beginPath(); ctx.ellipse(px, py, R, R * 0.45, 0, 0, TAU); ctx.stroke();
    // a glint sliding over the jelly
    const g = (this.t * 0.7) % 1;
    ctx.globalAlpha = 0.6 * fade * Math.sin(g * Math.PI); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(px, py - 20, R * 0.8, R * 0.95, 0, -2.4 + g * 1.2, -1.9 + g * 1.2); ctx.stroke();
    if (this.honey) for (let i = 0; i < 4; i++) { const a = this.t * 0.8 + i * 1.57, x = px + Math.cos(a) * R * 0.95; ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = '#ffd050'; ctx.fillRect(x - 1, py - 20 + Math.sin(a) * R * 0.3 + ((this.t * 9 + i * 5) % 14), 2, 3); }
    ctx.restore();
  }
}

/** The Druid's healing blossom: a ring of petals on the floor that mends the Lord and the court standing in it. */
class Bloom {
  constructor(src, x, y, r) { Object.assign(this, { world: src.world, src, team: src.team, x, y, r, dur: 6, t: 0, tick: 0, ground: true }); }
  get depth() { return this.x + this.y; }
  update(dt) {
    this.t += dt;
    if ((this.tick -= dt) <= 0) {
      this.tick = 0.5;
      for (const c of this.world.alliesOf(this.team, this.x, this.y, this.r)) {
        if (c.isPlayer) c.heal(c.maxHp * 0.006, true);
        else c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.03);
      }
    }
    if (chance(dt * 6)) petals(this.x + rand(-this.r, this.r) * 0.7, this.y + rand(-this.r, this.r) * 0.7, chance(0.5) ? '#ff9ad8' : '#a0ff80', 1);
    return this.t < this.dur;
  }
  draw(ctx) {
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y), f = Math.min(1, this.t * 3) * Math.min(1, (this.dur - this.t) * 1.5);
    const R = this.r * Math.min(1, this.t * 2.5);
    ctx.save();
    ctx.globalAlpha = 0.22 * f; ctx.fillStyle = '#40c040';
    ctx.beginPath(); ctx.ellipse(px, py, R * HW * 1.41, R * HH * 1.41, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.6 * f; ctx.strokeStyle = '#a0ff80'; ctx.lineWidth = 1; ctx.stroke();
    for (let i = 0; i < 8; i++) { // petals round the rim, turning slowly
      const a = this.t * 0.5 + (i / 8) * TAU, x = px + Math.cos(a) * R * HW * 1.2, y = py + Math.sin(a) * R * HH * 1.2;
      ctx.globalAlpha = 0.8 * f; ctx.fillStyle = i % 2 ? '#ff9ad8' : '#ffe0f0';
      ctx.beginPath(); ctx.ellipse(x, y, 3, 1.6, a, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
