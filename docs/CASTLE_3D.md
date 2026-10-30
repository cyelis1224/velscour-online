# The Castle in 3D

The Castle overworld's masonry is one 3D model: both curtains, their towers, the gatehouse and twin gates, the stairs,
the explorable keep, the cathedral and the great hall. It was built in three.js and baked from the game's iso camera.
The game never runs three.js: it draws the baked pieces as the columns of a height map (the Mountainside engine,
docs/MOUNTAINSIDE.md), so you walk along the tops of the walls, climb stairs to them, pass through gate tunnels and
explore the keep, all at no runtime 3D cost.

Each castle variant (docs/CASTLE_VARIANTS.md) is its own layout and its own bake, in `assets/tiles/castle3d/<dir>/`
(the first castle's stays in `assets/tiles/castle3d/`); the game loads only the one it is building.
```bash
python tools/castle3d.py textures        # masonry, slate and plank textures, the variants' stones and roofs -> assets/source/castle3d/tex/
node tools/castle3d_bake.js [ids|all]    # bake -> assets/source/castle3d/out/[<dir>/] (1.5 px per world px, the shipped scale)
node tools/castle3d_bake.js preview 169,196[,w,h,S] [id]   # one framed 3D view of an area -> tools/tests/out/
python tools/castle3d.py pack [ids|all]  # -> assets/tiles/castle3d/[<dir>/] (lossless WebP pages + index.json), then repack
python tools/castle3d.py repack [ids|all] # re-cut the published pages into 2048 px pages grouped by place
node tools/tests/castle3d.js [--castle=ids|all]   # in the game: wall-walk, stairs, tunnel, throne room, doors, drawbridge, overview
node tools/tests/castle_overworld.mjs    # 100 seeds: sealed curtains, open gates, wall-walk, rooms, doors (no browser)
node tools/tests/scenarios.js            # a bot plays every Castle scenario (the drawbridge comes down for it)
```
`tools/castle3d.html` is also an orbit viewer of the whole model. On Windows the bake wants a GPU:
`CHROMIUM_ARGS="--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist"` (about 2 s; SwiftShader is much slower).

## The layout (`src/world/castle3d.js`)
Pure data, so it also runs under Node. Both the game and the bake read it.
- **Heights** are terrain levels (4 world px). The outer wall-walk is at 26 and the inner at 34; the gatehouse is 42;
  the keep floor is 2, its walls 34 and its great tower 50. A body hops up 4 levels and drops 10, so walls are walls
  from below.
- **Curtains** are the old wall cells plus one tile on the ward side. The outermost row is the crenellated parapet
  (blocked) and the two rows inside it are the wall-walk (`map.rampartDeck`). Gates leave tunnels.
- **Towers:** round drums on the corners and square towers between them. Their platforms are on the walk, so the walk
  runs through. Each drum's parapet opens toward the two walls it joins. The inner drums are roofed and are walked
  through under the roof.
- **The gatehouse** has an arched tunnel, two drums standing out over the berm, a portcullis and a **drawbridge**
  (`map.drawbridge`) over the moat to a stone pier and a causeway. The postern and both inner gates are twin-towered
  tunnels with gate leaves.
- **Stairs** are two tiles wide and rise 3 levels a step against the ward side of each wall (four per curtain).
- **The keep** (50 x 33) has an entrance hall, the **throne room** in the west wing (its dais two steps up), and the
  council chamber and armoury in the great tower. **The cathedral** has a raised nave, aisles and a belfry; **the great
  hall** has twin roofs. Walls are two tiles thick outside and one inside. Every doorway is an arched tunnel with door
  leaves.
- **Per-tile flags:** `struct` (drawn from the bake), `solid`, `walk`, `cover` (masonry over a walkway: tunnels,
  lintels, the roofed drums) and `bld` (inside a building).

## The bake (`tools/castle3d.html`)
- **Parts become geometry in world units**, with UVs mapped from world position by face direction, so textures run on
  across parts. Boxes are cut round every arched opening. Walls carry arrow slits, string courses, pilasters and
  mullioned lancet windows (`face` parts). Parapets get breastworks and merlons on a 2-tile rhythm.
- **Materials:** the Castle Keep pack's ashlar (greyed toward the castle pack's limestone) and chapel carving, made to
  tile vertically; the variants also use the pack's other wall materials (brick, ironstone, fleur-de-lis panels, and
  slate stone, basalt, rubble, mossy stone and sooty brick cut from its ten-material source sheet), tinted. Each texture
  doubles as its own **bump map**. Roofs use procedural slate (or a variant's pantiles, fish scales, copper seams, with
  moss, snow or soot), and the doors and drawbridge procedural planks with iron bands.
- **Light** is fixed to the camera, from the upper left, with one fixed shadow frustum over the whole castle.
- **Pieces:** a second pass writes each pixel's tile (and layer: 0 masonry, 1 what stands over a walkway). The render is
  cut into one piece per tile and layer. Identical pieces are merged (same shape, colours within 6), which leaves
  about 3,000 (Goldspire, three rings: 6,600). The bake packs them into 4096 px pages at 1.5 px per world px; `pack`
  then re-cuts them (`repack`) into 2048 px pages grouped by where they stand on the map, each cropped to the rows it
  uses, so a view draws from three or four small pages instead of every big one. A frame that needed all of a castle's
  4096 px pages swapped them through the GPU every frame once they outgrew its texture budget (Goldspire's five: 0.6
  fps on a phone-sized screen with the CPU slowed 4x; 30 fps after the re-cut).
- **Roofs** are baked per building and cut into 32 px columns.
- **Moving parts:** the drawbridge (9 frames, upright to flat, with chains), the portcullis (9 frames, rising) and every
  door's two leaves (6 frames). They are rendered among the masonry drawn depth-only, so a jamb or arch in front of them
  cuts them exactly.

## In the game
- `src/world/castleworld.js` applies the layout: `map.hgt`, blocking, the wall-walk and muster posts, the rooms
  (`castleRooms`: the throne room is in the keep now), the doors (`castleDoors`), roof strips and moving parts. Old
  props left in the masonry are dropped.
- `src/gfx/castle3dart.js` loads the pages. `src/gfx/terrain.js` draws a masonry tile's pieces in place of the rock and
  bank of a cliff (tunnels get their floor first), keeps the Castle's blended ground on the other tiles, and redraws
  pieces over anyone behind them. It also redraws what stands over a walkway after whoever walks under it. Both fade
  where they would hide the hero (`cutaway`, `src/game/render.js`).
- **Roofs**: a building's whole roof fades away (about half a second, `roofFade` in `src/game/render.js`) while the hero
  is inside it, and fades back in once they leave; it also turns see-through over anyone behind it. Lights inside a
  roofed building come up in the light map as its roof fades.
- `src/game/castle3d.js` (every frame): the drawbridge comes down when the hero is within 11 tiles of it and only then
  opens the crossing. Doors swing open while anyone is within about 3 tiles and close behind them.

## Limits
- **Memory:** a castle's pages decode to 30-87 Mpx (Goldspire the most, about 330 MB), and the whole browser sits at
  about 800-900 MB in a castle (Chromium, `castle_phone.js`); leaving the Castle lets them go. A 1x bake would quarter
  that, but on a phone the castle is drawn at about 1.3 device px per baked px, so it would look soft. Real phones and
  Safari are untested.
- Door leaves on walls facing away from the camera (the cathedral's west door, the great hall's north door) are hidden
  by their own walls.
- The scenario bot finishes every Castle scenario, but several now have longer waits between fights (up to 37 s):
  there's more walking up stairs and along the walls.
