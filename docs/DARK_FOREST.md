# The Dark Forest — the largest overworld

The Dark Forest is the fourth overworld biome, beside the Forsaken Wilds, Sea of Sand and the Castle. It is built from
the user's **THE DARK FOREST Biome Pack**: 60 floors, five wall families with arches and doors on the Catacombs rig,
40 props, and 15 towering trees with trunk and canopy layers. It is the largest map in the game at **192 x 192 tiles**
(the Castle is 192 x 176, the Wilds and Sea of Sand 72 x 72).

A run: thick woods cut by a maze of branching trails, three walled labyrinths entered through arch gates, five
optional **trial glades** along the trails, and the **Heart of the Forest** deep in the biggest labyrinth. The trial at
the Heart opens the exit (in the Heart itself). Glades are optional and each pays Legendary gear.

## Design calls

The user asked for thick woods, dungeon-style mazes and branching paths, and forest-only scenarios, and said to ask
questions. The questions went unanswered and the user said "continue", so these defaults were chosen:

| Question | Choice |
|---|---|
| Size | 192 x 192, so it is the largest overworld |
| Run shape | Optional glades (loot) + the Heart (opens the exit), rather than "clear everything" |
| Monsters | The pack has none: forest families from the existing bestiary (`roster`, `prefer` in `src/data/biomes.js`) |
| Mazes | Both: tree walls for the woods and trails, walled labyrinths from the pack's wall families |

## Code and data

| Part | Location |
|---|---|
| Biome entry (`packArt: true`: an overworld drawn from a biome pack) | `src/data/biomes.js` |
| Atlases (floors, walls/arches/doors, props via `tools/biomepack.py`; trees) | `assets/tiles/dark_forest/` |
| Packer | `tools/darkforestpack.py` |
| Tree atlas loader, tree sprites | `src/gfx/darkforest.js` |
| Map generator | `src/world/darkforest.js` |
| Trial names and texts | `src/data/darkforest.js` |
| Run object and the 13 trials | `src/game/darkforest.js` |
| Tree drawing with canopy fade, tree buckets | `src/game/render.js` (`treeFade`, `drawTree`, `map.treeCells`) |
| Wiring (load, build, exit, saved seed) | `src/game/game.js` |
| HUD panel (shared with Sea of Sand), Quest Log | `src/ui/hud.js`, `src/ui/quest.js` |
| Auto-play objective hook (`ow.objective`) | `src/game/autoplay.js` |
| Save (`c.darkForestRuns`) | `src/game/save.js` |
| Browser QA | `tools/tests/dark_forest.js` |

### Rebuilding the atlases

```bash
python tools/darkforestpack.py "path/to/THE_DARK_FOREST_Biome_Pack.zip"   # or the extracted folder
```

The zip is 101.7 MB, over GitHub's 100 MB file limit, so it stays outside the repo (the user keeps it under
`F:\!  VELSCOUR\AI ASSETS\Biome Packs\`). The floors, walls, arches, doors and props go through the regular biome
importer (`biomepack.import_pack`: walls raised by `ZSCALE` and cut into depth-sorted arms). The trees are cropped,
halved (they draw at about a third of a native pixel per world pixel) and packed into `trees.webp` + `trees.json` with
their pivots and the row where the pack's canopy layer starts. Never hand-edit the outputs.

## The map (`generateDarkForest`)

Laid out on a 24 x 24 grid of 8-tile macro cells:

1. **Regions.** The entry clearing (south-west); the Heart labyrinth (5 x 5 cells, mossy ruins, north-east); a 4 x 4
   thorn-hedge labyrinth and a 3-4 x 3-4 labyrinth of tangled roots or blackwood trunks; five 2 x 2 glades, spread as
   far apart as possible; six 1-cell landmarks (camp, well, ruined shrine, obelisk, swamp pool, web grove). Nine blobs
   of **deep wood** are left out of the trails altogether.
2. **Trail maze.** A randomized depth-first maze over the free cells (with a slight bias to run straight, so trails
   wind rather than mesh), plus ~34 loop links. If deep wood ever cuts a region off, the maze grows on into it.
   Labyrinths get gates on the sides that face a maze cell (the Heart one, the others two). The trails from the entry
   to every glade, gate and landmark are the **main paths** (3 tiles wide, packed mud); the rest are 2-tile side
   trails, with dead ends.
3. **Carving.** Each link is a trail of two legs through a sideways-shifted midpoint. Glades and clearings are
   wobbly discs.
4. **Labyrinths.** A fine maze of 3-tile corridors and 1-tile walls (4-tile pitch), a third of its dead ends
   knocked through. The centre is a chamber: the Heart (3 x 3 cells) or a treasure sanctum (2 x 2, a rare chest and a
   champion pack). Gates are the pack's arches: an open tile with two piers, the walls ending half a tile short, as
   in the pack's rig.
5. **The Bandit Stockade** (only on the glade dealt that trial): a 13 x 13 timber palisade ring with a door wherever a
   trail meets it.
6. **Floors.** By kind: main paths, side trails, labyrinth corridors (a floor that stands out from that labyrinth's
   walls), glades, the Heart. The woods' ground follows broad noise; landmarks and glades add themed floors (water and
   reeds by the swamp, silk by the webs, the trial's own floors in each glade).
7. **Walls.** Each wall tile gets the pack's centre-line node for its wall neighbours (NE=1, SE=2, SW=4, NW=8; piers
   and door gaps count as neighbours), as arms in `map.walls`, so the regular wall pass draws, sorts and cuts them away
   over the hero.
8. **Trees.** On every wooded tile, Poisson spaced: 1.3 tiles along trails (so the woods read as walls), 1.75 inside,
   2.3 deep in. Species follow stands (pine ridge, old oak wood, dead quarter, wet hollows by the swamp). About
   18,500 trees per map, scale 0.7-0.9 of native. They are kept out of `world.props`: `map.treeCells` buckets them in
   8 x 8 tiles and the renderer only walks the buckets around the view. The Elder Heartwood stands in the Heart.
9. **Dressing.** Undergrowth fills gaps along the wood's edge, walk-over clutter lines the trails, lanterns (lit) mark
   the main paths, signposts stand at forks, and each landmark gets its set piece.
10. **Chests and monsters.** Up to 12 chests at dead ends (`far: 40`, so auto-play walks to them), often guarded;
    ~90 packs along the trails and in the labyrinths.
11. **Checks.** Flood fill from the entry: the exit, the Heart, every glade's shrine and spots, and every chest must
    be reachable. A failing layout moves on to `seed + k*7919` (about 1 in 150 seeds), so the saved seed still
    rebuilds the same forest.

### Canopy fade

Trees are drawn in two parts, split at the pack's trunk/canopy row. A tree standing in front of the hero fades its
canopy (to 0.2 alpha right over him, smoothly back with screen distance) and, if the hero is behind the trunk itself,
its trunk to 0.45 (`treeFade` in render.js).

## The trials

Each map deals five of the twelve glade trials without repeats. One trial runs at a time; a failed trial is retried at
its glade stone. Foes are awake hunters, so a phase never stalls.

| Trial | Mechanic |
|---|---|
| The Witch-Lights | Five wisps, one at a time; each flees the hero and must be caught (150 s). Each catch calls shades. |
| The Brood Mother | Burn five egg sacs (each hatches spiders), then slay the Brood Mother, who keeps calling her brood. |
| The Hanging Effigies | Burn four guarded effigies; while any hangs, foes slain near one may rise again. |
| The Lantern Vigil | The glade goes dark for 80 s; waves (every 12 s) drain the lanterns, and with nothing left alive between them a few come out of the dark at the hero; relight snuffed ones; all four out = fail. |
| The Druid Circle | Five standing stones flash a sequence (3, 4, then 5); touch them in order. A wrong stone calls guardians and replays. |
| Wolf Moon | The Moon-Eyed Alpha howls every 9 s and the pack answers; kill the alpha. |
| Lost in the Woods | Three children are hiding at dead ends 10-30 tiles out; find each and lead them back; a child hurt too much is lost. |
| The Bandit Stockade | Storm the palisade: bandits, lieutenants, then Black Tom, the Bandit Chief. |
| The Fairy Ring | Hold three mushroom rings in turn (6 s each, no fey inside); a ring not taken in 32 s springs up elsewhere. |
| The Hollow King's Barrow | Open the barrow: two waves of risen dead, then the Hollow King. |
| The Woodcutters' Last Stand | Four waves of woken trees and vermin; keep at least one woodcutter alive. |
| The Creeping Thorns | Uproot four guarded thorn hearts in 140 s while briars burst out of the ground under the hero. |
| **The Elder Heartwood** (the Heart) | Sever four guarded roots, fell the Heartwood Warden (and the Witch of the Wood), then hold off two last waves. Opens the exit. |

Rewards: every glade drops a Legendary item, with a Mythic chance of 12% per glade won so far (up to 60%); the Heart
drops a Legendary and has a 60% Mythic chance. Rewards and cleared glades are saved per depth in `c.darkForestRuns`
(`{seed, cleared, rewarded, heart}`), so a town trip rebuilds the same forest with the same glades won and no
reward twice. The first clear of the Heart grants the usual bonus skill point.

### The run object

`createDarkForestRun` returns the overworld scenario API the rest of the game reads (`active`, `completed`, `shrine`,
`markers`, `type`, `title`, `hud`, `update`), plus `trials`, `heart`, `cleared`, and `objective`. `shrine` is the stone
auto-play should head for: an unfinished glade within 30 tiles, else the Heart. `objective` (from the running trial)
tells auto-play where to go when the nearest marker would be wrong: the next druid stone, the fleeing wisp, a lost
child or the glade, the fairy ring.

## Verification

```bash
node tools/tests/dark_forest.js              # 40 seeds, all 13 trials by bot, frame cost, screenshots, auto-play to the Heart
node tools/tests/dark_forest.js noshots noauto
node tools/tests/biome_perf.js dark_forest,overworld 24 4 5
node tools/tests/overworld.js
node tools/tests/scenarios.js
node tools/tests/flow.js
```

At the first commit: all 40 seeds generated with every objective reachable (~18,500 trees, ~1,600 wall arms, 5 arch
gates, ~13,000 open tiles, ~90 packs, 14 chests; at most ~110 ms to generate); the bot finished all 13 trials; auto-play
won a glade, found the Heart and won it in about 4 game minutes. Headless frame cost at 1366 x 860: ~21 ms median.
On the throttled phone profile (`biome_perf.js`, 4x CPU) it runs slower than the Wilds (~11 vs ~17 fps). Most of that
is software-raster overdraw from the tall trees, which a real GPU handles far better. It has not been checked on a
real phone.
