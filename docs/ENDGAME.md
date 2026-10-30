# THE ENDGAME: Heresies, Abyssal Rifts, Velscour Unbound, Infernal Marks

What a hero does after Velscour falls (depth 500). Four systems, one unlock: **the Endgame opens for the whole browser
(every hero) the first time any hero slays Velscour for real** (not the skull's practice fight). Before that the altar
and the rift gate stand in town but refuse: *"Velscour still sits his throne."*

Tests: `tools/tests/heresies.js`, `rifts.js`, `unbound.js`, `marks.js`, `rift_balance.js` (model, no play), plus the
Marks columns in `endgame.js`. Data lives in `src/data/heresies.js`, `src/data/rifts.js`, additions to
`src/data/items.js` (the Abyssal rarity) and `src/data/relics.js` (Unbound Heirlooms). Account-wide state in
`src/game/endgame.js` (localStorage `velscour_endgame_v1`, and the signed-in player's Firestore document
`users/{uid}/account/endgame`).

## The shared record (`src/game/endgame.js`)
```
{ v: 1, unlocked: 0 | timestamp,                       // any hero slew Velscour
  marks: { pts: 0, xp: 0, spent: { life: 0, crit: 0, mf: 0, rift: 0 } },
  bests: { [classId]: { tier, time, at } },            // best Abyssal Rift per class on this account (shown offline)
  keysFound: 0, unboundWins: 0 }
```
API: `endgame()` (cached, like `reliquary()`), `saveEndgame()`, `resetEndgameCache()`, `endgameUnlocked()`
(record.unlocked, or the current hero's `c.cleared[FINAL_DEPTH]`), `unlockEndgame()` (called from
`game.buildDungeon`'s `onBossKilled` when `m.isVelscour && !world.practice && !world.unbound`),
`mergeEndgame(local, cloud, base)`: never loses anything. `base` is the record this device last synced (`st.endBase` in
`velscour_cloud_v1`; null on a first sign-in). Counters (`marks.pts`, `keysFound`, `unboundWins`) = the base plus what
each side earned since it (no base: the larger), never below either side or the base; `marks.spent` = each side's
change since the base per category (only one side changed: that side's), this device's if the sum passes the Marks, a
side with fewer Marks than the base counts as damaged (its spending ignored), no base: the larger side's; `marks.xp`
the larger; `unlocked` = earliest truthy; `bests[cls]` = the higher tier (then the faster time); everything sanitised and
spending clamped to the Marks by `fixEndgame`. `saveEndgame(quiet)`: quiet (XP towards a Mark only) skips the listeners.
Cloud: `Cloud` pushes the record after a change (debounced 60 s, and on `flush`) and merges on every `sync` through two
new backend calls, `account(uid)` and `putAccount(uid, rec, expect)` (a transaction that writes only if the document
still holds `expect`, else the sync reads and merges again); the base becomes what was read, then the merge once it is
written; sign-out clears it and keeps the local record. Rules and cases in docs/CLOUD_SAVES.md; `src/game/cloud.js` keeps
its three-way rules for heroes untouched. The fake backend in `tools/tests/cloud.js` gets the two calls too (`runTransaction` get/set on the path
`users/{uid}/account/endgame`).

## 1. Heresies (`src/data/heresies.js`, `src/game/heresies.js`, `src/ui/heresies.js`)
Difficulty modifiers the player switches on at the **Altar of Heresy** in Herrington Hollow (a dark obelisk beside the
plaza, `world.npcs` entry `{ altar: true, name: 'Altar of Heresy', use: () => Heresies.open() }`, drawn by `drawNpc` with
`obelisk()` from happenings.js in Velscour's red, a skull glow when any Heresy is on). They are the hero's (`c.heresy =
{ on: ['twins', ...] }`, migrate adds `{ on: [] }`), take hold from the next level built, and apply in standard depths,
the Endless Torment and the Eternal Breach. **Not** in Abyssal Rifts (the clock is the challenge and the honour board
must compare like with like) and not in Velscour Unbound. The Quest Log and the HUD's area subtitle show the rank.

| id | name | rank | what it does (where) |
|----|------|-----:|----------------------|
| twins | Twinned Packs | 3 | every pack spawns twice its number (`heresySpawns`: `n * 2` for packs, not raid/boss) |
| crowned | Crowned Champions | 2 | champions roll 2 extra affixes, uniques 1 (`heresyMonster`: `makeElite`'s affix keys) |
| thirst | Dry Throat | 3 | no potions of any kind (`Player.usePotion` refuses with "The Heresy forbids it"; auto-play never tries) |
| fifth | The Fifth Phase | 2 | BOSS ROOM bosses fight one phase more (`heresyRaid(raid)`: the next template phase, or Final Stand again, with a new mark) and roll one more modifier |
| legion | The Legion Follows | 3 | every 40-55 s (the first after 25-40) a hellgate opens in the hero's sight, on ground joined to him, and 2-4 Pit Demons/Imps (level `depthLevel(depth) - 2`, the first a champion, at most 8 alive) climb out (the hazard from velscour.js `legion`, moved to `src/game/heresies.js legionGate(world, near, n, level, opts)` and shared). Its clock stands still while a guardian or BOSS ROOM boss is awake. Runs from `game.update` (`heresyTick`), so the Breach has it too |
| iron | Iron Hide | 2 | monsters +50% life |
| cruel | Cruel Hand | 3 | monsters +30% damage |
| ambush | Ambush Weather | 1 | ambush arrivals 3x as often, the first wait too (`mayhem.ambushTick` reads `world.heresyAmbush`; like every ambush, not in BOSS ROOMs or the Breach) |
| omens | Black Omens | 1 | every omenable depth has an omen (the portal choice rolls one), and a Nemesis always returns |
| glass | Glass Cannon | 2 | the hero: -25% life, +15% damage (`heresyHero(c)` summed in `Player.recompute` like Defiance) |
| hunger | Hunger of the Abyss | 2 | no life or mana orbs drop from any source (kills, the Feeding Frenzy omen: `heresyWorld` filters `world.addLoot`), no life regeneration from gear or buffs |
| gaze | Velscour's Gaze | 2 | monsters notice the hero from twice as far (`aggroRange *= 2`, was 2.5: with every Heresy on it woke 300+ monsters at once and doubled the frame cost; a raid boss's 0 stays 0) and, once awake, never lose him (`m.gaze`: `Monster.pickTarget` tracks him anywhere, like a hunter) |

Rank = the sum of the ranks on (max 26). `heresyMods(rank)` → `{ mf: 4 * rank, gold: 1 + 0.04 * rank, loot: 1 +
0.02 * rank, xp: 1 + 0.02 * rank, sigil: 1 + 0.05 * rank, relic: 1 + 0.04 * rank }`. Where they land: `heresyWorld(world,
c)` runs after `greedWorld` in `buildDungeon` and `buildBreach` and multiplies `world.lootMul`, `world.goldMul`,
`world.mfAdd`, `world.sigilMul` and `world.relicMul` (new; `dropLoot` multiplies the Sigil odds and `maybeRelic`'s boost
by them; the Sigil odds also carry `lootMul`, so x3.5 at rank 26); XP is paid per monster (`m.xp *= M.xp` in
`heresyMonster`, nothing reads a world XP dial). `world.heresy = { ids, rank }` is set by `heresyBegin` before the monsters
are made (BOSS ROOM bosses read it), `null` in rifts and Unbound. `heresyTick(world, dt)` (from `game.update`, after
`riftTick`, wherever `world.heresy` is set) marks every enemy as it appears (`m._heresy`, once: iron/cruel never
compound), applies iron/cruel/gaze/crowned and the XP, and runs the Legion clock. At rank >= 10 **Abyssal Keys** may
drop from BOSS ROOM bosses past depth 600 (below). Milestone text in the altar: rank 10 "the keys", 20 "+1 Mark per depth
cleared" (`grantMarks(1)` in `brokeThrough` when rank >= 20).

Altar panel (`Heresies.open()`, `UI.openPanel('heresies', ...)`, class `heresy-panel`, CSS `.hx-*`): the rank with a
bar (ticks at the milestones) and its rewards as chips, a note that they take hold from the next level (inside a level
built with another set it says the changes wait), one row per Heresy (the whole row is a switch: name, rank pips,
description), the milestones, "Renounce all", and the three doors (Abyssal Rift `game.confirmRift()`, Velscour Unbound
`game.enterUnbound()` with the key count, disabled under three keys, Infernal Marks `G.ui.marks.open()`). A toggle
autosaves. On a touch screen: one column, 50x28 switches, 48 px doors, the body scrolls. Locked before the Endgame: the
panel says so, the list is greyed and disabled, the rift door too. The altar itself is `t.altar` from `generateTown`
(a reachable tile about 5.5 tiles from the plaza's centre), an obelisk grey while locked, red once open, glowing while a
Heresy is on.

Where they stop: Ambush Weather has no effect in BOSS ROOMs or the Breach (`ambushTick` skips them); **Black Omens only
reaches omenable depths (below 500)**: `setupHappenings` returns early from Depth 500 on and `omenable` is false there, so
in the Endless Torment it is a rank point for nothing (proposal, not applied: let Black Omens past the `depth >=
FINAL_DEPTH` return in `setupHappenings` for the omen block alone, and `portalChoice` roll one past 500 when it is on).

Measured (`tools/tests/heresies.js balance` / `each`, a paladin geared for Depth 521 like `balance.js` BAL_GEAR 8, headless
SwiftShader on a shared 4-CPU box, so timings are rough; ranges over 4 runs): a depth-520/521 level holds 586-675
monsters, **1,013-1,435 with Twinned Packs** (a seeded level: exactly x2 pack monsters); champions carry 2 affixes (4 with
Crowned), uniques 3 (4); the build takes 70-210 ms either way. `game.update()` per frame standing at the start: 1.7-2.8 ms
without, 2.4-5.9 ms with Twinned Packs (x1.1-2.4: it follows the monsters awake and fighting near the hero, sleeping ones
cost almost nothing); under auto-play 2.8-3.3 ms vs 3.6-4.8 ms (x1.1-1.6), and all twelve 3.8-6.6 ms (x1.2-2.4: Velscour's
Gaze wakes up to ~300 monsters that then all chase the hero). God-mode auto-play's first 25 kills: 8-25 s without, 7-38 s
with Twinned Packs, 4-36 s under all twelve (the level matters more than the Heresies; Gaze brings the packs to it).
Without god mode, 60-90 s on a fresh level: no Heresy lived every run (lowest life 4-94%), every single Heresy lived but
one Crowned Champions run (died once in two), all twelve died in 2 of 4 runs (18 s, 57 s; lowest life 66% when it lived).
Rank 26 is not for the hero's own depth; a few ranks are. Auto-play's 3-minute soak from a new wizard with Twinned Packs,
Dry Throat, Iron Hide, Gaze and the Legion (rank 13) at Depth 1: 2 deaths, 26 kills (none, 74 kills without).
If the frame cost matters on phones, the caps to try (not applied): Twinned Packs as `n: Math.min(s.n * 2, s.n + 6)`, and
Gaze's "never loses him" for the 60 nearest awake monsters only (the rest forget him past 30 tiles as before).

## 2. Abyssal Rifts (`src/data/rifts.js`, `src/game/rifts.js`, `src/ui/rifts.js`, `src/game/leaderboard.js`)
Short timed dungeons. **Tier T is as deadly as Depth 500 + 10 T** (`riftDepth(T) = FINAL_DEPTH + 10 * T`,
`riftLevel(T) = depthLevel(riftDepth(T))`; tier 1: monster level 263, tier 10: 303, tier 50: 483, tier 100: 708). The
**Abyssal Rift gate** is a third portal in town (`world.portals` entry `{ rift: true, color: '#20e0ff', label, use: () =>
game.confirmRift() }`, lit and labelled "Abyssal Rift — Tier N" once the Endgame is open, "(sealed)" and refusing before)
on the breach yard's road short of the purple portal (`t.rift` from `generateTown`). `c.rifts = { open: 1, best: 0,
cleared: {tier: times}, bestTime: {tier: secs}, runs: 0, fails: 0, deaths: 0 }` (migrate adds it); `c.lastRift` (the last
biome) and `c.lastRiftBoss` (the last Guardian) keep two runs in a row from repeating.

The dialog (`game.confirmRift(tier)` → `Rifts.open`, class `rift-dialog`): a tier select (`c.rifts.open` .. 1), each line
"Tier 7 — as deadly as Depth 570 (monster level 290) · best 3:21", the rules and the clock the hero gets, a warning when
the monsters are more than 4 levels above the hero, the hero's record (best tier, runs, closed, collapsed, fallen) and an
**Honour Board** button. `game.enterRift(tier)` → `game.buildRift(tier, biome, mix, seed = G.riftSeed ?? random)`: a
random standard dungeon biome (`BIOMES` that are neither overworld, beta, challenge, tower nor cave, nor the throne; never
the same twice running), `generateDungeon(depth, biome, tileset, seed, { raid: true, small: true, density: RIFT_DENSITY
})` (`opts.raid` forces the arena, `opts.small` clamps the chunk grid to 4 x 4, `opts.density` thins the normal packs: a
rift holds ~150-200 monsters in ~40 packs), the `rank: 'raid'`/`'boss'` spawn is **not** placed, no Heresy applies
(`world.heresy` stays null), its monsters are `riftLevel(T)` (champions and uniques +1).
`world.rift = createRiftRun(world, gen, tier, { onWin, onFail, onBack })`:
```
run = { tier, t, limit: riftTime(), progress, total, quota, guardian, gT, done, failed, backT, result, label() }
```
- `riftTime() = RIFT_TIME + markBonuses().rift` (Haste Marks). The clock runs in `game.update` (`riftTick(w, dt)`), so
  menus and dialogs stop it (`G.paused`); warnings at 1:00, 0:30 and 0:10.
- Progress: `riftWeight(m)`: normal 1, champion 4 (every champion of a pack), unique 8, a unique's minions 1; summons,
  pit spawns, Velscour's parts and bosses 0. `total` sums the monsters the level was built with and `quota = ceil(total x
  RIFT_QUOTA)`. `combat.kill` calls `riftKill(world, m)` for every death (the hero's pets and ambush arrivals count too).
- At the quota "THE GUARDIAN STIRS": `makeRaidBoss(world, gen.raid, depth, riftLevel + 3, { tpl, hp: RIFT_GUARDIAN_HP })`
  in the arena, one of the 28 classic BOSS ROOM bosses (the twenty signature fights of `raidsigs.js` are long puzzles
  that ran past the clock in testing; they stay the BOSS ROOM's and Unbound's), never `c.lastRiftBoss` (`opts.tpl`
  keeps `c.lastRaid`, the BOSS ROOM's own no-repeat, untouched); `world.boss`, `world.raid`; its `onDeath` chained to
  `riftWin`. The raid's own seal, wards, enrage and execute rules stand; the boss bar shows it once it wakes and the
  rift bar moves below it.
- The clock runs out: `riftCollapse` ("THE RIFT COLLAPSES"): `c.rifts.fails++`, the hero can't be hurt
  (`p.invuln = 3`) and is back in town 2.5 s of game time later (`backT`, `hooks.onBack`) with the level's loot lost; no
  Defiance, the descent untouched, the tier stays open; auto-play's `dest` stays `rift`.
- Leaving any other way (the town portal, auto-play's retreat) is a fail too: `game.setWorld` calls `riftLeave(old)`.
- Death: `game.riftDeath(src)` like `breachDeath` (no Defiance, `c.rifts.deaths++`, not also a fail; the death screen
  says "Slain in Abyssal Rift Tier N").
- Win: `time = run.t`, `jump = riftJump(time / limit)` (<= 0.5 → 3 tiers, <= 0.8 → 2, else 1), `c.rifts.open =
  max(open, tier + jump)`, `best`, `cleared[tier]++`, `bestTime[tier] = min`; `grantMarks(riftMarks(tier))` (`ceil(tier /
  10)`); `noteRiftBest` puts it in the account record's `bests[cls]` when it beats it (higher tier, or the same tier
  faster), and then `Board.submit` posts it to the honour board (signed in); `run.result.board` says how that went
  (`posted` / `kept` / `signedout` / `offline`). A hero that took Velscour's gift (`c.cheated`, `barred(c)`) records
  neither: no account best, no post, `barred`, and its class's entry is withdrawn (docs/CLOUD_SAVES.md). "THE RIFT IS CLOSED", the exit opens; `game.riftExit(world, opts)`
  shows the results (`Rifts.results`: the time and its share of the clock, the tiers opened, Marks, the prize, a new best
  and the board) with "On to Tier T+jump" / "Return to Town". Auto-play (`opts.auto`): on to `tier + jump` when
  `riftReady` says so, else to the highest open tier it is ready for if that is still a climb (`riftTier()`), else home
  (and home when it wants to trade). HUD: `#rift-bar` under the area name: `ABYSSAL RIFT · Tier 12 · 4:31 · [bar] 63%`
  ("the Guardian" at the quota, "closed" / "collapsed"), urgent and pulsing red under a minute.
- The Guardian's hoard (`riftReward(tier, first)`, dropped by `riftWin` on top of the raid's own loot): one gear item at
  item level `riftLevel + 2` of rarity **Abyssal** with chance `min(0.6, 0.1 + 0.02 * tier)` (a tier's first clear:
  always), else Mythic (`rarityAt`); two Sigils (`rollSigil(depth, 1 + floor(tier / 10))`); four gold piles; from tier 10
  an **Abyssal Key** (game/unbound.js `keyChance`, rolled in `dropLoot`).

**Abyssal** is a seventh rarity in `RARITY` (`src/data/items.js`): `{ id: 6, name: 'Abyssal', color: '#20e0ff', weight: 0,
lv: 14, perks: 3, sockets: 5, bonus: 0, minIlvl: 200, fullIlvl: 200 }`: never rolled by `rollRarity` (weight 0), made by
`rollItem(ilvl, { rarity: 6 })`; `mfMul` gets a seventh entry; `css/style.css` `.r6`; `core/gearart.js` uses the Mythic
designs/finishes for it (`rarityName` falls back); the loot filter dialog lists it; `rarity.js` prints it. Worth 21 item levels over a Common (Mythic 15.8, Legendary 11; tools/tests/rarity.js): each step up is bigger than the last.

Honour board (`src/game/leaderboard.js`, `Board`): Firestore `boards/{classId}/entries/{uid}` →
`{ v: 1, name, cls, tier, time, at, level, marks, build: { bar: [skill ids], gear: { slot: { name, rarity, ilvl, relic,
upg } }, level, marks } }`. `Board.submit(c, tier, time)` (signed in only) goes through the backend's `putBoard(cls, uid,
rec)`, a **read-compare-set transaction**: it reads the entry and writes only a better run (a higher tier, or the same
tier faster), resolving `{ ok, kept }`, so a stale or offline device can't replace a better entry. `Board.top(cls)` reads
`board(cls)` (all of a class's entries; `Cloud.board` loads the SDK first, signed out too) and sorts tier desc, time asc,
then the earliest post; `at` comes back a number (`atMs`: the real SDK returns a Timestamp). The Honour Board dialog
(`Rifts.board(cls)`, class `rift-board`): a class select, "your best on this browser" (the account record) with "Sign in
with Google in Settings to be listed" when signed out, "Loading…" / "Could not reach the board" / "Nobody listed yet" /
rows (rank, hero, tier, time, level; the player's own row highlighted, and shown below the top 50 when it is further
down); a row opens the build (skills on the bar by name, the gear per slot in its rarity colour with +upgrades and item
level, level, Marks, the date). Everything read from the board is escaped. It is an **honour** board: saves are local,
so a cheat can post anything; the build beside every entry lets readers judge it. `firestore.rules` holds the rules
(public read of boards, create/update by the owner only with field checks, no deletes; heroes and the account record by
their owner only); docs/CLOUD_SAVES.md says how to deploy them.

**Tunables** (`src/data/rifts.js`) and what they were tuned on (`tools/tests/rift_balance.js`, a model fitted on 24
god-mode auto-play runs; `tools/tests/rifts.js` "auto"): `RIFT_TIME` 420 s, `RIFT_QUOTA` 0.6 (was 0.7), `RIFT_DENSITY`
0.8 (was 1: ~167 monsters, weight ~270, quota ~163 in ~45 packs), `RIFT_GUARDIAN_HP` 0.6 (the Guardian's life against a
BOSS ROOM boss's: ~12 normals of its level, was ~19). With the skeleton's numbers a hero **at** the tier's level needed
69-90% of the clock at tiers 1-10 in the model (paladin; wizard 72-81%) and auto-play lost all four real at-level tier-10
runs; a full-clear hero (level 270) needed 68-78% of tier 1. Now (model, at the tier's level, paladin / wizard): tier 1
64-73 / 48%, tier 5 50-53 / 48%, tier 10 45-71 / 50%; the full-clear hero 47-56 / 53% of tier 1. Real auto-play runs at
the tier's level (god mode): tier 1 32-56% (one paladin run lost to a slow Nine-Throat), tier 10 39-72%, all won; ten
levels over, from town, 27-96%. Ten levels under: the paladin's damage follows its gear (x1.02-1.15 a level in the fits)
and the clock bites from tier ~10 (82-109%); the wizard's barely moves within a tier, so 10 under still fits (59-82%).
**The wall**: from tier ~20 (monster level ~350) an at-level hero's damage falls behind monster life (x1.068 a level), as
in the Endless Torment: at the tier's level tier 20 took 67-191% of the clock across model runs (gear rolls swing it most there), tier 30 74-148%, tier
40 67-115%, tier 60 131-322%; those tiers want gear past the hero's level (Abyssal prizes, relics, Marks). Hero levels
from full clears: ~267 at depth 500, ~270 at tier 1, 420-436 at tier 40 (depth 900). A run's time also swings with the
biome's monsters: a tier-1 normal had 0.9e12 to 1.05e13 life across the runs (the archetype's life multiplier).

Auto-play: a third card in `askDest` (`'rift'`): "Abyssal Rift · Tier N"; `riftReady(T)` = `riftLevel(T) <= level + 2`,
`riftTier()` = the highest open tier the hero is ready for. In a rift it hunts the whole level (`huntGoal` treats it as
farming), and once the Guardian stirs it **rushes** to the arena (`riftRush`): no loot, and it fights only the Guardian or
what blocks the way (no ground gained on the path for 1.5 s), so the chasers follow it in; in the arena it fights the
Guardian like a BOSS ROOM boss. Healthy and barely hurt, it stops side-stepping telegraphs for 4 s after 2 s of it (the
Breach's bravery, quicker on the clock). It takes the exit as above. It never chooses Heresies and never opens Velscour
Unbound.

## 3. Velscour Unbound (`src/game/unbound.js`, additions to `src/game/velscour.js`, `src/data/relics.js`)
Three **Abyssal Keys** (`c.keys`, a counter; a ground item `GroundItem(x, y, 'key')` drawn as a cyan key glyph, picked
up by `Player.pickup` → `c.keys++`, `endgame().keysFound++`) open the rematch. They drop from BOSS ROOM bosses past depth
600 (chance `0.06 + 0.002 * (depth - 600)`, capped 0.25, only with Heresy rank >= 10) and from rift guardians (`0.12 +
0.005 * tier` from tier 10, capped 0.5). `keyChance(world, m)` (read by `loot.dropLoot`) rolls **once per boss** (`m._keyRoll`:
`dropLoot` runs three times for a BOSS ROOM boss), never for the court; `G.forceKey = true` (tests only) makes the key
certain wherever one can drop. A key on the floor never fades (the 120-s rule skips it) and auto-play walks to it.
`unboundReady(c)` = keys >= 3 and the Endgame unlocked. The altar panel and the skull's message box ("unbound") start it:
`game.enterUnbound()` spends the keys and builds the throne at `D = max(FINAL_DEPTH, c.depth)` with `G.unboundNext =
true` (consumed by `buildDungeon`: `world.unbound = true`, `world.practice = false`); `c.depth` is untouched; the hero is
set down in the arena like `finalBoss()` (the court's art is loaded with the level). In Unbound `onBossKilled` opens the
exit ('Exit — to town') but changes no `cleared`/`deepest` and shows no victory screen; the exit and the town portal lead
to town only. Death (`game.unboundDeath`): the death screen ("on Velscour's throne"), back to town, no Defiance, the
keys stay spent.

`setupVelscour(world, m, gen)` reads `world.unbound` and calls `setupUnbound(V)` which adds, on top of the five phases
(dials in `UNBOUND`, `src/game/unbound.js`):
- **The Court of the Abyss**: two of the signature raid bosses (`RAID_BOSSES` with `sigs: true` but the Pipe Organ, whose
  Danse Macabre wants a square hall: in the oval with its lava auto-play dodged it for 14 minutes; never the same two, never
  the last fight's pair: `c.unbound.court`) made by `makeRaidBoss(world, ARENA, depth, his level, { tpl, art, court: true,
  hp: 1.2, dmg: 0.8 })` over `ARENA = { x: 6, y: 4, w: 32, h: 27, cx: 22, cy: 17.5, gate: { x: -40, y0:
  -40, y1: -39 } }` (the gate off the map: their seal blocks nothing). The first steps out at the east guard post [31,
  13] when he rises (`begin`), the second climbs out of phase 3's first hellgate (the Legion's first call in Crown of
  Hellfire opens it instead). They run their own `Raid` loop awake from the start, with no execute clock (`execT =
  Infinity`) and no enrage (`enrage` is a no-op: his 20-minute clock is the only one), in three phases (their first, second
  and last: two ward interludes, not three), casting at 1/1.6 of their pace while he fights too (phases 1, 3, 5: both
  sets of hazards at once left auto-play no ground, Ser Valdric beside the lava lived 14 minutes); a courtier that strays
  out of the arena, or into phase 3's lava where a melee hero won't follow, for 1.5 s is set back at its post. In
  the Seals and the abyss the seals, their Wardens and the Heart Shards carry `raidPriority` 9-9.5 and the court drops its
  6 to 0, so auto-play breaks the timed objectives first (the courtier at hand used to win over a seal ten tiles off). Their `raid.onDeath` is replaced (`courtDeath`): wards and adds die, two
  `dropLoot`s, the hero's sunder/polarity multipliers reset, but `w.darkK` stays (the abyss owns the dark; in phase 4 it is
  held at 0.93 every frame). They are never `world.boss`/`world.raid` (the HUD shows him; they carry the life bars of any
  monster) and `onBossKilled` returns on `m.raid.court`. `raidPriority` 6: auto-play kills them first.
- **The Pact**: while a courtier lives Velscour takes 40% of every hit (`m.ward = 0.4`, cyan tethers from them to him; the
  boss bar shows it warded and "Pact: slay his court") **and his damage cap refills at 40% of its pace** (`unboundTick`
  drains 60% of the refill from `V.bank`; `absorb()`, `pace()` and `PACE` are untouched). Without the second half a hero
  far over the cap (2.5x it, as the test hero is) never felt the Pact: Velscour reached 80% while his first courtier lived.
- **Abyssal Crown**: APOCALYPSE leaves two safe circles instead of three; the abyss drifts four Heart Shards at -4% each.
- **Unbound Chains**: after the first binding breaks (at 10%) the life gate stops at 5%, where he binds himself to four
  fresh obelisks (`V.bound2`); only then can he die. In Unbound an obelisk holds 3.5% of his life (2% in the plain fight).
- His life x2.4 on top of `HP_MUL` (4.8), his hits x0.85 (instead of `DMG_MUL` 0.7), the clock 20 minutes
  (`V.enrageT`, the label's clock reads it); `PACE` as is. All dials are `UNBOUND` in `src/game/unbound.js`.

Measured (`node tools/tests/unbound.js autoonly [runs]`: auto-play, god mode, a paladin at level 259 in the best of 60
item level 262 drops a slot, +8, gems, from a fixed seed; `gear=5` the best of 5; `original` the plain fight): the plain
fight 5.0-6.2 minutes (it sits at the damage cap: 20% of his life in 45 s). Velscour Unbound as shipped: 6.2-12.8 minutes
(mean 7.6, median 6.9, 10 fights) for that hero, 8.3-13.5 (mean 10.1, 4 fights) for the weaker one; a courtier lives
35-260 s, mostly 50-100 s, two thirds of it in its two ward interludes; the long fights are a first courtier that a melee
hero struggles with (Ophaniel's gaze, Thessaly's trumpet: 200-340 s). On the way (about 90 fights): the brief's dials
(x1.3, court 0.55, four phases, the Pact on hits only) gave 8.0-16.6 (a third interlude, and a Pact that never bound a
hero over the cap); three phases alone 5.0-8.0; the Pact on the cap with the court at 1.25-2.2: 6.0-10.9 plus two
22-minute deadlocks (Valdric and the Organ in phase 3: fixed by the cast pace, the lava rule and leaving the Organ out);
x1.3 -> x2.4 and the 3.5% obelisks each added 0.3-0.5 minutes; court x1.6 instead of x1.2 only lengthened the tails.

On his death (`unboundSpoils`): the court falls with him (no loot), the usual hoard, **3 open Abyssal items**
(`UNBOUND.abyssal`), **20 Infernal Marks** (`UNBOUND.marks`; both since Oct 30, 2026), plus **one Unbound Heirloom**
(one the Codex lacks while any is missing, then `makeHeirloom(lvl, { unbound: true })`, one of the four) and, the first win always (`c.unbound.wins === 0` then) and
then one in four, **the Crown of the Demon Lord**, both open (never sealed); the Codex notes them on pickup.
`c.unbound = { wins, best (seconds), court }`, `endgame().unboundWins++`.

| Unbound Heirloom | slot | power |
|---|---|---|
| Crown of the Demon Lord (`crown_demon`, only by its id) | head | `demonlord`: +2 All Skills, +25% damage to bosses; a Pit Demon of the Legion (a permanent summon, `relicprocs.js pitDemon`) climbs out of a hellgate at the hero's first blow, cast or wound in a level, follows him from level to level, hits for 60% of his recent hit, leaves when the Crown does, returns 20 s after it falls |
| The Abyssal Edge (`abyssal_edge`) | weapon (sword) | `abyssal_edge`: hits have a 15% chance to tear a void rift at the target for 200% of the hit as Shadow (proc fx `void`) |
| Mantle of the Unbound (`mantle_unbound`) | body | `unbound_mantle`: 12% damage reduction; immune to the abyss's dread (legendary flag `dreadless`) |
| Seal of the Pit (`seal_of_the_pit`) | ring | `pit_seal`: +1 Pierce, +20% critical damage; slain demons heal 2% (proc `only: 'demon'`) |
| Heart of the Abyss (`heart_of_the_abyss`) | offhand (orb) | `abyss_heart`: +15% damage; casts have a 10% chance to drop three meteors (proc fx `stars`, `n: 3`) |

All five have `unbound: true` (minIlvl 250, lines worth ~4.6-4.7 core lines, rings 2.9): `makeHeirloom` leaves them out
unless `opts.unbound` (the Crown, `crown: true`, only by `opts.id`), so `maybeRelic` never makes one; `CODEX_TOTAL.h`
counts them (41).

## 4. Infernal Marks (`src/game/marks.js`, `src/ui/marks.js`)
Account-wide, endless. A Mark is earned by **XP past the level cap** (`Player.gainXp` at `MAX_LEVEL` hands the XP,
after the out-levelling penalty, to `gainMarkXp(xp)`; one Mark costs `markXp() = xpToNext(MAX_LEVEL)`;
the 2999 -> 3000 level's spare XP counts; the cap was 600 until October 30, 2026), by **rift clears** (`riftMarks(tier)`) and at **Heresy rank 20** (one per
depth cleared). A Mark is saved at once (a float text "+1 INFERNAL MARK" over the hero, a ring, a chime and a log
line); XP alone at most every 5 s and on `game.autosave` (`saveMarkXp`), so nothing is lost to a reload. At the cap
the HUD's XP bar turns ember red and shows the progress to the next Mark (`capXp(c)`), and so does the character
sheet's XP line. Four categories, points spent one at a time in the Marks panel (from the
altar, the character sheet's "Marks" button and the skull's "marks"); "Spend all (balanced)" and a free "Reset".
Bonuses diminish but never stop: `eff(n) = 140 * (sqrt(1 + n / 100) - 1)` (58 at 100 points, 102 at 200, 203 at 500,
324 at 1000); the n-th point adds `1 / sqrt(1 + n / 100)` of the first's worth (`worthNext`: half at 300, ~30% at 1000).
It was `100 * (1 - 0.993 ** n)`, a cap: a player's 454th Vitality point read "+0.00" (October 30, 2026). Then
```
life +0.4% more x eff    crit +0.06 x eff (inside the 75% clamp) and +0.5% critical damage x eff
mf   +0.25% more drops x eff    rift +0.3 s x eff
```
Vitality is a multiplier of its own on `maxHp` (after gear's life %, Defiance and Fortitude), and Fortune (key `mf`, kept for
saved records) is `st.drops`: `dropLoot` multiplies a kill's gear and gems by `1 + drops / 100` (rounded at random) and
the Sigil chance by it, like the Greed lever. As plain life % and magic find they were lost beside gear's hundreds and
thousands of percent (a player's report, October 30, 2026).
`markBonuses()` → `{ life, crit, critDmg, mf, rift }`; `Player.recompute` multiplies maxHp by `1 + life / 100`, adds crit
to `critChance` (inside the 75 clamp; past it, like all crit chance, 2% critical damage per 1%: `CRIT_OVER`) and critDmg to `critDmg`, and sets `st.drops = mf`; `riftTime()` adds rift. Measured
(`marks.js`): 100 points = x1.232 maxHp, +3.48 crit and +28.99 crit damage, +14.5% drops, +17.40 s; 500 Vitality =
x1.81; the 454th Vitality point +0.12%; 1000 Fortune: 300 champions dropped x1.74 the items (+81%). The character sheet shows "Infernal Marks: 37 (12 free)" and an
"Infernal Marks" button; the Quest Log a line; the panel (`ui/marks.js`, two columns on touch) shows the total, the free
count, the XP towards the next Mark, and per category its points, bonus, a bar of how far the next point's worth has fallen, +1/+5/+25, then
"Spend all (balanced)" and "Reset (free)". `grantMarks(n, why)` logs. Unspent Marks sit in `pts - sum(spent)`.
Cloud: in the account record (above), merged three ways so Marks earned on two devices add up.
Rate (`marks.js`, a level-3000 hero full-clearing a level): 0.04 Marks per depth at depths 6000-6560 (he out-levels the
monsters: XP x0.1), 0.39 at 6600 (monster level 3003), 0.40 at 6800; Heresy rank 20 adds 1 per depth; a
rift clear `ceil(tier / 10)` (was tier / 4, 18 a clear at tier 70: rifts dwarfed XP and the Heresies; now 1 a clear to tier 10, 3 at tiers 21-30, where a hero of the tier's level meets the wall).

## Balance targets (checked by the tests and tools)
- Heresies at full rank (26): x1.52 loot, +104% magic find, +52% XP, Sigils x3.5 (x2.3 x the x1.52 loot), relics x2.04;
  a normal with Iron Hide + Cruel Hand takes ~4.5 s and hits for ~1.3x; Twinned Packs double the crowd. `heresies.js`
  measures a depth-520 level: monsters, affixes, dials, frame cost, auto-play's kill pace, survival (above).
- Rifts (`rift_balance.js`, the endgame.js model fitted on auto-play runs): a geared hero of the tier's level clears it in
  50-70% of the 7-minute clock (quota ~2 minutes, the Guardian ~1) up to tier ~20, where the Endless Torment's wall
  begins; a full-clear hero takes tier 1 in under 60%; a level-273 hero can't touch tier 40. Ten levels under, the clock
  bites for gear-driven classes (paladin) from tier ~10, not for the wizard. `rifts.js`: auto-play clears tier 1 at
  depth-500 gear in god mode under the limit (27-96% of the clock across runs, the biome's monsters decide most of it).
- Marks (measured under the old capped curve and the level-600 cap; `endgame.js paladin,wizard 8 marks=0,300,1000,1000L`: the same geared heroes measured at each count): at
  depth 1200, 300 Marks spent balanced (+12.3% life, +4.1 crit) give life x1.11-1.12 and a BOSS ROOM in x0.95-0.99 of
  the time; 1000 (+24.8%, +8.3) life x1.22-1.25, ROOM x0.91-0.99; 1000 all on Vitality life x1.26-1.30, ROOM x1.00.
  The wall is the kill time (ROOM ~460-560 s at 1200) and it holds. A normal's hit is 3-5% of a capped hero's life
  even with no Marks (2-4% with 1000), so "15%+ of life" was never the baseline; Marks cut it by at most a fifth.
- Unbound: `unbound.js` steps every phase and auto-play wins at depth 500 in god mode in 7-12 minutes (measured 6.2-13.5,
  mean 8.3 over 14 fights; the plain fight 5-6).
