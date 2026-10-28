// Heresies (docs/ENDGAME.md, data/heresies.js): the difficulty modifiers a hero switches on at the Altar of Heresy
// once Velscour has fallen. They are read when a level is built (game.buildDungeon / buildBreach: heresySpawns and
// heresyWorld, after the Greed lever) and never in Abyssal Rifts or Velscour Unbound; heresyTick (from happeningsTick)
// marks every enemy as it appears. The hero's own ones (Glass Cannon, Dry Throat, Hunger) read the level he is in, so
// a rift is played clean. Saves keep c.heresy.on; the rank's rewards are heresyMods in data/heresies.js.
import { G } from '../state.js';
import { chance, pick, rand, angleTo, dist, shuffle, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { addEffect, Telegraph, Ring, smoke, floatText } from '../gfx/vfx.js';
import { explosionFx } from '../gfx/shapes.js';
import { ELITE_AFFIXES } from '../data/enemies.js';
import { HERESIES, HERESY_BY_ID, heresyRank, heresyMods, KEYS_RANK, MARKS_RANK } from '../data/heresies.js';
import { endgameUnlocked } from './endgame.js';
import { depthLevel } from '../data/depth.js';
import { makeMonster } from './monster.js';

export { HERESIES, HERESY_BY_ID, heresyRank, heresyMods, KEYS_RANK, MARKS_RANK };

/** The Heresies this hero has switched on (ids). */
export const heresiesOf = (c = G.char) => (c && c.heresy && Array.isArray(c.heresy.on) ? c.heresy.on.filter((id) => HERESY_BY_ID[id]) : []);
export const heresyRankOf = (c = G.char) => heresyRank(heresiesOf(c));
/** The Heresies the level was built with (none in town, rifts and Unbound). */
export const worldHeresies = (w = G.world) => (w && w.heresy ? w.heresy.ids : []);
export const worldRank = (w = G.world) => (w && w.heresy ? w.heresy.rank : 0);
/** Is a Heresy in force where the hero stands: the level's set in a dungeon, the hero's own in town. */
export function heresyActive(id, c = G.char, w = G.world) {
  return (w && w.kind === 'dungeon' ? worldHeresies(w) : heresiesOf(c)).includes(id);
}
/** Switch one on or off (the altar). It takes hold from the next level built. */
export function setHeresy(id, on, c = G.char) {
  if (!c || !HERESY_BY_ID[id] || !endgameUnlocked(c)) return false;
  const ids = heresiesOf(c), has = ids.includes(id);
  if (!!on === has) return false;
  c.heresy = { on: on ? [...ids, id] : ids.filter((k) => k !== id) };
  const H = HERESY_BY_ID[id], rank = heresyRankOf(c), M = heresyMods(rank);
  if (G.ui && G.ui.log) G.ui.log(`<b style="color:${H.color}">${escapeHtml(H.name)}</b> ${on ? 'embraced' : 'renounced'}: Heresy rank <b>${rank}</b> (x${M.loot.toFixed(2)} drops, +${M.mf}% magic find, +${Math.round((M.xp - 1) * 100)}% XP) from the next level.`, '#ffb090');
  if (G.player) G.player.recompute();
  return true;
}
/** One line naming what is on. */
export const heresyText = (ids) => (ids && ids.length ? ids.map((id) => HERESY_BY_ID[id] && HERESY_BY_ID[id].name).filter(Boolean).join(' · ') : 'none');

// ---------------------------------------------------------------- building a level
/** Pack spawns of a fresh level: Twinned Packs double every pack (not guardians, raid bosses or Velscour). */
export function heresySpawns(spawns, ids) {
  if (!ids || !ids.includes('twins')) return spawns;
  return spawns.map((s) => (!s.n || ['raid', 'boss'].includes(s.rank) ? s : { ...s, n: s.n * 2 }));
}
/** Which Heresies a level is built with: set before its monsters are made (BOSS ROOM bosses read it), none in rifts and Unbound. */
export function heresyBegin(world, c = G.char) {
  if (!world || world.kind !== 'dungeon' || world.rift || world.unbound) { if (world) world.heresy = null; return []; }
  const ids = heresiesOf(c);
  world.heresy = { ids, rank: heresyRank(ids) };
  return ids;
}
/** The level's dials once built (after the omen and the Greed lever): rewards by rank, the Legion's clock, ambush pace. */
export function heresyWorld(world, c = G.char) {
  if (!world || !world.heresy) heresyBegin(world, c);
  if (!world || !world.heresy) return;
  const { ids, rank } = world.heresy;
  if (!rank) return;
  const M = heresyMods(rank);
  world.lootMul = (world.lootMul || 1) * M.loot;
  world.goldMul = (world.goldMul || 1) * M.gold;
  world.mfAdd = (world.mfAdd || 0) + M.mf;
  world.sigilMul = (world.sigilMul || 1) * M.sigil;
  world.relicMul = (world.relicMul || 1) * M.relic; // (XP: per monster, heresyMonster)
  if (ids.includes('ambush')) world.heresyAmbush = 3;
  if (ids.includes('legion')) world.legionT = rand(25, 40);
  if (ids.includes('hunger')) { // no orbs from any source (kills, the Feeding Frenzy omen, ...)
    const add = world.addLoot;
    world.addLoot = function (l) { return l && (l.kind === 'orb_hp' || l.kind === 'orb_mp') ? l : add.call(this, l); };
  }
}
/** Each enemy as it appears (packs, ambushes, adds): Iron Hide, Cruel Hand, Velscour's Gaze, Crowned Champions, the XP bonus. */
export function heresyMonster(m, ids) {
  if (!m || m._heresy || m.team !== 'enemy' || m.summon) return;
  m._heresy = true;
  if (!ids || !ids.length) return;
  if (ids.includes('iron')) { m.maxHp *= 1.5; m.hp *= 1.5; }
  if (ids.includes('cruel')) m.dmg *= 1.3;
  if (ids.includes('gaze')) { m.aggroRange = (m.aggroRange ?? 8.5) * 2; m.gaze = true; } // (a raid boss's 0 stays 0; Monster.pickTarget: an awake one never loses the hero)
  if (ids.includes('crowned') && (m.rank === 'champion' || m.rank === 'unique') && m.affixes) {
    const keys = Object.keys(ELITE_AFFIXES).filter((k) => !m.affixes.includes(k) && (k !== 'multishot' || ['ranged', 'caster'].includes(m.ai)));
    for (const k of shuffle(keys).slice(0, m.rank === 'champion' ? 2 : 1)) {
      m.affixes.push(k);
      if (k === 'strong') m.dmg *= 1.5;
      if (k === 'fast') { m.speed *= 1.4; m.atkCd *= 0.75; }
      if (k === 'tough') { m.maxHp *= 1.5; m.hp *= 1.5; for (const e of ['phys', 'fire', 'cold', 'light', 'poison']) m.res[e] = (m.res[e] || 0) + 0.15; }
      if (k === 'fiery') m.res.fire = (m.res.fire || 0) + 0.4;
      if (k === 'frozen') m.res.cold = (m.res.cold || 0) + 0.4;
    }
  }
  const xp = heresyMods(heresyRank(ids)).xp;
  if (xp !== 1) m.xp *= xp;
}
/** Every so often (happeningsTick): mark the enemies that appeared, and open the Legion's hellgate when it is time. */
export function heresyTick(world, dt) {
  const H = world.heresy, p = world.player;
  if (!H || !H.rank || !p) return;
  if ((world.heresyT = (world.heresyT || 0) - dt) <= 0) {
    world.heresyT = 0.4;
    for (const m of world.creatures) if (!m._heresy && !m.dead) heresyMonster(m, H.ids);
  }
  // the Legion's clock stands still while a guardian or BOSS ROOM boss is awake; at most 8 of its demons alive
  if (world.legionT !== undefined && !p.dead && !(world.boss && world.boss.awake && !world.boss.dead) && (world.legionT -= dt) <= 0) {
    world.legionT = rand(40, 55);
    const alive = world.creatures.filter((c) => c.pitSpawn && !c.dead).length;
    if (alive < 8) legionGate(world, p, Math.min(4, 8 - alive, 2 + Math.floor(rand(0, 3))), depthLevel(world.depth || 1));
  }
}
/**
 * Velscour's Legion of the Pit: a hellgate tears open near `near` (a creature) and n Pit Demons / Imps climb out a
 * moment later (his own fight calls it with himself as the source; the Heresy with the hero). Their level: lvl - 2.
 */
export function legionGate(world, near, n, lvl, opts = {}) {
  const w = world, p = w.player;
  if (!p || n <= 0) return null;
  const a = opts.src ? angleTo(near.x, near.y, p.x, p.y) + (Math.random() < 0.5 ? 1.2 : -1.2) : rand(0, Math.PI * 2);
  let [gx, gy] = w.map.nudge(near.x + Math.cos(a) * (opts.src ? 3 : 4.5), near.y + Math.sin(a) * (opts.src ? 3 : 4.5), 0.6);
  // the Heresy's gate: in the hero's sight, on ground joined to him (not behind a wall, not on another island of the Breach)
  if (!opts.src) for (let i = 0; i < 24; i++) {
    const b = rand(0, Math.PI * 2), r = rand(3.5, 5.5), x = near.x + Math.cos(b) * r, y = near.y + Math.sin(b) * r;
    if (w.map.circleFree(x, y, 0.6) && w.map.flowAt(x, y) >= 0 && w.map.los(near.x, near.y, x, y)) { gx = x; gy = y; break; }
  }
  addEffect(new Telegraph({ kind: 'circle', x: gx, y: gy, r: 1.8, dur: 1.2, color: '#ff4010' }), 'ground');
  if (G.ui && G.ui.log) G.ui.log(`<b style="color:#ff5020">Legion of the Pit</b>: ${opts.src ? 'Velscour tears open a hellgate and his demons climb out!' : 'a hellgate tears open beside you; Velscour\'s demons climb out.'}`, '#ffb090');
  if (opts.src) floatText(near.x, near.y, 160, 'RISE, MY LEGION', '#ff5020', 16, { life: 1.6 });
  sfx('roar', 0.7);
  return w.addHazard({ t: 1.2, team: 'enemy', update(dt) {
    this.t -= dt; if (this.t > 0) return true;
    explosionFx(gx, gy, 2, 'fire', 'eruption'); addEffect(new Ring(gx, gy, 0.2, 2.2, 0.6, '#ff3010', 5)); sfx('summon');
    for (let i = 0; i < n; i++) {
      const [x, y] = w.map.randomNear(gx, gy, 1.6);
      const d = makeMonster(w, i % 2 ? 'imp' : 'demon', w.biome, Math.max(1, lvl - 2), i === 0 ? 'champion' : 'normal', x, y);
      d.awake = true; d.aggro = p; d.maxHp *= 0.55; d.hp = d.maxHp; d.pitSpawn = true; d.name = i % 2 ? 'Pit Imp' : 'Pit Demon';
      w.add(d); smoke(x, y, 0, '#200808', 5, 9);
    }
    return false; }, draw() {} });
}

// ---------------------------------------------------------------- the hero
/** Glass Cannon: { life: -25, dmg: +15 } (percent) where it is in force. */
export function heresyHero(c = G.char) {
  return heresyActive('glass', c) ? { life: -25, dmg: 15 } : { life: 0, dmg: 0 };
}
/** May the hero drink ('potion'), pick up orbs ('orb'), regenerate ('regen') where he stands? */
export function heresyAllows(what, c = G.char, w = G.world) {
  if (what === 'potion') return !heresyActive('thirst', c, w);
  if (what === 'orb' || what === 'regen') return !heresyActive('hunger', c, w);
  return true;
}
/** The Fifth Phase: one more phase for a BOSS ROOM boss (the template's next, else its Final Stand again), marks respaced. */
export function heresyRaid(raid) {
  if (!raid || raid.fifth) return;
  raid.fifth = true;
  const tpl = raid.tpl, n = raid.phases.length;
  raid.phases = [...raid.phases, tpl.phases[n] || { ...raid.phases[n - 1], name: 'Beyond the End' }];
  const N = raid.phases.length;
  raid.marks = Array.from({ length: N - 1 }, (_, i) => Math.round((0.78 - (0.6 / (N - 2)) * i) * 100) / 100); // 5: [0.78, 0.58, 0.38, 0.18]
}
/** The Quest Log / altar: the rank's rewards in words. */
export function heresyRewardText(rank) {
  const M = heresyMods(rank);
  return `x${M.loot.toFixed(2)} drops · +${M.mf}% magic find · x${M.gold.toFixed(2)} gold · +${Math.round((M.xp - 1) * 100)}% XP · x${M.sigil.toFixed(2)} Sigils · x${M.relic.toFixed(2)} relics`;
}
export { pick, dist };
