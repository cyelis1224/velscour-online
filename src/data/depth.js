// The descent: Demon Lord Velscour waits at FINAL_DEPTH, and depthLevel maps a depth to the monster level that
// sets its monsters' life, damage, XP and loot. The curve runs 1:1 to depth 60 and flattens after it, so 500
// depths fit a scale the gear, skill points and skill mastery (game/augments.js) can keep up with.
export const FINAL_DEPTH = 500;
/** The hero level cap (game/player.js re-exports it): no item asks for more (data/items.js rollItem). */
export const MAX_LEVEL = 3000;
export const depthLevel = (d) => (d <= 60 ? d : Math.round(60 + (d - 60) * 0.45));
/** Every fifth depth but the last ends in a BOSS ROOM. */
export const isRaidDepth = (d) => d % 5 === 0 && d !== FINAL_DEPTH;
/** First depth of d's five-depth block (the block ends in its BOSS ROOM): where a death sends the hero back to. */
export const blockStart = (d) => Math.floor((Math.max(1, d) - 1) / 5) * 5 + 1;
/**
 * Armor's divisor against a monster of level `lvl`: armor / (armor + armorDiv) of physical damage is stopped. Item
 * armor grows 1.045 an item level, so past level 100 the divisor grows as fast, or deep heroes became immune.
 */
export const armorDiv = (lvl) => (30 + lvl * 18) * Math.pow(1.045, Math.max(0, lvl - 100));
/** Hero life multiplier by hero level ("Fortitude"): gear and attributes add life linearly, monster hits don't. */
export const fortitude = (level) => 1 + Math.max(0, level - 60) * 0.022;
/** Read a table of [x, value] points at x: log-linear between points, held flat past either end. */
export function logCurve(T, x) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) {
    const [x0, a] = T[i - 1], [x1, b] = T[i];
    return a * Math.pow(b / a, (x - x0) / (x1 - x0));
  }
  return T[T.length - 1][1];
}
/**
 * Monster life multiplier by monster level. Hero damage grows far faster with level than monster life (1.068 a level):
 * a hero killed a normal in 0.3 s at depth 1, 0.05 s at depth 10 and under 0.005 s past depth 160, so everything died
 * before it could reach them. Measured in play by tools/tests/tuning.js (all 16 classes auto-playing against training
 * dummies, heroes two levels over their monsters) so one plain normal takes ~1.5 s of a level-1 hero's damage at depth 1
 * and ~3 s from depth 10 on (a pack of five ~1.5x that). Past level 258 (Velscour, the Endless Torment) a hero who keeps
 * pace gains ~1.061 a level of damage at first and ~1.053 deep down, against monster life's 1.068: held flat at 1690,
 * normals took ~50 s by depth 1000 and hours by depth 3000. The tail eases life to that pace instead (measured by
 * tools/tests/endgame.js deep), so normals creep from ~3.5 s at depth 500 to ~15 s at the level cap (3000, depth ~6600);
 * past level 3000 it holds, and the monsters outgrow a hero who can no longer level.
 */
const TOUGH = [[1, 4.6], [3, 9], [6, 34], [10, 66], [20, 139], [40, 185], [69, 270], [87, 370], [105, 470], [146, 970], [191, 1560], [258, 1690],
  [400, 609], [600, 95], [1000, 1.26], [1500, 3.1e-3], [2000, 5.2e-6], [2500, 3.1e-9], [3000, 6e-12]];
export const toughness = (lvl) => logCurve(TOUGH, lvl);
/** Abyssal Rifts keep the flat 1690 past level 258 (their tiers and honour board were tuned on it): a rift monster's life
 *  is multiplied by this (world.riftHold, game.buildRift; makeMonster and makeRaidBoss). */
export const riftHold = (lvl) => (lvl <= 258 ? 1 : 1690 / toughness(lvl));
/**
 * Monster damage multiplier by monster level. With fights lasting, every monster now lands its hits, so where hero
 * life lags monster damage (a normal hit was 6% of a hero's life at depth 40, ~12% at 80-160, 30% past 250) monsters
 * hit softer: a normal hit stays ~3-5% of a level-appropriate hero's life (tools/tests/tuning.js), and champions,
 * guardians, BOSS ROOM bosses and Velscour keep their multiples of it. The first few levels are gentler: a level-1 hero
 * with one skill and no gear fights whole packs.
 */
const DANGER = [[1, 0.7], [6, 1], [20, 1], [40, 0.7], [69, 0.45], [87, 0.38], [105, 0.32], [123, 0.22], [146, 0.14], [191, 0.15], [258, 0.15]];
export const danger = (lvl) => logCurve(DANGER, lvl);
/**
 * Monster packs per room area by depth (world/dungeon.js). With monsters taking seconds each, the old density
 * (1.1 + 0.013 a depth to 120: ~800 monsters a level at depth 100) made a deep level a half-hour slog; it grows half
 * as fast now, and monsterBase's XP makes up the difference (densityXp) so levels per depth stay where they were.
 */
export const density = (d) => 1 + Math.min(d, 120) * 0.006;
const OLD_DENSITY = (d) => 1.1 + Math.min(d, 120) * 0.013;
/** XP multiplier for a monster level: the old pack density over the new one at the depth that level lives at. */
export const densityXp = (lvl) => { const d = lvl <= 60 ? lvl : 60 + (lvl - 60) / 0.45; return OLD_DENSITY(d) / density(d); };
/**
 * The damage scale. Monster life and hero damage ("power") grow ~1.068 a level and more (toughness), hero life and
 * monster hits about linearly, so deep heroes hit for billions against 30k life. Every power figure the player sees
 * (damage numbers, the DPS plaque, weapon and skill damage) is shown divided by dmgScale(level of the monster hit, or
 * heroDmgLevel): a normal monster's life (monsterBase hp) then reads about half a same-level hero's life, and as
 * toughness sizes it to ~3 s of a hero's damage, a hero's damage runs ~15% of a hero's life a second. Display only:
 * the game runs on the raw numbers, so nothing plays differently. Keep the hp term in step with monsterBase.
 * A PvP hit would be shownDmg(raw, arena level) taken off the defender's life, after its armor and resistances.
 */
export const dmgScale = (lvl) => (30 * Math.pow(1.068, lvl - 1) * toughness(lvl)) / ((100 + lvl * 9.5) * fortitude(lvl));
export const shownDmg = (raw, lvl) => raw / dmgScale(Math.max(1, lvl || 1));
/**
 * Weapon figures (an item's Damage, the sheet's Weapon Base, "+N Weapon Damage") have a scale of their own: a Common
 * weapon of the level averages 100 (a Rare ~150-250 by its extra power levels). On the hit scale above a weapon read
 * 0.03-1, since its base damage is a sliver of a hit next to skills, mastery and bonuses (players read it as broken).
 */
export const weaponRef = (lvl) => 3.4 * Math.pow(1.052, lvl - 1) * (1 + lvl * 0.012);
export const shownWeapon = (raw, lvl) => (raw / weaponRef(Math.max(1, lvl || 1))) * 100;
/** The level tooltips and the stats plaque measure against: the monsters of the hero's depth (as heroDamage does). */
export const heroDmgLevel = (c) => depthLevel((c && c.depth) || 1);
