// Every card the rift can give: the 64 heroes and the gear they wear. Gear is Velscour's own art: each class's held
// weapon and off-hand sets (50 designs each), its 26 Grim Nocturne armors and 15 enclosed helmets, plus relics.
// Card ids: h:<hero> w:<cls>:<design> o:<cls>:<design> a:<cls>:<armor 1-26> m:<cls>:<helm 1-15> r:<relic>
import { ART } from '../core/assets.js';
import { RNG, hashStr } from '../core/util.js';
import { REGIONS } from './campaign.js';
import { HEROES } from './heroes.js';
import { KITS, CLASS_IDS } from './kits.js';
import { RELICS2 } from './relics2.js';

export const TYPES = { hero: 'Hero', weapon: 'Weapon', offhand: 'Off-hand', armor: 'Armor', helm: 'Helm', relic: 'Relic', trophy: 'Trophy' };
export const SLOTS = ['weapon', 'offhand', 'armor', 'helm', 'relic'];

// Relics: anyone can wear one. [id, name, rarity, gem art (assets/sprites/replacements atlas), mods, text]
const RELICS = [
  ['ember_ring', 'Ember Ring', 0, 'gem_ruby', { atkP: 0.06 }, '+6% attack.'],
  ['sapphire_band', 'Sapphire Band', 0, 'gem_sapphire', { skillCharge: 0.06 }, 'Skills charge 6% faster.'],
  ['topaz_charm', 'Topaz Charm', 0, 'gem_topaz', { rateP: 0.05 }, '+5% attack speed.'],
  ['jade_token', 'Jade Token', 0, 'gem_jade', { range: 0.15 }, '+0.15 range.'],
  ['onyx_bead', 'Onyx Bead', 0, 'gem_onyx', { vsBoss: 0.1 }, '+10% damage to bosses.'],
  ['emerald_eye', 'Emerald Eye', 1, 'gem_emerald', { atkP: 0.1, range: 0.1 }, '+10% attack, +0.1 range.'],
  ['amethyst_drop', 'Amethyst Drop', 1, 'gem_amethyst', { skillPower: 0.12 }, 'Skills hit 12% harder.'],
  ['moonstone_ring', 'Moonstone Ring', 1, 'gem_moonstone', { rateP: 0.08, skillCharge: 0.05 }, '+8% attack speed, skills charge 5% faster.'],
  ['bloodstone', 'Bloodstone', 1, 'gem_bloodstone', { crit: 0.06 }, '6% chance to strike for double.'],
  ['sunstone', 'Sunstone', 1, 'gem_sunstone', { vsAir: 0.25 }, '+25% damage to flyers.'],
  ['opal_heart', 'Opal Heart', 2, 'gem_opal', { atkP: 0.14, skillCharge: 0.08 }, '+14% attack, skills charge 8% faster.'],
  ['diamond_seal', 'Diamond Seal', 2, 'gem_diamond', { atkP: 0.18 }, '+18% attack.'],
  ['chainlink', 'Chainlink Gem', 2, 'gem_chainlink', { chain: 1, atkP: 0.06 }, 'Chain attacks leap once more; +6% attack.'],
  ['seeker', 'Seeker\'s Lens', 2, 'gem_seeker', { range: 0.35 }, '+0.35 range.'],
  ['splitter', 'Splitter Prism', 2, 'gem_splitter', { splash: 0.25 }, '+0.25 splash radius.'],
  ['orbit_stone', 'Orbit Stone', 3, 'gem_orbit', { skillCharge: 0.18, skillPower: 0.1 }, 'Skills charge 18% faster and hit 10% harder.'],
  ['titan_core', 'Titan Core', 3, 'gem_titan', { atkP: 0.24, vsBoss: 0.15 }, '+24% attack, +15% vs bosses.'],
  ['twinsoul', 'Twinsoul Gem', 3, 'gem_twinsoul', { crit: 0.12, atkP: 0.08 }, '12% double strikes, +8% attack.'],
  ['prism_of_war', 'Prism of War', 3, 'gem_prism', { rateP: 0.16, range: 0.15 }, '+16% attack speed, +0.15 range.'],
  ['novacore', 'Novacore', 4, 'gem_novacore', { atkP: 0.3, splash: 0.2 }, '+30% attack, +0.2 splash.'],
  ['crown_of_valor', 'Crown of Valor', 4, 'ring_2', { killValor: 1, atkP: 0.15 }, 'Each kill grants 1 Valor; +15% attack.'],
  ['stormheart', 'Stormheart', 4, 'gem_chainlink', { chain: 2, rateP: 0.15 }, 'Chains leap twice more; +15% attack speed.'],
  ['eye_of_velscour', 'Eye of Velscour', 5, 'gem_classgem', { atkP: 0.45, crit: 0.1 }, '+45% attack, 10% double strikes. It watches.'],
  ['riftheart', 'Riftheart', 5, 'gem_novacore', { skillCharge: 0.35, skillPower: 0.35 }, 'Skills charge 35% faster and hit 35% harder.'],
];

const RAR_ATK = [0.1, 0.17, 0.26, 0.38, 0.54, 0.75];
const AFFIX = [ // [mod, per-rarity scale, words]
  ['rateP', 0.035, 'attack speed', 'Swift'], ['crit', 0.025, 'double-strike chance', 'Keen'], ['range', 0.07, 'range', 'Far-reaching'],
  ['skillCharge', 0.04, 'skill charge', 'Resonant'], ['vsBoss', 0.06, 'vs bosses', 'Slayer\'s'], ['vsAir', 0.09, 'vs flyers', 'Skyward'],
  ['skillPower', 0.05, 'skill power', 'Mighty'], ['splash', 0.05, 'splash', 'Bursting'],
];
const ARMOR_WORDS = {
  paladin: ['Dawnward', 'Plate'], ranger: ['Thornweave', 'Leathers'], wizard: ['Emberwoven', 'Robes'], necromancer: ['Gravesilk', 'Shroud'],
  barbarian: ['Wolfhide', 'Harness'], dragoon: ['Skyscale', 'Mail'], totem_master: ['Spiritbound', 'Vestments'], death_knight: ['Rimeforged', 'Warplate'],
  arcane_sorcerer: ['Starlit', 'Mantle'], carrion_witch: ['Featherhex', 'Cloak'], bard: ['Velvet', 'Doublet'], slime_lord: ['Gelatinous', 'Regalia'],
  boomerang_knight: ['Crescent', 'Cuirass'], lancer: ['Stonevow', 'Bulwark'], dragon_knight: ['Wyrmscale', 'Armor'], gunner: ['Brassbound', 'Greatcoat'],
};
const ADJ = ['Worn', 'Tarnished', 'Sturdy', 'Fine', 'Hallowed', 'Ancient', 'Gilded', 'Runed', 'Abyssal', 'Exalted', 'Riftborn', 'Nocturne', 'Sovereign'];
const HELM_WORDS = ['Visor', 'Greathelm', 'Barbute', 'Crown-helm', 'Sallet', 'Bascinet', 'Armet', 'Warhood'];

/** The catalog: id -> card. Built once ART (the art index) has loaded. */
export const CARDS = {};
export const POOLS = { hero: [], weapon: [], offhand: [], armor: [], helm: [], relic: [], trophy: [] };
let built = false;
export function buildCatalog() {
  if (built) return CARDS;
  built = true;
  for (const h of HEROES) add({ id: 'h:' + h.id, type: 'hero', cls: h.cls, rarity: h.rarity, name: h.name, title: h.title, hero: h, text: h.trait.text, mods: h.trait.mods, flavor: h.flavor });
  const fin = (r, rng) => { const opts = ART.palettes.map((p, i) => [p, i]).filter(([p, i]) => i > 0 && p.tier === r).map(([, i]) => i); return rng.chance(0.25) ? 0 : rng.pick(opts); };
  for (const cls of CLASS_IDS) {
    const c = ART.classes[cls], words = ARMOR_WORDS[cls];
    for (const slot of ['weapon', 'offhand']) {
      const set = c[slot], H = set && ART.held[set];
      if (!H) continue;
      H.designs.forEach(([name, r, el], i) => {
        const rng = new RNG(`${slot}:${cls}:${i}`), [mod, sc, label] = rng.pick(AFFIX), mods = {};
        if (slot === 'weapon') mods.atkP = +(RAR_ATK[r] * (1 + 0.06 * (i % 4))).toFixed(3);
        else { mods.skillCharge = +(0.05 + 0.04 * r).toFixed(3); mods.skillPower = +(0.06 + 0.06 * r).toFixed(3); }
        mods[mod] = +((mods[mod] || 0) + sc * (r + 1)).toFixed(3);
        add({ id: `${slot[0]}:${cls}:${i}`, type: slot, cls, rarity: r, name, design: i, set, el, finish: fin(r, rng), mods,
          text: describe(mods), flavor: flavorFor(slot, cls, r, rng) });
      });
    }
    const bands = ART.gear[cls].bands;
    for (const [bi, band] of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].entries()) for (const a of bands[band] || []) {
      const rng = new RNG(`armor:${cls}:${a}`), [mod, sc] = rng.pick(AFFIX);
      const mods = { atkP: +(0.04 + 0.05 * bi).toFixed(3), rateP: +(0.02 + 0.025 * bi).toFixed(3) };
      mods[mod] = +((mods[mod] || 0) + sc * (bi + 1) * 0.7).toFixed(3);
      add({ id: `a:${cls}:${a}`, type: 'armor', cls, rarity: bi, name: `${ADJ[Math.min(ADJ.length - 1, bi * 2 + (a % 2))]} ${words[0]} ${words[1]}`, armor: a,
        finish: fin(bi, rng), mods, text: describe(mods), flavor: flavorFor('armor', cls, bi, rng) });
    }
    for (const [id, r] of ART.helms) {
      const rng = new RNG(`helm:${cls}:${id}`), [mod, sc] = rng.pick(AFFIX);
      const mods = { range: +(0.05 + 0.04 * r).toFixed(3), skillCharge: +(0.03 + 0.03 * r).toFixed(3) };
      mods[mod] = +((mods[mod] || 0) + sc * (r + 1) * 0.6).toFixed(3);
      add({ id: `m:${cls}:${id}`, type: 'helm', cls, rarity: r, name: `${ADJ[Math.min(ADJ.length - 1, r * 2 + (id % 2))]} ${words[0]} ${HELM_WORDS[id % HELM_WORDS.length]}`, helm: id,
        finish: fin(r, rng), mods, text: describe(mods), flavor: flavorFor('helm', cls, r, rng) });
    }
  }
  for (const [id, name, r, gem, mods, text] of [...RELICS, ...RELICS2]) add({ id: 'r:' + id, type: 'relic', cls: null, rarity: r, name, gem, mods, text, flavor: 'Found in the rift\'s wake, still warm.' });
  // a trophy for every painted monster: dropped by it in battle (with a Seal) or found in Bestiary packs
  const bosses = new Set(REGIONS.map((R) => R.boss)), finals = new Set(['The Wound Without End', 'Obsidian Volcano Beast', 'The Throne That Screams', 'Cathedral Devourer']);
  for (const m of ART.monsters) {
    const r = finals.has(m.name) ? 5 : bosses.has(m.name) ? 4 : m.lone ? 3 : m.boss ? 2 : hashStr(m.id) % 3 === 0 ? 1 : 0, pct = TROPHY_PCT[r];
    add({ id: 'x:' + m.id, type: 'trophy', cls: null, rarity: r, name: m.name, monster: m.id, arch: m.arch, trophy: pct, mods: {},
      text: `+${+(pct * 100).toFixed(1)}% damage to every ${m.arch} foe. A family's trophies add up, to +${TROPHY_CAP * 100}%.`,
      flavor: TROPHY_FLAVOR[hashStr(m.id + 'f') % TROPHY_FLAVOR.length] });
  }
  return CARDS;
}
function add(c) { CARDS[c.id] = c; POOLS[c.type].push(c); }

const MOD_TEXT = { atkP: ['+', '% attack', 100], rateP: ['+', '% attack speed', 100], crit: ['', '% double strikes', 100], range: ['+', ' range', 1],
  skillCharge: ['', '% faster skill charge', 100], skillPower: ['+', '% skill power', 100], vsBoss: ['+', '% vs bosses', 100], vsAir: ['+', '% vs flyers', 100],
  splash: ['+', ' splash', 1], chain: ['+', ' chain', 1], killValor: ['+', ' Valor per kill', 1] };
export function describe(mods) {
  return Object.entries(mods).filter(([k]) => MOD_TEXT[k]).map(([k, v]) => {
    const [pre, post, mul] = MOD_TEXT[k], n = v * mul;
    return pre + (mul === 100 ? Math.round(n) : +n.toFixed(2)) + post;
  }).join(', ') + '.';
}
const FLAVOR = {
  weapon: ['Forged in the Hollow, tempered in the rift.', 'It has a name. It has opinions.', 'The rift remembers every hand that held it.',
    'Velscour\'s horde knows its shape and flees it.', 'Heavier than it looks. Lighter than a broken oath.', 'Still humming from its last battle.'],
  offhand: ['Held close, like a promise.', 'Every hero needs a second answer.', 'It has turned aside a hundred blows and a few bad ideas.', 'The off hand is never the lesser hand.'],
  armor: ['Every dent is a story Jasper will tell wrong.', 'Grim Nocturne steel, cut for the dark.', 'It fits like it was waiting.', 'Stitched with old oaths.'],
  helm: ['What you cannot see cannot frighten you. Mostly.', 'Halvard approves of helmets. Halvard approves of very little.', 'A face of iron for a long night.'],
};
function flavorFor(kind, cls, r, rng) { return rng.pick(FLAVOR[kind]); }
const TROPHY_FLAVOR = ['Mortimer thanked it, after.', 'Wren carved a notch for it.', 'Jasper is still writing its verse.', 'Maudlin\'s crows picked it clean.',
  'It came out of the rift. It did not go back.', 'Gloop has eaten worse. Gloop says so.', 'Halvard looked at it once. That was enough.', 'Brakka wanted a bigger one.'];

/** Card-level numbers: a hero's base stats at card level L and stars s (gear and research come in power.js). */
export function heroBase(card, L = 1, s = 1) {
  const kit = KITS[card.cls], k = (1 + 0.1 * (L - 1)) * (1 + 0.15 * (s - 1)) * [0.8, 0.9, 1, 1.25, 1.55, 1.95][card.rarity];
  return { atk: kit.atk * k, rate: kit.rate, range: kit.range, cost: kit.cost + Math.max(0, card.rarity - 2) * 2 };
}
/** A hero's level cap: by rarity (Rare 30 .. Mythic 60) plus 10 a star; ascended to 5★ a Rare tops out at 70 and a Mythic at
 * 100, awakened to 10★ at 120 and 150. */
export const levelCapOf = (rarity, stars = 1) => [30, 30, 30, 40, 50, 60][rarity] + 10 * (stars - 1);
export const levelCost = (L) => Math.round(6 * Math.pow(L, 1.75) + 12);
/**
 * Essence to raise a hero from `stars` to stars + 1: ascension to 5★, then Awakening to 10★ (the long sink for the months
 * after the first squad is ascended: every awakened star is +15% attack and +10 levels, and costs far more). Infinity at 10.
 */
export const MAX_STARS = 10;
export const ascendCost = (rarity, stars) => (stars >= MAX_STARS ? Infinity : Math.round([60, 160, 380, 900, 1500, 2400, 3600, 5200, 7300][stars - 1] * [1, 1, 1, 1.7, 2.8, 4.5][rarity]));
/** Essence a duplicate hero card turns into, by rarity; what salvaging a spare gear copy gives; refining gear. */
export const DUPE_ESSENCE = [0, 0, 30, 90, 240, 600];
export const SALVAGE = [1, 2, 5, 12, 30, 75];
export const refineCost = (rarity, refine) => [6, 12, 24, 50, 100, 200][rarity] * (refine + 1);
// trophy cards: one per painted monster; each adds damage against its family (arch), the family capped at +25%
export const TROPHY_PCT = [0.005, 0.008, 0.012, 0.02, 0.035, 0.05];
export const TROPHY_CAP = 0.25;
