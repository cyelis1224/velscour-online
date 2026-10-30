// The red dots: which menus have something waiting (a reward to claim, a free pack, a hero who can level, ascend or
// wear something better, a Bastion Work you can afford, a stage you haven't tried).
import { loginReady, hourlyReady, quests, achievementReady } from './rewards.js';
import { PACKS, canOpen } from './gacha.js';
import { canLevel, canAscend, wearable } from './upgrade.js';
import { RESEARCH, researchCost } from './research.js';
import { SLOTS, CARDS } from '../data/cards.js';
import { unitDef, ownedHeroes } from './power.js';
import { MODES, entriesLeft } from './modes.js';

export function heroDot(save, id) {
  if (canLevel(save, id) || canAscend(save, id)) return true;
  const e = save.cards['h:' + id];
  for (const s of SLOTS) if (!e.equip?.[s] && wearable(save, id, s).length) return true;
  return false;
}
export function badges(save) {
  const q = quests(save);
  return {
    rewards: loginReady(save) || hourlyReady(save).hours >= 1 || q.some((x) => x.done && !x.claimed) || achievementReady(save).length > 0,
    summon: PACKS.some((p) => canOpen(save, p)),
    collection: save.newCards.length > 0,
    squad: save.squad.some((id) => save.cards['h:' + id] && heroDot(save, id)),
    works: Object.keys(RESEARCH).some((k) => (save.research[k] || 0) < RESEARCH[k].max && save.gold >= researchCost(k, save.research[k] || 0)),
    campaign: !save.progress[save.frontier] && save.frontier <= 300,
    modes: save.frontier >= 6 && MODES.some((m) => m.kind !== 'endless' && entriesLeft(save, m.id) > 0),
  };
}
export { unitDef, ownedHeroes, CARDS };
