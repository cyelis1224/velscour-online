// Global game state singleton. Modules import G and read fields at runtime.
export const G = {
  canvas: null,
  ctx: null,
  W: 0, // css pixels
  H: 0,
  dpr: 1,
  touch: false,
  assets: null,
  world: null,
  player: null,
  char: null, // persistent character record (saved)
  mode: 'loading', // loading | title | game
  paused: false, // simulation paused (menus on desktop keep running in town)
  time: 0,
  dt: 0,
  frame: 0,
  hitStop: 0,
  settings: {
    sfx: 0.6,
    music: 0.35,
    amb: 0.5,
    gore: 2, // 0 off, 1 normal, 2 extreme
    dmgNumbers: true,
    shake: true,
    zoom: 1,
    mobileSkillBar: false, // landscape phones: full 15-slot bar art (off: orbs + potions only, the touch buttons hold the skills)
    lockSkillBar: false, // auto-play only fills empty bar slots
    hideItemNames: false, // no item name labels on the ground (hover still shows one)
    autoSkillPoints: true, // auto-play spends skill points
    autoStatPoints: true, // auto-play spends attribute points
    autoGear: true, // auto-play equips, sells, buys, stashes and upgrades gear (off: hands off, potions only)
    outlines: true, // see-through rims round the hero, monsters and pets, over spells, walls and darkness
    minionCounts: true, // tiles in the buff row: how many of each summon are out
    lifeBars: true, // a life bar over every enemy, bosses too (off: only over a monster just hit)
    wallLines: false, // a line along the foot of the dungeon's walls, over the spells
    noSkipCine: false, // "Don't skip cutscenes": Sky Battle scenes already seen play at 1x, not 20x
    fpsCap: 0, // frame rate cap: 0 none, 30 (phones run cooler over a long session)
    showHeroStats: true, // show/hide the #hero-stats div
    showTargetBox: true, // show/hide the #target-box div
    showTargetSprite: true, // choose if target-box shows the target sprite or not
  },
};

export const SETTINGS_KEY = 'velscour_settings_v1';

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    Object.assign(G.settings, s);
    // v1.0.7: landscape phones switched to the compact HUD by default; flip older saves over once
    if (!s.mobileHudV2) { G.settings.mobileSkillBar = false; G.settings.mobileHudV2 = true; }
  } catch (e) { /* ignore */ }
}
export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
}
