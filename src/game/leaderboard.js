// The Abyssal Rifts' honour board (docs/ENDGAME.md): one Firestore document per player and class,
// boards/{classId}/entries/{uid}, written through game/cloud.js's backend when a signed-in player beats their own best
// (game/rifts.js riftWin), read for the board dialog (ui/rifts.js). Saves are local, so this is an honour board: a cheat
// can post anything, and the build is recorded beside every entry so a reader can judge it.
import { G } from '../state.js';
import { Cloud } from './cloud.js';
import { itemName } from '../data/items.js';
import { marksTotal } from './marks.js';

/** What a run records of the hero: the bar's skills and the worn gear's names, rarities and levels. */
export function buildSnapshot(c) {
  const gear = {};
  for (const [slot, it] of Object.entries(c.equip || {})) if (it) gear[slot] = { name: itemName(it), rarity: it.rarity | 0, ilvl: it.ilvl | 0, relic: it.relic || null, upg: it.upg | 0 };
  return { bar: (c.bar || []).filter(Boolean).slice(0, 15), gear, level: c.level | 0, marks: marksTotal() };
}

/** A hero that took Velscour's gift (game/deathgift.js) cheated: it never posts, and its class's entry comes off. */
export const barred = (c) => !!(c && c.cheated);

/** A board entry's time stamp as milliseconds: the real SDK hands back a Timestamp, the tests' fake a number. */
export const atMs = (at) => (at && typeof at.toMillis === 'function' ? at.toMillis() : Number(at) || 0);

export const Board = {
  /** Post this hero's run (only when signed in; the backend keeps the better of it and the entry already there).
   * Resolves the backend's { ok, kept }, or false when it could not post. */
  async submit(c, tier, time) {
    if (barred(c)) { await this.withdraw(c.classId).catch(() => false); return { barred: true }; }
    if (!Cloud.signedIn || !Cloud.backend) return false;
    const rec = { v: 1, name: String(c.name || 'Hero').slice(0, 24), cls: c.classId, tier: tier | 0, time: Math.max(0.1, Math.round(time * 10) / 10), at: Date.now(), level: c.level | 0, marks: marksTotal(), build: buildSnapshot(c) };
    return Cloud.putBoard(c.classId, rec);
  },
  /** Take this player's entry of a class off the board (signed in): true once it is gone, false when signed out. */
  async withdraw(cls) { return Cloud.signedIn ? Cloud.delBoard(cls) : false; },
  /** The top n entries of a class, best tier first, then the fastest, then the first to post. Loads the SDK;
   * throws when the board can't be reached. `at` comes back a number (the SDK stores a Timestamp). */
  async top(cls, n = 50) {
    const all = await Cloud.board(cls);
    return all.filter((e) => e && Number.isFinite(e.tier) && Number.isFinite(e.time)).map((e) => ({ ...e, at: atMs(e.at) }))
      .sort((a, b) => b.tier - a.tier || a.time - b.time || a.at - b.at).slice(0, n);
  },
};
export { G };
