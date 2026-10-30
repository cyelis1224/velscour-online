// A stage from start to finish: the battle it builds and what winning (or losing) it pays.
import { LEVELS, REGIONS } from '../data/campaign.js';
import { RECRUITS, HERO_BY_ID } from '../data/heroes.js';
import { CARDS } from '../data/cards.js';
import { buildMap } from '../battle/map.js';
import { stageWaves, deployLimit, heartBase } from '../data/waves.js';
import { Battle } from '../battle/sim.js';
import { unitDef, stageAlly, trophyBonus } from './power.js';
import { researchBonus } from './research.js';
import { grant } from './gacha.js';
import { spendSeal } from './seals.js';

export const SQUAD_MAX = 10;
export const stageUnlocked = (save, n) => n <= save.frontier && n <= LEVELS.length;
export const regionOf = (n) => REGIONS[Math.floor((n - 1) / 10)];

/** Bastion's Resolve: each defeat in a row at a stage gives +4% attack there (up to +20%) until it is won. */
export const resolveOf = (save, n) => Math.min(0.6, 0.04 * (save.progress[n]?.losses || 0));

/** opts.noSeal: fight without spending a Rift Seal (a replay then pays only scraps; a first clear always pays). */
export function startStage(save, n, opts = {}) {
  const sealed = !opts.noSeal && spendSeal(save, opts.now);
  const L = LEVELS[n - 1], map = buildMap(n), R = { ...researchBonus(save), resolve: resolveOf(save, n), trophy: trophyBonus(save), drops: sealed ? 1 : 0 };
  const squad = save.squad.filter((id) => save.cards['h:' + id]?.n > 0).slice(0, SQUAD_MAX).map((id) => unitDef(id, save, { research: R }));
  return new Battle({ map, stage: L, waves: stageWaves(n, map.routes.length), squad, ally: opts.noAlly ? null : stageAlly(n, save),
    heart: heartBase(n), deployLimit: deployLimit(n), bonus: R, seed: opts.seed || 'battle:' + n + ':' + (save.stats.battles || 0), sealed });
}

/**
 * Pay out a finished battle: returns { gold, shards, essence, trophies, newStars, first, recruit, unlocked, sealed }.
 * A battle fought with a Rift Seal pays in full; without one only a seventh of the gold (first clears always pay).
 */
export function finishStage(save, n, b) {
  const L = LEVELS[n - 1], R = researchBonus(save), prev = save.progress[n] || { stars: 0, clears: 0, best: 0 };
  const first = b.won && prev.clears === 0, newStars = Math.max(0, (b.stars || 0) - prev.stars), paid = b.sealed || first;
  let gold = Math.round(b.gold * (1 + R.gold)), shards = 0, essence = 0;
  if (b.won) {
    gold += Math.round((60 + 25 * n) * (first ? 2.5 : 1) * (1 + R.gold));
    shards += first ? 40 + Math.round(1.2 * n) + (L.boss ? 120 : L.lieutenant ? 40 : 0) : 4 + 2 * b.stars;
    shards += newStars * 15;
    essence += first ? 10 + Math.floor(n / 5) + (L.boss ? 60 : 0) : 2 + Math.floor(n / 25) + (L.boss ? 10 : 0);
  } else { gold = Math.round(gold * 0.6); essence = 1; }
  if (!paid) { gold = Math.round(gold / 7); shards = 0; essence = 0; }
  save.gold += gold; save.shards += shards; save.essence += essence;
  const trophies = (b.drops || []).map((id) => grant(save, CARDS['x:' + id])).filter(Boolean);
  save.progress[n] = { stars: Math.max(prev.stars, b.stars || 0), clears: prev.clears + (b.won ? 1 : 0), best: Math.max(prev.best, Math.round((b.pct || 0) * 100)), tries: (prev.tries || 0) + 1,
    losses: b.won ? 0 : (prev.losses || 0) + 1 };
  // stats for quests and achievements
  const S = save.stats;
  S.battles++; if (b.won) S.wins++; if (b.won && b.stars === 3) S.perfects = (S.perfects || 0) + 1;
  S.kills += b.kills; S.deploys += b.units.length + (b.retreats || 0); S.skills += b.skillsCast || 0; S.empowers = (S.empowers || 0) + (b.empowers || 0);
  if (b.won) S.bestWave = Math.max(S.bestWave, L.wave0 + L.waves);
  else S.bestWave = Math.max(S.bestWave, L.wave0 + Math.max(0, b.waveI - 1));
  let unlocked = false, recruit = null;
  if (b.won && n === save.frontier && n < LEVELS.length) { save.frontier = n + 1; unlocked = true; }
  if (b.won && n === LEVELS.length && save.frontier === n) save.frontier = n + 1;
  if (b.won && RECRUITS[n] && !(save.cards['h:' + RECRUITS[n]]?.n > 0)) {
    recruit = HERO_BY_ID[RECRUITS[n]];
    grant(save, CARDS['h:' + recruit.id]);
    if (save.squad.length < SQUAD_MAX) save.squad.push(recruit.id);
  }
  return { gold, shards, essence, trophies, newStars, first, recruit, unlocked, sealed: !!b.sealed };
}
