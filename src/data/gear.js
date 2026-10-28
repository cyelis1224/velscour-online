// Gear looks: palette swaps ("finishes") for the armor and helm art, and the effects high rarity body armor
// shows on the hero. How they're applied: src/core/gearart.js (palettes) and src/gfx/gearfx.js (effects).
import { RARITY } from './items.js';

// Gradient ramps, dark -> light. A palette recolours four materials, told apart per pixel by colour (gearart.js
// recolorPx): neutral metal, dyed cloth (cool hues and reds), bright warm trim (gold, brass, parchment) and the dark
// warm base (bronze plate and leather: most of a Grim Nocturne outfit). The hero's face, hair and skin are masked out
// by the importer (tools/nocturnegear.py) and never recoloured.
const R = {
  steel: ['#06070a', '#3a3e46', '#9aa2ae', '#f4f8ff'], iron: ['#060606', '#2c2c2e', '#6e6c6a', '#cfcac2'],
  black: ['#030304', '#16161a', '#4a4a52', '#b8b8c4'], silver: ['#0a0c10', '#5a6270', '#c8d0dc', '#ffffff'],
  bone: ['#0e0c08', '#4e4636', '#b0a688', '#fff8e4'], ash: ['#0a0a0a', '#3a3836', '#8a8680', '#e8e4dc'],
  frost: ['#04080e', '#36506a', '#a0c8e8', '#f4fcff'], obsidian: ['#06040a', '#2a2436', '#7a7090', '#e8e0ff'],
  sunsteel: ['#141008', '#7a6a40', '#f0e0a0', '#ffffff'], jade: ['#020a06', '#1e5a3a', '#5ac08a', '#e0ffe8'],
  amethyst: ['#0a0410', '#4a2470', '#a070e0', '#f4e8ff'], storm: ['#02040a', '#1a2a5a', '#5a8aff', '#e8f4ff'],
  bloodsteel: ['#0a0404', '#4a2626', '#a07070', '#ffe0d8'], gunmetal: ['#040508', '#22262e', '#5a6270', '#c0c8d4'],
  rosegold: ['#100604', '#6a3a30', '#e0a088', '#fff0e8'], copper: ['#0e0402', '#5a2412', '#c06a3a', '#ffd0a8'],
  crimson: ['#100000', '#6a0c0c', '#d02828', '#ffb0a0'], wine: ['#0a0004', '#4a0a20', '#9a2a50', '#f0a0c0'],
  royal: ['#000510', '#0a2050', '#3060c0', '#c0d8ff'], navy: ['#020408', '#101c38', '#2a4478', '#a0b8e8'],
  forest: ['#020802', '#143a18', '#3a7a34', '#c0f0a8'], moss: ['#060802', '#2a3414', '#6a7a34', '#e0eab0'],
  purple: ['#0a0010', '#401070', '#a040ff', '#f0c0ff'], plum: ['#08020a', '#3a1440', '#7a3a80', '#e8c0f0'],
  teal: ['#000a0a', '#0c4446', '#2a9a96', '#c0fff8'], flame: ['#100200', '#7a1800', '#ff6010', '#fff0a0'],
  ice: ['#000818', '#103870', '#4090e0', '#c0f0ff'], emerald: ['#001008', '#0a5030', '#20c070', '#c0ffe0'],
  rose: ['#0e0206', '#5a1430', '#d05080', '#ffd0e0'], toxic: ['#040a00', '#2a5a00', '#80e010', '#f0ffb0'],
  blood: ['#080000', '#4a0000', '#a00808', '#ff8070'], void: ['#020004', '#1a0830', '#5a20a0', '#e0a0ff'],
  terracotta: ['#0c0402', '#5a2010', '#c0603a', '#ffd8c0'], cyan: ['#000a0e', '#004a5a', '#20c0e0', '#d0fcff'],
  saffron: ['#0e0600', '#6a3a00', '#e09a10', '#fff0b0'], gold: ['#140a00', '#7a5410', '#e0b040', '#fff4c0'],
  brass: ['#100800', '#5a4416', '#b09040', '#f4e8b0'], pewter: ['#080808', '#3e3e40', '#8e8e90', '#e4e4e6'],
  bronze: ['#100602', '#5a3416', '#b07a40', '#ffe0b0'], glowcyan: ['#001014', '#007088', '#40e0f0', '#e8ffff'],
  ember: ['#0e0402', '#6a1e06', '#e06a1a', '#fff0a0'], charcoal: ['#050505', '#1c1c1e', '#48484c', '#a8a8ae'],
  oxblood: ['#0a0203', '#3e0e12', '#7a2228', '#e0a0a0'], olive: ['#060602', '#2e3014', '#646a34', '#d8dca8'],
  peat: ['#060402', '#2a2014', '#5a4a30', '#c8b898'], slate: ['#04060a', '#1e2834', '#4a5a6e', '#b8c8d8'],
  aubergine: ['#06020a', '#2a1236', '#5a2e6a', '#d0b0e0'], driftwood: ['#080706', '#34302a', '#7a7064', '#e0d8cc'],
  midnight: ['#020308', '#0c1430', '#24346a', '#a8b8e8'], deepforest: ['#020604', '#0e2a18', '#285a38', '#b0e0c0'],
  deepteal: ['#000606', '#0a2e30', '#1e6466', '#a8e8e4'], sand: ['#0c0906', '#4a3e2c', '#a8946c', '#f8ecd0'],
  deepviolet: ['#04020a', '#1c0e36', '#44287a', '#c8b8f0'], blackteal: ['#000404', '#061c1e', '#14444a', '#90d0d0'],
  iceblue: ['#02060c', '#1a3654', '#5a90c0', '#e0f4ff'], emberbase: ['#0a0200', '#4a1004', '#a03410', '#ffc890'],
  ivorybase: ['#0c0a06', '#5a5240', '#c4b896', '#fffaec'], crimsonbase: ['#0a0000', '#4a0608', '#962028', '#ffb0a8'],
  blackplum: ['#040104', '#1e0a1e', '#4a2048', '#d0a8d0'], royalpurple: ['#06020c', '#2a0e50', '#5e2aa0', '#dcc4ff'],
  blackgreen: ['#010401', '#0a1e0e', '#1e4a28', '#a0d8a8'], blackred: ['#040000', '#200406', '#501018', '#d08888'],
  emeraldbase: ['#000804', '#063a20', '#14804a', '#b8f8d8'],
  rust: ['#0a0402', '#4a1e0c', '#9a4a22', '#f0c09a'], linen: ['#0c0a08', '#4a4238', '#a89a86', '#fbf4e8'],
  seaglass: ['#020a08', '#1a4a42', '#5ab0a0', '#e0fff6'], garnet: ['#0a0004', '#4a0618', '#a01838', '#ffb8c8'],
  indigo: ['#02020c', '#141a4a', '#3a44a0', '#c8ccff'], mustard: ['#0a0802', '#4a3c0a', '#b0901a', '#fff0a8'],
  lilac: ['#08060c', '#3e3456', '#9a88c4', '#f4eeff'], verdigris: ['#020806', '#1e4a3c', '#4a9a80', '#d8fff0'],
  pearl: ['#0c0c0e', '#5a5a64', '#c8c8d4', '#ffffff'], aurora: ['#00080a', '#0a4a4a', '#30e0a0', '#f0fff0'],
  dawn: ['#100604', '#7a3a24', '#ffa070', '#fff4e0'], nightshade: ['#04020a', '#200a3a', '#6a2a9a', '#f0b0ff'],
  rustbase: ['#080302', '#30140a', '#6a3018', '#d8a888'], indigobase: ['#020208', '#0e1236', '#262e70', '#b0b8f0'],
  garnetbase: ['#060002', '#2a040e', '#5a0c22', '#e0a0b0'], tealbase: ['#000606', '#08282a', '#16585a', '#a0e0dc'],
};

// [name, minimum rarity, metal, cloth, trim, base]: each finish changes three or four colours that contrast
const P = [
  ['Original', 0], // the artist's own colours, at every rarity
  ['Ashen Watch', 0, 'iron', 'wine', 'pewter', 'charcoal'], ['Moss and Iron', 0, 'iron', 'moss', 'bronze', 'olive'],
  ['Oxblood', 0, 'steel', 'navy', 'brass', 'oxblood'], ['Dusk Patrol', 0, 'ash', 'plum', 'copper', 'slate'],
  ['Peat and Copper', 0, 'iron', 'forest', 'copper', 'peat'], ['Saltworn', 0, 'bone', 'teal', 'pewter', 'driftwood'],
  ['Sandstone', 0, 'bone', 'terracotta', 'brass', 'sand'], ['Gravewatch', 0, 'black', 'moss', 'pewter', 'slate'],
  ['Royal Guard', 1, 'steel', 'crimson', 'gold', 'midnight'], ['Verdant Oath', 1, 'silver', 'forest', 'gold', 'deepforest'],
  ['Copper Tide', 1, 'copper', 'teal', 'copper', 'deepteal'], ['Plum and Brass', 1, 'steel', 'plum', 'brass', 'aubergine'],
  ['Iron Rose', 1, 'iron', 'rose', 'silver', 'charcoal'], ['Desert Saffron', 1, 'bone', 'saffron', 'gold', 'terracotta'],
  ['Winter Wool', 1, 'silver', 'navy', 'silver', 'slate'], ['Marsh Lantern', 1, 'gunmetal', 'saffron', 'brass', 'deepforest'],
  ['Sapphire Court', 2, 'silver', 'royal', 'gold', 'midnight'], ['Emerald Gild', 2, 'sunsteel', 'emerald', 'gold', 'deepforest'],
  ['Crimson Lacquer', 2, 'black', 'crimson', 'gold', 'oxblood'], ['Frosted Steel', 2, 'frost', 'ice', 'silver', 'slate'],
  ['Teal and Rosegold', 2, 'rosegold', 'teal', 'rosegold', 'deepteal'], ['Violet Steel', 2, 'steel', 'purple', 'silver', 'deepviolet'],
  ['Sunset Pilgrim', 2, 'copper', 'flame', 'gold', 'aubergine'], ['Ivory and Wine', 2, 'silver', 'wine', 'gold', 'ivorybase'],
  ['Abyssal Teal', 3, 'obsidian', 'teal', 'glowcyan', 'blackteal'], ['Molten Obsidian', 3, 'obsidian', 'flame', 'ember', 'charcoal'],
  ['Amethyst Gilt', 3, 'amethyst', 'purple', 'gold', 'deepviolet'], ['Jade Dynasty', 3, 'jade', 'crimson', 'gold', 'deepforest'],
  ['Storm Knight', 3, 'storm', 'royal', 'silver', 'slate'], ['Toxic Iron', 3, 'black', 'toxic', 'bronze', 'blackgreen'],
  ['Ivory and Azure', 3, 'silver', 'ice', 'gold', 'ivorybase'], ['Rose Lacquer', 3, 'rosegold', 'rose', 'gold', 'blackplum'],
  ['Sunforged', 4, 'silver', 'crimson', 'gold', 'saffron'], ['Bloodmoon', 4, 'bloodsteel', 'blood', 'silver', 'blackred'],
  ['Glacier King', 4, 'frost', 'royal', 'silver', 'iceblue'], ['Emerald Flame', 4, 'jade', 'flame', 'gold', 'blackgreen'],
  ['Royal Amethyst', 4, 'silver', 'purple', 'gold', 'royalpurple'], ['Ember Crown', 4, 'obsidian', 'crimson', 'gold', 'emberbase'],
  ['Celestial', 5, 'silver', 'void', 'gold', 'midnight'], ['Godforged', 5, 'sunsteel', 'royal', 'gold', 'ivorybase'],
  ['Infernal Regalia', 5, 'black', 'flame', 'gold', 'crimsonbase'], ['Spectral', 5, 'frost', 'cyan', 'glowcyan', 'deepviolet'],
  ['Verdant God', 5, 'jade', 'saffron', 'gold', 'emeraldbase'], ['Rose Eclipse', 5, 'obsidian', 'rose', 'rosegold', 'blackplum'],
  // added with the collection 02 armors and helmet sets 02/03 (appended: saves keep their finish by index)
  ['Rust and Linen', 0, 'rust', 'linen', 'bronze', 'rustbase'], ['Bog Iron', 0, 'iron', 'olive', 'copper', 'peat'],
  ['Harbor Watch', 0, 'pewter', 'navy', 'brass', 'driftwood'], ['Mustard Levy', 0, 'iron', 'mustard', 'pewter', 'charcoal'],
  ['Thornwood', 1, 'gunmetal', 'garnet', 'bronze', 'deepforest'], ['Sea Glass', 1, 'silver', 'seaglass', 'pewter', 'slate'],
  ['Indigo Ward', 1, 'steel', 'indigo', 'brass', 'charcoal'], ['Verdigris Watch', 1, 'verdigris', 'wine', 'copper', 'olive'],
  ['Garnet Court', 2, 'silver', 'garnet', 'gold', 'garnetbase'], ['Lilac Mourning', 2, 'pearl', 'lilac', 'silver', 'deepviolet'],
  ['Copper Indigo', 2, 'copper', 'indigo', 'gold', 'indigobase'], ['Verdigris Crown', 2, 'verdigris', 'saffron', 'brass', 'tealbase'],
  ['Nightshade', 3, 'obsidian', 'nightshade', 'silver', 'blackplum'], ['Pearl and Garnet', 3, 'pearl', 'garnet', 'gold', 'ivorybase'],
  ['Wyrmscale', 3, 'jade', 'ember', 'bronze', 'blackgreen'], ['Tidecaller', 3, 'seaglass', 'royal', 'silver', 'tealbase'],
  ['Dawnbreaker', 4, 'pearl', 'dawn', 'gold', 'ivorybase'], ['Hellforged', 4, 'black', 'ember', 'copper', 'blackred'],
  ['Starlit Court', 4, 'silver', 'indigo', 'gold', 'indigobase'], ['Aurora Warden', 4, 'frost', 'aurora', 'silver', 'blackteal'],
  ['Eclipse Gold', 5, 'obsidian', 'saffron', 'gold', 'midnight'], ['Abyss Crown', 5, 'storm', 'nightshade', 'glowcyan', 'blackplum'],
  ['Prismatic Saint', 5, 'pearl', 'aurora', 'gold', 'ivorybase'], ['Phoenix Regalia', 5, 'sunsteel', 'dawn', 'gold', 'emberbase'],
];

export const PALETTES = P.map(([name, tier, metal, cloth, trim, base]) => ({
  name, tier, k: metal ? (tier ? 0.88 : 0.8) : 0,
  ramps: metal ? { metal: R[metal], cloth: R[cloth], trim: R[trim], leather: R[base] } : null,
  glow: metal ? R[cloth][2] : null,
}));

// Effects worn by high rarity body armor. Parts (all optional): glow = outline glow strength; orbs = orbiting
// lights {n, r (tiles), speed (rad/s), size, pattern: ring | eight | double | wobble, trail}; parts = particle
// emitters [{kind: mote | ember | spark | frost | smoke | flame | rune, rate (/s)}]; ring = rune circle at the feet.
// col: fixed colour (else the finish's glow, else the rarity colour).
export const GEAR_FX = [
  { name: 'Shimmer', tier: 2, glow: 0.35 },
  { name: 'Motes', tier: 2, glow: 0.2, parts: [{ kind: 'mote', rate: 5 }] },
  { name: 'Twin Wisps', tier: 2, orbs: { n: 2, r: 0.55, speed: 2.2, size: 2.5, pattern: 'ring' } },
  { name: 'Radiance', tier: 3, glow: 0.6, parts: [{ kind: 'mote', rate: 9 }] },
  { name: 'Orbiting Wisps', tier: 3, glow: 0.3, orbs: { n: 3, r: 0.6, speed: 2.4, size: 3, pattern: 'ring' } },
  { name: 'Smoldering', tier: 3, glow: 0.35, col: '#ff7020', parts: [{ kind: 'ember', rate: 14 }] },
  { name: 'Rime', tier: 3, glow: 0.4, col: '#a0e0ff', parts: [{ kind: 'frost', rate: 12 }] },
  { name: 'Static', tier: 3, glow: 0.3, col: '#a0c8ff', parts: [{ kind: 'spark', rate: 7 }] },
  { name: 'Shade', tier: 3, glow: 0.3, col: '#8040c0', parts: [{ kind: 'smoke', rate: 8 }] },
  { name: 'Wisp Crown', tier: 4, glow: 0.55, orbs: { n: 4, r: 0.65, speed: 2.6, size: 3.4, pattern: 'wobble', trail: true }, parts: [{ kind: 'mote', rate: 6 }] },
  { name: 'Infernal', tier: 4, glow: 0.65, col: '#ff6010', parts: [{ kind: 'flame', rate: 26 }, { kind: 'ember', rate: 10 }] },
  { name: 'Tempest', tier: 4, glow: 0.55, col: '#90b8ff', orbs: { n: 2, r: 0.7, speed: 4, size: 3, pattern: 'eight', trail: true }, parts: [{ kind: 'spark', rate: 14 }] },
  { name: 'Runebound', tier: 4, glow: 0.5, ring: true, parts: [{ kind: 'rune', rate: 4 }] },
  { name: 'Frostfire', tier: 4, glow: 0.6, col: '#60c0ff', orbs: { n: 3, r: 0.6, speed: 2, size: 3.2, pattern: 'ring', trail: true }, parts: [{ kind: 'frost', rate: 16 }] },
  { name: 'Umbral', tier: 4, glow: 0.5, col: '#a020ff', orbs: { n: 3, r: 0.7, speed: -2.2, size: 3, pattern: 'wobble' }, parts: [{ kind: 'smoke', rate: 14 }] },
  { name: 'Ascendant', tier: 5, glow: 0.85, ring: true, orbs: { n: 6, r: 0.75, speed: 2.4, size: 3.2, pattern: 'double', trail: true }, parts: [{ kind: 'mote', rate: 14 }, { kind: 'rune', rate: 3 }] },
  { name: 'Cataclysm', tier: 5, glow: 0.9, col: '#ff4010', ring: true, orbs: { n: 4, r: 0.8, speed: 3, size: 3.6, pattern: 'eight', trail: true }, parts: [{ kind: 'flame', rate: 34 }, { kind: 'ember', rate: 16 }, { kind: 'spark', rate: 6 }] },
  { name: 'Starborn', tier: 5, glow: 0.8, orbs: { n: 5, r: 0.8, speed: 1.8, size: 3.4, pattern: 'wobble', trail: true }, parts: [{ kind: 'spark', rate: 10 }, { kind: 'mote', rate: 12 }] },
  { name: 'Voidheart', tier: 5, glow: 0.85, col: '#c040ff', ring: true, orbs: { n: 6, r: 0.7, speed: -2.6, size: 3, pattern: 'double', trail: true }, parts: [{ kind: 'smoke', rate: 18 }, { kind: 'spark', rate: 8 }] },
  { name: 'Glacial Throne', tier: 5, glow: 0.85, col: '#a0e8ff', ring: true, orbs: { n: 4, r: 0.75, speed: 2.2, size: 3.4, pattern: 'ring', trail: true }, parts: [{ kind: 'frost', rate: 26 }, { kind: 'spark', rate: 5 }] },
];

/** Chance a body armor of each rarity rolls an effect (at its own tier, or one below now and then). */
export const FX_CHANCE = [0, 0, 0.45, 1, 1, 1, 1];

/** Glow colour of a look: the effect's own, else the finish's, else the rarity colour. */
export function fxColor(fx, pal, rarity) {
  return (fx && fx.col) || (pal && pal.glow) || RARITY[rarity].color;
}
