// The Endgame's shared record (docs/ENDGAME.md): what every hero on this browser shares once any of them has slain
// Velscour for real: the unlock, the Infernal Marks (game/marks.js), the best Abyssal Rift per class, counters. It lives in
// its own localStorage key beside the heroes' saves and the Reliquary; a signed-in player's copy goes to Firestore
// (users/{uid}/account/endgame, game/cloud.js) and the two are merged by mergeEndgame, which never loses anything.
import { G } from '../state.js';
import { FINAL_DEPTH } from '../data/depth.js';

const KEY = 'velscour_endgame_v1';
export const MARK_CATS = ['life', 'crit', 'mf', 'rift'];
let E = null;
const listeners = [];

function blank() { return { v: 1, unlocked: 0, marks: { pts: 0, xp: 0, spent: { life: 0, crit: 0, mf: 0, rift: 0 } }, bests: {}, keysFound: 0, unboundWins: 0 }; }
/** A record with every field present and sane (a damaged one keeps what it can). */
export function fixEndgame(r) {
  const o = blank();
  if (!r || typeof r !== 'object') return o;
  o.unlocked = Number(r.unlocked) > 0 ? Number(r.unlocked) : 0;
  const m = r.marks && typeof r.marks === 'object' ? r.marks : {};
  o.marks.pts = Math.max(0, Math.floor(Number(m.pts) || 0));
  o.marks.xp = Math.max(0, Number(m.xp) || 0);
  for (const k of MARK_CATS) o.marks.spent[k] = Math.max(0, Math.floor(Number(m.spent && m.spent[k]) || 0));
  let sum = MARK_CATS.reduce((s, k) => s + o.marks.spent[k], 0);
  for (const k of MARK_CATS) if (sum > o.marks.pts) { const cut = Math.min(o.marks.spent[k], sum - o.marks.pts); o.marks.spent[k] -= cut; sum -= cut; }
  if (r.bests && typeof r.bests === 'object') for (const [cls, b] of Object.entries(r.bests)) if (b && Number(b.tier) > 0) o.bests[cls] = { tier: Math.floor(Number(b.tier)), time: Math.max(0, Number(b.time) || 0), at: Number(b.at) || 0 };
  o.keysFound = Math.max(0, Math.floor(Number(r.keysFound) || 0));
  o.unboundWins = Math.max(0, Math.floor(Number(r.unboundWins) || 0));
  return o;
}
/** The shared record (loaded once). */
export function endgame() {
  if (E) return E;
  let r = null;
  try { r = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { r = null; }
  E = fixEndgame(r);
  return E;
}
/** Write the record; quiet: XP towards a Mark only, nothing the cloud needs at once. */
export function saveEndgame(quiet) {
  try { localStorage.setItem(KEY, JSON.stringify(endgame())); } catch (e) { /* storage full or blocked: it lives on for this visit */ }
  if (!quiet) for (const fn of listeners) try { fn(); } catch (e) { console.warn(e); }
}
/** fn() after every save (the cloud copy, game/cloud.js). */
export function onEndgameChange(fn) { listeners.push(fn); }
/** Tests: forget the cached copy (the next call reads localStorage again). */
export function resetEndgameCache() { E = null; }

/** Has the Endgame opened: any hero on this browser slew Velscour, or this hero cleared depth 500. */
export function endgameUnlocked(c = G.char) { return !!(endgame().unlocked || (c && c.cleared && c.cleared[FINAL_DEPTH])); }
/** Velscour slain for real: the altar and the rift gate open for every hero. */
export function unlockEndgame() {
  const r = endgame();
  if (r.unlocked) return false;
  r.unlocked = Date.now();
  saveEndgame();
  return true;
}
/** A better rift than the account's best for this class? Higher tier, or the same tier faster. */
export const betterRift = (a, b) => !!b && (!a || b.tier > a.tier || (b.tier === a.tier && b.time < a.time));
export function noteRiftBest(cls, tier, time) {
  const r = endgame(), b = { tier, time: Math.round(time * 10) / 10, at: Date.now() };
  if (!betterRift(r.bests[cls], b)) return false;
  r.bests[cls] = b;
  saveEndgame();
  return true;
}

/**
 * Two copies of the record (this device's and the cloud's) as one, never losing what either side earned. base: the
 * record this device last synced (game/cloud.js), or null on a first sign-in. Marks, keys found and Unbound wins are
 * counters: with a base, what each side earned since it is added (two devices earning 10 and 5 apart end at 15); with
 * none, the larger. Never below either side or the base (a damaged copy lowers nothing). Spending: each side's change
 * since the base, per category (only one side changed: that side's); more than the Marks allow: this device's. A side
 * with fewer Marks than the base is damaged and its spending is ignored. No base: the larger side's spending. XP to
 * the next Mark: the larger. The unlock keeps the earliest time; every class keeps its better rift.
 */
export function mergeEndgame(a, b, base) {
  a = fixEndgame(a); b = fixEndgame(b);
  const B = base ? fixEndgame(base) : null, o = blank();
  const add = (x, y, z) => (B ? Math.max(x, y, z + Math.max(0, x - z) + Math.max(0, y - z)) : Math.max(x, y));
  o.unlocked = a.unlocked && b.unlocked ? Math.min(a.unlocked, b.unlocked) : a.unlocked || b.unlocked;
  o.marks.pts = add(a.marks.pts, b.marks.pts, B && B.marks.pts);
  o.marks.xp = Math.max(a.marks.xp, b.marks.xp);
  if (B) {
    const sa = a.marks.pts < B.marks.pts ? B.marks.spent : a.marks.spent, sb = b.marks.pts < B.marks.pts ? B.marks.spent : b.marks.spent;
    const s = {};
    for (const k of MARK_CATS) s[k] = Math.max(0, sa[k] + sb[k] - B.marks.spent[k]);
    o.marks.spent = MARK_CATS.reduce((t, k) => t + s[k], 0) <= o.marks.pts ? s : { ...sa };
  } else o.marks.spent = { ...(b.marks.pts > a.marks.pts ? b : a).marks.spent };
  for (const cls of new Set([...Object.keys(a.bests), ...Object.keys(b.bests)])) o.bests[cls] = betterRift(a.bests[cls], b.bests[cls]) ? { ...b.bests[cls] } : { ...a.bests[cls] };
  o.keysFound = add(a.keysFound, b.keysFound, B && B.keysFound);
  o.unboundWins = add(a.unboundWins, b.unboundWins, B && B.unboundWins);
  return fixEndgame(o);
}
/** The same record on both sides? (so the cloud copy is only written when something changed) */
export const sameEndgame = (a, b) => JSON.stringify(fixEndgame(a)) === JSON.stringify(fixEndgame(b));
/** Replace the local record with its merge with the cloud's (base: the last synced). Returns true when it changed. */
export function adoptEndgame(rec, base) {
  const merged = mergeEndgame(endgame(), rec, base);
  if (sameEndgame(merged, endgame())) return false;
  E = merged;
  saveEndgame();
  if (G.player) G.player.recompute();
  return true;
}
