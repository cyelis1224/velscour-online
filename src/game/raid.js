import { hexToRgb } from '../core/util.js';
// Raid bosses. Every fifth depth (but 100) ends in a BOSS ROOM (world/dungeon.js carveArena): a pillared arena
// holding one of RAID_BOSSES, picked at random. A raid boss is huge and fights in 3 phases (4 from depth 25). Each
// phase plays a randomly rolled rotation of its ability pool, now and then chaining a quick follow-up. At each
// phase change it retreats to the middle of the arena behind warding crystals (it takes 90% less damage until they
// break) while adds pour in. One to three random modifiers change each fight, it enrages after 3 minutes (frenzying every 45 s), and after 5 it executes the hero outright.
// The arena seals behind the hero until the boss dies.
import { G } from '../state.js';
import { rand, chance, TAU, clamp, angleTo, angleDiff, dist, pick, randi, shuffle } from '../core/util.js';
import { isoX, isoY, HW, HH, camera } from '../core/view.js';
import { sfx } from '../core/audio.js';
import { addEffect, Telegraph, Slash, Ring, Bolt, Column, burst, spawn, sparkle, elem, floatText, smoke, addLight, glowSprite } from '../gfx/vfx.js';
import { explosionFx } from '../gfx/shapes.js';
import { hit } from './combat.js';
import { Projectile, Delayed, Area, Fissure, explode, coneTargets, lineTargets } from './hazards.js';
import { ARCH } from '../data/enemies.js';
import { ART_BY_ID } from '../data/bestiary.js';
import { bodyR } from '../world/map.js';
import { makeMonster, monsterBase, Monster } from './monster.js';
import { dropLoot } from './loot.js';
import { UI } from '../ui/ui.js';
import { madnessReady } from './mayhem.js';
import { SIGS, SIG_NAMES, PASSIVES } from './raidsigs.js';

// ------------------------------------------------------------------------------------------------ the bosses
// art: bestiary art ids (one is picked); fx: their projectile look; adds: archetypes that come to their aid;
// cata: the name of their cataclysm; phases: [{name, pool: {ability: weight}}], the 4th only used from depth 25.
export const RAID_BOSSES = [
  {
    id: 'colossus', name: 'Ossuarch', title: 'the Bone Colossus', art: ['bone_colossus', 'ossuary_golem', 'bone_juggernaut', 'catacomb_colossus', 'ossuary_cathedral', 'granite_knuckle_titan'], el: 'phys', fx: 'bone',
    adds: ['skeleton', 'archer', 'knight'], cata: 'BONE STORM',
    phases: [
      { name: 'The Grinding March', pool: { cleave: 3, slam: 2, fissures: 2, charge3: 2 } },
      { name: 'Ossuary Rising', pool: { cleave: 2, shockwave: 3, barrage: 2, adds: 2, fissures: 1 } },
      { name: 'Bone Storm', pool: { cataclysm: 2, spiral: 2, shockwave: 2, slam: 2, charge3: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, spiral: 2, shockwave: 2, barrage: 2, fissures: 2, cleave: 2 } },
    ],
  },
  {
    id: 'pyre', name: 'Pyrethrax', title: 'the Molten Behemoth', art: ['molten_behemoth', 'butcher', 'kilnheart_juggernaut', 'obsidian_volcano_beast', 'obsidian_crown_hydra'], el: 'fire', fx: 'fireball',
    adds: ['imp', 'elemental', 'beetle'], cata: 'SUPERNOVA',
    phases: [
      { name: 'Smoldering', pool: { meteors: 3, cleave: 2, pools: 2, slam: 1 } },
      { name: 'Firestorm', pool: { sweep: 3, nova: 2, adds: 2, meteors: 2 } },
      { name: 'Supernova', pool: { cataclysm: 2, fissures: 2, meteors: 2, spiral: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, meteors: 2, sweep: 2, nova: 2, pools: 2 } },
    ],
  },
  {
    id: 'lich', name: 'Vorthul', title: 'the Lich Sovereign', art: ['lich_king', 'sunstaff_lich', 'rime_antler_lich', 'tide_bell_necromancer'], el: 'cold', fx: 'shard',
    adds: ['wraith', 'skeleton', 'cultist'], cata: "DEATH'S WINTER",
    phases: [
      { name: 'The Cold Court', pool: { orbs: 3, spiral: 2, blink_slam: 2, nova: 1 } },
      { name: 'Hall of Mirrors', pool: { clones: 3, nova: 2, adds: 2, barrage: 2 } },
      { name: "Death's Winter", pool: { cataclysm: 2, sweep: 2, orbs: 2, barrage: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, clones: 1, spiral: 2, orbs: 2, barrage: 2, blink_slam: 2 } },
    ],
  },
  {
    id: 'maws', name: 'The Mother of Maws', title: 'Queen of the Brood', art: ['hive_of_mouths', 'many_armed_horror', 'conjoined_horror', 'crypt_maw_patriarch', 'chitin_brood_duchess', 'leech_crown_abomination', 'fungal_mire_mother'], el: 'poison', fx: 'blob',
    adds: ['spider', 'worm', 'slime'], cata: 'DEVOURING HUNGER',
    phases: [
      { name: 'Brood Call', pool: { pools: 3, cleave: 2, vortex: 2, adds: 1 } },
      { name: 'The Swarming Dark', pool: { adds: 3, shockwave: 2, barrage: 2, pools: 2 } },
      { name: 'Devouring Hunger', pool: { cataclysm: 2, vortex: 2, spiral: 2, pools: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, vortex: 2, barrage: 2, shockwave: 2, pools: 2 } },
    ],
  },
  {
    id: 'eye', name: 'The All-Seeing', title: 'Tyrant of a Thousand Gazes', art: ['eye_tyrant', 'all_seeing', 'void_shell_emperor'], el: 'arcane', fx: 'orb',
    adds: ['eye', 'wraith'], cata: 'GAZE OF ANNIHILATION',
    phases: [
      { name: 'The Watching', pool: { sweep: 3, orbs: 2, nova: 2 } },
      { name: 'Many Eyes', pool: { clones: 2, sweep: 2, barrage: 2, adds: 2 } },
      { name: 'Annihilation', pool: { cataclysm: 2, sweep: 2, spiral: 2, orbs: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, sweep: 3, spiral: 2, barrage: 2, clones: 1 } },
    ],
  },
  {
    id: 'reaper', name: 'Mortheus', title: 'Reaper of the Depths', art: ['grim_reaper', 'four_armed_reaver', 'ramskull_headsman', 'shroud_reaper', 'umbral_jaw_nun'], el: 'shadow', fx: 'skull',
    adds: ['ghoul', 'hound', 'wraith'], cata: 'HARVEST OF SOULS',
    phases: [
      { name: 'The Hunt', pool: { cleave: 3, blink_slam: 2, charge3: 2 } },
      { name: 'Soul Tide', pool: { vortex: 2, fissures: 2, adds: 2, cleave: 2 } },
      { name: 'The Harvest', pool: { cataclysm: 2, shockwave: 2, spiral: 2, blink_slam: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, blink_slam: 2, vortex: 2, shockwave: 2, charge3: 2 } },
    ],
  },
  {
    id: 'pontiff', name: 'The Ossified Pontiff', title: 'Voice of the Bone Choir', art: ['ossified_bishop', 'wax_cathedral_saint', 'cathedral_organ_walker'], el: 'holy', fx: 'bolt',
    adds: ['cultist', 'zombie', 'knight'], cata: 'THE FINAL RITE',
    phases: [
      { name: 'Sermon of Ash', pool: { meteors: 2, nova: 2, orbs: 2, cleave: 1 } },
      { name: 'Choir of Bones', pool: { vortex: 2, barrage: 2, adds: 2, meteors: 1 } },
      { name: 'The Final Rite', pool: { cataclysm: 2, sweep: 2, spiral: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, meteors: 2, sweep: 2, vortex: 2, nova: 2 } },
    ],
  },
  {
    id: 'carapace', name: 'Chitinax', title: 'the Thunder Carapace', art: ['shell_horror', 'prison_crab_sovereign', 'coral_throne_leviathan'], el: 'light', fx: 'spark',
    adds: ['scorpion', 'beetle', 'spider'], cata: 'STORMBREAK',
    phases: [
      { name: 'Armored Advance', pool: { charge3: 3, slam: 2, pools: 1, cleave: 2 } },
      { name: 'Static Swarm', pool: { shockwave: 2, fissures: 2, adds: 2, barrage: 1 } },
      { name: 'Stormbreak', pool: { cataclysm: 2, barrage: 2, spiral: 2, charge3: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, charge3: 2, shockwave: 2, barrage: 2, fissures: 2 } },
    ],
  },
  // ---- the second host: each has an innate modifier (on top of the rolled ones) and its own build (hp/spd/dmg)
  {
    id: 'hydra', name: 'Nine-Throat', title: 'the Fen Hydra', art: ['fen_trident_hydra', 'bloodcrest_hydra', 'violet_thorn_hydra', 'jade_antler_hydra'], el: 'poison', fx: 'blob',
    adds: ['worm', 'slime', 'spider'], cata: 'HUNDRED FANGS', innate: 'relentless', hp: 1.1, spd: 0.8,
    phases: [
      { name: 'Many Mouths', pool: { barrage: 3, pools: 2, cleave: 2, orbs: 1 } },
      { name: 'Regrowth', pool: { pools: 2, spiral: 2, adds: 2, barrage: 2 } },
      { name: 'Hundred Fangs', pool: { cataclysm: 2, barrage: 2, vortex: 2, pools: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, barrage: 3, spiral: 2, pools: 2, orbs: 2 } },
    ],
  },
  {
    id: 'rimehydra', name: 'Skaldrith', title: 'the Rime-Forked', art: ['rime_fork_hydra', 'azure_sail_hydra', 'glacier_crown_titan'], el: 'cold', fx: 'shard',
    adds: ['elemental', 'wraith', 'golem'], cata: 'ENDLESS WINTER', innate: 'warded', hp: 1.15, spd: 0.85,
    phases: [
      { name: 'Hoarfrost', pool: { sweep: 3, fissures: 2, cleave: 2 } },
      { name: 'Glacial Coil', pool: { nova: 3, orbs: 2, adds: 2, slam: 1 } },
      { name: 'Endless Winter', pool: { cataclysm: 2, sweep: 2, nova: 2, fissures: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, sweep: 2, nova: 2, orbs: 2, fissures: 2 } },
    ],
  },
  {
    id: 'obsidrake', name: 'Kael-Vharros', title: 'the Obsidian Wyrm', art: ['obsidian_horn_dragon', 'bonewhite_crypt_dragon'], el: 'fire', fx: 'fireball',
    adds: ['imp', 'demon', 'gargoyle'], cata: 'WORLDBURN', innate: 'empowered', hp: 1.2, spd: 1.1,
    phases: [
      { name: 'Wingbeat', pool: { charge3: 3, sweep: 2, meteors: 2 } },
      { name: 'Scorched Sky', pool: { meteors: 3, fissures: 2, adds: 1, sweep: 2 } },
      { name: 'Worldburn', pool: { cataclysm: 2, meteors: 2, charge3: 2, spiral: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, meteors: 3, sweep: 2, charge3: 2, nova: 1 } },
    ],
  },
  {
    id: 'stormdrake', name: 'Azhurak', title: 'the Storm Drake', art: ['cobalt_storm_drake', 'tempest_manta'], el: 'light', fx: 'spark',
    adds: ['bat', 'elemental', 'gargoyle'], cata: 'SKYSPLITTER', innate: 'storming', hp: 0.9, spd: 1.3,
    phases: [
      { name: 'Thunderhead', pool: { blink_slam: 3, orbs: 2, nova: 2 } },
      { name: 'Chain Lightning', pool: { barrage: 3, sweep: 2, adds: 2 } },
      { name: 'Skysplitter', pool: { cataclysm: 2, blink_slam: 2, spiral: 2, sweep: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, blink_slam: 3, barrage: 2, orbs: 2, nova: 2 } },
    ],
  },
  {
    id: 'sunscale', name: 'Aurelion', title: 'the Golden Sunscale', art: ['golden_sunscale', 'amethyst_crown_dragon'], el: 'holy', fx: 'bolt',
    adds: ['knight', 'gargoyle', 'cultist'], cata: 'SOLAR FLARE', innate: 'colossal', hp: 1, spd: 1,
    phases: [
      { name: 'Dawnfire', pool: { sweep: 3, nova: 2, cleave: 2 } },
      { name: 'Zenith', pool: { meteors: 2, sweep: 2, adds: 2, orbs: 2 } },
      { name: 'Solar Flare', pool: { cataclysm: 2, spiral: 2, sweep: 2, slam: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, sweep: 3, meteors: 2, spiral: 2, nova: 2 } },
    ],
  },
  {
    id: 'mammoth', name: 'Grundholt', title: 'the Thornback Mammoth', art: ['thornback_mammoth', 'blizzard_woolback', 'armored_boar_patriarch'], el: 'phys', fx: 'bone',
    adds: ['hound', 'beetle', 'golem'], cata: 'STAMPEDE', innate: 'colossal', hp: 1.25, spd: 1.15,
    phases: [
      { name: 'Trample', pool: { charge3: 4, slam: 2, cleave: 2 } },
      { name: 'Herd Call', pool: { charge3: 2, adds: 3, shockwave: 2 } },
      { name: 'Stampede', pool: { cataclysm: 2, charge3: 3, fissures: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, charge3: 3, slam: 2, shockwave: 2, fissures: 2 } },
    ],
  },
  {
    id: 'mantis', name: 'Kz\'tetrix', title: 'the Clockwork Mantis', art: ['clockwork_mantis_monarch', 'chainwheel_tyrant', 'quicksilver_sentinel'], el: 'light', fx: 'spark',
    adds: ['golem', 'scorpion', 'spider'], cata: 'OVERCLOCK', innate: 'relentless', hp: 0.85, spd: 1.35,
    phases: [
      { name: 'Wind-Up', pool: { cleave: 3, blink_slam: 2, fissures: 2 } },
      { name: 'Gear Grind', pool: { spiral: 2, cleave: 2, clones: 2, barrage: 2 } },
      { name: 'Overclock', pool: { cataclysm: 2, blink_slam: 2, cleave: 2, spiral: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, blink_slam: 3, cleave: 2, spiral: 2, clones: 1 } },
    ],
  },
  {
    id: 'harvester', name: 'Sanguis', title: 'the Bloodglass Harvester', art: ['bloodglass_harvester', 'carrion_butcher_king'], el: 'shadow', fx: 'skull',
    adds: ['ghoul', 'zombie', 'bat'], cata: 'CRIMSON HARVEST', innate: 'vampiric', hp: 1, spd: 1.15,
    phases: [
      { name: 'First Blood', pool: { cleave: 3, charge3: 2, vortex: 2 } },
      { name: 'Exsanguinate', pool: { vortex: 3, pools: 2, adds: 2, cleave: 1 } },
      { name: 'Crimson Harvest', pool: { cataclysm: 2, vortex: 2, spiral: 2, cleave: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, vortex: 3, cleave: 2, charge3: 2, spiral: 1 } },
    ],
  },
  {
    id: 'phoenix', name: 'Cindrel', title: 'the Ashen Phoenix', art: ['ashen_phoenix_horror', 'rotwing_vulture_queen', 'obsidian_roc_matron'], el: 'fire', fx: 'fireball',
    adds: ['imp', 'bat', 'elemental'], cata: 'REBIRTH IN FLAME', innate: 'volatile', hp: 0.9, spd: 1.25,
    phases: [
      { name: 'Ember Wings', pool: { blink_slam: 2, spiral: 3, nova: 2 } },
      { name: 'Ashfall', pool: { meteors: 3, pools: 2, adds: 2 } },
      { name: 'Rebirth in Flame', pool: { cataclysm: 2, spiral: 2, meteors: 2, nova: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, spiral: 3, meteors: 2, blink_slam: 2, nova: 2 } },
    ],
  },
  {
    id: 'cephalarch', name: 'Ulmorrah', title: 'the Black Pearl Cephalarch', art: ['black_pearl_cephalarch', 'deepwell_angler'], el: 'arcane', fx: 'orb',
    adds: ['eye', 'slime', 'worm'], cata: 'THE DROWNING DARK', innate: 'swarming', hp: 1.05, spd: 0.9,
    phases: [
      { name: 'Ink Cloud', pool: { vortex: 3, orbs: 2, pools: 2 } },
      { name: 'Tentacle Grasp', pool: { fissures: 2, vortex: 2, adds: 2, barrage: 2 } },
      { name: 'The Drowning Dark', pool: { cataclysm: 2, vortex: 2, orbs: 2, spiral: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, vortex: 2, orbs: 3, barrage: 2, fissures: 2 } },
    ],
  },
  {
    id: 'briar', name: 'The Briarheart', title: 'Sovereign of Thorns', art: ['briarheart_sovereign', 'gallows_oak_hangman', 'bogwood_devourer'], el: 'poison', fx: 'blob',
    adds: ['shroom', 'spider', 'worm'], cata: 'OVERGROWTH', innate: 'warded', hp: 1.15, spd: 0.8,
    phases: [
      { name: 'Rootbind', pool: { fissures: 3, pools: 2, slam: 2 } },
      { name: 'Spore Bloom', pool: { pools: 3, adds: 2, nova: 2 } },
      { name: 'Overgrowth', pool: { cataclysm: 2, fissures: 2, pools: 2, shockwave: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, fissures: 3, pools: 2, shockwave: 2, nova: 2 } },
    ],
  },
  {
    id: 'scarab', name: 'Khepra-Set', title: 'the Scarab Emperor', art: ['sandstone_scarab_emperor', 'gold_scarab_diabolist', 'amber_hive_monolith'], el: 'holy', fx: 'bolt',
    adds: ['scorpion', 'beetle', 'cultist'], cata: 'THE SUN-EATER', innate: 'swarming', hp: 1.1, spd: 1,
    phases: [
      { name: 'Sandstorm', pool: { vortex: 2, barrage: 2, charge3: 2 } },
      { name: 'The Swarm Rises', pool: { adds: 3, orbs: 2, shockwave: 2 } },
      { name: 'The Sun-Eater', pool: { cataclysm: 2, sweep: 2, vortex: 2, barrage: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, sweep: 2, barrage: 2, vortex: 2, charge3: 2 } },
    ],
  },
  {
    id: 'oracle', name: 'Saltmother Ysse', title: 'the Pillar Oracle', art: ['salt_pillar_oracle', 'thundercoil_idol', 'crystal_root_warden'], el: 'arcane', fx: 'orb',
    adds: ['eye', 'elemental', 'cultist'], cata: 'PROPHECY FULFILLED', innate: 'storming', hp: 0.9, spd: 0.7,
    phases: [
      { name: 'Foresight', pool: { orbs: 3, sweep: 2, nova: 2 } },
      { name: 'Many Futures', pool: { clones: 3, orbs: 2, barrage: 2 } },
      { name: 'Prophecy Fulfilled', pool: { cataclysm: 2, spiral: 3, orbs: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, spiral: 2, orbs: 3, clones: 1, sweep: 2 } },
    ],
  },
  {
    id: 'anvil', name: 'Hammerfall', title: 'the Basalt Anvil', art: ['basalt_anvil_guardian', 'magnetite_lodestone', 'blind_cave_titan', 'moss_stone_dragon'], el: 'phys', fx: 'bone',
    adds: ['golem', 'gargoyle', 'beetle'], cata: 'TECTONIC RUIN', innate: 'colossal', hp: 1.35, spd: 0.75,
    phases: [
      { name: 'Forge Strike', pool: { slam: 4, shockwave: 2, cleave: 2 } },
      { name: 'Quake', pool: { fissures: 3, slam: 2, adds: 2 } },
      { name: 'Tectonic Ruin', pool: { cataclysm: 2, shockwave: 3, fissures: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, slam: 3, shockwave: 2, fissures: 2, cleave: 2 } },
    ],
  },
  {
    id: 'moon', name: 'Hrothgeir', title: 'the Moon-Eater', art: ['antlered_moon_eater', 'frostmane_werebear'], el: 'cold', fx: 'shard',
    adds: ['hound', 'wraith', 'bat'], cata: 'ECLIPSE', innate: 'relentless', hp: 1, spd: 1.4,
    phases: [
      { name: 'The Howl', pool: { charge3: 3, cleave: 3, nova: 1 } },
      { name: 'Pack Hunt', pool: { adds: 2, blink_slam: 3, cleave: 2 } },
      { name: 'Eclipse', pool: { cataclysm: 2, blink_slam: 2, charge3: 2, nova: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, blink_slam: 3, charge3: 2, cleave: 2, nova: 1 } },
    ],
  },
  {
    id: 'centipede', name: 'Xyloth', title: 'the Ravenous Centipede', art: ['ravenous_centipede_king', 'manyhand_matriarch'], el: 'poison', fx: 'blob',
    adds: ['worm', 'spider', 'scorpion'], cata: 'THOUSAND LEGS', innate: 'volatile', hp: 1, spd: 1.3,
    phases: [
      { name: 'Burrow', pool: { charge3: 3, fissures: 3, pools: 1 } },
      { name: 'Venom Rain', pool: { barrage: 2, pools: 3, adds: 2 } },
      { name: 'Thousand Legs', pool: { cataclysm: 2, charge3: 2, fissures: 2, spiral: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, charge3: 3, pools: 2, fissures: 2, barrage: 2 } },
    ],
  },
  {
    id: 'cauldron', name: 'Mother Blight', title: 'the Plague Cauldron', art: ['plague_cauldron', 'sarcophagus_bearer', 'grief_mask_mountain'], el: 'poison', fx: 'blob',
    adds: ['zombie', 'slime', 'abomination'], cata: 'BOIL OVER', innate: 'swarming', hp: 1.3, spd: 0.7,
    phases: [
      { name: 'Simmer', pool: { pools: 4, nova: 2, slam: 1 } },
      { name: 'The Brew', pool: { adds: 2, pools: 2, vortex: 2, orbs: 2 } },
      { name: 'Boil Over', pool: { cataclysm: 2, pools: 3, nova: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, pools: 3, vortex: 2, nova: 2, orbs: 2 } },
    ],
  },
  {
    id: 'bailiff', name: 'Bailiff Grimmauld', title: 'Keeper of the Gravebell', art: ['sepulcher_bailiff', 'gravebell_behemoth', 'mausoleum_tortoise', 'joined_mourner'], el: 'shadow', fx: 'skull',
    adds: ['skeleton', 'ghoul', 'wraith'], cata: 'THE DEATH KNELL', innate: 'warded', hp: 1.2, spd: 0.85,
    phases: [
      { name: 'Toll', pool: { shockwave: 3, slam: 2, cleave: 2 } },
      { name: 'Wake the Dead', pool: { adds: 3, shockwave: 2, orbs: 2 } },
      { name: 'The Death Knell', pool: { cataclysm: 2, shockwave: 3, vortex: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, shockwave: 3, slam: 2, vortex: 2, orbs: 2 } },
    ],
  },
  {
    id: 'sorceress', name: 'Lady Vesperine', title: 'the Blood-Veiled', art: ['blood_veil_sorceress', 'obsidian_rift_sorcerer', 'ivory_swan_revenant', 'amethyst_scythe_regent'], el: 'arcane', fx: 'orb',
    adds: ['cultist', 'imp', 'wraith'], cata: 'RIFT COLLAPSE', innate: 'empowered', hp: 0.8, spd: 1.2,
    phases: [
      { name: 'Hexweave', pool: { orbs: 3, blink_slam: 2, nova: 2 } },
      { name: 'Mirror Coven', pool: { clones: 3, barrage: 2, meteors: 2 } },
      { name: 'Rift Collapse', pool: { cataclysm: 2, vortex: 2, orbs: 2, blink_slam: 2 } },
      { name: 'Final Stand', pool: { cataclysm: 1, orbs: 2, blink_slam: 2, meteors: 2, clones: 1, spiral: 2 } },
    ],
  },
  {
    id: 'warlord', name: 'Warlord Brannoc', title: 'the Crimson Greatsword', art: ['crimson_greatsword_knight', 'rust_crown_chief', 'golden_horn_chieftain', 'ram_skull_axeman', 'fourblade_marauder'], el: 'phys', fx: 'bone',
    adds: ['knight', 'archer', 'hound'], cata: 'LAST CHARGE', innate: 'empowered', hp: 1.05, spd: 1.25,
    phases: [
      { name: 'Duel', pool: { cleave: 4, charge3: 2, shockwave: 1 } },
      { name: 'Rally the Host', pool: { adds: 3, cleave: 2, barrage: 2 } },
      { name: 'Last Charge', pool: { cataclysm: 2, charge3: 3, cleave: 2, slam: 1 } },
      { name: 'Final Stand', pool: { cataclysm: 1, cleave: 3, charge3: 2, shockwave: 2, barrage: 2 } },
    ],
  },
  // ---- the third host (game/raidsigs.js): each fight is built on its own mechanic and signature attacks, shared
  // with no other boss. `sigs: true` bosses have no cataclysm; `mech` keys appear once per rotation; `passive` runs every frame.
  {
    id: 'valdric', name: 'Ser Valdric', title: 'the Bound Seraph', art: ['hv_seraph_5', 'thousand_blade_seraph'], el: 'holy', fx: 'holy', sigs: true,
    adds: ['knight', 'cultist'], mech: ['tether'], hp: 1, spd: 1,
    phases: [
      { name: 'Oath of Chains', pool: { judgement_cross: 3, halo: 2, tether: 2 } },
      { name: 'Penance', pool: { tether: 2, judgement_cross: 2, halo: 2, adds: 1 } },
      { name: 'The Unbinding', pool: { judgement_cross: 3, tether: 2, halo: 3 } },
      { name: 'Final Oath', pool: { judgement_cross: 3, halo: 3, tether: 2, adds: 1 } },
    ],
  },
  {
    id: 'ophaniel', name: 'Ophaniel', title: 'Wheel of a Thousand Eyes', art: ['hv_ophanim_5', 'orb_of_blades'], el: 'holy', fx: 'holy', sigs: true,
    adds: ['eye', 'wraith'], mech: ['gaze'], hp: 0.95, spd: 0.8,
    phases: [
      { name: 'The Opening Eye', pool: { wheels: 3, eye_lattice: 2, gaze: 2 } },
      { name: 'Turning Wheels', pool: { gaze: 2, wheels: 3, adds: 1, eye_lattice: 2 } },
      { name: 'Unblinking', pool: { gaze: 2, eye_lattice: 3, wheels: 3 } },
      { name: 'All Eyes Open', pool: { gaze: 2, wheels: 3, eye_lattice: 3, adds: 1 } },
    ],
  },
  {
    id: 'bastion', name: 'Bastion Prime', title: 'the Last Warden', art: ['hv_warden_5', 'keep_golem'], el: 'light', fx: 'spark', sigs: true,
    adds: ['golem', 'knight'], mech: ['conduits'], hp: 1.25, spd: 0.75,
    phases: [
      { name: 'Raise the Walls', pool: { rampart: 3, aegis_bash: 3, conduits: 2 } },
      { name: 'Aegis', pool: { conduits: 2, rampart: 2, aegis_bash: 2, adds: 1 } },
      { name: 'Overload', pool: { conduits: 2, rampart: 3, aegis_bash: 3 } },
      { name: 'Last Bastion', pool: { conduits: 2, rampart: 3, aegis_bash: 3, adds: 1 } },
    ],
  },
  {
    id: 'thessaly', name: 'Thessaly', title: 'Herald of the Ending Hymn', art: ['hv_herald_5', 'iron_choir_absolute'], el: 'holy', fx: 'holy', sigs: true,
    adds: ['cultist', 'zombie'], mech: ['beacons'], hp: 0.9, spd: 1,
    phases: [
      { name: 'Overture', pool: { trumpet: 3, choir: 3, beacons: 2 } },
      { name: 'Crescendo', pool: { beacons: 2, choir: 3, trumpet: 2, adds: 1 } },
      { name: 'The Ending Hymn', pool: { beacons: 2, trumpet: 3, choir: 3 } },
      { name: 'Coda', pool: { beacons: 2, trumpet: 3, choir: 3, adds: 1 } },
    ],
  },
  {
    id: 'vexis', name: 'Vexis', title: 'the Scales of Judgement', art: ['hv_judgement_5', 'black_throne_engine'], el: 'arcane', fx: 'orb', sigs: true, passive: 'vexis',
    adds: ['wraith', 'eye'], mech: ['verdict'], hp: 1.1, spd: 0.85,
    phases: [
      { name: 'Weighing', pool: { scales: 3, verdict: 2 } },
      { name: 'Polarity', pool: { scales: 3, verdict: 2, adds: 1 } },
      { name: 'Sentence', pool: { scales: 3, verdict: 2 } },
      { name: 'Final Verdict', pool: { scales: 4, verdict: 2, adds: 1 } },
    ],
  },
  {
    id: 'aurion', name: 'Aurion', title: 'the Throne-Seraph', art: ['hv_throne_5', 'fallen_archangel'], el: 'holy', fx: 'holy', sigs: true,
    adds: ['knight', 'gargoyle'], mech: ['eclipse'], hp: 1.15, spd: 0.9,
    phases: [
      { name: 'Dawn', pool: { dawn_rays: 3, corona: 2, eclipse: 2 } },
      { name: 'Eclipse', pool: { eclipse: 2, dawn_rays: 2, corona: 2, adds: 1 } },
      { name: 'Corona', pool: { eclipse: 2, corona: 3, dawn_rays: 3 } },
      { name: 'Final Light', pool: { eclipse: 2, corona: 3, dawn_rays: 3, adds: 1 } },
    ],
  },
  {
    id: 'grimscale', name: 'Grimscale', title: 'the Sepulcher Triad', art: ['bone_sepulcher_hydra'], el: 'shadow', fx: 'skull', sigs: true,
    adds: ['skeleton', 'ghoul'], mech: ['heads'], hp: 1.1, spd: 0.8, headsTake: true,
    phases: [
      { name: 'Three Hungers', pool: { heads: 2, grave_breath: 3, bone_lanes: 2 } },
      { name: 'Regrowth', pool: { heads: 2, bone_lanes: 3, grave_breath: 2, adds: 1 } },
      { name: 'Ossuary Rain', pool: { heads: 2, bone_lanes: 3, grave_breath: 3 } },
      { name: 'Last Head', pool: { heads: 2, grave_breath: 3, bone_lanes: 3, adds: 1 } },
    ],
  },
  {
    id: 'ambrecoil', name: 'Ambrecoil', title: 'the Amber Frill', art: ['amber_frill_hydra', 'three_throat_hydra'], el: 'fire', fx: 'fireball', sigs: true,
    adds: ['beetle', 'imp'], mech: ['entomb'], hp: 1, spd: 0.9,
    phases: [
      { name: 'Resin', pool: { entomb: 2, geysers: 3, frill_flash: 2 } },
      { name: 'Hardening', pool: { entomb: 2, frill_flash: 3, geysers: 2, adds: 1 } },
      { name: 'Fossilize', pool: { entomb: 2, geysers: 3, frill_flash: 3 } },
      { name: 'Eternal Amber', pool: { entomb: 2, geysers: 3, frill_flash: 3, adds: 1 } },
    ],
  },
  {
    id: 'copperjaw', name: 'Copperjaw', title: 'the Hammer-Hydra', art: ['copper_hammer_hydra', 'siege_maw'], el: 'phys', fx: 'bone', sigs: true,
    adds: ['golem', 'beetle'], mech: ['mines'], hp: 1.2, spd: 0.85,
    phases: [
      { name: 'Forgefall', pool: { anvil: 3, magnet: 2, mines: 2 } },
      { name: 'Magnetism', pool: { magnet: 3, mines: 2, anvil: 2, adds: 1 } },
      { name: 'Minefield', pool: { mines: 2, magnet: 3, anvil: 3 } },
      { name: 'Slag Heap', pool: { mines: 2, magnet: 3, anvil: 3, adds: 1 } },
    ],
  },
  {
    id: 'leonis', name: 'Ser Leonis', title: 'the Silver Lion', art: ['silver_lion_knight', 'fallen_templar'], el: 'light', fx: 'spark', sigs: true, passive: 'leonis',
    adds: ['knight', 'hound'], mech: ['riposte'], hp: 0.95, spd: 1.3,
    phases: [
      { name: 'The Challenge', pool: { mane_lightning: 3, riposte: 2 } },
      { name: 'Pride', pool: { mane_lightning: 3, riposte: 2, adds: 1 } },
      { name: 'Roar of Silver', pool: { mane_lightning: 4, riposte: 2 } },
      { name: 'Last Duel', pool: { mane_lightning: 4, riposte: 2, adds: 1 } },
    ],
  },
  {
    id: 'nyx', name: 'Nyx', title: 'the Crescent Lancer', art: ['silver_crescent_lancer', 'crimson_reaper'], el: 'arcane', fx: 'shard', sigs: true, passive: 'nyx',
    adds: ['wraith', 'bat'], mech: ['lance_pin'], hp: 0.9, spd: 1.25,
    phases: [
      { name: 'New Moon', pool: { crescent: 3, lance_pin: 2 } },
      { name: 'Waxing', pool: { crescent: 3, lance_pin: 2, adds: 1 } },
      { name: 'Full Moon', pool: { crescent: 4, lance_pin: 2 } },
      { name: 'Blood Moon', pool: { crescent: 4, lance_pin: 2, adds: 1 } },
    ],
  },
  {
    id: 'ashenward', name: 'Ashenward', title: 'the Cinder Colossus', art: ['furnace_colossus', 'the_sable_abattoir'], el: 'fire', fx: 'fireball', sigs: true,
    adds: ['imp', 'elemental'], mech: ['lava_quadrants'], hp: 1.3, spd: 0.75,
    phases: [
      { name: 'Smelting', pool: { magma_trail: 3, cinder_turret: 2, lava_quadrants: 2 } },
      { name: 'Slag Floor', pool: { lava_quadrants: 2, cinder_turret: 3, magma_trail: 2, adds: 1 } },
      { name: 'Meltdown', pool: { lava_quadrants: 2, magma_trail: 3, cinder_turret: 3 } },
      { name: 'Caldera', pool: { lava_quadrants: 2, magma_trail: 3, cinder_turret: 3, adds: 1 } },
    ],
  },
  {
    id: 'ysol', name: 'Voidmother Ysol', title: 'the Unmaking Womb', art: ['void_thing', 'hairmother'], el: 'shadow', fx: 'skull', sigs: true,
    adds: ['wraith', 'slime'], mech: ['null_orbs'], hp: 1.05, spd: 0.8,
    phases: [
      { name: 'Hunger', pool: { defile: 2, tendrils: 3, null_orbs: 2 } },
      { name: 'Unmaking', pool: { null_orbs: 2, defile: 2, tendrils: 3, adds: 1 } },
      { name: 'The Void Below', pool: { null_orbs: 2, defile: 3, tendrils: 3 } },
      { name: 'Return to Nothing', pool: { null_orbs: 2, defile: 3, tendrils: 3, adds: 1 } },
    ],
  },
  {
    id: 'lith', name: 'Prismatic Lith', title: 'the Refracted', art: ['spire_crawler', 'chapel_god'], el: 'light', fx: 'spark', sigs: true,
    adds: ['elemental', 'golem'], mech: ['prisms'], hp: 1.1, spd: 0.8,
    phases: [
      { name: 'Facets', pool: { checkerboard: 3, crystal_growth: 2, prisms: 2 } },
      { name: 'Refraction', pool: { prisms: 2, checkerboard: 2, crystal_growth: 2, adds: 1 } },
      { name: 'Spectrum', pool: { prisms: 2, checkerboard: 3, crystal_growth: 3 } },
      { name: 'White Light', pool: { prisms: 2, checkerboard: 3, crystal_growth: 3, adds: 1 } },
    ],
  },
  {
    id: 'kaela', name: 'Kaela', title: 'the Stormwraith', art: ['crow_matriarch', 'stormshell_tortoise'], el: 'light', fx: 'spark', sigs: true, passive: 'kaela',
    adds: ['bat', 'elemental'], mech: ['storm_cells'], hp: 0.9, spd: 1.2,
    phases: [
      { name: 'Static', pool: { arc_chain: 3, storm_cells: 2 } },
      { name: 'Thunderhead', pool: { storm_cells: 2, arc_chain: 3, adds: 1 } },
      { name: 'Eye of the Storm', pool: { storm_cells: 2, arc_chain: 4 } },
      { name: 'Last Lightning', pool: { storm_cells: 2, arc_chain: 4, adds: 1 } },
    ],
  },
  {
    id: 'hollowmere', name: 'Hollowmere', title: 'the Necrolyte of Rime', art: ['frost_leviathan', 'frozen_bastion'], el: 'cold', fx: 'shard', sigs: true, passive: 'hollowmere',
    adds: ['skeleton', 'zombie'], mech: ['corpse_bombs'], hp: 1.05, spd: 0.85,
    phases: [
      { name: 'First Frost', pool: { glacial_spears: 3, corpse_bombs: 2 } },
      { name: 'Grave Cold', pool: { corpse_bombs: 2, glacial_spears: 3, adds: 1 } },
      { name: 'Deep Winter', pool: { corpse_bombs: 2, glacial_spears: 4 } },
      { name: 'Absolute Zero', pool: { corpse_bombs: 2, glacial_spears: 4, adds: 1 } },
    ],
  },
  {
    id: 'organ', name: 'The Pipe Organ', title: 'Cathedral of Screams', art: ['the_throne_that_screams', 'hungering_cathedral'], el: 'holy', fx: 'holy', sigs: true,
    adds: ['cultist', 'zombie'], mech: ['dance', 'organ_pipes'], hp: 1.15, spd: 0.6,
    phases: [
      { name: 'Prelude', pool: { dance: 2, dissonance: 2, organ_pipes: 2 } },
      { name: 'Fugue', pool: { dance: 2, organ_pipes: 2, dissonance: 2, adds: 1 } },
      { name: 'Requiem', pool: { dance: 3, dissonance: 2, organ_pipes: 2 } },
      { name: 'Last Chord', pool: { dance: 3, dissonance: 2, organ_pipes: 2, adds: 1 } },
    ],
  },
  {
    id: 'saranthe', name: 'Bloodqueen Saranthe', title: 'of the Crimson Court', art: ['blood_siren', 'the_wound_without_end'], el: 'fire', fx: 'fireball', sigs: true,
    adds: ['bat', 'ghoul'], mech: ['thralls', 'hemorrhage'], hp: 1, spd: 1.15,
    phases: [
      { name: 'First Taste', pool: { crimson_crescent: 3, thralls: 2, hemorrhage: 2 } },
      { name: 'The Court Feeds', pool: { thralls: 2, crimson_crescent: 3, hemorrhage: 2, adds: 1 } },
      { name: 'Exsanguination', pool: { thralls: 2, hemorrhage: 2, crimson_crescent: 3 } },
      { name: 'Blood Eternal', pool: { thralls: 2, hemorrhage: 2, crimson_crescent: 3, adds: 1 } },
    ],
  },
  {
    id: 'kragmaul', name: 'Kragmaul', title: 'the Hellforged', art: ['horned_warlord', 'cathedral_devourer'], el: 'fire', fx: 'fireball', sigs: true,
    adds: ['demon', 'imp'], mech: ['wrecking_charge'], hp: 1.25, spd: 1,
    phases: [
      { name: 'Chains of Hell', pool: { hooks: 3, hellfire_grid: 2, wrecking_charge: 2 } },
      { name: 'Brimstone', pool: { wrecking_charge: 2, hellfire_grid: 2, hooks: 2, adds: 1 } },
      { name: 'Infernal Ram', pool: { wrecking_charge: 2, hooks: 3, hellfire_grid: 3 } },
      { name: 'Hellbreak', pool: { wrecking_charge: 2, hooks: 3, hellfire_grid: 3, adds: 1 } },
    ],
  },
  {
    id: 'sekhmun', name: 'Pharaoh Sekhmun', title: 'the Exchanged King', art: ['hv_templar_5', 'the_candle_king'], el: 'holy', fx: 'holy', sigs: true,
    adds: ['zombie', 'scorpion', 'knight'], mech: ['exchange', 'sarcophagi'], hp: 1.05, spd: 1,
    phases: [
      { name: 'The Court of Sand', pool: { scarab_carpet: 3, exchange: 2, sarcophagi: 2 } },
      { name: 'Embalming', pool: { exchange: 2, sarcophagi: 2, scarab_carpet: 3 } },
      { name: 'The Weighing of Hearts', pool: { exchange: 2, scarab_carpet: 3, sarcophagi: 2 } },
      { name: 'Eternal Reign', pool: { exchange: 2, scarab_carpet: 4, sarcophagi: 2 } },
    ],
  },
];

export const RAID_MODS = {
  empowered: { name: 'Empowered', desc: 'deals 25% more damage' },
  colossal: { name: 'Colossal', desc: '35% more life, bigger and slower' },
  relentless: { name: 'Relentless', desc: 'shorter pauses between abilities' },
  swarming: { name: 'Swarming', desc: 'more adds answer its call' },
  volatile: { name: 'Volatile', desc: 'its adds burst when slain' },
  warded: { name: 'Warded', desc: 'an extra warding crystal' },
  vampiric: { name: 'Vampiric', desc: 'heals from the blows it lands' },
  storming: { name: 'Storming', desc: 'a death spiral follows every third ability' },
};

const NAMES = {
  cleave: 'Cleave', slam: 'Earthshatter', shockwave: 'Shockwave', meteors: 'Meteor Storm', spiral: 'Death Spiral', nova: 'Nova',
  sweep: 'Sweeping Ray', adds: 'Call the Horde', charge3: 'Rampage', pools: 'Spew', vortex: 'Vortex', fissures: 'Fault Lines',
  barrage: 'Wall of Death', blink_slam: 'Shadow Step', orbs: 'Seeking Doom', clones: 'Mirror Images',
};
// quick abilities that may chain straight on from another
const FOLLOW = ['nova', 'spiral', 'barrage', 'orbs', 'fissures'];

const later = (w, delay, fn) => w.addHazard({ t: delay, update(dt) { if ((this.t -= dt) <= 0) { fn(); return false; } return true; }, draw() {} });

/** One random rotation of a phase's pool: weighted picks, never the same twice running, one cataclysm/adds at most. */
function rollRotation(pool, once = []) {
  const keys = Object.keys(pool), out = [];
  const n = randi(5, 7);
  for (let i = 0; i < n; i++) {
    const opts = keys.filter((k) => k !== out[i - 1] && !((k === 'cataclysm' || k === 'adds' || k === 'clones' || once.includes(k)) && out.includes(k)));
    const tot = opts.reduce((t, k) => t + pool[k], 0);
    let r = rand(tot), k = opts[0];
    for (const o of opts) if ((r -= pool[o]) < 0) { k = o; break; }
    out.push(k);
  }
  // the cataclysm never opens a rotation: let the fight breathe first
  if ((out[0] === 'cataclysm' || once.includes(out[0])) && out.length > 1) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

function rollMods(depth) {
  const n = depth < 30 ? 1 : depth < 60 ? 2 : 3;
  return shuffle(Object.keys(RAID_MODS)).slice(0, n);
}

/** Build the raid boss for this arena: a random one of RAID_BOSSES (not the same as the hero's last). */
const ENRAGE_T = 180, EXECUTE_T = 300; // seconds from waking until the boss enrages / executes the hero (fights run ~2 min)

/**
 * A BOSS ROOM boss's life in normal monsters of its level (before the 26 x 1.3 and modifiers). It keeps growing from
 * depth 150 to 500 (+1 a depth): hero damage outgrows monster life deep down, and a flat 105 had depth-450 bosses
 * dying in 2-12 s while depth-40 ones took 20-60 s. In the Endless Torment it holds (hero damage falls behind there
 * on its own; tools/tests/endgame.js).
 */
// a BOSS ROOM boss is 26 x 1.3 x this many normals of its level (monsterBase's toughness keeps a normal at ~3 s of hero
// damage at every depth): ~12 normals at depth 5, ~19 by depth 500. Its wards, adds and mechanics stretch that ~3.5x,
// so auto-play takes about two minutes (tools/tests/balance.js with BAL_RAID=1 ... god)
export const raidHpMul = (depth) => 0.35 + Math.min(depth, 500) * 0.0004;
// a BOSS ROOM boss hits for this many normals of its level: 2.7 to depth 10, easing to 1.9 by depth 100 (deeper rooms
// bring a fourth phase and more modifiers, and every hero died in its first depth-100 room at 2.7; was 3.6 when the
// fights lasted 20 s, not two minutes)
export const raidHitMul = (depth) => 2.7 * (1 - 0.3 * clamp((depth - 10) / 90, 0, 1));
/** opts.tpl / opts.art: a given template (copied, maybe renamed) and look instead of a random one (game/tower.js). */
export function makeRaidBoss(world, arena, depth, level, opts = {}) {
  const c = G.char;
  const tpl = opts.tpl || pick(RAID_BOSSES.filter((b) => b.id !== (c && c.lastRaid)));
  if (c && !opts.tpl) c.lastRaid = tpl.id;
  const artId = opts.art || pick(tpl.art.filter((id) => ART_BY_ID[id]));
  const art = ART_BY_ID[artId];
  const mods = rollMods(depth);
  if (tpl.innate && !mods.includes(tpl.innate)) mods.unshift(tpl.innate);
  const has = (k) => mods.includes(k);
  const m = makeMonster(world, art.arch, world.biome, level, 'boss', arena.cx + 4, arena.cy, 0, { art: artId, swap: null });
  const B = monsterBase(level);
  Object.assign(m, {
    ai: 'raid', el: tpl.el, res: { [tpl.el]: 0.4, ...(m.undead ? { poison: 0.5, shadow: 0.3 } : null) },
    scale: has('colossal') ? 2.75 : 2.4, r: 1.05, atkReach: 0.35, speed: 2.4 * (tpl.spd || 1) * (has('colossal') ? 0.88 : 1), atkCd: 1.3,
    maxHp: B.hp * 26 * raidHpMul(depth) * (has('colossal') ? 1.35 : 1) * (tpl.hp || 1) * 1.3, dmg: raidHitMul(depth) * B.dmg * (has('empowered') ? 1.25 : 1), xp: B.xp * 60,
    name: tpl.name.toUpperCase(), title: tpl.title, aura: elem(tpl.el).glow, affixes: has('vampiric') ? ['vampiric'] : [],
    moves: null, patterns: [], isRaid: true, ward: 1, aggroRange: 0,
  });
  m.hp = m.maxHp;
  m.raid = new Raid(m, tpl, arena, depth, mods);
  m.raid.artId = artId;
  m.onDeath = () => m.raid.onDeath();
  return m;
}

// ------------------------------------------------------------------------------------------------ the fight
class Raid {
  constructor(m, tpl, arena, depth, mods) {
    Object.assign(this, { m, tpl, arena, depth, mods });
    const n = depth >= 25 ? 4 : 3;
    this.phases = tpl.phases.slice(0, n);
    this.marks = n === 4 ? [0.72, 0.46, 0.2] : [0.66, 0.33]; // life fractions where the next phase begins
    this.pi = 0; this.rot = []; this.follow = []; this.gap = 2.5; this.t = 0; this.count = 0;
    this.sealed = false; this.announced = false; this.inter = null; this.wards = []; this.minions = []; this.enraged = false;
    this.E = elem(tpl.el);
    this.fx = tpl.fx;
  }
  has(k) { return this.mods.includes(k); }
  get phase() { return this.phases[this.pi]; }
  /** The HUD line under the boss bar. */
  label() {
    const left = Math.max(0, Math.ceil(EXECUTE_T - this.t)), ex = this.m.awake ? ` · Execute ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
    if (this.inter) return `Warded — break the crystals! (${this.wards.filter((c) => !c.dead).length} left)${ex}`;
    return `Phase ${this.pi + 1}/${this.phases.length} · ${this.phase.name}${this.enraged ? ' · ENRAGED' : ''}${ex}`;
  }
  modText() { return this.mods.map((k) => RAID_MODS[k].name).join(' · '); }
  inside(c, pad = 0) {
    const A = this.arena;
    return c.x > A.x + pad && c.x < A.x + A.w - pad && c.y > A.y + pad && c.y < A.y + A.h - pad;
  }

  update(dt) {
    const m = this.m, w = m.world, p = w.player;
    if (!p || p.dead) { m.moving = false; return; }
    this.seeThrough(p, dt);
    const g = this.arena.gate;
    if (!this.announced && dist(p.x, p.y, g.x, (g.y0 + g.y1 + 1) / 2) < 9) {
      this.announced = true;
      UI.centerMsg('BOSS ROOM', `${this.tpl.name}, ${this.tpl.title}, awaits`, 3.2);
      UI.log(`<b style="color:#ff8050">BOSS ROOM</b> ahead: ${this.tpl.name}. ${this.mods.map((k) => `<b>${RAID_MODS[k].name}</b> (${RAID_MODS[k].desc})`).join(', ')}.`, '#ffc0a0');
      sfx('roar', 0.6);
    }
    if (!m.awake) {
      m.moving = false;
      m.face(angleTo(m.x, m.y, p.x, p.y));
      if (!this.inside(p, 1.5)) return;
      this.wake();
    }
    if (!this.sealed && this.inside(p, 1.5)) this.seal();
    this.t += dt;
    this.minHp = Math.min(this.minHp ?? 1, p.hp / p.maxHp);
    // the execute timer: after 3 minutes the boss winds up a killing blow nothing survives (the hero restarts the dungeon)
    if (this.t > EXECUTE_T && !this.execT) {
      this.execT = this.t + 2.5;
      UI.centerMsg('EXECUTE', `${this.tpl.name} ends this`, 2.5);
      addEffect(new Ring(m.x, m.y, 0.2, 9, 2.5, '#ff1010', 9));
      sfx('roar'); sfx('boss');
    }
    if (this.execT && this.t > this.execT) {
      addEffect(new Column(p.x, p.y, '#ff1010', 1.2, 60, 400)); burst(p.x, p.y, 30, 'blood', 50, 6); sfx('thud');
      if (!G.godMode) { p.phoenixCd = Math.max(p.phoenixCd || 0, 1); p.hp = 0; p.die(m); return; }
      this.execT = this.t + 5;
    }
    // the DPS check: enraged after 3 minutes, and harder still every 45 s after that (MADNESS doubles the hero's damage)
    if (!this.enraged && this.t > ENRAGE_T) this.enrage('Too slow, mortal');
    if (this.enraged && this.t > (this.frenzyT || ENRAGE_T + 45)) { this.frenzyT = this.t + 45; m.dmg *= 1.15; m.atkCd *= 0.95; floatText(m.x, m.y, 120, 'FRENZY', '#ff3010', 16, { life: 1.4 }); if (madnessReady()) UI.log('Unleash your MADNESS (G) before it is too late!', '#ff2050'); }
    if (this.tpl.passive && PASSIVES[this.tpl.passive]) PASSIVES[this.tpl.passive](this, dt);
    // heads take the hits: a Grimscale with heads up shrugs off most damage
    if (this.tpl.headsTake && !this.inter) m.ward = (this.heads || []).some((h) => !h.dead) ? 0.4 : 1;
    // next phase
    if (!this.inter && this.pi < this.marks.length && m.hp < m.maxHp * this.marks[this.pi]) { this.startInter(); return; }
    if (this.inter) this.interTick(dt);
    const gapMul = (this.has('relentless') ? 0.75 : 1) * (this.enraged ? 0.6 : 1) * (this.inter ? 1.4 : 1) * (1 - 0.07 * this.pi);
    this.gap -= dt;
    const t = m.pickTarget() || p;
    if (this.gap <= 0) {
      const k = this.next();
      this.gap = (this.follow.length ? 0.35 : rand(2, 3.2)) * gapMul;
      if (this.cast(k, t)) return;
    }
    const d = dist(m.x, m.y, t.x, t.y);
    if (this.inter && dist(m.x, m.y, this.arena.cx, this.arena.cy) > 1.5 && d > m.atkRange(t)) { m.navTo(this.arena.cx, this.arena.cy, dt, m.speed); return; }
    if (d <= m.atkRange(t) + 0.2) {
      m.face(angleTo(m.x, m.y, t.x, t.y));
      m.moving = false;
      if (m.cd <= 0) m.startAction('melee', 0.45, { target: t });
    } else if (!this.inter) m.chase(dt, t);
    else m.moving = false;
  }

  /** The boss is three times a hero's height: fade it while the hero (and what's aimed at them) is behind it. */
  seeThrough(p, dt) {
    const m = this.m, h = m.artH * m.scale;
    const dx = isoX(p.x, p.y) - isoX(m.x, m.y), dy = isoY(m.x, m.y) - isoY(p.x, p.y);
    const behind = p.x + p.y < m.x + m.y && Math.abs(dx) < h * 0.4 && dy > -10 && dy < h;
    m.alpha = clamp((m.alpha ?? 1) + (behind ? -4 : 4) * dt, 0.55, 1);
  }

  next() {
    if (this.follow.length) return this.follow.shift();
    if (!this.rot.length) this.rot = rollRotation(this.phase.pool, this.tpl.mech || []);
    const k = this.rot.shift();
    this.count++;
    // now and then a quick ability chains straight on, more often in later phases
    const quick = this.tpl.sigs && Object.keys(this.phase.pool).filter((f) => f !== k && f !== 'adds' && !(this.tpl.mech || []).includes(f));
    if (!this.tpl.sigs && k !== 'cataclysm' && k !== 'charge3' && chance(0.15 + 0.1 * this.pi)) this.follow.push(pick(FOLLOW.filter((f) => f !== k)));
    // signature bosses chain one of their own attacks instead
    if (quick && quick.length && !(this.tpl.mech || []).includes(k) && k !== 'adds' && chance(0.08 + 0.08 * this.pi)) this.follow.push(pick(quick));
    if (this.has('storming') && this.count % 3 === 0 && k !== 'spiral') this.follow.push(quick && quick.length ? pick(quick) : 'spiral');
    return k;
  }

  wake() {
    const m = this.m, w = m.world;
    m.awake = true;
    this.announced = true;
    this.gap = 2;
    if (w.onBossAwake) w.onBossAwake(m);
    addEffect(new Ring(m.x, m.y, 0.3, 6, 1, this.E.glow, 6));
    sfx('roar'); sfx('boss');
  }

  /** Close the way back: block the corridor tiles outside the arch, behind a wall of light. */
  seal() {
    const w = this.m.world, map = w.map, g = this.arena.gate;
    this.sealed = true;
    this.gateTiles = [];
    for (let x = g.x - 2; x <= g.x - 1; x++) {
      for (let y = g.y0; y <= g.y1; y++) {
        const i = y * map.w + x;
        if (map.t[i] === 1 && !map.block[i]) { map.block[i] = 1; this.gateTiles.push(i); }
      }
    }
    map.flowFrom = [-9, -9];
    w.addHazard((this.barrier = new Barrier(g, this.E)));
    UI.log('The way back is sealed!', '#ff6040');
    if (madnessReady()) UI.log('Your MADNESS is ready. Save it for the boss, or unleash it now (G).', '#ff2050');
    sfx('thud'); sfx('portal', 0.6);
  }
  unseal() {
    if (!this.sealed) return;
    const map = this.m.world.map;
    for (const i of this.gateTiles) map.block[i] = 0;
    map.flowFrom = [-9, -9];
    this.sealed = false;
    if (this.barrier) this.barrier.dead = true;
  }

  enrage(why) {
    const m = this.m;
    this.enraged = true;
    m.speed *= 1.15; m.dmg *= 1.5; m.atkCd *= 0.8;
    if (madnessReady()) UI.log('Your MADNESS is ready: press G (or the MADNESS button) to double your damage!', '#ff2050');
    m.aura = '#ff2000';
    UI.centerMsg(`${this.tpl.name.toUpperCase()} ENRAGES`, why, 2.6);
    addEffect(new Ring(m.x, m.y, 0.2, 5, 0.9, '#ff3010', 7));
    sfx('roar'); sfx('boss');
  }

  // ---------------------------------------------------------------- phase changes: wards and adds
  startInter() {
    const m = this.m, w = m.world, A = this.arena;
    this.inter = { t: 0 };
    this.rot = []; this.follow = [];
    m.state = 'idle'; m.action = null; m.z = 0;
    m.invuln = 1.2;
    // leap to the middle of the arena
    smoke(m.x, m.y, 0, '#140808', 8, 14);
    const [x, y] = w.map.nudge(A.cx, A.cy, bodyR(m));
    m.x = x; m.y = y; m.nav = null;
    explosionFx(x, y, 2.5, this.tpl.el === 'phys' ? 'fire' : this.tpl.el, 'eruption', { shake: 10 });
    this.wards = [];
    m.ward = 0.1;
    w.addHazard(new ShieldFx(m, this));
    this.gap = 3;
    const next = this.phases[this.pi + 1];
    UI.centerMsg(next.name.toUpperCase(), 'Break the warding crystals!', 3);
    UI.log(`${this.tpl.name} raises warding crystals: it takes 90% less damage until they break.`, '#a0d0ff');
    sfx('roar'); sfx('summon');
    if (G.room && !G.game?.isDungeonAuthority(w.depth)) return;
    const n = 3 + (this.depth >= 30 ? 1 : 0) + (this.has('warded') ? 1 : 0);
    const a0 = rand(TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      const [wx, wy] = w.map.nudge(A.cx + Math.cos(a) * 6.5, A.cy + Math.sin(a) * 5.5, 0.45);
      const ward = this.makeWard(wx, wy);
      ward.netId = `raid_ward_${this.pi}_${i}`;
      this.wards.push(w.add(ward));
    }
    this.spawnAdds(this.pi + 1);
  }
  interTick(dt) {
    const m = this.m, I = this.inter;
    I.t += dt;
    const live = this.wards.filter((c) => !c.dead);
    if (!live.length) return this.endInter('The wards shatter!');
    if (I.t > 30) {
      // too slow: the crystals pour themselves into the boss
      for (const c of live) {
        addEffect(new Bolt(c.x, c.y, 40, m.x, m.y, 60, this.E.glow, 0.5, 5));
        explosionFx(c.x, c.y, 1.5, this.tpl.el === 'phys' ? 'arcane' : this.tpl.el, 'explosion');
        c.dead = true;
        m.heal(m.maxHp * 0.04);
      }
      this.endInter('The crystals overload — it drinks their power!');
    }
  }
  endInter(msg) {
    const m = this.m;
    this.inter = null;
    m.ward = 1;
    this.pi++;
    this.rot = [];
    m.speed *= 1.06; m.dmg *= 1.08;
    if (this.pi === this.phases.length - 1) { m.aura = '#ff3010'; m.atkCd *= 0.85; }
    UI.centerMsg(this.phase.name.toUpperCase(), msg, 2.4);
    addEffect(new Ring(m.x, m.y, 0.3, 5, 0.8, this.E.glow, 6));
    sfx('explode'); sfx('roar');
    this.gap = 1.5;
  }

  makeWard(x, y) {
    const m = this.m, E = this.E, raid = this;
    const c = new Monster({
      x, y, team: 'enemy', ai: 'ward', static: true, fly: true, sprite: 'crystal', art: 'va_crystal', artH: 42, swap: { tint: [...hexToRgb(E.glow), 0.75] }, pal: { a: E.glow, c: E.core, w: '#ffffff', m: '#4a4650' }, px: 3, r: 0.45,
      maxHp: m.maxHp * 0.07, hp: m.maxHp * 0.07, level: m.level, dmg: m.dmg * 0.5, xp: m.xp * 0.01, name: 'Warding Crystal', rank: 'champion',
      aura: E.glow, awake: true, el: this.tpl.el, res: {}, goreType: 'spark', atkCd: 3, isWard: true,
    });
    c.cd = rand(1, 3);
    c.wardTick = (dt) => {
      c.moving = false;
      if (m.dead) { c.dead = true; return; }
      if ((c.beamT = (c.beamT || 0) - dt) <= 0) { c.beamT = 0.12; addEffect(new Bolt(c.x, c.y, 44, m.x, m.y, 70, E.glow, 0.13, 2)); }
      m.heal(m.maxHp * 0.002 * dt);
      const p = c.world.player;
      if ((c.cd -= dt) <= 0 && p && !p.dead && dist(c.x, c.y, p.x, p.y) < 12 && c.world.map.los(c.x, c.y, p.x, p.y)) {
        c.cd = rand(2.5, 3.5);
        c.world.addHazard(new Projectile({ world: c.world, src: c, x: c.x, y: c.y, z: 40, ang: angleTo(c.x, c.y, p.x, p.y), speed: 4, range: 12, fx: raid.fx, el: raid.tpl.el, dmg: [c.dmg * 0.8, c.dmg], home: 0.4, size: 1.2 }));
      }
    };
    return c;
  }

  spawnAdds(wave = 1) {
    const m = this.m, w = m.world, A = this.arena, p = w.player;
    if (G.room && !G.game?.isDungeonAuthority(w.depth)) return;
    const archs = this.tpl.adds.filter((a) => ARCH[a]);
    // fodder: monsters take seconds each now, so a wave is a few light ones (35% life), not ten that pile up
    const n = Math.min(7, 1 + wave + Math.floor(this.depth / 40) + (this.has('swarming') ? 2 : 0));
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const [x, y] = w.map.nudge(A.cx + Math.cos(a) * rand(9, 11), A.cy + Math.sin(a) * rand(7, 9), 0.4);
      if (!w.map.walkable(x, y)) continue;
      const champ = chance(0.12 + this.depth * 0.003);
      const c = makeMonster(w, pick(archs), w.biome, m.level - 3 + (champ ? 1 : 0), champ ? 'champion' : 'normal', x, y);
      c.awake = true; c.aggro = p; c.raidAdd = true; c.maxHp *= 0.35; c.hp = c.maxHp;
      c.netId = `raid_add_${this.pi}_${wave}_${i}`;
      if (this.has('volatile')) c.onDeath = () => w.addHazard(new Delayed({ world: w, src: m, x: c.x, y: c.y, r: 1.5, delay: 0.8, fx: 'explosion', el: this.tpl.el === 'phys' ? 'fire' : this.tpl.el, dmg: [c.dmg * 1.2, c.dmg * 1.6] }));
      w.add(c);
      addEffect(new Ring(x, y, 0.1, 1.2, 0.5, this.E.glow, 3));
      smoke(x, y, 0, '#120808', 4, 8);
    }
    sfx('summon');
  }

  onDeath() {
    const m = this.m, w = m.world;
    this.unseal();
    if (w.player) { w.player.raidDmgMul = 1; w.player.raidTakenMul = 1; }
    w.darkK = 0; m.reflect = false;
    // fight record, for balancing (tools/tests/autoplay.js prints it)
    if ((G.raidLog || (G.raidLog = [])).length > 50) G.raidLog.shift();
    G.raidLog.push({ boss: this.tpl.id, depth: this.depth, secs: Math.round(this.t), minHp: +(this.minHp ?? 1).toFixed(2), phases: this.phases.length, mods: this.mods.join(',') });
    for (const c of [...this.wards, ...this.minions]) if (!c.dead) { c.dead = true; burst(c.x, c.y, 30, this.tpl.el, 12, 2); }
    // a raid boss pays out like three guardians
    if (w.player) { dropLoot(w, m); dropLoot(w, m); }
    explosionFx(m.x, m.y, 4, this.tpl.el === 'phys' ? 'fire' : this.tpl.el, 'eruption', { shake: 16 });
    G.flash = 0.6;
  }

  // ---------------------------------------------------------------- abilities
  say(k) {
    const m = this.m, name = k === 'cataclysm' ? this.tpl.cata : NAMES[k] || SIG_NAMES[k];
    if (name) floatText(m.x, m.y, m.artH * m.scale + 10, name, '#ffb070', 15, { life: 1.4, vz: 20 });
  }

  /** Start ability k against t (telegraph + wind-up; perform/tick finish it). False if it can't be used now. */
  cast(k, t) {
    const m = this.m, w = m.world, map = w.map, A = this.arena;
    const ang = angleTo(m.x, m.y, t.x, t.y), d = dist(m.x, m.y, t.x, t.y);
    const tele = (o) => addEffect(new Telegraph(o), 'ground');
    m.face(ang);
    switch (k) {
      case 'cleave': {
        if (d > 5.5) return this.cast('charge', t);
        tele({ kind: 'cone', x: m.x, y: m.y, ang, len: 4, half: 0.85, dur: 0.9 });
        m.startAction('raid_cleave', 0.9, { ang });
        break;
      }
      case 'slam':
        tele({ kind: 'circle', x: m.x, y: m.y, r: 3.4, dur: 1 });
        m.startAction('raid_slam', 1);
        break;
      case 'shockwave':
        tele({ kind: 'circle', x: m.x, y: m.y, r: 1.6, dur: 0.8 });
        m.startAction('raid_shockwave', 0.8);
        break;
      case 'meteors': case 'pools': case 'orbs': case 'nova': case 'spiral': case 'barrage': case 'adds': case 'clones':
        m.startAction('raid_' + k, k === 'adds' || k === 'clones' ? 0.9 : 0.6, { target: t, ang });
        break;
      case 'fissures':
        tele({ kind: 'circle', x: m.x, y: m.y, r: 1.4, dur: 0.8 });
        m.startAction('raid_fissures', 0.8);
        break;
      case 'sweep': {
        const dir = chance(0.5) ? 1 : -1, a0 = ang - dir * 1.4;
        tele({ kind: 'line', x: m.x, y: m.y, ang: a0, len: 14, w: 0.9, dur: 1, color: '#ff40ff' });
        if (this.pi >= 2) tele({ kind: 'line', x: m.x, y: m.y, ang: a0 + Math.PI, len: 14, w: 0.9, dur: 1, color: '#ff40ff' });
        m.startAction('raid_sweep', 1, { a0, dir });
        break;
      }
      case 'charge3': case 'charge': {
        if (k === 'charge3') this.follow.unshift('charge', 'charge');
        const len = Math.min(12, d + 2);
        tele({ kind: 'line', x: m.x, y: m.y, ang, len, w: 1.6, dur: 0.6 });
        m.startAction('charge', 0.6, { ang, len });
        this.say(k === 'charge3' ? 'charge3' : null);
        return true;
      }
      case 'vortex':
        tele({ kind: 'circle', x: m.x, y: m.y, r: 3.4, dur: 3.2 });
        m.startAction('raid_vortex', 0.5);
        break;
      case 'blink_slam': {
        const [x, y] = map.nudge(t.x, t.y, bodyR(m));
        tele({ kind: 'circle', x, y, r: 2.3, dur: 1.1 });
        m.startAction('raid_blink_slam', 1.1, { x, y });
        smoke(m.x, m.y, 10, '#100810', 6, 12);
        break;
      }
      case 'cataclysm': {
        // from the middle of the arena, so the pillars' shadows are where you expect them
        const [x, y] = map.nudge(A.cx, A.cy, bodyR(m));
        if (dist(m.x, m.y, x, y) > 1) {
          smoke(m.x, m.y, 0, '#100810', 8, 14);
          m.x = x; m.y = y; m.nav = null;
          sparkle(x, y, 30, this.E.glow, 16, 0.8);
        }
        const dur = 4;
        m.startAction('raid_cataclysm', dur);
        w.addHazard(new Gathering(m, this, dur));
        UI.centerMsg(this.tpl.cata, 'Hide behind a pillar!', 3.2);
        sfx('boss'); sfx('roar');
        break;
      }
      default: {
        if (!SIGS[k]) return false;
        m.startAction('raid_sig', 0.5, { sig: k, target: t, ang });
        break;
      }
    }
    this.say(k);
    return true;
  }

  perform(a) {
    const m = this.m, w = m.world, el = this.tpl.el, E = this.E, dmg = m.dmg, p = w.player;
    const shotEl = el, fx = this.fx;
    switch (a.kind) {
      case 'raid_cleave':
        for (const c of coneTargets(w, m.team, m.x, m.y, a.ang, 4 + 0.3, 0.85)) m.deal(c, dmg * 2.2, el === 'phys' ? 'phys' : el, { melee: true, knock: 1.2, ang: a.ang });
        for (let i = -1; i <= 1; i++) addEffect(new Slash(m.x, m.y, a.ang + i * 0.5, 2.4, 3.6, 0.3, '#ffd8c0', { width: 14 }));
        sfx('swing'); sfx('phys');
        camera.shake(6);
        break;
      case 'raid_slam':
        explode(w, m, m.x, m.y, 3.4, dmg * 2, 'phys', { knock: 1.5, sound: true }, 'eruption');
        sfx('thud');
        break;
      case 'raid_shockwave': {
        const n = this.pi >= 2 ? 4 : 3;
        for (let i = 0; i < n; i++) later(w, i * 0.75, () => !m.dead && w.addHazard(new RingWave({ world: w, src: m, x: m.x, y: m.y, gap: rand(TAU), gapW: 0.9, dmg: [dmg * 1.1, dmg * 1.4], el, color: E.glow })));
        sfx('thud'); sfx('explode');
        break;
      }
      case 'raid_meteors': {
        const n = 6 + Math.floor(this.depth / 20) + this.pi * 2;
        for (let i = 0; i < n; i++) {
          let x, y;
          if (i === 0 && p) { x = p.x; y = p.y; } else if (p && i % 2) { x = p.x + rand(-3.5, 3.5); y = p.y + rand(-3.5, 3.5); } else { x = this.arena.cx + rand(-12, 12); y = this.arena.cy + rand(-10, 10); }
          if (!w.map.walkable(x, y)) continue;
          w.addHazard(new Delayed({ world: w, src: m, x, y, r: 1.5, delay: 1 + i * 0.14, fx: 'meteor', el: el === 'phys' ? 'fire' : el, dmg: [dmg * 1.4, dmg * 1.8], o: { burn: el === 'fire' } }));
        }
        sfx('boss');
        break;
      }
      case 'raid_pools': {
        for (let i = 0; i < 5; i++) {
          if (!p) break;
          const tx = p.x + (i ? rand(-3.5, 3.5) : 0), ty = p.y + (i ? rand(-3.5, 3.5) : 0);
          if (!w.map.walkable(tx, ty)) continue;
          w.addHazard(new Projectile({ world: w, src: m, x: m.x, y: m.y, z: 60, lob: true, tx, ty, range: 16, fx: 'blob', el: shotEl, dmg: [dmg * 0.8, dmg], exp: 1.2, size: 1.8,
            onLand: (x, y) => w.addHazard(new Area({ world: w, src: m, x, y, r: 1.4, dur: 7, tick: 0.5, dmg: [dmg * 0.25, dmg * 0.32], el: shotEl, fx: { fire: 'fire', cold: 'frost', poison: 'poison', shadow: 'void', arcane: 'void', light: 'storm', holy: 'holy' }[el] || 'poison' })) }));
        }
        sfx('acid');
        break;
      }
      case 'raid_orbs': {
        const n = 2 + (this.pi >= 1 ? 1 : 0);
        for (let i = 0; i < n; i++) w.addHazard(new Projectile({ world: w, src: m, x: m.x, y: m.y, z: 50, ang: a.ang + (i - (n - 1) / 2) * 0.9, speed: 2.8, dur: 7, range: 20, home: 0.45, fx: fx === 'bone' ? 'orb' : fx, el: shotEl, dmg: [dmg * 1.3, dmg * 1.6], exp: 1.8, size: 2.4, light: true }));
        sfx(E.sfx);
        break;
      }
      case 'raid_nova': {
        const rings = 2 + (this.pi >= 2 ? 1 : 0), n = 22;
        for (let r = 0; r < rings; r++) later(w, r * 0.35, () => {
          if (m.dead) return;
          for (let i = 0; i < n; i++) w.addHazard(new Projectile({ world: w, src: m, x: m.x, y: m.y, z: 40, ang: (i / n) * TAU + r * (Math.PI / n), speed: 4.2, range: 14, fx, el: shotEl, dmg: [dmg * 0.6, dmg * 0.8], size: 1.3 }));
          sfx(E.sfx, 0.6);
        });
        break;
      }
      case 'raid_spiral': {
        const arms = 3 + (this.pi >= 2 ? 1 : 0), total = 40, dir = chance(0.5) ? 1 : -1;
        let k = 0;
        const fire = () => {
          if (m.dead || k >= total) return;
          for (let arm = 0; arm < arms; arm++) w.addHazard(new Projectile({ world: w, src: m, x: m.x, y: m.y, z: 40, ang: dir * k * 0.3 + (arm * TAU) / arms, speed: 4.5, range: 13, fx, el: shotEl, dmg: [dmg * 0.5, dmg * 0.65], size: 1.2 }));
          k++;
          later(w, 0.07, fire);
        };
        fire();
        sfx(E.sfx);
        break;
      }
      case 'raid_barrage': {
        const waves = 2 + (this.pi >= 2 ? 1 : 0);
        for (let wv = 0; wv < waves; wv++) later(w, wv * 0.9, () => {
          if (m.dead) return;
          const t = w.player || a.target, ang = t ? angleTo(m.x, m.y, t.x, t.y) : a.ang, px = -Math.sin(ang), py = Math.cos(ang);
          const N = 17, gap = randi(3, N - 5);
          for (let i = 0; i < N; i++) {
            if (i === gap || i === gap + 1) continue;
            const off = (i - (N - 1) / 2) * 0.6, x = m.x + px * off - Math.cos(ang) * 1.5, y = m.y + py * off - Math.sin(ang) * 1.5;
            w.addHazard(new Projectile({ world: w, src: m, x, y, z: 30, ang, speed: 4.2, range: 17, fx, el: shotEl, dmg: [dmg * 0.8, dmg], size: 1.3 }));
          }
          sfx(E.sfx, 0.7);
        });
        break;
      }
      case 'raid_fissures': {
        const n = 8 + (this.pi >= 1 ? 4 : 0), a0 = rand(TAU);
        const wave = (off) => { for (let i = 0; i < n; i++) w.addHazard(new Fissure({ world: w, src: m, x: m.x, y: m.y, ang: a0 + off + (i / n) * TAU, len: 11, dmg: [dmg * 1.1, dmg * 1.4], el, fx: el === 'fire' ? 'fire' : el === 'cold' ? 'ice' : el === 'holy' ? 'holy' : el === 'shadow' ? 'shadow' : 'earth', o: { knock: 0.4 } })); };
        wave(0);
        if (this.pi >= 1) later(w, 0.7, () => !m.dead && wave(Math.PI / n));
        sfx('thud'); camera.shake(8);
        break;
      }
      case 'raid_sweep':
        a.ongoing = true; this.m.state = 'act';
        a.beams = [new SweepBeam(m, a.a0, a.dir, this)];
        if (this.pi >= 2) a.beams.push(new SweepBeam(m, a.a0 + Math.PI, a.dir, this));
        for (const b of a.beams) w.addHazard(b);
        sfx('explode');
        return;
      case 'raid_vortex':
        a.ongoing = true; this.m.state = 'act'; a.t = 0;
        sfx('arcane');
        return;
      case 'raid_blink_slam': {
        smoke(m.x, m.y, 10, '#100810', 6, 12);
        m.x = a.x; m.y = a.y; m.nav = null;
        explode(w, m, m.x, m.y, 2.3, dmg * 2, el === 'phys' ? 'phys' : el, { knock: 1.2 }, 'eruption');
        sfx('thud');
        break;
      }
      case 'raid_sig':
        SIGS[a.sig](this, a.target && !a.target.dead ? a.target : p || a.target);
        break;
      case 'raid_adds':
        this.spawnAdds(1);
        sfx('roar');
        break;
      case 'raid_clones': {
        this.minions = this.minions.filter((c) => !c.dead);
        for (let i = 0; i < 2 && this.minions.length < 4; i++) {
          const a2 = rand(TAU);
          const [x, y] = w.map.nudge(m.x + Math.cos(a2) * 3, m.y + Math.sin(a2) * 3, 0.4);
          const c = new Monster({
            ...m.cloneProps(), x, y, scale: m.scale * 0.55, r: 0.5, maxHp: m.maxHp * 0.05, hp: m.maxHp * 0.05, dmg: m.dmg * 0.45, xp: m.xp * 0.01,
            ai: 'ranged', range: 8, proj: { fx, speed: 7 }, moves: ['orbs', 'fan', 'runes'], moveCd: rand(1, 3), alpha: 0.6, rank: 'normal',
            name: `Mirror of ${this.tpl.name}`, aura: this.E.glow, awake: true, affixes: null, atkCd: 1.4, el,
          });
          c.aggro = p;
          this.minions.push(w.add(c));
          sparkle(x, y, 30, this.E.glow, 14, 0.6);
        }
        sfx('arcane'); sfx('summon');
        break;
      }
      case 'raid_cataclysm': {
        // everything that can see the boss is engulfed
        for (const c of w.hostiles(m.team, m.x, m.y, 40)) {
          if (!w.map.los(m.x, m.y, c.x, c.y)) continue;
          hit(m, c, c.maxHp * 0.75, el === 'phys' ? 'phys' : el, { force: true, crit: false, noArc: true });
        }
        explosionFx(m.x, m.y, 6, el === 'phys' ? 'fire' : el, 'nova', { shake: 18 });
        for (let i = 0; i < 4; i++) addEffect(new Ring(m.x, m.y, 0.3, 6 + i * 4, 0.6 + i * 0.15, i % 2 ? E.core : E.glow, 8));
        addEffect(new Column(m.x, m.y, E.glow, 0.8, 60, 420));
        G.flash = 0.9;
        sfx('explode'); sfx('boss');
        break;
      }
    }
    m.cd = m.atkCd;
  }

  /** Abilities that play out over time (the boss stays busy until they end). */
  tick(a, dt) {
    const m = this.m, w = m.world;
    const done = () => { m.state = 'idle'; m.cd = m.atkCd; };
    if ((a.life = (a.life || 0) + dt) > 8) return done();
    switch (a.kind) {
      case 'raid_sweep':
        if (a.beams.every((b) => b.dead)) done();
        break;
      case 'raid_vortex': {
        a.t += dt;
        // drag everything toward the boss: run against it or be crushed
        for (const c of w.hostiles(m.team, m.x, m.y, 13)) {
          if (c.static) continue;
          const ang = angleTo(c.x, c.y, m.x, m.y), dd = dist(c.x, c.y, m.x, m.y);
          if (dd > 1.2) w.map.move(c, Math.cos(ang) * 2.3 * dt, Math.sin(ang) * 2.3 * dt, c.ghost);
        }
        if (chance(dt * 40)) {
          const ang = rand(TAU), rr = rand(3, 9);
          spawn({ type: 'glow', x: m.x + Math.cos(ang) * rr, y: m.y + Math.sin(ang) * rr, z: rand(5, 40), vx: -Math.cos(ang) * rr * 0.9 + Math.sin(ang) * 2, vy: -Math.sin(ang) * rr * 0.9 - Math.cos(ang) * 2, life: 0.9, size: 3, size1: 0, color: this.E.glow, add: true });
        }
        if (a.t >= 2.6) {
          explode(w, m, m.x, m.y, 3.4, m.dmg * 2.4, this.tpl.el === 'phys' ? 'phys' : this.tpl.el, { knock: 1.6 }, 'eruption');
          sfx('thud');
          done();
        }
        break;
      }
      default: done();
    }
  }
}

// ------------------------------------------------------------------------------------------------ hazards
/** An expanding ring with a gap in it: stand in the gap, or be outside or inside it as it passes. */
class RingWave {
  constructor(o) {
    Object.assign(this, { r: 0.5, speed: 5.2, max: 16, t: 0, ground: true, hitSet: new Set() }, o);
    this.team = this.src.team;
  }
  inGap(x, y) { return Math.abs(angleDiff(this.gap, angleTo(this.x, this.y, x, y))) < this.gapW / 2; }
  update(dt) {
    this.t += dt;
    this.r += this.speed * dt;
    for (const c of this.world.hostiles(this.team, this.x, this.y, this.r + 0.6)) {
      if (this.hitSet.has(c.id) || Math.abs(dist(this.x, this.y, c.x, c.y) - this.r) > 0.45 + c.r * 0.5 || this.inGap(c.x, c.y)) continue;
      this.hitSet.add(c.id);
      hit(this.src, c, rand(this.dmg[0], this.dmg[1]), this.el, { knock: 0.6, ang: angleTo(this.x, this.y, c.x, c.y) });
    }
    return this.r < this.max && !this.src.dead;
  }
  /** For auto-play: the band about to sweep over. */
  danger(out) { out.push({ ring: true, x: this.x, y: this.y, r0: this.r - 0.6, r1: this.r + 1.4, gap: this.gap, gapW: this.gapW * 0.8 }); }
  draw(ctx) {
    const steps = 72, fade = Math.min(1, (this.max - this.r) / 3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [lw, al] of [[9, 0.25], [3, 0.8]]) {
      ctx.globalAlpha = al * fade; ctx.strokeStyle = this.color; ctx.lineWidth = lw;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= steps; i++) {
        const a = this.gap + this.gapW / 2 + (i / steps) * (TAU - this.gapW);
        const x = isoX(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r), y = isoY(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r);
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** A beam swept round the boss; walls and pillars stop it. */
class SweepBeam {
  constructor(m, a0, dir, raid) {
    Object.assign(this, { m, a: a0, dir, raid, left: 3.4, len: 14, t: 0, hits: new Map(), world: m.world, team: m.team });
  }
  get depth() { return this.m.x + this.m.y + 0.5; }
  end() {
    const L = this.world.map.rayLength(this.m.x, this.m.y, this.a, this.len);
    return [this.m.x + Math.cos(this.a) * L, this.m.y + Math.sin(this.a) * L];
  }
  update(dt) {
    const m = this.m;
    if (m.dead || this.left <= 0) { this.dead = true; return false; }
    const turn = 1.7 * dt;
    this.a += this.dir * turn; this.left -= turn; this.t += dt;
    m.face(this.a);
    const [ex, ey] = this.end();
    for (const c of lineTargets(this.world, this.team, m.x, m.y, ex, ey, 0.5)) {
      if ((this.hits.get(c) || 0) > this.world.time) continue;
      this.hits.set(c, this.world.time + 0.3);
      m.deal(c, m.dmg * 1.1, this.raid.tpl.el, {});
    }
    addLight(ex, ey, 2, 0.8);
    if (chance(dt * 30)) burst(ex, ey, 10, this.raid.tpl.el, 2, 2);
    if (this.left <= 0) this.dead = true;
    return !this.dead;
  }
  danger(out) {
    const m = this.m, a = this.a + this.dir * 0.5;
    out.push({ line: true, x: m.x, y: m.y, x1: m.x + Math.cos(a) * this.len, y1: m.y + Math.sin(a) * this.len, r: 1.3 });
  }
  draw(ctx) {
    const m = this.m, E = this.raid.E, [ex, ey] = this.end();
    const ax = isoX(m.x, m.y), ay = isoY(m.x, m.y) - 60, bx = isoX(ex, ey), by = isoY(ex, ey) - 14;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const wob = 1 + Math.sin(this.t * 50) * 0.15;
    for (const [lw, col, al] of [[22, E.glow, 0.3], [10, E.glow, 0.85], [4, '#ffffff', 0.9]]) {
      ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = lw * wob;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.restore();
  }
}

/** The cataclysm's wind-up: light gathering into the boss. Anything in its sight when it ends is engulfed. */
class Gathering {
  constructor(m, raid, dur) { Object.assign(this, { m, raid, dur, t: 0, world: m.world, team: m.team }); }
  get depth() { return this.m.x + this.m.y + 0.2; }
  /** Safe = out of the boss's sight. */
  safeAt(x, y) { return !this.world.map.los(this.m.x, this.m.y, x, y); }
  update(dt) {
    const m = this.m;
    this.t += dt;
    if (m.dead || this.t >= this.dur || !(m.action && m.action.kind === 'raid_cataclysm')) return false;
    const E = this.raid.E;
    for (let i = 0; i < 3; i++) {
      const a = rand(TAU), rr = rand(4, 10);
      spawn({ type: 'glow', x: m.x + Math.cos(a) * rr, y: m.y + Math.sin(a) * rr, z: rand(10, 90), vx: -Math.cos(a) * rr * 1.4, vy: -Math.sin(a) * rr * 1.4, vz: 20, life: 0.6, size: rand(2, 4), size1: 0, color: chance(0.5) ? E.glow : E.core, add: true });
    }
    if ((this.ringT = (this.ringT || 0) - dt) <= 0) { this.ringT = 0.5; addEffect(new Ring(m.x, m.y, 9, 0.5, 0.5, E.glow, 3)); }
    addLight(m.x, m.y, 4 + this.t * 2, 1);
    return true;
  }
  draw(ctx) {
    const m = this.m, k = this.t / this.dur;
    const px = isoX(m.x, m.y), py = isoY(m.x, m.y) - m.artH * m.scale * 0.5;
    const r = 40 + k * 120;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 + 0.5 * k;
    ctx.drawImage(glowSprite(this.raid.E.glow), px - r, py - r, r * 2, r * 2);
    ctx.restore();
  }
}

/** The warded boss's shield bubble. */
class ShieldFx {
  constructor(m, raid) { Object.assign(this, { m, raid, t: 0 }); }
  get depth() { return this.m.x + this.m.y + 0.05; }
  update(dt) { this.t += dt; return !this.m.dead && this.m.ward < 1; }
  draw(ctx) {
    const m = this.m, px = isoX(m.x, m.y), h = m.artH * m.scale, py = isoY(m.x, m.y) - h * 0.5;
    const rx = h * 0.45, ry = h * 0.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + Math.sin(this.t * 4) * 0.06;
    ctx.fillStyle = this.raid.E.glow;
    ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = this.raid.E.core; ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]); ctx.lineDashOffset = -this.t * 30;
    ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

/** A wall of light across the arena's gate while it is sealed. */
class Barrier {
  constructor(g, E) { Object.assign(this, { g, E, t: 0 }); }
  get depth() { return this.g.x + (this.g.y0 + this.g.y1 + 1) / 2 - 0.4; }
  update(dt) { this.t += dt; if (chance(dt * 12)) sparkle(this.g.x - 0.1, rand(this.g.y0, this.g.y1 + 1), rand(5, 90), this.E.glow, 1, 0.1); return !this.dead; }
  draw(ctx) {
    const g = this.g, H = 100;
    const ax = isoX(g.x, g.y0), ay = isoY(g.x, g.y0), bx = isoX(g.x, g.y1 + 1), by = isoY(g.x, g.y1 + 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createLinearGradient(0, ay, 0, ay - H);
    grd.addColorStop(0, this.E.glow); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35 + Math.sin(this.t * 5) * 0.1;
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by - H); ctx.lineTo(ax, ay - H); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.7; ctx.strokeStyle = this.E.core; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const k = (i + 0.5) / 6, x = ax + (bx - ax) * k, y = ay + (by - ay) * k, hh = H * (0.5 + 0.4 * Math.sin(this.t * 3 + i * 1.7));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - hh); ctx.stroke();
    }
    ctx.restore();
  }
}
