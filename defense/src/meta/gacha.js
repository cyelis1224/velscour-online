// The Summoning Altar: packs of Rift Cards bought only with Soul Shards earned by playing (no money, ever), with
// published odds, a pity counter, and a free pack every day. Duplicates ascend heroes and refine gear.
import { RNG } from '../core/util.js';
import { POOLS, CARDS, DUPE_ESSENCE } from '../data/cards.js';
import { monstersUpTo } from '../data/waves.js';
import { ownedHeroes } from './power.js';

export const PACKS = [
  { id: 'heroes', name: 'Rift Summons', sub: 'Named heroes of the Sixteen classes', price: 120, ten: 1080, count: 1, kind: 'hero', color: '#3a6cff', art: 'paladin',
    odds: [0, 0, 72, 22, 5, 1], pity: 50, text: '1 hero. Ten at once: an Epic or better guaranteed. Every 50 summons without a Legendary brings one.' },
  { id: 'armory', name: 'Armory Booster', sub: 'Weapons and off-hands', price: 80, count: 5, types: ['weapon', 'offhand'], color: '#d8853a', art: 'barbarian',
    odds: [36, 28, 20, 10, 5, 1], last: [0, 0, 60, 28, 10, 2], text: '5 cards, the last Rare or better. Most fit heroes you own.' },
  { id: 'forge', name: 'Nocturne Forge', sub: 'Armor and helmets', price: 80, count: 5, types: ['armor', 'helm'], color: '#7ad0ff', art: 'death_knight',
    odds: [36, 28, 20, 10, 5, 1], last: [0, 0, 60, 28, 10, 2], text: '5 cards, the last Rare or better. Most fit heroes you own.' },
  { id: 'reliquary', name: 'Reliquary', sub: 'Relics any hero can wear', price: 60, count: 3, types: ['relic'], color: '#c070ff', art: 'arcane_sorcerer',
    odds: [34, 28, 22, 10, 5, 1], last: [0, 0, 62, 26, 10, 2], text: '3 relics, the last Rare or better.' },
  { id: 'bastion', name: 'Bastion Booster', sub: 'A hero and a kit to go with them', price: 220, count: 8, mixed: true, color: '#e8c070', art: 'bard',
    odds: [30, 28, 24, 12, 5, 1], text: '8 cards: 1 hero, 3 weapons or off-hands, 2 armors or helms, 1 relic, 1 Rare-or-better card of any kind.' },
  { id: 'bestiary', name: 'Bestiary Booster', sub: 'Trophies of monsters you have faced', price: 70, count: 4, types: ['trophy'], color: '#9a2a2a', art: 'necromancer',
    odds: [44, 30, 15, 7, 3, 1], last: [0, 0, 60, 28, 9, 3], text: '4 trophy cards of monsters from the stages you have reached, the last Rare or better.' },
  { id: 'daily', name: 'Daily Rift Pack', sub: 'Free, once a day', price: 0, count: 3, mixed: true, daily: true, color: '#6ad870', art: 'ranger',
    odds: [40, 30, 20, 7, 2.5, 0.5], text: '3 cards of any kind. Comes back every day.' },
];
export const PACK_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p]));
const FOIL = [0.04, 0.05, 0.07, 0.12, 0.25, 0.5];
export const today = () => new Date().toISOString().slice(0, 10);

function rollRarity(rng, odds) { return rng.weighted(odds.map((w, r) => [r, w])); }
function pickCard(rng, type, rarity, save) {
  const met = type === 'trophy' ? monstersUpTo(Math.min(300, save.frontier)) : null;
  const base = met ? POOLS.trophy.filter((c) => met.has(c.monster)) : POOLS[type];
  let pool = base.filter((c) => c.rarity === rarity);
  for (let r = rarity; !pool.length && r >= 0; r--) pool = base.filter((c) => c.rarity === r);
  if (!pool.length) pool = base.length ? base : POOLS[type];
  if (type !== 'hero' && type !== 'relic') { // most gear fits heroes you have
    const mine = new Set(ownedHeroes(save).map((id) => CARDS['h:' + id].cls));
    const fit = pool.filter((c) => mine.has(c.cls));
    if (fit.length && rng.chance(0.75)) pool = fit;
  }
  return rng.pick(pool);
}

/** Can the Commander open this pack now? Returns the way they'd pay ('free'|'ticket'|'legend'|'shards') or null. */
export function canOpen(save, pack, ten = false) {
  if (pack.daily) return save.daily.freePack !== today() ? 'free' : null;
  if (pack.kind === 'hero' && !ten && save.tickets.legend > 0) return 'legend';
  if (pack.kind === 'hero' && !ten && save.tickets.hero > 0) return 'ticket';
  if ((save.freePacks?.[pack.id] || 0) > 0 && !ten) return 'credit';
  return save.shards >= (ten ? pack.ten : pack.price) ? 'shards' : null;
}

/** Open a pack (or ten hero summons): pays, rolls, grants. Returns [{ card, foil, dup, entry }]. */
export function openPack(save, pack, ten = false, rng = new RNG(Date.now() ^ (save.stats.packs * 7919))) {
  const how = canOpen(save, pack, ten);
  if (!how) return null;
  if (how === 'free') save.daily.freePack = today();
  else if (how === 'legend') save.tickets.legend--;
  else if (how === 'ticket') save.tickets.hero--;
  else if (how === 'credit') save.freePacks[pack.id]--;
  else save.shards -= ten ? pack.ten : pack.price;
  const out = [];
  if (pack.kind === 'hero') {
    const n = ten ? 10 : 1;
    for (let i = 0; i < n; i++) {
      let r = how === 'legend' ? (rng.chance(0.12) ? 5 : 4) : rollRarity(rng, pack.odds);
      if (ten && i === n - 1 && !out.some((o) => o.rarity >= 3)) r = Math.max(r, 3);
      if (save.pity.hero + 1 >= pack.pity && r < 4) r = 4;
      save.pity.hero = r >= 4 ? 0 : save.pity.hero + 1;
      out.push(pickCard(rng, 'hero', r, save));
    }
  } else if (pack.mixed) {
    const plan = pack.daily ? ['any', 'any', 'any'] : ['hero', 'held', 'held', 'held', 'worn', 'worn', 'relic', 'rare'];
    for (const slot of plan) {
      const type = slot === 'held' ? rng.pick(['weapon', 'offhand']) : slot === 'worn' ? rng.pick(['armor', 'helm']) : slot === 'any' || slot === 'rare'
        ? rng.weighted([['weapon', 3], ['offhand', 2.5], ['armor', 2], ['helm', 2], ['relic', 1], ['hero', 1]]) : slot;
      let r = slot === 'rare' ? rollRarity(rng, [0, 0, 62, 26, 10, 2]) : rollRarity(rng, type === 'hero' ? [0, 0, 80, 16, 3.5, 0.5] : pack.odds);
      out.push(pickCard(rng, type, r, save));
    }
  } else {
    for (let i = 0; i < pack.count; i++) {
      const r = rollRarity(rng, i === pack.count - 1 ? pack.last : pack.odds);
      out.push(pickCard(rng, rng.pick(pack.types), r, save));
    }
  }
  save.stats.packs++;
  return out.map((card) => grant(save, card, rng.chance(FOIL[card.rarity])));
}

/** Put a card in the collection: new, or a duplicate that ascends a hero / adds a copy of gear. */
export function grant(save, card, foil = false) {
  let e = save.cards[card.id], dup = !!e && e.n > 0;
  if (!e) e = save.cards[card.id] = card.type === 'hero' ? { n: 0, lvl: 1, stars: 1, equip: {} } : card.type === 'trophy' ? { n: 0 } : { n: 0, refine: 0 };
  if (card.type === 'hero') {
    if (dup) save.essence += DUPE_ESSENCE[card.rarity];
    else e.n = 1;
  } else if (card.type === 'trophy') { if (dup) save.essence += 1 + card.rarity; else e.n = 1; }
  else e.n++;
  if (foil) e.foil = true;
  if (!dup) { save.newCards.push(card.id); save.stats.cards++; }
  return { card, foil, dup, entry: e };
}
