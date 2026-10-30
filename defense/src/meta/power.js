// From cards to battle: a hero card's level, stars, equipped gear and the Bastion's research make the unit the battle
// sim deploys. Permanent upgrades all live here; in-battle ones are the sim's (Empower, Bastion works).
import { CARDS, heroBase, levelCapOf, TROPHY_CAP } from '../data/cards.js';
import { KITS } from '../data/kits.js';
import { heroBaseLook, HERO_BY_ID, HEROES } from '../data/heroes.js';
import { RNG } from '../core/util.js';
import { researchBonus } from './research.js';

const sumMods = (into, mods, k = 1) => { for (const [m, v] of Object.entries(mods || {})) into[m] = (into[m] || 0) + v * k; return into; };
export const refineK = (e) => 1 + 0.1 * (e?.refine || 0);
export const foilK = (e) => (e?.foil ? 1.05 : 1);

/** A hero's battle unit: { id, cls, name, kit, atk, rate, range, cost, mods, skill, look, power }. */
export function unitDef(heroId, save, opts = {}) {
  const card = CARDS['h:' + heroId], e = opts.entry || save.cards['h:' + heroId] || { lvl: 1, stars: 1, equip: {} };
  const kit = KITS[card.cls], base = heroBase(card, e.lvl, e.stars), mods = sumMods({}, card.mods);
  const look = { ...heroBaseLook(card.hero) };
  for (const [slot, gid] of Object.entries(e.equip || {})) {
    const g = gid && CARDS[gid], ge = save.cards[gid];
    if (!g) continue;
    sumMods(mods, g.mods, refineK(ge) * foilK(ge));
    if (slot === 'weapon') { look.weapon = g.design; look.weaponFin = g.finish; look.element = g.el; }
    if (slot === 'offhand') { look.offhand = g.design; look.offFin = g.finish; }
    if (slot === 'armor') { look.armor = g.armor; look.armorFin = g.finish; }
    if (slot === 'helm') { look.helm = g.helm; look.helmFin = g.finish; }
  }
  const R = opts.research ?? researchBonus(save);
  const atk = base.atk * (1 + (mods.atkP || 0) + R.atk) * foilK(e);
  const rate = base.rate / (1 + (mods.rateP || 0));
  const range = base.range + (mods.range || 0);
  const cost = Math.max(5, base.cost + (mods.cost || 0));
  const def = { id: heroId, cls: card.cls, name: card.hero.short, full: card.name, rarity: card.rarity, kit, atk, rate, range, cost, mods, look,
    skill: { ...kit.skill }, lvl: e.lvl, stars: e.stars };
  def.power = powerOf(def);
  return def;
}
/** One number to sort heroes by: damage per second with range and skill folded in. */
export function powerOf(d) {
  const dps = d.atk / d.rate * (1 + (d.kit.splash || 0) * 0.6 + (d.kit.cleave || 0) * 0.5 + ((d.kit.chain || 0) + (d.mods.chain || 0)) * 0.25 + (d.kit.pierce ? 0.4 : 0) + (d.mods.multishot || 0) * 0.7);
  return Math.round(dps * (1 + 0.12 * d.range) * (1 + (d.mods.skillPower || 0) * 0.3 + (d.mods.skillCharge || 0) * 0.3) * (1 + (d.mods.crit || 0))
    * (1 + (d.mods.auraAtk || 0) * 2.5) * (1 + (d.mods.steadfast ? 0.06 : 0)) * 10);
}

/** The Rift Ally for stage n: a guest hero (Fantasica's Call Ally) at about the stage's strength, deployable once. */
export function stageAlly(n, save) {
  const rng = new RNG('ally:' + n), h = rng.pick(HEROES.filter((x) => x.rarity >= 3));
  const lvl = Math.min(100, Math.round(4 + n * 1.15)), stars = Math.min(5, 1 + Math.floor(n / 18));
  const d = unitDef(h.id, save, { entry: { lvl, stars, equip: {} }, research: { atk: 0 } });
  return { ...d, name: d.name + ' (Ally)' };
}

export const levelCap = (e, id) => levelCapOf(id ? CARDS['h:' + id].rarity : 2, e.stars || 1);
/** Damage bonus against each monster family from the trophy cards owned. */
export function trophyBonus(save) {
  const out = {};
  for (const [id, e] of Object.entries(save.cards)) { if (!id.startsWith('x:') || !(e.n > 0)) continue; const c = CARDS[id]; if (c) out[c.arch] = Math.min(TROPHY_CAP, (out[c.arch] || 0) + c.trophy); }
  return out;
}
export const ownedHeroes = (save) => Object.keys(save.cards).filter((id) => id.startsWith('h:') && save.cards[id].n > 0).map((id) => id.slice(2));
export const heroCard = (id) => CARDS['h:' + id];
export { HERO_BY_ID };
