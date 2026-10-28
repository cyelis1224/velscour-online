// Velscour Unbound (docs/ENDGAME.md): the rematch three Abyssal Keys open. The keys (c.keys) drop from BOSS ROOM bosses
// past depth 600 under Heresy rank 10 and from Abyssal Rift Guardians from tier 10 (keyChance, read by loot.dropLoot).
// The fight itself is Velscour's five phases (game/velscour.js) with the Court of the Abyss, the Pact, the Abyssal Crown
// and the Unbound Chains on top (setupUnbound, called by setupVelscour when world.unbound). game.enterUnbound builds it.
//   The Court: two signature raid bosses (never the same two, nor last fight's pair; not the Pipe Organ), 0.8x a BOSS
//   ROOM's life and 0.65x its hits in three phases, their self-healing at 35%; the first at the east guard post when he rises, the second out of
//   phase 3's first hellgate. Their own Raid loop runs without its seal, its execute clock or its enrage (his 20-minute
//   clock is the only one), casting at 1/1.6 its pace while he fights too.
//   The Pact: for two minutes after each of them steps in (while it lives) he takes 40% of every hit (m.ward) and his
//   damage cap fills at 40% of its pace; then that courtier's Pact wanes.
//   Abyssal Crown and Unbound Chains: velscour.js.
import { G } from '../state.js';
import { clamp, chance, pick, shuffle, angleTo } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { addEffect, Telegraph, Ring, Bolt, burst, floatText, smoke } from '../gfx/vfx.js';
import { explosionFx } from '../gfx/shapes.js';
import { ART_BY_ID } from '../data/bestiary.js';
import { makeHeirloom } from '../data/relics.js';
import { UI } from '../ui/ui.js';
import { KEYS_RANK, worldRank } from './heresies.js';
import { endgameUnlocked, endgame, saveEndgame } from './endgame.js';
import { makeRaidBoss, RAID_BOSSES } from './raid.js';
import { dropLoot } from './loot.js';
import { DMG_MUL, PACE, inArena } from './velscour.js';

export const UNBOUND_KEYS = 3;
/** The rematch's dials, tuned with tools/tests/unbound.js (auto-play, depth-500 gear: 6.2-13.5 minutes, mean 8.3; the
 *  plain fight 5-6): his life on top of HP_MUL (he sits at the damage cap, so it mostly sizes his seals, shards and
 *  obelisks), his hits instead of DMG_MUL, the clock, the court's life and hits (of a BOSS ROOM boss's) and cast pace
 *  while he fights, the Pact's ward, the Crown's odds after the first win, an Unbound Chains obelisk's life (of his). */
export const UNBOUND = { hp: 2.4, dmg: 0.85, enrage: 20 * 60, courtHp: 0.8, courtDmg: 0.65, courtGap: 1.6, courtHeal: 0.35, pact: 0.4, pactFor: 120, crown: 0.25, obelisk: 0.035 };
// the throne arena as a raid arena (Raid.inside, startInter's leap); the gate is off the map so its seal blocks nothing
const ARENA = { x: 6, y: 4, w: 32, h: 27, cx: 22, cy: 17.5, gate: { x: -40, y0: -40, y1: -39 } };
const POST = [31, 13]; // the east guard post
// not in the court: the Pipe Organ's Danse Macabre wants a square hall (its rows cross the oval's walls and the lava tide,
// and auto-play spent 14 minutes dodging it, tools/tests/unbound.js)
const NOT_COURT = ['organ'];

export const keysOf = (c = G.char) => ((c && c.keys) | 0);
/** Three keys and the Endgame open: the altar (and the skull's "unbound") may start the rematch. */
export const unboundReady = (c = G.char) => !!c && keysOf(c) >= UNBOUND_KEYS && endgameUnlocked(c);
/** The chance a slain raid boss drops an Abyssal Key. dropLoot runs three times for a BOSS ROOM boss (combat.kill and
 *  Raid.onDeath twice): only the first roll counts. G.forceKey (tests only) makes a key certain where one can drop. */
export function keyChance(world, m) {
  if (!world || !m || !m.isRaid || m.raid?.court || m._keyRoll) return 0;
  m._keyRoll = true;
  let k = 0;
  if (world.rift) k = world.rift.tier >= 10 ? clamp(0.12 + 0.005 * world.rift.tier, 0, 0.5) : 0;
  else if (world.depth > 600 && worldRank(world) >= KEYS_RANK) k = clamp(0.06 + 0.002 * (world.depth - 600), 0, 0.25);
  return k > 0 && G.forceKey ? 1 : k;
}
/** Spend the keys on the rematch. False if the hero can't. */
export function spendKeys(c = G.char) {
  if (!unboundReady(c)) return false;
  c.keys -= UNBOUND_KEYS;
  return true;
}

// ---------------------------------------------------------------- the fight
/** The rematch on top of Velscour's fight V (game/velscour.js VelscourFight): his dials and his court's choice. */
export function setupUnbound(V) {
  const m = V.m, c = G.char;
  V.unbound = true; V.court = []; V.enrageT = UNBOUND.enrage;
  m.maxHp *= UNBOUND.hp; m.hp = m.maxHp; V.lastHp = m.hp;
  m.dmg *= UNBOUND.dmg / DMG_MUL;
  m.name = 'Velscour Unbound';
  // two signature bosses, never the same two and never last fight's pair
  const last = (c && c.unbound && c.unbound.court) || [];
  let two;
  const pool = RAID_BOSSES.filter((b) => b.sigs && !NOT_COURT.includes(b.id));
  for (let i = 0; i < 20; i++) { two = shuffle(pool).slice(0, 2); if (!two.every((b) => last.includes(b.id))) break; }
  if (G.unboundCourt) { two = [0, 1].map((i) => pool.find((b) => b.id === G.unboundCourt[i])); two = two.map((b) => b || pick(pool.filter((x) => !two.includes(x)))); } // tests only
  V.courtTpl = two;
  V.courtArt = two.map((b) => pick(b.art.filter((id) => ART_BY_ID[id]))); // game.enterUnbound loads them with the level
  if (c && c.unbound) c.unbound.court = two.map((b) => b.id);
  return V;
}

/** One of the court steps into the fight at (x, y): awake, inside, no seal, no clock, no enrage. */
function summonCourt(V, i, x, y) {
  const w = V.world, m = V.m;
  const b = makeRaidBoss(w, ARENA, w.depth, m.level, { tpl: V.courtTpl[i], art: V.courtArt[i], court: true, hp: UNBOUND.courtHp, dmg: UNBOUND.courtDmg });
  [b.x, b.y] = w.map.nudge(x, y, 1);
  b.awake = true; b.post = [b.x, b.y]; b.bornT = V.t;
  const heal = b.heal.bind(b); b.heal = (n) => heal(n * UNBOUND.courtHeal); // their wards, orbs and drains mend them a third as much: with him in the fight a hero can't play every mechanic, and Ysol outhealed a wizard for 20 minutes
  const R = b.raid;
  R.execT = Infinity; R.enrage = () => {}; // (Raid.update reads both; enraged stays false so it casts at its own pace)
  R.onDeath = () => courtDeath(V, b);
  if (R.phases.length > 3) { R.phases = [R.phases[0], R.phases[1], R.phases[R.phases.length - 1]]; R.marks = [0.66, 0.33]; } // three phases (the last its own finale): two ward interludes
  w.add(b); V.court.push(b);
  addEffect(new Ring(b.x, b.y, 0.3, 5, 1, R.E.glow, 6)); smoke(b.x, b.y, 0, '#200808', 8, 12);
  floatText(b.x, b.y, 170, R.tpl.name.toUpperCase(), '#ff9070', 16, { life: 2 });
  UI.log(`<b style="color:#ff6040">${R.tpl.name}, ${R.tpl.title}</b> of the Court of the Abyss fights for him. <b>The Pact</b>: while his court lives, Velscour takes 60% less damage.`, '#ffc0a0');
  sfx('roar'); sfx('boss');
  return b;
}
/** A court boss falls: its wards and adds with it, a BOSS ROOM's two drops (loot), and the Pact breaks with the last. The
 *  dark stays (his abyss owns it); the hero's sunder/polarity multipliers reset (a living one sets them every frame). */
function courtDeath(V, b, loot = true) {
  const w = b.world, R = b.raid, p = w.player, m = V.m;
  if (p) { p.raidDmgMul = 1; p.raidTakenMul = 1; }
  b.reflect = false;
  if ((G.raidLog || (G.raidLog = [])).length > 50) G.raidLog.shift();
  G.raidLog.push({ boss: R.tpl.id, depth: R.depth, secs: Math.round(R.t), minHp: +(R.minHp ?? 1).toFixed(2), phases: R.phases.length, mods: R.mods.join(','), court: true });
  for (const c of [...R.wards, ...R.minions]) if (!c.dead) { c.dead = true; burst(c.x, c.y, 30, R.tpl.el, 12, 2); }
  if (loot && p) { dropLoot(w, b); dropLoot(w, b); }
  explosionFx(b.x, b.y, 4, R.tpl.el === 'phys' ? 'fire' : R.tpl.el, 'eruption', { shake: 14 });
  if (!m.dead && V.court.every((c) => c.dead || c === b) && V.court.length) {
    m.ward = 1;
    UI.centerMsg('THE PACT IS BROKEN', V.gate2 ? 'Velscour stands alone' : 'His court will answer again', 2.6);
    addEffect(new Ring(m.x, m.y, 0.3, 5, 0.8, '#20e0ff', 6));
  }
}
/** Phase 1: the first of the court at the east guard post. */
export function courtBegin(V) { summonCourt(V, 0, POST[0], POST[1]); }
/** Phase 3's first hellgate: the second of the court climbs out of it (false once it has). */
export function courtGate(V) {
  if (V.gate2 || !V.court.length) return false;
  V.gate2 = true; // the gate opens once
  const w = V.world, m = V.m, p = V.p;
  const a = angleTo(m.x, m.y, p.x, p.y) + (chance(0.5) ? 1.2 : -1.2);
  let [gx, gy] = w.map.nudge(m.x + Math.cos(a) * 4, m.y + Math.sin(a) * 4, 1);
  if (!inArena(gx, gy, 0.8)) [gx, gy] = w.map.nudge(POST[0] - 18, POST[1], 1);
  addEffect(new Telegraph({ kind: 'circle', x: gx, y: gy, r: 2.4, dur: 1.6, color: '#ff4010' }), 'ground');
  floatText(m.x, m.y, 160, 'MY COURT, TO ME', '#ff5020', 16, { life: 1.6 });
  UI.log('<b style="color:#ff5020">A hellgate tears open</b>: the second of the Court of the Abyss climbs out!', '#ffb090');
  sfx('roar', 0.7);
  w.addHazard({ t: 1.6, team: 'enemy', update(dt) {
    this.t -= dt; if (this.t > 0) return true;
    if (m.dead) return false;
    explosionFx(gx, gy, 2.6, 'fire', 'eruption', { shake: 10 }); addEffect(new Ring(gx, gy, 0.2, 2.6, 0.6, '#ff3010', 5));
    summonCourt(V, 1, gx, gy);
    return false; }, draw() {} });
  return true;
}
/** Every frame of the fight: the Pact's ward and tethers, the dark of the abyss held, the court kept in the arena (and out
 *  of phase 3's lava tide, where a melee hero won't follow: a courtier stood in it for 18 minutes). */
export function unboundTick(V, dt) {
  const m = V.m, w = V.world;
  const alive = V.court.filter((b) => !b.dead);
  // a courtier holds the Pact for its first two minutes in the fight (pactFor), then it wanes: a courtier a hero can't
  // bring down (Ser Valdric's tether, Ashenward's furnace) froze him at a phase gate for the whole 20-minute clock
  const binding = alive.filter((b) => V.t - (b.bornT ?? V.t) < UNBOUND.pactFor);
  for (const b of alive) if (!b.waned && !binding.includes(b)) { b.waned = true; UI.centerMsg('THE PACT WANES', `${b.raid.tpl.name} no longer shields him`, 2.4); addEffect(new Ring(m.x, m.y, 0.3, 4, 0.8, '#20e0ff', 5)); }
  m.ward = binding.length ? UNBOUND.pact : 1;
  // the Pact holds for every hero: of the damage cap's refill (VelscourFight.pace) only the ward's share stays, so a hero
  // far over the cap (whose 40% would still fill it) loses the same 60% of his pace as one under it
  if (binding.length && V.phase) V.bank = Math.max(0, V.bank - m.maxHp * PACE * dt * (1 - UNBOUND.pact));
  // the timed objectives (seals: two minutes, shards: the abyss) come before the court for auto-play: the court gives up its
  // priority meanwhile (else the courtier at hand beat a seal ten tiles off, and all four seals ran out)
  const timed = V.phase === 2 || V.phase === 4;
  if (timed && V.objPri !== V.phase) { V.objPri = V.phase; for (const c of V.parts) if (c.vk === 'seal' || c.vk === 'shard') { c.raidPriority = 9; if (c.warden) c.warden.raidPriority = 9.5; } }
  if (V.phase === 4) w.darkK = Math.max(w.darkK || 0, 0.93); // a court boss's eclipse clears the dark when it ends
  const k = V.lava && !V.lava.dead ? V.lava.k : 1.03; // (the hero keeps to 0.95 of it: a courtier at its rim is in reach)
  for (const b of alive) {
    // while he fights too (phases 1, 3, 5) a courtier casts at 1/1.6 its pace: both their hazards at once left auto-play
    // no ground to stand on (Ser Valdric beside the lava tide: 14 minutes of dodging)
    const R = b.raid;
    b.raidPriority = timed || b.waned ? 0 : 6; // (once its Pact has waned, he is the target again: a wizard spent 19 minutes on Vexis)
    if (R.gap > (R.gap0 ?? Infinity) && !V.hold) R.gap *= UNBOUND.courtGap;
    R.gap0 = R.gap;
    if ((b.tetherT = (b.tetherT || 0) - dt) <= 0 && !V.hold) { b.tetherT = 0.2; addEffect(new Bolt(b.x, b.y, 80, m.x, m.y, 110, '#20e0ff', 0.16, 2)); }
    if (inArena(b.x, b.y, k)) { b.outT = 0; continue; }
    if ((b.outT = (b.outT || 0) + dt) > 1.5) { [b.x, b.y] = w.map.nudge(b.post[0], b.post[1], 1); b.nav = null; b.outT = 0; smoke(b.x, b.y, 0, '#200808', 6, 10); }
  }
}
/** His death: the court falls with him, and the spoils on top of his hoard: one Unbound Heirloom and, the first win
 *  always and then one in four, the Crown of the Demon Lord (both open, never sealed). */
export function unboundSpoils(V, lvl, drop) {
  const c = G.char;
  for (const b of V.court) if (!b.dead) { b.dead = true; b.hp = 0; courtDeath(V, b, false); }
  const open = (it) => { if (it) it.sealed = false; return it; };
  const first = !(c.unbound.wins > 0);
  drop(open(makeHeirloom(lvl, { unbound: true })));
  if (first || chance(UNBOUND.crown)) drop(open(makeHeirloom(lvl, { id: 'crown_demon' })));
  const E = endgame(); E.unboundWins++; saveEndgame();
  const secs = Math.round(V.t);
  c.unbound.best = c.unbound.best ? Math.min(c.unbound.best, secs) : secs;
}
