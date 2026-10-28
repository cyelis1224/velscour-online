// Items, affixes, gems and legendary powers.
import { rand, randi, pick, weighted, clamp, chance } from '../core/util.js';
import { rollAugments, RING_NAMES, AUGMENTS, KIND_NAMES } from './rings.js';
import { SKILLS } from './skills.js';

// lv: the rarity's power bonus in item levels. Every number on an item (base damage, armor, affix values, ring
// powers, legendary powers) comes from its power level = item level + lv. Every rarity rolls the same CORE_LINES
// stat lines; rarer items add perks on top: perk lines (magic/gold find, experience, speed, thorns...), sockets, a
// legendary power. Measured in auto-play's hero score (tools/tests/rarity.js) a rarity is worth about Uncommon 2,
// Rare 5, Epic 8, Legendary 11.5 and Mythic 15 item levels, so a level 25 Rare beats a level 10 Mythic and gear
// keeps being replaced as the hero levels; the rarer tiers last a little longer each.
// weight: drop odds (rollRarity), close to Diablo II's white / magic / rare / set / unique split; Mythic is rarer than
// anything there. bonus: how much a boss/chest bonus multiplies the weight (1 + bonus * b). minIlvl/fullIlvl: like
// D2's quality levels, a rarity can't drop below item level minIlvl and its odds ramp up to full by fullIlvl, so no
// Epic before item level 30, Legendary before 45 or Mythic before 60 (rarityAt caps the guaranteed rewards the same
// way).
export const RARITY = [
  { id: 0, name: 'Common', color: '#e8e8e8', weight: 70, lv: 0, perks: 0, sockets: 1, bonus: 0, minIlvl: 1, fullIlvl: 1 },
  { id: 1, name: 'Uncommon', color: '#4fd65a', weight: 21, lv: 2, perks: 0, sockets: 2, bonus: 1, minIlvl: 1, fullIlvl: 1 },
  { id: 2, name: 'Rare', color: '#4f8dff', weight: 6, lv: 3, perks: 1, sockets: 3, bonus: 1.6, minIlvl: 3, fullIlvl: 8 },
  { id: 3, name: 'Epic', color: '#b45cff', weight: 1, lv: 7, perks: 1, sockets: 3, bonus: 2.2, minIlvl: 30, fullIlvl: 40 },
  { id: 4, name: 'Legendary', color: '#ff9a2a', weight: 0.14, lv: 8, perks: 1, sockets: 4, bonus: 2.8, minIlvl: 45, fullIlvl: 60 },
  { id: 5, name: 'Mythic', color: '#ff4058', weight: 0.012, lv: 10, perks: 2, sockets: 4, bonus: 3.4, minIlvl: 60, fullIlvl: 80 },
  // Abyssal never rolls from a kill (weight 0): Abyssal Rift Guardians and Velscour Unbound make it (docs/ENDGAME.md)
  { id: 6, name: 'Abyssal', color: '#20e0ff', weight: 0, lv: 14, perks: 3, sockets: 5, bonus: 0, minIlvl: 200, fullIlvl: 200 },
];
export const ABYSSAL = 6;
/** How much of a rarity's drop odds item level ilvl has unlocked: 0 below its minIlvl, ramping to 1 at fullIlvl. */
export const rarityUnlock = (r, ilvl) => clamp((ilvl - RARITY[r].minIlvl + 1) / (RARITY[r].fullIlvl - RARITY[r].minIlvl + 1), 0, 1);
/** The best rarity up to r that item level ilvl allows (guaranteed rewards: a level 3 "Legendary" gift is a Rare). */
export function rarityAt(ilvl, r) {
  while (r > 0 && ilvl < RARITY[r].minIlvl) r--;
  return r;
}
/** Stat lines every item rolls (rarity adds perk lines on top), and each line's multiplier on its affix's range. */
export const CORE_LINES = 2, LINE_MULT = 1.5, PERK_MULT = 0.7;
for (const R of RARITY) R.affixes = [CORE_LINES + R.perks, CORE_LINES + R.perks]; // lines an item has (the enchanter adds one more)
/** An item's power level: its item level plus its rarity's worth in levels. */
export const powerLevel = (ilvl, rarity) => ilvl + RARITY[rarity].lv;
/** Display colour per rarity id (also used for icon and staff tints). */
export const RARITY_COLORS = RARITY.map((r) => r.color);

export const MATERIALS = [
  { name: 'Rusted', color: '#8a6a50' }, { name: 'Iron', color: '#9aa0a8' }, { name: 'Steel', color: '#c4ccd4' },
  { name: 'Tempered', color: '#d8c8a8' }, { name: 'Mithril', color: '#a8e4ff' }, { name: 'Runic', color: '#80ffd0' },
  { name: 'Obsidian', color: '#4a3a5a' }, { name: 'Dragonbone', color: '#ece0c0' }, { name: 'Celestial', color: '#fff0a0' },
  { name: 'Abyssal', color: '#b050ff' },
];
export const tierOf = (ilvl) => clamp(Math.floor((ilvl - 1) / 10), 0, 9);

export const RING_SLOTS = ['ring1', 'ring2', 'ring3', 'ring4'];
export const SLOTS = ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', ...RING_SLOTS];
export const SLOT_NAMES = { weapon: 'Weapon', offhand: 'Off-hand', head: 'Head', body: 'Body', hands: 'Hands', legs: 'Legs', feet: 'Feet', ring: 'Ring', ring1: 'Ring', ring2: 'Ring', ring3: 'Ring', ring4: 'Ring' };
/** Can item it go in equipment slot `slot`? (A ring fits any of the four ring slots.) */
export const fitsSlot = (it, slot, classId = null) => !!it && it.type === 'gear' && (it.slot === slot || (it.slot === 'ring' && RING_SLOTS.includes(slot)) || (classId === 'barbarian' && slot === 'offhand' && it.slot === 'weapon'));
/** The equipment slot an item goes to: its own, or for a ring the first empty ring slot (else the first). */
export const slotFor = (equip, it, classId = null) => (classId === 'barbarian' && it.slot === 'weapon' && equip.weapon && !equip.offhand ? 'offhand' : it.slot !== 'ring' ? it.slot : RING_SLOTS.find((s) => !equip[s]) || RING_SLOTS[0]);

export const WEAPONS = {
  sword: { names: ['Shortsword', 'Longsword', 'Broadsword', 'Bastard Sword', 'Runeblade'], icon: 'sword', dmg: 1.0, spd: 1.0 },
  axe: { names: ['Hatchet', 'War Axe', 'Bearded Axe', 'Battle Axe', 'Executioner'], icon: 'axe', dmg: 1.15, spd: 0.92 },
  mace: { names: ['Club', 'Mace', 'Flanged Mace', 'Morning Star', 'Reliquary Mace'], icon: 'mace', dmg: 1.05, spd: 0.97 },
  hammer: { names: ['War Hammer', 'Maul', 'Great Maul', 'Earthbreaker', 'Titan Hammer'], icon: 'hammer', dmg: 1.25, spd: 0.85 },
  dagger: { names: ['Knife', 'Dirk', 'Stiletto', 'Kris', 'Soul Blade'], icon: 'dagger', dmg: 0.75, spd: 1.25, crit: 4 },
  staff: { names: ['Quarterstaff', 'Gnarled Staff', 'Battle Staff', 'Archon Staff', 'Elder Staff'], icon: 'staff', dmg: 0.95, spd: 1.0, cast: 8 },
  wand: { names: ['Twig Wand', 'Bone Wand', 'Grim Wand', 'Lich Wand', 'Unearthed Wand'], icon: 'wand', dmg: 0.8, spd: 1.1, cast: 10 },
  bow: { names: ['Short Bow', 'Hunter\'s Bow', 'Composite Bow', 'Long War Bow', 'Matriarchal Bow'], icon: 'bow', dmg: 1.0, spd: 1.05 },
  crossbow: { names: ['Light Crossbow', 'Arbalest', 'Siege Crossbow', 'Ballista', 'Demon Crossbow'], icon: 'crossbow', dmg: 1.2, spd: 0.85 },
  spear: { names: ['Spear', 'Pike', 'Partizan', 'War Lance', 'Dragon Lance'], icon: 'spear', dmg: 1.1, spd: 0.95 },
  scythe: { names: ['Sickle', 'Scythe', 'War Scythe', 'Reaper', 'Thresher'], icon: 'scythe', dmg: 1.2, spd: 0.9 },
  pistol: { names: ['Flintlock', 'Blunderbuss', 'Hand Cannon', 'Repeater', 'Dragon Pistol'], icon: 'pistol', dmg: 1.0, spd: 1.1 },
  boomerang: { names: ['Throwing Stick', 'Boomerang', 'Glaive', 'Chakram', 'Moon Glaive'], icon: 'boomerang', dmg: 0.95, spd: 1.1 },
  lute: { names: ['Lute', 'Mandolin', 'War Lyre', 'Siren Harp', 'Lute of Ages'], icon: 'lute', dmg: 0.85, spd: 1.1, cast: 5 },
};
export const OFFHANDS = {
  shield: { names: ['Buckler', 'Kite Shield', 'Tower Shield', 'Aegis', 'Bulwark'], icon: 'shield', armor: 1.0, block: [8, 16] },
  orb: { names: ['Glass Orb', 'Eldritch Orb', 'Sacred Globe', 'Eye of Night', 'Star of Ruin'], icon: 'orb', armor: 0.25, spell: [6, 14] },
};
export const ARMORS = {
  head: { names: ['Cap', 'Helm', 'Great Helm', 'Winged Helm', 'Crown'], icon: 'helm', armor: 0.6 },
  body: { names: ['Leather Armor', 'Chain Mail', 'Breastplate', 'Plate Armor', 'Ancient Armor'], icon: 'armor', armor: 1.2 },
  hands: { names: ['Gloves', 'Bracers', 'Gauntlets', 'War Gauntlets', 'Ogre Gauntlets'], icon: 'gloves', armor: 0.4 },
  legs: { names: ['Leggings', 'Chain Leggings', 'Greaves', 'Plate Greaves', 'Warlord Greaves'], icon: 'legs', armor: 0.8 },
  feet: { names: ['Boots', 'Heavy Boots', 'Chain Boots', 'Sabatons', 'War Boots'], icon: 'boots', armor: 0.45 },
};

// Affixes. slots: W weapon, O offhand, H head, B body, G hands, L legs, F feet, R ring.
export const AFFIXES = [
  { s: 'dmgPct', t: '+{v}% Damage', pre: 'Vicious', min: 6, max: 14, sc: 0.025, slots: 'WOGR' },
  { s: 'flatDmg', t: '+{v} Weapon Damage', pre: 'Jagged', min: 1, max: 4, sc: 0.07, slots: 'W' },
  { s: 'atkSpeed', t: '+{v}% Attack Speed', pre: 'Swift', min: 4, max: 10, sc: 0.004, slots: 'WGR' },
  { s: 'castSpeed', t: '+{v}% Cast Speed', pre: 'Arcane', min: 4, max: 10, sc: 0.004, slots: 'WOHR' },
  { s: 'critChance', t: '+{v}% Critical Chance', pre: 'Keen', min: 2, max: 5, sc: 0.004, slots: 'WGHR' },
  { s: 'critDmg', t: '+{v}% Critical Damage', pre: 'Brutal', min: 10, max: 25, sc: 0.01, slots: 'WGOR' },
  { s: 'life', t: '+{v} Life', suf: 'of the Bear', min: 8, max: 20, sc: 0.1, slots: 'OHBGLFR' },
  { s: 'lifePct', t: '+{v}% Maximum Life', suf: 'of Vigor', min: 3, max: 7, sc: 0.004, slots: 'OHBLR', w: 0.6 },
  { s: 'reduce', t: '{v}% Damage Reduction', pre: 'Warded', min: 1, max: 3, sc: 0.002, slots: 'OBL', w: 0.45 },
  { s: 'mana', t: '+{v} Mana', suf: 'of the Owl', min: 6, max: 15, sc: 0.05, slots: 'WOHBGLFR' },
  { s: 'lifeRegen', t: '+{v} Life per Second', suf: 'of Regrowth', min: 1, max: 3, sc: 0.05, slots: 'HBLFR' },
  { s: 'manaRegen', t: '+{v} Mana per Second', suf: 'of Clarity', min: 1, max: 2, sc: 0.04, slots: 'WOHGR' },
  { s: 'armor', t: '+{v} Armor', pre: 'Sturdy', min: 5, max: 15, sc: 0.07, slots: 'OHBGLF' },
  { s: 'armorPct', t: '+{v}% Armor', pre: 'Fortified', min: 10, max: 30, sc: 0.008, slots: 'OHBGLF' },
  { s: 'str', t: '+{v} Strength', suf: 'of Might', min: 2, max: 6, sc: 0.035, slots: 'WOHBGLFR' },
  { s: 'dex', t: '+{v} Dexterity', suf: 'of the Fox', min: 2, max: 6, sc: 0.035, slots: 'WOHBGLFR' },
  { s: 'vit', t: '+{v} Vitality', suf: 'of the Ox', min: 2, max: 6, sc: 0.035, slots: 'WOHBGLFR' },
  { s: 'int', t: '+{v} Intellect', suf: 'of the Sage', min: 2, max: 6, sc: 0.035, slots: 'WOHBGLFR' },
  { s: 'allAttr', t: '+{v} All Attributes', suf: 'of the Ancients', min: 1, max: 3, sc: 0.03, slots: 'WBHR', w: 0.4 },
  { s: 'resFire', t: '+{v}% Fire Resistance', suf: 'of Embers', min: 5, max: 14, sc: 0.006, slots: 'OHBGLFR' },
  { s: 'resCold', t: '+{v}% Cold Resistance', suf: 'of Winter', min: 5, max: 14, sc: 0.006, slots: 'OHBGLFR' },
  { s: 'resLight', t: '+{v}% Lightning Resistance', suf: 'of Grounding', min: 5, max: 14, sc: 0.006, slots: 'OHBGLFR' },
  { s: 'resPoison', t: '+{v}% Poison Resistance', suf: 'of the Antidote', min: 5, max: 14, sc: 0.006, slots: 'OHBGLFR' },
  { s: 'resAll', t: '+{v}% All Resistances', suf: 'of the Prism', min: 3, max: 8, sc: 0.005, slots: 'OHBR', w: 0.5 },
  { s: 'lifeSteal', t: '{v}% Life Steal', pre: 'Vampiric', min: 1, max: 3, sc: 0.002, slots: 'WGR' },
  { s: 'manaSteal', t: '{v}% Mana Steal', pre: 'Draining', min: 1, max: 3, sc: 0.002, slots: 'WGR', perk: 1 },
  { s: 'moveSpeed', t: '+{v}% Movement Speed', pre: 'Fleet', min: 4, max: 10, sc: 0.002, slots: 'FL', perk: 1 },
  { s: 'goldFind', t: '+{v}% Gold Find', suf: 'of Greed', min: 10, max: 30, sc: 0.01, slots: 'HGFR', perk: 1 },
  { s: 'magicFind', t: '+{v}% Magic Find', suf: 'of Fortune', min: 5, max: 15, sc: 0.006, slots: 'HGFR', perk: 1 },
  { s: 'block', t: '+{v}% Block Chance', pre: 'Stalwart', min: 3, max: 8, sc: 0.002, slots: 'O' },
  { s: 'thorns', t: '{v} Thorns Damage', pre: 'Spiked', min: 2, max: 6, sc: 0.08, slots: 'OBL', perk: 1 },
  { s: 'physPct', t: '+{v}% Physical Damage', pre: 'Sharpened', min: 8, max: 18, sc: 0.02, slots: 'WG' },
  { s: 'firePct', t: '+{v}% Fire Damage', pre: 'Burning', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'coldPct', t: '+{v}% Cold Damage', pre: 'Frozen', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'lightPct', t: '+{v}% Lightning Damage', pre: 'Shocking', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'poisonPct', t: '+{v}% Poison Damage', pre: 'Venomous', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'arcanePct', t: '+{v}% Arcane Damage', pre: 'Mystic', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'holyPct', t: '+{v}% Holy Damage', pre: 'Blessed', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'shadowPct', t: '+{v}% Shadow Damage', pre: 'Cursed', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'bloodPct', t: '+{v}% Blood Damage', pre: 'Sanguine', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'acidPct', t: '+{v}% Acid Damage', pre: 'Caustic', min: 8, max: 18, sc: 0.02, slots: 'WOHR' },
  { s: 'cdr', t: '+{v}% Cooldown Reduction', pre: 'Hastened', min: 3, max: 7, sc: 0.002, slots: 'HOGR', w: 0.6 },
  { s: 'areaPct', t: '+{v}% Area of Effect', pre: 'Vast', min: 5, max: 12, sc: 0.003, slots: 'WOB', w: 0.6 },
  { s: 'projSpeed', t: '+{v}% Projectile Speed', pre: 'Hurtling', min: 6, max: 15, sc: 0.003, slots: 'WG', w: 0.6, perk: 1 },
  { s: 'xpPct', t: '+{v}% Experience Gained', suf: 'of Learning', min: 3, max: 8, sc: 0.002, slots: 'HBR', w: 0.5, perk: 1 },
  { s: 'bossDmg', t: '+{v}% Damage to Bosses', pre: 'Slayer\'s', min: 8, max: 18, sc: 0.01, slots: 'WGO', w: 0.5, perk: 1 },
  { s: 'skillsAll', t: '+{v} to All Skills', pre: 'Exalted', min: 1, max: 1, sc: 0, slots: 'WOHBR', w: 0.25, minPl: 30 },
  { s: 'skillTree0', t: '+{v} to {tree0} Skills', pre: 'Adept\'s', min: 1, max: 2, sc: 0, slots: 'WOH', w: 0.25, minPl: 10 },
  { s: 'skillTree1', t: '+{v} to {tree1} Skills', pre: 'Adept\'s', min: 1, max: 2, sc: 0, slots: 'WOH', w: 0.25, minPl: 10 },
  { s: 'skillTree2', t: '+{v} to {tree2} Skills', pre: 'Adept\'s', min: 1, max: 2, sc: 0, slots: 'WOH', w: 0.25, minPl: 10 },
  { s: 'skillTree3', t: '+{v} to {tree3} Skills', pre: 'Adept\'s', min: 1, max: 2, sc: 0, slots: 'WOH', w: 0.25, minPl: 10 },
];
export const AFFIX_BY_STAT = Object.fromEntries(AFFIXES.map((a) => [a.s, a]));
const SLOT_LETTER = { weapon: 'W', offhand: 'O', head: 'H', body: 'B', hands: 'G', legs: 'L', feet: 'F', ring: 'R' };

export const LEGENDARY = {
  thunder: { name: 'Thunderstruck', desc: 'Hits have a 12% chance to call down a lightning bolt.' },
  echo: { name: 'Echoing', desc: 'Skills have a {0}% chance to cast twice.', stats: [['echoChance', 20]] },
  split: { name: 'Splintering', desc: 'Projectiles have a {0}% chance to split into three on their first hit.', stats: [['splitChance', 100]] },
  vamp: { name: 'Sanguinarch', desc: '+{0}% Life Steal. Kills heal 2% of life.', stats: [['lifeSteal', 6]] },
  inferno: { name: 'Infernal Path', desc: 'You leave a trail of burning ground.' },
  bloodbath: { name: 'Bloodbath', desc: 'Enemies you kill explode for 35% of their life.' },
  frostbite: { name: 'Frostbite', desc: 'Hits chill; 10% chance to freeze solid.' },
  surge: { name: 'Arcane Surge', desc: '15% chance on cast to refund the mana cost.' },
  wraith: { name: 'Wraithwalk', desc: '+{0}% movement speed and you pass through monsters.', stats: [['moveSpeed', 25]] },
  hammer: { name: 'Hammerfall', desc: 'Every 6th hit drops a spinning holy hammer.' },
  orbit: { name: 'Orbiting Shards', desc: 'Three spectral blades orbit you permanently.' },
  phoenix: { name: 'Phoenix Heart', desc: 'Once every 90 seconds, survive a killing blow.' },
  glass: { name: 'Glass Cannon', desc: '+{0}% damage, {1}% life.', stats: [['dmgPct', 60], ['lifePct', -30]] },
  prism: { name: 'Prismatic', desc: '+1 projectile to all projectile skills.', stats: [['extraProj', 1]] },
  giant: { name: 'Giant\'s Reach', desc: '+{0}% area of effect.', stats: [['areaPct', 30]] },
  chain: { name: 'Chain Reaction', desc: 'Chains, bounces and pierces happen 2 extra times.', stats: [['chainPlus', 2], ['pierce', 2]] },
  nova: { name: 'Nova Heart', desc: '{0}% chance on cast to release a nova of the skill\'s element.', stats: [['novaOnCast', 25]] },
  greed: { name: 'Midas Touch', desc: '+{0}% gold find. Kills sometimes burst into coins.', stats: [['goldFind', 80]] },
  berserk: { name: 'Berserker', desc: '+4% damage for every 10% of life missing.' },
  thorns: { name: 'Iron Maiden', desc: 'Attackers take 150% of the damage they deal.' },
  legion: { name: 'Legion', desc: 'Your summons deal +{0}% damage and have +{0}% life.', stats: [['summonPct', 60]] },
  crit: { name: 'Executioner', desc: '+{0}% critical chance and +{1}% critical damage.', stats: [['critChance', 10], ['critDmg', 60]] },
};

/**
 * A legendary power's strength by the item's power level: its stats (and the numbers in its text) grow from 15% to
 * full strength at power level 90, so an early Mythic's power is a taste, not a crutch, and a level 25 Rare still
 * beats a level 10 Mythic. Whole-number powers (+1 projectile, +2 chains) don't scale.
 */
export const legendaryScale = (pl) => clamp((pl - 10) / 80, 0.15, 1);
const WHOLE = new Set(['extraProj', 'chainPlus', 'pierce']);
export function legendaryStats(item) {
  const L = item.legendary && LEGENDARY[item.legendary];
  if (!L || !L.stats) return [];
  const k = legendaryScale(powerLevel(item.ilvl, item.rarity));
  return L.stats.map(([st, v]) => [st, WHOLE.has(st) ? v : Math.round(v * k)]);
}
/** The power's text with its scaled numbers. */
export function legendaryDesc(item) {
  const L = LEGENDARY[item.legendary], st = legendaryStats(item);
  return L.desc.replace(/\{(\d)\}/g, (_, i) => st[+i] ? String(st[+i][1]) : '?');
}

// ---------------------------------------------------------------- class catalog items
// A class art pack (assets/sprites/classes/<cls>/<cls>.json) names that class's weapons and shields. While a
// hero of that class plays, every drop, vendor item and starting item of those slots is one of the catalog
// pieces of the rolled rarity (with its own name and icon) when one fits the slot and base; everything else
// stays a generic item. (Body armor and helmets look like the class's gear art: core/gearart.js.)
let classPool = null;
const BASE_WORDS = [
  ['sword', /Sword|Sabre|Blade|Edge|Falchion|Estoc|Rapier|Scimitar|Amen/], ['axe', /Axe|Cleaver|Executioner|Reaver/],
  ['hammer', /Hammer|Maul/], ['spear', /Spear|Lance|Trident|Glaive|Halberd|Pike/], ['mace', /Mace|Club|Flail|Scourge/],
];
/** The generic weapon base a catalog weapon behaves as (by its name; swords by default). */
export function catalogBase(name) {
  for (const [b, re] of BASE_WORDS) if (re.test(name)) return b;
  return 'sword';
}
export function setClassItems(cls, meta) {
  if (!meta) { classPool = null; return; }
  const rar = (r) => Math.max(0, RARITY.findIndex((x) => x.name === r));
  classPool = { weapon: [], offhand: [] };
  for (const [id, e] of Object.entries(meta.items)) {
    if (e.kind !== 'weapon' && e.kind !== 'shield') continue;
    const slot = e.kind === 'shield' ? 'offhand' : 'weapon';
    classPool[slot].push({ id, cls, name: e.name, rarity: rar(e.rarity), base: slot === 'offhand' ? 'shield' : catalogBase(e.name) });
  }
}
function classItem(slot, rarity, base) {
  const list = classPool && classPool[slot];
  if (!list) return null;
  const fits = list.filter((e) => e.rarity === rarity && (!base || e.base === base));
  return fits.length ? pick(fits) : null;
}

// ---------------------------------------------------------------- gems
export const GEM_TIERS = ['Chipped', 'Flawed', '', 'Flawless', 'Perfect', 'Royal', 'Imperial', 'Celestial', 'Abyssal', 'Eternal'];
export const MAX_GEM_TIER = GEM_TIERS.length - 1;
const GEM_MULT = [1, 1.8, 3, 4.5, 6.5, 9, 13, 18, 25, 35];
/** Gem Forge prices: fusing three gems of a tier into one of the next, or refining a single gem (much dearer). */
export const gemFuseCost = (tier) => Math.round(80 * Math.pow(2.2, tier));
export const gemRefineCost = (tier, special) => Math.round((special ? 2400 : 900) * Math.pow(2.6, tier));
export const GEMS = {
  ruby: { name: 'Ruby', color: '#e0203a', stats: [['life', 8], ['firePct', 4]] },
  sapphire: { name: 'Sapphire', color: '#2a5aff', stats: [['mana', 6], ['coldPct', 4]] },
  topaz: { name: 'Topaz', color: '#ffc020', stats: [['magicFind', 4], ['lightPct', 4]] },
  emerald: { name: 'Emerald', color: '#20c050', stats: [['dex', 2], ['poisonPct', 4]] },
  amethyst: { name: 'Amethyst', color: '#a040e0', stats: [['str', 2], ['armor', 6]] },
  diamond: { name: 'Diamond', color: '#e8f4ff', stats: [['resAll', 2], ['holyPct', 3]] },
  onyx: { name: 'Onyx', color: '#3a3448', stats: [['lifeSteal', 0.4], ['shadowPct', 4]] },
  opal: { name: 'Opal', color: '#f0d0ff', stats: [['int', 2], ['castSpeed', 1.5]] },
  jade: { name: 'Jade', color: '#40d0a0', stats: [['atkSpeed', 1.5], ['critChance', 0.6]] },
  bloodstone: { name: 'Bloodstone', color: '#a00018', stats: [['critDmg', 4], ['bloodPct', 4]] },
  moonstone: { name: 'Moonstone', color: '#c0d8ff', stats: [['cdr', 0.8], ['manaRegen', 0.5]] },
  sunstone: { name: 'Sunstone', color: '#ffa020', stats: [['arcanePct', 4], ['lifeRegen', 0.6]] },
  // shot-pattern / skill gems (rare). Fewer tiers matter: values per tier below.
  prism: { name: 'Prism Shard', color: '#ffffff', special: true, stats: [['extraProj', 0.34]], desc: 'More projectiles' },
  twinsoul: { name: 'Twinsoul Gem', color: '#ff80ff', special: true, stats: [['echoChance', 3]], desc: 'Chance to echo-cast' },
  splitter: { name: 'Splitter Garnet', color: '#ff5030', special: true, stats: [['splitChance', 8]], desc: 'Projectiles split on hit' },
  orbit: { name: 'Orbit Pearl', color: '#e0f0ff', special: true, stats: [['orbitOnCast', 4]], desc: 'Casts spawn orbiting orbs' },
  novacore: { name: 'Nova Core', color: '#ffd040', special: true, stats: [['novaOnCast', 4]], desc: 'Casts release novas' },
  chainlink: { name: 'Chainlink Agate', color: '#a0a0ff', special: true, stats: [['chainPlus', 0.34], ['pierce', 0.34]], desc: 'Extra chains & pierce' },
  titan: { name: 'Titan Heart', color: '#c06030', special: true, stats: [['areaPct', 4]], desc: 'Bigger areas' },
  seeker: { name: 'Seeker\'s Eye', color: '#40ffc0', special: true, stats: [['homing', 0.34], ['projSpeed', 5]], desc: 'Homing projectiles' },
  classgem: { name: 'Tear of the Ancients', color: '#ffe0a0', special: true, stats: [['skillsAll', 0.34]], desc: '+Skill levels' },
  // Sigil Stones (the 'sig' gem; its tier is the rank, 0-19): what a stone gives depends on the slot it sits in, and
  // set in the right order in a plain item they write a Glyphword (data/relics.js). Three fuse into the next rank.
  sig: { name: 'Sigil Stone', color: '#ffd88a', sigil: true, stats: [] },
};
const GEM_KEYS = Object.keys(GEMS);
const NORMAL_GEMS = GEM_KEYS.filter((k) => !GEMS[k].special && !GEMS[k].sigil);
const SPECIAL_GEMS = GEM_KEYS.filter((k) => GEMS[k].special);

// ---------------------------------------------------------------- Sigil Stones
// w: in a weapon, a: in armor (head, body, off-hand, hands, legs, feet), r: in a ring. A rank r stone gives base x
// sigilMult(r): about 1.4x one stat of the best gem that drops at the same depth (a stone gives one stat, a gem two),
// so a Sigil is worth socketing on its own; whole skill levels stay whole. Rank r drops from depth 24 r.
export const SIGILS = [
  { name: 'Ash', color: '#ff8040', w: ['firePct', 4], a: ['resFire', 3], r: ['life', 6] },
  { name: 'Bryn', color: '#80c8ff', w: ['coldPct', 4], a: ['resCold', 3], r: ['mana', 5] },
  { name: 'Cael', color: '#fff080', w: ['lightPct', 4], a: ['resLight', 3], r: ['magicFind', 2] },
  { name: 'Dov', color: '#80e060', w: ['poisonPct', 4], a: ['resPoison', 3], r: ['goldFind', 4] },
  { name: 'Esk', color: '#c8c0b0', w: ['physPct', 4], a: ['armor', 8], r: ['str', 2] },
  { name: 'Fen', color: '#e05040', w: ['dmgPct', 3], a: ['life', 8], r: ['dex', 2] },
  { name: 'Gur', color: '#a08060', w: ['flatDmg', 1.5], a: ['armorPct', 3], r: ['vit', 2] },
  { name: 'Hask', color: '#ffb060', w: ['atkSpeed', 1.5], a: ['lifeRegen', 0.6], r: ['atkSpeed', 1.2] },
  { name: 'Ivo', color: '#c090ff', w: ['castSpeed', 1.5], a: ['mana', 6], r: ['castSpeed', 1.2] },
  { name: 'Jorn', color: '#f0f0f0', w: ['critChance', 0.6], a: ['block', 0.8], r: ['critChance', 0.5] },
  { name: 'Kesh', color: '#ffc040', w: ['critDmg', 4], a: ['resAll', 1.5], r: ['critDmg', 3] },
  { name: 'Lyr', color: '#fff4c0', w: ['holyPct', 4], a: ['reduce', 0.3], r: ['int', 2] },
  { name: 'Mord', color: '#9060c0', w: ['shadowPct', 4], a: ['lifeSteal', 0.3], r: ['manaSteal', 0.3] },
  { name: 'Nath', color: '#80a0ff', w: ['arcanePct', 4], a: ['cdr', 0.5], r: ['cdr', 0.4] },
  { name: 'Orr', color: '#c02030', w: ['bloodPct', 4], a: ['thorns', 3], r: ['lifePct', 0.5] },
  { name: 'Pell', color: '#60e0c0', w: ['areaPct', 1.2], a: ['lifePct', 0.5], r: ['areaPct', 1] },
  { name: 'Quell', color: '#ff6060', w: ['bossDmg', 3], a: ['resAll', 1.5], r: ['bossDmg', 2] },
  { name: 'Ruv', color: '#e0c080', w: ['allAttr', 1.2], a: ['allAttr', 1.2], r: ['allAttr', 1.2] },
  { name: 'Syl', color: '#ffe0f0', w: ['dmgPct', 4], a: ['reduce', 0.35], r: ['xpPct', 0.5] },
  { name: 'Thane', color: '#ffd700', w: ['skillsAll', 1], a: ['lifePct', 0.45], r: ['skillsAll', 1] },
];
export const SIGIL_MAX = SIGILS.length - 1;
const FIXED = new Set(['skillsAll']);
/** A rank's multiplier on its stones' base values (1.4 at rank 0 up to 49 at rank 19, like the gem grades). */
export const sigilMult = (rank) => 1.4 * (1 + 34 * Math.pow(rank / SIGIL_MAX, 1.3));
/** The slot letter a socket counts as for a Sigil: w(eapon), r(ing) or a(rmor). */
export const sigilSlot = (slot) => (slot === 'weapon' ? 'w' : slot === 'ring' ? 'r' : 'a');
export function sigilStats(rank, slot) {
  const S = SIGILS[clamp(rank, 0, SIGIL_MAX)];
  if (!slot) return [];
  const [s, b] = S[sigilSlot(slot)];
  const v = FIXED.has(s) ? b : b * sigilMult(rank);
  return [[s, Math.round(v * 10) / 10]];
}
/** The deepest Sigil rank a depth can drop (rank r from depth 24 r). */
export const sigilCap = (depth) => clamp(Math.floor(depth / 24), 0, SIGIL_MAX);
/** A Sigil from depth `depth`: mostly the few ranks just under its cap. */
export function rollSigil(depth, bonus = 0) {
  const cap = sigilCap(depth);
  let r = cap;
  while (r > 0 && chance(0.55 - bonus * 0.1)) r--;
  return makeGem('sig', r);
}
/** Gold to fuse three rank r Sigils into one rank r + 1 (follows the gold curve of the depth they drop at). */
export const sigilFuseCost = (rank) => Math.round(goldPile(depthLevelOf(rank * 24 + 12)) * 6);
const depthLevelOf = (d) => (d <= 60 ? d : Math.round(60 + (d - 60) * 0.45));
/** The highest grade a gem kind reaches (Sigils have twenty ranks). */
export const gemMaxTier = (gem) => (GEMS[gem] && GEMS[gem].sigil ? SIGIL_MAX : MAX_GEM_TIER);

export function gemStats(gem, tier, slot) {
  const g = GEMS[gem];
  if (g.sigil) return sigilStats(tier, slot);
  return g.stats.map(([s, v]) => {
    let val = v * GEM_MULT[tier];
    if (['extraProj', 'chainPlus', 'pierce', 'homing', 'skillsAll'].includes(s)) val = Math.max(s === 'chainPlus' || s === 'pierce' ? 1 : 0, Math.floor((tier + 1) * v + 0.0001)); // every Chainlink gives at least +1
    else val = Math.round(val * 10) / 10;
    return [s, val];
  }).filter(([, v]) => v > 0);
}
export function gemName(gem, tier) {
  if (GEMS[gem].sigil) return `${SIGILS[clamp(tier, 0, SIGIL_MAX)].name} Sigil`;
  const t = GEM_TIERS[tier];
  return (t ? t + ' ' : '') + GEMS[gem].name;
}

let UID = Date.now() % 1000000;
export const newUid = () => ++UID;

export function makeGem(gem, tier) {
  return { uid: newUid(), type: 'gem', gem, tier: clamp(tier, 0, gemMaxTier(gem)), count: 1, ilvl: GEMS[gem] && GEMS[gem].sigil ? tier * 24 + 1 : tier * 15 + 1 };
}
export function rollGem(ilvl) {
  const maxTier = clamp(Math.floor(ilvl / 16), 0, 7); // the top two tiers only come from the Gem Forge
  const tier = clamp(maxTier - (chance(0.6) ? randi(0, 1) : 0), 0, 7);
  const special = chance(0.08 + ilvl * 0.0012);
  return makeGem(special ? pick(SPECIAL_GEMS) : pick(NORMAL_GEMS), tier);
}

// --------------------------------------------------------------- items
// Affix values of the stats that scale (sc >= 0.01: damage, life, mana, attributes, armor...) grow AFFIX_K times
// faster with power level than (1 + pl * sc), re-anchored to equal it at AFFIX_ANCHOR: deep gear keeps its numbers
// while every level below is a visible step down, so each level up is an upgrade. Capped stats (resistances, speeds,
// crit, block...) keep their gentle growth.
const AFFIX_K = 2, AFFIX_ANCHOR = 80;
export function affixScale(sc, pl) {
  if (sc < 0.01) return 1 + pl * sc;
  return (1 + AFFIX_ANCHOR * sc) * (1 + pl * sc * AFFIX_K) / (1 + AFFIX_ANCHOR * sc * AFFIX_K);
}
export function affixValue(a, ilvl, rarity, roll = Math.random()) {
  const base = a.min + (a.max - a.min) * roll;
  const v = base * affixScale(a.sc, powerLevel(ilvl, rarity)) * (a.perk ? PERK_MULT : LINE_MULT);
  return a.min >= 1 && a.max <= 2 && a.sc === 0 ? Math.round(base) : Math.max(1, Math.round(v));
}

/** Roll `count` stat lines onto an item: core lines, or perk lines (perk). */
function rollAffixes(item, count, perk = false) {
  const letter = SLOT_LETTER[item.slot];
  const pl = powerLevel(item.ilvl, item.rarity);
  const pool = AFFIXES.filter((a) => a.slots.includes(letter) && !a.perk === !perk && (a.minPl || 0) <= pl && !item.affixes.some((x) => x.s === a.s));
  for (let i = 0; i < count && pool.length; i++) {
    const a = weighted(pool.map((p) => [p, p.w ?? 1]));
    pool.splice(pool.indexOf(a), 1);
    item.affixes.push({ s: a.s, v: affixValue(a, item.ilvl, item.rarity), ...(perk ? { perk: true } : {}) });
  }
}

/**
 * A drop's rarity. mf: magic find (%). bonus: a guardian's, chest's or event's better odds (0 = a plain kill).
 * ilvl: the item's level (rarities unlock with it; rarityUnlock).
 */
export function rollRarity(mf = 0, bonus = 0, ilvl = 999) {
  return weighted(RARITY.map((r) => [r.id, r.id === 0 ? r.weight / (1 + bonus) : r.weight * (1 + bonus * r.bonus) * mfMul(mf, r.id) * rarityUnlock(r.id, ilvl)]));
}
/** Magic find's multiplier on a rarity's weight (at 100% it raises the share of Epic and above ~1.6x). */
export const mfMul = (mf, id) => 1 + Math.max(0, mf) / 100 * [0, 0.6, 0.8, 0.9, 0.9, 0.9, 0.9][id];

const EPIC_A = ['Doom', 'Soul', 'Blood', 'Grim', 'Storm', 'Night', 'Wrath', 'Bone', 'Dread', 'Ember', 'Frost', 'Shadow', 'Hell', 'Star', 'Void', 'Rune', 'Gore', 'Plague', 'Dawn', 'Ash'];
const EPIC_B = ['bringer', 'reaver', 'fang', 'song', 'ward', 'call', 'bane', 'shard', 'heart', 'grasp', 'veil', 'brand', 'mourn', 'fall', 'spire', 'maw', 'crest', 'thorn', 'whisper', 'edge'];

/** Plain (Common) items take extra sockets, as Glyphword bases (data/relics.js): this many per slot. */
export const HOLLOW = { weapon: 6, body: 6, offhand: 4, head: 4, legs: 4, hands: 3, feet: 3, ring: 0 };

export function rollItem(ilvl, opts = {}) {
  ilvl = Math.max(1, Math.round(ilvl));
  const slot = opts.slot || pick(['weapon', 'weapon', 'offhand', 'head', 'head', 'body', 'body', 'body', 'hands', 'legs', 'feet', 'ring', 'ring']);
  const rarity = opts.rarity ?? rollRarity(opts.mf || 0, opts.bonus || 0, ilvl);
  const tier = tierOf(ilvl), pl = powerLevel(ilvl, rarity);
  const item = { uid: newUid(), type: 'gear', slot, rarity, ilvl, tier, upg: 0, affixes: [], gems: [], sockets: 0 };
  const art = opts.generic || slot === 'ring' ? null : classItem(slot, rarity, opts.base);
  if (art) opts = { ...opts, base: art.base };
  if (slot === 'weapon') {
    item.base = opts.base || pick(Object.keys(WEAPONS));
    const W = WEAPONS[item.base];
    const avg = 3.4 * Math.pow(1.052, pl - 1) * W.dmg * (1 + pl * 0.012);
    item.dmg = [Math.max(1, Math.round(avg * 0.75)), Math.max(2, Math.round(avg * 1.25))];
    item.icon = W.icon;
    item.baseName = W.names[Math.min(4, Math.floor(tier / 2))];
    if (W.crit) item.affixes.push({ s: 'critChance', v: W.crit, implicit: true });
    if (W.cast) item.affixes.push({ s: 'castSpeed', v: W.cast, implicit: true });
  } else if (slot === 'offhand') {
    item.base = opts.base || pick(Object.keys(OFFHANDS));
    const O = OFFHANDS[item.base];
    item.armor = Math.round(6 * O.armor * Math.pow(1.045, pl - 1) * (0.85 + Math.random() * 0.3));
    item.icon = O.icon;
    item.baseName = O.names[Math.min(4, Math.floor(tier / 2))];
    if (O.block) item.affixes.push({ s: 'block', v: randi(O.block[0], O.block[1]), implicit: true });
    if (O.spell) item.affixes.push({ s: 'dmgPct', v: randi(O.spell[0], O.spell[1]) + Math.floor(ilvl / 10), implicit: true });
  } else if (slot === 'ring') {
    item.base = 'ring'; item.icon = 'ring';
    item.baseName = RING_NAMES[tier];
    item.aug = rollAugments(rarity, pl, ringCtx.classId, ringCtx.learned || {});
  } else {
    item.base = slot;
    const A = ARMORS[slot];
    item.armor = Math.round(6 * A.armor * Math.pow(1.045, pl - 1) * (0.85 + Math.random() * 0.3));
    item.icon = A.icon;
    item.baseName = A.names[Math.min(4, Math.floor(tier / 2))];
  }
  const R = RARITY[rarity];
  rollAffixes(item, CORE_LINES);
  rollAffixes(item, R.perks, true);
  item.maxSockets = slot === 'ring' ? [0, 0, 1, 1, 2, 2, 3][rarity] : rarity === 0 ? HOLLOW[slot] : R.sockets;
  item.sockets = Math.min(item.maxSockets, chance(0.45) ? randi(0, Math.ceil(item.maxSockets / 2)) : 0);
  if (rarity >= 4) item.legendary = pick(Object.keys(LEGENDARY));
  if (rarity >= 3) item.title = pick(EPIC_A) + pick(EPIC_B);
  if (art) Object.assign(item, { art: art.id, artCls: art.cls, uname: art.name });
  else if (slot === 'ring') item.rname = ringName(item);
  else if (rarity >= 1) {
    const pre = item.affixes.find((a) => !a.implicit && AFFIX_BY_STAT[a.s].pre);
    const suf = item.affixes.find((a) => !a.implicit && AFFIX_BY_STAT[a.s].suf);
    item.pre = pre ? AFFIX_BY_STAT[pre.s].pre : null;
    item.suf = rarity >= 2 && suf ? AFFIX_BY_STAT[suf.s].suf : (suf && !pre ? AFFIX_BY_STAT[suf.s].suf : null);
  }
  item.req = ilvl; // a level N item needs a level N hero: each level up opens the next step of gear
  if (opts.unid) item.unid = true;
  return item;
}

// ---------------------------------------------------------------- rings
// rollItem rolls a ring's augments for the hero who plays now (game.startChar sets this): their class, and their
// learned skills, which rings favour.
let ringCtx = {};
export function setRingContext(classId, learned) { ringCtx = { classId, learned }; }
/** What an augment targets, for names and tooltips: a skill's name, "Orbit skills" or "all skills". */
export function augTarget(a) {
  if (a.sk) return SKILLS[a.sk] ? SKILLS[a.sk].name : 'a lost skill';
  if (a.kind) return `${KIND_NAMES[a.kind] || a.kind} skills`;
  return 'all skills';
}
function ringName(item) {
  const a = item.aug[0];
  if (!a) return item.baseName;
  return `${AUGMENTS[a.id].word} ${item.baseName} of ${augTarget(a)}`;
}

/**
 * Epic and better can drop sealed (ui/sealed.js): no name, no colour, no stats until the player breaks the seal. At
 * most one every SEAL_GAP seconds of dungeon time (c.sealT, game.update): a 60-slot bag takes ~15 hours of auto-play
 * to fill with them. An Epic+ that drops sooner arrives open, like any other item.
 */
export const SEAL_RARITY = 3;
export const SEAL_GAP = 15 * 60;
export const SEALED_COLOR = '#ffdf8a';

/** Heirlooms, Covenants and Glyphwords (data/relics.js): their colours, and the hook that adds their stats. */
export const RELIC_COLORS = { heir: '#d9b45a', cov: '#35e0b8', glyph: '#f2e2b0' };
export const RELIC_NAMES = { heir: 'Heirloom', cov: 'Covenant', glyph: 'Glyphword' };
export const RELIC_HOOK = { stats: null, glyph: null };

export function itemName(item) {
  if (item.sealed) return 'Sealed Treasure';
  if (item.relic && item.uname) return item.uname + (item.upg ? ` +${item.upg}` : '');
  const gw = item.type === 'gear' && RELIC_HOOK.glyph && RELIC_HOOK.glyph(item);
  if (gw) return gw.name + (item.upg ? ` +${item.upg}` : '');
  if (item.type === 'gem') return gemName(item.gem, item.tier);
  if (item.type === 'potion') return item.name;
  if (item.rname) return item.rname + (item.upg ? ` +${item.upg}` : '');
  if (item.uname) return item.uname + (item.upg ? ` +${item.upg}` : '');
  const base = `${MATERIALS[item.tier]?.name || ''} ${item.baseName || item.base || 'Item'}`.trim();
  const upg = item.upg ? ` +${item.upg}` : '';
  if (item.title) return `${item.title}${upg}`;
  if (item.name) return `${item.name}${upg}`;
  if (item.rarity >= 3 && item.title) return `${item.title}${upg}`;
  return `${item.pre ? item.pre + ' ' : ''}${base}${item.suf ? ' ' + item.suf : ''}${upg}`;
}
export function itemBaseLine(item) {
  if (item.type !== 'gear') return '';
  if (item.slot === 'ring') return item.baseName;
  return `${MATERIALS[item.tier].name} ${item.baseName}`;
}
export function itemColor(item) {
  if (item.sealed) return SEALED_COLOR;
  if (item.type === 'gem') return GEMS[item.gem].sigil ? '#ffd88a' : GEMS[item.gem].special ? '#ff9a2a' : '#c8f0ff';
  if (item.type === 'potion') return '#ffffff';
  if (item.relic) return RELIC_COLORS[item.relic];
  if (item.type === 'gear' && RELIC_HOOK.glyph && RELIC_HOOK.glyph(item)) return RELIC_COLORS.glyph;
  return RARITY[item.rarity].color;
}

export const upgMult = (item) => 1 + (item.upg || 0) * 0.1;

/** All stat contributions of an item as [stat, value] pairs (excluding base dmg/armor). */
export function itemStats(item) {
  const out = [];
  if (item.type !== 'gear') return out;
  const am = 1 + (item.upg || 0) * 0.04;
  for (const a of item.affixes) out.push([a.s, Math.round(a.v * (a.implicit ? 1 : am) * 10) / 10]);
  for (const g of item.gems) for (const s of gemStats(g.gem, g.tier, item.slot)) out.push(s);
  for (const s of legendaryStats(item)) out.push(s);
  if (RELIC_HOOK.stats && (item.relic || item.gems.length)) for (const s of RELIC_HOOK.stats(item)) out.push(s);
  return out;
}

export function itemDmg(item) {
  const m = upgMult(item);
  return [Math.round(item.dmg[0] * m), Math.round(item.dmg[1] * m)];
}
export function itemArmor(item) { return Math.round((item.armor || 0) * upgMult(item)); }

export function itemValue(item) {
  if (item.type === 'gem') return GEMS[item.gem].sigil ? Math.round(goldPile(depthLevelOf(item.tier * 24 + 12)) * 8) : Math.round((GEMS[item.gem].special ? 400 : 60) * Math.pow(2.6, item.tier));
  const base = 12 * Math.pow(1.06, item.ilvl) * [1, 2.5, 6, 15, 40, 100, 250][item.rarity] * (item.relic ? { heir: 2.5, cov: 2 }[item.relic] : RELIC_HOOK.glyph && RELIC_HOOK.glyph(item) ? 60 : 1);
  return Math.round(base * (1 + item.affixes.length * 0.15) * (1 + item.sockets * 0.2) * (1 + (item.upg || 0) * 0.3));
}

/** A gold pile at monster level `lvl`. Prices grow ~1.06x a level (items, upgrades, sockets, gambling), so past level ~85
 *  piles follow the same curve (1.5 x 1.06^level, a Normal item's price) instead of the old straight line, which left
 *  late-game heroes unable to afford anything. goldScale: how much richer than the line (every gold source uses it). */
export const goldPile = (lvl) => Math.max(3 + lvl * 2.2, 1.5 * Math.pow(1.06, lvl));
export const goldScale = (lvl) => goldPile(lvl) / (3 + lvl * 2.2);

export function upgradeCost(item) { return Math.round(60 * Math.pow(1.06, item.ilvl) * Math.pow(1.7, item.upg || 0) * (1 + item.rarity * 0.5)); }
export function socketCost(item) { return Math.round(150 * Math.pow(1.05, item.ilvl) * Math.pow(2, item.sockets) * (1 + item.rarity * 0.3)); }
export function enchantCost(item, add) { return Math.round((add ? 400 : 180) * Math.pow(1.055, item.ilvl) * (1 + item.rarity * 0.6)); }
export function unsocketCost(item) { return Math.round(50 * Math.pow(1.04, item.ilvl)); }

export function rerollAffixes(item) {
  const keep = item.affixes.filter((a) => a.implicit);
  const perks = item.affixes.filter((a) => a.perk).length;
  const n = item.affixes.length - keep.length - perks;
  item.affixes = keep;
  rollAffixes(item, Math.max(1, n));
  rollAffixes(item, perks, true);
}
export function addAffix(item) {
  const R = RARITY[item.rarity];
  const n = item.affixes.filter((a) => !a.implicit).length;
  if (n >= R.affixes[1] + 1) return false;
  rollAffixes(item, 1);
  return true;
}

export function statLabel(s, v, classTrees) {
  const a = AFFIX_BY_STAT[s];
  const special = {
    extraProj: `+${v} Projectile${v > 1 ? 's' : ''}`, echoChance: `${v}% chance to Echo-cast skills`, splitChance: `${v}% chance for projectiles to split`,
    orbitOnCast: `${v}% chance on cast to spawn an orbiting orb`, novaOnCast: `${v}% chance on cast to release a nova`,
    chainPlus: `+${v} Chain / Bounce`, pierce: `+${v} Pierce`, homing: 'Projectiles seek enemies', lifePct: `${v > 0 ? '+' : ''}${v}% Maximum Life`,
    summonPct: `+${v}% Summon Damage & Life`,
  };
  if (special[s]) return special[s];
  if (!a) return `${s}: ${v}`;
  let t = a.t.replace('{v}', v);
  if (classTrees) t = t.replace('{tree0}', classTrees[0]).replace('{tree1}', classTrees[1]).replace('{tree2}', classTrees[2]).replace('{tree3}', classTrees[3] || classTrees[0]);
  return t;
}

export function potionItem(kind) {
  const P = {
    hp: { name: 'Healing Potion', color: 'red' }, mp: { name: 'Mana Potion', color: 'blue' },
    rejuv: { name: 'Rejuvenation Potion', color: 'purple' }, fury: { name: 'Elixir of Fury', color: 'orange' },
  }[kind];
  return { uid: newUid(), type: 'potion', kind, name: P.name, color: P.color };
}
export const POTION_PRICE = { hp: 25, mp: 25, rejuv: 120, fury: 200 };
export const POTION_INFO = {
  hp: 'Restores 45% Life over 2 seconds.',
  mp: 'Restores 50% Mana over 2 seconds.',
  rejuv: 'Instantly restores 35% Life and Mana.',
  fury: '+30% Damage and Attack Speed for 15 seconds.',
};
