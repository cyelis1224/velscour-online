// Infernal Marks (docs/ENDGAME.md): the account-wide progression past the level cap. A Mark comes from XP earned at
// MAX_LEVEL (one per xpToNext(MAX_LEVEL), Player.gainXp), from Abyssal Rift clears (riftMarks) and from Heresy rank 20
// (one per depth cleared). Each is spent on one of four categories; a category's bonus grows with diminishing returns
// (eff: 50% of the cap at 100 points, 75% at 200, 97% at 500), so even a thousand Marks leave the Endless Torment's
// wall standing (+30% life at the very most). The points live in the shared record (game/endgame.js), which the cloud
// merges three ways (game/cloud.js), so Marks earned on two devices add up.
import { G } from '../state.js';
import { endgame, saveEndgame, MARK_CATS } from './endgame.js';
import { xpToNext, MAX_LEVEL } from './player.js';
import { sfx } from '../core/audio.js';
import { floatText, addEffect, Ring } from '../gfx/vfx.js';

export const CATS = {
  life: { name: 'Vitality', per: 0.3, cap: 30, unit: '% life', color: '#ff6a5a', desc: 'More life.' },
  crit: { name: 'Precision', per: 0.1, cap: 10, unit: '% critical chance', color: '#ffd860', desc: 'Critical strikes land more often.' },
  mf: { name: 'Fortune', per: 0.5, cap: 50, unit: '% magic find', color: '#b45cff', desc: 'Rarer drops.' },
  rift: { name: 'Haste', per: 0.6, cap: 60, unit: ' s on the rift clock', color: '#20e0ff', desc: 'More time in Abyssal Rifts.' },
};
/** One Mark's worth of XP at the cap: the price of the last level (a function: player.js imports this module). */
export const markXp = () => xpToNext(MAX_LEVEL);
/** How much of a category's cap n points unlock (0..100, never 100). */
export const eff = (n) => 100 * (1 - Math.pow(0.993, Math.max(0, n)));
/** A category's bonus for n points. */
export const bonusAt = (k, n) => Math.round(CATS[k].per * eff(n) * 100) / 100;

export const marksTotal = () => endgame().marks.pts;
export const marksSpent = () => MARK_CATS.reduce((s, k) => s + endgame().marks.spent[k], 0);
export const marksFree = () => marksTotal() - marksSpent();
export const marksIn = (k) => endgame().marks.spent[k] || 0;
/** The bonuses every hero gets now: { life %, crit %, mf %, rift s }. */
export function markBonuses() {
  const s = endgame().marks.spent, o = {};
  for (const k of MARK_CATS) o[k] = bonusAt(k, s[k]);
  return o;
}
/** Marks for clearing an Abyssal Rift of this tier. */
export const riftMarks = (tier) => Math.max(1, Math.ceil(tier / 10)); // (was tier / 4: rifts dwarfed every other source)

function changed() {
  saveEndgame();
  if (G.player) G.player.recompute();
  if (G.ui && G.ui.refresh) G.ui.refresh();
}
let xpDirty = false, xpSaved = 0;
/** XP earned at the level cap: Marks when it adds up (saved at once), else saved at most every 5 s and on autosave. */
export function gainMarkXp(xp) {
  const m = endgame().marks;
  m.xp += Math.max(0, xp || 0);
  let n = 0;
  const cost = markXp();
  while (m.xp >= cost) { m.xp -= cost; m.pts++; n++; }
  if (n) { xpDirty = false; xpSaved = Date.now(); changed(); announce(n, 'from the abyss', true); } else if (xp > 0) { xpDirty = true; if (Date.now() - xpSaved > 5000) saveMarkXp(); }
  return n;
}
/** Write XP towards the next Mark if any is unsaved (game.autosave). */
export function saveMarkXp() {
  if (!xpDirty) return;
  xpDirty = false; xpSaved = Date.now();
  saveEndgame(true);
}
/** At the level cap: { xp, need } towards the next Mark (the HUD's XP bar, the character sheet), else null. */
export const capXp = (c = G.char) => (c && c.level >= MAX_LEVEL ? { xp: endgame().marks.xp, need: markXp() } : null);
/** Marks given outright (rift clears, Heresy milestones). */
export function grantMarks(n, why = '') {
  n = Math.max(0, Math.floor(n));
  if (!n) return 0;
  endgame().marks.pts += n;
  changed();
  announce(n, why);
  return n;
}
function announce(n, why, fx) {
  const p = G.player;
  if (p && G.world) {
    floatText(p.x, p.y, 96, `+${n} INFERNAL MARK${n > 1 ? 'S' : ''}`, '#ff9050', 18, { life: 2.6, vz: 22 });
    if (fx) { addEffect(new Ring(p.x, p.y, 0.3, 2.6, 0.9, '#ff6a20', 4)); sfx('levelup', 0.5); }
  }
  if (G.ui && G.ui.log) G.ui.log(`<b style="color:#ff9050">+${n} Infernal Mark${n > 1 ? 's' : ''}</b>${why ? ` ${why}` : ''} <span class="dim">(${marksFree()} to spend)</span>`, '#ffc0a0');
}
/** Spend a free Mark on a category. */
export function spendMark(k, n = 1) {
  if (!CATS[k]) return 0;
  n = Math.min(Math.max(0, Math.floor(n)), marksFree());
  if (!n) return 0;
  endgame().marks.spent[k] += n;
  changed();
  return n;
}
/** Take every point back (free, any time). */
export function resetMarks() {
  const s = endgame().marks.spent;
  for (const k of MARK_CATS) s[k] = 0;
  changed();
}
/** Spend every free Mark, each on the category that gains the most of its cap from it (auto-play, the panel's button). */
export function autoSpend() {
  const s = endgame().marks.spent;
  let n = marksFree(), spent = 0;
  while (n-- > 0) {
    let best = null, bv = -1;
    for (const k of MARK_CATS) { const v = eff(s[k] + 1) - eff(s[k]); if (v > bv) { bv = v; best = k; } }
    s[best]++; spent++;
  }
  if (spent) changed();
  return spent;
}
/** One line for the character sheet. */
export function marksText() {
  const b = markBonuses();
  return `${marksTotal()} (${marksFree()} free) · +${b.life}% life · +${b.crit}% crit · +${b.mf}% MF · +${Math.round(b.rift)} s rifts`;
}
