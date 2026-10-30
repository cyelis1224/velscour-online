# Castle variants

The Castle overworld is now eleven castles: the concentric one it started as (Ironcrown) and ten variants. Each has its
own layout, its own masonry and roof materials, its own ground and water colours, and its own little story. A Castle
level picks one at random, never the one the hero saw last (`G.char.lastCastle`); `G.castleVariant = '<id>'` forces one
(tests, debugging).

Everything about a castle lives in one record in [`src/data/castles.js`](../src/data/castles.js):

- **`layout`**: the 3D masonry (`src/world/castle3d.js`). Curtain rings in wall cells (a cell is 2 x 2 tiles), outermost
  first, each with its wall-walk level, corner towers (round drums, roofed drums or `'square'`) and interval towers
  `[side, cell, 'square' | 'half']` (half-round towers stand out from the wall, the walk crossing their open ward half);
  the gatehouse (a cell on the first ring's south side) and its height; the twin-towered gates `[cell x, cell y, ring]`;
  the stairs `[ring, side, tile along the wall, direction]`; the north-west corners of the keep, the cathedral and the
  great hall (the same three buildings everywhere, moved).
- **`look`**: the bake's folder (`assets/tiles/castle3d/<dir>/`) and materials (`[texture, tint]` for the stone, the walk
  tops, the stair treads, the cathedral, the dais, the roofs and the timber), the ground's palette swap
  (`core/util.js` `recolor`, applied to the castle pack's floors on first draw), the water's tint and current colour,
  the drifting particles (snow, ash, petals, embers...), the odds of night and rain, and the Dark Forest trees of its wood.
- **`plan`**: where everything round it stands (`src/world/castleworld.js`): the river (and a mere or bog pools), the
  yards in the wards (practice yard, smithy, stables, paddock, kitchen garden, orchard, mason's yard, barracks, walled
  garden, well), the village, fields, orchard, graveyard, the siege lines and the ruin. `null` leaves one out; a scenario
  site that would stand there moves to a neighbour. Roads are worked out from the gates (`autoRoads`), the lanterns along
  the outer wall-walk from the curtain (`autoLanterns`) and the milestones from the roads' first bends, unless listed.
- **`story`**: the intro logged on arrival, the herald by the road and the lord in the keep's council chamber (each says
  their lines in turn when the hero comes near: `src/game/castlestory.js`), and `set`, the dressing laid over the map
  (`STORY_SETS` at the end of `castleworld.js`).

| id | name | layout | masonry / roofs | story |
|---|---|---|---|---|
| `ironcrown` | Ironcrown Castle | concentric: two rings, inner gate offset | the Keep pack's ashlar, slate | the siege's fortieth day |
| `blackfen` | Blackfen Hold | one low ring, square towers, keep to the north | mossy stone, moss-grown slate | a lord drowned a village to fill his moat; bog pools, sunken cottages, lanterns on the causeway, fireflies |
| `solenne` | Solenne Palace | wide and shallow; a small inner ring round the keep; halls in the wings; half-round towers | white ashlar, blue glazed roofs | a royal wedding; the jilted suitor's army camps on the road; banners and rose arches up the bride's way, a feast, petals |
| `sunscar` | Sunscar Citadel | long and narrow; a tall citadel at the north end behind a narrow zwinger; halls in the south bailey | sandstone-tinted ashlar, terracotta pantiles | a frontier fort unrelieved for nine years; sand drifts, deadwood, water casks |
| `hoarfrost` | Hoarfrost Bastion | big outer ring of half-round towers; a tall square-towered citadel in its north-east; halls in the west ward | blue-grey slate stone, snow-laden roofs | eternal winter; the garrison frozen at its posts; ice on the moat, snow falling |
| `cinderhold` | Cinderhold | wide outer ring; the inner ring set to the east; the cathedral left in the burned west ward | soot-blackened brick, charred roofs with embers | it fell last night; smoke from the ruins, the village burned, ash falling, a bigger enemy camp |
| `mourncross` | Mourncross Abbey | outer ring of half-round towers; a low cloister ring round the cathedral at the centre; keep and hall outside it | chapel-carved limestone, copper roofs | the plague: quarantine barricades, stretchers, candles, open graves |
| `goldspire` | Goldspire | three rings, each higher; zig-zag gates | carved fleur-de-lis panels, gold scale roofs | the crown treasury robbed through all three gates; guard posts, dropped chests, gold glitter |
| `bloodmoat` | Castle Morvane | one tall ring of half-round towers; gatehouse off to the east | red brick, black scale roofs | a count who receives guests after dark; a blood-red moat, cages on the road, the tithe table, embers |
| `hexenmere` | Hexenmere | two rings, the inner set to the north-west; roofed drum towers on the outer ring; a mere feeding the moat | violet basalt, violet slate | a witch-queen raised the castle out of the mere; witch circles, cauldrons, mushrooms, wisps |
| `thornwick` | Thornwick Motte | a small ring on its own; the cathedral and great hall stand outside in the town | rubble fieldstone, terracotta pantiles | the harvest fair; more houses, stalls and tents, scarecrows that may have moved |

## Making another one

1. Add a record to `CASTLE_VARIANTS` (copy one with a similar plan). Keep rings at least ~10 tiles apart, stairs at
   least 6 tiles from corner drums and 10 from gates, and leave 3+ clear rows in front of the keep's south doors.
2. `node tools/castle_map.mjs <id>` draws a top-down plan (`tools/tests/out/castle_map_<id>.png`): masonry by kind and
   height, buildings, props, scenario sites (red), start (green) and exit (blue). Iterate on the numbers here; it needs no
   bake and no browser.
3. `node tools/tests/castle_overworld.mjs 0 <id>`: every curtain sealed, every ward reachable only through its gates,
   all 35 scenarios' sites, doors, stairs, rooms and story NPCs reachable, bridges over water, nothing in the masonry.
4. New textures: `python tools/castle3d.py textures` (stone cut from the Castle Keep pack's ten-material sheet, roofs
   painted: slates, pantiles, fish scales or standing seams, with moss, snow or soot over them).
5. Bake with a GPU: `node tools/castle3d_bake.js <id>` (`preview x,y,w,h,S <id>` for one framed view first), then
   `python tools/castle3d.py pack <id>`.
6. In the game: `node tools/tests/castle3d.js --castle=<id>` and `node tools/tests/castle_visual.js --castle=<id>`;
   look at the shots. `node tools/tests/scenarios.js - <id>` plays all 35 Castle scenarios in it, and
   `node tools/tests/castle_variants.js <id>` lets auto-play find its way in from the road and start the scenario.
7. On a phone-sized screen with the CPU slowed 4x: `node tools/tests/castle_phone.js <id>` (and `<id> portrait`): the
   art's size and decode time, memory, frames per second while auto-play walks it, the joystick over the drawbridge.

The drawbridge starts raised and comes down when the hero walks within 11 tiles of it. Route planners plan across it
while it is up (`map.planOpen`, used by auto-play's road field, `buildRoadNav`), so auto-play heads for the gate wherever it stands
instead of stalling at the moat when the gate isn't straight ahead.

## On phones

Tested only in Chromium emulating a phone (`castle_phone.js`: touch, 844 x 390 or 390 x 844 at DPR 2, the CPU slowed
4x, the machine's real GPU), never on a real phone or in Safari.
- Each castle downloads 7-20 MB of art once per visit (lossless WebP) and decodes it to 30-87 Mpx; with the game's
  other art the browser sits at about 800-900 MB in a castle, and leaving the Castle lets the castle's art go. Castles
  never follow each other (no biome comes twice in a row), so one castle's art is gone before the next is loaded.
- The art is cut into 2048 px pages grouped by place (`castle3d.py repack`), so a view draws from a few of them. Drawn
  from 4096 px pages that each held pieces from all over the castle, every frame needed every page, and Goldspire's
  five (about 320 MB) outgrew the GPU's texture cache: 0.6 fps. Re-cut: 30 fps. Every castle runs at about 25-55 fps
  there.
- Building a castle level takes 2-8 s on the slowed CPU (behind the loading screen).
- The herald and the lord speak in the three-line bubble (as at the forge) and hold each line long enough to read it.

