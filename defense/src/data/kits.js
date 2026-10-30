// What each of Velscour's 16 classes does on the battlefield. Stats are a Rare, level 1, 1-star hero's.
// post: 'road' heroes stand on the path and block (block = how many foes they hold); 'high' heroes take the raised
// posts beside it and shoot. range in tiles, rate = seconds between attacks, cost = Valor to deploy.
// fx: the attack's look (battle/fx.js); skill: the charge-up ability (charge = seconds of fighting to fill).
export const KITS = {
  paladin: { role: 'Guardian', post: 'road', block: 3, hp: 980, atk: 62, def: 58, res: 0.2, range: 1, rate: 1.25, cost: 13, dmg: 'phys', el: 'holy', fx: 'hammer',
    skill: { id: 'dawnbreak', name: 'Dawnbreak', charge: 16, text: 'Heals allies within 2.5 tiles for 35% of their life and stuns nearby foes for 1.5s.' } },
  ranger: { role: 'Marksman', post: 'high', block: 0, hp: 520, atk: 48, def: 18, res: 0.1, range: 3.6, rate: 0.72, cost: 10, dmg: 'phys', el: 'phys', fx: 'arrow', air: 1.5,
    skill: { id: 'volley', name: 'Rain of Arrows', charge: 14, text: 'Looses 10 arrows over 2 tiles around the strongest foe, 90% damage each. Hits flyers hard.' } },
  wizard: { role: 'Pyromancer', post: 'high', block: 0, hp: 470, atk: 82, def: 12, res: 0.25, range: 3.0, rate: 1.7, cost: 14, dmg: 'magic', el: 'fire', fx: 'fireball', splash: 0.95,
    skill: { id: 'meteor', name: 'Meteor', charge: 18, text: 'Calls a meteor onto the biggest crowd: 520% damage in 1.6 tiles and burns for 4s.' } },
  necromancer: { role: 'Bonecaller', post: 'high', block: 0, hp: 500, atk: 54, def: 16, res: 0.25, range: 3.0, rate: 1.3, cost: 13, dmg: 'magic', el: 'shadow', fx: 'bonespear', pierce: 2,
    skill: { id: 'legion', name: 'Raise the Legion', charge: 20, text: 'Raises two skeleton warriors on the nearest road for 14s. Each blocks one foe.' } },
  barbarian: { role: 'Berserker', post: 'road', block: 2, hp: 1080, atk: 86, def: 38, res: 0, range: 1, rate: 1.3, cost: 14, dmg: 'phys', el: 'phys', fx: 'cleave', cleave: 0.9,
    skill: { id: 'whirlwind', name: 'Whirlwind', charge: 15, text: 'Spins for 5s, striking every foe within 1.6 tiles for 70% damage four times a second.' } },
  dragoon: { role: 'Skyhook', post: 'any', block: 1, hp: 760, atk: 92, def: 36, res: 0.1, range: 2.4, rate: 1.9, cost: 15, dmg: 'phys', el: 'fire', fx: 'leap', splash: 0.7, air: 1.2,
    skill: { id: 'dive', name: 'Dragon Dive', charge: 16, text: 'Leaps onto the densest crowd within 4.5 tiles: 360% damage in 1.3 tiles and a 1.2s stun.' } },
  totem_master: { role: 'Spiritcaller', post: 'high', block: 0, hp: 600, atk: 40, def: 22, res: 0.3, range: 2.8, rate: 1.15, cost: 12, dmg: 'magic', el: 'light', fx: 'chain', chain: 3, heal: 0.012,
    skill: { id: 'thundertotem', name: 'Thunder Totem', charge: 17, text: 'Plants a totem on the path that zaps every foe within 2 tiles for 8s and slows them 35%.' } },
  death_knight: { role: 'Oathbreaker', post: 'road', block: 2, hp: 1000, atk: 76, def: 48, res: 0.3, range: 1, rate: 1.25, cost: 14, dmg: 'phys', el: 'cold', fx: 'frostslash', leech: 0.15,
    skill: { id: 'obliterate', name: 'Obliterate', charge: 16, text: 'A rune-blade strike for 420% damage that freezes everything within 1.5 tiles for 2s.' } },
  arcane_sorcerer: { role: 'Astronomer', post: 'high', block: 0, hp: 440, atk: 104, def: 10, res: 0.3, range: 4.2, rate: 2.5, cost: 16, dmg: 'magic', el: 'arcane', fx: 'starfall', splash: 1.0, air: 1.2,
    skill: { id: 'supernova', name: 'Supernova', charge: 22, text: 'A star collapses on the crowd: 760% damage in 2.2 tiles after a 1s pull that drags foes inward.' } },
  carrion_witch: { role: 'Crowmother', post: 'high', block: 0, hp: 480, atk: 34, def: 14, res: 0.3, range: 3.0, rate: 1.0, cost: 12, dmg: 'magic', el: 'poison', fx: 'crow', poison: 0.55, air: 1.3,
    skill: { id: 'murder', name: 'Murder of Crows', charge: 16, text: 'A storm of crows tears at up to 12 foes for 5s, poisoning each for 120% a second.' } },
  bard: { role: 'Chronicler', post: 'high', block: 0, hp: 540, atk: 40, def: 18, res: 0.25, range: 3.0, rate: 1.1, cost: 12, dmg: 'magic', el: 'arcane', fx: 'note', aura: 0.1,
    skill: { id: 'crescendo', name: 'Crescendo', charge: 32, text: 'A full song (the only time he plays): allies within 3 tiles gain 45% attack and speed for 9s; foes there are stunned 1.5s.' } },
  slime_lord: { role: 'Gelatinous King', post: 'road', block: 3, hp: 1300, atk: 46, def: 30, res: 0.45, range: 1, rate: 1.4, cost: 13, dmg: 'magic', el: 'acid', fx: 'slimeslam', slow: 0.3,
    skill: { id: 'jellywall', name: 'Gelatinous Wall', charge: 18, text: 'Swells for 8s: blocks 3 more foes, takes 40% less damage and leaves slowing acid on the road.' } },
  boomerang_knight: { role: 'Moonblade', post: 'high', block: 0, hp: 620, atk: 58, def: 24, res: 0.15, range: 3.2, rate: 1.45, cost: 13, dmg: 'phys', el: 'phys', fx: 'boomerang', pierce: 99, air: 1.1,
    skill: { id: 'eclipse', name: 'Eclipse Rang', charge: 17, text: 'A great moon-rang orbits her at 2 tiles for 6s, slicing every foe it passes.' } },
  lancer: { role: 'Bulwark', post: 'road', block: 2, hp: 1150, atk: 68, def: 70, res: 0.1, range: 2, rate: 1.45, cost: 14, dmg: 'phys', el: 'light', fx: 'thrust', pierce: 3, air: 1,
    skill: { id: 'phalanx', name: 'Phalanx Charge', charge: 17, text: 'Charges down the road: 280% damage to every foe in a 3-tile line, knocking them back.' } },
  dragon_knight: { role: 'Wyrmbound', post: 'road', block: 2, hp: 920, atk: 72, def: 44, res: 0.25, range: 1.7, rate: 1.5, cost: 14, dmg: 'magic', el: 'fire', fx: 'breath', cone: 1, burn: 0.3, air: 1,
    skill: { id: 'wyrmfire', name: 'Wyrmfire', charge: 17, text: 'Cinder breathes through her: a 3.5-tile cone of dragonfire, 320% damage plus a 5s burn.' } },
  gunner: { role: 'Powder Master', post: 'high', block: 0, hp: 500, atk: 30, def: 16, res: 0.1, range: 3.8, rate: 0.36, cost: 13, dmg: 'phys', el: 'fire', fx: 'bullet', air: 1.3,
    skill: { id: 'cannonade', name: 'Cannonade', charge: 15, text: 'Lobs 5 bombs onto the biggest crowds: 260% damage in 1.1 tiles each.' } },
};
export const CLASS_IDS = Object.keys(KITS);

// Card rarities (the main game's six). mult scales a hero's or a piece of gear's stats.
export const RARITIES = [
  { id: 0, name: 'Common', color: '#b8b8b0', gem: '#2a2a2a', mult: 0.8 },
  { id: 1, name: 'Uncommon', color: '#7ad06a', gem: '#c8ccd4', mult: 0.9 },
  { id: 2, name: 'Rare', color: '#5aa0ff', gem: '#e8c060', mult: 1 },
  { id: 3, name: 'Epic', color: '#c070ff', gem: '#b070f0', mult: 1.25 },
  { id: 4, name: 'Legendary', color: '#ff9a2a', gem: '#ff8020', mult: 1.55 },
  { id: 5, name: 'Mythic', color: '#ff3a4a', gem: '#ff3060', mult: 1.95 },
];

// The frame colour of each class's card (MTG-style colour identities)
export const FRAMES = {
  white: { name: 'Dawn', base: '#e8dfc4', dark: '#9c8d68', ink: '#2a2014', pip: '#f8f0d0' },
  blue: { name: 'Tide', base: '#5a8ed0', dark: '#1c3a68', ink: '#0a1424', pip: '#a8d0ff' },
  black: { name: 'Grave', base: '#4a4450', dark: '#16121a', ink: '#e8e0f0', pip: '#a898b0' },
  red: { name: 'Ember', base: '#d0603a', dark: '#5c1a0e', ink: '#1e0804', pip: '#ffb080' },
  green: { name: 'Wild', base: '#4e9a52', dark: '#16381a', ink: '#081408', pip: '#b0e0a0' },
  gold: { name: 'Concord', base: '#d4b05a', dark: '#6a4e14', ink: '#201604', pip: '#ffe8a0' },
  artifact: { name: 'Forged', base: '#9a9286', dark: '#3e3a34', ink: '#14120e', pip: '#d8d0c4' },
};
export const CLASS_FRAME = { paladin: 'white', lancer: 'white', arcane_sorcerer: 'blue', slime_lord: 'blue', dragoon: 'blue',
  necromancer: 'black', death_knight: 'black', carrion_witch: 'black', wizard: 'red', dragon_knight: 'red', barbarian: 'red',
  ranger: 'green', totem_master: 'green', boomerang_knight: 'green', bard: 'gold', gunner: 'artifact' };
