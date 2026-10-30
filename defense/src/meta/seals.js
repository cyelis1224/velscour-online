// Rift Seals: the bounty a battle pays out. One refills every half hour (40 at most); a battle that spends one pays in
// full (gold, shards, essence, trophy drops), one without pays a little gold. First clears always pay. Play is never
// blocked; farming is. This, more than anything, is why the campaign takes weeks and not a day.
export const SEAL_MAX = 40, SEAL_MINUTES = 30;
const MS = SEAL_MINUTES * 60000;

/** Bring the Seal count up to date (now in ms); returns it. */
export function seals(save, now = Date.now()) {
  const S = save.seals || (save.seals = { n: SEAL_MAX, t: now });
  if (S.n >= SEAL_MAX) { S.t = now; return S.n; }
  const k = Math.floor((now - S.t) / MS);
  if (k > 0) { S.n = Math.min(SEAL_MAX, S.n + k); S.t = S.n >= SEAL_MAX ? now : S.t + k * MS; }
  return S.n;
}
export function spendSeal(save, now = Date.now()) {
  if (seals(save, now) <= 0) return false;
  if (save.seals.n >= SEAL_MAX) save.seals.t = now;   // the refill clock starts with the first Seal spent
  save.seals.n--;
  return true;
}
/** Milliseconds until the next Seal (0 when full). */
export const nextSeal = (save, now = Date.now()) => (seals(save, now) >= SEAL_MAX ? 0 : MS - (now - save.seals.t));
export function giveSeals(save, n, now = Date.now()) { seals(save, now); save.seals.n = Math.min(SEAL_MAX * 2, save.seals.n + n); }
