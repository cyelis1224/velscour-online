# VELSCOUR: notes for Claude sessions

An isometric, retro pixel-art action RPG in the style of Diablo II, played in the browser on **PC and mobile**.
It is plain JavaScript ES modules and Canvas 2D, with **no build step and no dependencies**. GitHub Pages serves it
straight from `main` at https://agilancer.github.io/velscour/.

**Start every session by reading [`docs/HANDOFF.md`](docs/HANDOFF.md).** It holds the user's full original
requirements, current status, open issues, the next steps, and a subsystem reference.
This file only covers the essentials.

**VELSCOUR DEFENSE** (`defense/`) is a second, separate game: a Fantasica-style tower defense with Rift Card packs,
reached through the Riftgate in town (`src/gfx/riftgate.js`). It has its own page, modules, save
(`velscour_defense_v1`), tests and docs (**[`defense/docs/DEFENSE.md`](defense/docs/DEFENSE.md)**); it reads `assets/`
but never imports `src/`. Keep the two apart: main-game work should not touch `defense/`, and Defense work should not
touch `src/` beyond the Riftgate hook.

## Run it
```bash
python3 -m http.server 8123          # from the repo root; ES modules need http, not file://
# open http://localhost:8123
```
Debug hook in the browser console: `window.VELSCOUR = { G, game }`. `G` is the global state (`G.char` is the save
data, `G.player`, `G.world`, `G.ui`, `G.settings`, and `G.godMode = true` to make the player take no damage) and `game` (also `G.game`) is the flow controller
(`newChar`, `buildDungeon(depth, biome)`, `enterDungeon`, `enterTown`, ...). From `page.evaluate` you can
`await import('/src/...')` any module and get the same instances the game is using.

## Test it
Headless Chromium tests live in `tools/tests/`; see the header comment of each file. Start the server above first.
```bash
export NODE_PATH=/opt/node22/lib/node_modules     # where playwright is installed in Claude cloud containers
node tools/tests/data_check.mjs                    # skill data sanity check, no browser (fast)
python tools/tests/chatgpt_art.py                  # ChatGPT art kits (and Grim Nocturne pixel-locked imports) round-trip, no browser
node tools/tests/lancer_shields.js                 # Lancer 3D shield models (built from the turntables), turntable + all-rings shots, in-front/behind QA
node tools/tests/lancer_banner.js                  # Lancer cloth banner: skin/pole sizes, hangs still, trails in 4 directions, Valor + run shots
node tools/tests/town.js [seeds]                   # random towns: vendors/portal reachable + screenshots per seed
node tools/tests/townlife.js [events|none]         # town life: arrival by the portal, quiet start, bubble budget, ~35% events, all 19 events, animals, auto-play audience with the royals, emotion sheet
node tools/tests/townsfolk.mjs                      # People and Animals sheets (256x200 cells), 47 people + 10 animals, scripts fit their bubbles, no browser
node tools/tests/homunculus.mjs                     # the blacksmith: 2,000+ lines fit, 30 poses, axe story told in full (simulated visits), no browser
node tools/tests/homunculus.js                      # the blacksmith live: bubbles at the real font, auto-play chat at the forge, the axe speaks, townsfolk hails, anvil, shots
node tools/tests/encounters.js [kinds]             # dungeon encounters with people (captive, knight's last stand, peddler, wizard, witch, Greener) + rats
node tools/tests/rings.js                          # ring augments in a live dungeon, skill mastery, ring/forge UI shots
node tools/tests/flow.js                           # town -> portal -> boss -> exit -> depth 2 -> death -> reload
node tools/tests/riftgate.js [seeds]               # the Riftgate to VELSCOUR DEFENSE: placed in every town, through it and back
node defense/tests/defense.js [mobile]             # VELSCOUR DEFENSE (its own game, defense/docs/DEFENSE.md): menus, stages of all 5 acts on auto, modes, zoom, 3D packs
node defense/tests/iphone.js [portrait|landscape]  # Defense on an iPhone-sized touch screen: every view fits (cards, packs, inspector, battle HUD)
node defense/tests/balance.mjs [profiles] [days]   # Defense's calendar: casual/dedicated/grinder Commanders play real days of battles, no browser
node defense/tests/modes_smoke.mjs [days]          # Defense's endless and challenge modes, played headless after N days
node defense/tests/maps.mjs                        # Defense's 300 stage maps: every rift's route to the Heart, spare hero posts by the road, no browser
node defense/tests/perf.js [stages] [orient]       # Defense battle frame cost on a slowed iPhone-sized screen + CPU profile hot spots
node tools/tests/deathgift.js [classes]            # "DEATH IS THE ONLY WAY OUT, MY KIND SIR." to Velscour: level 350, Mythic +10 gear, depth 500; the hero is barred from the Honour Board
node tools/tests/stash.js                          # town storage chest: 300 slots, store/take, auto-play stashing
node tools/tests/vanity.js [mobile]               # vanity looks: head/body worn for looks only (no stats), Hide helmet, save round trip
node tools/tests/savesafe.js                       # unreadable saves never written over: set aside before the first save (localStorage or IndexedDB), downloadable, refused + warned when no room
node tools/tests/cloud.js [nosdk]                  # cloud saves (Google sign-in + Firestore): 4 devices on a fake Firebase (push, pull, conflicts, tombstones, offline, backups + restore, lost/corrupt/damaged saves change nothing) + real SDK smoke
node tools/tests/autoshop.js [classes] [rounds]     # auto-play wears everything it buys (none sold back), loot filter, keepers, chest sort
node tools/tests/autogear.js [mobile]              # "Auto-play manages gear" off (potions only, a full bag plays on), +N gear to the chest, vendor Sell all
node tools/tests/stalegear.js                      # auto-play swaps a stale +10 piece full of top gems for far better new gear, moving the gems
node tools/tests/ringloop.js [trials]              # auto-play never swaps rings (or other gear) back and forth: the reported pair + random bags settle
node tools/tests/relics.js                         # Heirlooms, Covenants, Sigils, Glyphwords (by hand and by auto-play), the shared Reliquary + Codex, Town Commissions (auto-play does a chapter)
node tools/tests/relic_balance.js [classes] [n]    # Heirloom / Covenant piece / full set worth in item levels, like rarity.js (Heirloom ~ Legendary, piece ~ Epic, set ~ five Mythics)
node tools/tests/velscour.js [noauto]              # Velscour's five phases stepped by hand + "final boss" from the skull, then auto-play beats him at depth 500 (5-10 min)
node tools/tests/heresies.js                       # the Endgame (docs/ENDGAME.md): the Altar of Heresy, every Heresy's effect on a level, the rank's rewards, auto-play under them
node tools/tests/rifts.js                          # Abyssal Rifts: the clock, the quota, the Guardian, collapse/death/win, tier jumps, the board's sorting, auto-play clears a tier (the honour board on a fake Firestore is cloud.js's scenario 17)
node tools/tests/rift_balance.js                   # rift tiers vs the clock for a hero of the tier's level (model, like endgame.js)
node tools/tests/unbound.js                        # Velscour Unbound: Abyssal Keys, the court, the Pact, every phase stepped, the Crown and Unbound Heirlooms, auto-play wins
node tools/tests/marks.js                          # Infernal Marks: XP past the cap, spending, the bonuses on the sheet, shared across heroes, the account record's cloud merge
node tools/tests/velscour_real.js [classes] [n]    # Velscour without god mode: depth-500 gear, wins / minutes / phase reached per class
node tools/tests/rarity.js [classes] [samples]     # gear rarity worth in item levels, level 25 Rare > level 10 Mythic, drop odds
node tools/tests/ui.js                             # skill tree, inventory, socketing, vendors
node tools/tests/macros.js                         # macros: several skills on one key (R E Y U O), Keep up, the panel, touch buttons (both orientations), save shape
node tools/tests/options.js                        # settings: lock skill bar, hide item names, auto skill points off; skill tree Respec (50 gold x level^2)
node tools/tests/mobile.js                         # 844x390 touch layout + joystick
node tools/tests/hud.js                            # HUD art: 15-slot bar keys, save migration, minimap ring, buttons, Quest Log, touch pages
node tools/tests/rims.js                           # monster rims (rank colours, green summons, gold hero), pet see-through walls, enlargeable target window
node tools/tests/seethrough.js [mobile]            # see-through outlines + life bars over spells/walls/darkness, every enemy's bar, wall-base lines, settings
node tools/tests/levelup.js                        # level-up banner: Velscour's 2,000 taunts, mood colours, no mood twice in a row, lines fit
node tools/tests/breach_dragon.js [parts] [floor]   # Eternal Breach wyrm: 7 colours, passes, bridge ambush, the fight (auto-play kills it), Heart gate
node tools/tests/boss.js                           # Depth 100 Velscour arena + a depth 37 guardian
node tools/tests/raid.js [5,30,55]                 # BOSS ROOMs: seal, every ability of all raid bosses, phases, wards, death
node tools/tests/raid_sigs.js [ids] [secs]         # the 20 signature raid bosses (raidsigs.js): cast all, shots, auto-play fights each
node tools/tests/arch3d.js [biome] [design]        # 3D-baked arches (docs/ARCH_3D.md) in a live dungeon: hero in front / under / behind
node tools/tests/rooms.js [biomes] [levels]        # shaped rooms + scatter set pieces: reachability, chests, screenshots
node tools/tests/wanderers.js [minutes]            # overworld townsfolk walk/flee, bounties taken and paid by auto-play
node tools/tests/biome_perf.js [ids] [depth]       # per-biome frame cost with auto-play on + CPU profile hot spots
node tools/tests/mode_cpu.js [modes] [secs]        # script cost of update (and render) per map/mode on a slowed phone (town, every overworld, Breach, rift, raid, velscour, unbound, 'dungeons' = every dungeon biome; PHONE=portrait): what inside costs most
node tools/tests/mobs.js [levels]                  # monster pathing: awake monsters + guardians must reach the hero (stuck <= 2%)
node tools/tests/bot.js paladin 2                  # bot plays depths 1..2, prints balance stats
node tools/tests/skills.js wizard,gunner           # cast every skill of a class (all 16 if no arg; slow)
node tools/tests/melodies.mjs                      # Bard's 2,000 melodies: unique bars, rules, combinations, two-hand arrangements, no browser
node tools/tests/bard.js [minutes] [mobile]        # Bard notation + music: glyphs, melodies engraved, harpsichord, Cadence/finishing-bar rules, shots, auto-play
node tools/tests/bard_listen.js [min] [secs]       # Bard music as played: no two bars at once, harsh intervals, fast figures, renders out/bard_listen.wav
node tools/tests/bard_dps.js [secs] [runs]         # Bard damage on dummies + Cadences/min, for balancing the measure
node tools/tests/musicsheet.js [min] [mobile]      # Bard Music Sheets: tab reader, buy/write/lock/load into Tabs, song order while casting, saves, auto-play keeps them
node tools/tests/astronomer.js [minutes] [mobile]  # Astronomer: icons, star chart/zodiac/Conjunction/Mirror rules, showcase shots, auto-play soak
node tools/tests/classart.js paladin               # class art pack: catalog weapons, ability effects
node tools/tests/lance.js [mobile]                 # Dragoon leaps: energy lance + per-skill trails, stepped frame by frame
node tools/tests/gear.js paladin,wizard            # hero looks: armor+helm per rarity, finishes, auras (all = 16)
node tools/tests/closed_helms.js all               # all 15 enclosed helmets on all 26 armors: face covered, centred, body untouched
node tools/tests/herolook.js all death_knight 8      # every armor/helmet/finish loads (3,009 per class) + hero visible every second of a soak
node tools/tests/heldgear.js [classes|all]         # held weapons/off-hands in play: every rarity, both facings, settings toggles, bag icons, ground drops
node tools/weapons3d_bake.js [sets,..|all]         # the game's held gear: 35 sets x 50 procedural designs (tools/weapons3d*.js) -> assets/sprites/held/ (sprites, palette masks, icons, sockets/effect points; lossless WebP via Pillow)
node tools/weapons3d_shots.js [classes|all] [seed] # review sheets: per class random heroes holding each rarity's designs with effects, art-review/weapons/
node tools/handheld3d_bake.js [N,..|all|classes]   # the held-gear rig's fitting sheets (tools/handheld3d.js, tools/handheld3d_kits.js): the Paladin attempts, every class's kit, art-review/handheld/
node tools/tests/walls.js walls catacombs,frozen  # screenshot wall runs/corners in those biomes (docs/ART.md)
node tools/tests/pack.js catacombs,blood          # biome pack levels: arches, doors, reachability; door/arch shots
node tools/tests/overworld.js                      # 60 outdoor seeds, 20 scenarios, forced scheduling, landscape previews
node tools/tests/scenarios.js [types|-] [castles|all] # a bot plays every Wilds/Castle scenario and Sea of Sand route to the end (Castle ones rotate through the variants)
node tools/tests/castle_overworld.mjs [seeds] [ids] # every castle variant x all 35 scenarios (+ seeds): curtains sealed, gates, bridges, walks, stairs, trails, halls, art caps (no browser)
node tools/castle_map.mjs [ids|all] [seed]        # top-down plans of the castle variants (docs/CASTLE_VARIANTS.md) for designing layouts (no browser)
node tools/tests/castle_visual.js [views] [--grid] [--castle=ids|all] # Castle screenshots per castle (gatehouse, bridges, wards, keep, halls, village, siege)
node tools/tests/castle3d.js [views] [--castle=ids|all] # the 3D Castle (docs/CASTLE_3D.md): wall-walk, stairs, tunnel, throne room, doors, drawbridge, overview
node tools/tests/castle_autoplay.js [classes]       # auto-play takes the Castle's stairs to wall foes (no hits from below) and back down, never leaps off
node tools/tests/castle_variants.js [ids|all] [secs] # auto-play in each castle variant: from the road through the drawbridge to the shrine, starts the scenario
node tools/tests/castle_phone.js [ids|all] [portrait] [throttle] # each castle on an emulated phone (4x CPU): art size/decode, memory, frame cost, joystick over the drawbridge, shots
node tools/tests/overworld_look.js [biome] [seed]    # screenshots of an overworld's spots for art review (scatter in context, sizes, hills)
node tools/tests/skyship.js [clear|storm,...|all|stories] [auto]  # the Sky Battle (docs/SKY_BATTLE.md): whole battles per scenario or story, gauntlets, every line frames its speaker, seen scenes at 20x, shots
node tools/tests/skystories.mjs [ids]              # the 30 Sky Battle stories (docs/SKY_STORIES.md): art, cast, speakers, acts, tokens, line lengths (no browser)
node tools/tests/locks.js                          # item locks, no buy-then-sell, full bag with gear off, auto attribute points, attribute respec, +5/max skill points, scarab gold, gold curve
node tools/tests/castle_walls.js [views] [--noshots] # Castle height-mapped walls: walk/towers/stairs reachable, monsters use the stairs, 30 shots
node tools/tests/sea_of_sand_generation.mjs         # 100 desert maze seeds, route reachability, one-to-five area rolls
node tools/tests/sea_of_sand.js                     # atlas frames, desert HUD, monster frames, screenshots (browser)
node tools/tests/dunes_map.mjs [ids|all] [seeds]    # Sea of Sand dune variants, no browser: trail joins every waystone and the door, tomb down to its chamber, climb, map images
node tools/tests/dunes.js [ids|all] [mobile] [auto] [noflow] # dunes + pyramids live (three.js): camps, door, tomb rooms, chamber boss, portal, shots; auto: auto-play takes a level
node tools/tests/dark_forest.js [noshots] [noauto]  # 40 forest seeds reachable, bot plays all 13 trials, frame cost, shots, auto-play wins the Heart
node tools/tests/mountain.js [noshots] [noauto]    # Mountainside beta (height map): skull access, 30 seeds, hop/drop rules, picking, shots, auto-play summit
node tools/tests/breach_gen.mjs [seeds] [floor]     # THE ETERNAL BREACH generator: 8/5/3 islands, walkways, wards solvable on the tiles (no browser)
node tools/tests/breach.js [town,play,arrive,shots,auto,rules,perf] [floor] # the Breach: purple portal, every scenario, 12 arrivals, shots, auto-play wins a floor, rewards, death
node tools/tests/tower.js [variants] [scenarios] [noauto]  # Serpentine Tower (live three.js): 5 variants, warp/picking, drops/hooks/chargers, 20 roof scenarios + airships, auto-play
node tools/tests/caverns_map.mjs [seeds]           # Depth's Edge Caverns generator, no browser: 6 variants, route joined, no shortcut up, cap (no rock hides floor), map images
node tools/tests/caverns.js [variants] [noauto]    # Depth's Edge Caverns (live three.js): every variant, picking, lake, the passage into the shaft, the climb, 1-3 bosses, portal, shots, auto-play
node tools/tests/tower_edge.js                      # Serpentine Tower edge cases: stairhead carries pets/loot/effects, arrivals land on floor, deaths, town and back
node tools/tests/heavenly.js                       # 60 distinct Heavenly monsters, painted floors/props, monster atlas export
node tools/tests/worldwide_biomes.js               # 32 combat biomes, home/visitor/legacy spawns, town/wilds art and exact iso fences
node tools/tests/worldwide_biomes.js --all         # every indoor biome's themed tile set (slow)
node tools/tests/biome_survey.js [ids] [depth]     # screenshots of every dungeon biome without monsters, for art review
node tools/tests/biome_scenarios.js [ids] [noshots] # themed rooms per biome reachable, all 20 scenario mechanics forced and solved
node tools/tests/biome_looks.js [ids] [depth]      # each biome's biggest themed rooms with the lights up, for art review
node tools/tests/approved_biome_art.js             # the five temple biomes' approved painted floors and props
node tools/tests/titlefx.js                        # title intro: click gate, logo fade on the song clock, flame burst on the hit, eyes
node tools/tests/enemies.js                        # monster art line-ups (sets 1-3), corpses, random-bestiary levels + guardians
node tools/tests/mayhem.js                         # monster traits, ambush arrivals (drop/teleport/burrow/wall), bullet patterns, MADNESS
node tools/tests/spectate.js [mobile]              # while the hero plays: critter taps, SMITE, sealed treasures + reel, auto-play waits in town, stance, portal choice, Greed
node tools/tests/legion.js                         # Necromancer skeleton summons: art line-up, every minion attacks + casts
node tools/tests/dk_ghoul.js                       # Death Knight ghoul: frost dk_ghoul atlas, small, leaps from range; frost skulls on Death Coil
node tools/tests/phoenix.js [mobile]               # Ranger 3D golden phoenix: turntable, wing/tail tips, banks, glides, ember trail, stoop
node tools/tests/totem3d.js [mobile]               # Totem Master 3D great totem: model states/face orders, bursts out of the ground, blast, sinks (stepped sheet)
node tools/tests/dkblade.js [design]               # Death Knight flying sword = his equipped greatsword, 2D sprite vs live 3D model (Mythic +10, gems, runes), on his back out of a fight/in town; compare live in tools/dkblade.html
node tools/tests/runeblade3d.js                    # Death Knight Runeblade 3D model: all 5 skins, 16 turns, rune slots, 30 level looks + reforge, hover + Obliteration shots
node tools/tests/runeblade_familiar.js [secs] [mobile] # Death Knight sword familiar: frost skulls, 15 flight patterns, swings, 5 sword skills, Rune Weapon summons, soak
node tools/tests/bonegibs.js                       # bone gibs (three.js skulls/rib cages/femurs baked by tools/bones3d_bake.js): sheet, looks, kill shots
node tools/tests/familiars.js                      # pet art: every pet summon's look, rainbow slimelings rising + hopping
node tools/tests/slimecourt.js [secs] [play]       # Slime Lord's court: 60 Glymmora sets, every kind's abilities, pounces, blinks, idle games, shots
node tools/tests/petanims.js [keys]                # pet atlases (docs/PET_SUMMON_ANIMATIONS.md): every summon in every state, dead poses, shots
node tools/tests/pets.js [seeds]                   # minion pathing: round walls, keep up, fight round corners, leash, idle
node tools/tests/select.js [mobile]                # hero select: one hero per class, play/new/delete, old duplicate saves
node tools/tests/autoplay.js wizard 15 [mobile] [handsoff]  # auto-play soak: a new hero plays N game minutes at ~30x speed (handsoff: gear never changes)
node tools/tests/autoloops.js [loot,channel,marker,immune,edge,rift]  # auto-play's old loops built on purpose: loot it can't take, a swept-away dash, a goal marker, an unhurtable foe, burning ground, leaving a won rift
node tools/tests/stalls.js [class] [min] [standard|rift|breach] [gift] [autoloot] [fullbag] [god]  # stall finder: flags where auto-play gets nowhere (same status, parked, no kills, flip-flops) with its state
node tools/tests/dodge.js [fights] [secs]          # auto-play vs quakes/charges down corridors (wyrm, knight, charging guardian): blows landed, backing out to open ground
node tools/tests/background.js [class] [secs]      # hidden window (minimised/covered/locked PC): game + auto-play keep real time (raw CDP, needs a desktop)
node tools/tests/balance.js paladin,wizard 146 30  # a geared hero for depth D, auto-play: deaths, depths cleared (BAL_GEAR=3 weaker gear; 'god' 4th arg: DPS)
node tools/tests/balance_model.mjs paladin         # no browser: hero life vs monster hits by depth (the curve in src/data/depth.js)
node tools/tests/dmgscale.js [depths] [classes]    # the damage scale (shownDmg, display only): shown hits vs hero life at depths 5-500, plaque, tooltips; thorns kill in ~40 blows, weapons read ~100 (shownWeapon)
node tools/tests/tuning.js all 1,10,40,160 12      # every class auto-plays vs training dummies: seconds per normal (one / pack of 5), class ratios (toughness, DMG_TUNE)
BAL_STANCE=cautious,balanced,reckless BAL_RAID=1 node tools/tests/balance.js wizard 30 6   # stances side by side; start at a BOSS ROOM gate
node tools/tests/endgame.js paladin,wizard [8] [rush|deep] # hero level by depth from dungeon XP (cap 3000 at depth ~6600; deep: depths 500-7500), kill times + % of life per hit (no simulation)
node tools/tests/happenings.js                     # omens, shrines, treasure imp, cursed chest, challenge, nemesis, town events, Defiance
node tools/tests/perf.js 6 wizard 1                # frame cost on a phone-sized screen: fps, update/render ms (last arg: CPU throttle)
node tools/tests/longrun.js wizard 30                # long session on a phone layout: heap, live canvases (and who made them), frame cost per game minute
node tools/tests/levelmem.js 24                     # live canvas memory level after level (town every third), growth charged to the code that made it
node tools/tests/signatures.js [classes|all] [secs]   # class signatures (src/game/sigs/): charge in play, showcase shots, auto-play
node tools/tests/boomerang.js [casts] [json] [skills] # Boomerang Knight: damage per cast per skill, every boomerang returns to his hand, 3D boomerang model sheets + shots
node tools/tests/paladin.js [dps|auto|shield|shots|all] [levels] # Paladin: every skill's damage vs the hammers (per-skill pow=), auto-play's hammer + Shield Throw build and cast mix, Shield Throw ricochets + blast, 3D sheets + shots
node tools/tests/gunner3d.js [video] [mobile]      # Gunner 3D turrets + Bombing Run biplane: sheets, heads track, shots from the barrel, walk through turrets, the plane; video -> out/gunner3d_action.mp4
```
Screenshots are written to `tools/tests/out/` (git-ignored). Look at them, because layout bugs don't throw.
- In cloud containers, Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and
  `harness.js` uses it automatically. Never run `playwright install`.
- Only Chromium is available, so Safari/iOS and Firefox have never been tested.
- Perf numbers: headless Chromium without a GPU renders through SwiftShader, whose frame times are noisy and
  misleading. On a machine with a GPU set `CHROMIUM_ARGS="--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist"`
  (Windows; `--use-angle=vulkan` on Linux) before `biome_perf.js` / `perf.js`; its 4x CPU throttle is the phone proxy.

## Conventions
- Match the existing style: ES modules, 2-space indent, single quotes, dense code, short comments only where
  something is non-obvious. Shared state lives on `G` (`src/state.js`).
- Remaining unpainted live sprites now use the generated pack in `assets/source/replacements/`
  (`python tools/replacementart.py`; see `docs/SPRITE_REPLACEMENTS.md`). Preserve these and the user's art.
  ASCII fallbacks for missing/loading art remain in
  `src/gfx/pixelart.js`, and the town (ground, transitions, buildings, trees, props) comes from the Overworld and Town pack
  (`assets/source/biomes/town/`, `python3 tools/process_assets.py town`, `tools/townpack.py`; see docs/ART.md). The outdoor Forsaken Wilds biome reuses the town pack without overwriting Herrington Hollow, and adds procedural Canvas trees, scatter and scenario shrines; see `docs/OVERWORLD.md`. Sea of Sand uses the committed native floor, scatter, tree, monster, boss and modular cliff atlases under `assets/tiles/sea_of_sand/`, with five-beat scenario routing and a live HUD; see `docs/SEA_OF_SAND.md`. Rebuild the atlases with `python tools/seaofsandpack.py <Sea_of_Sand_Biome_Pack directory>`. The Dark Forest (192x192, the largest overworld: thick woods of the pack's 15 towering trees with canopy fade, a trail maze, three walled labyrinths with arch gates, five optional trial glades and the Heart of the Forest) uses `assets/tiles/dark_forest/` from `python tools/darkforestpack.py <THE_DARK_FOREST_Biome_Pack.zip>` (the 101 MB zip stays outside the repo); see `docs/DARK_FOREST.md`. Monsters use the user's sheets in
  `assets/source/enemies/<set>/`, imported by `python3 tools/process_assets.py enemies` and catalogued in
  `src/data/bestiary.js`; see [`docs/ENEMY_ART.md`](docs/ENEMY_ART.md). New uploads ("Enemy Assets Set N") go there too;
  set 2 (`Enemy_300.zip`, 300 single sprites) lives in `set2/<family>/` folders, each packed as one sheet and loaded per level. Pet sheets (JPEGs on a flat background) live in `familiars/` (`process_assets.py enemies familiars`). The user's sheets are in
  `assets/source/` and get sliced by `tools/process_assets.py` (needs `pip install pillow numpy scipy`; args
  `sprites|biomes|props`). Dungeon floors, walls, arches, doors and scatter come from **biome packs**
  (`assets/source/biomes/<Name>_Biome_Pack.zip`, a 160x80 template; Catacombs is the first, every biome uses it
  palette-swapped), imported by `python3 tools/process_assets.py biomes` (`tools/biomepack.py`). New packs follow the
  same template; see [`docs/ART.md`](docs/ART.md). **Dungeon biomes use only the three painted packs** (Catacombs,
  Cathedral and Graveyard, Castle Keep), palette swapped, with a themed `part` and optionally walls from another pack
  (`ART` in `src/data/biomes.js`); the five temple biomes add their approved painted floors/props
  (`src/gfx/approvedbiomeart.js`). Torches and wall hangings are placed by `wallMounts()` in `src/world/dungeon.js`.
  See [`docs/BIOME_ART.md`](docs/BIOME_ART.md). New biome packs can come from 9 ChatGPT sheets (outlined templates
  and prompts in [`docs/CHATGPT_BIOME_SPRITES.md`](docs/CHATGPT_BIOME_SPRITES.md)), imported by
  `python tools/chatgpt_biome.py <folder> <names.json> --install`. Enemies, bosses, pets, NPCs and class armor have
  ChatGPT kits too (`docs/art_kits/*.zip`, built by `python tools/chatgpt_art_kits.py`), imported by
  `python tools/chatgpt_art.py <kind> <sheet> <names.json>`; see [`docs/CHATGPT_ART_KITS.md`](docs/CHATGPT_ART_KITS.md). The character redesign
  ("Grim Nocturne": 108-art-pixel heroes, a locked stance, armor/helmet/glove/boot overlays) is specified in
  [`docs/art_style/`](docs/art_style/00_START_HERE.md) and packed by `python tools/chatgpt_style_kit.py`. Biomes have exact X/Y barricades (`src/gfx/isobarriers.js`; see
  `docs/WORLD_BIOME_OVERHAUL.md`) but no monster themes: `rollLooks` picks every level's looks at random from all
  painted art (the generated `bn_` biome natives are gone; never draw monsters in code). Enemy set 3 (260 monsters
  and bosses) is cut from `VELSCOUR_Monsters_Enemies_Bosses.zip` by `python tools/set3plates.py <zip>` and catalogued
  in `src/data/bestiary3.js`. HEAVENLY's 60 enemy sprites are cut from painted sheets by `src/gfx/heavenlymonsters.js`;
  see `docs/HEAVENLY.md`.
  The hero's look is the Grim Nocturne gear: 26 armors per class (2-7 per rarity) and 15 enclosed helmets per class (three sets),
  69 palette finishes, built by `python tools/nocturnegear.py build` (or `process_assets.py gear`) from the natives in
  `assets/source/gear_nocturne/`; helmet nudges go in `assets/sprites/gear/helmets/placements.json` via
  `Fit Helmets.cmd`. The old `assets/FinalClasses/<class>.zip` libraries are no longer read. Class art packs (Paladin weapons, ability effects) go in
  `assets/source/classes/<class>/` and are imported by `python3 tools/process_assets.py classes [class]`; both are in
  [`docs/CLASS_ART.md`](docs/CLASS_ART.md). The animated class-select portraits come from
  `assets/FinalClasses/All 16 Classes.png` (`python3 tools/process_assets.py select`, drawn by `src/ui/heroanim.js`).
  The user's sound zips live in `assets/source/audio/` and are transcoded to MP3 in `assets/audio/` by
  `python3 tools/process_assets.py audio` (needs ffmpeg; `tools/audiopack.py`). `src/core/audio.js` maps game sounds
  to samples (`SAMPLES`), songs to areas (`MUSIC`) and ambient beds to biomes (`AMB`). Loose one-shot WAVs (the
  level-up thunder) go in `assets/source/audio/oneshots/` (a loose WAV one level up would become a song): their lead-in
  is cut and they fade out per `ONESHOTS` in `tools/audiopack.py`, via `python tools/process_assets.py oneshots` (no ffmpeg).
  The Bard's harpsichord (the user's 5-octave, 7-articulation pack, a 220 MB zip kept outside the repo) becomes
  `assets/audio/inst/harpsichord/` via `python tools/process_assets.py instruments <zip>` (numpy + scipy + lameenc; GPL-2
  samples, notice alongside); `src/core/sampler.js` plays it, `src/data/melodies.js` holds the 2,000 two-bar melodies,
  `src/game/bardmusic.js` fits, pitches and arranges them for two hands, and `tools/songbook.html` is a keyboard + player.
  The HUD art (`assets/source/hud_bar.webp`: orbs + 15 skill / 4 potion slots; `hud_frames.webp`: minimap ring + six
  buttons) is cut by `python3 tools/process_assets.py ui` into `assets/ui/` (`hud.webp`, `hud.json`, `minimap_ring.webp`,
  `btn_<name>.webp`). The skill bar's slot order, keys and save migration live in `src/data/bar.js`.
  Held weapons and off-hands: every weapon/off-hand base shows in a set of 50 procedural three.js designs (10 Common
  .. 6 Mythic, fancier by rarity) in a class's style (`tools/weapons3d.js` SETS, families in `tools/weapons3d_families.js`,
  textures from `assets/source/materials/`), baked by `tools/weapons3d_bake.js` into `assets/sprites/held/`; the set is
  picked by `heldSetOf(base, slot, class)` (`src/data/held.js`) and the design by the item's `look` (`heldLook`);
  `src/gfx/heldart.js` lays the piece in the worn armor's fist on the hero image (so it mirrors with facing), recolours
  metal/trim/grip by the look's PALETTES finish and glow by the item's element, and draws gem dots and rarity effects
  (`src/gfx/heldfx.js`). Settings `heldGear` / `heldFx`.
  The Death Knight's 50 greatswords are each a unique build (`tools/weapons3d_greatswords.js`: within a rarity no blade or
  guard repeats, and no two of the 50 share blade + guard + pommel), baked with a whole upright sprite (`heldFree`) and
  one three.js JSON model per design (`assets/models/held/greatswords/NN.json`, `src/gfx/heldmodel3d.js`). They are his
  flying sword (2D by default, setting `dkBlade` 'model' for 3D, 'runeblade' for the old Runeblade); it rests on his back
  out of a fight and in town, and is not drawn in his hand. Run `dkblade.js`, `runeblade3d.js`, `runeblade_familiar.js`,
  `heldgear.js` and `signatures.js death_knight`.
  Gibs: half the chunks are the painted sprites in `assets/sprites/gibs.webp`, the rest bones: three.js models (`tools/bones3d.js`) baked by
  `node tools/bones3d_bake.js` into the data sheet `assets/sprites/bones.webp` that `src/gfx/bonegibs.js` paints in the gib's bone and blood colours.
  Never hand-edit the generated files in `assets/sprites|ui|tiles|audio`.
- Paths must stay **relative** (`assets/...`, `src/main.js`, never `/assets/...`), because the site is served
  from the `/velscour/` subpath on GitHub Pages. The `/src/...` imports in `tools/tests/` are fine, because the
  tests run against a local server at the root.
- Saves live in localStorage under `velscour_saves_v1`, one hero per class (the newest save of a class is its hero; `heroesByClass()`). If you change the save shape, extend `migrate()` in
  `src/game/save.js` so existing heroes keep loading. Saves that can't be read are never written over (set aside first; run `savesafe.js`). Signed-in players' heroes are also copied to Firebase (`src/game/cloud.js`, docs/CLOUD_SAVES.md): one Firestore
  document per class, merged three ways against `velscour_cloud_v1`. It must never lose a save: back up before any local change
  (`src/game/herobackup.js`), and a missing hero is only deleted by a tombstone (rules in docs/CLOUD_SAVES.md); changes to saving or `src/game/cloud.js`: run `cloud.js`.
- After any gameplay change, run at least `flow.js` and the `skills.js` classes you touched. Run `mobile.js`
  and `hud.js` for UI changes. Changes to skills, items, vendors or monster AI can confuse auto-play (`src/game/autoplay.js`), so run
  `autoplay.js` for a class or two as well, and `autoloops.js` for changes to how auto-play chooses, gives up or moves (`lootStep`, `combat`, `huntGoal`, `goTo`, `dodgeDanger`). The main loop and its hidden-page ticker (`src/main.js`): run `background.js`. Macros (`src/game/macros.js`, `src/ui/macros.js`, `src/data/macros.js`, `controls.castSkill`, the touch macro buttons): run `macros.js`. Auto-play's town errands (buying, selling, stashing, gambling) or the loot filter (`src/game/lootfilter.js`): run `autoshop.js`, `stash.js`, `autogear.js` and `locks.js` (`ringloop.js` and `stalegear.js` for what it wears: `fitScore`, `optimizeGear`). Changes to minion AI or `map.findPath`: run `pets.js` and `legion.js`. Pet art (`assets/source/pet_animations/`, `tools/build_pet_animations.py`, `src/core/petart.js`; watch them in `tools/pet_viewer.html`): run `petanims.js`.
  Held gear (`src/gfx/heldart.js`, `src/gfx/heldfx.js`, `src/data/held.js`, a re-bake of `assets/sprites/held/`): run `heldgear.js` and `herolook.js`.
  Changes to monster movement (`Monster.navTo/chase`, `map.move`, the flow field): run `mobs.js`. Overworld scenarios
  (`src/game/overworld.js`, `src/game/seaofsand.js`): run `scenarios.js`. The Dark Forest (`src/world/darkforest.js`, `src/game/darkforest.js`, tree drawing in `render.js`): run `dark_forest.js`. The Sea of Sand's ten dune-and-pyramid variants (`src/data/dunes.js`, `src/world/dunes.js`, `src/gfx/dunes3d.js`, `src/game/dunes.js`; three.js live like the caverns; the classic maze is variant 0 of 11; docs/SEA_OF_SAND_DUNES.md): run `dunes_map.mjs` and `dunes.js` (`dunes.js <id> auto noflow` for auto-play). Height maps (`map.hgt` in `src/world/map.js`, `src/gfx/terrain.js`, `src/world/mountain.js`; docs/MOUNTAINSIDE.md): run `mountain.js`. The Serpentine Tower (`src/world/tower.js`, `src/game/tower.js`, `src/gfx/tower3d.js`, the `setWarp` hook in `view.js`; it borrows the Sky Battle's Air Pirates; three.js live, from the import map in `index.html`, which points at the copy of three.js 0.170 in `vendor/three/` (same origin, no CDN; Defense's 3D packs use it too); docs/SERPENTINE_TOWER.md): run `tower.js` and `tower_edge.js`. The Depth's Edge Caverns (`src/world/caverns.js`, `src/game/caverns.js`, `src/gfx/cave3d.js`, the creatures in `src/data/depthsedge.js`; also three.js live; textures in `assets/tiles/depths_edge/` and creatures from `python tools/depthsedge.py <pack zip> <monsters zip>` then `python tools/process_assets.py enemies depths_edge`; docs/DEPTHS_EDGE.md): run `caverns_map.mjs` and `caverns.js`. The Castle layout (`src/world/castleworld.js`, `src/gfx/castle.js`, `src/gfx/castleground.js`, `src/gfx/castlewalls.js`; docs/CASTLE_OVERWORLD.md) and its eleven variants (`src/data/castles.js`, `src/game/castlestory.js`; one 3D bake each from `node tools/castle3d_bake.js <id>` + `python tools/castle3d.py pack <id>`; docs/CASTLE_VARIANTS.md): run `castle_overworld.mjs`, `castle_walls.js`, `castle3d.js --castle=all` and `castle_visual.js --castle=all` (look at the shots), `castle_variants.js` and `scenarios.js`. Its walls, towers, stairs, moat and bridges are a height map textured from `assets/tiles/castle/ramparts.webp` (`python tools/castleramparts.py`, from the user's `assets/source/biomes/VELSCOUR_Castle_Artwork_Complete.zip`); changes to `src/gfx/terrain.js` also need `mountain.js`. Item rarity, power levels, affixes or drop odds (`src/data/items.js` `RARITY`, `rollRarity`, `affixScale`): run `rarity.js`. Monster/hero scaling, XP curve, BOSS ROOM or Velscour life (`monsterBase`, `xpToNext`, `raidHpMul`, `VELSCOUR_HP`): run `endgame.js`. Monster/hero scaling, affixes, drops or death
  rules (`monsterBase`, `src/data/depth.js`, `src/data/items.js`, `src/game/defiance.js`): run `balance_model.mjs` and
  `balance.js` at a few depths. Monster life/damage curves (`toughness`, `danger` in depth.js) or class damage
  (`DMG_TUNE` in classes.js): run `tuning.js` (a normal should take ~2-3 s at every depth). Caches of canvases, the main loop, autosave or sounds (anything that could grow over a long session): run `longrun.js` and `levelmem.js`. Dungeon/town events (`src/game/happenings.js`): run `happenings.js`. Biome rooms, layouts and scenarios (`src/data/biomerooms.js`, `src/game/scenarios.js`, `STYLES` in `src/world/dungeon.js`; docs/BIOME_ROOMS.md): run `biome_scenarios.js` and `rooms.js`. Monster traits, ambushes and MADNESS (`src/game/mayhem.js`): run `mayhem.js`. The spectator features (`src/game/spectate.js`, `critters.js`, `smite.js`, `greed.js`, `src/ui/sealed.js`, `game.portalChoice`, auto-play's `STANCES`): run `spectate.js` (and `spectate.js mobile` for HUD changes). The critters' looks are three.js models in `tools/critters3d.html`, baked by `node tools/critters3d_bake.js` into `assets/sprites/critters/`. Class signatures (`src/game/signature.js`, `src/game/sigs/`): run `signatures.js`. The Slime Lord's court (`src/game/slimecourt.js`, `src/gfx/slimeart.js`; art by `python tools/slimecourt.py <Glymmora sheets folder>`, kept outside the repo): run `slimecourt.js`, `familiars.js` and `pets.js`. Returning projectiles (`ret` in `Projectile`), Boomerang Knight skills or the 3D boomerangs (`src/gfx/boomerang3d.js`): run `boomerang.js` (look at the shots). The Paladin's skills or their `pow=` balance, Shield Throw (`ricochet`/`blast` in `Projectile`, the thrown round shield `drawThrownShield` in `src/gfx/lancershields.js`) or the 3D hammers (`src/gfx/hammer3d.js`): run `paladin.js` (look at the shots); balance changes also `tuning.js paladin` and `autoplay.js paladin` against `main`. The Death Knight's 3D Runeblade (`src/gfx/runeblade3d.js`; five skins from `assets/source/runeblade3d/`, rebuilt by `python tools/runeblade3d.py skins`, skin every 10 levels and palette every 50 by `runebladeLook`; docs/RUNEBLADE_3D.md): run `runeblade3d.js`; the sword's flight, swings and own skills (`PATTERNS`/`SWINGS`/`PET` in `src/game/sigs/deathknight.js`) his Rune Weapon summons (`src/gfx/runeweapon.js`) and his frost skulls (`src/gfx/dkskull.js`): run `runeblade_familiar.js`. The Ranger's 3D phoenix (`src/gfx/phoenix3d.js`, flight in `src/game/sigs/ranger.js`): run `phoenix.js` and `signatures.js ranger`. The Gunner's 3D turrets and biplane (`tools/gunner3d.js`, textured from the airship pack, baked by `node tools/gunner3d_bake.js` into `assets/sprites/gunner/`, drawn by `src/gfx/gunner3d.js`; docs/GUNNER_3D.md): run `gunner3d.js` and `signatures.js gunner`. The Totem Master's 3D great totem (`src/gfx/totem3d.js`, its rise/blast in `src/game/sigs/totem.js`): run `totem3d.js` and `signatures.js totem_master`. The Lancer's cloth banner (`src/gfx/lancerbanner.js`, art from `python tools/lancer_banner_templates.py --import <skin> <pole>`; docs/art_kits/lancer_banner/): run `lancer_banner.js`. The Bard's notes, measure, melodies, sampler and Cadences (`src/game/bard.js`, `src/game/bardmusic.js`, `src/gfx/notation.js`, `src/data/notation.js`, `src/data/melodies.js`, `src/core/sampler.js`): run `melodies.mjs`, `bard.js` and `bard_listen.js` (`bard_dps.js` for Cadence balance). Music Sheets and the Bard's five Tabs (`src/data/tabs.js` tab reader, `src/ui/sheets.js` editor + Tabs, `G.char.tabs`/`tabAt`, the sheet's lock is `inked`; blank sheets at Fortunato): run `musicsheet.js` and `bard.js`. The Sky Battle (`src/game/skybattle.js`, `src/world/skyship.js`, `src/gfx/skyship.js`, `src/game/cinema.js`, `src/data/skybattle.js`, `src/data/skytalk.js`, `src/data/airpirates.js`, the stories in `src/data/skystories/`; docs/SKY_BATTLE.md, docs/SKY_STORIES.md): run `skystories.mjs`, `skyship.js all` (and `skyship.js stories`) (and `skyship.js clear auto`); the ship's model (`tools/airship3d_ironclad.js`) or `src/world/skyship.js` change the bake: re-bake and pack. The Astronomer (class id `arcane_sorcerer`; `src/game/astronomer.js`, `src/gfx/cosmos.js`): run `astronomer.js`. Raid bosses
  (`src/game/raid.js`, every 5th depth): run `raid.js` (and `raid_sigs.js` for `src/game/raidsigs.js`). Rings, augments or skill mastery (`src/data/rings.js`,
  `src/game/augments.js`): run `rings.js`. The town generator (`src/world/town.js`): run `town.js` with a few seeds. Town life (`src/game/townlife.js`, `src/game/townanimals.js`, `src/data/townscripts.js`, `src/game/townsfolkvisuals.js`, `src/gfx/emotes.js`): run `townlife.js`, `townsfolk.mjs` and `town_visuals.mjs`; rebuild the people sheets with `python tools/build_people_pack.py <VELSCOUR_People_and_Animals.zip>` (docs/PEOPLE_AND_ANIMALS.md). Homunculus the Proud, the blacksmith (`src/game/homunculus.js`, `src/data/homunculus.js`; 30 poses cut by `python tools/homunculus.py` from `assets/source/npc/homunculus/`; his axe story lives in `G.char.homunculus`; Varrow's great axe is a three.js model, `tools/varrowaxe3d.html`/`.js` skinned with chunks of the Runeblade skins, baked by `node tools/varrowaxe3d_bake.js` (`preview` for a turntable) into `assets/sprites/npc/varrow_axe.webp`, drawn by `src/gfx/varrowaxe.js`): run `homunculus.mjs` and `homunculus.js`. Dungeon encounters with people (`src/game/encounters.js`) and scenario/forest NPCs (`src/game/folk.js`): run `encounters.js` and `scenarios.js`. THE ETERNAL BREACH (the purple portal's challenge biome: `src/world/breach.js`, `src/game/breach.js`, `src/gfx/breach.js`, `src/data/breach.js`; docs/ETERNAL_BREACH.md; art from `python tools/eternalbreach.py`): run `breach_gen.mjs` and `breach.js`; its monsters (`breach` art) must never join the regular draws.
- Velscour waits at `FINAL_DEPTH` (500, `src/data/depth.js`); monster levels come from `depthLevel(depth)`, never the
  raw depth. His fight is `src/game/velscour.js` (five phases, life gates, a damage cap; "final boss" in the skull's message
  box starts it at any depth as practice; his throne is `assets/tiles/throne/` from `python tools/velscourthrone.py`): run `velscour.js`. Heirlooms, Covenants, Sigil Stones and Glyphwords
  (`src/data/relics.js`, Sigils in `src/data/items.js`, powers in `src/game/relicprocs.js`), the shared Reliquary and
  Codex (`src/game/reliquary.js`, `src/ui/reliquary.js`, localStorage `velscour_reliquary_v1`) and Town Commissions
  (`src/game/commissions.js`, `G.char.comm`): run `relics.js` (and `relic_balance.js` after changing their numbers).
  The Endgame (docs/ENDGAME.md; opens for every hero once Velscour falls for real): Heresies (`src/data/heresies.js`, `src/game/heresies.js`, `src/ui/heresies.js`): run `heresies.js`; Abyssal Rifts and the honour board (`src/data/rifts.js`, `src/game/rifts.js`, `src/ui/rifts.js`, `src/game/leaderboard.js`, `firestore.rules`): run `rifts.js`, `rift_balance.js` and `cloud.js`; Velscour Unbound (`src/game/unbound.js`, the Unbound branches of `src/game/velscour.js`, the Unbound Heirlooms in `src/data/relics.js`): run `unbound.js` and `velscour.js`; Infernal Marks and the shared record (`src/game/marks.js`, `src/game/endgame.js`, localStorage `velscour_endgame_v1`, Firestore `users/{uid}/account/endgame`): run `marks.js`, `cloud.js` and `endgame.js`. The Abyssal rarity (`RARITY[6]`, weight 0): run `rarity.js`.

## Git / GitHub
- The working branch is `claude/amazing-rubin-kguehz`. PR https://github.com/Agilancer/velscour/pull/1
  merges it into `main`. If that PR has been merged, restart the branch from `origin/main` for new work,
  and open a new PR (unless the user says otherwise).
- Pages deploys automatically from `main` (the "pages build and deployment" action).
