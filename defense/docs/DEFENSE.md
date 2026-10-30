# VELSCOUR DEFENSE

A second game in the VELSCOUR universe: a free-to-play (no purchases of any kind) character tower defense with
Rift Card packs, modelled on the mobile game **Fantasica** (Silicon Studio / DeNA Mobage, 2011-2018) and drawn in
VELSCOUR's isometric pixel art. You reach it through **the Riftgate**, a blue-black portal across the square from
the dungeon portal in Herrington Hollow, or directly at `defense/index.html`.

## Kept apart from the main game
- Everything lives in `defense/`: its own page (`defense/index.html`), stylesheet, modules (`defense/src/`), data,
  tests (`defense/tests/`) and tools (`defense/tools/`). It never imports a main-game module.
- It reads VELSCOUR's **art and sound files** in `assets/` (read only). The few things it needs from the main game's
  `src/data/` (class names and colours, the 69 palette finishes, each class's held-gear sets and design names, the
  690 painted monsters, 400 of the Bard's 2,000 two-bar melodies) are snapshotted into `defense/data/art_index.json` by
  `node defense/tools/art_index.mjs` (re-run it when the main game adds classes, finishes, held designs, monsters).
- Its own save, `localStorage['velscour_defense_v1']`; the main game's `velscour_saves_v1` / `velscour_settings_v1`
  are never touched.
- The main game's only changes: `src/gfx/riftgate.js` (where the Riftgate stands, how it is drawn), two lines in
  `src/game/game.js` (`enterTown` adds it as `world.portals[1]`, after the dungeon portal that auto-play uses, and
  `confirmRiftgate`), one line in `src/game/render.js` (`drawPortal` hands `p.riftgate` to `drawRiftgate`), and the
  test `tools/tests/riftgate.js`.

## What Fantasica gave it (research: 5 gameplay videos, the Fantasica wiki, Gamezebo, Siliconera)
- One fixed screen per battle, a visible road, monsters entering from rift tears and walking to what you defend.
- Heroes are **towers**: no life bars, nothing blocks, the horde walks past them; melee heroes are short-range and
  hit hard, ranged reach far, magic splashes. Most melee heroes cannot hit flyers (Fantasica's Land/Air split).
- **Unit Pts** (here *Valor*): a regenerating budget that pays to deploy, plus a per-stage **Deploy Limit**.
- Placement is **tap a post, see the range circle, confirm** (or tap a hero, then a post).
- **Call Ally** becomes the **Rift Ally**: a guest hero each stage, outside the Deploy Limit.
- Skills fire on their own; stages score by **% of the horde destroyed** ("Complete Victory!" at 100%).
- A free pack every day, published odds, a pity counter; duplicates strengthen what you have.
- Left out on purpose: paid currency, paid-only items, stamina, cooldowns sold as skips, PvP theft.

## The game
- **Campaign:** five acts, 30 regions x 10 stages, 300 stages (`data/campaign.js`, `ACTS`, `actOf`). Act I, The Riftgate
  (1-80): Herrington Outskirts, the Catacomb Breach, the Ashen Cathedral, Frostfang Pass, the Sea of Sand, the Dark
  Forest, the Siege of Ironcrown, Beyond the Riftgate. Act II, The Six Scars (81-140) and Act III, The Breach (141-200):
  the Drowned Sewers, the Glasswind Dunes, the Bone Orchard, the Hoarfrost Citadel, the Sunken Temple, the Caldera,
  the Veilscar March, the Abbey, the Mirefen, the Foundry, the Eternal Breach, the Screaming Throne. Act IV, The Descent
  (201-250): the Ashen Road, the Hollow Deeps, the Crystal Galleries, the Drowned Kingdom, the Bonefields of Morrow.
  Act V, The Demon Lord (251-300): the Gate of Teeth, the Burning Archive, the Garden of Hooks, the Last Rampart and
  Velscour's Hall, where Velscour's Shadow waits. Every 5th stage brings a lieutenant, every 10th a boss, every 8th
  (from Act II) a named warlord, and from stage 61 roaming warlords walk ordinary stages too: all painted VELSCOUR
  giants named for the art they use. Each stage opens when the one before it is won.
- **5,000 waves:** Act I's 80 stages share waves 1..1000 (6 to 19 a stage), Acts II-III the next 2,000 (14 to 19),
  Acts IV-V the last 2,000 (18 to 22). Every wave's horde is a little stronger than the last (`data/waves.js hpMul`,
  eased across each stage from `data/curve.js`).
- **Every monster in VELSCOUR marches:** `buildRosters()` hands out the 690 painted monsters once, in stage order, with
  a usage penalty, so all 690 appear across the 300 stages (each region still keeps its own taste: elements, undead,
  demons, families). The Bestiary pack draws from the ones you have met.
- **40 battlefields** (`data/maps.js`), drawn as ASCII: roads, rift tears, the Heart, posts, raised posts, high ground,
  water, props. Stages 1-30 open a new one each; later stages replay them flipped, mirrored and turned (`T`, `F`, `V`
  and their mixes, `stageMapRef`), in their own region's tiles, with posts topped up to the stage's need
  (`battle/map.js`); no two of the 300 stages share a field and orientation. A higher post reaches further.
- **Battle** (`battle/sim.js`, pure, runs in Node too): 12 monster roles (grunt, runner, flyer, brute, shaman,
  juggernaut, warded, hexer, splitter, shieldbearer: 30% less damage to foes beside it, blinker: jumps down the road,
  burrower: under the ground and immune to all but poison and fire for 2 s) plus captains (painted bosses that hurry
  the horde around them), warlords, lieutenants and bosses (roars that stun heroes, summons, enrage). The Heart has
  cracks to lose; leaks cost them. Per-class attacks and 16 charge-up skills (Dawnbreak, Rain of Arrows, Meteor, Raise
  the Legion, Whirlwind, Dragon Dive, Thunder Totem, Obliterate, Supernova, Murder of Crows, Crescendo, Gelatinous Wall,
  Eclipse Rang, Phalanx Charge, Wyrmfire, Cannonade). **The Bard plays music only in Crescendo** (32 s charge).
- **Zoom:** pinch with two fingers or roll the mouse wheel to zoom (about 0.6x to 3.2x of the fitted view), drag to pan,
  double-tap or double-click empty ground to fit the field again (`BattleView.zoomBy/panBy/resetView`).
- **In-battle upgrades, gone when the battle ends:** Empower a deployed hero (battle levels 2-5) and three Bastion
  works (War Drums: Valor regeneration; Heart Ward: +5 Heart; Rally Standard: +attack for everyone).
- **Permanent upgrades** (`meta/upgrade.js`): hero levels (gold) up to a cap of 30-60 by rarity plus 10 a star;
  **ascension** to 5 stars and then **Awakening** to 10 stars, both paid in **essence** (+15% attack and +10 to the
  level cap every star; an awakened Legendary reaches level 140, a Mythic 150; awakened stars show crimson); gear
  cards (equip; refine +1..+5 with essence; spare copies salvage into essence); **trophies**; and the Bastion Works
  research (`meta/research.js`, gold).
- **Essence** comes from duplicate heroes and trophies, salvaged gear, battles, the bounty, quests, the login and the
  Modes. **Rift Seals** (`meta/seals.js`, 40 at most, one back every 30 minutes) make a battle pay in full (gold,
  shards, essence, trophy drops); without one a battle pays a seventh of its gold (first clears always pay). Play is
  never blocked, only farming is: this is what turns a day of grinding into weeks.
- **Trophies:** a card for each of the 690 monsters (`x:` cards). One drops now and then when you kill that monster
  in a battle fought with a Seal (bosses, warlords and captains far more often), or comes in a Bestiary pack. Each adds
  damage against its family (skeletons, knights, demons...), up to +25% a family; the Trophies tab shows the totals.
- **Bastion's Resolve:** each defeat in a row at a stage gives +4% attack there (up to +60%) until it is won, so a stage that is a wall for your particular heroes gives way in a few days.
- **Heroes:** 96 named heroes, 6 per class (`data/heroes.js` + `data/heroes2.js`): the **Bastion Sixteen** (`data/cast.js`,
  the story's cast) plus a Rare, two Epics, a Legendary and a Mythic per class, each with its own trait (all traits
  are live in the sim: auraAtk lifts heroes around them, steadfast ones are never stunned). Four start with you; the
  rest of the Sixteen join as the story reaches them (`RECRUITS`).
- **Cards** (`data/cards.js`, 3,106): 96 heroes; each class's 50 weapon and 50 off-hand designs; its 26 armors and 15
  helmets; 64 relics (`data/relics2.js` adds 40); 690 monster trophies. Gear changes the hero's stats *and* looks.
- **Card faces** (`cards/cardart.js`): a collectible-card-game layout; trophies show the painted monster on a red ground.
- **Packs in 3D** (`cards/pack3d.js`): the foil booster torn open, cards rising and flipping one by one, a foil shader;
  revealed cards are laid out in the grid that shows them biggest on the screen (2 x 3 on a phone held upright), and
  the pack, the card being revealed and the inspector all scale to fit a narrow screen.
- **The Summoning Altar** (`meta/gacha.js`): Rift Summons (heroes), Armory, Nocturne Forge, Reliquary, Bastion
  Booster, **Bestiary Booster** (4 trophies from monsters you have met) and a free Daily Rift Pack. Odds on every pack.
- **Rewards** (`meta/rewards.js`): a 7-day login calendar (gold, shards, essence, Seals, packs, tickets), an hourly
  bounty (up to 12 hours), four daily quests and 71 achievements (stages to 300, waves to 5,000, Endless Siege
  records, Gauntlet wins, trophies, heroes, cards). **Red dots** (`meta/badges.js`) mark every menu with something waiting.
- **Story:** 584 dialogs. Act I has 320, 20 led by each of the Sixteen, two at the beginning and two at the end of
  every stage (`data/dialogs/part1-4.js`). Acts II-V have 264, at the start and end of every region and its key
  stages (`part5-12.js`). The bible is `docs/STORY.md`; the schedules are `docs/dialog_schedule.json` and
  `docs/dialog_schedule2.json`.
- **Phones:** portrait and landscape both fit (`tests/iphone.js` checks every view at 390x844 and 844x390): safe-area
  insets for notches, the battle HUD in two rows with the Bastion works over the tray when the phone is upright, the
  topbar's title dropped below 480 px so the currencies fit.

## Modes (side battles for currency and pulls)
`meta/modes.js`, the **Modes** tab (`ui/modes.js`). Every mode is made at the strength of your campaign frontier
(its `tier` x the frontier stage), on the battlefield of a stage just behind that strength (a different one each
day) with that stage's own terrain factor, so it stays worth playing at every point of
the game, and a Commander stuck at a wall still earns. They open as the campaign goes on.

| Mode | Kind | Opens | What it is | Pays |
|---|---|---|---|---|
| Endless Siege | endless | 6 | the horde never stops, +3.5% a wave | gold, shards, essence a wave; a Hero Ticket for every new 25-wave record |
| Horde Tide | endless | 16 | runners, flyers and blinkers, 2.2x the count | mostly shards |
| Boss Rush | endless | 31 | a giant every wave with its court | essence; trophies 3x as often |
| Shifting Rift | endless | 51 | every 5 waves a mutation that stacks (Swift, Armoured, Warded, Swarming, Hardy, Shielded, Restless, Burrowing) | everything, +15% a mutation |
| Gilded Vault | 3 a day | 11 | 8 waves | gold |
| Essence Well | 3 a day | 11 | 8 waves | essence |
| Shard Storm | 3 a day | 21 | 8 waves | shards, 10% a Hero Ticket |
| Class Trial | 2 a day | 26 | 10 waves, only today's four classes | shards and a Hero Ticket |
| Trophy Hunt | 2 a day | 41 | 10 waves of today's monster family | gold, essence, trophies 10x as often |
| The Gauntlet | 1 a week | 21 | 15 waves at 80% of your frontier's strength, two fewer heroes, no Rally Standard | a Legend Ticket, 400 shards, 300 essence |

An endless run spends one Rift Seal for full pay (a run without one is training: 15% of the pay, no tickets); the
challenges are free with their own daily and weekly entries (UTC days, ISO weeks). Endless runs end when the Heart
breaks or you end the run from the pause menu; every wave held pays. The sim grew `more` (an endless wave maker),
`noRally`, `wavesCleared` and per-group modifiers (`hpK`, `speedK`, `defK`, `res`, `shieldAll`, `blinkAll`, `burrowAll`).

## Auto-play
- **AUTO** in battle (`battle/autoplay.js`): deploys the best hero on the post where it does the most good, holding
  every road (each road's cover has diminishing returns, and short roads count as more dangerous, so a field with a
  long road and a short one gets defenders on both), saves for the first heroes, empowers the heroes doing the work,
  buys War Drums / Heart Ward / Rally Standard, and calls waves early when the field is clear.
- **Auto-campaign is gone:** auto-battle plays a battle and the Commander chooses what to play next. The Squad
  screen's auto-upgrade (`meta/autopilot.js upgradeCharacters`) equips gear, ascends and awakens the front line with
  essence, refines worn gear and levels heroes. **It never spends Soul Shards or tickets, never opens packs, never
  salvages and leaves the Bastion Works alone**; those are the Commander's.

## Difficulty (how the curve was set)
The game is fitted to a **calendar**, not to a number of battles: Rift Seals (one every 30 minutes) and essence decide
how fast a squad grows, so playing all day helps far less than playing every day.

`node defense/tests/calibrate.mjs 0.9` lives through the calendar as a simulated dedicated Commander
(`tests/commander.mjs`: 60 battles a day, Seals by the clock, the login calendar, bounty, quests, free pack, the side
modes, packs bought with what it earns, a third of its gold on the Works, the squad upgraded by the auto-pilot). By the
end of day d it has cleared the stages `SCHEDULE` says (day 1: 40, day 3: 70, day 7: 100, day 14: 130, day 28: 165,
day 42: 195, day 56: 225, day 70: 250, day 90: 275, day 120: 300), farming with its Seals the rest of each day. Each
time it first reaches a stage it measures, on two seeds, the biggest horde multiplier its squad still beats solidly
(90% destroyed, auto-play), and the stage's target is 90% of their geometric mean (eased for stages 1-50: the quick
start). The targets become:
- a smooth, always rising `CURVE` (every wave stronger than the last);
- a `TERRAIN` factor per stage: each **map's** own difficulty (from every stage fought on it; the same for any squad,
  so it applies in full) times a little of the rest of the stage's quirk (mostly the calibration squad's, so only
  `^0.35` of it).

Both go to `data/curve.js`; the raw margins go to `tests/margins.json`, so `calibrate.mjs 0.9 --refit` redoes the
fit in a second without the battles (about 12 minutes otherwise).

`node defense/tests/balance.mjs [profiles] [days]` checks it with **real battles**: a casual (20 battles a day),
dedicated (60) and grinder (all day) Commander each play every day from a fresh save. Last run:

| Day | 1 | 3 | 7 | 14 | 28 | 42 | 56 | 70 | 84 | end |
|---|---|---|---|---|---|---|---|---|---|---|
| calendar | 40 | 70 | 100 | 130 | 165 | 195 | 225 | 250 | 268 | 300 on day 120 |
| casual | 18 | 37 | 59 | 94 | 158 | 201 | 231 | 259 | 277 | **won on day 104** |
| dedicated | 29 | 80 | 128 | 161 | 187 | 225 | 240 | 259 | 267 | 280 on day 89, not won by 120 |
| grinder | 20 | 59 | 134 | 172 | 230 | 259 | | | | (run to day 45) |

Nobody gets near the end in a day (18-29 of 300) or a week (59-134); the first days run fast, the acts after the
first get harder, and from about stage 220 a squad stalls for a few days at a time and has to grow (Awakening, the
Forge of Valor, trophies, better cards) to go on. Which stages stall depends on which heroes you pulled; Bastion's
Resolve (+4% a defeat, to +60%) breaks a wall in a few days.

What the balancing found and fixed: a squad that maxed out by day 25 with essence piling up (fixed by Awakening to 10
stars and the Forge of Valor to level 120 as the gold sink); armour that grew with every wave so physical heroes did
5% damage late while magic did full (armour now slows after Act I); auto-battle leaving a short road unguarded (it
now holds every road); Standing Stones (four 12-tile roads) and other hard maps walling particular squads (the per-map
terrain factor); side-mode battles on a random field with another stage's terrain factor (they now use a stage's own
field).

`node defense/tests/modes_smoke.mjs [days]` plays every mode once after a Commander's N days. At day 30 (stage 179):
the endless runs hold 35-120 waves, every challenge is won.

## Tests and tools
```bash
node defense/tools/art_index.mjs           # snapshot of the main game's data the Defense page uses
node defense/tools/dialog_schedule.mjs     # who leads each dialog (Act I: 320; Acts II-V: docs/dialog_schedule2.json)
node defense/tools/check_dialogs.mjs       # every dialog: schedule, speakers, lengths (584)
node defense/tests/calibrate.mjs 0.9       # refit data/curve.js to the calendar (about 12 minutes); --refit: from tests/margins.json
node defense/tests/balance.mjs             # casual, dedicated, grinder Commanders play real days (DUMP_AT=day saves a save)
node defense/tests/modes_smoke.mjs 30      # every mode after 30 days
node defense/tests/diag_save.mjs out/save_casual_80.json 276,277 3   # why a stage walls a dumped save: wins, leaks by road
node defense/tests/diag_stage.mjs 289      # a maxed squad against a weak horde: a stage that can't be won at all
node defense/tests/defense.js [mobile]     # browser: menus, stages of all five acts, three modes, wheel zoom, 3D packs, inspector
node defense/tests/iphone.js               # browser: every view fits an iPhone in portrait and landscape (touch)
node defense/tests/maps.mjs                # every stage's map: routes from each rift to the Heart, spare posts by the road (no browser)
node defense/tests/perf.js [stages] [portrait|landscape] [throttle]   # browser: frame cost of a battle on a slowed phone + CPU profile
node tools/tests/riftgate.js [seeds]       # the main game: the Riftgate in town, through it and back
```
Serve the repo root first. Screenshots go to `defense/tests/out/` (git-ignored).

## Not done / worth knowing
- Monsters have one pose each (as in the main game); walking is a bob and squash. Heroes too.
- Real phones and Safari/iOS were not tried (Chromium with an iPhone viewport and touch); three.js loads only for the
  pack and inspector screens.
- The difficulty was fitted to auto-play and checked with one Commander per profile; human players who place worse
  lean on Resolve, replays, the Modes or AUTO, and luckier or unluckier pulls move the dates by a few weeks.
