import { TREE4_NAMES } from './skilltrees4.js';
// The sixteen playable classes.
// primary: attribute that adds +1% damage to all of the class' skills per point.
export const CLASSES = {
  paladin: {
    name: 'Paladin', primary: 'str', base: { str: 24, dex: 14, vit: 24, int: 16 }, life: 70, mana: 30, lifeLvl: 8, manaLvl: 2,
    weapon: 'mace', offhand: 'shield', element: 'holy', color: '#ffd860',
    trees: ['Holy Wrath', 'Bulwark', 'Crusade'],
    desc: 'A holy warrior clad in blessed steel. Hammers of light, righteous auras and an unbreakable shield wall.',
  },
  ranger: {
    name: 'Ranger', primary: 'dex', base: { str: 16, dex: 28, vit: 18, int: 14 }, life: 55, mana: 30, lifeLvl: 6, manaLvl: 2.5,
    weapon: 'bow', offhand: 'quiver', element: 'phys', color: '#7ccf5a',
    trees: ['Marksmanship', 'The Wilds', 'Traps & Tricks'],
    desc: 'A deadly archer of the wildwood. Volleys of arrows, beast companions and cunning traps.',
  },
  wizard: {
    name: 'Wizard', primary: 'int', base: { str: 12, dex: 16, vit: 16, int: 32 }, life: 45, mana: 60, lifeLvl: 5, manaLvl: 4,
    weapon: 'staff', offhand: 'tome', element: 'fire', color: '#ff8a30',
    trees: ['Fire', 'Frost', 'Storm'],
    desc: 'Master of the classic elements. Meteors, blizzards and chain lightning at your fingertips.',
  },
  necromancer: {
    name: 'Necromancer', primary: 'int', base: { str: 14, dex: 16, vit: 18, int: 28 }, life: 48, mana: 55, lifeLvl: 5, manaLvl: 4,
    weapon: 'wand', offhand: 'orb', element: 'shadow', color: '#a070ff',
    trees: ['Bone & Blood', 'Summoning', 'Curses & Plague', 'Skeletal Legion'],
    desc: 'Commander of the dead. Raise skeletal armies, hurl bone spears and detonate corpses.',
  },
  barbarian: {
    name: 'Barbarian', primary: 'str', base: { str: 30, dex: 18, vit: 26, int: 8 }, life: 80, mana: 20, lifeLvl: 9, manaLvl: 1.5,
    weapon: 'axe', element: 'phys', color: '#d8853a',
    trees: ['Rage', 'Warcries', 'Earthshaker'],
    desc: 'A savage berserker from the frozen north. Whirlwinds of steel, earth-splitting slams and battle cries.',
  },
  dragoon: {
    name: 'Dragoon', primary: 'str', base: { str: 24, dex: 22, vit: 22, int: 12 }, life: 65, mana: 30, lifeLvl: 7, manaLvl: 2,
    weapon: 'spear', offhand: 'shield', element: 'fire', color: '#6aa8ff',
    trees: ['Lancework', 'Sky Dive', 'Wyrmblood', 'Spearstorm'],
    desc: 'A lance-wielding knight who leaps from the heavens. Dragon dives, lance flurries and wyrm breath.',
  },
  totem_master: {
    name: 'Totem Master', primary: 'int', base: { str: 18, dex: 16, vit: 22, int: 24 }, life: 60, mana: 45, lifeLvl: 7, manaLvl: 3,
    weapon: 'staff', offhand: 'idol', element: 'light', color: '#5ac8a0',
    trees: ['Totems', 'Ancestors', 'Earth & Storm'],
    desc: 'A shaman who plants spirit totems that burn, shock and heal while ancestors fight at their side.',
  },
  death_knight: {
    name: 'Death Knight', primary: 'str', base: { str: 26, dex: 14, vit: 26, int: 14 }, life: 75, mana: 30, lifeLvl: 8, manaLvl: 2,
    weapon: 'sword', offhand: 'skull', element: 'cold', color: '#7ad0ff',
    trees: ['Frost', 'Unholy', 'Blood'],
    desc: 'A fallen champion bound by runic frost. Obliterating strikes, plague and life-stealing blood magic.',
  },
  arcane_sorcerer: {
    // the id stays arcane_sorcerer (saves, sprites and gear packs use it); he is the Astronomer now
    name: 'Astronomer', primary: 'int', base: { str: 12, dex: 16, vit: 16, int: 34 }, life: 44, mana: 65, lifeLvl: 5, manaLvl: 4.5,
    weapon: 'wand', offhand: 'orb', element: 'arcane', color: '#4aa8ff',
    trees: ['Starfire', 'Celestial Bodies', 'Gravity'],
    desc: 'A stargazer who wields the heavens. Swarms of star missiles, meteors, falling suns and black holes; every spell charts a star, and finished constellations grant zodiac boons.',
  },
  carrion_witch: {
    name: 'Carrion Witch', primary: 'int', base: { str: 12, dex: 18, vit: 18, int: 30 }, life: 48, mana: 55, lifeLvl: 5, manaLvl: 4,
    weapon: 'staff', offhand: 'lantern', element: 'poison', color: '#9ac84a',
    trees: ['Plague', 'Murder of Crows', 'Hexes'],
    desc: 'A swamp hag who commands locusts and crows, and hexes her foes into rotting puppets.',
  },
  bard: {
    name: 'Bard', primary: 'dex', base: { str: 16, dex: 26, vit: 20, int: 18 }, life: 55, mana: 40, lifeLvl: 6, manaLvl: 3,
    weapon: 'lute', offhand: 'drum', element: 'arcane', color: '#ff6a8a',
    trees: ['Songs', 'Sonic Arts', 'Trickery'],
    desc: 'A roguish minstrel whose songs empower allies, whose chords shatter bone, and whose knives never miss.',
  },
  slime_lord: {
    name: 'Slime Lord', primary: 'vit', base: { str: 18, dex: 14, vit: 32, int: 16 }, life: 85, mana: 35, lifeLvl: 9, manaLvl: 2.5,
    weapon: 'mace', offhand: 'jar', element: 'acid', color: '#4aa8ff',
    trees: ['Ooze', 'Spawn', 'Mutation'],
    desc: 'A crowned king of living ooze. Acid floods, endless slimeling broods and grotesque mutations.',
  },
  boomerang_knight: {
    name: 'Boomerang Knight', primary: 'dex', base: { str: 20, dex: 28, vit: 20, int: 12 }, life: 60, mana: 30, lifeLvl: 7, manaLvl: 2,
    weapon: 'boomerang', offhand: 'rang', element: 'phys', color: '#3ac8a8',
    trees: ['Throwing', 'Bladesmanship', 'Gale Knight'],
    desc: 'A dashing knight whose blades always come back. Ricochets, swirling sword storms and gale cyclones.',
  },
  lancer: {
    name: 'Lancer', primary: 'str', base: { str: 26, dex: 18, vit: 30, int: 8 }, life: 88, mana: 28, lifeLvl: 9, manaLvl: 1.6,
    weapon: 'spear', offhand: 'shield', element: 'light', color: '#c0c0d0',
    trees: ['Energy Lance', 'Bulwark', 'Knight Order'],
    desc: 'An unbreakable knight-captain. Huge elemental energy lances, up to ten tower shields circling him, and an order of knights at his back.',
  },
  dragon_knight: {
    name: 'Dragon Knight', primary: 'str', base: { str: 26, dex: 18, vit: 24, int: 12 }, life: 72, mana: 30, lifeLvl: 8, manaLvl: 2,
    weapon: 'sword', offhand: 'shield', element: 'fire', color: '#ff5a2a',
    trees: ['Flame', 'Scale', 'Draconic'],
    desc: 'Blood of the wyrm runs hot. Fire breath, dragon-scale armor and the power to become a dragon.',
  },
  gunner: {
    name: 'Gunner', primary: 'dex', base: { str: 16, dex: 30, vit: 18, int: 16 }, life: 55, mana: 35, lifeLvl: 6, manaLvl: 2.5,
    weapon: 'pistol', offhand: 'bomb', element: 'fire', color: '#d0a060',
    trees: ['Firearms', 'Explosives', 'Engineering'],
    desc: 'A powder-stained engineer. Bullet hell, rocket barrages, turrets, drones and a death laser.',
  },
};
for (const [c, name] of Object.entries(TREE4_NAMES)) if (CLASSES[c].trees.length === 3) CLASSES[c].trees.push(name);

/**
 * Every class's damage multiplier at hero levels DMG_TUNE_AT (log-interpolated, held past the ends; Player.skillDamage
 * applies it, so minions, signatures and procs follow). Measured in play by tools/tests/tuning.js: the classes killed
 * up to ~8x faster or slower than each other (the Astronomer, Ranger and Wizard fastest, the Barbarian and Dragoon
 * slowest); this evens most of it out (the measured ratio ^0.85, noise kept from swinging it all the way), and the
 * melee classes keep ~15% more for standing in the crowd.
 */
// Past hero level 160 classes scale apart again: at depths 400-500 (heroes ~215-260, tools/tests/tuning.js, two runs each)
// the Dragoon killed a normal in 0.28x the mean time and the Boomerang Knight 0.34x, the Carrion Witch 2.4x and the
// Gunner 2.1x; level 300 takes half that gap (the square root of the ratio), every other class holds its level-160 value.
// Measured again (three runs): the Gunner 0.99x and the Witch 1.3x, the Dragoon 0.61x and the Boomerang Knight 0.49x, so
// those two took a second half-step.
export const DMG_TUNE_AT = [5, 45, 160, 300];
export const DMG_TUNE = {
  paladin: [1.31, 1.27, 0.95, 0.95], ranger: [0.74, 0.42, 0.53, 0.53], wizard: [0.99, 0.6, 0.54, 0.54], necromancer: [1.15, 1.23, 2.3, 2.3],
  barbarian: [1.63, 3.5, 2.38, 2.38], dragoon: [0.98, 3.23, 3.2, 1.33], totem_master: [0.95, 0.85, 1.48, 1.48], death_knight: [0.96, 1.28, 1.66, 1.66],
  arcane_sorcerer: [0.77, 0.34, 0.25, 0.25], carrion_witch: [1.13, 0.91, 1.36, 2.12], bard: [0.69, 1.11, 1.28, 1.28], slime_lord: [1.23, 0.69, 0.53, 0.53],
  boomerang_knight: [1.07, 0.74, 0.42, 0.17], lancer: [1.32, 2.02, 1.48, 1.48], dragon_knight: [1.35, 1.47, 1.83, 1.83], gunner: [1.03, 0.68, 0.79, 1.14],
};

export const ATTRS = {
  str: { name: 'Strength', short: 'STR', desc: '+1% physical damage, +1 armor' },
  dex: { name: 'Dexterity', short: 'DEX', desc: '+0.3% attack speed, +0.1% crit chance (past the 75% cap: +0.2% crit damage)' },
  vit: { name: 'Vitality', short: 'VIT', desc: '+3 life, +0.05 life regen' },
  int: { name: 'Intellect', short: 'INT', desc: '+2 mana, +1% elemental damage' },
};
