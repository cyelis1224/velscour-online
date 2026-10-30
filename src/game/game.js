// Game flow: characters, town, dungeon depths, death, victory.
import { G } from '../state.js';
import { riftgateSpot } from '../gfx/riftgate.js';
import { input } from '../core/input.js';
import { camera } from '../core/view.js';
import { sfx, playMusic, stopMusic, setAmbience, stopAmbience, footsteps } from '../core/audio.js';
import { rand, pick, randi, escapeHtml, dist, dist2, RNG, makeCanvas, fmtInt, swapKey, hexToRgb } from '../core/util.js';
import { biomeTileSet, loadBiomeArt, mixedTileSet, keepTileSets } from '../core/assets.js';
import { loadArtFor, enemyImage, markArtCaches, trimArtCaches } from '../core/enemyart.js';
import { loadClassArt } from '../core/classart.js';
import { loadGearArt } from '../core/gearart.js';
import { loadHeld } from '../gfx/heldart.js';
import { preloadBarFx } from '../gfx/artfx.js';
import { SKILLS } from '../data/skills.js';
import { setClassItems, setRingContext, SEAL_GAP, shownEquip } from '../data/items.js';
import { BREACH_BIOME, BREACH_WALLS } from '../data/biomes.js';
import { BIOMES, BETA_BIOMES, BIOME_BY_ID, TOWN_BIOME, drawBiome, biomeChoices, takeBiome, mixPartner, recordBiomeVisit } from '../data/biomes.js';
import { CLASSES } from '../data/classes.js';
import { generateDungeon, isRaidDepth } from '../world/dungeon.js';
import { FINAL_DEPTH, depthLevel, blockStart } from '../data/depth.js';
import { addDefiance, clearDefiance, defianceText, tickBlessing } from './defiance.js';
import { setupHappenings, announceHappenings, happeningsTick, townHappening, townTick, recordDepth, markNemesis, OMENS, rollOmen, anyOmen, omenable } from './happenings.js';
import { greedOf, greedPacks, greedWorld, greedCleared, greedDeath } from './greed.js';
import { spectateTick } from './spectate.js';
import { toggleSmite } from './smite.js';
import { generateTown, makeTownTiles, rollTownWeather } from '../world/town.js';
import { generateOverworld } from '../world/overworld.js';
import { createOverworldScenario } from './overworld.js';
import { addWanderers } from './wanderers.js';
import { createSeaOfSandScenario } from './seaofsand.js';
import { loadSeaOfSandPack, releaseSeaOfSandPack } from '../gfx/seaofsand.js';
import { createDarkForestRun } from './darkforest.js';
import { generateDarkForest } from '../world/darkforest.js';
import { loadDarkForestTrees } from '../gfx/darkforest.js';
import { generateMountain } from '../world/mountain.js';
import { generateBreach } from '../world/breach.js';
import { createBreachRun, chestAt, breachMonster } from './breach.js';
import { breachDepth, breachLevel, BREACH_ART, BREACH_ARCHS } from '../data/breach.js';
import { createMountainRun } from './mountain.js';
import { castle3dTick } from './castle3d.js';
import { useTerrain, terrainOf } from '../gfx/terrain.js';
import { generateTower } from '../world/tower.js';
import { createTowerRun, useTower } from './tower.js';
import { loadTower3D, tower3dReady } from '../gfx/tower3d.js';
import { generateCaverns, CAVE_VARIANTS } from '../world/caverns.js';
import { createCaveRun, useCaverns } from './caverns.js';
import { loadCave3D, cave3dReady } from '../gfx/cave3d.js';
import { generateDunes } from '../world/dunes.js';
import { createDuneRun, useDunes } from './dunes.js';
import { loadDunes3D, dunes3dReady } from '../gfx/dunes3d.js';
import { DUNE_VARIANTS } from '../data/dunes.js';
import { loadCastlePack, releaseCastlePack } from '../gfx/castle.js';
import { loadCastle3D, releaseCastle3D, loadBaked, castle3dState, warmBaked } from '../gfx/castle3dart.js';
import { CASTLE_VARIANTS } from '../data/castles.js';
import { addCastleStory } from './castlestory.js';
import { generateSkyship } from '../world/skyship.js';
import { warmSky } from '../gfx/skyship.js';
import { createSkyBattle } from './skybattle.js';
import { SKY_ALL } from '../data/skybattle.js';
import { TOWNSFOLK } from '../data/townsfolk.js';
const TOWNSFOLK_KNIGHTS = TOWNSFOLK.filter((q) => q.knight).map((q) => q.spriteId);
import { Cine, CINE_FAST } from './cinema.js';
import { lights, updateVfx } from '../gfx/vfx.js';
import { World } from './world.js';
import { Player } from './player.js';
import { makeMonster, makeElite, Monster } from './monster.js';
import { clearRims } from './creature.js';
import { applyTrait, rollTrait, ambushTick, madnessTick, unleashMadness, enter } from './mayhem.js';
import { hit, kill } from './combat.js';
import { makeRaidBoss } from './raid.js';
import { dropChest, GroundItem } from './loot.js';
import { renderWorld, drawMinimap, preloadTownSheets, releaseTownSheets, propReach } from './render.js';
import { controls } from './controls.js';
import { Auto } from './autoplay.js';
import { writeSave, newCharData, migrate } from './save.js';
import { grantDeathGift, DEATH_PHRASE } from './deathgift.js';
import { clearVfx, floatText, sparkle, addEffect, Ring, Bolt, Column } from '../gfx/vfx.js';
import { Meter } from './dpsmeter.js';
import { UI } from '../ui/ui.js';
import { HUD } from '../ui/hud.js';
import { TouchUI } from '../ui/touch.js';
import { Vendor } from '../ui/vendor.js';
import { Stash } from '../ui/stash.js';
import { startTownLife } from './townlife.js';
import { toggleInventory } from '../ui/inventory.js';
import { toggleTree, toggleBook } from '../ui/skills.js';
import { toggleQuest } from '../ui/quest.js';
import { setupVelscour } from './velscour.js';
import { loadVelscourThrone } from '../gfx/velscourthrone.js';
import { offerCommissions, setupCommissions, commissionClear, wantedBiomes, LINE_BY_ID, commState } from './commissions.js';
import { titleScreen, hide as hideScreen, deathScreen, victoryScreen, pauseMenu, helpDialog } from '../ui/screens.js';
import { openLobby } from '../ui/lobby.js';
import { net } from '../net/network.js';
import { RemotePlayer } from '../net/remoteplayer.js';
import { updateAutomapPartyRoster } from '../ui/partyroster.js';
import { GameChat } from '../ui/chat.js';
// the Endgame (docs/ENDGAME.md): Heresies, Abyssal Rifts, Velscour Unbound, Infernal Marks
import { endgameUnlocked, unlockEndgame } from './endgame.js';
import { heresySpawns, heresyWorld, heresyBegin, heresyTick, heresiesOf, heresyRank, worldRank, MARKS_RANK } from './heresies.js';
import { createRiftRun, riftTick, riftOpen, riftDepth, riftLevel, fmtTime, riftLeave, RIFT_QUOTA, RIFT_DENSITY } from './rifts.js';
import { unboundReady, spendKeys, keysOf } from './unbound.js';
import { grantMarks, saveMarkXp } from './marks.js';
import { Heresies } from '../ui/heresies.js';
import { Rifts } from '../ui/rifts.js';
import { Marks } from '../ui/marks.js';

const PICK_WAIT = 8; // seconds auto-play gives the player to choose a portal down (portalChoice)

const STEP_SURFACE = { sunken: 'water', plague: 'water', sewers: 'water', serpent: 'water', library: 'wood', gilded: 'wood', sea_of_sand:'sand', dark_forest:'wood', skyship:'wood' };   // footstep sounds; default stone

const VELSCOUR_TAUNT_STARTS = [
  'WHY ARE YOU TRYING TO CONTACT VELSCOUR', 'WHAT MADE YOU THINK VELSCOUR WANTS TO HEAR FROM YOU',
  'DID YOU REALLY EXPECT VELSCOUR TO ANSWER', 'WHO TOLD YOU VELSCOUR TAKES MESSAGES',
  'IS THIS HOW YOU PLAN TO CHALLENGE VELSCOUR', 'DO YOU HAVE A DEATH WISH OR JUST POOR MANNERS',
  'WHY SUMMON A DEMON LORD WHEN YOU CAN BOTHER ANYONE ELSE', 'DID THE GRAVEYARD RECOMMEND THIS CONTACT METHOD',
  'ARE YOU LOST OR JUST COMMITTED TO MAKING THINGS WORSE', 'WHAT PART OF DOOM DID YOU MISTAKE FOR CUSTOMER SERVICE',
  'DID YOU BRING A MESSAGE OR JUST YOUR LAST WORDS', 'WHY IS YOUR FIRST IDEA ALWAYS THE MOST CURSED ONE',
  'DO YOU THINK HELL HAS A RECEPTION DESK', 'HOW MANY BAD DECISIONS FIT IN ONE SHORT MESSAGE',
  'ARE YOU TRYING TO NEGOTIATE WITH THE END OF YOU', 'DID YOUR COMMON SENSE DIE BEFORE YOU GOT HERE',
  'WHAT COULD POSSIBLY GO WRONG THIS TIME', 'WHY ASK THE ABYSS TO NOTICE YOU',
  'IS THIS BRAVERY OR A VERY SPECIFIC KIND OF STUPID', 'DID YOU THINK THE DEMON LORD WAS BETWEEN APPOINTMENTS',
];
const VELSCOUR_TAUNT_ENDS = [
  'He is busy polishing the thing that will end your adventure.', 'The abyss has a strict no refunds policy.',
  'Your courage is adorable. Your odds are not.', 'Hell called; it said to stop making it awkward.',
  'Please leave a message after the screaming.', 'The last visitor left as a cautionary stain.',
  'He read your aura and marked it spam.', 'Your odds are somewhere beneath the floor.',
  'This conversation may be recorded for the inquest.', 'Even the skeletons are embarrassed for you.',
  'The waiting room is just a pit with better lighting.', 'He is currently unavailable for mortal nonsense.',
  'Your bravery has been forwarded to the nearest grave.', 'The reply window is sealed until the heat death of hope.',
  'A single black candle is being lit in your honor.', 'The demons drew lots. Nobody wanted to answer.',
  'You have reached the bottom of the bad idea barrel.', 'Please hold. Eternity is estimated at eternity.',
  'Your message will be delivered by a very nervous imp.', 'There is no safe word in the terms of service.',
  'Somewhere, a lich just sighed at your decision.', 'The abyss knows your name and still declined.',
  'This is why the dead keep their phones on silent.', 'Try again when your survival instinct returns.',
  'Your next of kin may appreciate the initiative.',
];
const VELSCOUR_TAUNTS = VELSCOUR_TAUNT_STARTS.flatMap((start) => VELSCOUR_TAUNT_ENDS.map((end) => `${start}? ${end}`));

let townCache = null, townTiles = null;
let saveT = 0;
let automapCanvas = null;

// Build the level's monster sprites (palette swap, hit flash, corpse shade) behind the loading screen: each swap reads
// pixels back from the GPU, and doing that on a monster's first hit or death stalled the frame (worst on phones).
// Yields every ~40 ms so the loading screen keeps painting (not while hidden: a hidden page's chained timers can wait a minute).
async function warmLevelArt(w) {
  const seen = new Set();
  if (w.map.hgt) terrainOf(w.map); // a height map's draw order and occluders (the Castle's 100k columns): behind the loading screen, not the first frame
  warmSky(w); // the Sky Battle's clouds
  if (w.map.c3struct || w.sky) warmBaked(G.ctx); // the baked 3D pages (the Castle's masonry, the airships)
  let t = performance.now();
  markArtCaches();
  for (const c of w.creatures) {
    if (!c.art || G.world !== w) continue;
    const k = c.art + '|' + swapKey(c.swap);
    if (seen.has(k)) continue;
    seen.add(k);
    if (enemyImage(c.art, c.swap)) { enemyImage(c.art, c.swap, 'flash'); enemyImage(c.art, c.swap, 'dark'); }
    if (performance.now() - t > 40 && !document.hidden) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
  }
  // and the looks the level has chosen for what arrives later (waves, ambushes, summons), so their first frame
  // doesn't build them
  for (const l of (w.looks && w.looks.all ? w.looks.all() : [])) {
    if (!l || !l.art || G.world !== w) continue;
    const k = l.art + '|' + swapKey(l.swap);
    if (seen.has(k)) continue;
    seen.add(k);
    if (enemyImage(l.art, l.swap)) { enemyImage(l.art, l.swap, 'flash'); enemyImage(l.art, l.swap, 'dark'); }
    if (performance.now() - t > 40 && !document.hidden) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
  }
  // what earlier levels built and this one never asked for goes (a long run carried every level's sprites)
  if (G.world === w) { trimArtCaches(); clearRims(); }
}

// Let go of the art the level being built doesn't use: the Castle (~120 MB decoded) and Sea of Sand packs,
// townsfolk sheets. Called by the level-entry flows once the new level's art is in (never on the way through town:
// a hero going back to the same biome keeps its pack); buildDungeon alone keeps everything, for tests and tools.
// A run through many biomes kept all of it, plus every level's monster sprites, rims and silhouettes (~590 MB of
// images and canvases after 30 levels, ~290 MB now). Everything reloads from the HTTP cache when needed.
// (The painted biome packs stay: there are only a few, and fetching one again decoded a second copy while the
// browser still held the first, which cost more renderer memory than it saved.)
function releaseLevelArt(biome) {
  if (biome?.id !== 'castle') releaseCastlePack();
  if (biome?.id !== 'castle' && biome?.id !== 'skyship') releaseCastle3D();
  if (biome?.id !== 'sea_of_sand') releaseSeaOfSandPack(); // loadArtFor fetches it again for ss_ monsters elsewhere
  if (!biome?.overworld && biome?.id !== 'town') releaseTownSheets();
}

let hudCine = false;
let netSyncT = 0;
let monSyncT = 0;
/** A world during a cut scene: the scene's actors (leaps, scripted walks), townsfolk, effects and the director move;
 * nobody fights and nobody takes input. */
function cineTick(w, dt) {
  w.time += dt;
  lights.length = 0;
  for (const c of w.creatures) if (c.entering && !c.dead) c.update(dt);
  for (const n of w.npcs) n.update && n.update(dt);
  if (w.overworldScenario) w.overworldScenario.update(dt);
  updateVfx(dt, w);
}

let netListenersAttached = false;
function attachNetListeners() {
  if (netListenersAttached) return;
  netListenersAttached = true;

  net.on('player_joined_room', (p) => {
    if (G.world && p.id !== net.myId) {
      // Clean up any existing remote player with the same ID or name before adding the new one
      if (G.remotePlayers) {
        for (const [existingId, oldRp] of G.remotePlayers.entries()) {
          if (existingId === p.id || (p.name && oldRp.name === p.name)) {
            oldRp.destroy();
            if (G.world.creatures) {
              const idx = G.world.creatures.indexOf(oldRp);
              if (idx !== -1) G.world.creatures.splice(idx, 1);
            }
            G.remotePlayers.delete(existingId);
          }
        }
      }
      if (G.world.creatures) {
        for (let i = G.world.creatures.length - 1; i >= 0; i--) {
          const c = G.world.creatures[i];
          if (c.isRemotePlayer && (c.id === p.id || (p.name && c.name === p.name))) {
            c.destroy && c.destroy();
            G.world.creatures.splice(i, 1);
          }
        }
      }
      const rp = new RemotePlayer(p);
      let sx = G.player.x + 1, sy = G.player.y + 1;
      if (G.world.kind === 'town' && townCache?.portal) {
        const P = townCache.portal, C = townCache.center, l = Math.hypot(C.x - P.x, C.y - P.y) || 1;
        sx = P.x + ((C.x - P.x) / l) * 3.2;
        sy = P.y + ((C.y - P.y) / l) * 3.2;
      } else if (G.world.portals?.[0]) {
        sx = G.world.portals[0].x;
        sy = G.world.portals[0].y;
      }
      rp.x = sx; rp.y = sy;
      rp.targetX = sx; rp.targetY = sy;
      G.world.add(rp);
      if (!G.remotePlayers) G.remotePlayers = new Map();
      G.remotePlayers.set(p.id, rp);
      UI.log(`<b style="color:#7ab8ff">${escapeHtml(p.name)}</b> (Lv ${p.level} ${CLASSES[p.classId]?.name || ''}) joined the room.`, '#ffd860');
      sfx('portal');
      if (G.player && G.player.classId === 'bard' && G.char?.tabs) {
        net.sendBardTabs(G.char.tabs, G.char.tabAt);
      }
    }
  });

  net.on('player_left_room', (data) => {
    const toRemove = [];
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        if (id === data.playerId || (data.playerName && rp.name === data.playerName)) {
          toRemove.push([id, rp]);
        }
      }
    }
    for (const [id, rp] of toRemove) {
      rp.destroy();
      if (G.world && G.world.creatures) {
        const idx = G.world.creatures.indexOf(rp);
        if (idx !== -1) G.world.creatures.splice(idx, 1);
      }
      G.remotePlayers.delete(id);
    }
    if (G.world && G.world.creatures) {
      for (let i = G.world.creatures.length - 1; i >= 0; i--) {
        const c = G.world.creatures[i];
        if (c.isRemotePlayer && (c.id === data.playerId || (data.playerName && c.name === data.playerName))) {
          c.destroy && c.destroy();
          G.world.creatures.splice(i, 1);
        }
      }
    }
    UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.playerName || 'A player')}</b> left the room.`, '#a8977c');
  });

  net.on('player_disconnected', (data) => {
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        if (id === data.playerId || (data.playerName && rp.name === data.playerName)) {
          rp.alpha = 0.5;
        }
      }
    }
    UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.playerName || 'A player')}</b> lost connection (waiting for reconnect...).`, '#ffd860');
  });

  net.on('player_reconnected', (data) => {
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        if (id === data.playerId || (data.playerName && rp.name === data.playerName)) {
          rp.alpha = 1.0;
        }
      }
    }
    UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.playerName || 'A player')}</b> reconnected!`, '#48e868');
  });

  net.on('room_reconnected', (data) => {
    if (data && data.room) {
      const oldUnsealed = G.room?.unsealedDepths;
      G.room = data.room;
      if (Array.isArray(data.room.unsealedDepths)) {
        G.room.unsealedDepths = new Set(data.room.unsealedDepths);
      } else if (oldUnsealed) {
        G.room.unsealedDepths = oldUnsealed;
      } else {
        G.room.unsealedDepths = new Set();
      }
      UI.log(`Link restored to room <b style="color:#ffd860">${escapeHtml(data.room.name)}</b>!`, '#48e868');
    }
  });

  net.on('game_player_state', (state) => {
    if (!G.world || state.id === net.myId) return;
    if (!G.remotePlayers) G.remotePlayers = new Map();
    let rp = G.remotePlayers.get(state.id);
    if (!rp) {
      // Clean up any stale remote player with this same name
      for (const [oldId, oldRp] of G.remotePlayers.entries()) {
        if (state.name && oldRp.name === state.name) {
          oldRp.destroy();
          if (G.world.creatures) {
            const idx = G.world.creatures.indexOf(oldRp);
            if (idx !== -1) G.world.creatures.splice(idx, 1);
          }
          G.remotePlayers.delete(oldId);
        }
      }
      rp = new RemotePlayer({ id: state.id, name: state.name || 'Hero', classId: state.classId || 'paladin', level: state.level || 1, gear: state.gear });
      G.remotePlayers.set(state.id, rp);
    }
    rp._lastState = state;
    rp.worldKind = state.worldKind;
    rp.depth = state.depth;

    const remoteKind = state.worldKind || 'town';
    const myKind = G.world?.kind || 'town';
    const sameWorld = (remoteKind === myKind) && (myKind !== 'dungeon' || state.depth === G.world.depth);
    if (sameWorld) {
      if (rp.world !== G.world || !G.world.creatures.includes(rp)) {
        rp.x = typeof state.x === 'number' ? state.x : rp.x;
        rp.y = typeof state.y === 'number' ? state.y : rp.y;
        rp.targetX = rp.x;
        rp.targetY = rp.y;
        G.world.add(rp);
      }
      rp.updateFromNetwork(state);
      if (Array.isArray(state.summons)) {
        rp.syncSummons(state.summons);
      }
    } else {
      if (rp.world === G.world || G.world.creatures.includes(rp)) {
        G.world.remove(rp);
        rp.destroySummons();
        rp.destroySig();
      }
      if (typeof state.hp === 'number') rp.hp = state.hp;
      if (typeof state.maxHp === 'number') rp.maxHp = state.maxHp;
      if (typeof state.mana === 'number') rp.mana = state.mana;
      if (typeof state.maxMana === 'number') rp.maxMana = state.maxMana;
      rp.dead = (rp.hp <= 0);
    }
  });

  net.on('game_skill_cast', (data) => {
    if (!G.world || data.playerId === net.myId) return;
    const rp = G.remotePlayers?.get(data.playerId);
    if (rp && rp.world === G.world && G.world.creatures.includes(rp)) {
      rp.onCastSkill(data.skillId, data.x, data.y, data.targetId, data.level, data.extra);
    }
  });

  net.on('game_bard_tabs', (data) => {
    if (data.playerId === net.myId) return;
    const rp = G.remotePlayers?.get(data.playerId);
    if (rp) {
      rp.setBardTabs(data.tabs, data.tabAt);
    }
  });

  net.on('game_monster_hit', (data) => {
    if (!G.world || data.sourceId === net.myId) return;
    if (data.worldKind && data.worldKind !== G.world.kind) return;
    if (data.depth && data.depth !== G.world.depth) return;
    if (G.world.creatures) {
      let m = null;
      if (data.netId) {
        m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && c.netId === data.netId);
      }
      if (!m && data.monsterIdx) {
        m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && c.idx === data.monsterIdx);
      }
      if (!m && data.x != null && data.y != null) {
        m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && Math.hypot(c.x - data.x, c.y - data.y) < 2.0);
      }
      if (m) {
        const rp = G.remotePlayers?.get(data.sourceId) || null;
        hit(rp, m, data.dmg, data.elem || 'phys', { fromNetwork: true, crit: !!data.isCrit });
        if (data.killed && !m.dead) {
          kill(m, rp, { el: data.elem || 'phys', crit: !!data.isCrit });
        }
      }
      if (data.killed && (data.isBoss || data.rank === 'boss' || (m && m === G.world.boss) || (G.world.boss && (G.world.boss.netId === data.netId || G.world.boss.idx === data.monsterIdx)))) {
        if (G.room) {
          if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
          G.room.unsealedDepths.add(G.world.depth);
        }
        game.unsealDungeonExit(G.world, G.world.boss?.name);
      }
    }
  });

  net.on('game_floor_unsealed', (data) => {
    if (!G.room) return;
    if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
    G.room.unsealedDepths.add(data.depth);

    if (G.world && G.world.kind === 'dungeon' && G.world.depth === data.depth) {
      game.unsealDungeonExit(G.world, data.bossName);
    }
  });

  net.on('game_ambush_spawn', (data) => {
    if (!G.world || !G.world.creatures) return;
    if (data.depth != null && data.depth !== G.world.depth) return;
    if (game.isDungeonAuthority(G.world.depth)) return;

    for (const mon of data.monsters || []) {
      let existing = G.world.creatures.find(c => c.team === 'enemy' && (c.netId === mon.netId || (mon.idx && c.idx === mon.idx)));
      if (existing) {
        existing.ambusher = true;
        continue;
      }

      const m = makeMonster(G.world, mon.arch || 'ghoul', G.world.biome, mon.lvl || 1, mon.rank || 'normal', mon.x, mon.y, 0, mon.look);
      m.netId = mon.netId;
      if (mon.idx) m.idx = mon.idx;
      m.fromNetwork = true;
      if (mon.name) m.name = mon.name;
      if (mon.maxHp) { m.maxHp = mon.maxHp; m.hp = mon.maxHp; }
      if (mon.dmg) m.dmg = mon.dmg;
      if (mon.scale) m.scale = mon.scale;
      if (mon.affixes) m.affixes = [...mon.affixes];
      if (mon.aura) m.aura = mon.aura;
      if (mon.trait) applyTrait(m, mon.trait);
      m.awake = true; m.hunter = true; m.ambusher = true;
      G.world.add(m);

      if (mon.delay > 0) {
        m.targetable = false; m.alpha = 0; let d = mon.delay;
        m.entering = (dt) => { if ((d -= dt) <= 0) enter(m, data.kind, mon.from); };
      } else {
        enter(m, data.kind, mon.from);
      }
    }

    const msg = {
      drop: 'They fall from above!',
      teleport: 'Something tears through the veil!',
      burrow: 'The ground splits open!',
      wall: 'The walls come alive!'
    }[data.kind];
    const targetX = data.tx ?? G.world.player?.x;
    const targetY = data.ty ?? G.world.player?.y;
    if (msg && targetX != null && targetY != null) {
      floatText(targetX, targetY, 90, msg, '#ff8060', 14, { life: 1.8 });
      sfx('roar', 0.5);
    }
  });

  net.on('game_monster_spawn', (data) => {
    if (!G.world || !G.world.creatures) return;
    if (data.worldKind && data.worldKind !== G.world.kind) return;
    if (data.depth != null && data.depth !== G.world.depth) return;
    if (game.isDungeonAuthority(G.world.depth)) return;

    let existing = G.world.creatures.find(c => c.team === 'enemy' && (c.netId === data.netId || (data.idx && c.idx === data.idx)));
    if (existing) return;

    let m = null;
    if (data.isWard || data.vk) {
      const color = data.color || data.aura || '#b080ff';
      const rgb = hexToRgb(color);
      m = new Monster({
        x: data.x, y: data.y, team: 'enemy', ai: data.ai || 'ward',
        static: data.static ?? true, fly: !!data.fly, sprite: data.sprite || 'crystal',
        art: data.art || 'va_crystal', artH: data.artH || 42,
        swap: { tint: [...rgb, 0.75] },
        pal: { a: color, c: color, w: '#ffffff', m: '#4a4650' },
        px: 3, r: 0.45,
        maxHp: data.maxHp || 100, hp: data.hp || data.maxHp || 100,
        level: data.level || 1, dmg: data.dmg || 10, xp: 0,
        name: data.name || (data.isWard ? 'Warding Crystal' : 'Crystal'),
        rank: data.rank || 'champion', aura: color, awake: true,
        el: data.el || 'fire', res: {}, goreType: 'spark', atkCd: 3, isWard: !!data.isWard,
      });
      m.vk = data.vk;
      m.isWard = !!data.isWard;
      if (data.isWard && G.world.raid) {
        G.world.raid.wards.push(m);
        m.wardTick = (dt) => {
          m.moving = false;
          const bm = G.world.boss;
          if (bm && bm.dead) { m.dead = true; return; }
          if ((m.beamT = (m.beamT || 0) - dt) <= 0) {
            m.beamT = 0.12;
            if (bm) addEffect(new Bolt(m.x, m.y, 44, bm.x, bm.y, 70, color, 0.13, 2));
          }
        };
      }
      if (data.vk && G.world.velscour) {
        G.world.velscour.parts.push(m);
        if (data.vk === 'shard') {
          const bm = G.world.boss;
          m.onDeath = () => {
            if (!bm || bm.dead) return;
            const cut = bm.maxHp * 0.05;
            bm.hp = Math.max(bm.maxHp * 0.3, bm.hp - cut);
            if (G.world.velscour) G.world.velscour.lastHp = bm.hp;
            addEffect(new Column(m.x, m.y, '#ff3050', 1, 60, 300));
            floatText(m.x, m.y, 80, '-5% VELSCOUR', '#ff6080', 16, { life: 1.6 });
            sfx('explode');
          };
        }
      }
    } else {
      m = makeMonster(G.world, data.arch || 'ghoul', G.world.biome, data.level || 1, data.rank || 'normal', data.x, data.y, 0, data.look);
      if (data.name) m.name = data.name;
      if (data.maxHp) { m.maxHp = data.maxHp; m.hp = data.hp ?? data.maxHp; }
      if (data.dmg) m.dmg = data.dmg;
      if (data.scale) m.scale = data.scale;
      if (data.affixes) m.affixes = Array.isArray(data.affixes) ? [...data.affixes] : [data.affixes];
      if (data.aura || data.color) m.aura = data.aura || data.color;
      m.awake = true;
      if (data.traits) {
        for (const tr of (Array.isArray(data.traits) ? data.traits : [data.traits])) {
          applyTrait(m, tr);
        }
      }
      if (data.ambusher) {
        m.ambusher = true;
        m.hunter = true;
      }
      if (G.world.raid && (data.name?.includes('Royal Guard') || data.arch?.includes('colossus') || data.isRaidAdd)) {
        G.world.raid.minions.push(m);
      }
    }

    m.netId = data.netId;
    if (data.idx) m.idx = data.idx;
    if (data.ambusher) {
      m.ambusher = true;
      m.hunter = true;
    }
    m.fromNetwork = true;
    G.world.add(m);

    if (data.enteringKind) {
      enter(m, data.enteringKind, data.enteringFrom);
    }
  });

  net.on('game_monsters_state', (data) => {
    if (!G.world || !G.world.creatures || G.world.kind !== 'dungeon') return;
    if (data.depth && data.depth !== G.world.depth) return;
    if (game.isDungeonAuthority(G.world.depth)) return;

    // Purge monsters that were already killed on the authority
    if (Array.isArray(data.killed) && data.killed.length > 0) {
      if (!G.world.killedMonsterIds) G.world.killedMonsterIds = new Set();
      for (const kId of data.killed) {
        G.world.killedMonsterIds.add(kId);
        if (G.room) {
          if (!G.room.killedMonsters) G.room.killedMonsters = new Map();
          let set = G.room.killedMonsters.get(G.world.depth);
          if (!set) { set = new Set(); G.room.killedMonsters.set(G.world.depth, set); }
          set.add(kId);
        }
      }
      G.world.creatures = G.world.creatures.filter(c => {
        if (c.team !== 'enemy' || c.dead) return true;
        if (c.netId && G.world.killedMonsterIds.has(c.netId)) return false;
        if (c.idx != null && G.world.killedMonsterIds.has(c.idx)) return false;
        return true;
      });
      if (G.world.boss && (
        (G.world.boss.netId && G.world.killedMonsterIds.has(G.world.boss.netId)) ||
        (G.world.boss.idx != null && G.world.killedMonsterIds.has(G.world.boss.idx))
      )) {
        if (G.room) {
          if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
          G.room.unsealedDepths.add(G.world.depth);
        }
        game.unsealDungeonExit(G.world, G.world.boss.name);
      }
    }

    for (const s of data.monsters || []) {
      let m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && (c.netId === s.id || c.idx === s.id));
      if (!m && s.id && s.hp > 0 && (s.arch || s.isWard || s.vk)) {
        net.emit('game_monster_spawn', {
          netId: s.id,
          worldKind: G.world.kind,
          depth: G.world.depth,
          x: s.x,
          y: s.y,
          hp: s.hp,
          maxHp: s.maxHp || s.hp,
          level: s.lvl || 1,
          rank: s.rank || 'normal',
          arch: s.arch,
          name: s.name,
          isWard: s.isWard,
          vk: s.vk,
          static: s.static,
          fly: s.fly,
          color: s.color,
          ambusher: !!s.ambusher,
        });
        m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && (c.netId === s.id || c.idx === s.id));
      }
      if (m) {
        if (s.hp <= 0) {
          if (!m.dead) kill(m, null, { el: 'phys' });
        } else {
          if (s.maxHp && m.maxHp !== s.maxHp) m.maxHp = s.maxHp;
          m.hp = Math.min(m.maxHp, s.hp);
          if (s.name && m.name !== s.name) m.name = s.name;
          if (s.rank && m.rank !== s.rank) m.rank = s.rank;
          if (s.color && !m.aura) m.aura = s.color;
          if (s.affixes && (!m.affixes || m.affixes.length !== s.affixes.length)) m.affixes = [...s.affixes];
          if (s.a) {
            if (!m.awake) {
              m.awake = true;
              if (m.raid && !m.raid.announced) m.raid.wake();
              else if (m === G.world.boss && G.world.onBossAwake) G.world.onBossAwake(m);
            }
          }
          if (s.f !== undefined) m.facing = s.f;
          m.netTargetX = s.x;
          m.netTargetY = s.y;
          const d2 = dist2(m.x, m.y, s.x, s.y);
          if (d2 > 16) {
            m.x = s.x;
            m.y = s.y;
          }
        }
      }
    }
  });

  net.on('dungeon_killed_sync', (data) => {
    if (!G.room) return;
    if (!G.room.killedMonsters) G.room.killedMonsters = new Map();
    let set = G.room.killedMonsters.get(data.depth);
    if (!set) { set = new Set(); G.room.killedMonsters.set(data.depth, set); }
    for (const id of data.killed || []) set.add(id);

    if (data.unsealed || (data.unsealedDepths && data.unsealedDepths.includes(data.depth))) {
      if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
      G.room.unsealedDepths.add(data.depth);
    }

    if (G.world && G.world.kind === 'dungeon' && G.world.depth === data.depth) {
      if (!G.world.killedMonsterIds) G.world.killedMonsterIds = new Set();
      for (const id of data.killed || []) G.world.killedMonsterIds.add(id);
      G.world.creatures = G.world.creatures.filter(c => {
        if (c.team !== 'enemy' || c.dead) return true;
        if (c.netId && set.has(c.netId)) return false;
        if (c.idx != null && set.has(c.idx)) return false;
        return true;
      });
      const bossDead = (G.world.boss && (
        (G.world.boss.netId && set.has(G.world.boss.netId)) ||
        (G.world.boss.idx != null && set.has(G.world.boss.idx))
      )) || (G.room && G.room.unsealedDepths && G.room.unsealedDepths.has(data.depth));

      if (bossDead) {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(data.depth);
        game.unsealDungeonExit(G.world, G.world.boss?.name);
      }
    }
  });

  net.on('room_depth_sync', (data) => {
    if (G.room) {
      if (typeof data.depth === 'number' && data.depth > 0) {
        G.room.depth = data.depth;
        if (G.char && (G.world?.kind === 'town' || G.char.depth < data.depth)) {
          G.char.depth = data.depth;
        }
      }
      if (data.biome) {
        G.room.biome = data.biome;
        if (G.char && G.world?.kind === 'town') {
          G.char.nextBiome = data.biome;
        }
      }
      if (data.seed) G.room.dungeonSeed = data.seed;
      if (data.mixId !== undefined) G.room.mixId = data.mixId;
      if (Array.isArray(data.heresies)) G.room.heresies = data.heresies;
      if (data.unsealed || (data.unsealedDepths && data.unsealedDepths.includes(data.depth))) {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(data.depth);
        if (G.world && G.world.kind === 'dungeon' && G.world.depth === data.depth) {
          game.unsealDungeonExit(G.world);
        }
      }
      if (net.currentRoom) {
        net.currentRoom.depth = G.room.depth;
        net.currentRoom.biome = G.room.biome;
        net.currentRoom.dungeonSeed = G.room.dungeonSeed;
        net.currentRoom.mixId = G.room.mixId;
        net.currentRoom.heresies = G.room.heresies;
      }
    }
    // If local player had the exit portal choice dialog open on previous floor, refresh it with the selected choice!
    if (G.world?.kind === 'dungeon' && data.depth === G.world.depth + 1 && document.querySelector('.portal-choice')) {
      UI.closeAllDialogs();
      game.pick = null;
      game.portalChoice(G.world);
    }
    if (G.world?.kind === 'town' && data.depth) {
      UI.log(`Portal in town updated to Depth ${data.depth}!`, '#ffd860');
    }
  });

  net.on('game_town_transition', (data) => {
    if (G.room && data && typeof data.depth === 'number') {
      G.room.depth = data.depth;
    }
  });

  net.on('game_dungeon_transition', (data) => {
    if (G.room && data) {
      if (typeof data.depth === 'number') G.room.depth = data.depth;
      if (data.biome) G.room.biome = data.biome;
      if (data.seed) G.room.dungeonSeed = data.seed;
      if (data.mixId) G.room.mixId = data.mixId;
    }
  });

  net.on('game_loot_spawn', (data) => {
    if (!G.world || !G.world.loot) return;
    if (data.worldKind && G.world.kind !== data.worldKind) return;
    if (data.worldKind === 'dungeon' && data.depth != null && G.world.depth !== data.depth) return;
    if (G.world.loot.some(l => l.lootId && l.lootId === data.lootId)) return;

    const g = new GroundItem(data.x, data.y, data.kind, {
      item: data.item,
      amount: data.amount,
      lootId: data.lootId,
      droppedBy: data.droppedBy,
    });
    g.t = 0.4;
    g.vx = 0; g.vy = 0; g.vz = 0;
    G.world.addLoot(g);
    if (data.droppedBy) {
      UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.droppedBy)}</b> dropped <span style="color:${g.color}">${g.label}</span>`, '#a8977c');
    }
  });

  net.on('game_loot_pickup', (data) => {
    if (!G.world || !G.world.loot) return;
    const idx = G.world.loot.findIndex(l => l.lootId && l.lootId === data.lootId);
    if (idx !== -1) {
      const g = G.world.loot[idx];
      G.world.loot.splice(idx, 1);
      if (G.player && G.player.lootTarget === g) {
        G.player.lootTarget = null;
      }
      sparkle(g.x, g.y, 16, g.color || '#ffd34a', 12, 0.4);
      if (data.pickerName && data.pickerId !== net.myId) {
        UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.pickerName)}</b> picked up <span style="color:${g.color}">${g.label}</span>`, '#a8977c');
      }
    }
  });

  net.on('game_ground_loot_sync', (data) => {
    if (!G.world || !G.world.loot) return;
    for (const item of data.loot || []) {
      if (item.worldKind && G.world.kind !== item.worldKind) continue;
      if (item.worldKind === 'dungeon' && item.depth != null && G.world.depth !== item.depth) continue;
      if (G.world.loot.some(l => l.lootId && l.lootId === item.lootId)) continue;
      const g = new GroundItem(item.x, item.y, item.kind, {
        item: item.item,
        amount: item.amount,
        lootId: item.lootId,
        droppedBy: item.droppedBy,
      });
      g.t = 0.4;
      g.vx = 0; g.vy = 0; g.vz = 0;
      G.world.addLoot(g);
    }
  });

  net.on('game_loot_pickup_reject', (data) => {
    if (G.char && G.char.bag) {
      const idx = G.char.bag.findIndex(b => b && b._lootId === data.lootId);
      if (idx !== -1) {
        G.char.bag[idx] = null;
        if (G.player) G.player.recompute();
        UI.refresh();
        UI.log('Someone else already grabbed that item!', '#ff8080');
      }
    }
  });
}

export const game = {
  // ------------------------------------------------------------ characters
  // Start Single Player directly without connecting to lobby or multiplayer server
  async startSinglePlayer(charInfo, fresh = false) {
    if (net && (net.connected || net.ws || net.simulated)) {
      net.disconnect();
    }
    G.room = null;
    G.remotePlayers = null;
    const classId = charInfo.classId;
    await this.loadClassPack(classId);
    const c = fresh ? newCharData(classId, charInfo.name) : migrate(charInfo);
    G.selectedChar = c;
    this.startChar(c, fresh, null);
  },

  // Enter the Diablo II Battle.net lobby instead of immediately going solo
  async selectAndEnterLobby(charInfo, fresh = false, onBack = () => {}) {
    const classId = charInfo.classId;
    await this.loadClassPack(classId);
    const c = fresh ? newCharData(classId, charInfo.name) : migrate(charInfo);
    G.selectedChar = c;
    openLobby(c, onBack);
  },

  startMultiplayerGame(c, room) {
    G.room = room;
    if (Array.isArray(room.unsealedDepths)) {
      G.room.unsealedDepths = new Set(room.unsealedDepths);
    } else if (!G.room.unsealedDepths) {
      G.room.unsealedDepths = new Set();
    }
    G.remotePlayers = new Map();
    attachNetListeners();

    // Preserve the permanent town seed for the room
    const townSeed = room.townSeed || room.seed;
    if (townSeed) {
      G.room.townSeed = townSeed;
      c.townSeed = townSeed;
    }

    if (room.depth > 0) {
      G.room.depth = room.depth;
    }
    if (room.dungeonSeed) {
      G.room.dungeonSeed = room.dungeonSeed;
    }

    this.startChar(c, false, room);

    if (c.classId === 'bard' && c.tabs) {
      net.sendBardTabs(c.tabs, c.tabAt);
    }

    // Spawn other players already in the room
    if (room.players && G.world) {
      for (const p of room.players) {
        if (p.id !== net.myId && !G.remotePlayers.has(p.id)) {
          const rp = new RemotePlayer(p);
          const [sx, sy] = G.world.map ? (G.world.map.randomNear(G.player.x, G.player.y, 2) || [G.player.x + 1, G.player.y + 1]) : [G.player.x + 1, G.player.y + 1];
          rp.x = sx; rp.y = sy;
          rp.targetX = sx; rp.targetY = sy;
          G.world.add(rp);
          G.remotePlayers.set(p.id, rp);
        }
      }
    }
  },

  // async: the class's art pack (if it has one) loads first, because it names the class's catalog items
  async newChar(classId, name) {
    await this.loadClassPack(classId);
    const c = newCharData(classId, name);
    this.startChar(c, true);
  },
  async loadChar(c) {
    await this.loadClassPack(c.classId, c);
    this.startChar(migrate(c), false);
  },
  async loadClassPack(classId, char = null) {
    const el = document.getElementById('loading');
    const slow = setTimeout(() => el && el.classList.remove('hidden'), 250);
    const [meta] = await Promise.all([loadClassArt(classId), loadGearArt(classId), loadHeld(classId, char)]);
    clearTimeout(slow);
    if (el) el.classList.add('hidden');
    setClassItems(classId, meta);
  },

  startChar(c, fresh, room = null) {
    hideScreen();
    if (Auto.on) Auto.toggle(false);
    G.char = c;
    setRingContext(c.classId, c.skills);
    const p = new Player(c);
    G.player = p;
    p.applyGrants();
    if (!c.bar[0]) c.bar[0] = `${c.classId}.0.0`;
    p.recompute();
    p.hp = p.maxHp; p.mana = p.maxMana;
    G.mode = 'game';
    HUD.show(true);
    if (room) {
      GameChat.init();
      GameChat.show();
    } else {
      GameChat.hide();
    }
    if (G.touch) TouchUI.show(true);
    UI.refresh();
    Vendor.restock();
    this.enterTown(true);
    if (fresh) {
      setTimeout(() => {
        UI.centerMsg('HERRINGTON HOLLOW', 'The last town above the abyss', 3.5);
        UI.log(`Welcome, ${escapeHtml(c.name)}. Visit the vendors, then step into the <b style="color:#ff8050">portal</b> at the edge of town.`, '#ffe2a0');
        UI.log('You have <b>1 skill point</b> — open the Skill Tree (K) to learn your first ability.', '#ffd860');
        if (!G.touch) UI.log('Left-click to move/attack, right-click, ` 1–9 0 - = for skills, Z X C V for potions, Q for the quest log.');
        else UI.log('Left thumb moves, tap to attack, skill buttons on the right.');
      }, 400);
    }
    this.autosave();
  },

  autosave() {
    if (!G.char) return;
    writeSave(G.char);
    saveMarkXp();   // XP towards the next Infernal Mark (game/marks.js)
    saveT = 0;
  },

  quitToTitle(toLobby = !!G.room) {
    if (Auto.on) Auto.toggle(false);
    if (G.room) {
      net.leaveRoom();
      if (!toLobby) net.disconnect();
      G.room = null;
      if (G.remotePlayers) {
        for (const rp of G.remotePlayers.values()) rp.destroy();
      }
      G.remotePlayers = null;
    }
    this.autosave();
    const c = G.char;
    UI.closeAll();
    G.world = null; G.player = null; G.char = null;
    setClassItems(null);
    HUD.show(false); TouchUI.show(false); GameChat.hide();
    clearVfx();
    stopMusic(); stopAmbience();
    if (toLobby && c) {
      this.selectAndEnterLobby(c, false, () => titleScreen());
    } else {
      G.mode = 'title';
      titleScreen();
    }
  },

  isDungeonAuthority(depth) {
    if (!G.room || !G.world || G.world.kind !== 'dungeon' || G.world.depth !== depth) return false;
    const myId = net.myId;
    if (!myId) return true;
    const hostId = G.room.hostId || G.room.players?.[0]?.id;
    if (hostId === myId) return true;
    // If the room host is present at this dungeon depth, host is always the authority
    if (G.remotePlayers && hostId) {
      const hostRp = G.remotePlayers.get(hostId);
      const st = hostRp?._lastState;
      if (st && st.worldKind === 'dungeon' && st.depth === depth) {
        return false;
      }
    }
    // Host is not present at this depth; fallback to lowest ID among players at this depth
    let lowestId = myId;
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        const st = rp._lastState;
        if (st && st.worldKind === 'dungeon' && st.depth === depth) {
          if (id < lowestId) lowestId = id;
        }
      }
    }
    return lowestId === myId;
  },

  // ------------------------------------------------------------ worlds
  carrySummons(oldWorld) {
    if (!oldWorld) return [];
    return oldWorld.creatures.filter((c) => c.summon && !c.dead && !c.life && c.owner === G.player && !c.static);
  },

  setWorld(world, start, oldWorld) {
    const p = G.player;
    if (oldWorld && oldWorld.rift && oldWorld !== world) riftLeave(oldWorld); // walking out of an unfinished rift is a fail
    const keep = this.carrySummons(oldWorld);
    clearVfx();
    UI.closeAll();
    if (p) {
      p.x = start[0]; p.y = start[1]; p.z = 0;
      p.channel = null; p.path = null; p.moveTarget = null; p.attackTarget = null; p.interact = null; p.lootTarget = null;
      p.status = {}; p.dead = false; p.kbx = p.kby = 0; p.castLock = 0;
      world.player = p;
      world.add(p);
      for (const s of keep) {
        const [x, y] = world.map.randomNear(p.x, p.y, 1.5);
        s.x = x; s.y = y; s.world = world; s.aggro = null; s.foe = null; s.nav = null; s.fol = null;
        world.add(s);
      }
    }
    world._generatingDungeon = false;
    if (G.remotePlayers) {
      for (const rp of G.remotePlayers.values()) {
        if (rp.destroySummons) rp.destroySummons();
        if (rp.destroySig) rp.destroySig();
        const rpState = rp._lastState;
        const remoteKind = rpState?.worldKind || 'town';
        const sameWorld = (!rpState && world.kind === 'town') || (rpState && remoteKind === world.kind && (world.kind !== 'dungeon' || rpState.depth === world.depth));
        if (sameWorld) {
          const px = p ? p.x : start[0];
          const py = p ? p.y : start[1];
          const rx = (rpState && typeof rpState.x === 'number') ? rpState.x : (world.map.randomNear(px, py, 1.8)?.[0] || px + 1);
          const ry = (rpState && typeof rpState.y === 'number') ? rpState.y : (world.map.randomNear(px, py, 1.8)?.[1] || py + 1);
          rp.x = rx; rp.y = ry; rp.targetX = rx; rp.targetY = ry;
          rp.world = world;
          world.add(rp);
        } else {
          rp.world = null;
        }
      }
    }
    G.world = world;
    if (p) p.recompute(); // the Heresies in force read the level the hero stands in (game/heresies.js)
    Cine.abort(); // a cut scene belongs to the world it played in
    useTerrain(world.map); // a height map lifts the ground plane (gfx/terrain.js); flat maps clear it
    useTower(world); // the Serpentine Tower lays the grid onto its spiral stair (game/tower.js)
    useCaverns(world); // the Depth's Edge Caverns lift everything onto their smooth height field (game/caverns.js)
    useDunes(world); // so do the Sea of Sand's dunes and pyramids (game/dunes.js)
    camera.computeZoom();
    if (p) {
      camera.follow(p.x, p.y, 0, true);
      world.map.reveal(p.x, p.y, 12);
      preloadBarFx(p, SKILLS);
    }
    world.map.stepMask(); // the steps every path search reads (map.js), worked out here rather than mid fight
    propReach(world); // and the props' culling box (render.js), once the ground's heights are set
    if (G.room && net.connected) {
      net.sendLootRequest(world.kind, world.depth || 0);
    }
  },

  enterTown(fromNetwork = false) {
    const old = G.world;
    const c = G.char;
    const tileset = biomeTileSet(TOWN_BIOME);
    keepTileSets(null); // the last dungeon's recoloured set: rebuilt behind the loading screen if we go back
    if (!townTiles) townTiles = makeTownTiles();
    // every hero has a town of their own: the layout is rolled from c.townSeed
    if (G.room) {
      const townSeed = G.room.townSeed || G.room.seed;
      if (townSeed) {
        G.room.townSeed = townSeed;
        c.townSeed = townSeed;
      }
    }
    if (!townCache || townCache.seed !== c.townSeed) townCache = generateTown(tileset, c.townSeed);
    const t = townCache;
    t.map.seen.fill(0);
    const world = new World('town', { map: t.map, tileset, biome: TOWN_BIOME, depth: 0, townTiles, buildings: t.buildings, props: t.props, wallHangings: t.wallHangings });
    world.raining = G.room ? ((G.room.seed % 4) === 0) : rollTownWeather();
    world.npcs = t.npcs.map((n) => ({ vendor: n.vendor, x: n.x, y: n.y, reach: 1.8, flip: n.flip, use: () => Vendor.open(n.vendor.id) }));
    // the storage chest, beside the well
    {
      let [x, y] = [t.start[0] + 1.5, t.start[1] - 0.5];
      if (!t.map.walkable(x, y)) [x, y] = t.map.randomNear(t.start[0], t.start[1], 2.5);
      world.npcs.push({ stash: true, name: 'Storage Chest', x, y, reach: 1.6, flip: false, use: () => Stash.open() });
      // the Reliquary, the vault every hero shares (ui/reliquary.js), on the well's other side
      let [rx, ry] = [t.start[0] - 1.5, t.start[1] - 0.5];
      if (!t.map.walkable(rx, ry) || Math.hypot(rx - x, ry - y) < 1.5) [rx, ry] = t.map.randomNear(t.start[0] - 1, t.start[1], 2.5);
      world.npcs.push({ stash: true, reliquary: true, name: 'The Reliquary', x: rx, y: ry, reach: 1.6, flip: false, use: () => G.ui.reliquary.open() });
    }
    // the Altar of Heresy (ui/heresies.js), a dark obelisk at the plaza's edge: the Endgame's door (docs/ENDGAME.md)
    if (t.altar) world.npcs.push({ altar: true, name: 'Altar of Heresy', x: t.altar.x, y: t.altar.y, reach: 1.7, flip: false, use: () => Heresies.open() });
    const visitSeed = G.room ? (G.room.seed >>> 0) : ((c.townVisitCount = (c.townVisitCount || 0) + 1));
    offerCommissions(c); // Town Commissions (game/commissions.js)
    // the townsfolk, visiting adventurers, little set pieces and (about one visit in four) a special event
    const life = startTownLife(world, t, c, visitSeed);
    void preloadTownSheets(life.agents.map((a) => a.townsfolkSpriteId));
    world.portals = [{
      x: t.portal.x, y: t.portal.y, active: true, color: '#ff5020', reach: 2.2,
      get label() {
        const d = (G.room && G.room.depth != null) ? G.room.depth : G.char.depth;
        return `Portal — Depth ${d || 1}`;
      },
      use: () => this.confirmDungeon(),
    }];
    // THE ETERNAL BREACH's purple portal (game.confirmBreach, docs/ETERNAL_BREACH.md)
    if (t.breach) world.portals.push({ x: t.breach.x, y: t.breach.y, active: true, breach: true, color: '#a040ff', reach: 2.2, label: 'THE ETERNAL BREACH', use: () => this.confirmBreach() });
    // the Abyssal Rift gate (game.confirmRift): lit once the Endgame is open
    // the Riftgate to VELSCOUR DEFENSE (defense/: its own page and save), across the square from the dungeon portal
    const rg = t.riftgate || (t.riftgate = riftgateSpot(t));
    if (rg) world.portals.push({ x: rg.x, y: rg.y, active: true, color: '#3a6cff', reach: 1.7, riftgate: true, label: 'The Riftgate: VELSCOUR DEFENSE', use: () => this.confirmRiftgate() });
    if (t.rift) world.portals.push({ x: t.rift.x, y: t.rift.y, rift: true, color: '#20e0ff', reach: 1.7, get active() { return endgameUnlocked(); }, set active(v) {}, get label() { return endgameUnlocked() ? `Abyssal Rift — Tier ${riftOpen()}` : 'Abyssal Rift (sealed)'; }, use: () => this.confirmRift() });
    // the hero steps out of the portal, a little way down its road toward the square
    const P = t.portal, C = t.center, l = Math.hypot(C.x - P.x, C.y - P.y) || 1;
    let arrive = [P.x + ((C.x - P.x) / l) * 3.2, P.y + ((C.y - P.y) / l) * 3.2];
    // roads bend, so the straight line can end on the grass beside it: take the nearest paved tile (floor variant
    // 1..125; 0 is grass) 2 to 4.6 tiles from the portal
    const m = t.map;
    let best = null, bd = 9;
    for (let ty = Math.floor(arrive[1]) - 3; ty <= Math.floor(arrive[1]) + 3; ty++) for (let tx = Math.floor(arrive[0]) - 3; tx <= Math.floor(arrive[0]) + 3; tx++) {
      if (!m.walkableTile(tx, ty)) continue;
      const v = m.v[ty * m.w + tx], d = Math.hypot(tx + 0.5 - arrive[0], ty + 0.5 - arrive[1]);
      const fromPortal = Math.hypot(tx + 0.5 - P.x, ty + 0.5 - P.y);
      if (v > 0 && v < 126 && d < bd && fromPortal >= 2 && fromPortal <= 4.6) { bd = d; best = [tx + 0.5, ty + 0.5]; }
    }
    if (best) arrive = best;
    else if (!m.walkable(...arrive)) arrive = m.randomNear(arrive[0], arrive[1], 1.5) || t.start;
    this.setWorld(world, arrive, old);
    void warmLevelArt(world); // the hero's summons; trims the last level's monster sprites
    HUD.setArea('Herrington Hollow', 'Town — a safe haven');
    playMusic('town'); setAmbience('town');
    Vendor.restock();
    const p = G.player;
    townHappening(world); // a festival, a blessing, a gift (game/happenings.js)
    p.hp = p.maxHp; p.mana = p.maxMana;
    this.autosave();
  },

  confirmRiftgate() {
    UI.dialog({
      title: 'The Riftgate',
      html: `<p>A blue-black wound in the air, far older and stranger than the dungeon portal. Beyond it Velscour's horde marches on the Bastion, and sixteen heroes wait for a Commander.</p><p class="dim">VELSCOUR DEFENSE is a separate game with its own cards and save; your hero here is not touched. A way back waits on the other side.</p>`,
      buttons: [{ label: 'Not yet' }, { label: 'Step through', cls: 'red', fn: () => { this.autosave(); location.href = 'defense/index.html'; } }],
    });
  },

  getPlayersAwayFromPortal(portal) {
    if (!G.room || !net.connected) return [];
    if (!portal) return [];
    const maxDist = Math.max(portal.reach || 2.2, 3.0);
    const px = portal.x, py = portal.y;
    const away = [];

    // Check local player
    if (G.player && dist(G.player.x, G.player.y, px, py) > maxDist) {
      away.push(G.char?.name || G.player.name || 'You');
    }

    // Check room roster
    const checked = new Set();
    const roomPlayers = net.currentRoom?.players || G.room?.players || [];
    for (const p of roomPlayers) {
      if (p.id === net.myId) continue;
      checked.add(p.id);
      const rp = G.remotePlayers?.get(p.id);
      if (!rp) {
        away.push(p.name || 'Party Member');
      } else if (dist(rp.x, rp.y, px, py) > maxDist) {
        away.push(rp.name || p.name || 'Party Member');
      }
    }

    // Check active remote players in G.remotePlayers
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        if (checked.has(id)) continue;
        if (dist(rp.x, rp.y, px, py) > maxDist) {
          away.push(rp.name || 'Party Member');
        }
      }
    }

    return [...new Set(away)];
  },

  getSharedRoomBiome(room, depth, fallbackBiomeId = null) {
    if (depth === FINAL_DEPTH) return BIOME_BY_ID.throne;
    if (room && room.biome && room.biome !== 'town' && BIOME_BY_ID[room.biome]) {
      return BIOME_BY_ID[room.biome];
    }
    if (fallbackBiomeId && BIOME_BY_ID[fallbackBiomeId]) {
      return BIOME_BY_ID[fallbackBiomeId];
    }
    if (room) {
      const pool = BIOMES.filter((b) => !b.overworld && !b.beta && b.id !== 'throne');
      const s = room.seed || room.townSeed || 1;
      const idx = Math.abs(((s * 31 + depth * 7919) ^ 0x5bd1e995) | 0);
      return pool[idx % pool.length] || BIOME_BY_ID.catacombs;
    }
    return BIOME_BY_ID[fallbackBiomeId] || BIOME_BY_ID.catacombs;
  },

  getSharedRoomDungeonSeed(room, depth) {
    if (room && room.dungeonSeed && room.depth === depth) {
      return room.dungeonSeed;
    }
    const s = room?.seed || room?.townSeed || 1;
    return (((s * 31 + depth * 7919) ^ 0x41c64e6d) >>> 0) || 1234567;
  },

  confirmDungeon() {
    const portal = G.world?.portals?.find((p) => !p.breach) || G.world?.portals?.[0];
    const c = G.char;
    const depth = (G.room && G.room.depth != null) ? G.room.depth : c.depth;
    const biome = this.getSharedRoomBiome(G.room, depth, c.nextBiome);
    UI.dialog({
      title: `Depth ${depth}`,
      html: `<p>The portal hums. Beyond lies <b style="color:#ffb070">${escapeHtml(biome.name)}</b>.</p><p class="dim">${biome.id === 'sea_of_sand' ? 'Follow the cliff maze and clear every marked scenario area to open the exit.' : biome.id === 'mountainside' ? 'Climb the switchback trail to the summit and defeat its Warden. Ledges a hop high can be climbed; taller cliffs cannot.' : biome.id === 'skyship' ? "Step out onto the heroes' airship. Hold the deck against the Air Pirates' boarding waves, their captains and their flagship; victory turns the gate into the exit." : biome.id === 'dark_forest' ? 'Find your way through the woods and labyrinths to the Heart of the Forest. Its trial opens the way on; the glades along the trails hold trials of their own, and their rewards.' : biome.tower ? 'Climb the spiral stair to the roof. Three waves of bosses hold it, and then their master comes on an airship.' : biome.cave ? 'Follow the passages and caverns to the underground lake. At the foot of its waterfall a passage climbs a long, spiralling shaft to the top of the falls, where its masters wait.' : biome.overworld ? 'Activate the scenario shrine and complete its trial to open the exit.' : 'Find the exit. It is sealed until its guardian is slain.'}${c.depth === FINAL_DEPTH ? '<br><b style="color:#ff4020">Demon Lord Velscour awaits.</b>' : !biome.overworld && isRaidDepth(c.depth) ? '<br><b style="color:#ff6030">A BOSS ROOM lies at the end of this depth.</b>' : ''}</p>`,
      buttons: [
        { label: 'Not yet' },
        { label: 'Enter', cls: 'red', fn: () => {
          this.enterDungeon();
        } },
      ],
    });
  },

  openVelscourContact() {
    const taunt = VELSCOUR_TAUNTS[(Math.random() * VELSCOUR_TAUNTS.length) | 0];
    const dialog = UI.dialog({
      title: 'WHY ARE YOU TRYING TO CONTACT VELSCOUR',
      cls: 'velscour-contact-dialog',
      html: `<p class="velscour-taunt">${escapeHtml(taunt)}</p><label class="velscour-message-label" for="velscour-message">Send a message into the abyss</label><div class="velscour-message-row"><input id="velscour-message" class="name-input" type="text" maxlength="50" autocomplete="off" placeholder="50 characters, tops"><span id="velscour-message-count">0 / 50</span></div>`,
      buttons: [
        { label: 'Close' },
        { label: 'Send', cls: 'red', keepOpen: true, fn: (close) => {
          const message = document.getElementById('velscour-message')?.value || '';
          if (['HAIL VELSCOUR!', '13', '65', '69', '666', '6669'].includes(message)) {
            close();
            this.openVelscourTeleport();
          } else if (message === DEATH_PHRASE) { // exact, case sensitive
            close();
            if (Auto.on) Auto.toggle(false);
            grantDeathGift();
            if (G.world?.kind !== 'town') this.enterTown(); // the town portal now opens on Depth 500
            else this.autosave();
          } else if (message.trim().toLowerCase() === 'mountain') {
            close();
            this.teleportToBiome(BIOME_BY_ID.mountainside); // the Mountainside beta
          } else if (/^(sky|airship|air|pirates?)(\s|$)/i.test(message.trim())) {
            // the Sky Battle; 'sky storm', 'sky night'... picks its scenario
            const want = message.trim().toLowerCase().split(/\s+/)[1];
            G.char.skyVariant = SKY_ALL.find((v) => v.id === want || v.weather.toLowerCase().includes(want || '#') || v.name.toLowerCase().includes(want || '#'))?.id;
            close();
            this.teleportToBiome(BIOME_BY_ID.skyship);
          } else if (['final boss', 'finalboss', 'velscour'].includes(message.trim().toLowerCase())) {
            close();
            this.finalBoss(); // straight into Velscour's arena, scaled to this depth
          } else if (['unbound', 'velscour unbound'].includes(message.trim().toLowerCase())) {
            close();
            this.enterUnbound(); // the rematch, for three Abyssal Keys (docs/ENDGAME.md)
          } else if (['heresy', 'heresies', 'altar'].includes(message.trim().toLowerCase())) { close(); Heresies.open(); }
          else if (['marks', 'infernal marks'].includes(message.trim().toLowerCase())) { close(); Marks.open(); }
          else if (['rift', 'rifts', 'abyssal rift'].includes(message.trim().toLowerCase())) { close(); this.confirmRift(); }
          else if (message.trim().toLowerCase() === 'tower') {
            close();
            this.teleportToBiome(BIOME_BY_ID.serpentine_tower);
          } else if (['caverns', 'caves', 'cave', 'depths edge', "depth's edge"].includes(message.trim().toLowerCase())) {
            close();
            this.teleportToBiome(BIOME_BY_ID.depths_edge);
          } else if (['pyramid', 'pyramids', 'dunes', 'tomb'].includes(message.trim().toLowerCase())) {
            close();
            G.sandVariant = 1 + Math.floor(Math.random() * DUNE_VARIANTS.length);   // one of the dune variants, not the flat maze
            this.teleportToBiome(BIOME_BY_ID.sea_of_sand).finally(() => { G.sandVariant = undefined; });
          }
        } },
      ],
    });
    const inputEl = dialog.box.querySelector('#velscour-message');
    const countEl = dialog.box.querySelector('#velscour-message-count');
    inputEl.addEventListener('input', () => { countEl.textContent = `${inputEl.value.length} / 50`; });
  },

  openVelscourTeleport() {
    const options = [...BETA_BIOMES, ...BIOMES].map((biome) => `<option value="${escapeHtml(biome.id)}">${escapeHtml(biome.name)}${biome.overworld ? ' · Overworld' : ''}${biome.beta ? ' (Beta)' : ''}</option>`).join('')
      + SKY_ALL.map((v) => `<option value="skyship:${v.id}">${escapeHtml(BIOME_BY_ID.skyship.name)}: ${escapeHtml(v.name)} (${escapeHtml(v.weather)})</option>`).join('');
    const dialog = UI.dialog({
      title: 'CHOOSE YOUR DOOM',
      cls: 'velscour-teleport-dialog',
      html: `<p>Select a biome. Your current depth will be reforged with a fresh path.</p><label class="velscour-message-label" for="velscour-biome">Destination biome</label><select id="velscour-biome" class="velscour-biome-select">${options}</select>`,
      buttons: [
        { label: 'Cancel' },
        { label: 'Teleport', cls: 'red', fn: () => {
          let id = dialog.box.querySelector('#velscour-biome').value;
          if (id.startsWith('skyship:')) { G.char.skyVariant = id.slice(8); id = 'skyship'; }
          const biome = BIOME_BY_ID[id];
          if (biome) this.teleportToBiome(biome);
        } },
      ],
    });
  },

  /** The skull's "final boss": Velscour's throne at the hero's depth, the hero set down inside his arena. */
  async finalBoss() {
    await this.teleportToBiome(BIOME_BY_ID.throne);
    const w = G.world, p = G.player;
    if (!w || !w.velscour || !p) return;
    const [x, y] = w.map.nudge(22.5, 26.5, 0.4);
    p.x = x; p.y = y; p.path = null; p.moveTarget = null; p.attackTarget = null;
    for (const s of w.creatures) if (s.team === 'player' && s !== p) [s.x, s.y] = w.map.randomNear(x, y, 1.5);
    w.map.reveal(x, y, 30);
    camera.follow(x, y, 0, true);
    UI.log(`<b style="color:#ff4020">Velscour answers.</b> ${w.practice ? `This is a practice fight at Depth ${w.depth}: no victory, no relic hoard, but every phase of the real one.` : 'This is the real thing.'}`, '#ffb0a0');
  },

  async teleportToBiome(biome) {
    const c = G.char;
    if (!c || !biome) return;
    if (Auto.on) Auto.toggle(false);
    const depth = Math.max(1, G.world?.kind === 'dungeon' ? G.world.depth : c.depth || 1);
    c.depth = depth;
    c.nextBiome = biome.id;
    delete c.nextOmen;
    if (biome.id === 'sea_of_sand') {
      c.seaOfSandRuns ||= {};
      delete c.seaOfSandRuns[depth];
    }
    if (biome.id === 'dark_forest' && c.darkForestRuns) delete c.darkForestRuns[depth];
    const loading = document.getElementById('loading');
    document.getElementById('loading-text').textContent = `Answering Velscour — Depth ${depth} · ${biome.name}…`;
    loading.classList.remove('hidden');
    try {
      const mix = mixPartner(biome);
      await this.loadLevelArt(biome, mix);
      this.buildDungeon(depth, biome, mix);
      const w = G.world;
      await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : [])], true).catch((e) => console.warn(e));
      await warmLevelArt(w);
      releaseLevelArt(biome);
    } catch (e) {
      console.warn(e);
      UI.log('The abyss rejected that destination. Try the skull again.', '#ff8060');
    } finally {
      loading.classList.add('hidden');
      this.autosave();
    }
  },

  /** Pre-build the current level's monster sprites (what the loading screen does after buildDungeon; for tests). */
  warmArt() { return warmLevelArt(G.world); },

  // the art a level of this biome needs before it can be generated (the portal and Velscour's level select share it)
  loadLevelArt(biome, mix = null) {
    if (biome.id === 'sea_of_sand') { // the flat cliff maze (0) or one of the ten dune variants with their pyramids (src/data/dunes.js), never the one seen last
      if (G.room) {
        const s = G.room.dungeonSeed || G.room.seed || 1;
        G.sandNext = Math.abs(s) % (DUNE_VARIANTS.length + 1);
      } else {
        const c = G.char, kept = c?.seaOfSandRuns?.[c.depth], n = DUNE_VARIANTS.length + 1, last = c?.lastSand ?? -1;
        const k = Math.floor(Math.random() * (n - (last >= 0 ? 1 : 0)));
        G.sandNext = G.sandVariant ?? (kept ? kept.dunes || 0 : last >= 0 && k >= last ? k + 1 : k);
      }
      if (G.sandNext > 0) return loadDunes3D().catch((e) => { console.warn(e); G.sandNext = 0; return loadSeaOfSandPack(); });
      return loadSeaOfSandPack();
    }
    if (biome.id === 'castle') { // one of the castles (src/data/castles.js), never the one seen last; the first if its bake won't load
      if (G.room) {
        const s = G.room.dungeonSeed || G.room.seed || 1;
        G.castleNext = Math.abs(s) % CASTLE_VARIANTS.length;
      } else {
        const last = CASTLE_VARIANTS.findIndex((v) => v.id === G.char?.lastCastle), k = Math.floor(Math.random() * (CASTLE_VARIANTS.length - (last >= 0 ? 1 : 0)));
        G.castleNext = G.castleVariant ?? (last >= 0 && k >= last ? k + 1 : k);
      }
      return Promise.all([loadCastlePack(), loadCastle3D(G.castleNext).catch((e) => { console.warn(e); G.castleNext = 0; return loadCastle3D(0); }), loadDarkForestTrees()]);
    }
    if (biome.id === 'dark_forest') return Promise.all([loadBiomeArt(biome), loadDarkForestTrees()]);
    if (biome.challenge) return loadBiomeArt(biome); // the Breach's two packs (pack, wallPack, moreFloors/morePacks)
    if (biome.id === 'mountainside') return Promise.all([loadBiomeArt(BIOME_BY_ID.dark_forest), loadDarkForestTrees()]); // its floors, props and pines
    if (biome.id === 'skyship') return Promise.all([loadBaked('assets/tiles/skyship/'), preloadTownSheets(TOWNSFOLK_KNIGHTS)]); // the baked ironclad, boats and galleon; the sky-knights
    if (biome.tower) return loadTower3D(); // three.js and the tower's textures
    if (biome.cave) {
      G.caveNext = G.room ? (Math.abs(G.room.dungeonSeed || G.room.seed || 1) % CAVE_VARIANTS.length) : (G.caveVariant ?? Math.floor(Math.random() * CAVE_VARIANTS.length));
      return loadCave3D(G.caveNext);
    } // three.js and this cave's textures
    if (biome.id === 'throne') return Promise.all([loadBiomeArt(biome), loadVelscourThrone()]); // his recoloured throne
    if (!biome.overworld) return Promise.all([loadBiomeArt(biome), mix && loadBiomeArt(mix)]);
    return Promise.resolve();
  },

  enterDungeon(fromNetwork = false) {
    if (this._enteringDungeon) return;
    this._enteringDungeon = true;
    const c = G.char;
    const depth = (G.room && G.room.depth != null) ? G.room.depth : c.depth;
    c.depth = depth;
    if (depth !== FINAL_DEPTH && (!c.nextBiome || c.nextBiome === 'throne')) c.nextBiome = drawBiome(c, depth);
    const biome = this.getSharedRoomBiome(G.room, depth, c.nextBiome);
    let dungeonSeed = G.room ? this.getSharedRoomDungeonSeed(G.room, depth) : (Math.floor(Math.random() * 1e9) + 1);
    if (G.room) {
      const isNew = (!G.room.dungeonSeed || G.room.depth !== depth || G.room.biome !== biome.id);
      G.room.dungeonSeed = dungeonSeed;
      G.room.depth = depth;
      G.room.biome = biome.id;
      // If room heresies haven't been established for this depth, adopt the portal activator's heresies
      if (!G.room.heresies || isNew) {
        G.room.heresies = heresiesOf(c);
      }
      const mix = G.room.mixId ? BIOME_BY_ID[G.room.mixId] : (dungeonSeed ? mixPartner(biome, () => new RNG(dungeonSeed ^ 0x3d17a892).next()) : null);
      G.room.mixId = mix ? mix.id : null;
      if (net.connected && !fromNetwork) {
        net.sendRoomDepthUpdate(depth, biome.id, dungeonSeed, G.room.mixId, G.room.heresies);
      }
    }
    const mix = G.room ? (G.room.mixId ? BIOME_BY_ID[G.room.mixId] : (dungeonSeed ? mixPartner(biome, () => new RNG(dungeonSeed ^ 0x3d17a892).next()) : null)) : mixPartner(biome);
    const loading = document.getElementById('loading');
    document.getElementById('loading-text').textContent = `Descending to Depth ${depth} — ${biome.name}…`;
    loading.classList.remove('hidden');
    sfx('portal');
    // fetch this biome's art first (about 1 MB); if that fails the default set stands in
    setTimeout(async () => {
      try { await this.loadLevelArt(biome, mix); } catch (e) { console.warn(e); }
      try {
        if (G.room && net.connected) {
          net.requestDungeonState(depth);
        }
        this.buildDungeon(depth, biome, mix);
        // the level's monster art (set 2 sheets load per level); a failed sheet falls back to pixel sprites
        const w = G.world;
        await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : [])], true).catch((e) => console.warn(e));
        await warmLevelArt(w);
        releaseLevelArt(biome);
      } finally {
        loading.classList.add('hidden');
        this._enteringDungeon = false;
      }
    }, 40);
  },

  buildDungeon(depth, biome, mix = null) {
    const c = G.char || (G.char = newCharData('barbarian', 'Hero'));
    c.depth = depth;
    if (G.room) G.room.depth = depth;
    if (biome.tower && !tower3dReady()) { UI.log('Clouds hide the Serpentine Tower today (three.js could not be loaded).', '#a0a0a0'); biome = BIOME_BY_ID.overworld; }
    if (biome.cave && !cave3dReady()) { UI.log("A rockfall seals the Depth's Edge Caverns today (three.js could not be loaded).", '#a0a0a0'); biome = BIOME_BY_ID.overworld; }
    const old = G.world;
    const forest = biome.id === 'dark_forest';
    c.seaOfSandRuns ||= {}; c.darkForestRuns ||= {};
    // the two overworlds that save their progress per depth rebuild the same map after a town trip
    const kept = biome.id === 'sea_of_sand' ? c.seaOfSandRuns[depth] : forest ? c.darkForestRuns[depth] : null;
    const seed = (G.room && G.room.dungeonSeed) ? G.room.dungeonSeed : (kept ? kept.seed : (G.room?.seed ? (G.room.seed + depth * 7919) | 0 : (Math.random() * 1e9) | 0));
    const tileset = forest ? biomeTileSet(biome) : biome.overworld ? biomeTileSet(TOWN_BIOME) : mix ? mixedTileSet(biome, mix, G.room ? ((seed % 2) === 0) : Math.random() < 0.5) : biomeTileSet(biome);
    keepTileSets(tileset);
    const sky = biome.id === 'skyship';
    const towerVar = G.room ? (seed % 3) : G.towerVariant;
    const caveVar = G.room ? (seed % CAVE_VARIANTS.length) : (G.caveVariant ?? G.caveNext);
    const sandVar = G.room ? (Math.abs(seed) % (DUNE_VARIANTS.length + 1)) : (G.sandVariant ?? G.sandNext);
    const castleVar = G.room ? (Math.abs(seed) % CASTLE_VARIANTS.length) : (G.castleVariant ?? G.castleNext);
    const gen = forest ? generateDarkForest(depth, biome, tileset, seed) : biome.id === 'mountainside' ? generateMountain(depth, biome, seed)
      : sky ? generateSkyship(depth, biome, seed, castle3dState())
      : biome.tower ? generateTower(depth, biome, seed, towerVar)
      : biome.cave ? generateCaverns(depth, biome, seed, caveVar)
      : biome.id === 'sea_of_sand' && sandVar > 0 && dunes3dReady() ? generateDunes(depth, biome, seed, sandVar - 1)
      : biome.overworld ? generateOverworld(depth, biome, seed, biome.id === 'castle' ? castleVar : null) : generateDungeon(depth, biome, tileset, seed);
    if (biome.id === 'sea_of_sand') { c.lastSand = gen.dunes ? 1 + DUNE_VARIANTS.indexOf(gen.variant) : 0; if (gen.dunes) c.seaOfSandRuns[depth] = { seed, dunes: c.lastSand }; }
    const world = new World('dungeon', { map: gen.map, tileset, biome, depth, props: gen.props, torches: gen.torches, wallHangings: gen.wallHangings, looks: gen.looks, townTiles: gen.townTiles || null, buildings: gen.buildings || [] });
    world._generatingDungeon = true;
    if (gen.layoutId) { world.layoutId = gen.layoutId; world.layoutName = gen.layoutName; }
    world.rooms = gen.rooms || [];
    world.chests = gen.chests.map((ch) => ({
      ...ch, opened: false, reach: 1.3,
      use() {
        if (this.opened) return;
        this.opened = true;
        sfx('chest'); sfx('gold');
        dropChest(world, this, depth);
        sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5);
      },
    }));
    const [sx, sy] = gen.start;
    let tp = gen.townPortal || [sx + 1.6, sy - 0.6];
    if (!gen.map.walkable(tp[0], tp[1])) tp = gen.map.randomNear(sx, sy, 2);
    const isAlreadyUnsealed = (G.room && G.room.unsealedDepths && G.room.unsealedDepths.has(depth)) ||
      (G.room && G.room.killedMonsters && (
        (world.boss?.netId && G.room.killedMonsters.get(depth)?.has(world.boss.netId)) ||
        (world.boss?.idx != null && G.room.killedMonsters.get(depth)?.has(world.boss.idx))
      ));
    const exit = {
      x: gen.exit[0], y: gen.exit[1], type: 'exit',
      active: !!isAlreadyUnsealed,
      color: isAlreadyUnsealed ? '#40a0ff' : '#5a5a60',
      reach: 1.6,
      label: isAlreadyUnsealed ? (world.unbound ? 'Exit — to town' : 'Exit — continue') : 'Sealed Exit',
      skygate: sky,
      use: () => this.useExit(world, exit),
    };
    world.portals = [
      { x: tp[0], y: tp[1], type: 'town', active: true, color: '#3a8aff', reach: 1.6, label: 'Town Portal', use: () => this.useTownPortal() },
      exit,
    ];
    // monsters
    const lvl = depthLevel(depth);
    world.unbound = biome.id === 'throne' && !!G.unboundNext; G.unboundNext = false; // Velscour Unbound (game/unbound.js)
    world.practice = biome.id === 'throne' && depth !== FINAL_DEPTH && !world.unbound; // "final boss" from the skull: Velscour at this depth
    const heresies = G.room ? (G.room.heresies || []) : heresyBegin(world, c);
    if (G.room) {
      world.heresy = { ids: heresies, rank: heresyRank(heresies) };
    }
    const monRng = G.room ? new RNG(seed ^ 0x5bf03641) : null;
    const rndVal = () => (monRng ? monRng.next() : Math.random());
    let monsterSeq = 1;
    const rawSpawns = heresySpawns(greedPacks(gen.spawns, G.room ? 0 : greedOf(c)), heresies);
    for (let si = 0; si < rawSpawns.length; si++) {
      const s = rawSpawns[si];
      if (s.rank === 'raid') {
        const m = makeRaidBoss(world, gen.raid, depth, lvl + 3, { rnd: rndVal });
        m.netId = `raid_${si}`;
        m.idx = monsterSeq++;
        world.add(m);
        world.boss = m;
        world.raid = m.raid;
        continue;
      }
      if (s.rank === 'boss') {
        const m = makeMonster(world, s.arch, biome, lvl + 2, 'boss', s.x, s.y, 0, s.look, rndVal);
        m.netId = `boss_${si}`;
        m.idx = monsterSeq++;
        world.add(m);
        world.boss = m;
        if (m.isVelscour) setupVelscour(world, m, gen); // his five-phase last stand (game/velscour.js)
        continue;
      }
      const n = s.n;
      const variant = rndVal() < Math.min(0.5, 0.2 + depth * 0.005) ? 1 : 0;
      const trait = rollTrait(world, depth, false, rndVal) || (s.trait ? rollTrait(world, depth, true, rndVal) : null);
      for (let i = 0; i < n; i++) {
        const [x, y] = i === 0 ? [s.x, s.y] : gen.map.randomNear(s.x, s.y, 1.6, rndVal);
        const rank = s.rank === 'unique' ? (i === 0 ? 'unique' : 'normal') : s.rank;
        const m = makeMonster(world, s.arch, biome, lvl + (rank === 'normal' ? 0 : 1), rank, x, y, variant, s.look, rndVal);
        m.netId = `m_${si}_${i}`;
        m.idx = monsterSeq++;
        if (s.rank === 'unique' && i > 0) { m.affixes = []; m.name = m.name + ' Minion'; }
        // tanks and bullet-hell casters lead their pack; hunters, phasers and burrowers come as a pack
        if (trait && (i === 0 || ['hunter', 'phaser', 'burrower'].includes(trait))) applyTrait(m, trait);
        if (s.champ && i === 0) makeElite(m, 'champion', depth, world, rndVal);
        world.add(m);
      }
    }
    if (G.room && G.room.killedMonsters) {
      const killed = G.room.killedMonsters.get(depth);
      if (killed && killed.size > 0) {
        if (!world.killedMonsterIds) world.killedMonsterIds = new Set();
        for (const id of killed) world.killedMonsterIds.add(id);
        world.creatures = world.creatures.filter(c => {
          if (c.team !== 'enemy') return true;
          if (c.netId && killed.has(c.netId)) return false;
          if (c.idx != null && killed.has(c.idx)) return false;
          return true;
        });
      }
    }
    if (world.boss && (
      (world.boss.netId && (G.room?.killedMonsters?.get(depth)?.has(world.boss.netId) || world.killedMonsterIds?.has(world.boss.netId))) ||
      (world.boss.idx != null && (G.room?.killedMonsters?.get(depth)?.has(world.boss.idx) || world.killedMonsterIds?.has(world.boss.idx))) ||
      (G.room?.unsealedDepths && G.room.unsealedDepths.has(depth))
    )) {
      if (!exit.active) {
        exit.active = true;
        exit.color = '#40a0ff';
        exit.label = world.unbound ? 'Exit — to town' : 'Exit — continue';
      }
    }
    world.roster = [...new Set(gen.spawns.filter((s) => s.arch && !['raid', 'boss'].includes(s.rank)).map((s) => s.arch))];
    if (!sky && biome.id !== 'throne') setupHappenings(world, gen.start, gen); // omens, shrines, treasure imps, cursed chests (game/happenings.js)
    setupCommissions(world, gen.start); // this depth's Town Commission objectives (game/commissions.js)
    greedWorld(world, c); // the Greed lever and its Hoard multiply the omen's loot dials
    heresyWorld(world, c); // the Heresies' rank pays on top (none in Unbound)
    tickBlessing(c);
    world._generatingDungeon = false;
    world.onBossAwake = (m) => {
      UI.centerMsg(m.name, m.isVelscour ? 'The Demon Lord rises' : m.raid ? `${m.title}${m.raid.mods.length ? ' · ' + m.raid.modText() : ''}` : 'Guardian of the Exit', 3);
      sfx('boss');
    };
    world.onBossKilled = (m) => {
      if (biome.overworld) return;
      if (m.raid && m.raid.court) return; // one of Velscour Unbound's court: not the fight's end
      if (G.room) {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(depth);
        if (net.connected) {
          net.sendFloorUnsealed(depth, m.netId || m.idx, m.name);
        }
      }
      this.unsealDungeonExit(world, m.name, m.isVelscour, !!m.raid);
    };
    if (sky) {   // the Sky Battle (game/skybattle.js): one of eight weathers or thirty stories, never the last one twice
      world.overworldScenario = createSkyBattle(world, gen, biome, depth, { variant: c.skyVariant, last: c.lastSkyVariant, seen: c.skySeen || {} }, () => {
        exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
        const first = !c.cleared[depth];
        c.cleared[depth] = true;
        c.deepest = Math.max(c.deepest || 0, depth);
        this.brokeThrough(depth);
        if (first) { c.skillPoints++; UI.log('Bonus skill point for winning the Sky Battle!', '#ffd860'); }
        sfx('gate'); UI.refresh(); this.autosave();
      });
      c.lastSkyVariant = world.sky.v.id; delete c.skyVariant;
    } else if (gen.dunes) createDuneRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) { c.skillPoints++; UI.log(`Bonus skill point for winning ${gen.variant.pyramid.name}!`, '#ffd860'); }
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.id === 'sea_of_sand') world.overworldScenario = createSeaOfSandScenario(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) { c.skillPoints++; UI.log('Bonus skill point for completing the Sea of Sand route!', '#ffd860'); }
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (forest) world.overworldScenario = createDarkForestRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      greedCleared(world, c);
      if (first) { c.skillPoints++; UI.log('Bonus skill point for stilling the Heart of the Forest!', '#ffd860'); }
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.id === 'mountainside') world.overworldScenario = createMountainRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) { c.skillPoints++; UI.log('Bonus skill point for taking the summit!', '#ffd860'); }
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.tower) createTowerRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) { c.skillPoints++; UI.log('Bonus skill point for taking the tower!', '#ffd860'); }
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.cave) createCaveRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) { c.skillPoints++; UI.log('Bonus skill point for taking the top of the falls!', '#ffd860'); }
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.overworld) world.overworldScenario = createOverworldScenario(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) { c.skillPoints++; UI.log('Bonus skill point for completing the overworld scenario!', '#ffd860'); }
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    this.setWorld(world, gen.start, old);
    announceHappenings(world);
    if (biome.id === 'castle') { addCastleStory(world, gen); world.ambientFx = gen.variant?.look?.ambient || null; c.lastCastle = gen.variant?.id; }
    if (biome.overworld && !sky && !biome.cave && !gen.dunes) {
      // townsfolk on the road: reachable landmarks to walk between (game/wanderers.js)
      const spots = [], map = gen.map;
      for (let i = 0; i < 60 && spots.length < 9; i++) {
        const x = 3 + Math.random() * (map.w - 6), y = 3 + Math.random() * (map.h - 6);
        if (map.walkable(x, y) && map.findPath(gen.start[0], gen.start[1], x, y, 9000)) spots.push([x, y]);
      }
      if (spots.length >= 2 && !biome.beta && !biome.tower) addWanderers(world, spots, biome.id === 'castle' ? 6 : forest ? 4 : 5);
      const look = gen.variant?.look || {};   // a castle variant has its own odds of rain and of night
      world.raining = biome.id !== 'sea_of_sand' && !biome.tower && Math.random() < (look.rain ?? 0.3); // a wet day in the Wilds or on the walls
      if (!biome.tower && Math.random() < (look.night ?? 0.25)) { world.darkK = biome.id === 'sea_of_sand' ? 0.45 : 0.6; world.night = true; } // nightfall: torches, spells and portals glow
    }
    if (!biome.beta) recordBiomeVisit(c, biome, depth); // a beta biome leaves the overworld guarantee alone
    c.lastBiome = biome.id;
    HUD.setArea(world.unbound ? 'Velscour Unbound' : `Depth ${depth}${depth > FINAL_DEPTH ? ' — Endless Torment' : ''}`, (biome.overworld ? `${gen.variant ? gen.variant.name : biome.name} · ${world.overworldScenario.title}` : gen.raid ? `${biome.name} · Boss Room` : biome.name) + (worldRank(world) ? ` · Heresy ${worldRank(world)}` : ''));
    playMusic('wilds', { delay: 4 + Math.random() * 20 }); setAmbience(sky ? world.sky.v.amb : biome.id);
    const kin = tileset.mixed && BIOME_BY_ID[tileset.mixed];
    if (!sky) UI.centerMsg((gen.variant ? gen.variant.name : biome.name).toUpperCase(), `Depth ${depth}${kin ? ` · bleeding into the ${kin.name}` : ''}`, 2.4);
    if (world.night) UI.log(world.raining ? 'Night has fallen, and the rain with it.' : 'Night has fallen over the land.', '#a0b0d0');
    if (gen.dunes) UI.log(`${gen.variant.name}: ${gen.variant.intro} ${gen.dunes.camps.length} waystones stand between you and its door.`, '#ffe2a0');
    else if (biome.id === 'sea_of_sand') UI.log(`Secure ${gen.scenarioCount} marked scenario area${gen.scenarioCount===1?'':'s'} to open the exit. Rewards improve with each clear.`, '#ffe2a0');
    else if (biome.id === 'mountainside') UI.log('The trail switchbacks up the cliffs to the summit. A ledge a hop high can be climbed; taller cliffs only jumped down.', '#ffe2a0');
    else if (sky) UI.log(`${world.sky.v.name}: ${world.sky.v.story ? world.sky.v.blurb + ' Hold the deck.' : 'hold the deck against the Air Pirates\' boarding waves.'} ${world.sky.v.hazardText || ''}`, '#ffe2a0');
    else if (biome.tower) UI.log(`${gen.variant.name}: ${gen.variant.epithet}. Climb the stair; things wait on the floors above, and some will not wait.`, '#ffe2a0');
    else if (biome.cave) UI.log(`${gen.variant.name}: ${gen.variant.epithet}. The passages lead down to a lake under a great waterfall; the way on is a long climb to its top.`, '#ffe2a0');
    else if (forest) UI.log(`The Dark Forest closes in. The Heart lies deep in the north-east labyrinth; ${gen.glades.length} glades hold trials and treasure along the way.`, '#c8f0a0');
    else if (biome.overworld) {
      if (biome.id === 'castle' && gen.variant?.story?.intro) UI.log(gen.variant.story.intro, '#e8d0a8');
      UI.log('Activate the glowing shrine and complete its objective to open the exit.', '#ffe2a0');
    }
    else if (!c.tips.dungeon) { c.tips.dungeon = true; setTimeout(() => UI.log('Find the exit portal. It stays sealed until the depth\'s guardian is slain. The blue portal returns you to town.', '#ffe2a0'), 1500); }
    this.autosave();
  },

  useTownPortal() {
    const w = G.world;
    UI.dialog({
      title: 'Return to Town?',
      html: `<p>You will return to Herrington Hollow. ${w?.breach ? `Floor ${w.breach.floor} of the Eternal Breach` : w?.rift ? `The Rift (Tier ${w.rift.tier}) collapses behind you; it` : w?.unbound ? 'Velscour Unbound' : `Depth ${w?.depth || G.char.depth}`} will be re-forged when you come back.</p>`,
      buttons: [{ label: 'Stay' }, { label: 'Return', fn: () => {
        sfx('portal');
        if (G.world && G.world.depth) {
          G.char.depth = G.world.depth;
          if (G.room) G.room.depth = G.world.depth;
        }
        this.enterTown();
      } }],
    });
  },

  unsealDungeonExit(world, bossName = null, isVelscour = false, isRaid = false) {
    if (!world || world.kind !== 'dungeon' || world.biome?.overworld) return;
    const exit = world.portals?.find(p => p.type === 'exit');
    if (!exit) return;
    if (exit.active) return; // already unsealed

    exit.active = true;
    exit.color = '#40a0ff';
    exit.label = world.unbound ? 'Exit — to town' : 'Exit — continue';

    const c = G.char;
    if (c) {
      if (world.unbound) {
        c.unbound.wins = (c.unbound.wins || 0) + 1;
        UI.centerMsg('VELSCOUR UNBOUND HAS FALLEN', `${c.unbound.wins} time${c.unbound.wins > 1 ? 's' : ''} · the exit is open`, 4);
      } else {
        const first = !c.cleared[world.depth];
        c.cleared[world.depth] = true;
        c.deepest = Math.max(c.deepest || 0, world.depth);
        this.brokeThrough(world.depth);
        UI.centerMsg(bossName ? `${bossName} DEFEATED` : isRaid ? 'BOSS DEFEATED' : 'GUARDIAN SLAIN', first ? '+1 bonus skill point · the exit is open' : 'The exit is open', 3.5);
        if (first) {
          c.skillPoints++;
          UI.log('Bonus skill point for clearing a new depth!', '#ffd860');
          recordDepth(world, world.depth);
        }
      }
      this.autosave();
    }

    addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
    sfx('gate');
    UI.refresh();

    if (isVelscour && !world.practice) {
      if (unlockEndgame()) UI.log('<b style="color:#20e0ff">The Endgame opens.</b> The Altar of Heresy and the Abyssal Rift gate in Herrington Hollow answer to every hero now.', '#a0f0ff');
      setTimeout(() => victoryScreen(() => {}), 3200);
    }
  },

  useExit(world, exit) {
    const c = G.char;
    if (!exit.active) {
      const isBossDead = !world.boss || world.boss.dead ||
        (world.killedMonsterIds && (
          (world.boss.netId && world.killedMonsterIds.has(world.boss.netId)) ||
          (world.boss.idx != null && world.killedMonsterIds.has(world.boss.idx))
        )) ||
        (G.room?.unsealedDepths && G.room.unsealedDepths.has(world.depth));
      if (world.kind === 'dungeon' && !world.breach && !world.rift && !world.overworldScenario && isBossDead) {
        this.unsealDungeonExit(world, world.boss?.name);
        return;
      }
      floatText(exit.x, exit.y, 70, world.breach ? 'Sealed — the Breach Heart still beats!' : world.rift ? 'Sealed — the Guardian still stands!' : world.overworldScenario ? 'Sealed — complete the shrine trial!' : 'Sealed — slay the guardian!', '#ff6040', 13, { life: 1.6 });
      sfx('error');
      return;
    }
    if (world.breach) this.breachExit(world);
    else if (world.rift) this.riftExit(world);
    else if (world.unbound) { sfx('portal'); this.enterTown(); }
    else this.portalChoice(world);
  },

  /**
   * A cleared exit: up to three portals down, each a biome and (where one can stir) the omen waiting there. Pick one,
   * then descend or go to town first (the town portal leads to it). With auto-play on the player has PICK_WAIT seconds
   * to choose (or to tap a portal for it) before auto-play takes its own pick; opts.auto/opts.town come from
   * auto-play's leaveLevel (town: it means to shop first).
   */
  portalChoice(world, opts = {}) {
    if (this.pick) return;
    const c = G.char, next = world.depth + 1;

    // When one player makes a selection at the exit portal, make it the default choice so other players enter the same map
    if (G.room && G.room.depth === next && G.room.biome && G.room.dungeonSeed) {
      const chosenBiome = BIOME_BY_ID[G.room.biome] || BIOME_BY_ID.catacombs;
      const go = (town) => {
        this.pick = null;
        c.depth = next;
        c.nextBiome = chosenBiome.id;
        takeBiome(c, chosenBiome.id);
        if (Auto.on) Auto.transitT = 3;
        if (town) {
          if (opts.auto) UI.log('Auto-play heads back to town to trade.', '#8fe0ff');
          sfx('portal');
          this.enterTown();
        } else {
          this.enterDungeon();
        }
      };
      UI.dialog({
        title: `Depth ${world.depth} Cleared`,
        html: `<p>A party member has chosen the way forward to Depth ${next}: <b style="color:#ffb070">${escapeHtml(chosenBiome.name)}</b>.</p><p class="dim">Descend to join the party or return to town.</p>`,
        closable: false,
        cls: 'portal-choice',
        buttons: [
          { label: 'Return to Town', fn: () => go(true) },
          { label: `Descend to Depth ${next}`, cls: 'red', fn: () => go(false) },
        ],
      });
      return;
    }

    const ids = biomeChoices(c, next, 3);
    // a Town Commission waiting for a biome: its portal turns up among the three more often (game/commissions.js)
    const want = wantedBiomes(c).filter((id) => BIOME_BY_ID[id] && !ids.includes(id) && id !== c.lastBiome);
    if (want.length && ids.length && next !== FINAL_DEPTH && Math.random() < 0.4) ids[ids.length - 1] = want[Math.floor(Math.random() * want.length)];
    const cards = ids.map((id) => {
      const biome = BIOME_BY_ID[id] || BIOME_BY_ID.catacombs;
      const comm = commState(c).open.find((e) => { const ch = LINE_BY_ID[e.id] && LINE_BY_ID[e.id].chapters[e.ch]; return ch && ch.biome === biome.id; });
      return { id: biome.id, biome, omen: omenable(next, biome) ? rollOmen(next) || (heresiesOf(c).includes('omens') ? anyOmen() : null) : heresiesOf(c).includes('omens') && next > FINAL_DEPTH && !biome.overworld && !isRaidDepth(next) ? anyOmen() : undefined, comm: comm && LINE_BY_ID[comm.id].name }; // Black Omens: always one
    });
    let sel = 0, chosen = false;
    const tag = (cd) => (cd.biome.id === 'throne' ? '<b style="color:#ff4020">Demon Lord Velscour awaits</b>' : cd.biome.id === 'skyship' ? 'Sky battle' : cd.biome.overworld ? 'Overworld trial' : isRaidDepth(next) ? '<b style="color:#ff6030">BOSS ROOM</b>' : 'Dungeon');
    const omenLine = (cd) => (cd.omen === undefined ? '' : cd.omen ? `<span class="pc-omen" style="color:${OMENS[cd.omen].color}"><b>${OMENS[cd.omen].name}</b>${OMENS[cd.omen].text}</span>` : '<span class="pc-omen dim"><b>No omen</b>A quiet depth.</span>');
    const html = `<p class="dim">${cards.length > 1 ? `Depth ${next} lies beyond ${['', 'one', 'two', 'three'][cards.length]} portals. Choose your way down.` : `The way down opens onto Depth ${next}.`}</p>
      <div class="pc-row">${cards.map((cd, i) => `<button type="button" class="pc-card${i === sel ? ' sel' : ''}" data-i="${i}" style="--pc:${cd.biome.torch || '#ff8040'}"><i class="pc-swirl"></i><b class="pc-name">${escapeHtml(cd.biome.name)}</b><span class="pc-tag">${tag(cd)}</span>${cd.comm ? `<span class="pc-omen" style="color:#8fe0ff"><b>Commission</b>${escapeHtml(cd.comm)}</span>` : ''}${omenLine(cd)}</button>`).join('')}</div>
      <p class="pc-auto"></p>`;
    const go = (town) => {
      this.pick = null;
      const cd = cards[sel];
      c.depth = next; c.nextBiome = cd.id; takeBiome(c, cd.id);
      let dungeonSeed = Math.floor(Math.random() * 1e9) + 1;
      const mix = mixPartner(cd.biome, () => new RNG(dungeonSeed ^ 0x3d17a892).next());
      const mixId = mix ? mix.id : null;
      if (G.room) {
        G.room.depth = next;
        G.room.biome = cd.id;
        G.room.dungeonSeed = dungeonSeed;
        G.room.mixId = mixId;
        G.room.heresies = heresiesOf(c);
        if (net.connected) {
          net.sendRoomDepthUpdate(next, cd.id, dungeonSeed, mixId, G.room.heresies);
        }
      }
      if (cd.omen !== undefined) c.nextOmen = cd.omen || 'none'; else delete c.nextOmen;
      if (Auto.on) Auto.transitT = 3;
      if (town) {
        if (opts.auto) UI.log('Auto-play heads back to town to trade.', '#8fe0ff');
        sfx('portal');
        this.enterTown();
      } else {
        this.enterDungeon();
      }
    };
    const d = UI.dialog({
      title: `Depth ${world.depth} Cleared`, html, closable: false, cls: 'portal-choice',
      buttons: [{ label: 'Return to Town', fn: () => go(true) }, { label: `Descend to Depth ${next}`, cls: 'red', fn: () => go(false) }],
    });
    const btns = [...d.box.querySelectorAll('.pc-card')];
    btns.forEach((b) => b.addEventListener('click', () => {
      sel = +b.dataset.i; chosen = true; sfx('ui');
      btns.forEach((x) => x.classList.toggle('sel', x === b));
      if (this.pick) this.pick.t = Math.min(this.pick.t, 3); // auto-play goes where it was told, after a moment
    }));
    // auto-play's own pick: a portal with an omen (more to see, and most of them pay), else any
    const autoPick = () => { const k = cards.findIndex((cd) => cd.comm); if (k >= 0) return k; const o = cards.map((cd, i) => (cd.omen ? i : -1)).filter((i) => i >= 0); return o.length ? o[Math.floor(Math.random() * o.length)] : Math.floor(Math.random() * cards.length); };
    this.pick = {
      t: PICK_WAIT, el: d.box.querySelector('.pc-auto'), last: '',
      choose: () => { d.close(); if (!chosen) sel = autoPick(); go(opts.auto ? opts.town : Auto.needTown()); },
      name: () => (chosen ? cards[sel].biome.name : null),
    };
  },

  /** The portal choice's auto-play countdown (runs while the dialog pauses the world). */
  tickPick(dt) {
    const pk = this.pick;
    if (!pk) return;
    if (!pk.el.isConnected) { this.pick = null; return; }
    let txt = '';
    if (Auto.on && G.char) {
      pk.t -= dt;
      if (pk.t <= 0) { pk.choose(); return; }
      const nm = pk.name();
      txt = nm ? `Auto-play takes the portal to ${escapeHtml(nm)} in ${Math.ceil(pk.t)}…` : `Auto-play picks a portal in ${Math.ceil(pk.t)}… tap one to choose for it.`;
    }
    if (txt !== pk.last) { pk.last = txt; pk.el.innerHTML = txt; }
  },

  /** A cleared depth: if it ends the Defiance block, the stacks are spent (and say so). */
  brokeThrough(depth) {
    const c = G.char, had = c.defiance && c.defiance.n;
    commissionClear(G.world);
    greedCleared(G.world, c); // the Greed lever pays into the Hoard (game/greed.js)
    if (worldRank(G.world) >= MARKS_RANK && !G.world.markPaid) { G.world.markPaid = true; grantMarks(1, `for a depth cleared at Heresy rank ${worldRank(G.world)}`); } // (docs/ENDGAME.md)
    if (!clearDefiance(c, depth)) return;
    if (G.player) G.player.recompute();
    UI.log(`The wall is broken. <b style="color:#ff6a3a">Defiance ${had}</b> fades — Velscour takes note.`, '#ffb080');
  },

  onPlayerDeath(src) {
    const c = G.char;
    const w = G.world;
    if (w && w.breach) return this.breachDeath(src);
    if (w && w.rift) return this.riftDeath(src);
    if (w && w.unbound) return this.unboundDeath(src);
    c.deaths = (c.deaths || 0) + 1;
    const depth = w && w.kind === 'dungeon' ? w.depth : c.depth;
    const n = addDefiance(c, depth);
    markNemesis(c, src, depth); // the killer comes back as a unique (game/happenings.js)
    greedDeath(c); // the Hoard is lost and the Greed lever drops (game/greed.js)
    G.smiteArmed = false;
    delete c.nextOmen;
    const killer = src ? (src.owner ? src.owner.name : src.name) : null;
    stopMusic();
    this.autosave();
    setTimeout(() => {
      deathScreen(depth, killer, () => {
        // back to the start of this five-depth block (BOSS ROOMs are checkpoints), a Defiance stack stronger
        if (G.room) {
          c.depth = G.room.depth || depth;
          c.nextBiome = G.room.biome || c.nextBiome;
        } else {
          c.depth = blockStart(depth);
          c.nextBiome = drawBiome(c, c.depth);
        }
        const p = G.player;
        p.dead = false;
        p.buffs = [];
        p.recompute();
        p.hp = p.maxHp; p.mana = p.maxMana;
        this.enterTown();
        UI.log(`You awaken in Herrington Hollow. The descent begins anew at Depth ${c.depth}.`, '#ff8060');
        UI.log(`<b style="color:#ff6a3a">Defiance ${n}</b>: ${defianceText(n)} until you break past Depth ${c.defiance.block + 4}.`, '#ffb080');
      });
    }, 1700);
  },

  // ------------------------------------------------------------ THE ETERNAL BREACH (docs/ETERNAL_BREACH.md)
  /** The highest Breach floor the hero may enter: one past the best floor beaten. */
  breachOpen() { const b = G.char?.breach; return (b?.best || 0) + 1; },

  /** The purple portal: pick a floor (any up to one past the best beaten) and step in. */
  confirmBreach(floor) {
    const portal = G.world?.portals?.find((p) => p.breach);
    const away = this.getPlayersAwayFromPortal(portal);
    if (away.length > 0) {
      sfx('error');
      UI.dialog({
        title: 'Party Not Ready',
        html: `<p>All players must gather at the breach portal to enter together.</p><p style="color:#ffd860;margin-top:10px;">Waiting for: <b>${away.map(escapeHtml).join(', ')}</b></p>`,
        buttons: [{ label: 'OK' }],
      });
      return;
    }
    const c = G.char, top = this.breachOpen(), pick = Math.min(top, Math.max(1, floor || top));
    const opt = (n) => {
      const L = breachLevel(n), won = c.breach?.cleared?.[n] || 0;
      return `<option value="${n}"${n === pick ? ' selected' : ''}>Floor ${n} — as deadly as Depth ${breachDepth(n)} (monster level ${L})${won ? ` · beaten ${won}x` : n === top ? ' · new' : ''}</option>`;
    };
    const floors = [];
    for (let n = top; n >= 1; n--) floors.push(opt(n));
    const d = UI.dialog({
      title: 'THE ETERNAL BREACH', cls: 'breach-dialog',
      html: `<p>The purple portal opens on <b style="color:#c080ff">a broken world floating in the void</b>: sixteen islands joined by walkways, held by the Breach's own monsters.</p>
        <p class="dim">Win the shrines on the medium and large islands (scenarios and boss fights), lifting the wards on the walkways as you go; then face the floor's keeper at the Breach Heart. Floor N is as deadly as standard Depth 10&times;N. Falling here costs no Defiance and leaves your descent where it is.</p>
        <label class="velscour-message-label" for="breach-floor">Floor</label><select id="breach-floor" class="velscour-biome-select">${floors.join('')}</select>
        <p class="breach-warn" id="breach-warn"></p>`,
      buttons: [{ label: 'Not yet' }, { label: 'Enter the Breach', cls: 'red', fn: () => this.enterBreach(+d.box.querySelector('#breach-floor').value) }],
    });
    const sel = d.box.querySelector('#breach-floor'), warn = d.box.querySelector('#breach-warn');
    const upd = () => { const L = breachLevel(+sel.value); warn.innerHTML = L > c.level + 4 ? `<b style="color:#ff6050">Monsters there are level ${L}; you are level ${c.level}. Expect to die.</b>` : ''; };
    sel.addEventListener('change', upd); upd();
    return d;
  },

  enterBreach(floor) {
    const c = G.char;
    floor = Math.max(1, Math.min(this.breachOpen(), floor | 0 || 1));
    c.breach ||= { best: 0, cleared: {} };
    c.breach.floor = floor;
    const loading = document.getElementById('loading');
    document.getElementById('loading-text').textContent = `Into the Eternal Breach — Floor ${floor}…`;
    loading.classList.remove('hidden');
    sfx('portal');
    setTimeout(async () => {
      try { await this.loadLevelArt(BREACH_BIOME); } catch (e) { console.warn(e); }
      try {
        this.buildBreach(floor);
        const w = G.world;
        await loadArtFor(BREACH_ART.map((a) => a.id), true).catch((e) => console.warn(e)); // the Breach's six atlases (~1.6 MB)
        await warmLevelArt(w);
        releaseLevelArt(BREACH_BIOME);
      } finally { loading.classList.add('hidden'); }
    }, 40);
  },

  buildBreach(floor, seed = G.breachSeed ?? (Math.random() * 1e9) | 0) { // G.breachSeed: tests
    const c = G.char, old = G.world, B = BREACH_BIOME, depth = breachDepth(floor), lvl = breachLevel(floor);
    c.breach ||= { best: 0, cleared: {} };
    const a = biomeTileSet(B), b = biomeTileSet(BREACH_WALLS);
    // the Eternal Breach's floors and scatter, and both packs' walls, arches and doors for the ruins
    const tileset = { ...a, walls: { ...a.walls, ...b.walls }, families: [...a.families, ...b.families], arches: { ...a.arches, ...b.arches }, doors: { ...a.doors, ...b.doors }, parts: [a, b] };
    keepTileSets(tileset);
    const gen = generateBreach(floor, B, tileset, null, seed);
    const world = new World('dungeon', { map: gen.map, tileset, biome: B, depth, props: gen.props, torches: [], wallHangings: [], looks: gen.looks, townTiles: null, buildings: [] });
    world.breach = { floor, seed }; world.breachBridges = gen.bridges; world.rooms = [];
    world.chests = gen.chests.map((ch) => chestAt(world, ch.x, ch.y, ch.rare, depth));
    const [sx, sy] = gen.start;
    let tp = [sx + 1.4, sy - 1.2];
    if (!gen.map.walkable(tp[0], tp[1])) tp = gen.map.randomNear(sx, sy, 2);
    const exit = { x: gen.exit[0], y: gen.exit[1], type: 'exit', active: false, color: '#4a3a5a', reach: 2, label: 'Sealed — the Breach Heart', use: () => this.useExit(world, exit) };
    world.portals = [{ x: tp[0], y: tp[1], type: 'town', active: true, color: '#3a8aff', reach: 1.6, label: 'Town Portal', use: () => this.useTownPortal() }]; // the exit appears when the Heart is won
    for (const s of heresySpawns(gen.spawns, heresyBegin(world, c))) { // Twinned Packs reach the Breach too (game/heresies.js)
      for (let i = 0; i < s.n; i++) {
        const [x, y] = i === 0 ? [s.x, s.y] : gen.map.randomNear(s.x, s.y, 1.6);
        const rank = i === 0 ? s.rank : 'normal';
        const m = makeMonster(world, s.arch, B, lvl + (rank === 'normal' ? 0 : 1), rank, x, y, Math.random() < 0.25 ? 1 : 0, gen.looks.pick(s.arch));
        breachMonster(m);
        world.add(m);
      }
    }
    world.roster = BREACH_ARCHS;
    heresyWorld(world, c);
    world.onBossAwake = () => {};
    world.onBossKilled = () => {};
    world.overworldScenario = createBreachRun(world, gen, B, floor, () => {
      exit.active = true; exit.color = '#c050ff'; exit.label = 'Exit — onward or home';
      world.portals.push(exit);
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#c050ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    this.setWorld(world, gen.start, old);
    world.night = true;
    HUD.setArea('The Eternal Breach', `Floor ${floor} · as deadly as Depth ${depth}${worldRank(world) ? ` · Heresy ${worldRank(world)}` : ''}`);   // (the floor in the name ran under a phone's boss bar)
    playMusic('wilds', { delay: 3 + Math.random() * 10 }); setAmbience('eternal_breach');
    UI.centerMsg('THE ETERNAL BREACH', `Floor ${floor} · as deadly as Depth ${depth}`, 3);
    UI.log(`Floor ${floor} of the Eternal Breach: win the shrines on the medium and large islands to lift the wards on the walkways, then face the keeper of the <b style="color:#ff70d0">Breach Heart</b>.`, '#d8b0ff');
    this.autosave();
  },

  /** The exit on a beaten floor: on to the next floor, or home. opts.auto: auto-play's call (opts.town: it wants to shop). */
  breachExit(world, opts = {}) {
    const next = world.breach.floor + 1;
    if (Auto.on) Auto.transitT = 3;
    if (opts.auto) {
      if (opts.town || !Auto.breachReady(next)) { UI.log(opts.town ? 'Auto-play heads back to town to trade.' : `Auto-play judges Floor ${next} too deadly for now and heads home.`, '#8fe0ff'); sfx('portal'); this.enterTown(); }
      else this.enterBreach(next);
      return;
    }
    UI.dialog({
      title: `Breach Floor ${world.breach.floor} Sealed`,
      html: `<p>The Heart is still. Deeper in the Breach lies <b style="color:#c080ff">Floor ${next}</b>, as deadly as Depth ${breachDepth(next)} (monster level ${breachLevel(next)}).</p>`,
      buttons: [{ label: 'Return to Town', fn: () => { sfx('portal'); this.enterTown(); } }, { label: `On to Floor ${next}`, cls: 'red', fn: () => this.enterBreach(next) }],
    });
  },

  /** Death in the Breach: back to town with no Defiance, the descent untouched. */
  breachDeath(src) {
    const c = G.char, floor = G.world.breach.floor;
    c.deaths = (c.deaths || 0) + 1;
    c.breach.deaths = (c.breach.deaths || 0) + 1;
    G.smiteArmed = false;
    const killer = src ? (src.owner ? src.owner.name : src.name) : null;
    stopMusic();
    if (Auto.on) Auto.breachDied();
    this.autosave();
    setTimeout(() => {
      deathScreen(breachDepth(floor), killer, () => {
        const p = G.player;
        p.dead = false; p.buffs = []; p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
        this.enterTown();
        UI.log(`The Breach casts you out. Floor ${floor} waits beyond the purple portal; your descent still stands at Depth ${c.depth}.`, '#c890ff');
      }, { where: `on Floor ${floor} of the Eternal Breach`, note: 'Your gear, levels and skills endure, and the Breach takes no toll on your descent. Grow stronger and try the floor again.' });
    }, 1700);
  },

  // ------------------------------------------------------------ ABYSSAL RIFTS (docs/ENDGAME.md)
  /** The rift gate: pick a tier (ui/rifts.js) and step in. Refused until the Endgame is open. */
  confirmRift(tier) {
    if (!endgameUnlocked()) { UI.log('<b style="color:#20e0ff">The Abyssal Rift</b> is sealed: Velscour still sits his throne. Slay him at Depth 500 and it opens for every hero.', '#a0f0ff'); sfx('error'); return null; }
    return Rifts.open(tier);
  },
  enterRift(tier) {
    const c = G.char;
    if (!endgameUnlocked() || this.riftLoading) return; // one rift at a time (auto-play may step on the gate again while it loads)
    tier = Math.max(1, Math.min(riftOpen(c), tier | 0 || 1));
    const pool = BIOMES.filter((b) => !b.overworld && !b.beta && !b.challenge && !b.tower && !b.cave && b.id !== 'throne' && b.id !== c.lastRift);
    const biome = pick(pool.length ? pool : BIOMES.filter((b) => !b.overworld)) || BIOME_BY_ID.catacombs;
    c.lastRift = biome.id;
    const mix = mixPartner(biome);
    const loading = document.getElementById('loading');
    document.getElementById('loading-text').textContent = `Into the Abyssal Rift — Tier ${tier}…`;
    loading.classList.remove('hidden');
    sfx('portal');
    this.riftLoading = true;
    setTimeout(async () => {
      try { await this.loadLevelArt(biome, mix); } catch (e) { console.warn(e); }
      try {
        this.riftLoading = false;
        this.buildRift(tier, biome, mix);
        const w = G.world;
        await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : [])], true).catch((e) => console.warn(e));
        await warmLevelArt(w);
        releaseLevelArt(biome);
      } finally { loading.classList.add('hidden'); }
    }, 40);
  },
  /** A rift level: a small maze and a BOSS ROOM arena of a standard biome, as deadly as depth 500 + 10 T, no boss until the quota. */
  buildRift(tier, biome = BIOME_BY_ID.catacombs, mix = null, seed = G.riftSeed ?? (Math.random() * 1e9) | 0) {
    const c = G.char, old = G.world, depth = riftDepth(tier), lvl = riftLevel(tier);
    const tileset = mix ? mixedTileSet(biome, mix, Math.random() < 0.5) : biomeTileSet(biome);
    keepTileSets(tileset);
    const gen = generateDungeon(depth, biome, tileset, seed, { raid: true, small: true, density: RIFT_DENSITY });
    const world = new World('dungeon', { map: gen.map, tileset, biome, depth, props: gen.props, torches: gen.torches, wallHangings: gen.wallHangings, looks: gen.looks, townTiles: null, buildings: [] });
    world.rooms = gen.rooms || [];
    world.chests = gen.chests.map((ch) => ({ ...ch, opened: false, reach: 1.3, use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } }));
    const [sx, sy] = gen.start;
    let tp = gen.townPortal || [sx + 1.6, sy - 0.6];
    if (!gen.map.walkable(tp[0], tp[1])) tp = gen.map.randomNear(sx, sy, 2);
    const exit = { x: gen.exit[0], y: gen.exit[1], type: 'exit', active: false, color: '#5a5a60', reach: 1.6, label: 'Sealed Exit', use: () => this.useExit(world, exit) };
    world.portals = [{ x: tp[0], y: tp[1], type: 'town', active: true, color: '#3a8aff', reach: 1.6, label: 'Town Portal', use: () => this.useTownPortal() }, exit];
    for (const s of gen.spawns) {
      if (s.rank === 'raid' || s.rank === 'boss') continue; // the Guardian stirs at the quota (game/rifts.js)
      const variant = Math.random() < 0.4 ? 1 : 0, trait = rollTrait(world, Math.min(depth, 500));
      for (let i = 0; i < s.n; i++) {
        const [x, y] = i === 0 ? [s.x, s.y] : gen.map.randomNear(s.x, s.y, 1.6);
        const rank = s.rank === 'unique' ? (i === 0 ? 'unique' : 'normal') : s.rank;
        const m = makeMonster(world, s.arch, biome, lvl + (rank === 'normal' ? 0 : 1), rank, x, y, variant, s.look);
        if (s.rank === 'unique' && i > 0) { m.affixes = []; m.name = m.name + ' Minion'; }
        if (trait && (i === 0 || ['hunter', 'phaser', 'burrower'].includes(trait))) applyTrait(m, trait);
        world.add(m);
      }
    }
    world.roster = [...new Set(gen.spawns.filter((s) => s.arch && !['raid', 'boss'].includes(s.rank)).map((s) => s.arch))];
    world.rift = createRiftRun(world, gen, tier, {
      onWin: () => { exit.active = true; exit.color = '#20e0ff'; exit.label = 'Exit — onward or home'; addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#20e0ff', 5)); sfx('gate'); UI.refresh(); this.autosave(); },
      onFail: () => this.autosave(),
      onBack: () => { if (G.world === world) { stopMusic(); this.enterTown(); UI.log(`The Rift threw you back into Herrington Hollow. Tier ${tier} waits at the gate.`, '#a0f0ff'); } },
    });
    c.rifts.runs = (c.rifts.runs || 0) + 1;
    world.onBossAwake = (m) => { UI.centerMsg(m.name, `${m.title}${m.raid && m.raid.mods.length ? ' · ' + m.raid.modText() : ''}`, 3); sfx('boss'); };
    world.onBossKilled = () => {}; // riftWin handles it
    this.setWorld(world, gen.start, old);
    world.darkK = Math.max(world.darkK || 0, 0.25);
    HUD.setArea('Abyssal Rift', `Tier ${tier} · ${biome.name} · as deadly as Depth ${depth}`);
    playMusic('wilds', { delay: 2 }); setAmbience(biome.id);
    UI.centerMsg('ABYSSAL RIFT', `Tier ${tier} · ${fmtTime(world.rift.limit)} on the clock`, 3);
    UI.log(`<b style="color:#20e0ff">Abyssal Rift Tier ${tier}</b> (${biome.name}, as deadly as Depth ${depth}): slay ${Math.round(100 * RIFT_QUOTA)}% of the rift's monsters to wake the Guardian in the arena, and slay it before the clock runs out. Faster wins open more tiers.`, '#a0f0ff');
    this.autosave();
  },
  /** The exit of a closed rift: on to the next tier, or home. opts.auto: auto-play's call (opts.town: it wants to shop). */
  riftExit(world, opts = {}) {
    const R = world.rift, next = Math.min(riftOpen(), R.result ? R.result.next : R.tier + 1);
    if (Auto.on) Auto.transitT = 3;
    if (opts.auto) { // on to the next tier, or the highest open one it is ready for when that is still a climb; else home
      const go = Auto.riftReady(next) ? next : Auto.riftTier();
      if (opts.town || go <= R.tier) { UI.log(opts.town ? 'Auto-play heads back to town to trade.' : `Auto-play judges Tier ${next} too deadly for now and heads home.`, '#8fe0ff'); sfx('portal'); this.enterTown(); }
      else this.enterRift(go);
      return;
    }
    Rifts.results(R, { onNext: () => this.enterRift(next), onTown: () => { sfx('portal'); this.enterTown(); }, next });
  },
  /** Death in a rift: back to town with no Defiance, the descent untouched. */
  riftDeath(src) {
    const c = G.char, R = G.world.rift;
    c.deaths = (c.deaths || 0) + 1;
    c.rifts.deaths = (c.rifts.deaths || 0) + 1;
    if (!R.done) R.failed = true;
    G.smiteArmed = false;
    const killer = src ? (src.owner ? src.owner.name : src.name) : null;
    stopMusic();
    this.autosave();
    setTimeout(() => {
      deathScreen(riftDepth(R.tier), killer, () => {
        const p = G.player;
        p.dead = false; p.buffs = []; p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
        this.enterTown();
        UI.log(`The Rift spat you out. Tier ${R.tier} waits at the gate; your descent still stands at Depth ${c.depth}.`, '#a0f0ff');
      }, { where: `in Abyssal Rift Tier ${R.tier}`, note: 'Your gear, levels and skills endure, and a Rift takes no toll on your descent. Try the tier again, or a lower one.' });
    }, 1700);
  },

  // ------------------------------------------------------------ VELSCOUR UNBOUND (docs/ENDGAME.md)
  /** Three Abyssal Keys: the rematch on his throne, at the hero's depth (500 at the least), the hero set down in the arena. */
  async enterUnbound() {
    const c = G.char;
    if (!unboundReady(c)) { UI.log(`<b style="color:#20e0ff">Velscour Unbound</b> needs three Abyssal Keys (you hold ${keysOf(c)})${endgameUnlocked(c) ? '' : ' and Velscour slain at Depth 500'}. Keys drop from BOSS ROOM bosses past Depth 600 under Heresy rank 10, and from Abyssal Rift Guardians from Tier 10.`, '#a0f0ff'); sfx('error'); return false; }
    if (Auto.on) Auto.toggle(false);
    spendKeys(c);
    const depth = Math.max(FINAL_DEPTH, G.world?.kind === 'dungeon' && !G.world.rift ? G.world.depth : c.depth || 1), biome = BIOME_BY_ID.throne;
    const loading = document.getElementById('loading');
    document.getElementById('loading-text').textContent = `Velscour Unbound — Depth ${depth}…`;
    loading.classList.remove('hidden');
    try {
      await this.loadLevelArt(biome);
      G.unboundNext = true;
      this.buildDungeon(depth, biome);
      const w = G.world;
      await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : []), ...(w.velscour ? w.velscour.courtArt || [] : [])], true).catch((e) => console.warn(e)); // (his court steps in later)
      await warmLevelArt(w);
      releaseLevelArt(biome);
      const p = G.player;
      if (w.velscour && p) {
        const [x, y] = w.map.nudge(22.5, 26.5, 0.4);
        p.x = x; p.y = y; p.path = null; p.moveTarget = null; p.attackTarget = null;
        for (const s of w.creatures) if (s.team === 'player' && s !== p) [s.x, s.y] = w.map.randomNear(x, y, 1.5);
        w.map.reveal(x, y, 30);
        camera.follow(x, y, 0, true);
      }
      UI.log('<b style="color:#ff4020">Velscour Unbound.</b> The keys turn; the Demon Lord rises with his court at his side. There is no practice here.', '#ffb0a0');
    } catch (e) {
      console.warn(e); G.unboundNext = false;
      c.keys += 3; // the keys come back
      UI.log('The abyss rejected the keys. Try again.', '#ff8060');
    } finally {
      loading.classList.add('hidden');
      this.autosave();
    }
    return true;
  },
  /** Death in Velscour Unbound: back to town; no Defiance, the keys are spent. */
  unboundDeath(src) {
    const c = G.char;
    c.deaths = (c.deaths || 0) + 1;
    G.smiteArmed = false;
    const killer = src ? (src.owner ? src.owner.name : src.name) : null;
    stopMusic();
    this.autosave();
    setTimeout(() => {
      deathScreen(G.world ? G.world.depth : FINAL_DEPTH, killer, () => {
        const p = G.player;
        p.dead = false; p.buffs = []; p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
        this.enterTown();
        UI.log('Velscour Unbound keeps his throne. Three more Abyssal Keys buy another try.', '#ffb0a0');
      }, { where: "on Velscour's throne", note: 'Your gear, levels and skills endure, and your descent is untouched. The three keys are spent.' });
    }, 1700);
  },

  hudAction(act) {
    switch (act) {
      case 'inventory': case 'character': toggleInventory(); break;
      case 'skills': toggleTree(); break;
      case 'book': toggleBook(); break;
      case 'quest': toggleQuest(); break;
      case 'menu': pauseMenu(); break;
      case 'auto': Auto.toggle(); break;
    }
  },

  // ------------------------------------------------------------ frame
  update(dt) {
    const w = G.world, p = G.player;
    if (!w || !p) return;
    const ui = UI;
    if (!ui.modal) {
      if (input.consume('KeyI')) toggleInventory();
      if (input.consume('KeyK') || input.consume('KeyT')) toggleTree();
      if (input.consume('KeyB')) toggleBook();
      if (input.consume('KeyQ')) toggleQuest();
      if (input.consume('KeyP') && (input.alt || input.down('AltLeft') || input.down('AltRight'))) Auto.toggle();
      if (input.consume('KeyG')) unleashMadness();
      if (input.consume('KeyF')) toggleSmite();
      if (input.consume('Tab') || input.consume('KeyM')) G.showAutomap = !G.showAutomap;
      if (input.consume('Escape')) {
        if (G.smiteArmed) G.smiteArmed = false;
        else if (ui.anyOpen()) ui.closeAll();
        else if (G.showAutomap) G.showAutomap = false;
        else pauseMenu();
      }
    } else if (input.consume('Escape')) {
      const top = UI.screensEl.lastElementChild;
      if (top && top.querySelector('.dialog-box')) top.dispatchEvent(new PointerEvent('pointerdown'));
    }
    this.tickPick(dt);
    Auto.tickDest(dt); // auto-play's Standard/Breach menu in town
    const pauseMenus = !G.room && G.settings.pauseMenus !== false && w.kind === 'dungeon' && ui.anyOpen();
    G.paused = !G.room && (ui.modal || pauseMenus);
    Cine.update(G.paused ? 0 : dt);
    if (G.cine && !G.paused && !G.room) {   // a cut scene (game/cinema.js): no input, no auto-play, no monster thinks; the scene's actors move
      input.endFrame();
      cineTick(w, dt);
      // a scene this hero has seen plays at 20x (Cine.fast; Settings > "Don't skip cutscenes" keeps it at 1x)
      for (let i = 1; i < CINE_FAST && Cine.fast && G.cine && G.world === w; i++) { G.time += dt; Cine.update(dt); cineTick(w, dt); }
    } else if (!G.room && G.hitStop > 0) { G.hitStop -= dt; controls.update(0); }
    else if (!G.paused) {
      if (G.room && G.hitStop > 0) G.hitStop = Math.max(0, G.hitStop - dt);
      Auto.noteInput();
      controls.update(dt);
      Auto.update(dt);
      // auto-play (or a click) may have taken the hero through a portal: the world he left stops here, or its rules run on
      // him in the new one (the Breach's wards put him back at his last Breach spot, off the edge of town: a black town)
      if (G.world !== w) return;
      w.update(dt);
      if (G.world !== w) return;
      if (w.overworldScenario) w.overworldScenario.update(dt);
      if (w.map.c3struct && !w.map.sky) castle3dTick(w, dt);
      if (!G.room || this.isDungeonAuthority(w?.depth)) {
        ambushTick(w, dt);
      }
      if (w.kind === 'town') townTick(w, dt); else if (!w.sky) happeningsTick(w, dt);
      if (w.rift) riftTick(w, dt); // the Abyssal Rift's clock (game/rifts.js)
      if (w.heresy) heresyTick(w, dt); // the Heresies as monsters appear, the Legion's hellgates (game/heresies.js; the Breach has no happenings tick)
      madnessTick(dt);
      spectateTick(w, dt); // gilded critters, the SMITE reticle (game/spectate.js)
      footsteps(p, w.kind === 'town' ? 'dirt' : STEP_SURFACE[w.biome && w.biome.id] || 'stone');
      Meter.tick(dt);
      if (w.kind === 'dungeon' && G.char) G.char.sealT = (G.char.sealT ?? SEAL_GAP) + dt; // the sealed treasure clock (loot.js)
      if (G.room && p && !p.dead) {
        netSyncT += dt;
        if (netSyncT >= 0.05) {
          netSyncT = 0;
          const mySummons = [];
          if (w && w.creatures) {
            for (const c of w.creatures) {
              if (c.summon && c.owner === p && !c.dead) {
                if (!c.summonId) c.summonId = `${net.myId || 'local'}_s_${Math.random().toString(36).substr(2, 9)}`;
                mySummons.push({
                  id: c.summonId,
                  key: c.summonKey,
                  name: c.name,
                  x: Math.round(c.x * 100) / 100,
                  y: Math.round(c.y * 100) / 100,
                  vx: Math.round((c.vx || 0) * 100) / 100,
                  vy: Math.round((c.vy || 0) * 100) / 100,
                  facing: Math.round((c.facing || 0) * 100) / 100,
                  moving: !!c.moving,
                  animT: Math.round((c.animT || 0) * 100) / 100,
                  attackAnimT: Math.round((c.attackAnimT || 0) * 100) / 100,
                  lunge: Math.round((c.lunge || 0) * 100) / 100,
                  flip: !!c.flip,
                  hp: Math.round(c.hp),
                  maxHp: Math.round(c.maxHp),
                  scale: c.scale || 1,
                  fly: !!c.fly,
                  static: !!c.static,
                  alpha: c.alpha !== undefined ? c.alpha : 1,
                  aura: c.aura || null,
                  summonEl: c.summonEl || null,
                  art: c.art || null,
                  artH: c.artH || null,
                  artRef: c.artRef || null,
                  swap: c.swap || null,
                  sprite: c.sprite || null,
                  pal: c.pal || null,
                  px: c.px || null,
                  classId: c.classId || null,
                  slime: c.slime ? {
                    kind: c.slime.kind,
                    set: c.slime.set,
                    h: c.slime.h,
                    mini: !!c.slime.mini,
                    anim: c.slime.anim,
                    animT: Math.round((c.slime.animT || 0) * 100) / 100,
                    z: Math.round((c.slime.z || 0) * 100) / 100,
                    tilt: Math.round((c.slime.tilt || 0) * 100) / 100,
                  } : null,
                });
              }
            }
          }
          const shown = shownEquip(G.char);
          const equipHead = shown?.head;
          const equipBody = shown?.body;
          const gearKey = (equipHead ? equipHead.base + (equipHead.look ? equipHead.look.join(',') : '') : '') + '|' +
                          (equipBody ? equipBody.base + (equipBody.look ? equipBody.look.join(',') : '') : '');
          const gearChanged = (!this._lastSentGearKey || this._lastSentGearKey !== gearKey || (this._gearHeartbeatT = (this._gearHeartbeatT || 0) + 0.05) > 3.0);
          if (gearChanged) {
            this._lastSentGearKey = gearKey;
            this._gearHeartbeatT = 0;
          }
          const gearPayload = gearChanged ? {
            head: equipHead ? {
              slot: 'head',
              type: 'gear',
              base: equipHead.base,
              rarity: equipHead.rarity ?? 0,
              ilvl: equipHead.ilvl ?? 1,
              look: Array.isArray(equipHead.look) ? [...equipHead.look] : null,
            } : null,
            body: equipBody ? {
              slot: 'body',
              type: 'gear',
              base: equipBody.base,
              rarity: equipBody.rarity ?? 0,
              ilvl: equipBody.ilvl ?? 1,
              look: Array.isArray(equipBody.look) ? [...equipBody.look] : null,
            } : null,
          } : null;

          net.sendPlayerState({
            name: G.char?.name || 'Hero',
            classId: p.classId,
            level: G.char?.level || 1,
            gear: gearPayload,
            x: p.x,
            y: p.y,
            z: Math.round(p.z || 0),
            vx: p.vx || 0,
            vy: p.vy || 0,
            facing: p.facing || 0,
            moving: !!p.moving,
            animT: p.animT || 0,
            flip: !!p.flip,
            hp: Math.round(p.hp),
            maxHp: Math.round(p.maxHp),
            mana: Math.round(p.mana),
            maxMana: Math.round(p.maxMana),
            summons: mySummons,
            worldKind: w?.kind || 'town',
            depth: (w?.kind === 'dungeon' ? w.depth : 0) || 0,
          });
        }
      }
      if (G.room && w.kind === 'dungeon' && p && !p.dead) {
        if (this.isDungeonAuthority(w.depth)) {
          monSyncT += dt;
          if (monSyncT >= 0.08) {
            monSyncT = 0;
            const monSync = [];
            const activePlayers = [{ x: p.x, y: p.y }];
            if (G.remotePlayers) {
              for (const rp of G.remotePlayers.values()) {
                if (!rp.dead && (rp.world === w || (rp.worldKind === w.kind && rp.depth === w.depth))) {
                  activePlayers.push({ x: rp.x, y: rp.y });
                }
              }
            }
            const maxSyncDistSq = 32 * 32;
            for (const m of w.creatures) {
              if (m.team === 'enemy' && !m.dead) {
                const isSpecial = m.awake || m.isRaid || m.rank === 'boss' || m === w.boss || m.rank === 'champion' || m.rank === 'unique';
                const nearAnyPlayer = activePlayers.some(pl => dist2(m.x, m.y, pl.x, pl.y) < maxSyncDistSq);
                if (isSpecial || nearAnyPlayer) {
                  monSync.push({
                    id: m.netId || m.idx,
                    x: Math.round(m.x * 100) / 100,
                    y: Math.round(m.y * 100) / 100,
                    hp: Math.round(m.hp),
                    f: m.facing ? 1 : 0,
                    a: m.awake ? 1 : 0,
                    arch: m.arch,
                    name: m.name,
                    isWard: !!m.isWard,
                    vk: m.vk,
                    static: !!m.static,
                    fly: !!m.fly,
                    maxHp: Math.round(m.maxHp),
                    lvl: m.level,
                    rank: m.rank,
                    color: m.aura || (m.pal ? m.pal.a : null),
                    affixes: m.affixes ? [...m.affixes] : null,
                    ambusher: !!m.ambusher,
                  });
                }
              }
            }
            if (monSync.length > 0 || (w.killedMonsterIds && w.killedMonsterIds.size > 0)) {
              net.sendMonstersState(monSync, w.depth, Array.from(w.killedMonsterIds || []));
            }
          }
        }
      }
    } else {
      input.endFrame();
    }
    if (!G.cine) camera.follow(p.x, p.y, dt);
    camera.update(dt);
    if (!!G.cine !== hudCine) { hudCine = !!G.cine; HUD.show(!hudCine); if (G.touch) TouchUI.show(!hudCine); }
    if (G.hurtFlash > 0) G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.5);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2);
    HUD.update(dt);
    if (G.touch) TouchUI.update();
    // hovering things -> cursor
    G.canvas.style.cursor = G.hover ? 'pointer' : '';
    saveT += dt;
    if (saveT > 30) this.autosave();
  },

  render() {
    const w = G.world;
    if (!w) return;
    renderWorld(G.ctx, w);
    if (G.showAutomap) {
      const W = G.W * G.dpr, H = G.H * G.dpr;
      if (!automapCanvas || automapCanvas.width !== W || automapCanvas.height !== H) automapCanvas = makeCanvas(W, H);
      drawMinimap(w, 0, automapCanvas, true);
      const ctx = G.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.9; ctx.drawImage(automapCanvas, 0, 0); ctx.globalAlpha = 1;
      updateAutomapPartyRoster();
    }
  },
};

export { Monster, CLASSES, fmtInt, randi };
