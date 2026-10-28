// Heresies (docs/ENDGAME.md): the difficulty modifiers chosen at the Altar of Heresy once Velscour has fallen. Each has
// a rank; the ranks on add up, and the rank raises the rewards of every level built with them (heresyMods). What each
// one does is wired in game/heresies.js.
export const HERESIES = [
  { id: 'twins', name: 'Twinned Packs', rank: 3, color: '#ff8040', desc: 'Every pack of monsters spawns twice its number.' },
  { id: 'crowned', name: 'Crowned Champions', rank: 2, color: '#4a8aff', desc: 'Champions carry two extra affixes, uniques one more.' },
  { id: 'thirst', name: 'Dry Throat', rank: 3, color: '#c04040', desc: 'No potions of any kind.' },
  { id: 'fifth', name: 'The Fifth Phase', rank: 2, color: '#ff6030', desc: 'BOSS ROOM bosses fight one phase longer and roll one more modifier.' },
  { id: 'legion', name: 'The Legion Follows', rank: 3, color: '#ff4010', desc: "Velscour's Legion of the Pit tears open a hellgate near you every so often, wherever you are." },
  { id: 'iron', name: 'Iron Hide', rank: 2, color: '#a0a0b0', desc: 'Monsters have 50% more life.' },
  { id: 'cruel', name: 'Cruel Hand', rank: 3, color: '#ff3050', desc: 'Monsters hit 30% harder.' },
  { id: 'ambush', name: 'Ambush Weather', rank: 1, color: '#c0a060', desc: 'Ambushes come three times as often.' },
  { id: 'omens', name: 'Black Omens', rank: 1, color: '#a060ff', desc: 'Every depth that can carry an omen does, and a Nemesis always returns.' },
  { id: 'glass', name: 'Glass Cannon', rank: 2, color: '#ffd060', desc: 'You have 25% less life and deal 15% more damage.' },
  { id: 'hunger', name: 'Hunger of the Abyss', rank: 2, color: '#60c0a0', desc: 'No life or mana orbs drop, and your life does not regenerate.' },
  { id: 'gaze', name: "Velscour's Gaze", rank: 2, color: '#ff2000', desc: 'Monsters notice you from far away and never lose you.' },
];
export const HERESY_BY_ID = Object.fromEntries(HERESIES.map((h) => [h.id, h]));
export const HERESY_MAX_RANK = HERESIES.reduce((s, h) => s + h.rank, 0); // 26
/** The rank of a set of Heresy ids. */
export const heresyRank = (ids) => (ids || []).reduce((s, id) => s + ((HERESY_BY_ID[id] && HERESY_BY_ID[id].rank) || 0), 0);
/** What a rank pays: magic find (+%), and multipliers on gold, drops, XP, Sigil odds and relic odds. */
export function heresyMods(rank) {
  rank = Math.max(0, rank | 0);
  return { mf: 4 * rank, gold: 1 + 0.04 * rank, loot: 1 + 0.02 * rank, xp: 1 + 0.02 * rank, sigil: 1 + 0.05 * rank, relic: 1 + 0.04 * rank };
}
/** The milestones a rank reaches. */
export const HERESY_MILESTONES = [
  { rank: 10, text: 'Abyssal Keys may drop from BOSS ROOM bosses past Depth 600 (three open Velscour Unbound)' },
  { rank: 20, text: '+1 Infernal Mark for every depth cleared' },
];
export const KEYS_RANK = 10, MARKS_RANK = 20;
