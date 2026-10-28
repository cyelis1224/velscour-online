// Abyssal Rifts (docs/ENDGAME.md, data/rifts.js): the run inside a rift level. game.buildRift makes the level (a small
// maze with a BOSS ROOM arena, no boss yet) and calls createRiftRun; game.update runs riftTick; combat.kill calls riftKill;
// at the quota the Guardian stirs in the arena, and its death is the win (riftWin: tiers opened by the time, Marks, the
// Guardian's extra loot, the honour board). The clock running out is riftCollapse. ui/rifts.js shows it all.
import { G } from '../state.js';
import { rand, chance, pick, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { addEffect, Ring, Column, floatText } from '../gfx/vfx.js';
import { explosionFx } from '../gfx/shapes.js';
import { UI } from '../ui/ui.js';
import { makeRaidBoss, RAID_BOSSES } from './raid.js';
import { GroundItem } from './loot.js';
import { rollItem, rollSigil, rarityAt, ABYSSAL, goldPile, RARITY } from '../data/items.js';
import { RIFT_TIME, RIFT_QUOTA, RIFT_DENSITY, RIFT_GUARDIAN_HP, riftDepth, riftLevel, riftJump, riftWeight, riftReward, fmtTime } from '../data/rifts.js';
import { markBonuses, grantMarks, riftMarks } from './marks.js';
import { noteRiftBest, endgame } from './endgame.js';
import { Board, barred } from './leaderboard.js';
import { Cloud } from './cloud.js';

export { RIFT_TIME, RIFT_QUOTA, RIFT_DENSITY, riftDepth, riftLevel, riftJump, riftReward, fmtTime };
/** The clock a rift gives: the base plus Haste Marks. */
export const riftTime = () => RIFT_TIME + markBonuses().rift;
/** May the hero enter tier T: 1 .. the tier his wins opened. */
export const riftOpen = (c = G.char) => Math.max(1, (c && c.rifts && c.rifts.open) | 0);

/** The run object, kept on world.rift. */
export function createRiftRun(world, gen, tier, hooks = {}) {
  // the quota counts what the level holds (every champion of a pack is one; a unique's minions are normals)
  const total = world.creatures.reduce((s, m) => s + (m.team === 'enemy' && !m.dead ? riftWeight(m) : 0), 0);
  const run = {
    tier, t: 0, limit: riftTime(), progress: 0, total: Math.max(1, total), quota: Math.max(1, Math.ceil(total * RIFT_QUOTA)),
    guardian: null, done: false, failed: false, gen, world, hooks, warned: {},
    get left() { return Math.max(0, this.limit - this.t); },
    get pct() { return Math.min(100, Math.floor((this.progress / this.quota) * 100)); },
    label() { return `TIER ${this.tier} · ${fmtTime(this.left)} · ${this.guardian ? (this.guardian.dead ? 'won' : 'the Guardian') : this.pct + '%'}`; },
  };
  return run;
}

/** A kill in a rift: progress toward the Guardian. */
export function riftKill(world, m) {
  const R = world.rift;
  if (!R || R.done || R.failed) return;
  const w = riftWeight(m);
  if (!w) return;
  R.progress += w;
  if (!R.guardian && R.progress >= R.quota) spawnGuardian(world);
}

/** The Guardian stirs in the arena once the quota is met. */
export function spawnGuardian(world) {
  const R = world.rift, A = R.gen.raid;
  if (!R || R.guardian || !A) return null;
  const depth = world.depth, lvl = riftLevel(R.tier);
  // the classic BOSS ROOM bosses: the twenty signature fights (game/raidsigs.js) are puzzles that run past a rift's clock
  const c = G.char, tpl = pick(RAID_BOSSES.filter((b) => !b.sigs && b.id !== (c && c.lastRiftBoss)));
  if (c) c.lastRiftBoss = tpl.id;
  const m = makeRaidBoss(world, A, depth, lvl + 3, { tpl, hp: RIFT_GUARDIAN_HP });
  world.add(m);
  world.boss = m; world.raid = m.raid;
  R.guardian = m; R.gT = R.t;
  const od = m.onDeath;
  m.onDeath = () => { od(); riftWin(world, m); };
  m.raid.announced = true; // no "BOSS ROOM" banner: the rift's own
  UI.centerMsg('THE GUARDIAN STIRS', `${m.name}, ${m.title}, holds the Rift Heart`, 3.2);
  UI.log(`<b style="color:#20e0ff">The Guardian stirs</b> in the arena: ${escapeHtml(m.name)}. Slay it before the clock runs out.`, '#a0f0ff');
  addEffect(new Ring(m.x, m.y, 0.3, 6, 1, '#20e0ff', 7)); sfx('roar'); sfx('boss');
  world.map.reveal(A.cx, A.cy, 10);
  return m;
}

/** The clock (game.update, next to happeningsTick). */
export function riftTick(world, dt) {
  const R = world.rift, p = world.player;
  if (R && R.failed && R.backT > 0) { if ((R.backT -= dt) <= 0 && R.hooks.onBack) R.hooks.onBack(); return; } // thrown out 2.5 s after the collapse (game time)
  if (!R || R.done || R.failed || !p || p.dead) return;
  R.t += dt;
  const left = R.left;
  for (const [at, msg] of [[60, 'One minute left in the Rift!'], [30, 'Thirty seconds!'], [10, 'Ten seconds!']]) if (left <= at && !R.warned[at]) { R.warned[at] = true; UI.centerMsg(fmtTime(at), 'The Rift is closing', 1.8); sfx('error'); }
  if (left <= 0) riftCollapse(world);
}

/** The Guardian is dead: the win. */
export function riftWin(world, m) {
  const R = world.rift, c = G.char, p = world.player;
  if (!R || R.done || R.failed) return;
  R.done = true;
  const time = R.t, k = time / R.limit, jump = riftJump(k), tier = R.tier;
  c.rifts ||= { open: 1, best: 0, cleared: {}, bestTime: {}, runs: 0, fails: 0, deaths: 0 };
  const first = !c.rifts.cleared[tier];
  c.rifts.cleared[tier] = (c.rifts.cleared[tier] || 0) + 1;
  c.rifts.best = Math.max(c.rifts.best || 0, tier);
  c.rifts.open = Math.max(c.rifts.open || 1, tier + jump);
  c.rifts.bestTime[tier] = Math.min(c.rifts.bestTime[tier] || 1e9, Math.round(time * 10) / 10);
  const marks = grantMarks(riftMarks(tier), `for Tier ${tier}`);
  // the Guardian's extra hoard
  const RW = riftReward(tier, first), lvl = riftLevel(tier) + 2;
  const drop = (kind, data) => world.addLoot(new GroundItem(m.x + rand(-1.2, 1.2), m.y + rand(-1.2, 1.2), kind, data));
  const rar = chance(RW.abyssal) ? ABYSSAL : rarityAt(lvl, 5);
  drop('item', { item: rollItem(lvl, { rarity: rar, mf: p ? p.st.magicFind : 0 }) });
  for (let i = 0; i < RW.sigils; i++) drop('item', { item: rollSigil(world.depth, RW.sigilBonus) });
  for (let i = 0; i < 4; i++) drop('gold', { amount: Math.round(goldPile(lvl) * rand(2, 4) * (1 + ((p && p.st.goldFind) || 0) / 100)) });
  // records: this hero's, the account's, the honour board's (a hero that took Velscour's gift keeps only its own)
  const cheat = barred(c), best = !cheat && noteRiftBest(c.classId, tier, time);
  R.result = { tier, time, jump, next: tier + jump, marks, first, rarity: rar, best, personal: c.rifts.bestTime[tier] === Math.round(time * 10) / 10 };
  if (cheat) { R.result.board = 'barred'; Board.withdraw(c.classId).catch((e) => console.warn('Honour board:', e)); }
  else if (best) { // the honour board keeps the better of this and the entry already there (game/cloud.js putBoard)
    R.result.board = Cloud.signedIn ? 'pending' : 'signedout';
    Board.submit(c, tier, time).then((r) => { R.result.board = r && r.ok ? 'posted' : r && r.kept ? 'kept' : Cloud.signedIn ? 'offline' : 'signedout'; })
      .catch((e) => { R.result.board = 'offline'; console.warn('Honour board:', e); });
  }
  UI.centerMsg('THE RIFT IS CLOSED', `Tier ${tier} in ${fmtTime(time)} · Tier${jump > 1 ? 's' : ''} ${tier + 1}${jump > 1 ? `-${tier + jump}` : ''} open`, 4);
  UI.log(`<b style="color:#20e0ff">Abyssal Rift Tier ${tier}</b> closed in ${fmtTime(time)} (${Math.round(k * 100)}% of the clock): +${jump} tier${jump > 1 ? 's' : ''}, ${/^[AEIOU]/.test(RARITY[rar].name) ? 'an' : 'a'} <b style="color:${RARITY[rar].color}">${RARITY[rar].name}</b> prize${best ? ', <b>a new best</b> for your ' + c.classId.replace('_', ' ') : ''}.`, '#a0f0ff');
  addEffect(new Column(m.x, m.y, '#20e0ff', 1.4, 60, 420)); G.flash = 0.5; sfx('levelup');
  if (R.hooks.onWin) R.hooks.onWin(R.result);
}

/** The hero left a rift that was neither won nor lost (the town portal, auto-play's retreat): a fail (game.setWorld). */
export function riftLeave(world) {
  const R = world.rift, c = G.char;
  if (!R || R.done || R.failed || !c) return;
  R.failed = true;
  c.rifts.fails = (c.rifts.fails || 0) + 1;
}

/** The clock ran out: the rift collapses, the hero is thrown back to town. */
export function riftCollapse(world) {
  const R = world.rift, c = G.char, p = world.player;
  if (!R || R.done || R.failed) return;
  R.failed = true; R.backT = 2.5;
  c.rifts.fails = (c.rifts.fails || 0) + 1;
  if (p) p.invuln = 3; // nothing lands in the collapse
  UI.centerMsg('THE RIFT COLLAPSES', `Tier ${R.tier} · the clock ran out`, 3.5);
  UI.log(`<b style="color:#ff6050">The Rift collapses</b> round you: the clock ran out ${R.guardian ? 'with the Guardian still standing' : `at ${R.pct}% of the quota`}. Tier ${R.tier} is still yours to try.`, '#ffb0a0');
  explosionFx(p.x, p.y, 5, 'arcane', 'eruption', { shake: 16 }); G.flash = 0.8; sfx('explode'); sfx('portal');
  if (R.hooks.onFail) R.hooks.onFail();
}
export { pick };
