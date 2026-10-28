// Abyssal Rifts (docs/ENDGAME.md): short timed dungeons past Velscour. Tier T is as deadly as depth 500 + 10 T; the
// hero has riftTime() seconds (RIFT_TIME plus Haste Marks) to kill RIFT_QUOTA of the level's monsters (by weight) and
// then the Guardian that stirs. The finishing time decides how many tiers the win opens (riftJump).
import { FINAL_DEPTH, depthLevel } from './depth.js';
import { clamp } from '../core/util.js';

export const RIFT_TIME = 420;  // seconds on the clock
export const RIFT_QUOTA = 0.6;   // the share of the level's monster weight that wakes the Guardian
export const RIFT_DENSITY = 0.8; // packs per room against a standard level's (world/dungeon.js opts.density)
export const RIFT_GUARDIAN_HP = 0.6; // the Guardian's life against a BOSS ROOM boss's (it fights after the quota, on the clock)
export const RIFT_STEP = 10;   // depths per tier
export const riftDepth = (T) => FINAL_DEPTH + RIFT_STEP * Math.max(1, T | 0);
export const riftLevel = (T) => depthLevel(riftDepth(T));
/** Tiers a win opens: a fast run jumps further. k = time used / the clock. */
export const riftJump = (k) => (k <= 0.5 ? 3 : k <= 0.8 ? 2 : 1);
/** A monster's weight toward the quota. */
export const riftWeight = (m) => (!m || m.summon || m.pitSpawn || m.vk ? 0 : m.rank === 'unique' ? 8 : m.rank === 'champion' ? 4 : m.rank === 'boss' || m.isRaid ? 0 : 1);
/** The Guardian's reward on top of a BOSS ROOM's: the Abyssal chance (always on a tier's first clear), Sigil bonus, key odds. */
export function riftReward(tier, first) {
  return {
    abyssal: first ? 1 : clamp(0.1 + 0.02 * tier, 0, 0.6),
    sigils: 2, sigilBonus: 1 + Math.floor(tier / 10),
    key: tier >= 10 ? clamp(0.12 + 0.005 * tier, 0, 0.5) : 0,
  };
}
export const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
