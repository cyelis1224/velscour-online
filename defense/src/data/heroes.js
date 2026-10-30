// The 64 named heroes you can draw from the rift: four per class. The Bastion Sixteen (cast.js) are the Legendary
// one of each class; the others are Rare, Epic and Mythic echoes. trait.mods are read by the battle sim (battle/sim.js).
import { CAST } from './cast.js';
import { RNG } from '../core/util.js';
import { ART } from '../core/assets.js';
import { ROWS2 } from './heroes2.js';

const T = (name, text, mods) => ({ name, text, mods });
// [cls, rarity, id, name, title, trait, flavor]
const ROWS = [
  ['paladin', 2, 'bram', 'Ser Bram Oakhelm', 'Shieldbearer of Millbrook', T('Oaken Guard', '+15% attack, and never stunned.', { atkP: 0.15, steadfast: 1 }), 'He held the Millbrook bridge with a door for a shield. The door is still there; so is Bram.'],
  ['paladin', 3, 'odessa', 'Dame Odessa Brightvale', 'The Lantern Knight', T('Kindled Faith', 'Dawnbreak charges 25% faster.', { skillCharge: 0.25 }), '"Light a lamp in the dark and the dark learns where you are. Good. Let it come."'],
  ['paladin', 4, 'corwin', null, null, T('The Sunward Wall', 'Never stunned; Dawnbreak stuns 60% longer; heroes within 2.6 tiles strike 8% harder.', { steadfast: 1, stunP: 0.6, auraAtk: 0.08 }), '"An oath is a wall you build inside yourself. Mine has not fallen yet."'],
  ['paladin', 5, 'aurelian', 'Saint Aurelian', 'The First Dawn', T('First Light', 'Heroes within 2.6 tiles strike 15% harder; +20% attack.', { auraAtk: 0.15, atkP: 0.2 }), 'The Dawn Order\'s founder, burned at the stake by Velscour\'s first cult. The rift remembers him whole.'],
  ['ranger', 2, 'tamsin', 'Tamsin Reedwhistle', 'Fen Tracker', T('Long Sight', '+0.4 range.', { range: 0.4 }), 'She can follow a heron\'s track across open water. Monsters are easier.'],
  ['ranger', 3, 'corvo', 'Corvo Blackfletch', 'The Crowkiller', T('Skyfall', '+40% damage to flyers.', { vsAir: 0.4 }), 'Maudlin will not stand downwind of him.'],
  ['ranger', 4, 'wren', null, null, T('The Tally', '+2% attack per kill this battle (up to 40%).', { killStack: 0.02 }), '"Forty-one. Forty-two. Commander, are you counting? Someone should be counting."'],
  ['ranger', 5, 'sylwen', 'Sylwen of the Last Grove', 'Huntress Eternal', T('Twin Shafts', 'Every shot strikes a second foe; +15% attack speed.', { multishot: 1, rateP: 0.15 }), 'The last elf of Ashgrove\'s old songs, made real by the rift for as long as the rift remembers her.'],
  ['wizard', 2, 'pell', 'Pell Cindercap', 'Apprentice of the Ember Chair', T('Cheap Tricks', 'Costs 3 less Valor.', { cost: -3 }), 'Ismene\'s apprentice for six weeks. Ismene does not remember his name.'],
  ['wizard', 3, 'harrowind', 'Magister Harrowind', 'The Stormwarden', T('Forked Flame', 'Fireballs burst 0.4 tiles wider.', { splash: 0.4 }), '"Fire, lightning: both are just impatience with a direction."'],
  ['wizard', 4, 'ismene', null, null, T('The Ember Chair', 'Burns what it hits for 35% attack a second for 3s.', { burn: 0.35 }), '"I do not \'set things on fire.\' I restore them to their most honest state."'],
  ['wizard', 5, 'azhar', 'Azhar the Sunforged', 'Keeper of the First Flame', T('Solar Crown', '+30% attack and splash; Meteor strikes twice.', { atkP: 0.3, splash: 0.4, skillTwice: 1 }), 'The wizard who carried fire out of the first dark. Every Ember Chair is a copy of his.'],
  ['necromancer', 2, 'gideon', 'Gideon Ashlocke', 'The Gravedigger\'s Son', T('Spare Bones', 'Raises one more skeleton.', { extraSummon: 1 }), 'He dug the graves. Then he learned to undig them.'],
  ['necromancer', 3, 'veyra', 'Lady Veyra Nightbloom', 'The Velvet Mortician', T('Last Rites', 'Each kill grants 1 Valor.', { killValor: 1 }), 'She dresses every corpse for a ball. Her skeletons dance beautifully.'],
  ['necromancer', 4, 'mortimer', null, null, T('Courteous Undertaker', 'Foes he kills rise as skeletons for you 20% of the time.', { raiseChance: 0.2 }), '"Thank you, Ellery. Thank you, Pim. Do mind the stairs."'],
  ['necromancer', 5, 'sallow', 'Master Ebon Sallow', 'The Unquiet Master', T('Grand Ossuary', 'Skeletons last twice as long and hit 50% harder; +20% attack.', { summonP: 1, atkP: 0.2 }), 'Mortimer\'s old teacher, whose tomb the rift broke open from below.'],
  ['barbarian', 2, 'hrolf', 'Hrolf Two-Teeth', 'Drinker of the Northern Mead', T('Thick Hide', '+15% attack, and never stunned.', { atkP: 0.15, steadfast: 1 }), 'He had three teeth until the Ninth Tavern Brawl.'],
  ['barbarian', 3, 'skadi', 'Skadi Bloodhowl', 'Wolf-Mother of the North', T('Blood Frenzy', 'Attacks 20% faster.', { frenzy: 0.4 }), 'Wolves follow her. So do the people who are afraid of wolves.'],
  ['barbarian', 4, 'brakka', null, null, T('Breaker of Gates', '+35% damage to bosses and lieutenants.', { vsBoss: 0.35 }), '"BIGGEST ONE IS MINE. Second biggest is also mine."'],
  ['barbarian', 5, 'grom', 'Grom Mountainbreaker', 'Who Split the Northern Gate', T('Avalanche', 'Cleave hits at full strength; +25% attack.', { cleaveFull: 1, atkP: 0.25 }), 'He did not mean to split the gate. He meant to knock.'],
  ['dragoon', 2, 'petra', 'Petra Gale', 'The Cloudrunner', T('Updraft', '+0.5 range.', { range: 0.5 }), 'She jumps off the Shepherd\'s Rise for fun. Nobody else thinks it is fun.'],
  ['dragoon', 3, 'talon', 'Sir Talon Ashwing', 'The Comet Lancer', T('Comet Fall', 'Dragon Dive stuns for 2.2s and hits 30% harder.', { skillPower: 0.3, stunP: 1 }), 'He once dove so hard he left a crater shaped like an apology.'],
  ['dragoon', 4, 'kestrel', null, null, T('The Skyhook', '+60% damage to flyers.', { vsAir: 0.6 }), '"Up is just a direction. I go there a lot."'],
  ['dragoon', 5, 'aeryn', 'Aeryn Highstorm', 'The Sky Unbroken', T('Twin Stoop', 'Every leap strikes twice.', { multihit: 1 }), 'The first Dragoon. The sky remembers her and makes room.'],
  ['totem_master', 2, 'oyelu', 'Oyelu Mossbeard', 'Keeper of Green Stones', T('Moss Balm', 'Heroes within 2.6 tiles strike 6% harder.', { auraAtk: 0.06 }), 'His totems grow moss. The moss is very proud of itself.'],
  ['totem_master', 3, 'kaya', 'Kaya Stormdrum', 'Who Drums the Thunder Down', T('Rolling Thunder', 'Lightning leaps to 2 more foes.', { chain: 2 }), 'Her drum and the sky keep the same time.'],
  ['totem_master', 4, 'nkemi', null, null, T('The Old Spirits', 'Heroes within 2.6 tiles strike 10% harder; totems last 4s longer.', { auraAtk: 0.1, skillLong: 4 }), '"The spirits are frightened. That means we are not too late."'],
  ['totem_master', 5, 'baobab', 'Grandfather Baobab', 'The Rooted One', T('Deep Roots', 'Thunder Totem lasts 14s and slows 55%.', { skillLong: 6, slow: 0.2 }), 'A tree that learned to walk. It learned to talk later, and regrets that.'],
  ['death_knight', 2, 'mordaunt', 'Ser Mordaunt Grey', 'The Hollow Squire', T('Thirsting Edge', '+12% attack; slashes slow 15% more.', { atkP: 0.12, slow: 0.15 }), 'He followed Varric into the dark, and out again, and asks nothing.'],
  ['death_knight', 3, 'isolde', 'Lady Isolde Frostwreath', 'The Winter Widow', T('Rime Touch', 'Attacks slow foes 30%.', { slow: 0.3 }), 'She wears her husband\'s ring frozen into her gauntlet.'],
  ['death_knight', 4, 'varric', null, null, T('The Oathless', '+25% attack; Obliterate freezes 40% longer.', { atkP: 0.25, stunP: 0.4 }), '"The blade still whispers. I have stopped answering."'],
  ['death_knight', 5, 'kael', 'Kael Varnhollow', 'First of the Oathless', T('Black Winter', '+30% attack; Obliterate freezes for 3.5s.', { atkP: 0.3, stunP: 0.75 }), 'The first knight Velscour ever whispered to. He answered; the rift remembers him before he did.'],
  ['arcane_sorcerer', 2, 'tobin', 'Tobin Stargazer', 'Apprentice Astrologer', T('Wide Heavens', '+0.5 range.', { range: 0.5 }), 'He has named eleven stars after Cassius. Cassius has named none after him.'],
  ['arcane_sorcerer', 3, 'seraphina', 'Seraphina Vey', 'The Comet Reader', T('Fast Orbit', '+25% attack speed.', { rateP: 0.25 }), 'She predicted the Riftgate a year early. Nobody wrote it down.'],
  ['arcane_sorcerer', 4, 'cassius', null, null, T('The Orrery', '+0.6 range and +15% splash.', { range: 0.6, splash: 0.15 }), '"The stars are not wrong. They are merely early."'],
  ['arcane_sorcerer', 5, 'oracle', 'The Eclipse Oracle', 'Who Counted Every Star', T('Last Light', 'Supernova hits 60% harder and charges 20% faster.', { skillPower: 0.6, skillCharge: 0.2 }), 'Nobody has seen its face. Several people have seen its stars.'],
  ['carrion_witch', 2, 'nettle', 'Nettle Hagsworth', 'Hedge Witch of Crow\'s Orchard', T('Bitter Brew', '+30% poison.', { poisonP: 0.3 }), 'She keeps the orchard\'s crows fat. They keep her company.'],
  ['carrion_witch', 3, 'morwen', 'Morwen Ravenhair', 'Queen of the Rookery', T('Twin Flock', 'Crows strike a second foe.', { multishot: 1 }), 'She married a raven. It was a nice wedding.'],
  ['carrion_witch', 4, 'maudlin', null, null, T('A Thousand Crows', 'Crows strike a second foe; +20% poison.', { multishot: 1, poisonP: 0.2 }), '"Hush, Beakworth. The nice monsters are almost dead."'],
  ['carrion_witch', 5, 'feathered', 'The Feathered Mother', 'Older Than the Woods', T('Plague Spread', 'Poisoned foes spread their poison when they die; +40% poison.', { spread: 1, poisonP: 0.4 }), 'Every crow in the world is one of hers, she says. Every crow agrees.'],
  ['bard', 2, 'pip', 'Pip Lutewhistle', 'Tavern Troubadour', T('Merry Tune', 'His aura grants 5% more attack speed.', { auraP: 0.05 }), 'He knows four songs, and plays each like it is the only one.'],
  ['bard', 3, 'rosalind', 'Rosalind Vane', 'Voice of the Velvet Stage', T('Encore', 'Crescendo charges 25% faster.', { skillCharge: 0.25 }), 'Jasper insists she is his rival. She insists she has never heard of him.'],
  ['bard', 4, 'jasper', null, null, T('The Chronicler', 'His aura grants 10% more attack speed and 10% attack.', { auraP: 0.1, auraAtk: 0.1 }), '"Verse forty-two: in which the Bard is very brave and also handsome."'],
  ['bard', 5, 'orpheon', 'Orpheon the Undying Song', 'Who Sang the Abyss Shut', T('Requiem', 'Crescendo is 60% stronger and charges 20% faster.', { skillPower: 0.6, skillCharge: 0.2 }), 'He sang the first rift closed. He has been humming ever since.'],
  ['slime_lord', 2, 'wobblesworth', 'Duke Wobblesworth', 'Envoy of the Wobbling Court', T('Courtly Bulk', '+10% attack; slams slow 15% more.', { atkP: 0.1, slow: 0.15 }), 'Gloop\'s cousin, and the court\'s most diplomatic jelly.'],
  ['slime_lord', 3, 'jellabelle', 'Duchess Jellabelle', 'The Gelatinous Matron', T('Clinging Jelly', 'Slows foes 50%.', { slow: 0.2 }), 'She has adopted eleven smaller slimes. They live inside her.'],
  ['slime_lord', 4, 'gloop', null, null, T('Royal Ooze', 'Never stunned; his Gelatinous Wall holds 2 more foes and lasts 3s longer.', { steadfast: 1, block: 2, skillLong: 3 }), '"We are the Ninth Gloop. The other eight were less magnificent."'],
  ['slime_lord', 5, 'oozymandias', 'Emperor Oozymandias', 'King of Kings of Slime', T('Look On My Works', 'His Gelatinous Wall holds 4 more foes and lasts 4s longer; +15% attack.', { block: 4, skillLong: 4, atkP: 0.15 }), 'Ruler of the slime empire before the slimes forgot they had one.'],
  ['boomerang_knight', 2, 'rook', 'Rook Arcfield', 'Squire of the Crescent', T('Wide Arc', '+0.4 range.', { range: 0.4 }), 'Selene\'s squire. He has caught every rang she has thrown, mostly with his face.'],
  ['boomerang_knight', 3, 'lunara', 'Dame Lunara Crescent', 'The Waxing Blade', T('Twin Moons', 'Throws a second rang.', { multishot: 1 }), 'Two rangs, never crossed. She calls it manners.'],
  ['boomerang_knight', 4, 'selene', null, null, T('The Returning Moon', '+25% attack; rangs slow foes 20%.', { atkP: 0.25, slow: 0.2 }), '"What is thrown returns. Throw well."'],
  ['boomerang_knight', 5, 'kai', 'Kai of the Thousand Returns', 'Moonwarden', T('Endless Orbit', '+35% attack speed; Eclipse Rang lasts 10s.', { rateP: 0.35, skillLong: 4 }), 'He threw one rang a thousand years ago. It is still coming back.'],
  ['lancer', 2, 'aldous', 'Brother Aldous Ward', 'Gatekeeper of the Monastery', T('Iron Vow', '+15% attack, and never stunned.', { atkP: 0.15, steadfast: 1 }), 'He has said nine words this year. Four were "no".'],
  ['lancer', 3, 'gunnhild', 'Sister Gunnhild Ironvow', 'The Spear Wall', T('Shield Wall', 'Thrusts pierce one more foe; +10% attack.', { pierce: 1, atkP: 0.1 }), 'She stood a winter on the Frostfang road. The winter left first.'],
  ['lancer', 4, 'halvard', null, null, T('The Silent Bulwark', 'Never stunned; +20% attack, and thrusts pierce one more foe.', { steadfast: 1, atkP: 0.2, pierce: 1 }), '"..."'],
  ['lancer', 5, 'abbot', 'The Unmoving Abbot', 'Who Held the Pass Alone', T('Immovable', 'Never stunned; Phalanx Charge hits 50% harder; +15% attack.', { steadfast: 1, skillPower: 0.5, atkP: 0.15 }), 'He held Frostfang alone for a year. He would have held it longer, but it was spring.'],
  ['dragon_knight', 2, 'kell', 'Kell Scorchmark', 'Wyrm-Squire', T('Hot Breath', '+50% burn.', { burnP: 0.5 }), 'His dragon is a very small dragon. It is doing its best.'],
  ['dragon_knight', 3, 'drakon', 'Ser Drakon Vey', 'The Ashen Wyrmrider', T('Long Flame', '+0.5 breath range.', { range: 0.5 }), 'He has never lost a duel, or an eyebrow, or his temper.'],
  ['dragon_knight', 4, 'ysolde', null, null, T('Cinder', '+0.6 breath range and 40% more burn.', { range: 0.6, burnP: 0.4 }), '"Cinder says that was adequate. Cinder is lying. That was magnificent."'],
  ['dragon_knight', 5, 'ignatia', 'Ignatia, the Last Dragonqueen', 'Crowned in Flame', T('Queen\'s Fire', 'Wyrmfire is 60% stronger; +20% attack.', { skillPower: 0.6, atkP: 0.2 }), 'The last queen of the dragon-bonded. Cinder bows when her card is drawn.'],
  ['gunner', 2, 'dot', 'Dot Sparkwick', 'Powder Monkey', T('Light Load', 'Costs 3 less Valor.', { cost: -3 }), 'Flint\'s youngest crewmate, rescued from the Rusted Dredge. She loads faster than he does. Do not tell him.'],
  ['gunner', 3, 'cogsworth', 'Marshal Cogsworth Hale', 'Inventor of the Clockwork Volley', T('Calibrated', '20% chance to crit for double damage.', { crit: 0.2 }), 'He measures twice and shoots eleven times.'],
  ['gunner', 4, 'flint', null, null, T('Powder and Brass', 'Every 8th shot is a bomb: 200% damage in 1 tile.', { bombEvery: 8 }), '"Magic? Bah. Magic doesn\'t come with a warranty."'],
  ['gunner', 5, 'blackpowder', 'Admiral Thaddeus Blackpowder', 'Scourge of the Glass Flats', T('Broadside', 'Shots explode for 60% in 0.6 tiles; +20% attack.', { splash: 0.6, atkP: 0.2 }), 'He sank a desert. Nobody is sure how.'],
];

const castById = Object.fromEntries(CAST.map((c) => [c.id, c]));
export const HEROES = [...ROWS, ...ROWS2].map(([cls, rarity, id, name, title, trait, flavor]) => {
  const core = castById[id];
  return { id, cls, rarity, name: core ? core.name : name, title: core ? core.title : title, short: core ? core.short : name.split(/[ ,]/).find((w) => w.length > 2 && !/^(Ser|Dame|Lady|Sir|Brother|Sister|Master|Magister|Duke|Duchess|Emperor|Admiral|Marshal|Saint|Grandfather|The)$/.test(w)) || name,
    core: !!core, trait, flavor };
});
export const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));

/** The heroes the Commander starts with, and the Sixteen who join as the story reaches them (stage -> hero). */
export const STARTERS = ['corwin', 'wren', 'ismene', 'brakka'];
export const RECRUITS = { 2: 'flint', 3: 'selene', 4: 'mortimer', 6: 'gloop', 8: 'maudlin', 10: 'jasper', 12: 'kestrel', 14: 'nkemi',
  16: 'cassius', 18: 'halvard', 22: 'ysolde', 26: 'varric' };

const BANDS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const looks = new Map();
/** A hero's own look (what they wear with no gear cards equipped): see art/heroart.js heroCanvas. */
export function heroBaseLook(h) {
  let L = looks.get(h.id);
  if (L) return L;
  const r = new RNG('look:' + h.id), cls = h.cls, cl = ART.classes[cls];
  const tierFin = (t) => { const opts = ART.palettes.map((p, i) => [p, i]).filter(([p, i]) => i > 0 && p.tier === t).map(([, i]) => i); return r.pick(opts); };
  const heldN = (set) => ART.held[set]?.designs.length || 0;
  const heldPick = (set, rar) => { if (!set) return -1; const ds = ART.held[set].designs.map((d, i) => [d, i]).filter(([d]) => d[1] === rar); return ds.length ? r.pick(ds)[1] : Math.min(heldN(set) - 1, 0); };
  if (h.core) {
    // the Sixteen look like the class sheet (armor 1, no recolour), with a Legendary weapon in hand
    const helmed = cls === 'death_knight' || cls === 'lancer';
    L = { cls, armor: 1, armorFin: 0, helm: helmed ? (cls === 'lancer' ? 5 : 15) : 0, helmFin: 0, weapon: heldPick(cl.weapon, 4), weaponFin: 0,
      offhand: heldPick(cl.offhand, 3), offFin: 0, element: null };
  } else {
    const band = ART.gear[cls].bands[BANDS[h.rarity]] || [1], fin = tierFin(h.rarity);
    const helms = ART.helms.filter(([, rar]) => rar === h.rarity || (h.rarity === 4 && rar === 3)).map(([id]) => id);
    L = { cls, armor: r.pick(band), armorFin: fin, helm: r.chance(0.55) && helms.length ? r.pick(helms) : 0, helmFin: fin,
      weapon: heldPick(cl.weapon, h.rarity), weaponFin: r.chance(0.5) ? fin : 0, offhand: heldPick(cl.offhand, Math.max(0, h.rarity - 1)), offFin: fin, element: null };
  }
  looks.set(h.id, L);
  return L;
}
