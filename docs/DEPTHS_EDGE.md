# Depth's Edge Caverns

Narrow passages that open into great caverns and close again, monsters all the way, torches on the walls,
stalactites and stalagmites everywhere. Then an underground lake under a tall waterfall. At the waterfall's foot a
passage leads into a shaft whose ledge spirals up its walls, a long climb, to the top of the falls, where one to three
bosses wait. The last one's fall opens a portal there.

It is an overworld biome (`depths_edge` in `src/data/biomes.js`, `overworld: true, cave: true`), so it is in the
regular draw and the overworld guarantee. Velscour's skull also reaches it: send the message `caverns` (or `caves`),
or pick it on the HAIL VELSCOUR! list.

| File | What |
|---|---|
| `src/world/caverns.js` | `CAVE_VARIANTS` (6), `caveLooks`, `generateCaverns`: the plan, the tiles, the height field, the cap, the dressing |
| `src/game/caverns.js` | the run: smooth elevation and picking, `horizon` (who is hidden behind higher ground), the baked props, the delve, the lake, the passage, the climb, the bosses |
| `src/gfx/cave3d.js` | the three.js scene: terrain, wall stalactites, torches, water, the falls and their particles, the passage mouths, the baked props |
| `src/data/depthsedge.js` | the 50 monsters and 10 bosses as monster looks (`de_` ids), the bosses' raid templates and titles |
| `tools/depthsedge.py` | imports both packs (below) |
| `tools/tests/caverns_map.mjs` | node: seeds of every variant, the route, the cap, map images |
| `tools/tests/caverns.js` | browser: every variant built, picking, the passage, the climb, the bosses, the portal, shots, auto-play |

## The art
- **Biome pack** (`Depths_Edge_Caves_Biome_Pack.zip`): `python tools/depthsedge.py <pack> <monsters>` writes lossless
  WebP to `assets/tiles/depths_edge/`: the 20 seamless 160 px floor and wall tiles (`tex/DEC-NN`), the ten 3x2 sheets of
  510 px rock faces (`hd/DEC-HDNN`; they don't tile, so they repeat mirrored) and the five sheets of seamless water
  tiles (`water/DEC-WSNN`). Each variant uses two floors, two walls, one rock-face sheet and one water sheet, palette
  swapped by `core/util.js recolor`. The isometric wall panels in the pack are not used (the walls are 3D).
- **Creatures** (`Depths_Edge_Terror_II_50_Monsters_10_Bosses.zip`): one 1536x1024 painting each on magenta. The same
  tool keys them (`process_assets.key_magenta`), drops specks, trims and scales them (monsters 200 px tall, bosses 300)
  into `assets/source/enemies/depths_edge/{monsters_1,monsters_2,bosses}/`; `python tools/process_assets.py enemies
  depths_edge` packs three atlases. `src/data/depthsedge.js` gives each an archetype and height (named from the pack's
  roster). They are a faction of their own like the Air Pirates: `artPool`/`bossPool` skip `depthsEdge`, and the
  caverns roll only them (`caveLooks`).

## The layout (`generateCaverns`)
Planned in screen-aligned axes (a to the right of the screen, b toward the camera), then laid into a grid sized to fit
(about 180 x 190 tiles):
- **The main caves**, at the bottom of the screen: the start, three caverns 30-40 tiles across (noisy blobs with mounds,
  a pool, a name shown on entry) joined by winding passages 3-4 tiles wide, two side alcoves with a chest each, and the run into the
  lake cavern. Floor heights ramp along the passages and are smoothed and held under the climb limit.
- **The lake cavern**: a lake (deep in the middle, a walkable shallow rim, a beach) fed by the plunge pool under the
  falls, and walls 17 tiles high. The waterfall drops from a spur of the plateau (where the river spills) straight
  into the plunge pool. A notch at the cliff's foot beside it holds the passage mouth (where the gallery runs close, the rock kept between
  them can eat the notch's inner end: `notchIn` is then pulled back to the notch's last open tile).
- **The plateau** (the top of the falls, HP 13-16 tiles up by variant) behind the lake: higher ground behind lower
  never hides it. A river crosses it from a spring in the back wall to the lip; it is shallow and walkable.
- **The shaft**, to the right of the plateau: a pool at its foot (with a rope of water falling into it out of the
  dark), and a ledge 4.6 tiles wide spiralling up its walls about three turns (around 350 tiles of climbing, about 5
  tiles up a turn) to a gallery that runs out onto the plateau. A height field cannot enter a spiral at its foot from
  outside, so the passage at the waterfall's foot moves the party to the ledge's foot (a fade, `toShaft`); everything
  else is one connected cave.

## The height field and what hides what
- Heights are tiles (one three.js unit, VZ = 39.19 world px on screen). The field has two vertices a tile edge.
  Walkable ground takes its tiles' heights; rock rises from the floor's edge to the region's wall height (passages
  3.4, caverns 6.5, the lake cavern 17, the plateau 6, the shaft 4.5) over a span that grows with the height, bulging
  in and out and banded with ledges, and above that it fades into the dark (`ceil`, the fog in the shader). The deep
  rock is left out of the mesh entirely.
- **The cap**: no rock may hide walkable ground or water behind it on screen (same screen column, nearer the camera):
  a sweep in depth order lowers every rock vertex to at most the height that would just touch the line of sight to the
  ground behind it. So walls in front of a passage are cut down like Diablo's, walls behind it stand tall, and sprites
  (always drawn over the 3D) are never wrongly in front of rock.
- **Walkable ground over walkable ground** (the shaft's ledges, the plateau's edge) still happens. `horizon(o)` walks
  toward the camera along the creature's screen column and clips its sprite where the ground in front rises above it
  (or skips it when all of it is hidden). Round the hero, inside the shaft, terrain nearer the camera and higher than his feet is
  cut away (a dithered oval in the shader; `cutAt` is the same rule in JS for picking and the horizon), and back
  faces show as dark rock where the cut slices it.
- `view.js setElevation` gets the smooth field (bilinear, so feet sit on the 3D floor; no hop arcs, `map.smoothField`),
  `map.hgt` holds it in levels for the climb rules, and picking marches down the view ray to the first ground,
  walkable ground first, with a few halvings to land exactly.

## Drawing (`gfx/cave3d.js`)
- The camera is the game's own (as in the Serpentine Tower): orthographic, framed on the 2D camera's view rect, one
  render pixel per world px (0.75 on touch), scaled up without smoothing.
- **Terrain**: a `MeshStandardMaterial` with its own albedo: floors and walls from the variant's tiles, triplanar,
  blended by slope; a rock-face panel over the steep parts; wet and crevice darkening per vertex; a bump from the
  albedo's own derivatives so torchlight catches every grain; the fade into the dark above the wall height.
- **Stalactites** hang live in front of the tall back walls (instanced lathe spires). **Free-standing stalagmites,
  clusters, columns, boulders and the stalactites over open floor** are the same kind of 3D models baked once per level
  into sprites with the game's camera, and drawn in the depth-sorted pass (`world.props`, `caveProp`), because they must
  hide whoever walks behind them; they fade where they do.
- **Torches**: iron sconces with flickering flames; the nine nearest the hero get point lights (five on touch), one
  light follows the hero, the falls and the shaft's pool add blue ones. The 2D lighting adds the same torches.
- **Water**: one mesh over every water body (the lake, the cavern pools, the plateau's river with its flow, the
  shaft's pool), shaded from the pack's water tile in the variant's three blues, foam where it's shallow, ripples
  rings round the plunge.
- **The falls**: a bright core curtain and a wide faint veil, wavering edges, foam at the lip and the foot; GPU
  particles: droplets in four blues down the curtain, mist puffs rising off the plunge pool, splash sparks, a veil of
  mist down the fall, motes over the lake. The 2D side adds blue glow and mist drifting over the shore. The shaft's
  rope of water has its own mist and splash.

## The run (`game/caverns.js`)
- **Delve**: packs every 15-20 tiles along the passages (mayhem's own ambushes are off here), one or two more in each cavern (champions, uniques). Every 30-46 s of fresh
  ground a pack drops out of the dark above or claws up out of the floor. Entering a cavern shows its name.
- **The lake**: the first sight pans the camera to the falls; things rise out of the water at the shore.
- **The passage** at the waterfall's foot (walk into the notch): fade, and the party comes out of a cave mouth at the
  shaft's foot.
- **The climb**: packs wait up the ledge; about 45% of those above the first turn leap down onto the party when it
  passes beneath them. The zoom pulls back a little in the lake cavern, on the plateau and in the shaft.
- **The top of the falls**: one boss (45%), two (35%) or three (20%), each a raid boss (its template and title in
  `DEPTHS_EDGE_BOSSES`) at reduced life with no execute timer, with adds (the last one drawn 2.6x, the others 2x); it climbs up the falls and over the lip,
  rises out of the river, or drops out of the dark. The last one's fall opens the exit portal there, with two rich
  chests. +1 skill point the first time. No waiting: the next boss comes a tenth of a second after the last falls,
  its adds start landing at once, and with nothing up there to hit, a boss still climbing the falls finishes the
  climb in half a second (`run.top.hurry`).
- `objective` walks auto-play down the route's waypoints, into the notch, up the ledge's waypoints and to the plateau.
  A level-1 paladin at depth 3 takes a whole cave in 17-20 game minutes.
- Sight: `map.losRise` is 2.2 tiles here, so the low mounds of a cavern never block line of sight (the default rule,
  ground a hop above both ends, would hide monsters behind every rise); the shaft's ledges and the plateau's cliff still do.

## The six variants
| Variant | Stone | Water | Torches | Creatures |
|---|---|---|---|---|
| The Depth's Edge Caverns | chalk limestone, native colours | deep blue, ice highlights | amber | native |
| The Moonwell Deep | blue dolomite and quartz | sapphire | pale blue | storm |
| The Rustvein Hollows | iron-red breccia | teal | ember orange | rust |
| The Verdigris Grotto | copper-green karst | turquoise | warm | verdigris |
| The Amethyst Throat | violet slate and geodes | indigo | violet | amethyst |
| The Rimebone Abyss | frost-white bone stone | ice blue | cold teal | rime |

Each picks its own tiles from the pack and palette swap; its plateau height differs (13-16). Most of each level's
creatures wear the variant's swap and its name ("Storm Pressure Widow").

## Test
```bash
node tools/tests/caverns_map.mjs [seeds per variant]   # node: generation, route, cap, map images
node tools/tests/caverns.js [variants|all] [noauto] [noshots]
```
On Windows use the GPU (`CHROMIUM_ARGS="--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist"`).

## Not verified / open
- Only headless Chromium has run it. Phones' frame cost (three.js under the 2D frame, nine lights) is unmeasured.
- Sprites are drawn over the 3D view: the cap keeps rock from wrongly hiding behind them and `horizon` clips them behind
  higher ground, but spells and projectiles are never clipped, and a monster standing behind the waterfall's curtain
  draws in front of it.
- The design calls were made without asking: a fade through the passage at the falls' foot, the funnel-shaped shaft,
  one to three bosses by chance, raid bosses at reduced life with no execute timer, the regular overworld rotation.
