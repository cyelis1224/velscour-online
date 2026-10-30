import { HEAVENLY_MONSTERS } from './heavenly.js';
import { SAND_CREATURES, SAND_BOSSES } from './seaofsand.js';
import { SET3 } from './bestiary3.js';
import { BREACH_ART } from './breach.js';
import { AIR_ART } from './airpirates.js';
import { DEPTHS_EDGE } from './depthsedge.js';
// Monster art catalogue: every monster cut from the sheets in assets/source/enemies/<set>/ (see docs/ENEMY_ART.md).
// Each entry is one cell of a sheet (i = reading order, left to right then top to bottom) and says which AI
// archetype it plays (ARCH in enemies.js). `also` lists other archetypes it can stand in for, `h` is its height
// in world px (the player is 60), `el` is the element its art shows (it keeps its own colours and casts that
// element when the biome matches, or when the biome has none), `boss` puts it in the guardian pool.
// `lone` (the giants of set 2) only ever plays bosses: guardians and raid bosses, never a pack.
// Optional overrides: fly, gore, undead, demon.
//
// Palette swaps: a level recolours most looks with a random one of SWAPS (named after it: "Frost Bone Hound"), the
// "greater" breed darkens it (greaterSwap), and unique monsters roll their own swap, so ~690 drawings make thousands
// of monsters. Levels are not themed: any biome rolls any art (rollLooks).

export const SWAPS = {
  pale: { sat: 0.35, light: 0.1 },
  ash: { sat: 0.12, light: 0.02, contrast: 1.05 },
  ember: { colorize: [16, 0.62], light: -0.02, contrast: 1.08 },
  frost: { colorize: [200, 0.45], light: 0.08 },
  rime: { hue: 180, sat: 0.6, light: 0.1 },
  venom: { colorize: [95, 0.5], light: -0.02 },
  rot: { colorize: [68, 0.4], light: -0.05 },
  tide: { colorize: [172, 0.4], light: -0.02 },
  blood: { colorize: [356, 0.62], light: -0.05, contrast: 1.08 },
  flesh: { colorize: [340, 0.42], light: 0.02 },
  void: { colorize: [276, 0.48], light: -0.05, contrast: 1.08 },
  abyss: { colorize: [228, 0.5], light: -0.06, contrast: 1.1 },
  storm: { colorize: [212, 0.42], light: 0.04, contrast: 1.12 },
  gilded: { colorize: [44, 0.62], light: 0.04, contrast: 1.12 },
  sand: { colorize: [34, 0.42], light: 0.08 },
  shadow: { sat: 0.25, light: -0.16, contrast: 1.18 },
  obsidian: { sat: 0.22, light: -0.1, contrast: 1.35 },
  crystal: { colorize: [188, 0.6], light: 0.05, contrast: 1.2 },
  thorn: { colorize: [100, 0.32], light: -0.04 },
  infernal: { colorize: [6, 0.75], light: -0.08, contrast: 1.2 },
  // hue turns keep a multi-coloured drawing's own contrasts (set 2's art is busier than set 1's)
  verdigris: { hue: 140, sat: 0.9 },
  amethyst: { hue: 250, sat: 1.1, contrast: 1.05 },
  coral: { hue: 330, sat: 1.15, light: 0.03 },
  bronze: { colorize: [28, 0.55], light: -0.03, contrast: 1.15 },
  bone: { colorize: [40, 0.18], light: 0.12 },
  spectral: { colorize: [165, 0.5], light: 0.1, contrast: 0.9 },
  bile: { colorize: [60, 0.6], light: -0.04 },
  midnight: { colorize: [240, 0.35], light: -0.12, contrast: 1.2 },
  rust: { colorize: [18, 0.5], light: -0.06, contrast: 1.05 },
};
/** The "greater" breed's version of a swap: darker and richer. */
export function greaterSwap(swap) {
  const s = swap || {};
  return { ...s, sat: (s.sat ?? 1) * 1.25, light: (s.light || 0) - 0.06, contrast: (s.contrast ?? 1) * 1.12 };
}
/** Raised corpses (Revive and similar). */
export const REVIVED = { colorize: [130, 0.45], light: 0.04 };

const S1 = 'set1/skeletons', L1 = 'set1/liches', B1 = 'set1/bone_horrors', F1 = 'set1/flesh_brutes';
const D1 = 'set1/demons', T1 = 'set1/tentacles', E1 = 'set1/eyes';
const bone = { gore: 'bone', undead: true };

export const BESTIARY = [
  ...HEAVENLY_MONSTERS,
  ...SAND_CREATURES.map(([arch, name], i) => ({ id:`ss_${arch}`, sheet:'sea_of_sand', i, arch, name, h:52+(i%5)*3, homeBiome:'sea_of_sand', seaOfSand:true, nativeVariant:i })),
  ...SAND_BOSSES.map(([arch, name], i) => ({ id:`ss_${arch}`, sheet:'sea_of_sand', i:SAND_CREATURES.length+i, arch, name, h:82+(i%3)*4, homeBiome:'sea_of_sand', seaOfSand:true, nativeVariant:60+i, boss:true, lone:true })),
  // ---- set 1: skeleton warband
  { id: 'bone_cleaver', sheet: S1, i: 0, arch: 'skeleton', name: 'Bone Cleaver', h: 54, ...bone },
  { id: 'skeleton_bowman', sheet: S1, i: 1, arch: 'archer', name: 'Skeleton Bowman', h: 56, ...bone },
  { id: 'bone_spearman', sheet: S1, i: 2, arch: 'skeleton', also: ['knight'], name: 'Bone Spearman', h: 56, ...bone },
  { id: 'sickle_reaver', sheet: S1, i: 3, arch: 'skeleton', name: 'Sickle Reaver', h: 54, ...bone },
  { id: 'bone_shieldwall', sheet: S1, i: 4, arch: 'knight', name: 'Bone Shieldwall', h: 58, ...bone },
  { id: 'skeleton_crossbowman', sheet: S1, i: 5, arch: 'archer', name: 'Skeleton Crossbowman', h: 52, ...bone },
  { id: 'chained_dead', sheet: S1, i: 6, arch: 'skeleton', also: ['zombie'], name: 'Chained Dead', h: 54, ...bone },
  { id: 'ramskull_headsman', sheet: S1, i: 7, arch: 'knight', also: ['skeleton'], name: 'Ramskull Headsman', h: 60, boss: true, ...bone },
  { id: 'gravedigger', sheet: S1, i: 8, arch: 'skeleton', also: ['ghoul'], name: 'Gravedigger', h: 50, ...bone },
  { id: 'bone_standard', sheet: S1, i: 9, arch: 'cultist', name: 'Bone Standard-Bearer', h: 62, ...bone },
  // ---- set 1: liches
  { id: 'pyre_lich', sheet: L1, i: 0, arch: 'cultist', also: ['wraith'], name: 'Pyre Lich', h: 58, el: 'fire', fly: false, ...bone },
  { id: 'rime_lich', sheet: L1, i: 1, arch: 'wraith', also: ['cultist'], name: 'Rime Lich', h: 58, el: 'cold', fly: false, ...bone },
  { id: 'plague_lich', sheet: L1, i: 2, arch: 'cultist', name: 'Plague Lich', h: 56, el: 'poison', ...bone },
  { id: 'storm_lich', sheet: L1, i: 3, arch: 'wraith', also: ['cultist'], name: 'Storm Lich', h: 58, el: 'light', fly: false, ...bone },
  { id: 'bone_priest', sheet: L1, i: 4, arch: 'cultist', name: 'Bone Priest', h: 58, el: 'holy', ...bone },
  { id: 'lich_king', sheet: L1, i: 5, arch: 'wraith', name: 'Lich King', h: 62, el: 'arcane', fly: false, boss: true, ...bone },
  { id: 'sunstaff_lich', sheet: L1, i: 6, arch: 'cultist', name: 'Sunstaff Lich', h: 60, el: 'fire', boss: true, ...bone },
  { id: 'rootbound_lich', sheet: L1, i: 7, arch: 'shroom', name: 'Rootbound Lich', h: 60, el: 'poison', ...bone },
  { id: 'lantern_lich', sheet: L1, i: 8, arch: 'wraith', name: 'Lantern Lich', h: 58, el: 'cold', fly: false, ...bone },
  { id: 'bonecaller', sheet: L1, i: 9, arch: 'cultist', also: ['wraith'], name: 'Bonecaller', h: 56, el: 'shadow', fly: false, ...bone },
  // ---- set 1: bone horrors
  { id: 'powder_keg', sheet: B1, i: 0, arch: 'beetle', name: 'Powder Keg Dead', h: 52, el: 'fire', ...bone },
  { id: 'bloated_bonesack', sheet: B1, i: 1, arch: 'beetle', also: ['zombie'], name: 'Bloated Bonesack', h: 52, el: 'poison', ...bone },
  { id: 'cinder_husk', sheet: B1, i: 2, arch: 'ghoul', also: ['skeleton'], name: 'Cinder Husk', h: 52, el: 'fire', ...bone },
  { id: 'rime_husk', sheet: B1, i: 3, arch: 'ghoul', also: ['skeleton'], name: 'Rime Husk', h: 52, el: 'cold', ...bone },
  { id: 'bone_hound', sheet: B1, i: 4, arch: 'hound', name: 'Bone Hound', h: 36, ...bone },
  { id: 'four_armed_reaver', sheet: B1, i: 5, arch: 'skeleton', also: ['knight'], name: 'Four-Armed Reaver', h: 58, boss: true, ...bone },
  { id: 'bone_colossus', sheet: B1, i: 6, arch: 'golem', name: 'Bone Colossus', h: 68, boss: true, ...bone },
  { id: 'coffin_knight', sheet: B1, i: 7, arch: 'knight', name: 'Coffin Knight', h: 60, ...bone },
  { id: 'grim_reaper', sheet: B1, i: 8, arch: 'wraith', name: 'Grim Reaper', h: 64, el: 'shadow', boss: true, ...bone },
  { id: 'bone_serpent', sheet: B1, i: 9, arch: 'worm', name: 'Bone Serpent', h: 50, ...bone },
  // ---- set 1: flesh brutes
  { id: 'chained_brute', sheet: F1, i: 0, arch: 'abomination', also: ['zombie'], name: 'Chained Brute', h: 68 },
  { id: 'ossuary_golem', sheet: F1, i: 1, arch: 'golem', name: 'Ossuary Golem', h: 74, boss: true, ...bone },
  { id: 'reliquary_bearer', sheet: F1, i: 2, arch: 'abomination', name: 'Reliquary Bearer', h: 66 },
  { id: 'many_armed_horror', sheet: F1, i: 3, arch: 'abomination', name: 'Many-Armed Horror', h: 70, boss: true },
  { id: 'corpse_hauler', sheet: F1, i: 4, arch: 'zombie', also: ['abomination'], name: 'Corpse Hauler', h: 56 },
  { id: 'ossified_bishop', sheet: F1, i: 5, arch: 'demon', name: 'Ossified Bishop', h: 76, boss: true, gore: 'bone' },
  { id: 'conjoined_horror', sheet: F1, i: 6, arch: 'abomination', also: ['zombie'], name: 'Conjoined Horror', h: 64, boss: true },
  { id: 'butcher', sheet: F1, i: 7, arch: 'abomination', also: ['demon'], name: 'Butcher', h: 68, boss: true },
  { id: 'bone_juggernaut', sheet: F1, i: 8, arch: 'golem', also: ['knight'], name: 'Bone Juggernaut', h: 74, boss: true, ...bone },
  { id: 'flesh_crawler', sheet: F1, i: 9, arch: 'spider', also: ['scorpion'], name: 'Flesh Crawler', h: 40 },
  // ---- set 1: demons and beasts
  { id: 'imp', sheet: D1, i: 0, arch: 'imp', name: 'Imp', h: 34, el: 'fire' },
  { id: 'gargoyle', sheet: D1, i: 1, arch: 'gargoyle', also: ['bat'], name: 'Gargoyle', h: 46, gore: 'rock' },
  { id: 'magma_maw', sheet: D1, i: 2, arch: 'demon', also: ['golem'], name: 'Magma Maw', h: 46, el: 'fire' },
  { id: 'frost_fiend', sheet: D1, i: 3, arch: 'imp', also: ['ghoul'], name: 'Frost Fiend', h: 48, el: 'cold' },
  { id: 'molten_behemoth', sheet: D1, i: 4, arch: 'demon', name: 'Molten Behemoth', h: 56, el: 'fire', boss: true },
  { id: 'carapace_spider', sheet: D1, i: 5, arch: 'spider', name: 'Carapace Spider', h: 36 },
  { id: 'horned_stalker', sheet: D1, i: 6, arch: 'ghoul', also: ['hound'], name: 'Horned Stalker', h: 44 },
  { id: 'gullet_worm', sheet: D1, i: 7, arch: 'worm', name: 'Gullet Worm', h: 40 },
  { id: 'shadow_panther', sheet: D1, i: 8, arch: 'hound', name: 'Shadow Panther', h: 38 },
  { id: 'gore_crab', sheet: D1, i: 9, arch: 'scorpion', also: ['spider'], name: 'Gore Crab', h: 44 },
  // ---- set 1: tentacle horrors
  { id: 'writhing_maw', sheet: T1, i: 0, arch: 'slime', name: 'Writhing Maw', h: 44, gore: 'goo' },
  { id: 'maw_bloom', sheet: T1, i: 1, arch: 'shroom', name: 'Maw Bloom', h: 52 },
  { id: 'tentacled_brute', sheet: T1, i: 2, arch: 'abomination', also: ['golem'], name: 'Tentacled Brute', h: 64 },
  { id: 'deep_squid', sheet: T1, i: 3, arch: 'elemental', name: 'Deep Squid', h: 60 },
  { id: 'starmaw', sheet: T1, i: 4, arch: 'shroom', also: ['slime'], name: 'Starmaw', h: 48 },
  { id: 'clawed_crawler', sheet: T1, i: 5, arch: 'scorpion', also: ['spider'], name: 'Clawed Crawler', h: 40 },
  { id: 'hydra_spawn', sheet: T1, i: 6, arch: 'worm', also: ['slime'], name: 'Hydra Spawn', h: 50, gore: 'goo' },
  { id: 'shell_horror', sheet: T1, i: 7, arch: 'golem', also: ['abomination'], name: 'Shell Horror', h: 62, boss: true },
  { id: 'gnashing_thicket', sheet: T1, i: 8, arch: 'shroom', also: ['abomination'], name: 'Gnashing Thicket', h: 58 },
  { id: 'hive_of_mouths', sheet: T1, i: 9, arch: 'abomination', name: 'Hive of Mouths', h: 64, boss: true },
  // ---- set 1: eyes
  { id: 'spined_eye', sheet: E1, i: 0, arch: 'eye', name: 'Spined Eye', h: 40 },
  { id: 'eye_tyrant', sheet: E1, i: 1, arch: 'eye', name: 'Eye Tyrant', h: 48, el: 'arcane', boss: true },
  { id: 'eye_spider', sheet: E1, i: 2, arch: 'spider', name: 'Eye Spider', h: 34 },
  { id: 'eye_stalker', sheet: E1, i: 3, arch: 'eye', also: ['wraith'], name: 'Eye Stalker', h: 66, el: 'fire', fly: false },
  { id: 'gazing_horror', sheet: E1, i: 4, arch: 'eye', name: 'Gazing Horror', h: 46 },
  { id: 'drifting_eye', sheet: E1, i: 5, arch: 'wraith', also: ['elemental'], name: 'Drifting Eye', h: 52, el: 'cold', gore: 'ecto' },
  { id: 'skull_eye', sheet: E1, i: 6, arch: 'bat', also: ['eye'], name: 'Skull Eye', h: 30, fly: true },
  { id: 'hundred_eyes', sheet: E1, i: 7, arch: 'eye', also: ['elemental'], name: 'Hundred Eyes', h: 46 },
  { id: 'eyestalk_crawler', sheet: E1, i: 8, arch: 'spider', also: ['eye'], name: 'Eyestalk Crawler', h: 40, fly: false },
  { id: 'all_seeing', sheet: E1, i: 9, arch: 'eye', name: 'The All-Seeing', h: 60, el: 'poison', boss: true },
];

// ---- set 2 (Enemy_300): one PNG per monster in assets/source/enemies/set2/<family>/, each folder packed as one
// sheet (cells in file order). Rows: [id, arch, h, extras]; the name is the id in title case unless extras.name.
const titled = (id) => id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const set2 = (fam, base, rows) => rows.map(([id, arch, h, o], i) => ({ id, sheet: 'set2/' + fam, i, arch, name: titled(id), h, ...base, ...o }));
const mortal = { undead: false, gore: 'flesh' }; // living folk playing undead archetypes (skeleton, knight, archer, wraith)
const walks = { fly: false };

BESTIARY.push(
  ...set2('undead', bone, [
    ['crypt_cleaver_skeleton', 'skeleton', 54],
    ['grave_longbow_skeleton', 'archer', 56],
    ['ossuary_pike_guard', 'skeleton', 58, { also: ['knight'] }],
    ['twin_falchion_revenant', 'skeleton', 55],
    ['coffin_door_bulwark', 'knight', 58],
    ['crypt_arbalester', 'archer', 54],
    ['chain_flail_jailer', 'skeleton', 56, { also: ['zombie'] }],
    ['ram_skull_axeman', 'knight', 60, { also: ['skeleton'], boss: true }],
    ['sepulcher_digger', 'skeleton', 54, { also: ['ghoul'] }],
    ['funeral_standard_knight', 'cultist', 62],
    ['ember_censer_adept', 'cultist', 56, { el: 'fire' }],
    ['rime_antler_lich', 'wraith', 60, { also: ['cultist'], el: 'cold', ...walks }],
    ['bog_lantern_witch', 'cultist', 58, { el: 'poison' }],
    ['stormwheel_oracle', 'wraith', 58, { also: ['cultist'], el: 'light', ...walks }],
    ['ivory_book_prelate', 'cultist', 58, { el: 'holy' }],
    ['amethyst_scythe_regent', 'wraith', 62, { el: 'arcane', boss: true, ...walks }],
    ['coal_reliquary_lich', 'cultist', 58, { el: 'fire' }],
    ['briar_ossuary_seer', 'shroom', 58, { also: ['cultist'], el: 'poison' }],
    ['tide_bell_necromancer', 'cultist', 60, { also: ['wraith'], el: 'cold', ...walks }],
    ['skullhand_thaumaturge', 'wraith', 60, { also: ['cultist'], el: 'shadow', ...walks }],
    ['powder_keg_runner', 'beetle', 50, { el: 'fire' }],
    ['blight_vessel', 'beetle', 54, { also: ['zombie'], el: 'poison' }],
    ['furnace_rib_revenant', 'ghoul', 56, { also: ['skeleton'], el: 'fire' }],
    ['glacier_knuckle', 'ghoul', 54, { also: ['skeleton'], el: 'cold' }],
    ['gravehound', 'hound', 40],
    ['fourblade_marauder', 'skeleton', 58, { also: ['knight'], boss: true }],
    ['ossuary_boxer', 'golem', 58, { also: ['abomination'] }],
    ['crypt_pavise_warden', 'knight', 58],
    ['shroud_reaper', 'wraith', 62, { el: 'shadow', boss: true }],
    ['ribcoil_burrower', 'worm', 48],
  ]),
  ...set2('fiends', {}, [
    ['cinder_imp', 'imp', 36, { el: 'fire' }],
    ['violet_hookwing', 'gargoyle', 50, { also: ['bat'], el: 'arcane', gore: 'flesh', demon: true }],
    ['basalt_maw', 'demon', 46, { also: ['golem'], el: 'fire', gore: 'rock' }],
    ['hoarfrost_stalker', 'ghoul', 58, { also: ['imp'], el: 'cold', demon: true }],
    ['brimstone_toad', 'worm', 46, { el: 'fire', gore: 'flesh' }],
    ['ash_needlecrab', 'spider', 36, { also: ['scorpion'] }],
    ['saffron_roofclaw', 'ghoul', 50, { also: ['imp'], demon: true }],
    ['bile_slug', 'slime', 38, { also: ['worm'], el: 'poison' }],
    ['pitch_hound', 'hound', 38, { el: 'shadow' }],
    ['rust_sac_horror', 'spider', 54, { also: ['abomination'] }],
    ['carmine_gorehorn', 'demon', 54, { el: 'blood' }],
    ['indigo_mantis_reaver', 'scorpion', 52, { also: ['spider'] }],
    ['verdigris_bellower', 'abomination', 56, { also: ['zombie'], el: 'poison' }],
    ['ivory_mask_fiend', 'wraith', 60, { also: ['cultist'], demon: true, gore: 'flesh', ...walks }],
    ['umber_chain_ogre', 'abomination', 66],
    ['scarlet_centaur', 'knight', 56, { also: ['hound'], el: 'fire', demon: true, ...mortal }],
    ['azure_shell_ravager', 'scorpion', 46, { also: ['golem'], el: 'cold' }],
    ['sulfur_ribbon_witch', 'cultist', 60, { el: 'fire', demon: true }],
    ['plum_thorn_ape', 'demon', 60, { also: ['abomination'], demon: false }],
    ['charcoal_sawback', 'hound', 42, { also: ['scorpion'] }],
    ['wineglass_soul_drinker', 'wraith', 52, { also: ['cultist'], el: 'blood', demon: true, gore: 'flesh', ...walks }],
    ['jade_scroll_eater', 'imp', 52, { also: ['ghoul'], el: 'poison' }],
    ['blueflame_horn_priest', 'cultist', 60, { el: 'arcane', demon: true }],
    ['chalk_mirror_hag', 'wraith', 60, { also: ['cultist'], el: 'holy', gore: 'flesh', undead: false, ...walks }],
    ['gold_scarab_diabolist', 'cultist', 64, { el: 'holy', demon: true, boss: true }],
    ['maroon_bell_tormentor', 'cultist', 50, { el: 'blood', demon: true }],
    ['viridian_spore_caller', 'shroom', 54, { also: ['cultist'], el: 'poison' }],
    ['violet_eye_shepherd', 'eye', 44, { also: ['spider'], el: 'arcane', ...walks }],
    ['silver_needle_wraith', 'wraith', 60, { gore: 'ecto' }],
    ['umbral_jaw_nun', 'wraith', 64, { also: ['cultist'], el: 'shadow', boss: true, ...walks }],
    ['copper_drillmaw', 'scorpion', 38, { also: ['beetle'] }],
    ['teal_reef_reaper', 'ghoul', 52, { also: ['scorpion'], el: 'cold' }],
    ['blood_kite', 'bat', 46, { also: ['gargoyle'], el: 'blood' }],
    ['porcelain_leech', 'worm', 58],
    ['amaranth_spinestrider', 'spider', 58, { also: ['hound'], el: 'blood' }],
    ['grey_hornback', 'hound', 40, { also: ['golem'] }],
    ['amber_scorpion_fiend', 'scorpion', 50, { el: 'fire' }],
    ['blue_gullet_crawler', 'worm', 42, { also: ['slime'], el: 'cold' }],
    ['moss_hookjaw', 'ghoul', 58, { el: 'poison' }],
    ['obsidian_ram_charger', 'hound', 50, { also: ['demon'] }],
  ]),
  ...set2('titans', { boss: true, lone: true }, [
    ['catacomb_colossus', 'golem', 76, { also: ['abomination'], ...bone }],
    ['ossuary_cathedral', 'golem', 86, bone],
    ['sarcophagus_bearer', 'abomination', 80],
    ['manyhand_matriarch', 'abomination', 78, { also: ['spider'], ...bone }],
    ['mausoleum_tortoise', 'golem', 76, { gore: 'rock' }],
    ['sepulcher_bailiff', 'abomination', 84],
    ['joined_mourner', 'abomination', 76, { also: ['zombie'], undead: true }],
    ['carrion_butcher_king', 'abomination', 84, { also: ['demon'] }],
    ['gravebell_behemoth', 'abomination', 84],
    ['crypt_maw_patriarch', 'spider', 66, { also: ['abomination'], ...bone }],
    ['briarheart_sovereign', 'shroom', 84, { also: ['golem'], el: 'poison' }],
    ['granite_knuckle_titan', 'golem', 82, { gore: 'rock' }],
    ['fungal_mire_mother', 'shroom', 80, { el: 'poison' }],
    ['amber_hive_monolith', 'spider', 80, { also: ['abomination'], el: 'poison' }],
    ['thornback_mammoth', 'golem', 72, { also: ['abomination'], gore: 'flesh' }],
    ['basalt_anvil_guardian', 'golem', 82, { el: 'fire', gore: 'rock' }],
    ['crystal_root_warden', 'golem', 80, { also: ['elemental'], el: 'arcane', gore: 'rock' }],
    ['bogwood_devourer', 'abomination', 84, { also: ['shroom'], el: 'poison' }],
    ['sandstone_scarab_emperor', 'scorpion', 74, { also: ['golem'], gore: 'rock' }],
    ['salt_pillar_oracle', 'elemental', 84, { also: ['golem'], el: 'holy', gore: 'rock', ...walks }],
    ['kilnheart_juggernaut', 'golem', 82, { el: 'fire', gore: 'rock' }],
    ['glacier_crown_titan', 'golem', 84, { el: 'cold', gore: 'rock' }],
    ['thundercoil_idol', 'elemental', 86, { also: ['golem'], el: 'light', gore: 'spark', ...walks }],
    ['ashen_phoenix_horror', 'elemental', 82, { also: ['gargoyle'], el: 'fire', gore: 'bone' }],
    ['obsidian_volcano_beast', 'demon', 74, { also: ['golem'], el: 'fire', gore: 'rock', demon: false }],
  ]),
  ...set2('colossi', { boss: true, lone: true }, [
    ['tempest_manta', 'elemental', 72, { also: ['gargoyle'], el: 'light', gore: 'flesh' }],
    ['coral_throne_leviathan', 'scorpion', 76, { also: ['abomination'], el: 'cold' }],
    ['deepwell_angler', 'worm', 68, { also: ['abomination'], el: 'cold' }],
    ['quicksilver_sentinel', 'golem', 86, { also: ['knight'], el: 'arcane', gore: 'spark' }],
    ['blizzard_woolback', 'golem', 70, { also: ['hound'], el: 'cold', gore: 'flesh' }],
    ['chainwheel_tyrant', 'golem', 74, { also: ['spider'], gore: 'rock' }],
    ['cathedral_organ_walker', 'golem', 88, { el: 'holy', gore: 'rock' }],
    ['clockwork_mantis_monarch', 'spider', 74, { also: ['scorpion'], gore: 'rock' }],
    ['bloodglass_harvester', 'demon', 82, { also: ['wraith'], el: 'blood' }],
    ['magnetite_lodestone', 'golem', 84, { el: 'light', gore: 'rock' }],
    ['plague_cauldron', 'abomination', 78, { also: ['shroom'], el: 'poison' }],
    ['wax_cathedral_saint', 'golem', 84, { also: ['cultist'], el: 'holy', gore: 'rock' }],
    ['gallows_oak_hangman', 'shroom', 88, { also: ['golem'], el: 'shadow', gore: 'rock' }],
    ['grief_mask_mountain', 'abomination', 80, { also: ['golem'], el: 'shadow', undead: true }],
    ['void_shell_emperor', 'eye', 80, { also: ['abomination'], el: 'arcane', ...walks }],
    ['antlered_moon_eater', 'hound', 72, { also: ['demon'], el: 'shadow' }],
    ['rotwing_vulture_queen', 'gargoyle', 80, { also: ['bat'], el: 'poison', gore: 'flesh', ...walks }],
    ['armored_boar_patriarch', 'hound', 66, { also: ['golem'] }],
    ['prison_crab_sovereign', 'scorpion', 76, { also: ['golem'] }],
    ['leech_crown_abomination', 'worm', 82, { also: ['abomination'], el: 'blood' }],
    ['chitin_brood_duchess', 'spider', 86, { el: 'poison' }],
    ['blind_cave_titan', 'golem', 66, { also: ['abomination'], gore: 'flesh' }],
    ['ravenous_centipede_king', 'worm', 82, { also: ['scorpion'], el: 'poison' }],
    ['frostmane_werebear', 'abomination', 86, { also: ['hound'], el: 'cold' }],
    ['black_pearl_cephalarch', 'elemental', 82, { also: ['abomination'], el: 'cold', gore: 'goo', ...walks }],
  ]),
  ...set2('dragons', { demon: false }, [
    ['crimson_crag_drake', 'demon', 66, { also: ['hound'], el: 'fire' }],
    ['azure_needle_wyvern', 'gargoyle', 62, { el: 'cold', gore: 'flesh', ...walks }],
    ['emerald_marsh_dragon', 'demon', 66, { el: 'poison' }],
    ['ivory_frost_wyrm', 'worm', 50, { el: 'cold', gore: 'flesh' }],
    ['obsidian_horn_dragon', 'demon', 90, { el: 'shadow', boss: true, lone: true }],
    ['copper_furnace_drake', 'demon', 62, { also: ['hound'], el: 'fire' }],
    ['amethyst_crown_dragon', 'demon', 74, { el: 'arcane', boss: true, lone: true }],
    ['golden_sunscale', 'demon', 70, { el: 'holy', boss: true, lone: true }],
    ['silver_moon_wyvern', 'gargoyle', 62, { el: 'cold', gore: 'flesh', ...walks }],
    ['umber_burrow_drake', 'hound', 38, { also: ['scorpion'] }],
    ['teal_reef_dragon', 'demon', 68, { also: ['gargoyle'], el: 'cold' }],
    ['scarlet_thorn_wyrm', 'worm', 72, { el: 'fire', gore: 'flesh' }],
    ['jade_cloud_dragon', 'elemental', 64, { also: ['worm'], el: 'light', gore: 'flesh', ...walks }],
    ['cobalt_storm_drake', 'demon', 90, { el: 'light', boss: true, lone: true }],
    ['pearl_shell_dragon', 'golem', 50, { also: ['hound'], gore: 'flesh' }],
    ['russet_ram_dragon', 'demon', 68, { also: ['hound'], el: 'fire' }],
    ['violet_dusk_wyvern', 'gargoyle', 50, { also: ['bat'], el: 'shadow', gore: 'flesh' }],
    ['bonewhite_crypt_dragon', 'demon', 84, { el: 'shadow', boss: true, lone: true, ...bone }],
    ['moss_stone_dragon', 'golem', 88, { also: ['demon'], el: 'poison', gore: 'rock', boss: true, lone: true }],
    ['amber_sand_dragon', 'hound', 60, { also: ['demon'], el: 'fire' }],
    ['fen_trident_hydra', 'abomination', 76, { el: 'poison', boss: true, lone: true }],
    ['bloodcrest_hydra', 'abomination', 82, { el: 'blood', boss: true, lone: true }],
    ['rime_fork_hydra', 'abomination', 86, { el: 'cold', boss: true, lone: true }],
    ['obsidian_crown_hydra', 'abomination', 90, { el: 'fire', boss: true, lone: true }],
    ['amber_frill_hydra', 'abomination', 78, { el: 'holy', boss: true, lone: true }],
    ['violet_thorn_hydra', 'abomination', 82, { el: 'arcane', boss: true, lone: true }],
    ['azure_sail_hydra', 'abomination', 86, { el: 'light', boss: true, lone: true }],
    ['bone_sepulcher_hydra', 'abomination', 90, { el: 'shadow', boss: true, lone: true, ...bone }],
    ['copper_hammer_hydra', 'abomination', 78, { boss: true, lone: true }],
    ['jade_antler_hydra', 'abomination', 82, { el: 'poison', boss: true, lone: true }],
  ]),
  ...set2('mages', mortal, [
    ['ember_staff_wizard', 'cultist', 58, { el: 'fire' }],
    ['rime_scholar', 'cultist', 58, { el: 'cold' }],
    ['oakbound_wizard', 'cultist', 58, { also: ['shroom'], el: 'poison' }],
    ['astral_surveyor', 'cultist', 58, { el: 'arcane' }],
    ['marsh_apothecary', 'cultist', 58, { el: 'poison' }],
    ['sandglass_sage', 'cultist', 58, { el: 'holy' }],
    ['runebound_geometer', 'cultist', 58, { also: ['wraith'], el: 'arcane', ...walks }],
    ['storm_lantern_wizard', 'cultist', 58, { also: ['wraith'], el: 'light', ...walks }],
    ['grave_ink_scholar', 'cultist', 58, { el: 'shadow' }],
    ['copper_sun_wizard', 'cultist', 58, { el: 'fire' }],
    ['blood_veil_sorceress', 'cultist', 58, { el: 'blood', boss: true }],
    ['violet_thorn_sorcerer', 'cultist', 58, { el: 'arcane' }],
    ['frost_mantle_sorceress', 'cultist', 58, { also: ['wraith'], el: 'cold', ...walks }],
    ['ashen_mask_sorcerer', 'cultist', 58, { el: 'fire' }],
    ['jade_serpent_sorceress', 'cultist', 58, { el: 'poison' }],
    ['bronze_chain_invoker', 'cultist', 58],
    ['silver_moon_sorceress', 'cultist', 58, { also: ['wraith'], el: 'light', ...walks }],
    ['plague_silk_sorcerer', 'cultist', 58, { el: 'poison' }],
    ['amber_beast_caller', 'cultist', 58],
    ['obsidian_rift_sorcerer', 'cultist', 58, { also: ['wraith'], el: 'shadow', boss: true, ...walks }],
  ]),
  ...set2('warriors', mortal, [
    ['rustblade_marauder', 'skeleton', 58],
    ['greywood_archer', 'archer', 58],
    ['pit_twinblade', 'skeleton', 58, { also: ['ghoul'] }],
    ['ironhook_brigand', 'skeleton', 58],
    ['gravel_mauler', 'skeleton', 60, { also: ['knight'] }],
    ['crossbow_deserter', 'archer', 58],
    ['chain_dervish', 'skeleton', 58],
    ['ravine_axewoman', 'skeleton', 58],
    ['scarred_spearman', 'skeleton', 58, { also: ['knight'] }],
    ['execution_duelist', 'skeleton', 58, { also: ['ghoul'] }],
    ['blacktower_knight', 'knight', 60, { el: 'shadow' }],
    ['ivory_kite_knight', 'knight', 60, { el: 'holy' }],
    ['crimson_greatsword_knight', 'knight', 62, { el: 'blood', boss: true }],
    ['bronze_hammer_knight', 'knight', 60],
    ['bluecrest_halberd_knight', 'knight', 60, { el: 'cold' }],
    ['thorn_crown_knight', 'knight', 60, { el: 'poison' }],
    ['sun_pavise_knight', 'knight', 60, { el: 'holy' }],
    ['raven_beak_knight', 'knight', 60, { el: 'shadow' }],
    ['silver_lion_knight', 'knight', 62, { el: 'light', boss: true }],
    ['rust_chain_knight', 'knight', 60],
    ['bonecrest_knight', 'knight', 60],
    ['cragwall_knight', 'knight', 60],
    ['black_bastion_lancer', 'knight', 66, { el: 'shadow' }],
    ['crimson_spire_lancer', 'knight', 66, { el: 'blood' }],
    ['ivory_rampart_lancer', 'knight', 66, { el: 'holy' }],
    ['bronze_gate_lancer', 'knight', 66],
    ['azure_wing_lancer', 'knight', 66, { el: 'cold' }],
    ['thorn_bulwark_lancer', 'knight', 66, { el: 'poison' }],
    ['sunwall_lancer', 'knight', 66, { el: 'holy' }],
    ['ravenwall_lancer', 'knight', 66, { el: 'shadow' }],
    ['rust_fortress_lancer', 'knight', 66],
    ['silver_crescent_lancer', 'knight', 66, { el: 'arcane', boss: true }],
    ['redscale_dragoon', 'knight', 62, { also: ['skeleton'], el: 'fire' }],
    ['stormwing_dragoon', 'knight', 62, { also: ['skeleton'], el: 'light' }],
    ['emerald_talon_dragoon', 'knight', 62, { also: ['skeleton'], el: 'poison' }],
    ['obsidian_fang_dragoon', 'knight', 62, { also: ['skeleton'], el: 'shadow' }],
    ['ivory_crest_dragoon', 'knight', 62, { also: ['skeleton'], el: 'cold' }],
    ['copper_drake_dragoon', 'knight', 62, { also: ['skeleton'], el: 'fire' }],
    ['violet_coil_dragoon', 'knight', 62, { also: ['skeleton'], el: 'arcane' }],
    ['sandwyrm_dragoon', 'knight', 62, { also: ['skeleton'] }],
  ]),
  ...set2('goblins', mortal, [
    ['scrapknife_sneak', 'ghoul', 34],
    ['pothelm_clubber', 'skeleton', 36],
    ['ratbone_archer', 'archer', 36],
    ['toadshield_guard', 'knight', 40],
    ['lantern_grubber', 'imp', 34, { el: 'fire', demon: false }],
    ['barrel_bomber', 'beetle', 36, { el: 'fire' }],
    ['sawblade_ripper', 'skeleton', 38, { also: ['ghoul'] }],
    ['mushroom_shaman', 'shroom', 40, { also: ['cultist'], el: 'poison' }],
    ['hooknet_trapper', 'skeleton', 34],
    ['boneflute_hexer', 'cultist', 36, { el: 'shadow' }],
    ['panlid_duelist', 'skeleton', 38],
    ['pickaxe_digger', 'skeleton', 40, { also: ['ghoul'] }],
    ['scorpion_spearer', 'skeleton', 36, { also: ['scorpion'], el: 'poison' }],
    ['frogskin_slinger', 'archer', 36],
    ['crowmask_sneak', 'ghoul', 38],
    ['rust_crown_chief', 'knight', 42, { also: ['skeleton'], boss: true }],
    ['bellback_fanatic', 'cultist', 34],
    ['vine_whip_raider', 'skeleton', 36, { el: 'poison' }],
    ['boarjaw_brawler', 'ghoul', 38, { also: ['skeleton'] }],
    ['candle_cultist', 'cultist', 40, { el: 'fire' }],
    ['crossbow_tinker', 'archer', 34],
    ['spine_pavise_goblin', 'knight', 36],
    ['cauldron_carrier', 'worm', 38, { el: 'poison' }],
    ['eeltooth_fisher', 'skeleton', 40, { el: 'cold' }],
    ['antler_drum_caller', 'cultist', 34],
  ]),
  ...set2('slimes', { gore: 'goo' }, [
    ['emerald_droplet', 'slime', 24, { el: 'poison' }],
    ['amber_dome', 'slime', 28],
    ['violet_tendril', 'slime', 36, { also: ['shroom'], el: 'arcane' }],
    ['crimson_maw', 'slime', 30, { el: 'blood' }],
    ['cobalt_cube', 'slime', 34, { el: 'cold' }],
    ['ivory_pillar', 'slime', 46, { also: ['shroom'], el: 'holy' }],
    ['tar_pancake', 'slime', 22, { el: 'shadow' }],
    ['jade_crown', 'slime', 36, { el: 'poison' }],
    ['rust_bubble_colony', 'slime', 30, { also: ['beetle'], el: 'fire' }],
    ['silver_needle', 'slime', 28, { also: ['spider'] }],
    ['gold_chalice', 'slime', 44, { el: 'holy' }],
    ['indigo_snail', 'slime', 26, { also: ['worm'], el: 'arcane' }],
    ['bone_jelly', 'slime', 28],
    ['moss_antler', 'slime', 40, { also: ['shroom'], el: 'poison' }],
    ['blood_hourglass', 'slime', 44, { el: 'blood' }],
    ['frost_star', 'slime', 28, { also: ['spider'], el: 'cold' }],
    ['plum_hood', 'slime', 32, { el: 'shadow' }],
    ['copper_pot', 'slime', 24, { el: 'fire' }],
    ['acid_fork', 'slime', 36, { also: ['shroom'], el: 'acid' }],
    ['rose_coil', 'slime', 42, { el: 'blood' }],
    ['azure_bell', 'slime', 38, { also: ['elemental'], el: 'light', ...walks }],
    ['charcoal_boulder', 'slime', 36, { also: ['golem'], el: 'fire', gore: 'rock' }],
    ['honey_leech', 'worm', 24, { also: ['slime'] }],
    ['marrow_hand', 'slime', 38, { also: ['shroom'], gore: 'bone' }],
    ['sulfur_crownmaw', 'slime', 36, { also: ['shroom'], el: 'fire' }],
  ]),
  ...set2('kobolds', mortal, [
    ['redscale_shiv', 'ghoul', 38, { el: 'fire' }],
    ['bluecrest_spear', 'skeleton', 40, { el: 'cold' }],
    ['bronzeback_miner', 'skeleton', 40, { also: ['ghoul'] }],
    ['green_frill_archer', 'archer', 42],
    ['white_fang_shaman', 'cultist', 38, { el: 'cold' }],
    ['blackplate_guard', 'knight', 40, { el: 'shadow' }],
    ['yellow_sling_runner', 'archer', 40],
    ['violet_hex_tongue', 'cultist', 42, { el: 'arcane' }],
    ['rust_drill_tinker', 'skeleton', 38],
    ['jade_netter', 'skeleton', 40, { el: 'poison' }],
    ['bonehelm_axer', 'skeleton', 42],
    ['silver_scale_duelist', 'skeleton', 42, { also: ['ghoul'] }],
    ['ember_pot_hurler', 'imp', 38, { el: 'fire', demon: false }],
    ['moss_hood_stalker', 'ghoul', 40, { also: ['hound'], el: 'poison' }],
    ['teal_shell_warden', 'knight', 42, { el: 'cold' }],
    ['crimson_crest_captain', 'knight', 44, { also: ['skeleton'], el: 'blood', boss: true }],
    ['ochre_bell_ringer', 'cultist', 38],
    ['indigo_fang_priest', 'cultist', 40, { el: 'arcane' }],
    ['pale_tunnel_lancer', 'knight', 42],
    ['copper_trapjaw', 'skeleton', 42],
    ['greywing_glider', 'bat', 38, { also: ['gargoyle'] }],
    ['emerald_scale_alchemist', 'worm', 40, { el: 'poison' }],
    ['black_sand_scyther', 'skeleton', 42, { also: ['ghoul'], el: 'shadow' }],
    ['rose_frill_chanter', 'cultist', 42, { el: 'blood' }],
    ['golden_horn_chieftain', 'knight', 42, { also: ['skeleton'], el: 'holy', boss: true }],
  ]),
  ...set2('birdfolk', { ...mortal, ...walks }, [
    ['raven_mourner', 'wraith', 58, { also: ['cultist'], el: 'shadow' }],
    ['bone_vulture', 'gargoyle', 60],
    ['crimson_kite', 'gargoyle', 62, { also: ['hound'], el: 'fire' }],
    ['snow_owl_seer', 'cultist', 64, { also: ['wraith'], el: 'cold' }],
    ['bronze_eagle_guard', 'knight', 58, { also: ['gargoyle'] }],
    ['blue_jay_screecher', 'imp', 60, { el: 'light', demon: false }],
    ['moss_heron', 'ghoul', 62, { el: 'poison' }],
    ['violet_shrike', 'gargoyle', 64, { el: 'arcane' }],
    ['golden_falcon', 'gargoyle', 56, { also: ['bat'], el: 'holy' }],
    ['ashen_crow_witch', 'cultist', 60, { el: 'shadow' }],
    ['copper_condor', 'gargoyle', 62, { el: 'fire' }],
    ['teal_kingfisher', 'gargoyle', 64, { also: ['hound'], el: 'cold' }],
    ['scarlet_ibis', 'ghoul', 56, { el: 'blood' }],
    ['ivory_swan_revenant', 'wraith', 60, { also: ['cultist'], el: 'holy', boss: true }],
    ['obsidian_roc_matron', 'gargoyle', 64, { el: 'shadow', boss: true }],
  ]),
  ...SET3,
  ...BREACH_ART,
  ...AIR_ART,
  ...DEPTHS_EDGE, // the Depth's Edge Caverns' own creatures (data/depthsedge.js): never in another level's looks
);

// Player minions: the Necromancer's skeletons (assets/source/enemies/minions/). Never rolled as monsters; summon
// definitions (data/summons.js) point at them with `look: { art: id }`.
const NW = 'minions/necro_warriors', NC = 'minions/necro_casters';
export const SUMMON_ART = [
  { id: 'ns_warrior', sheet: NW, i: 0, name: 'Skeleton Warrior', h: 50 },
  { id: 'ns_archer', sheet: NW, i: 1, name: 'Skeletal Archer', h: 54 },
  { id: 'ns_spearman', sheet: NW, i: 2, name: 'Skeletal Spearman', h: 54 },
  { id: 'ns_reaver', sheet: NW, i: 3, name: 'Skeletal Reaver', h: 52 },
  { id: 'ns_coffin', sheet: NW, i: 4, name: 'Coffin Guard', h: 56 },
  { id: 'ns_crossbow', sheet: NW, i: 5, name: 'Skeletal Crossbowman', h: 50 },
  { id: 'ns_jailer', sheet: NW, i: 6, name: 'Chained Jailer', h: 54 },
  { id: 'ns_ramskull', sheet: NW, i: 7, name: 'Ramskull Berserker', h: 60 },
  { id: 'ns_digger', sheet: NW, i: 8, name: 'Gravedigger', h: 50 },
  { id: 'ns_banner', sheet: NW, i: 9, name: 'Bone Standard-Bearer', h: 66 },
  { id: 'ns_pyro', sheet: NC, i: 0, name: 'Skeletal Pyromancer', h: 56 },
  { id: 'ns_frost', sheet: NC, i: 1, name: 'Skeletal Mage', h: 60 },
  { id: 'ns_plague', sheet: NC, i: 2, name: 'Skeletal Plaguecaller', h: 50 },
  { id: 'ns_storm', sheet: NC, i: 3, name: 'Skeletal Stormcaller', h: 58 },
  { id: 'ns_bishop', sheet: NC, i: 4, name: 'Bone Bishop', h: 60 },
  { id: 'ns_reaper', sheet: NC, i: 5, name: 'Reaper King', h: 66 },
  { id: 'ns_pyre', sheet: NC, i: 6, name: 'Pyre Inquisitor', h: 62 },
  { id: 'ns_druid', sheet: NC, i: 7, name: 'Thornbone Druid', h: 58 },
  { id: 'ns_bell', sheet: NC, i: 8, name: 'Knell Ringer', h: 60 },
  { id: 'ns_archlich', sheet: NC, i: 9, name: 'Skeletal Archlich', h: 56 },
];

// Pets from the user's familiar sheets (assets/source/enemies/familiars/, cut in reading order). Summons pick one
// of a list at random (`look.art` = [ids]). blue_NN: 616 blue slimes, every one a Slime Lord minion; fam(): the rest.
const BLUE_COUNT = [56, 56, 56, 56, 56, 55, 56, 56, 56, 56, 56];
const BLUE_SKIP = new Set(['bs6_53', 'bs6_54']); // one stretched pair across two cells, cut in half
export const BLUE_SLIMES = BLUE_COUNT.flatMap((n, s) => Array.from({ length: n }, (_, i) => `bs${s + 1}_${i}`)).filter((id) => !BLUE_SKIP.has(id));
// The flat, melted ones: a new blue slime rises out of one (Creature.draw).
export const BLUE_PUDDLES = ['bs1_0', 'bs1_8', 'bs1_35', 'bs3_0', 'bs3_8', 'bs3_35', 'bs4_0', 'bs4_8', 'bs4_22', 'bs4_35', 'bs5_8', 'bs5_31',
  'bs5_35', 'bs5_37', 'bs6_8', 'bs6_9', 'bs6_15', 'bs6_23', 'bs6_24', 'bs6_36', 'bs10_31', 'bs10_37', 'bs11_8', 'bs11_31', 'bs11_35', 'bs11_37'];
const fam = (pre, sheet, names) => names.map((name, i) => ({ id: pre + i, sheet: 'familiars/' + sheet, i, name, h: 40 }));
export const FAMILIAR_ART = [
  ...BLUE_SLIMES.map((id) => { const [s, i] = id.slice(2).split('_'); return { id, sheet: 'familiars/blue_' + s.padStart(2, '0'), i: +i, name: 'Blue Slime', h: 30 }; }),
  ...fam('cr', 'critters', ['Raven', 'Spectral Crow', 'Armored Crow', 'Ember Crow', 'Magma Crab', 'Crystal Crab', 'Iron Crab', 'Void Crab',
    'Hooded Hamster', 'Knight Hamster', 'Wizard Hamster', 'Packer Hamster', 'Mossback Capybara', 'Armored Capybara', 'Royal Capybara', 'Cinder Capybara',
    'Toxic Slime', 'Magma Slime', 'Grave Slime', 'Jewel King Slime']),
  ...fam('ea', 'elemental_1', ['Treasure Slime', 'Frost Slime', 'Circuit Slime', 'Lava Slime', 'Bone Slime', 'Bloom Slime', 'Gear Slime', 'Void Slime',
    'Tide Slime', 'Sand Slime', 'Crystal Slime', 'Cursed Slime', 'Storm Slime', 'Imp Slime', 'Rainbow Mushroom Slime', 'Rock Slime',
    'Party Slime', 'Knight Slime', 'Eye Slime', 'Foam Slime']),
  ...fam('eb', 'elemental_2', ['Bubble Slime', 'Frost Slime', 'Ember Slime', 'Blood Slime', 'Moss Slime', 'Vine Slime', 'Amethyst Slime', 'Heart Slime',
    'Many-Eyed Slime', 'Gremlin Slime', 'Obsidian Slime', 'Shade Slime', 'Nebula Slime', 'Galaxy Slime', 'Rainbow Slime', 'Opal Slime',
    'Gold Slime', 'Ghost Slime', 'Thunder Slime', 'Toxic Swirl Slime']),
  ...fam('da', 'dragons_1', ['Red', 'Gold', 'Violet', 'Frost', 'Forest', 'Emerald', 'Azure', 'Smoke', 'Steel', 'Night',
    'Shadow', 'Crimson', 'Moss', 'Teal', 'Amethyst', 'Bone', 'Bronze', 'Obsidian', 'Copper', 'Sun'].map((c) => c + ' Dragon')),
  ...fam('db', 'dragons_2', ['Red', 'Gold', 'Violet', 'Sapphire', 'Leaf', 'Pine', 'Ice', 'Amber', 'Pearl', 'Cobalt',
    'Black', 'Rose', 'Bog', 'Jade', 'Plum', 'Lilac', 'Bronze', 'Iron', 'Rust', 'Brass'].map((c) => c + ' Dragon')),
  ...fam('wf', 'wolves', ['Grey Wolf', 'Snow Wolf', 'Runed Wolf', 'Armored Wolf', 'Timber Wolf', 'Frost Wolf', 'Snow Wolf', 'Runed Wolf', 'Fire Wolf',
    'Dire Wolf', 'Dire Wolf', 'Bone Dire Wolf', 'Storm Dire Wolf', 'Dire Wolf', 'Dire Wolf', 'Flame Dire Wolf', 'Shadow Dire Wolf']),
];

import { REPLACEMENT_ART } from './replacementart.js';
export const ART_BY_ID = Object.fromEntries([...BESTIARY, ...SUMMON_ART, ...FAMILIAR_ART, ...REPLACEMENT_ART].map((a) => [a.id, a]));

const compat = (a, arch) => a.arch === arch || (a.also && a.also.includes(arch));
/** Painted art that can play an AI archetype in a pack: every sheet, any biome (the Sea of Sand's own archetypes
 * keep their own creatures). Giants (`lone`) only play guardians and raid bosses. */
export function artPool(arch) {
  if (BESTIARY.some((a) => a.seaOfSand && a.arch === arch)) return BESTIARY.filter((a) => a.seaOfSand && a.arch === arch);
  return BESTIARY.filter((a) => !a.lone && !a.seaOfSand && !a.breach && !a.air && !a.depthsEdge && compat(a, arch));
}
/** Guardian art for an archetype (giants included). */
const bossPool = (arch) => BESTIARY.filter((a) => a.boss && !a.seaOfSand && !a.breach && !a.air && !a.depthsEdge && (!arch || compat(a, arch)));

// A level draws its looks from at most this many lazily loaded sheets (set 1 is always in), so a random bestiary
// still only downloads and decodes a few atlases per level.
const LEVEL_SHEETS = 6;
const EAGER_SHEET = /^set1\//;
const SWAP_KEYS = Object.keys(SWAPS);
const titleCase = (k) => k[0].toUpperCase() + k.slice(1);

/**
 * A level's bestiary: up to 4 random looks per archetype from the whole catalogue (no biome themes), each with a
 * random palette swap two times in three. A swapped look is named after its swap ("Ember Ashen Maw").
 */
export function rollLooks(biome, rnd = Math.random) {
  const sheets = new Set();
  const lazy = (a) => !EAGER_SHEET.test(a.sheet);
  const pickArt = (pool, excluded = []) => {
    let p = pool.filter((a) => !excluded.includes(a.id));
    if (sheets.size >= LEVEL_SHEETS) {
      const near = p.filter((a) => !lazy(a) || sheets.has(a.sheet));
      if (near.length) p = near;
    }
    if (!p.length) return null;
    const a = p[Math.floor(rnd() * p.length)];
    if (lazy(a)) sheets.add(a.sheet);
    return a;
  };
  const lookOf = (a) => {
    if (a.seaOfSand || rnd() < 1 / 3) return { art: a.id, swap: null };
    const k = SWAP_KEYS[Math.floor(rnd() * SWAP_KEYS.length)];
    return { art: a.id, swap: SWAPS[k], tint: titleCase(k) };
  };
  const chosen = new Map(), bosses = [];
  const looksFor = (arch) => {
    if (chosen.has(arch)) return chosen.get(arch);
    const pool = artPool(arch), ids = [], looks = [];
    for (let i = 0; i < 4; i++) {
      const a = pickArt(pool, ids);
      if (!a) break;
      ids.push(a.id); looks.push(lookOf(a));
    }
    chosen.set(arch, looks); return looks;
  };
  return {
    pick(arch, r = rnd) {
      const looks = looksFor(arch);
      return looks.length ? looks[Math.floor(r() * looks.length)] : null;
    },
    boss(roster, r = rnd) {
      const possible = (roster || biome.roster || []).filter((a) => a);
      const arch = possible.length ? possible[Math.floor(r() * possible.length)] : null;
      const a = pickArt(arch && bossPool(arch).length ? bossPool(arch) : bossPool());
      if (a) bosses.push(a.id);
      return a ? { arch: a.arch, look: lookOf(a) } : null;
    },
    ids() { return [...bosses, ...Array.from(chosen.values()).flat().map((l) => l.art)]; },
    /** Every look chosen so far, {art, swap} (game.js warmLevelArt builds their sprites). */
    all() { return Array.from(chosen.values()).flat(); },
  };
}

/** A unique monster's own palette swap. */
export function uniqueSwap(rnd = Math.random) {
  const keys = Object.keys(SWAPS);
  return SWAPS[keys[Math.floor(rnd() * keys.length)]];
}
