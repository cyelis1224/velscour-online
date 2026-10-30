# Sea of Sand — desert overworld

Sea of Sand is a second outdoor scenario biome alongside the Forsaken Wilds. It keeps the 72×72 outdoor map contract, uses a native desert floor atlas, and builds walkable routes between one and five objective areas. Sandstone cliffs form the map edge and internal maze walls; map collision and line of sight block passage through intact cliff tiles.

This flat maze is now variant 0 of 11: the other ten are rolling three.js dunes with a big pyramid to go down
through, picked at random on entry (never the last one seen). See [SEA_OF_SAND_DUNES.md](SEA_OF_SAND_DUNES.md).

## Runtime integration

| Part | Location |
|---|---|
| Biome registration and its 60 creature roster | `src/data/biomes.js`, `src/data/seaofsand.js` |
| 10 named boss archetypes and AI profiles | `src/data/seaofsand.js`, `src/data/enemies.js` |
| Floors, scatter, palms, monster/boss frames, cliff modules | `assets/tiles/sea_of_sand/` |
| Atlas loader and sprite pivots | `src/gfx/seaofsand.js`, `src/core/enemyart.js` |
| Desert map and cliff maze generation | `src/world/overworld.js` |
| One-to-five scenario sequence and beat rewards | `src/game/seaofsand.js` |
| Persistent timer, current beat and objective HUD | `index.html`, `css/style.css`, `src/ui/hud.js` |
| Browser QA | `tools/tests/sea_of_sand.js` |

The committed lossless atlases are generated from the Velscour Overworld Biome Set. The packer uses each floor's authored pivot and anchors cropped world props at the bottom center of their visible art. To rebuild them from that pack, run:

```bash
python tools/seaofsandpack.py path/to/Sea_of_Sand_Biome_Pack
```

This writes the runtime atlases and `pack.json` under `assets/tiles/sea_of_sand/`. The metadata preserves floor pivots, cliff connection masks, and cliff heights. Do not edit the generated atlases by hand.

Floors and cliffs come from the pack's per-frame sprites. Scatter, trees, monsters and bosses are cut from the pack's `source_art/` sheets instead: the pack's own sprites were sliced on an even grid the generated sheets do not follow (clipped art, neighbours' fragments). The packer finds rows and columns at the gaps between art, gives every connected piece whole to the cell holding its centre, drops the sheets' faint haze (alpha below 96), and scales each sprite into the old frame boxes. The creature sheet is not in roster order, so `CREATURE_ART` names the sheet sprite for each roster monster. The pack itself lives outside the repo (`~/.codex/.chatgpt-projects/<project>/output/Sea_of_Sand_Biome_Pack`).

A cleared area starts the next one at once (no shrine click): its foes hunt the hero and its timer allows for the walk.

The overworld uses coherent terrain fields: open dunes dominate, narrow caravan tracks connect the objectives, and dry washes and ruin paving follow their landmarks. Wind-shaped outcrops replace the old rigid grid maze; sandstone defines the cliffs, with brick near objective sites. Deterministic, scattered 2–4 world-pixel flecks mark floor-material boundaries without adding a black outline. Floor frames remain the original 160×80 Catacombs-compatible isometric footprint; trimmed props and cliffs use bottom-center anchors so they sit on the ground without black seams or floating.

## Scenarios and rewards

The route generator rolls one to five connected area markers from the map seed. Activating an area's shrine starts one of the existing 20 scenario types in a 90–180 second window. The persistent HUD shows the current area, objective/stage progress and countdown. Failure leaves that shrine available for a retry; cleared beats and rewards are saved per depth so returning to town cannot duplicate them.

Each cleared area drops one guaranteed Legendary item. Beat one guarantees a weapon and beat two a shield, so a five-area route includes both. Mythic odds rise by 19 percentage points per cleared beat, reaching 95% on beat five. Scenario rewards use the regular item creation and ground pickup systems.

## Verification

```bash
node tools/tests/data_check.mjs
node tools/tests/sea_of_sand_generation.mjs
node tools/tests/sea_of_sand.js
node tools/tests/overworld.js
node tools/tests/flow.js
node tools/tests/hud.js
```

The Sea of Sand browser test checks all atlas frame counts, sixty seeded maps, route reachability, cliff density, one-to-five area generation, monster frame resolution, and the live scenario HUD. As with the existing browser suite, run it from a local HTTP server with Playwright available.
