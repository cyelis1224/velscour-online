// "DEATH IS THE ONLY WAY OUT, MY KIND SIR." sent to Velscour: level 350, the best gear of the hero's class (Mythic,
// +10, perfect rolls and an extra enchanted line, Eternal gems, max-power ring augments), every skill and mastery
// maxed, a full potion belt, a fortune in gold, and the way down opened to Depth 500. It is a cheat: the hero is marked
// for good (c.cheated) and never listed on the Honour Board (game/leaderboard.js).
import { G } from '../state.js';
import { sfx, levelUpFanfare } from '../core/audio.js';
import { CLASSES } from '../data/classes.js';
import { CLASS_SKILLS, MAX_SKILL_LEVEL } from '../data/skills.js';
import { RARITY, CORE_LINES, AFFIX_BY_STAT, RING_SLOTS, MAX_GEM_TIER, rollItem, affixValue, augTarget, powerLevel } from '../data/items.js';
import { AUGMENTS, SCOPE_MUL, augPower } from '../data/rings.js';
import { FINAL_DEPTH } from '../data/depth.js';
import { MAX_MASTERY } from './augments.js';
import { addToBag } from './player.js';
import { Board } from './leaderboard.js';

export const DEATH_PHRASE = 'DEATH IS THE ONLY WAY OUT, MY KIND SIR.';
const GIFT_LEVEL = 350, MYTHIC = 5;
const SLOT_LETTER = { weapon: 'W', offhand: 'O', head: 'H', body: 'B', hands: 'G', legs: 'L', feet: 'F', ring: 'R' };
const LEGEND = { weapon: 'crit', offhand: 'echo', head: 'nova', body: 'phoenix', hands: 'vamp', legs: 'giant', feet: 'wraith' };
const RING_LEGEND = ['thunder', 'hammer', 'orbit', 'bloodbath'];
const RING_AUGS = [['echo', 'haste'], ['storm', 'meteor'], ['detonate', 'smite'], ['colossus', 'blood']];
const PRIMARY_GEM = { str: 'amethyst', dex: 'emerald', int: 'opal', vit: 'ruby' };
const PERK_WISH = ['moveSpeed', 'bossDmg', 'manaSteal', 'xpPct', 'magicFind', 'goldFind', 'projSpeed', 'thorns'];

/** The core stat lines worth having for this class, best first. */
function coreWish(C) {
  const el = C.element === 'phys' ? 'physPct' : C.element + 'Pct';
  return ['skillsAll', 'dmgPct', el, 'critChance', 'critDmg', C.primary === 'int' ? 'castSpeed' : 'atkSpeed', C.primary, 'allAttr', 'lifePct',
    'resAll', 'reduce', 'cdr', 'lifeSteal', 'flatDmg', 'physPct', 'block', 'areaPct', 'life', 'armorPct', 'vit', 'manaRegen', 'lifeRegen'];
}

/** The best item of a slot: Mythic, +10, a full enchant of the affixes worth having, every socket filled. */
export function bestItem(C, slot, base, ilvl, legend, gems) {
  const it = rollItem(ilvl, { slot, rarity: MYTHIC, base });
  const letter = SLOT_LETTER[slot], pl = powerLevel(ilvl, MYTHIC);
  it.affixes = it.affixes.filter((a) => a.implicit);
  const take = (wish, n, perk) => {
    for (const s of wish) {
      const a = AFFIX_BY_STAT[s];
      if (!n) break;
      if (!a.slots.includes(letter) || !a.perk !== !perk || (a.minPl || 0) > pl || it.affixes.some((x) => x.s === s)) continue;
      it.affixes.push({ s, v: affixValue(a, ilvl, MYTHIC, 1), ...(perk ? { perk: true } : {}) });
      n--;
    }
  };
  take(coreWish(C), CORE_LINES + 1, false); // the core lines plus the enchanter's extra one
  take(PERK_WISH, RARITY[MYTHIC].perks, true);
  it.upg = 10;
  it.sockets = it.maxSockets;
  it.gems = gems.slice(0, it.sockets).map((gem) => ({ gem, tier: MAX_GEM_TIER }));
  it.legendary = legend;
  delete it.unid; delete it.sealed;
  return it;
}

function bestRing(C, i, ilvl) {
  const it = bestItem(C, 'ring', null, ilvl, RING_LEGEND[i], ['diamond', 'bloodstone']);
  const pow = Math.round(augPower(powerLevel(ilvl, MYTHIC)) * 0.55 * SCOPE_MUL.all * 1.1 * 100) / 100;
  it.aug = RING_AUGS[i].map((id) => ({ id, all: true, pow }));
  it.rname = `${AUGMENTS[it.aug[0].id].word} ${it.baseName} of ${augTarget(it.aug[0])}`;
  return it;
}

/** Grant the whole gift to the hero playing now. */
export function grantDeathGift() {
  const c = G.char, p = G.player;
  if (!c || !p) return;
  const C = CLASSES[c.classId];
  c.cheated = true; // for good: never listed on the Honour Board, and its class's entry there comes off now (or at the next sign-in)
  Board.withdraw(c.classId).catch((e) => console.warn('Honour board:', e));
  const ilvl = Math.max(c.level, GIFT_LEVEL); // items of the hero's own level are the best they can wear
  // level 350, its attribute points spent on the class's attribute and vitality
  const gained = Math.max(0, GIFT_LEVEL - c.level);
  c.level = Math.max(c.level, GIFT_LEVEL); c.xp = 0;
  const pts = c.statPoints + gained * 5;
  const main = C.primary === 'vit' ? pts : Math.round(pts * 0.6);
  c.attrs[C.primary] += main; c.attrs.vit += pts - main; c.statPoints = 0;
  p.applyGrants();
  // every skill of the class maxed and mastered
  for (const sk of CLASS_SKILLS[c.classId]) { c.skills[sk.id] = MAX_SKILL_LEVEL; c.mastery[sk.id] = [MAX_MASTERY, 0]; }
  c.skillPoints = 0;
  // the gear; what the hero wore goes to the bag (or the chest when the bag is full)
  const pg = PRIMARY_GEM[C.primary];
  const armorGems = ['ruby', 'diamond', pg, 'bloodstone'];
  const offBase = C.offhand || (C.primary === 'int' ? 'orb' : 'shield');
  const gear = {
    weapon: bestItem(C, 'weapon', C.weapon, ilvl, LEGEND.weapon, ['classgem', 'chainlink', 'bloodstone', pg]),
    offhand: c.classId === 'barbarian' && !C.offhand
      ? bestItem(C, 'weapon', 'axe', ilvl, LEGEND.offhand, ['classgem', 'bloodstone', 'jade', pg]) // a second axe
      : bestItem(C, 'offhand', offBase, ilvl, LEGEND.offhand, armorGems),
  };
  for (const s of ['head', 'body', 'hands', 'legs', 'feet']) gear[s] = bestItem(C, s, null, ilvl, LEGEND[s], armorGems);
  RING_SLOTS.forEach((s, i) => { gear[s] = bestRing(C, i, ilvl); });
  for (const [s, it] of Object.entries(gear)) {
    const old = c.equip[s];
    if (old && !addToBag(c, old)) { const k = c.stash.findIndex((x) => !x); if (k >= 0) c.stash[k] = old; }
    c.equip[s] = it;
  }
  // the rest of the best: a full belt, a fortune, and the way to Velscour
  c.potions = { ...c.potions, hp: 30, mp: 30, rejuv: 30, fury: 30 };
  c.gold = Math.max(c.gold, 999999999);
  c.depth = FINAL_DEPTH;
  c.deepest = Math.max(c.deepest || 0, FINAL_DEPTH - 1);
  p.recompute();
  p.hp = p.maxHp; p.mana = p.maxMana;
  p.levelUpFx();
  sfx('levelup', 1);
  if (G.ui) {
    if (G.ui.hud) G.ui.hud.levelUp(c.level, levelUpFanfare());
    G.ui.log('<b style="color:#ff3020">Velscour answers.</b> Level 350, his finest arms, and the road to Depth 500. Come die properly.', '#ffd860');
    G.ui.log('This hero took Velscour\'s gift: it will never be listed on the Honour Board.', '#ff9070');
    G.ui.refresh();
  }
}
