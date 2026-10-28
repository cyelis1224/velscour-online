// Heirlooms, Covenants and Glyphwords: named items in the spirit of Diablo II's uniques, sets and runewords, under
// their own names. They scale with item level like all gear here (a 500-depth game), so a find stays useful.
// - Heirloom (HEIRLOOMS): a fixed name, slot and set of stat lines, and a power; two sockets. It drops about as often
//   as a Legendary and is worth about as much (~13.5 item levels over a Common, tools/tests/relic_balance.js).
// - Covenant (COVENANTS): six sets of five pieces. A piece alone is worth about an Epic (~8 levels); wearing 2/3/4/5
//   pieces of one set adds a line each, then the set's power: a whole set scores about like five Mythics. The bonuses
//   scale with the lowest-level piece worn.
// - Glyphword (GLYPHWORDS): Sigil Stones (data/items.js) set in the right order in a plain (Common) item with exactly
//   that many sockets. It keeps the stones' own stats and adds lines and (from three stones) a power. Recognised live
//   (glyphOf), so prying the stones out makes it plain again.
// Powers use the legendary flags the engine already runs (game/player.js, game/combat.js) and procs (game/relicprocs.js).
import { chance, pick, clamp } from '../core/util.js';
import { rollItem, affixValue, AFFIX_BY_STAT, GEMS, SIGILS, RELIC_HOOK, powerLevel, legendaryScale, LEGENDARY } from './items.js';

// ---------------------------------------------------------------- line values
const MYTHIC = 5;
/** Line strength per kind, measured in item levels by tools/tests/relic_balance.js (a Heirloom about a Legendary to a
 *  Mythic, a Covenant piece about an Epic, a full set's bonuses a little under five Mythics' worth). */
export const TUNE = { heir: 0.45, cov: 0.55, set: 0.9, glyph: 0.55 };
/** A stat line of k core lines' worth at item level ilvl (a Mythic's numbers: data/items.js affixValue). */
export function lineValue(s, ilvl, k) {
  const a = AFFIX_BY_STAT[s];
  if (!a) return k;
  if (a.sc === 0) return Math.max(1, Math.round(a.max * Math.min(1, k)));
  const v = affixValue(a, ilvl, MYTHIC, 0.7) * k;
  return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}
/** A power's fixed stats grow with the item's power level like a legendary power's (15% early, full at 90). */
// The legendary flags it turns on bring their own stats too (Wraithwalk's speed, Midas Touch's gold find...).
const powerStats = (P, pl) => [...(P.stats || []), ...(P.legs || []).flatMap((l) => (LEGENDARY[l] && LEGENDARY[l].stats) || [])]
  .map(([s, v]) => [s, ['extraProj', 'chainPlus', 'pierce', 'skillsAll'].includes(s) ? v : Math.round(v * legendaryScale(pl))]);

// ---------------------------------------------------------------- powers
// legs: legendary flags it turns on; stats: [stat, value at full strength]; procs: {on: hit|kill|cast|hurt, chance or
// every, fx, el, mult (of the hit's damage), r}.
export const POWERS = {
  verdict: { name: 'Verdict', desc: 'Every 5th hit calls down a pillar of judgment for 300% of the hit as Holy damage and stuns.', procs: [{ on: 'hit', every: 5, fx: 'pillar', el: 'holy', mult: 3, r: 1.6 }] },
  kindled: { name: 'Kindled Path', desc: 'You leave burning ground; hits have a 15% chance to drop a meteor for 150% of the hit.', legs: ['inferno'], procs: [{ on: 'hit', chance: 0.15, fx: 'meteor', el: 'fire', mult: 1.5, r: 1.8 }] },
  widow: { name: "Widow's Fan", desc: '+{0}% chance for projectiles to split; +1 Pierce.', stats: [['splitChance', 40], ['pierce', 1]] },
  hush: { name: 'The Long Hush', desc: 'Hits chill and may freeze; casts have a 10% chance to burst a frost nova round you for 120% of your last hit.', legs: ['frostbite'], procs: [{ on: 'cast', chance: 0.1, fx: 'nova', el: 'cold', mult: 1.2, r: 3.2 }] },
  gravecall: { name: 'Gravecall', desc: 'Your summons deal +{0}% damage and have +{0}% life; your kills heal you 1%.', stats: [['summonPct', 70]], procs: [{ on: 'kill', chance: 1, fx: 'heal', mult: 0.01 }] },
  stormbrand: { name: 'Stormbrand', desc: 'Hits may call lightning; 20% chance to arc to four foes for 80% of the hit.', legs: ['thunder'], procs: [{ on: 'hit', chance: 0.2, fx: 'chain', el: 'light', mult: 0.8, r: 6 }] },
  butcher: { name: "Butcher's Due", desc: 'Kills explode for 35% of their life; +4% damage for every 10% of life missing.', legs: ['bloodbath', 'berserk'] },
  starwright: { name: 'Starwright', desc: '{0}% chance to Echo-cast; casts have a 10% chance to drop five stars on your target.', stats: [['echoChance', 20]], procs: [{ on: 'cast', chance: 0.1, fx: 'stars', el: 'arcane', mult: 1, r: 1.2 }] },
  dawnward: { name: 'Dawnward', desc: 'Once every 90 seconds, survive a killing blow. {0}% damage reduction.', legs: ['phoenix'], stats: [['reduce', 6]] },
  maiden: { name: 'Thornhold', desc: 'Attackers take 150% of the damage they deal.', legs: ['thorns'] },
  deepeye: { name: 'Eye of the Deep', desc: '{0}% chance on cast to release a nova of the skill\'s element.', stats: [['novaOnCast', 20]] },
  lantern: { name: 'Lanternheart', desc: 'Hits have an 8% chance to heal you for 2% of your life.', procs: [{ on: 'hit', chance: 0.08, fx: 'heal', mult: 0.02 }] },
  ninefold: { name: 'Ninefold', desc: '+1 to All Skills.', stats: [['skillsAll', 1]] },
  packleader: { name: 'Packleader', desc: 'Summons +{0}% damage and life; +{1}% movement speed.', stats: [['summonPct', 40], ['moveSpeed', 10]] },
  ashveil: { name: 'Veil of Ash', desc: 'You leave a trail of burning ground.', legs: ['inferno'] },
  resolve: { name: 'Grim Resolve', desc: '{0}% damage reduction.', stats: [['reduce', 8]] },
  martyr: { name: 'Martyr', desc: 'When struck, 12% chance to release a holy nova for 150% of your last hit.', procs: [{ on: 'hurt', chance: 0.12, fx: 'nova', el: 'holy', mult: 1.5, r: 3 }] },
  nightmantle: { name: 'Nightmantle', desc: '+{0}% movement speed; you slip past monsters.', legs: ['wraith'] },
  psalm: { name: 'Iron Psalm', desc: '+{0}% block chance and {1}% damage reduction.', stats: [['block', 10], ['reduce', 5]] },
  choir: { name: 'Choir', desc: '15% chance on cast to refund the mana; +{0}% area of effect.', legs: ['surge'], stats: [['areaPct', 20]] },
  hangman: { name: "Hangman's Knot", desc: '+{0}% critical chance and +{1}% critical damage.', legs: ['crit'] },
  spark: { name: 'Sparkfingers', desc: 'Hits have a 12% chance to arc to four foes for 80% of the hit.', procs: [{ on: 'hit', chance: 0.12, fx: 'chain', el: 'light', mult: 0.8, r: 6 }] },
  greed: { name: 'Gravedigger', desc: '+{0}% gold find. Kills sometimes burst into coins.', legs: ['greed'] },
  cinder: { name: 'Cinderclaws', desc: 'Hits have a 12% chance to drop a meteor for 150% of the hit.', procs: [{ on: 'hit', chance: 0.12, fx: 'meteor', el: 'fire', mult: 1.5, r: 1.8 }] },
  wanderer: { name: 'Long Road', desc: '+{0}% movement speed and {1}% damage reduction.', stats: [['moveSpeed', 15], ['reduce', 4]] },
  stoneroot: { name: 'Stoneroot', desc: '+{0}% block chance.', stats: [['block', 8]] },
  bloodmarch: { name: 'Bloodmarch', desc: '+{0}% Life Steal. Kills heal 2% of life.', legs: ['vamp'] },
  pilgrim: { name: 'Pilgrim', desc: '+{0}% experience.', stats: [['xpPct', 10]] },
  strider: { name: 'Stormstrider', desc: 'Hits have an 8% chance to arc to four foes for 80% of the hit.', procs: [{ on: 'hit', chance: 0.08, fx: 'chain', el: 'light', mult: 0.8, r: 6 }] },
  unbroken: { name: 'Unbroken', desc: 'Once every 90 seconds, survive a killing blow.', legs: ['phoenix'] },
  echo: { name: 'Echo Loop', desc: '{0}% chance to Echo-cast skills.', stats: [['echoChance', 15]] },
  hollowking: { name: 'Hollow King', desc: '+{0}% damage to bosses.', stats: [['bossDmg', 30]] },
  wyrm: { name: 'Wyrmcoil', desc: '+1 projectile to all projectile skills.', stats: [['extraProj', 1]] },
  // Unbound Heirlooms (Velscour Unbound's spoils; game/unbound.js, docs/ENDGAME.md)
  demonlord: { name: 'Demon Lord', desc: '+{0} to All Skills and +{1}% damage to bosses; a Pit Demon of the Legion climbs out of a hellgate to fight beside you.', stats: [['skillsAll', 2], ['bossDmg', 25]], procs: [{ on: 'hit', chance: 1, fx: 'demon' }, { on: 'cast', chance: 1, fx: 'demon' }, { on: 'hurt', chance: 1, fx: 'demon' }] },
  abyssal_edge: { name: 'Void Rift', desc: 'Hits have a 15% chance to tear open a void rift that bursts for 200% of the hit as Shadow damage.', procs: [{ on: 'hit', chance: 0.15, fx: 'void', el: 'shadow', mult: 2, r: 2.2 }] },
  unbound_mantle: { name: 'Unbound', desc: '{0}% damage reduction; the dark of the Abyss holds no dread for you.', legs: ['dreadless'], stats: [['reduce', 12]] },
  pit_seal: { name: 'Seal of the Pit', desc: '+{0} Pierce and +{1}% critical damage; every demon you slay heals you 2%.', stats: [['pierce', 1], ['critDmg', 20]], procs: [{ on: 'kill', chance: 1, fx: 'heal', mult: 0.02, only: 'demon' }] },
  abyss_heart: { name: 'Heart of the Abyss', desc: '+{0}% damage; casts have a 10% chance to drop three meteors on your target for 150% of your last hit.', stats: [['dmgPct', 15]], procs: [{ on: 'cast', chance: 0.1, fx: 'stars', n: 3, el: 'fire', mult: 1.5, r: 1.6 }] },
  // Covenant set powers
  pyre: { name: 'Pyre of Vows', desc: 'Killing blows leave consecrated fire for 4 s: foes in it take Holy damage and 25% more damage.', procs: [{ on: 'kill', chance: 1, fx: 'consecrate', el: 'holy', mult: 0.25, r: 2 }] },
  ninthstar: { name: 'The Ninth Star', desc: 'Casts have a 15% chance to call a falling star on your target for 250% of your last hit.', procs: [{ on: 'cast', chance: 0.15, fx: 'meteor', el: 'arcane', mult: 2.5, r: 2 }] },
  gravetithe: { name: 'Grave Tithe', desc: 'Summons +{0}% damage and life; kills heal you 2%.', legs: ['legion'], stats: [['summonPct', 30]], procs: [{ on: 'kill', chance: 1, fx: 'heal', mult: 0.02 }] },
  gale: { name: 'Gale', desc: '+1 projectile; +{0}% chance for projectiles to split.', stats: [['extraProj', 1], ['splitChance', 30]] },
  herrington: { name: 'Herrington Stands', desc: 'Survive a killing blow every 90 s; attackers take 150% of the damage they deal.', legs: ['phoenix', 'thorns'] },
  midas: { name: 'Cutpurse Fortune', desc: 'Kills sometimes burst into coins; +{0}% magic find.', legs: ['greed'], stats: [['magicFind', 60]] },
  // Glyphword powers
  ignite: { name: 'Kindle', desc: 'Hits have a 10% chance to drop a meteor for 120% of the hit.', procs: [{ on: 'hit', chance: 0.1, fx: 'meteor', el: 'fire', mult: 1.2, r: 1.6 }] },
  vow: { name: 'Ironvow', desc: 'Attackers take 150% of the damage they deal.', legs: ['thorns'] },
  gravesong: { name: 'Gravesong', desc: 'Your summons deal +{0}% damage and have +{0}% life.', legs: ['legion'] },
  stormcall: { name: 'Stormcall', desc: 'Hits may call lightning; 15% chance to arc to four foes.', legs: ['thunder'], procs: [{ on: 'hit', chance: 0.15, fx: 'chain', el: 'light', mult: 0.8, r: 6 }] },
  tide: { name: 'Tidecaller', desc: 'Hits chill; 10% chance to freeze solid.', legs: ['frostbite'] },
  bell: { name: 'Mourning Bell', desc: 'Every 6th hit drops a spinning holy hammer.', legs: ['hammer'] },
  starfall: { name: 'Starfall', desc: 'Spells have a 12% chance to drop five stars round the target, 120% of your last hit each.', procs: [{ on: 'cast', chance: 0.12, fx: 'stars', el: 'arcane', mult: 1.2, r: 1.2 }] },
  sunder: { name: 'Sunder', desc: '+{0}% critical chance and +{1}% critical damage.', legs: ['crit'] },
  veil: { name: 'Veilbreaker', desc: '{0}% chance to Echo-cast skills.', legs: ['echo'] },
  crownless: { name: 'Crownless', desc: '15% chance on cast to refund the mana.', legs: ['surge'] },
  litany: { name: 'Ember Litany', desc: 'You leave burning ground; casts have a 10% chance to burst fire round you.', legs: ['inferno'], procs: [{ on: 'cast', chance: 0.1, fx: 'nova', el: 'fire', mult: 1.2, r: 3 }] },
  lastlight: { name: 'Last Light', desc: 'Survive a killing blow every 90 s; {0}% damage reduction.', legs: ['phoenix'], stats: [['reduce', 6]] },
  writ: { name: 'Abyssal Writ', desc: '{0}% chance on cast to release a nova; {1}% chance to Echo-cast.', stats: [['novaOnCast', 25], ['echoChance', 15]] },
  skysunder: { name: 'Sky-Sunder', desc: 'When struck, 15% chance to release a holy nova for 200% of your last hit; {0}% damage reduction.', stats: [['reduce', 8]], procs: [{ on: 'hurt', chance: 0.15, fx: 'nova', el: 'holy', mult: 2, r: 3.2 }] },
  herald: { name: 'Herald of Ruin', desc: '+{0}% area of effect; kills explode for 35% of their life.', legs: ['bloodbath'], stats: [['areaPct', 30]] },
};

// ---------------------------------------------------------------- Heirlooms
// lines: [stat, k] (k core lines' worth; heirlooms sum to about 4.5); minIlvl: first item level it can drop at.
// unbound: only Velscour Unbound drops it (makeHeirloom(ilvl, { unbound: true }); crown: only by its id), never maybeRelic.
export const HEIRLOOMS = [
  { id: 'verdict', name: "Grandsire's Verdict", slot: 'weapon', base: 'mace', minIlvl: 20, power: 'verdict', lines: [['dmgPct', 1], ['holyPct', 1], ['critDmg', 0.9], ['lifeSteal', 0.8], ['str', 0.8]], flavor: 'Old Aldous never lost an argument. He only ever needed one swing.' },
  { id: 'emberwake', name: 'Emberwake', slot: 'weapon', base: 'sword', minIlvl: 20, power: 'kindled', lines: [['firePct', 1], ['dmgPct', 1], ['atkSpeed', 0.9], ['critChance', 0.8]], flavor: 'Forged in a burning house, and it never forgot.' },
  { id: 'widow', name: "Widow's Reach", slot: 'weapon', base: 'bow', minIlvl: 20, power: 'widow', lines: [['dmgPct', 1], ['poisonPct', 1], ['projSpeed', 0.8], ['atkSpeed', 0.9]], flavor: 'Strung with a widow\'s hair. She aimed well.' },
  { id: 'hush', name: 'The Long Hush', slot: 'weapon', base: 'staff', minIlvl: 60, power: 'hush', lines: [['castSpeed', 1], ['coldPct', 1], ['mana', 0.9], ['cdr', 0.8]], flavor: 'Winter does not argue. It waits.' },
  { id: 'gravecaller', name: "Gravecaller's Wand", slot: 'weapon', base: 'wand', minIlvl: 60, power: 'gravecall', lines: [['shadowPct', 1], ['castSpeed', 0.8], ['mana', 0.8], ['int', 0.9]], flavor: 'Every name it calls, answers.' },
  { id: 'stormbrand', name: 'Stormbrand', slot: 'weapon', base: 'spear', minIlvl: 60, power: 'stormbrand', lines: [['lightPct', 1], ['dmgPct', 0.9], ['atkSpeed', 0.8], ['dex', 0.8]], flavor: 'Struck nine times. It liked it.' },
  { id: 'butcher', name: "Butcher's Oath", slot: 'weapon', base: 'axe', minIlvl: 120, power: 'butcher', lines: [['physPct', 1], ['dmgPct', 1], ['critDmg', 0.9], ['life', 0.8]], flavor: 'Sworn on a block, sealed in a bucket.' },
  { id: 'starwright', name: "Starwright's Lute", slot: 'weapon', base: 'lute', minIlvl: 120, power: 'starwright', lines: [['arcanePct', 1], ['castSpeed', 0.8], ['critChance', 0.8], ['int', 0.8]], flavor: 'Tuned to a sky no one else can hear.' },
  { id: 'aegis', name: 'Aegis of the Last Dawn', slot: 'offhand', base: 'shield', minIlvl: 20, power: 'dawnward', lines: [['armorPct', 1], ['life', 1], ['resAll', 0.9], ['block', 0.8]], flavor: 'Held at the gate until the sun came up. It came up.' },
  { id: 'thornhold', name: 'Thornhold', slot: 'offhand', base: 'shield', minIlvl: 60, power: 'maiden', lines: [['armor', 1], ['thorns', 1], ['life', 0.9], ['resAll', 0.8]], flavor: 'Hug it. Go on.' },
  { id: 'deepeye', name: 'Eye of the Deep', slot: 'offhand', base: 'orb', minIlvl: 60, power: 'deepeye', lines: [['dmgPct', 1], ['castSpeed', 0.9], ['mana', 0.9], ['cdr', 0.8]], flavor: 'It has seen the bottom. It would rather not talk about it.' },
  { id: 'lanternheart', name: 'Lanternheart', slot: 'offhand', base: 'orb', minIlvl: 120, power: 'lantern', lines: [['holyPct', 1], ['lifeRegen', 0.9], ['mana', 0.9], ['int', 0.8]], flavor: 'A small light, kept stubbornly.' },
  { id: 'ninefold', name: 'The Ninefold Crown', slot: 'head', minIlvl: 120, power: 'ninefold', lines: [['int', 0.9], ['life', 0.9], ['cdr', 0.8], ['resAll', 0.8]], flavor: 'Nine kings wore it. Nine kings fell. It keeps count.' },
  { id: 'wolfskull', name: 'Wolfskull Helm', slot: 'head', minIlvl: 20, power: 'packleader', lines: [['life', 1], ['critChance', 0.9], ['str', 0.9], ['lifeSteal', 0.8]], flavor: 'The pack follows the skull, not the head inside it.' },
  { id: 'ashveil', name: 'Veil of Ash', slot: 'head', minIlvl: 60, power: 'ashveil', lines: [['resAll', 1], ['armorPct', 0.9], ['life', 0.9], ['magicFind', 0.8]], flavor: 'What is left after the pyre, worn proudly.' },
  { id: 'grimward', name: 'Grimward Helm', slot: 'head', minIlvl: 20, power: 'resolve', lines: [['armor', 1], ['reduce', 0.8], ['vit', 0.9], ['life', 0.9]], flavor: 'No smile has ever fit under it.' },
  { id: 'martyr', name: "Martyr's Coat", slot: 'body', minIlvl: 20, power: 'martyr', lines: [['life', 1], ['lifePct', 0.9], ['resAll', 0.9], ['armorPct', 0.8]], flavor: 'Every hole in it is a story. Every story ends the same.' },
  { id: 'nightmantle', name: 'Nightmantle', slot: 'body', minIlvl: 60, power: 'nightmantle', lines: [['shadowPct', 1], ['dex', 1], ['critChance', 0.8], ['moveSpeed', 0.8]], flavor: 'Woven from the hour between the last lamp and the first bird.' },
  { id: 'psalm', name: 'The Iron Psalm', slot: 'body', minIlvl: 120, power: 'psalm', lines: [['armor', 1], ['armorPct', 1], ['reduce', 0.9], ['vit', 0.8]], flavor: 'Hammered out one verse at a time.' },
  { id: 'choir', name: 'Choirrobe', slot: 'body', minIlvl: 60, power: 'choir', lines: [['mana', 1], ['castSpeed', 0.9], ['int', 0.9], ['resAll', 0.8]], flavor: 'A hundred voices stitched in silver thread.' },
  { id: 'hangman', name: "Hangman's Grip", slot: 'hands', minIlvl: 60, power: 'hangman', lines: [['critDmg', 1], ['atkSpeed', 0.9], ['str', 0.9], ['lifeSteal', 0.8]], flavor: 'Firm. Final.' },
  { id: 'spark', name: 'Sparkfingers', slot: 'hands', minIlvl: 20, power: 'spark', lines: [['castSpeed', 1], ['lightPct', 1], ['critChance', 0.8], ['mana', 0.8]], flavor: 'Do not shake hands.' },
  { id: 'gravedigger', name: "Gravedigger's Mitts", slot: 'hands', minIlvl: 20, power: 'greed', lines: [['life', 1], ['armor', 0.9], ['goldFind', 0.9], ['magicFind', 0.8]], flavor: 'Dirt under the nails, gold in the pockets.' },
  { id: 'cinderclaws', name: 'Cinderclaws', slot: 'hands', minIlvl: 120, power: 'cinder', lines: [['firePct', 1], ['atkSpeed', 0.9], ['dex', 0.9], ['critChance', 0.8]], flavor: 'Still warm. Always warm.' },
  { id: 'wanderer', name: "Wanderer's Greaves", slot: 'legs', minIlvl: 20, power: 'wanderer', lines: [['moveSpeed', 1], ['life', 1], ['resAll', 0.9], ['vit', 0.8]], flavor: 'They know the way. You just walk.' },
  { id: 'stoneroot', name: 'Stoneroot Legplates', slot: 'legs', minIlvl: 60, power: 'stoneroot', lines: [['armorPct', 1], ['armor', 1], ['reduce', 0.9], ['resAll', 0.8]], flavor: 'Plant your feet. The mountain did.' },
  { id: 'bloodmarch', name: 'Bloodmarch Leggings', slot: 'legs', minIlvl: 120, power: 'bloodmarch', lines: [['life', 1], ['lifeRegen', 1], ['str', 0.9], ['lifePct', 0.8]], flavor: 'Every step a little redder.' },
  { id: 'cindersole', name: 'Cindersole', slot: 'feet', minIlvl: 20, power: 'ashveil', lines: [['moveSpeed', 1], ['resFire', 0.9], ['life', 0.9], ['dex', 0.8]], flavor: 'Leave a trail. Make them follow it.' },
  { id: 'ghoststep', name: 'Ghoststep', slot: 'feet', minIlvl: 60, power: 'nightmantle', lines: [['moveSpeed', 1], ['dex', 1], ['resAll', 0.8], ['magicFind', 0.8]], flavor: 'The floorboards never creak.' },
  { id: 'pilgrim', name: "Pilgrim's Road", slot: 'feet', minIlvl: 20, power: 'pilgrim', lines: [['moveSpeed', 1], ['life', 1], ['lifeRegen', 0.9], ['xpPct', 0.8]], flavor: 'Worn thin on the road down. Never once on the road back.' },
  { id: 'stormstrider', name: 'Stormstriders', slot: 'feet', minIlvl: 120, power: 'strider', lines: [['moveSpeed', 1], ['atkSpeed', 0.9], ['resLight', 1], ['dex', 0.8]], flavor: 'Thunder walks behind you, politely.' },
  { id: 'unbroken', name: 'Band of the Unbroken', slot: 'ring', minIlvl: 60, power: 'unbroken', lines: [['life', 1], ['resAll', 1], ['lifeSteal', 0.8]], flavor: 'It has been dropped in three rivers. It came back every time.' },
  { id: 'midas', name: 'Midas Coil', slot: 'ring', minIlvl: 20, power: 'greed', lines: [['goldFind', 1], ['magicFind', 1], ['dmgPct', 0.8]], flavor: 'Heavier than it looks. So is everything it touches.' },
  { id: 'echoloop', name: 'Echo Loop', slot: 'ring', minIlvl: 60, power: 'echo', lines: [['castSpeed', 1], ['dmgPct', 1], ['mana', 0.8]], flavor: 'Say it once. It says it again.' },
  { id: 'hollowking', name: 'Seal of the Hollow King', slot: 'ring', minIlvl: 120, power: 'hollowking', lines: [['dmgPct', 1], ['critChance', 1], ['critDmg', 0.8]], flavor: 'His seal outlived his kingdom, and him.' },
  { id: 'wyrmcoil', name: 'Wyrmcoil', slot: 'ring', minIlvl: 120, power: 'wyrm', lines: [['firePct', 1], ['coldPct', 1], ['lightPct', 0.8]], flavor: 'Three heads, one appetite.' },
  { id: 'crown_demon', name: 'Crown of the Demon Lord', slot: 'head', minIlvl: 250, power: 'demonlord', unbound: true, crown: true, lines: [['life', 1], ['allAttr', 1], ['cdr', 0.9], ['resAll', 0.9], ['critChance', 0.8]], flavor: 'He wore it for a thousand years. It has not decided whether you are the next.' },
  { id: 'abyssal_edge', name: 'The Abyssal Edge', slot: 'weapon', base: 'sword', minIlvl: 250, power: 'abyssal_edge', unbound: true, lines: [['shadowPct', 1], ['dmgPct', 1], ['critDmg', 1], ['atkSpeed', 0.9], ['lifeSteal', 0.8]], flavor: 'It does not cut. It opens.' },
  { id: 'mantle_unbound', name: 'Mantle of the Unbound', slot: 'body', minIlvl: 250, power: 'unbound_mantle', unbound: true, lines: [['life', 1], ['lifePct', 1], ['resAll', 1], ['armorPct', 0.9], ['reduce', 0.8]], flavor: 'Stitched from the chains that held him. They hold nothing now.' },
  { id: 'seal_of_the_pit', name: 'Seal of the Pit', slot: 'ring', minIlvl: 250, power: 'pit_seal', unbound: true, lines: [['dmgPct', 1], ['critChance', 1], ['firePct', 0.9]], flavor: 'The Legion answers to whoever wears it. For now they are only watching.' },
  { id: 'heart_of_the_abyss', name: 'Heart of the Abyss', slot: 'offhand', base: 'orb', minIlvl: 250, power: 'abyss_heart', unbound: true, lines: [['dmgPct', 1], ['castSpeed', 1], ['shadowPct', 0.9], ['mana', 0.9], ['cdr', 0.8]], flavor: 'The shard that did not break. It still beats, slowly, out of time with yours.' },
];
export const HEIRLOOM_BY_ID = Object.fromEntries(HEIRLOOMS.map((h) => [h.id, h]));

// ---------------------------------------------------------------- Covenants
// Each piece: three lines at 0.85; bonus lines at 1.0 each for 2, 3 and 4 pieces worn, the power at 5.
export const COVENANTS = [
  { id: 'templar', name: 'Vows of the Ashen Templar', power: 'pyre', bonus: [['holyPct', 1], ['reduce', 1], ['lifeSteal', 1]], pieces: [
    { id: 'templar_head', name: "Ashen Templar's Visage", slot: 'head', lines: [['life', 0.85], ['resAll', 0.85], ['str', 0.85]] },
    { id: 'templar_body', name: "Ashen Templar's Hauberk", slot: 'body', lines: [['life', 0.85], ['resAll', 0.85], ['armorPct', 0.85]] },
    { id: 'templar_hands', name: "Ashen Templar's Grips", slot: 'hands', lines: [['atkSpeed', 0.85], ['str', 0.85], ['critChance', 0.85]] },
    { id: 'templar_off', name: "Ashen Templar's Bulwark", slot: 'offhand', base: 'shield', lines: [['armorPct', 0.85], ['block', 0.85], ['life', 0.85]] },
    { id: 'templar_wpn', name: "Ashen Templar's Censer", slot: 'weapon', base: 'mace', lines: [['holyPct', 0.85], ['dmgPct', 0.85], ['critDmg', 0.85]] },
  ] },
  { id: 'ninthstar', name: 'Raiment of the Ninth Star', power: 'ninthstar', bonus: [['castSpeed', 1], ['arcanePct', 1], ['cdr', 1]], pieces: [
    { id: 'star_head', name: 'Ninth Star Circlet', slot: 'head', lines: [['int', 0.85], ['mana', 0.85], ['cdr', 0.85]] },
    { id: 'star_body', name: 'Ninth Star Robe', slot: 'body', lines: [['life', 0.85], ['int', 0.85], ['resAll', 0.85]] },
    { id: 'star_hands', name: 'Ninth Star Gloves', slot: 'hands', lines: [['castSpeed', 0.85], ['critChance', 0.85], ['mana', 0.85]] },
    { id: 'star_feet', name: 'Ninth Star Slippers', slot: 'feet', lines: [['moveSpeed', 0.85], ['int', 0.85], ['resAll', 0.85]] },
    { id: 'star_off', name: 'Ninth Star Orb', slot: 'offhand', base: 'orb', lines: [['dmgPct', 0.85], ['castSpeed', 0.85], ['arcanePct', 0.85]] },
  ] },
  { id: 'gravewright', name: "The Gravewright's Regalia", power: 'gravetithe', bonus: [['shadowPct', 1], ['life', 1], ['int', 1]], pieces: [
    { id: 'grave_head', name: "Gravewright's Crown", slot: 'head', lines: [['int', 0.85], ['life', 0.85], ['cdr', 0.85]] },
    { id: 'grave_body', name: "Gravewright's Shroud", slot: 'body', lines: [['life', 0.85], ['resAll', 0.85], ['vit', 0.85]] },
    { id: 'grave_legs', name: "Gravewright's Wraps", slot: 'legs', lines: [['life', 0.85], ['armor', 0.85], ['int', 0.85]] },
    { id: 'grave_hands', name: "Gravewright's Clutch", slot: 'hands', lines: [['castSpeed', 0.85], ['shadowPct', 0.85], ['mana', 0.85]] },
    { id: 'grave_wpn', name: "Gravewright's Bone Wand", slot: 'weapon', base: 'wand', lines: [['shadowPct', 0.85], ['castSpeed', 0.85], ['int', 0.85]] },
  ] },
  { id: 'galewalker', name: "Galewalker's Kit", power: 'gale', bonus: [['atkSpeed', 1], ['dex', 1], ['critDmg', 1]], pieces: [
    { id: 'gale_head', name: "Galewalker's Hood", slot: 'head', lines: [['dex', 0.85], ['critChance', 0.85], ['life', 0.85]] },
    { id: 'gale_body', name: "Galewalker's Jerkin", slot: 'body', lines: [['dex', 0.85], ['life', 0.85], ['resAll', 0.85]] },
    { id: 'gale_feet', name: "Galewalker's Boots", slot: 'feet', lines: [['moveSpeed', 0.85], ['dex', 0.85], ['resAll', 0.85]] },
    { id: 'gale_hands', name: "Galewalker's Bracers", slot: 'hands', lines: [['atkSpeed', 0.85], ['critDmg', 0.85], ['projSpeed', 0.85]] },
    { id: 'gale_wpn', name: "Galewalker's Longbow", slot: 'weapon', base: 'bow', lines: [['dmgPct', 0.85], ['physPct', 0.85], ['atkSpeed', 0.85]] },
  ] },
  { id: 'herrington', name: 'Bulwark of Old Herrington', power: 'herrington', bonus: [['armorPct', 1], ['resAll', 1], ['block', 1]], pieces: [
    { id: 'herr_head', name: "Old Herrington's Helm", slot: 'head', lines: [['armor', 0.85], ['life', 0.85], ['vit', 0.85]] },
    { id: 'herr_body', name: "Old Herrington's Plate", slot: 'body', lines: [['armor', 0.85], ['armorPct', 0.85], ['life', 0.85]] },
    { id: 'herr_legs', name: "Old Herrington's Greaves", slot: 'legs', lines: [['armor', 0.85], ['reduce', 0.85], ['resAll', 0.85]] },
    { id: 'herr_off', name: "Old Herrington's Wall", slot: 'offhand', base: 'shield', lines: [['block', 0.85], ['armorPct', 0.85], ['life', 0.85]] },
    { id: 'herr_feet', name: "Old Herrington's Sabatons", slot: 'feet', lines: [['armor', 0.85], ['life', 0.85], ['resAll', 0.85]] },
  ] },
  { id: 'cutpurse', name: 'Cutpurse Fortune', power: 'midas', bonus: [['goldFind', 1], ['magicFind', 1], ['moveSpeed', 1]], pieces: [
    { id: 'purse_head', name: "Cutpurse's Cap", slot: 'head', lines: [['magicFind', 0.85], ['dex', 0.85], ['life', 0.85]] },
    { id: 'purse_hands', name: "Cutpurse's Quick Hands", slot: 'hands', lines: [['atkSpeed', 0.85], ['goldFind', 0.85], ['dex', 0.85]] },
    { id: 'purse_feet', name: "Cutpurse's Soft Boots", slot: 'feet', lines: [['moveSpeed', 0.85], ['magicFind', 0.85], ['resAll', 0.85]] },
    { id: 'purse_ring1', name: "Cutpurse's Signet", slot: 'ring', lines: [['goldFind', 0.85], ['dmgPct', 0.85], ['critChance', 0.85]] },
    { id: 'purse_ring2', name: "Cutpurse's Loaded Band", slot: 'ring', lines: [['magicFind', 0.85], ['life', 0.85], ['critDmg', 0.85]] },
  ] },
];
export const COVENANT_BY_ID = Object.fromEntries(COVENANTS.map((s) => [s.id, s]));
export const PIECE_BY_ID = Object.fromEntries(COVENANTS.flatMap((s) => s.pieces.map((p) => [p.id, { ...p, set: s.id }])));

// ---------------------------------------------------------------- Glyphwords
// sig: Sigil ranks in socket order (0 Ash ... 19 Thane); slots: the bases that take it; lines at k each.
const S = Object.fromEntries(SIGILS.map((s, i) => [s.name, i]));
const R = (...names) => names.map((n) => S[n]);
export const GLYPHWORDS = [
  { id: 'kindle', name: 'Kindle', sig: R('Ash', 'Fen'), slots: ['weapon'], k: 0.8, lines: ['firePct', 'dmgPct'] },
  { id: 'hearthward', name: 'Hearthward', sig: R('Esk', 'Ash'), slots: ['body', 'offhand'], k: 0.8, lines: ['life', 'armorPct'] },
  { id: 'whisperstep', name: 'Whisperstep', sig: R('Dov', 'Bryn'), slots: ['feet', 'legs'], k: 0.8, lines: ['moveSpeed', 'dex'] },
  { id: 'lantern', name: 'Lantern', sig: R('Cael', 'Esk', 'Ash'), slots: ['head'], k: 0.85, lines: ['magicFind', 'life', 'resAll'], power: 'ignite' },
  { id: 'ironvow', name: 'Ironvow', sig: R('Gur', 'Esk', 'Fen'), slots: ['offhand', 'body'], k: 0.85, lines: ['block', 'armorPct', 'reduce'], power: 'vow' },
  { id: 'gravesong', name: 'Gravesong', sig: R('Mord', 'Dov', 'Esk'), slots: ['weapon'], k: 0.85, lines: ['shadowPct', 'castSpeed', 'lifeSteal'], power: 'gravesong' },
  { id: 'stormcall', name: 'Stormcall', sig: R('Cael', 'Hask', 'Ivo'), slots: ['weapon'], k: 0.85, lines: ['lightPct', 'atkSpeed', 'dmgPct'], power: 'stormcall' },
  { id: 'tidecaller', name: 'Tidecaller', sig: R('Bryn', 'Ivo', 'Lyr'), slots: ['weapon', 'offhand'], k: 0.85, lines: ['coldPct', 'castSpeed', 'mana'], power: 'tide' },
  { id: 'mourning', name: 'Mourning Bell', sig: R('Lyr', 'Mord', 'Gur', 'Hask'), slots: ['weapon'], k: 0.85, lines: ['holyPct', 'shadowPct', 'dmgPct', 'critChance'], power: 'bell' },
  { id: 'starfall', name: 'Starfall', sig: R('Ivo', 'Syl', 'Ash', 'Nath'), slots: ['weapon'], k: 0.85, lines: ['castSpeed', 'arcanePct', 'mana', 'cdr'], power: 'starfall', extra: [['skillsAll', 1]] },
  { id: 'sunder', name: 'Sunder', sig: R('Esk', 'Kesh', 'Gur', 'Orr'), slots: ['weapon'], k: 0.85, lines: ['physPct', 'critDmg', 'dmgPct', 'atkSpeed'], power: 'sunder' },
  { id: 'veilbreaker', name: 'Veilbreaker', sig: R('Nath', 'Kesh', 'Mord', 'Pell'), slots: ['weapon', 'head'], k: 0.85, lines: ['arcanePct', 'critDmg', 'cdr', 'int'], power: 'veil' },
  { id: 'crownless', name: 'Crownless', sig: R('Jorn', 'Ruv', 'Lyr'), slots: ['head'], k: 0.85, lines: ['allAttr', 'critChance', 'cdr'], power: 'crownless' },
  { id: 'litany', name: 'Ember Litany', sig: R('Ash', 'Orr', 'Kesh', 'Ash', 'Fen'), slots: ['body'], k: 0.95, lines: ['firePct', 'life', 'resAll', 'castSpeed'], power: 'litany' },
  { id: 'lastlight', name: 'Last Light', sig: R('Lyr', 'Quell', 'Syl', 'Pell', 'Nath'), slots: ['body', 'weapon'], k: 0.95, lines: ['lifePct', 'resAll', 'life', 'holyPct'], power: 'lastlight' },
  { id: 'herald', name: 'Herald of Ruin', sig: R('Pell', 'Orr', 'Mord', 'Syl'), slots: ['offhand', 'legs'], k: 0.85, lines: ['dmgPct', 'life', 'bloodPct', 'resAll'], power: 'herald' },
  { id: 'writ', name: 'Abyssal Writ', sig: R('Mord', 'Quell', 'Ruv', 'Syl', 'Thane', 'Nath'), slots: ['weapon'], k: 1, lines: ['dmgPct', 'critDmg', 'castSpeed', 'atkSpeed', 'critChance'], power: 'writ' },
  { id: 'skysunder', name: 'Sky-Sunder', sig: R('Syl', 'Thane', 'Kesh', 'Jorn', 'Quell', 'Ruv'), slots: ['body'], k: 1, lines: ['life', 'armorPct', 'resAll', 'lifePct', 'reduce'], power: 'skysunder' },
];
export const GLYPH_BY_ID = Object.fromEntries(GLYPHWORDS.map((g) => [g.id, g]));

/** The Glyphword an item spells right now (a plain item, sockets all filled with Sigils in a recipe's order), or null. */
export function glyphOf(it) {
  if (!it || it.type !== 'gear' || it.rarity !== 0 || it.relic === 'heir' || it.relic === 'cov' || !it.sockets || it.gems.length !== it.sockets) return null;
  if (!it.gems.every((g) => GEMS[g.gem] && GEMS[g.gem].sigil)) return null;
  const key = it.gems.map((g) => g.tier).join(',');
  return GLYPHWORDS.find((w) => w.slots.includes(it.slot) && w.sig.length === it.sockets && w.sig.join(',') === key) || null;
}

// ---------------------------------------------------------------- making them
const nameFor = (base) => base;
function shapeRelic(it, kind, id, name, lines, maxSock) {
  it.affixes = it.affixes.filter((a) => a.implicit);
  for (const [s, k] of lines) it.affixes.push({ s, v: lineValue(s, it.ilvl, k * TUNE[kind]), relic: true });
  delete it.legendary; delete it.title; delete it.pre; delete it.suf; delete it.rname; delete it.art; delete it.artCls;
  it.relic = kind; it.rid = id; it.uname = nameFor(name);
  it.maxSockets = maxSock;
  it.sockets = Math.min(it.sockets, maxSock);
  it.gems = it.gems.slice(0, it.sockets);
  return it;
}
/** A Heirloom at item level ilvl (one of id, or a random one that can drop for the slot at that level; null if none). */
export function makeHeirloom(ilvl, opts = {}) {
  const pool = HEIRLOOMS.filter((h) => (opts.id ? h.id === opts.id : (!opts.slot || h.slot === opts.slot) && h.minIlvl <= ilvl && !h.crown && !h.unbound === !opts.unbound));
  if (!pool.length) return null;
  const H = pick(pool);
  const it = rollItem(ilvl, { slot: H.slot, rarity: 4, base: H.base, generic: true });
  return shapeRelic(it, 'heir', H.id, H.name, H.lines, H.slot === 'ring' ? 1 : 2);
}
/** A Covenant piece (pieceId, or a random piece of setId / of any set). */
export function makeCovenant(ilvl, opts = {}) {
  const pool = Object.values(PIECE_BY_ID).filter((p) => (opts.pieceId ? p.id === opts.pieceId : !opts.setId || p.set === opts.setId) && (!opts.slot || p.slot === opts.slot));
  if (!pool.length) return null;
  const P = pick(pool);
  const it = rollItem(ilvl, { slot: P.slot, rarity: 3, base: P.base, generic: true });
  it.cset = P.set;
  return shapeRelic(it, 'cov', P.id, P.name, P.lines, P.slot === 'ring' ? 1 : 3);
}
/**
 * Maybe turn a fresh drop into a Heirloom or Covenant piece: a quarter of Legendary and Mythic drops and an eighth of
 * Epics become Heirlooms (when one exists for the slot at that level); one in twenty-five Rare-or-better drops becomes a
 * Covenant piece of its slot (boost: BOSS ROOMs and Velscour triple it).
 */
export function maybeRelic(it, boost = 1) {
  if (!it || it.type !== 'gear' || it.relic) return it;
  if (it.rarity >= 3 && it.ilvl >= 20 && chance((it.rarity >= 4 ? 0.25 : 0.12))) {
    const h = makeHeirloom(it.ilvl, { slot: it.slot });
    if (h) return h;
  }
  if (it.rarity >= 2 && it.ilvl >= 10 && chance(0.04 * boost)) {
    const c = makeCovenant(it.ilvl, { slot: it.slot });
    if (c) return c;
  }
  return it;
}

// ---------------------------------------------------------------- what they add to the hero
const POW = (it) => (it.relic === 'heir' ? HEIRLOOM_BY_ID[it.rid] && POWERS[HEIRLOOM_BY_ID[it.rid].power] : null);
/** Extra stats of one item (items.js itemStats calls this through RELIC_HOOK): a power's stats, a Glyphword's lines. */
export function relicItemStats(it) {
  const out = [];
  const pl = powerLevel(it.ilvl, 5);
  const P = POW(it);
  if (P) out.push(...powerStats(P, pl));
  const gw = glyphOf(it);
  if (gw) {
    for (const s of gw.lines) out.push([s, lineValue(s, it.ilvl, gw.k * TUNE.glyph)]);
    for (const e of gw.extra || []) out.push(e);
    if (gw.power) out.push(...powerStats(POWERS[gw.power], pl));
  }
  return out;
}
RELIC_HOOK.stats = relicItemStats;
RELIC_HOOK.glyph = glyphOf;

/** Covenant pieces worn per set, and the lowest item level among them: {setId: {n, ilvl}}. */
export function wornSets(equip) {
  const sets = {};
  const seen = new Set();
  for (const it of Object.values(equip || {})) {
    if (!it || it.relic !== 'cov' || !it.cset || seen.has(it.rid)) continue;
    seen.add(it.rid);
    const s = sets[it.cset] || (sets[it.cset] = { n: 0, ilvl: Infinity });
    s.n++; s.ilvl = Math.min(s.ilvl, it.ilvl);
  }
  return sets;
}
/** Everything worn relics add on top of item stats: {stats: [[stat, v]], legs: {flag: true}, procs: [...]}. */
export function relicBonuses(equip) {
  const stats = [], legs = {}, procs = [];
  const power = (P) => { if (!P) return; for (const l of P.legs || []) legs[l] = true; for (const pr of P.procs || []) procs.push({ ...pr, name: P.name }); };
  for (const it of Object.values(equip || {})) {
    if (!it) continue;
    power(POW(it));
    const gw = glyphOf(it);
    if (gw && gw.power) power(POWERS[gw.power]);
  }
  for (const [id, w] of Object.entries(wornSets(equip))) {
    const C = COVENANT_BY_ID[id];
    if (!C) continue;
    C.bonus.forEach(([s, k], i) => { if (w.n >= i + 2) stats.push([s, lineValue(s, w.ilvl, k * TUNE.set)]); });
    if (w.n >= 5) { const P = POWERS[C.power]; power(P); stats.push(...powerStats(P, powerLevel(w.ilvl, 3))); }
  }
  return { stats, legs, procs };
}
/** A power's text with its numbers at this item's level. */
export function powerText(P, pl) {
  const st = powerStats(P, pl);
  return P.desc.replace(/\{(\d)\}/g, (_, i) => (st[+i] ? String(st[+i][1]) : '?'));
}
/** The codex key of a relic item: 'h:<id>', 'c:<pieceId>' or 'g:<glyphId>' (null for anything else). */
export function codexKey(it) {
  if (!it || it.type !== 'gear') return null;
  if (it.relic === 'heir') return 'h:' + it.rid;
  if (it.relic === 'cov') return 'c:' + it.rid;
  const gw = glyphOf(it);
  return gw ? 'g:' + gw.id : null;
}
export const CODEX_TOTAL = { h: HEIRLOOMS.length, c: Object.keys(PIECE_BY_ID).length, g: GLYPHWORDS.length, s: SIGILS.length };
export { clamp };
