// Thirty-four dungeon biomes, including an outdoor scenario biome. Each has its own palette over a biome pack's art (see below), monster tints and lighting.
import { BREACH_ARCHS } from './breach.js';
// palette -> recolor() params applied to the biome's art (null = as drawn).
// mon -> hue/sat/light shift applied to monster palettes.
import { FINAL_DEPTH } from './depth.js';
export const BIOMES = [
  {
    id: 'catacombs', name: 'Skull-Lined Catacombs', palette: null, dark: 0.82, light: 7.5,
    ambient: { type: 'dust', color: '#c8b89a' }, mon: { hue: 0, sat: 1, light: 0 }, el: 'phys', blood: '#8a0b08',
    adj: ['Grave', 'Crypt', 'Ossuary'], roster: ['skeleton', 'archer', 'zombie', 'ghoul', 'wraith', 'cultist', 'spider', 'bat', 'knight', 'abomination', 'beetle', 'eye'],
    torch: '#ff9a40', fog: '#1a0e08',
  },
  {
    id: 'castle_keep', name: 'Castle Keep', pack: 'castle_keep', palette: null,
    dark: 0.77, light: 8.4,
    ambient: { type: 'dust', color: '#e5b86c' },
    mon: { hue: 30, sat: 0.95, light: 0.03 }, el: 'phys', blood: '#8a0b08',
    adj: ['Royal', 'Black-Iron', 'Oathsworn', 'Siege-Worn'],
    roster: ['knight', 'archer', 'cultist', 'gargoyle', 'golem', 'skeleton',
      'wraith', 'zombie', 'hound', 'imp', 'abomination', 'elemental'],
    torch: '#ffb45d', fog: '#15100b',
  },
  {
    id: 'frozen', name: 'Frozen Ossuary', palette: { colorize: [205, 0.35], light: 0.06, contrast: 1.05 }, dark: 0.76, light: 8,
    ambient: { type: 'snow', color: '#e8f4ff' }, mon: { hue: 180, sat: 0.6, light: 0.1 }, el: 'cold', blood: '#3a7ac8',
    adj: ['Frostbitten', 'Rime', 'Glacial'], roster: ['skeleton', 'archer', 'wraith', 'golem', 'hound', 'elemental', 'knight', 'bat', 'ghoul', 'eye', 'gargoyle', 'zombie'],
    torch: '#8ad8ff', fog: '#0a1420',
  },
  {
    id: 'ice_temple', name: 'Palace of the Everfrost', pack: 'ice_temple',
    palette: null, dark: 0.78, light: 8,
    ambient: { type: 'snow', color: '#c5f4ff' },
    mon: { hue: 185, sat: 0.72, light: 0.09 },
    el: 'cold', blood: '#4185bd',
    adj: ['Everfrozen', 'Rimebound', 'Sapphire', 'Wintersworn'],
    roster: ['skeleton', 'archer', 'wraith', 'golem', 'hound', 'elemental',
      'knight', 'bat', 'ghoul', 'eye', 'gargoyle', 'zombie'],
    torch: '#89d9fc', fog: '#091629',
  },
  {
    id: 'molten', name: 'Molten Depths', palette: { tint: [255, 90, 20, 0.45], sat: 1.3, contrast: 1.1, light: -0.02 }, dark: 0.72, light: 8,
    ambient: { type: 'ember', color: '#ff8a30' }, mon: { hue: -20, sat: 1.3, light: 0 }, el: 'fire', blood: '#ff5a10',
    adj: ['Molten', 'Cinder', 'Magma'], roster: ['imp', 'demon', 'elemental', 'golem', 'hound', 'cultist', 'beetle', 'gargoyle', 'skeleton', 'worm', 'scorpion', 'wraith'],
    torch: '#ff6a10', fog: '#200802',
  },
  {
    id: 'fungal', name: 'Fungal Grotto', palette: { hue: 80, sat: 1.1, tint: [120, 255, 160, 0.18] }, dark: 0.8, light: 7.5,
    ambient: { type: 'spore', color: '#b0ff80' }, mon: { hue: 90, sat: 1.1, light: 0 }, el: 'poison', blood: '#5ac828',
    adj: ['Sporeborn', 'Mycelial', 'Moldering'], roster: ['shroom', 'spider', 'slime', 'worm', 'zombie', 'beetle', 'scorpion', 'eye', 'hound', 'abomination', 'bat', 'cultist'],
    torch: '#a0ff70', fog: '#081408',
  },
  {
    id: 'sunken', name: 'Sunken Crypt', palette: { colorize: [175, 0.33], light: -0.04 }, dark: 0.82, light: 7,
    ambient: { type: 'drip', color: '#7ae0e0' }, mon: { hue: 150, sat: 0.9, light: 0 }, el: 'cold', blood: '#2a8a8a',
    adj: ['Drowned', 'Sodden', 'Tidal'], roster: ['zombie', 'skeleton', 'worm', 'slime', 'wraith', 'eye', 'scorpion', 'ghoul', 'knight', 'archer', 'spider', 'elemental'],
    torch: '#60f0e0', fog: '#04141a',
  },
  {
    id: 'blood', name: 'Halls of Blood', palette: { colorize: [356, 0.55], light: -0.05, contrast: 1.1 }, dark: 0.8, light: 7.5,
    ambient: { type: 'drip', color: '#c01010' }, mon: { hue: -30, sat: 1.4, light: -0.05 }, el: 'blood', blood: '#a00000',
    adj: ['Gorebound', 'Sanguine', 'Crimson'], roster: ['ghoul', 'demon', 'abomination', 'hound', 'cultist', 'bat', 'zombie', 'imp', 'knight', 'slime', 'spider', 'wraith'],
    torch: '#ff3020', fog: '#1a0202',
  },
  {
    id: 'ashen', name: 'Ashen Wastes', palette: { sat: 0.12, light: 0.04, contrast: 0.95 }, dark: 0.74, light: 8,
    ambient: { type: 'ash', color: '#a0a0a0' }, mon: { hue: 0, sat: 0.25, light: 0.05 }, el: 'fire', blood: '#4a4040',
    adj: ['Ashen', 'Charred', 'Smoldering'], roster: ['skeleton', 'golem', 'imp', 'wraith', 'hound', 'archer', 'beetle', 'gargoyle', 'knight', 'zombie', 'cultist', 'elemental'],
    torch: '#ffb070', fog: '#141414',
  },
  {
    id: 'void', name: 'Void Sanctum', palette: { colorize: [275, 0.45], light: -0.08, contrast: 1.1 }, dark: 0.86, light: 7,
    ambient: { type: 'mote', color: '#c070ff' }, mon: { hue: 220, sat: 1.2, light: -0.02 }, el: 'shadow', blood: '#5a10a0',
    adj: ['Voidtouched', 'Nether', 'Hollow'], roster: ['wraith', 'eye', 'elemental', 'cultist', 'demon', 'imp', 'gargoyle', 'knight', 'spider', 'bat', 'slime', 'abomination'],
    torch: '#b050ff', fog: '#0c0418',
  },
  {
    id: 'gilded', name: 'Gilded Tomb', palette: { colorize: [44, 0.62], light: 0.03, contrast: 1.12 }, dark: 0.74, light: 8.5,
    ambient: { type: 'glitter', color: '#ffe080' }, mon: { hue: 30, sat: 1.3, light: 0.05 }, el: 'holy', blood: '#8a0b08',
    adj: ['Gilded', 'Pharaonic', 'Golden'], roster: ['skeleton', 'knight', 'scorpion', 'golem', 'wraith', 'archer', 'beetle', 'cultist', 'gargoyle', 'zombie', 'elemental', 'eye'],
    torch: '#ffd060', fog: '#1a1404',
  },
  {
    id: 'plague', name: 'Plague Sewers', palette: { colorize: [85, 0.42], light: -0.06 }, dark: 0.82, light: 7,
    ambient: { type: 'bubble', color: '#90d040' }, mon: { hue: 70, sat: 0.9, light: -0.04 }, el: 'poison', blood: '#6a9a10',
    adj: ['Plagued', 'Festering', 'Rotten'], roster: ['zombie', 'slime', 'worm', 'abomination', 'spider', 'beetle', 'bat', 'ghoul', 'shroom', 'hound', 'cultist', 'scorpion'],
    torch: '#c0ff40', fog: '#0a1004',
  },
  {
    id: 'crystal', name: 'Crystal Caverns', palette: { colorize: [192, 0.6], contrast: 1.2, light: 0.02 }, dark: 0.72, light: 9,
    ambient: { type: 'glitter', color: '#a0ffff' }, mon: { hue: 170, sat: 1.4, light: 0.06 }, el: 'light', blood: '#40c0ff',
    adj: ['Crystalline', 'Prismatic', 'Shardborn'], roster: ['elemental', 'golem', 'spider', 'eye', 'gargoyle', 'beetle', 'bat', 'scorpion', 'slime', 'wraith', 'knight', 'hound'],
    torch: '#80ffff', fog: '#041418',
  },
  {
    id: 'desert', name: 'Bone Desert Tombs', palette: { colorize: [36, 0.42], light: 0.1 }, dark: 0.7, light: 9,
    ambient: { type: 'sand', color: '#e0c080' }, mon: { hue: 20, sat: 0.9, light: 0.08 }, el: 'phys', blood: '#8a3008',
    adj: ['Sunscorched', 'Dune', 'Sandworn'], roster: ['scorpion', 'skeleton', 'worm', 'beetle', 'archer', 'hound', 'zombie', 'golem', 'gargoyle', 'cultist', 'spider', 'knight'],
    torch: '#ffc070', fog: '#1a1006',
  },
  {
    id: 'shadow', name: 'Shadow Labyrinth', palette: { sat: 0.3, light: -0.16, contrast: 1.1 }, dark: 0.9, light: 6,
    ambient: { type: 'wisp', color: '#504060' }, mon: { hue: 250, sat: 0.4, light: -0.1 }, el: 'shadow', blood: '#20101a',
    adj: ['Shadowed', 'Umbral', 'Lightless'], roster: ['wraith', 'ghoul', 'spider', 'bat', 'hound', 'eye', 'knight', 'cultist', 'imp', 'gargoyle', 'abomination', 'skeleton'],
    torch: '#9a80ff', fog: '#000000',
  },
  {
    id: 'forge', name: 'Infernal Forge', palette: { colorize: [12, 0.65], contrast: 1.15, light: -0.03 }, dark: 0.74, light: 8,
    ambient: { type: 'ember', color: '#ff5a10' }, mon: { hue: -15, sat: 1.4, light: -0.03 }, el: 'fire', blood: '#ff3000',
    adj: ['Infernal', 'Hellforged', 'Brimstone'], roster: ['demon', 'imp', 'golem', 'knight', 'hound', 'gargoyle', 'elemental', 'cultist', 'abomination', 'beetle', 'skeleton', 'scorpion'],
    torch: '#ff4000', fog: '#1e0400',
  },
  {
    id: 'abyss', name: 'Abyssal Chasm', palette: { colorize: [232, 0.5], light: -0.1, contrast: 1.15 }, dark: 0.86, light: 7,
    ambient: { type: 'mote', color: '#6080ff' }, mon: { hue: 200, sat: 1.2, light: -0.05 }, el: 'light', blood: '#2040c0',
    adj: ['Abyssal', 'Deepborn', 'Starless'], roster: ['eye', 'wraith', 'elemental', 'worm', 'spider', 'demon', 'slime', 'knight', 'gargoyle', 'cultist', 'bat', 'abomination'],
    torch: '#6080ff', fog: '#02041a',
  },
  {
    id: 'thorn', name: 'Thornwood Barrow', palette: { colorize: [100, 0.32], light: -0.04 }, dark: 0.8, light: 7.5,
    ambient: { type: 'leaf', color: '#80a040' }, mon: { hue: 60, sat: 0.8, light: -0.02 }, el: 'poison', blood: '#6a2a08',
    adj: ['Thornbound', 'Barrow', 'Bramble'], roster: ['hound', 'spider', 'shroom', 'zombie', 'skeleton', 'archer', 'worm', 'scorpion', 'beetle', 'ghoul', 'cultist', 'golem'],
    torch: '#d0ff80', fog: '#081006',
  },
  {
    id: 'storm', name: 'Storm Spire', palette: { colorize: [214, 0.4], contrast: 1.15, light: 0.02 }, dark: 0.76, light: 8.5,
    ambient: { type: 'spark', color: '#c0e0ff' }, mon: { hue: 190, sat: 1.1, light: 0.04 }, el: 'light', blood: '#3060c0',
    adj: ['Stormwrought', 'Thunder', 'Galvanic'], roster: ['elemental', 'gargoyle', 'golem', 'knight', 'eye', 'hound', 'imp', 'cultist', 'bat', 'skeleton', 'archer', 'wraith'],
    torch: '#a0d0ff', fog: '#060c1a',
  },
  {
    id: 'obsidian', name: 'Obsidian Vault', palette: { sat: 0.25, light: -0.12, contrast: 1.35 }, dark: 0.84, light: 7,
    ambient: { type: 'dust', color: '#8080a0' }, mon: { hue: 260, sat: 0.3, light: -0.08 }, el: 'arcane', blood: '#300830',
    adj: ['Obsidian', 'Glassbound', 'Onyx'], roster: ['golem', 'knight', 'gargoyle', 'elemental', 'wraith', 'eye', 'beetle', 'spider', 'cultist', 'demon', 'skeleton', 'abomination'],
    torch: '#e080ff', fog: '#08060c',
  },
  {
    id: 'flesh', name: 'Flesh Pits', palette: { colorize: [342, 0.45], light: 0.02 }, dark: 0.78, light: 7.5,
    ambient: { type: 'spore', color: '#ff6080' }, mon: { hue: -40, sat: 1.2, light: 0.02 }, el: 'blood', blood: '#b00010',
    adj: ['Fleshwoven', 'Visceral', 'Writhing'], roster: ['abomination', 'worm', 'ghoul', 'slime', 'zombie', 'spider', 'eye', 'hound', 'demon', 'beetle', 'bat', 'shroom'],
    torch: '#ff5070', fog: '#1a0408',
  },
  {
    id: 'serpent', name: 'Serpent Sepulcher', palette: { colorize: [150, 0.4], light: -0.02 }, dark: 0.8, light: 7.5,
    ambient: { type: 'dust', color: '#c8c090' }, mon: { hue: 40, sat: 0.9, light: 0 }, el: 'poison', blood: '#5a7a10',
    adj: ['Serpentine', 'Coiled', 'Venomous'], roster: ['scorpion', 'worm', 'skeleton', 'cultist', 'archer', 'spider', 'knight', 'golem', 'beetle', 'wraith', 'zombie', 'hound'],
    torch: '#a8e070', fog: '#0e0c04',
  },
  {
    id: 'shattered', name: 'Shattered Citadel', palette: { sat: 0.4, light: 0.06, tint: [180, 200, 255, 0.12] }, dark: 0.78, light: 8,
    ambient: { type: 'dust', color: '#a8b0c8' }, mon: { hue: 0, sat: 0.6, light: 0 }, el: 'phys', blood: '#8a0b08',
    adj: ['Shattered', 'Fallen', 'Broken'], roster: ['knight', 'archer', 'gargoyle', 'golem', 'skeleton', 'wraith', 'cultist', 'hound', 'imp', 'elemental', 'bat', 'demon'],
    torch: '#ffb070', fog: '#0a0c12',
  },
  {
    id: 'library', name: 'Haunted Library', palette: { colorize: [28, 0.35], light: -0.06 }, dark: 0.84, light: 7,
    ambient: { type: 'mote', color: '#f0d090' }, mon: { hue: 230, sat: 0.7, light: -0.02 }, el: 'arcane', blood: '#6a1010',
    adj: ['Haunted', 'Forbidden', 'Whispering'], roster: ['wraith', 'cultist', 'eye', 'imp', 'bat', 'skeleton', 'spider', 'elemental', 'gargoyle', 'zombie', 'knight', 'ghoul'],
    torch: '#ffc070', fog: '#100a06',
  },
  {
    id: 'sewers', name: 'The Fetid Sewers', palette: null, dark: 0.8, light: 7.5,
    ambient: { type: 'drip', color: '#9ad070' }, mon: { hue: 75, sat: 0.85, light: -0.02 }, el: 'poison', blood: '#4a6a18',
    adj: ['Fetid', 'Sodden', 'Rat-Gnawed', 'Brackish'], roster: ['zombie', 'slime', 'worm', 'spider', 'beetle', 'ghoul', 'bat', 'abomination', 'cultist', 'shroom', 'scorpion', 'archer'],
    torch: '#a8ff60', fog: '#070c05',
  },
  {
    id: 'necropolis', name: 'Moonlit Necropolis', palette: { colorize: [225, 0.25], light: 0.04, contrast: 1.1 }, dark: 0.8, light: 7.5,
    ambient: { type: 'mote', color: '#c8d8ff' }, mon: { hue: 200, sat: 0.5, light: 0.04 }, el: 'cold', blood: '#4a5a8a',
    adj: ['Moonlit', 'Gravebound', 'Silvered'], roster: ['skeleton', 'zombie', 'ghoul', 'wraith', 'archer', 'knight', 'bat', 'hound', 'gargoyle', 'cultist', 'eye', 'abomination'],
    torch: '#a0c0ff', fog: '#060a16',
  },
  {
    id: 'cathedral', name: 'Desecrated Cathedral', palette: null, dark: 0.8, light: 8,
    ambient: { type: 'mote', color: '#e8d8b0' }, mon: { hue: 0, sat: 0.9, light: 0.02 }, el: 'holy', blood: '#7a0a10',
    adj: ['Desecrated', 'Profane', 'Fallen'], roster: ['knight', 'wraith', 'gargoyle', 'cultist', 'skeleton', 'archer', 'zombie', 'ghoul', 'bat', 'eye', 'imp', 'abomination'],
    torch: '#ffc070', fog: '#120c08',
  },
  {
    id: 'amber', name: 'Amber Wastes', palette: { colorize: [32, 0.7], light: 0.02, contrast: 1.05 }, dark: 0.7, light: 9,
    ambient: { type: 'sand', color: '#ffb050' }, mon: { hue: 25, sat: 1.1, light: 0.04 }, el: 'fire', blood: '#8a3008',
    adj: ['Amber', 'Sunbaked', 'Resinous'], roster: ['scorpion', 'beetle', 'worm', 'golem', 'elemental', 'hound', 'archer', 'skeleton', 'gargoyle', 'imp', 'spider', 'cultist'],
    torch: '#ffa040', fog: '#1a0c02',
  },
  {
    id: 'overworld', name: 'The Forsaken Wilds', pack: 'town', overworld: true,
    palette: null, dark: 0.57, light: 12,
    ambient: { type: 'leaf', color: '#9fb777' }, mon: { hue: 16, sat: 0.85, light: 0.04 },
    el: 'phys', blood: '#7c1610', adj: ['Wilderness', 'Outcast', 'Wayward'],
    roster: ['zombie', 'ghoul', 'hound', 'skeleton', 'archer', 'knight', 'cultist', 'golem', 'spider', 'shroom', 'abomination', 'wraith'],
    torch: '#ffc078', fog: '#0a160d',
  },
  {
    id: 'castle', name: 'Castle', pack: 'castle', overworld: true,
    palette: null, dark: 0.44, light: 12,
    ambient: { type:'mote', color:'#d6c49b' }, mon: { hue:0, sat:0.86, light:0.03 },
    el:'phys', blood:'#7c1610', adj:['Stonebound','Besieged','Iron-Crowned'],
    roster:['zombie','ghoul','bat','gargoyle','skeleton','cultist','abomination','imp','wraith','archer','knight','golem'],
    torch:'#ffc078', fog:'#0a0e13',
  },
  {
    id: 'sea_of_sand', name: 'Sea of Sand', pack: 'sea_of_sand', overworld: true,
    palette: null, dark: 0.58, light: 11.5,
    ambient: { type:'sand', color:'#e3b768' }, mon: { hue:22, sat:0.92, light:0.06 },
    el:'fire', blood:'#9f361a', adj:['Sunscorched','Dune-Bound','Saltworn','Mirage'],
    roster:['sandjackal_dune_stalker','sandjackal_red_mane','sandjackal_sunscar','viper_glassfang','viper_copperhood','viper_nightcoil',
      'scorpion_saltclaw','scorpion_duneburrower','scorpion_embertail','beetle_tombshell','beetle_turquoise_borer','beetle_ironback',
      'locust_suncloud','locust_razorwing','locust_saltmoth','vulture_bonebeak','roclet_ashplume','kitehawk_lapis_eye',
      'skeleton_sunburied','skeleton_jar_guard','skeleton_copper_archer','mummy_saltwrapped','mummy_amberbinder','mummy_lanternbearer',
      'raider_redveil','raider_drygulch','raider_sunlance','wraith_saltworn','wraith_mirage','wraith_drysea',
      'golem_sunbaked','golem_lapisvein','golem_saltpillar','worm_duneborer','worm_glassmaw','worm_fossilcoil',
      'djinn_cinderjar','djinn_bluehour','djinn_sunstung','cultist_sunscarab','cultist_hollowdisc','cultist_dryoracle',
      'hyena_ironjaw','hyena_dustlaugh','hyena_bloodtrack','crab_fossilbreaker','crab_saltglass','crab_copperreef',
      'moth_sunshard','moth_turquoiseveil','moth_nightglass','statue_sphinxling','statue_lionward','statue_bronzebeak',
      'elemental_sirocco','elemental_saltspire','elemental_amberdust','bandit_chainhook','shade_sunmirror','shade_glasspilgrim'],
    torch:'#f2ad55', fog:'#24150a',
  },
  {
    // the largest overworld: thick woods, trail mazes, walled labyrinths and twelve forest trials (docs/DARK_FOREST.md)
    id: 'dark_forest', name: 'The Dark Forest', pack: 'dark_forest', overworld: true, packArt: true,
    palette: null, dark: 0.64, light: 11.5,
    ambient: { type: 'firefly', color: '#b8f07a' }, mon: { hue: 70, sat: 0.8, light: -0.02 },
    el: 'poison', blood: '#5e1410', adj: ['Gloomwood', 'Briar-Bound', 'Moonless', 'Root-Choked'],
    roster: ['spider', 'hound', 'shroom', 'wraith', 'golem', 'archer', 'cultist', 'ghoul', 'zombie', 'bat', 'skeleton', 'slime'],
    torch: '#ffc070', fog: '#060c07',
  },
  {
    // the Sky Battle (docs/SKY_BATTLE.md): the heroes' ironclad against the Air Pirates, eight scenarios and their weather
    id: 'skyship', name: 'The Sky Lanes', pack: 'town', overworld: true,
    palette: null, dark: 0.04, light: 14,
    ambient: { type: 'leaf', color: '#e8f0ff' }, mon: { hue: 0, sat: 1, light: 0 },
    el: 'phys', blood: '#8a0b08', adj: ['Sky-Borne', 'Wind-Lashed', 'Black-Sail', 'Cloud-Running'],
    roster: ['skeleton', 'ghoul', 'archer', 'knight', 'cultist', 'hound', 'demon', 'beetle'],
    torch: '#ffb050', fog: '#0a1020',
  },
  {
    // a wide stone tower climbed by a spiral stair, drawn live in three.js; air pirates and bosses on the roof
    // (world/tower.js, game/tower.js, gfx/tower3d.js, docs/SERPENTINE_TOWER.md)
    id: 'serpentine_tower', name: 'The Serpentine Tower', pack: 'town', overworld: true, tower: true,
    palette: null, dark: 0.3, light: 12,
    ambient: { type: 'mote', color: '#e8d0a0' }, mon: { hue: 0, sat: 0.9, light: 0.02 },
    el: 'phys', blood: '#7c1610', adj: ['Tower', 'Spiral', 'High', 'Lantern-Lit'],
    roster: ['skeleton', 'archer', 'knight', 'gargoyle', 'bat', 'cultist', 'wraith', 'ghoul', 'imp', 'golem', 'spider', 'eye'],
    torch: '#ffb050', fog: '#05060a',
  },
  {
    // passages and caverns down to an underground lake under a tall waterfall, a spiralling shaft up to the top of the
    // falls and its bosses; one smooth height field drawn live in three.js (world/caverns.js, game/caverns.js,
    // gfx/cave3d.js, docs/DEPTHS_EDGE.md). Its creatures are its own (data/depthsedge.js).
    id: 'depths_edge', name: "Depth's Edge Caverns", pack: 'town', overworld: true, cave: true,
    palette: null, dark: 0.6, light: 10,
    ambient: { type: 'drip', color: '#a8d0ff' }, mon: { hue: 0, sat: 1, light: 0 },
    el: 'cold', blood: '#6a1424', adj: ['Deep', 'Chalk', 'Dripping', 'Echoing'],
    roster: ['hound', 'ghoul', 'spider', 'worm', 'scorpion', 'abomination', 'zombie', 'golem', 'cultist', 'shroom', 'beetle', 'gargoyle'],
    torch: '#ffb060', fog: '#050509',
  },
  {
    id: 'desert_temple', name: 'Temple of the Sunless Dynasty', pack: 'desert_temple',
    palette: null, dark: 0.77, light: 8.2,
    ambient: { type: 'sand', color: '#d9ac70' },
    mon: { hue: 28, sat: 0.95, light: 0.04 }, el: 'holy', blood: '#8a2a14',
    adj: ['Sunless', 'Goldbound', 'Dynastic', 'Entombed'],
    roster: ['skeleton', 'archer', 'knight', 'golem', 'cultist', 'scorpion', 'worm', 'wraith', 'zombie', 'beetle', 'gargoyle', 'elemental'],
    torch: '#ffb860', fog: '#140e0b',
  },
  {
    id: 'hell', name: 'HELL — The Infernal Dominion', pack: 'hell',
    palette: null, dark: 0.87, light: 7.1,
    ambient: { type: 'ember', color: '#ff5a25' },
    mon: { hue: -10, sat: 1.36, light: -0.03 },
    el: 'fire', blood: '#b31214',
    adj: ['Hellbound', 'Hellsworn', 'Damned', 'Abyssal'],
    roster: ['demon','imp','knight','gargoyle','abomination','hound',
      'wraith','cultist','elemental','golem','eye','skeleton'],
    torch: '#ff5420', fog: '#17030b',
  },
  {
    id: 'astral_plane', name: 'ASTRAL PLANE — The Celestial Expanse', pack: 'astral_plane',
    palette: null, dark: 0.78, light: 8.8,
    ambient: { type: 'glitter', color: '#b9a4ff' },
    mon: { hue: 247, sat: 1.24, light: 0.08 },
    el: 'light', blood: '#9954cc',
    adj: ['Starborn', 'Astral', 'Celestial', 'Aetherbound'],
    roster: ['wraith','eye','elemental','golem','gargoyle','knight',
      'cultist','bat','slime','spider','demon','archer'],
    torch: '#a08bff', fog: '#0b0921',
  },
  {
    id: 'heavenly', name: 'HEAVENLY — The Empyrean Citadel', pack: 'heavenly',
    palette: null, dark: 0.51, light: 12.2,
    ambient: { type: 'glitter', color: '#ffe6aa' },
    mon: { hue: 27, sat: 0.88, light: 0.10 },
    el: 'holy', blood: '#d2bf93',
    adj: ['Anointed', 'Hallowed', 'Dawnforged', 'Empyrean'],
    roster: ['knight','wraith','eye','golem','cultist','hound','gargoyle',
      'elemental','abomination','archer','demon'],
    torch: '#ffdfab', fog: '#383647',
  },
  {
    id: 'throne', name: "Velscour's Throne", palette: { colorize: [4, 0.72], light: -0.1, contrast: 1.2 }, dark: 0.8, light: 8,
    ambient: { type: 'ember', color: '#ff3a10' }, mon: { hue: -10, sat: 1.5, light: -0.06 }, el: 'fire', blood: '#c00000',
    adj: ['Hellsworn', 'Doom', 'Archfiend'], roster: ['demon', 'imp', 'knight', 'gargoyle', 'abomination', 'hound', 'wraith', 'cultist', 'elemental', 'golem', 'eye', 'skeleton'],
    torch: '#ff2000', fog: '#200000',
  },
];

// Art: every biome is built from a biome pack (assets/tiles/<pack>/, docs/ART.md), recoloured by its `palette`.
// A pack can hold more than one setting: `part` limits a biome to some of its floors (1-based ranges), wall
// families, props, arches and doors (assets.js biomeTileSet).
// Only the three painted packs (Catacombs, Cathedral and Graveyard, Castle Keep) are used for dungeons: the
// Canvas-drawn temple packs (since removed) were flat placeholders that clashed with the painted art.
// A biome takes its floors and props from `pack` and may take its walls, arches and doors from another pack
// (`wallPack`) and extra props from others (`morePacks`); `part` limits each to the pieces that fit the theme
// (1-based floor/prop ranges, wall families, arch and door designs). Everything is recoloured by `palette`
// (walls by `wallPalette` when set). The five temple biomes add their approved painted floors and props
// (gfx/approvedbiomeart.js).
const CAT = 'catacombs', CG = 'cathedral_graveyard', CK = 'castle_keep', DF = 'dark_forest', SEW = 'sewers';
// Sewers is the first ChatGPT-sheet pack (docs/CHATGPT_BIOME_SPRITES.md), drawn in its own colours. The Dark Forest
// pack (roots, thorn hedges, mossy ruins, forest floors) also builds the cave and wood biomes underground.
const CAT_ARCH = { arches: ['roman_ossuary', 'pointed_funerary', 'ironbound_segmental'], doors: ['ironbound_oak', 'iron_grille', 'bone_reliquary'] };
const NAVE_ARCH = { arches: ['chapel_lancet', 'nave_triumphal', 'grand_westwork'], doors: ['cathedral_oak', 'sacristy_bronze'] };
const GRAVE_ARCH = { arches: ['churchyard_cross', 'ruined_cloister', 'processional_cemetery'], doors: ['cemetery_gate'] };
const KEEP_GATES = { arches: ['portcullis_arch', 'great_hall_arch'], doors: ['blackiron_gate', 'armory_door'] };
const DF_ARCH = { arches: ['ancient_root_arch', 'thorn_ruin_arch', 'timber_gateway'], doors: ['ironbound_blackwood', 'woven_thorn', 'carved_ward'] };
const SEW_ARCH = { arches: ['brick_culvert_arch', 'monumental_sluice_gateway', 'iron_reinforced_arch'], doors: ['rotted_oak_sewer_door', 'barred_maintenance_gate', 'rat_emblem_sewer_door'] };
const NAVE = { ...NAVE_ARCH, floors: [[1, 5], [11, 30]], scatter: [[21, 35]], families: ['nave_ashlar', 'stained_glass_chapel', 'buttressed_masonry'] };
const GRAVEYARD = { ...GRAVE_ARCH, floors: [[6, 10], [31, 60]], scatter: [[1, 20], [36, 40]], families: ['cemetery_limestone', 'cemetery_iron'] };
// Castle Keep pale stone halls: limestone, marble and slate floors, carved ashlar walls (palaces, temples, spires).
const KEEP_HALLS = { floors: [[1, 2], [5, 7], [9, 9], [11, 17], [19, 36], [38, 60]],
  scatter: [[1, 3], [8, 13], [16, 21], [27, 30], [37, 38], [40, 40]], families: ['royal_ashlar', 'chapel_carving'] };
// Castle Keep dark iron and brick: guardstone, brick and soot floors (forges, vaults, the throne).
const KEEP_IRON = { floors: [[2, 4], [6, 6], [8, 8], [10, 60]],
  scatter: [[4, 7], [11, 14], [17, 18], [22, 26], [31, 37], [39, 39]], families: ['armory_ironstone', 'underkeep_brick'] };
const KEEP_STUDY = { floors: [[1, 1], [3, 3], [7, 7], [9, 10], [11, 60]],
  scatter: [[2, 3], [10, 13], [15, 21], [28, 30], [35, 38], [40, 40]], families: ['great_hall_paneling', 'chapel_carving', 'royal_ashlar'] };
// All of the Catacombs floors and props with chosen wall families.
const crypt = (...families) => ({ ...CAT_ARCH, floors: [[1, 60]], scatter: [[1, 40]], families });
// Graveyard soil, moss and gravel floors and its outdoor props, under another pack's walls.
const SOIL = { floors: [[6, 10], [31, 60]], scatter: [[1, 20], [36, 40]] };
const CAVE_WALLS = crypt('drowned_crypt', 'crypt_ashlar', 'sealed_cells');
// Rough rock: the Catacombs' drowned and sealed walls round natural caverns.
const ROCK = { ...CAT_ARCH, families: ['drowned_crypt', 'sealed_cells', 'crypt_ashlar'] };
// Prop groups borrowed across packs (1-based indices, see each pack.json)
const CAT_BONES = [[4, 6], [21, 22], [28, 30]], CAT_RITES = [[11, 16], [24, 25], [31, 35]], CAT_STONE = [[17, 19], [32, 32]];
const CG_RUIN = [[29, 32]], CG_GRAVES = [[1, 5], [9, 14]];
const CK_SIEGE = [[15, 16], [19, 22], [31, 31], [35, 35], [37, 37]], CK_CHAINS = [[33, 35]];
// Each biome is one pack's floors and props (`pack`, limited by `part`), walls from `wallPack`, floors and props
// borrowed from others (`moreFloors`, `morePacks`) and town furniture (`townProps`), all in the biome's `palette`.
// `style` picks the level layout (world/dungeon.js STYLES); its rooms and scenarios are in data/biomerooms.js.
const ART = {
  catacombs: { pack: CAT, style: 'crypt' },
  castle_keep: { pack: CK, style: 'hall' },
  sewers: { pack: SEW, style: 'channel', morePacks: [[CAT, CAT_BONES]] },
  frozen: { pack: CAT, style: 'crypt', part: crypt('ossuary_niches', 'crypt_ashlar', 'sealed_cells'), moreFloors: [[CG, [[3, 3], [19, 20]]]] },
  ice_temple: { pack: CK, wallPack: CG, style: 'hall', part: { ...KEEP_HALLS, ...NAVE_ARCH, families: ['stained_glass_chapel', 'nave_ashlar', 'buttressed_masonry'] },
    palette: { colorize: [202, 0.42], light: 0.1, contrast: 1.12 } },
  // volcanic caverns: scorched shale and ash floors in rough rock walls, bones and braziers
  molten: { pack: DF, wallPack: CAT, style: 'cave',
    part: { ...ROCK, floors: [[5, 5], [8, 9], [19, 20], [30, 30], [35, 35], [50, 50], [54, 56]], scatter: [[1, 1], [11, 11], [19, 21], [29, 29], [39, 39]] },
    moreFloors: [[CAT, [[11, 11], [31, 31], [33, 33], [51, 51]]]],
    morePacks: [[CAT, [...CAT_BONES, ...CAT_STONE, [24, 27], [30, 33]]]], palette: { colorize: [16, 0.9], light: 0.05, contrast: 1.3 } },
  // a living cave: loam, moss and fungus floors between tangled roots, mushrooms, spores and egg sacs
  fungal: { pack: DF, wallPack: DF, style: 'cave',
    part: { ...DF_ARCH, floors: [[1, 1], [4, 4], [6, 8], [10, 10], [16, 18], [25, 26], [43, 44], [46, 47], [57, 58]],
      scatter: [[1, 9], [19, 19], [22, 22], [25, 25], [29, 31], [34, 36], [39, 39]], families: ['tangled_roots', 'mossy_ruins', 'blackwood_trunks'] },
    palette: { hue: 32, sat: 1.15, light: 0.03, contrast: 1.08 } },
  sunken: { pack: CAT, style: 'crypt', part: CAVE_WALLS, moreFloors: [[SEW, [[5, 5], [8, 8], [10, 10], [14, 14], [18, 18], [38, 38], [49, 49], [52, 53], [58, 59]]]],
    morePacks: [[SEW, [[3, 3], [17, 17], [24, 24], [33, 33]]]], palette: { colorize: [176, 0.38], light: 0.03, contrast: 1.08 } },
  blood: { pack: CAT, style: 'crypt', part: crypt('ossuary_niches', 'funerary_chapel', 'sealed_cells'),
    moreFloors: [[CK, [[4, 4], [18, 18], [29, 29], [58, 58]]], [CG, [[17, 18]]]], morePacks: [[CK, CK_CHAINS]],
    palette: { colorize: [356, 0.62], light: -0.02, contrast: 1.15 } },
  // a burnt battlefield: ash, charred roots and gravel round broken keep brickwork and siege wreckage
  ashen: { pack: DF, wallPack: CK, style: 'ruin',
    part: { ...KEEP_GATES, floors: [[1, 1], [5, 6], [9, 9], [20, 20], [29, 30], [33, 33], [54, 54], [56, 56]],
      scatter: [[1, 3], [10, 11], [16, 16], [19, 20], [36, 38]], families: ['underkeep_brick', 'royal_ashlar'] },
    moreFloors: [[CK, [[15, 15], [39, 39], [45, 45], [60, 60]]]], morePacks: [[CK, CK_SIEGE]], palette: { sat: 0.1, light: 0.04, contrast: 1.05 } },
  // a profane sanctum: marble and inlay floors in sealed chapel walls, idols, candles and basins
  void: { pack: CK, wallPack: CAT, style: 'maze',
    part: { ...CAT_ARCH, floors: [[5, 5], [9, 10], [16, 16], [19, 19], [22, 22], [32, 32], [36, 36], [38, 38], [47, 47], [49, 49]],
      scatter: [[6, 6], [9, 11], [18, 19], [25, 27], [38, 40]], families: ['funerary_chapel', 'sealed_cells'] },
    moreFloors: [[CAT, [[13, 13], [17, 17], [26, 26], [51, 51]]]], morePacks: [[CAT, CAT_RITES]], palette: { colorize: [275, 0.48], light: -0.04, contrast: 1.12 } },
  gilded: { pack: CK, wallPack: CAT, style: 'hall', part: { ...KEEP_HALLS, ...CAT_ARCH, families: ['funerary_chapel', 'ossuary_niches'] },
    morePacks: [[CAT, [[1, 3], [7, 7], [9, 10], [13, 15], [24, 25], [32, 34]]]], palette: { colorize: [44, 0.62], light: 0.03, contrast: 1.12 } },
  plague: { pack: SEW, style: 'channel', morePacks: [[CAT, [...CAT_BONES, [23, 23]]], [DF, [[8, 9], [30, 31]]]],
    palette: { colorize: [72, 0.55], light: -0.02, contrast: 1.1 } },
  // caverns of shale, gravel and mineral veins round rough rock, crystals and standing stones
  crystal: { pack: DF, wallPack: CAT, style: 'cave',
    part: { ...ROCK, floors: [[5, 5], [9, 9], [35, 36], [50, 50], [53, 53], [55, 55]], scatter: [[1, 1], [11, 11], [21, 21], [29, 29], [39, 39]] },
    moreFloors: [[CK, [[2, 2], [6, 6]]], [CAT, [[11, 11], [18, 18], [31, 31], [50, 50], [56, 56]]]], morePacks: [[CAT, [...CAT_STONE, [24, 24]]], [CG, [[24, 24], [29, 31]]]],
    palette: { colorize: [188, 0.62], light: 0.09, contrast: 1.22 } },
  desert: { pack: CAT, style: 'crypt', part: crypt('crypt_ashlar', 'funerary_chapel', 'ossuary_niches'),
    moreFloors: [[DF, [[35, 36], [51, 51]]], [CG, [[41, 41]]]], palette: { colorize: [36, 0.45], light: 0.1 } },
  shadow: { pack: CAT, style: 'maze', part: crypt('sealed_cells', 'crypt_ashlar', 'funerary_chapel'), palette: { sat: 0.3, light: -0.05, contrast: 1.12 } },
  forge: { pack: CK, style: 'hall', part: { ...KEEP_IRON, ...KEEP_GATES }, townProps: ['anvil_stump', 'cold_forge', 'smith_bellows', 'tool_rack', 'firewood_stack', 'tiles_and_bricks'],
    palette: { colorize: [18, 0.7], contrast: 1.2, light: 0.03 } },
  // the deep: black loam, shale and still pools in drowned rock, runes and standing stones
  abyss: { pack: DF, wallPack: CAT, style: 'cave',
    part: { ...ROCK, floors: [[1, 1], [8, 9], [19, 19], [24, 24], [49, 49], [52, 52], [55, 55], [58, 58]], scatter: [[1, 1], [11, 11], [21, 21], [29, 30], [39, 39]], families: ['drowned_crypt', 'sealed_cells'] },
    moreFloors: [[CAT, [[12, 12], [22, 22], [40, 40], [52, 52]]]], morePacks: [[CAT, [...CAT_STONE, [31, 33]]]], palette: { colorize: [226, 0.55], light: 0.03, contrast: 1.15 } },
  // a barrow under the wood: forest floors in thorn hedges and roots, with graves and mourners
  thorn: { pack: DF, style: 'ruin',
    part: { ...DF_ARCH, floors: [[1, 60]], scatter: [[1, 11], [18, 25], [29, 36], [39, 39]], families: ['thorn_hedge', 'tangled_roots', 'mossy_ruins'] },
    morePacks: [[CG, [...CG_GRAVES, [36, 37]]]], palette: { colorize: [95, 0.34], light: -0.04, contrast: 1.05 } },
  storm: { pack: CK, style: 'hall', part: { ...KEEP_HALLS, families: ['royal_ashlar', 'armory_ironstone'], arches: ['keep_lancet', 'portcullis_arch'] },
    palette: { colorize: [216, 0.36], light: 0, contrast: 1.18 } },
  obsidian: { pack: CK, style: 'maze', part: KEEP_IRON, palette: { sat: 0.22, light: -0.01, contrast: 1.35 } },
  // living tissue: soil, roots and rot recoloured to meat, walled in sinew (tangled roots), bones and egg sacs
  flesh: { pack: DF, wallPack: DF, style: 'cave',
    part: { ...DF_ARCH, floors: [[1, 1], [6, 6], [8, 8], [10, 10], [16, 16], [19, 19], [26, 26], [38, 38], [43, 43], [46, 46], [57, 57]],
      scatter: [[5, 5], [8, 10], [19, 20], [30, 32]], families: ['tangled_roots', 'mossy_ruins'] },
    moreFloors: [[CAT, [[15, 15], [25, 25], [57, 57]]]], morePacks: [[CAT, [...CAT_BONES, [24, 24]]]], palette: { colorize: [345, 0.55], light: 0.02, contrast: 1.08 } },
  serpent: { pack: CAT, wallPack: SEW, style: 'crypt', part: { ...SEW_ARCH, floors: [[1, 60]], scatter: [[1, 40]], families: ['civic_grotesque_relief', 'plain_damp_ashlar'] },
    moreFloors: [[SEW, [[5, 5], [8, 8], [36, 36], [42, 42]]]], morePacks: [[SEW, [[15, 16], [32, 34]]]], palette: { colorize: [150, 0.42], light: -0.01, contrast: 1.06 } },
  shattered: { pack: CK, style: 'ruin', part: KEEP_HALLS, morePacks: [[CG, CG_RUIN], [CK, CK_SIEGE]], palette: { sat: 0.4, light: 0.04, tint: [180, 200, 255, 0.12] } },
  library: { pack: CK, style: 'maze', part: KEEP_STUDY, townProps: ['scroll_rack', 'potion_jars', 'market_table', 'workbench', 'crate_stack'],
    morePacks: [[CAT, [[14, 14], [39, 39]]]], palette: { colorize: [30, 0.38], light: -0.03 } },
  cathedral: { pack: CG, style: 'hall', part: NAVE },
  necropolis: { pack: CG, style: 'ruin', part: GRAVEYARD },
  amber: { pack: CG, wallPack: CAT, style: 'ruin', part: { ...crypt('crypt_ashlar', 'funerary_chapel'), ...SOIL },
    moreFloors: [[DF, [[35, 36], [51, 51]]]], palette: { colorize: [32, 0.7], light: 0.04, contrast: 1.05 } },
  desert_temple: { pack: CK, style: 'hall', part: KEEP_HALLS, palette: { colorize: [36, 0.5], light: 0.06, contrast: 1.05 } },
  hell: { pack: CAT, wallPack: CK, style: 'crypt', part: { floors: [[1, 60]], scatter: [[1, 40]], families: ['underkeep_brick', 'armory_ironstone'],
    arches: ['portcullis_arch', 'great_hall_arch', 'keep_lancet'], doors: ['blackiron_gate', 'crimson_oak'] },
    morePacks: [[CK, CK_CHAINS]], palette: { colorize: [9, 0.88], light: 0.09, contrast: 1.2 } },
  astral_plane: { pack: CG, style: 'hall', part: NAVE, palette: { colorize: [256, 0.58], light: 0.05, contrast: 1.18 } },
  heavenly: { pack: CG, style: 'hall', part: NAVE, palette: { sat: 0.22, light: 0.24, contrast: 0.9, tint: [255, 238, 196, 0.22] } },
  throne: { pack: CK, style: 'hall', part: KEEP_IRON, palette: { colorize: [2, 0.7], light: -0.06, contrast: 1.2 } },
};
for (const b of BIOMES) {
  const a = ART[b.id];
  if (a) {
    b.pack = a.pack; b.part = a.part || null; b.wallPack = a.wallPack || null; b.morePacks = a.morePacks || null;
    b.moreFloors = a.moreFloors || null; b.townProps = a.townProps || null; b.style = a.style || 'crypt';
    if (a.palette) b.palette = a.palette;
  }
  b.painted = ['desert_temple', 'ice_temple', 'hell', 'astral_plane', 'heavenly'].includes(b.id);
  if (!b.pack) b.pack = CAT;
  b.wallPack = b.wallPack || null;
}

// Colour families: a level can mix its palette with another biome of the same family (mixPartner), e.g. a
// Frozen Ossuary whose far rooms are paved like the Crystal Caverns.
const FAMILY = {
  sand: ['desert', 'gilded', 'serpent', 'amber', 'desert_temple', 'sea_of_sand'],
  keep: ['castle_keep'],
  frost: ['frozen', 'ice_temple', 'sunken', 'crystal', 'storm', 'abyss', 'necropolis'],
  ember: ['molten', 'blood', 'forge', 'flesh', 'hell'],
  rot: ['fungal', 'plague', 'thorn', 'sewers'],
  gloom: ['catacombs', 'ashen', 'void', 'shadow', 'obsidian', 'shattered', 'library', 'cathedral'],
  aether: ['astral_plane'],
  celestial: ['heavenly'],
};
for (const [f, ids] of Object.entries(FAMILY)) for (const id of ids) BIOMES.find((b) => b.id === id).family = f;


export const MIX_CHANCE = 0.65;
/** Maybe pick a like-coloured biome on the same packs to mix floors (and maybe walls) with, or null. The temple biomes'
 * extra painted floors (`painted`) would shift the partner's tile indices, so they never mix. */
export function mixPartner(biome, rnd = Math.random) {
  if (!biome.family || rnd() >= MIX_CHANCE) return null;
  const kin = BIOMES.filter((b) => b.family === biome.family && b.id !== biome.id && b.pack === biome.pack && b.wallPack === biome.wallPack && !b.painted && !biome.painted);
  return kin.length ? kin[Math.floor(rnd() * kin.length)] : null;
}

// Beta biomes: never in a biome bag or the overworld guarantee. Velscour's skull button reaches them (the "mountain"
// message, or first on the HAIL VELSCOUR! list; game.js openVelscourContact).
export const BETA_BIOMES = [
  {
    // a height-mapped climb up a mountainside to its summit (world/mountain.js, docs/MOUNTAINSIDE.md)
    id: 'mountainside', name: 'Mountainside', pack: 'town', overworld: true, beta: true, painted: false, wallPack: null,
    palette: null, dark: 0.3, light: 13,
    ambient: { type: 'leaf', color: '#d8e6c0' }, mon: { hue: 8, sat: 0.9, light: 0.04 },
    el: 'cold', blood: '#7c1610', adj: ['Windswept', 'Craggy', 'High', 'Rimed'],
    roster: ['hound', 'golem', 'gargoyle', 'bat', 'archer', 'skeleton', 'knight', 'elemental', 'spider', 'cultist', 'wraith', 'imp'],
    torch: '#ffc078', fog: '#0c1622',
  },
];

// THE ETERNAL BREACH (docs/ETERNAL_BREACH.md): the challenge biome behind the purple portal in Herrington Hollow. Never in
// a biome bag, the overworld guarantee or Velscour's list; its floors are counted apart (c.breach). Island tops and
// scatter from the Veilscar March pack, ruins (walls, arches, doors, paving) and crypt scatter from the Eternal Breach
// pack; the Veilscar March's own walls, arches and doors join the ruins (BREACH_WALLS).
export const BREACH_BIOME = {
  id: 'eternal_breach', name: 'The Eternal Breach', pack: 'veilscar_march', wallPack: 'eternal_breach', overworld: true, packArt: true,
  challenge: true, painted: false, palette: null, part: null,
  moreFloors: [['eternal_breach', [[1, 60]]]], morePacks: [['eternal_breach', [[1, 40]]]],
  dark: 0.3, light: 13, ambient: { type: 'mote', color: '#c890ff' }, mon: null,
  el: 'arcane', blood: '#4a1460', adj: ['Riftborn', 'Unmoored', 'Void-Touched', 'Breachbound'],
  roster: BREACH_ARCHS, torch: '#b060ff', fog: '#0e0518',
};
export const BREACH_WALLS = { id: 'eternal_breach_veilscar', name: 'The Veilscar March', pack: 'veilscar_march', overworld: true, packArt: true, palette: null, part: null };

export const BIOME_BY_ID = Object.fromEntries([...BIOMES, ...BETA_BIOMES, BREACH_BIOME].map((b) => [b.id, b]));

/** Overworlds share the regular biome bag, with a hard visit guarantee after three combat dungeons. */
export const OVERWORLD_BIOME_IDS = BIOMES.filter((b) => b.overworld).map((b) => b.id);

/**
 * A shuffled pool of biomes for the hero's next depth. An overworld is guaranteed after three
 * actual non-overworld dungeon entries. When forced, choose among all registered overworlds so
 * Forsaken Wilds, Sea of Sand, Castle and the Dark Forest all remain in the rotation. The throne is never overridden.
 */
export function drawBiome(c, depth) {
  if (depth === FINAL_DEPTH) return 'throne';
  const all = BIOMES.filter((b) => b.id !== 'throne').map((b) => b.id);
  if ((c.overworldMisses || 0) >= 3) {
    c.biomeBag = (c.biomeBag || []).filter((id) => !OVERWORLD_BIOME_IDS.includes(id) && all.includes(id));
    let options = OVERWORLD_BIOME_IDS.filter((id) => id !== c.lastBiome);
    if (!options.length) options = OVERWORLD_BIOME_IDS;
    return options[Math.floor(Math.random() * options.length)];
  }
  let bag = (c.biomeBag || []).filter((id) => all.includes(id));
  if (!bag.length || (bag.length === 1 && bag[0] === c.lastBiome)) bag = all.slice();
  const pool = bag.filter((id) => id !== c.lastBiome);
  const id = pool[Math.floor(Math.random() * pool.length)];
  c.biomeBag = bag.filter((x) => x !== id);
  return id;
}

/**
 * Up to n different biomes for the next depth (the three portals at a cleared exit, game.portalChoice), drawn like
 * drawBiome but without spending any: takeBiome spends the one chosen. While the overworld guarantee is due they
 * are all overworlds.
 */
export function biomeChoices(c, depth, n = 3) {
  if (depth === FINAL_DEPTH) return ['throne'];
  const all = BIOMES.filter((b) => b.id !== 'throne').map((b) => b.id);
  const mix = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if ((c.overworldMisses || 0) >= 3) {
    const options = OVERWORLD_BIOME_IDS.filter((id) => id !== c.lastBiome);
    return mix(options.length ? options : OVERWORLD_BIOME_IDS).slice(0, n);
  }
  const bag = (c.biomeBag || []).filter((id) => all.includes(id) && id !== c.lastBiome);
  const out = mix(bag).slice(0, n);
  // a bag running dry tops up from the rest (as drawBiome refills it)
  for (const id of mix(all)) if (out.length < n && id !== c.lastBiome && !out.includes(id)) out.push(id);
  return out;
}
/** The portal taken: spend its biome from the bag (and keep the overworld guarantee's bag clean, as drawBiome does). */
export function takeBiome(c, id) {
  if (id === 'throne') return;
  const all = BIOMES.filter((b) => b.id !== 'throne').map((b) => b.id);
  if ((c.overworldMisses || 0) >= 3) { c.biomeBag = (c.biomeBag || []).filter((x) => !OVERWORLD_BIOME_IDS.includes(x) && all.includes(x)); return; }
  let bag = (c.biomeBag || []).filter((x) => all.includes(x));
  if (!bag.includes(id)) bag = all.slice();
  c.biomeBag = bag.filter((x) => x !== id);
}

/** Count actual dungeon *visits* once per depth; town re-entry cannot farm the counter.
 * Saved per hero and reset immediately on visiting any town-tileset overworld biome.
 */
export function recordBiomeVisit(c, biome, depth) {
  if (!c || !biome || depth === FINAL_DEPTH) return;
  const key = String(depth) + ':' + biome.id;
  if (c.overworldLastVisit === key) return;
  c.overworldLastVisit = key;
  if (biome.overworld || biome.pack === 'town') c.overworldMisses = 0;
  else c.overworldMisses = Math.min(3, (c.overworldMisses || 0) + 1);
}
export const TOWN_BIOME = {
  id: 'town', name: 'Herrington Hollow', pack: 'catacombs', palette: { colorize: [30, 0.22], light: 0.12, contrast: 0.95 }, wallPalette: { colorize: [32, 0.2], light: 0.18 },
  dark: 0.45, light: 12, ambient: { type: 'firefly', color: '#ffe890' }, mon: { hue: 0, sat: 1, light: 0 }, blood: '#8a0b08', torch: '#ffb050', fog: '#0a0806',
};
