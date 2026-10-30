# The Sky Battle (The Sky Lanes)

An overworld biome fought on the deck of the heroes' airship, a gothic steam ironclad, against the Air Pirates. It
is in the normal biome rotation as **The Sky Lanes** (`skyship` in `src/data/biomes.js`): `drawBiome`'s bag (about one
depth in 20), the three portals at a cleared exit ("Sky battle"), and one of the five overworlds the guarantee picks
after three dungeons. The portal prompt and the Quest Log describe its phases. Velscour's skull also
reaches it: send `sky`, `airship` or `pirates`, optionally followed by a scenario (`sky storm`, `sky night`). The
HAIL VELSCOUR! list also has one entry per scenario.

```bash
node tools/skyship_bake.js && python tools/skyship.py pack   # re-bake the ship, boats, galleon, props (three.js; GPU helps)
node tools/tests/skyship.js [clear|storm,...|all] [auto]     # whole battles at simulated speed, every phase checked, shots
```

## How a battle goes (`src/game/skybattle.js`)
1. **Arrival** (cut scene). The camera comes down through a cloud astern onto the whole ironclad, runs along the deck
   to the cathedral bridge and closes in on the portal in its great door. The portal flares and the hero steps out onto
   the landing, framed with the gate behind them.
2. **Boarding waves** (5, easy to hard). Boats come out of the sky astern and lie alongside to port: the gasbag sloop,
   the harpoon cutter and the grapple hauler, from `tools/airship3d_skiffs.js`. Their crews leap the rail. From the
   third wave on, a gasbag also crosses high overhead and drops boarders on ropes. Monster levels follow the depth.
   The next wave is called as soon as the current one is all over the rail and down to its last two boarders, so its
   boats are already on their way; a boat goes to a dock with no crew alongside, and an empty boat still there casts off.
3. **Mid-boss** (after wave 3). A captain swings across the deck on a rope from his gasbag's balloon, with an escort.
   His gasbag sets out while the last two of wave 3 still stand; his scene waits for a clear deck (and for the gasbag,
   at most a second and a half). Wave 4 is called once he falls and his escort is over the rail.
4. **Parley** (cut scene). The next captain and two **sky-knights** come aboard from a gasbag flying a white flag. The
   hero walks over to meet them (round the fittings and down the stairs, wherever they stood). The talk is one of
   2,000 conversations (`src/data/skytalk.js`):
   - the captain's opener
   - the knights' stories of why they serve Velscour as Air Pirates
   - the hero's pitches
   - the double refusal
   - a truce, and a quiet moment
   Then the twist: the flagship (the galleon from `tools/airship3d.js`) pushes out of a cloud bank off the port
   quarter, her first broadside bursting short in the air. The captain
   leaps away and leaves his knights under his own fleet's guns. They still won't join the hero, but from here on
   they fight at the hero's side.
5. **The flagship's duel.** She closes from far to port over about 26 s of fighting, trading broadsides with the
   ironclad. Her shots land on telegraphed circles and hurt both sides. The ironclad's port battery answers and sets her
   afire. Her boarders come over in threes all the way in (a champion leads every other three), the next three while
   the last of these still stands.
6. **Hooks** (cut scene). The knights throw grappling hooks from the ironclad's rail, and the flagship's crew throw
   back. The chains go taut. Captain one leaps the gap; captain two swings over on a rope from her mainmast. The
   knights then run back and leap into the captains with giant Runeblade strikes.
7. **The last fight.** Two captains (about one and a half heroes tall), the knights and the weather.
8. **Victory** (cut scene). The chains are cut. The knights, still not joining, leap onto the limping flagship to have
   words with whoever fired that broadside. The gate turns blue and becomes the exit. A hoard chest rises on the
   hatch: a rare chest's drop, one item at loot bonus 1.6, and a 35% chance of a guaranteed Epic (20% of those a
   Legendary), capped by item level like every drop. First clear: +1 skill point.

**No standing about** (the rule from docs/HANDOFF.md, October 28, 2026). Arrivals stay staggered, but the moment
nothing on the deck can be hit (`S.calm`, outside cut scenes), `hurry()` in `src/game/skybattle.js` brings the
*next* foe on its way, one arrival at a time so they don't all land at once:
- a boarder in the air finishes its leap or rope slide in a quarter second (boarding entrances only, not a captain's
  moves);
- else a docked boat's next boarder leaps now, and the ramp drops at once;
- else the boat coming in soonest is alongside in 0.4 s;
- else the flyover gasbag speeds to its drop zone and drops now;
- else the next boat, flyover or flagship boarder sets out now (the timers `run.later` tags with a wave).

The flagship closes 6x faster while the deck is clear. The beat before the first wave and before the mid-boss and
parley scenes is 0.3 s or less (it was 2.5 s), and the gap between gauntlet champions is 0.3 s (it was 1.2 s). Measured
frame by frame from the first wave to victory, with boarders dying the instant they land or 1.5 s after, the longest
stretch outside cut scenes with nothing to hit is 0.83-0.93 s. Before, it was 9-12 s every wave and 12-15 s into the
flagship's duel.

**Stories.** Besides the eight weathers there are thirty stories with their own boarders, captains, knights, dialogue
and sometimes a gauntlet of bosses and a master: [SKY_STORIES.md](SKY_STORIES.md).

Cut scenes (`src/game/cinema.js`) can't be skipped, with or without auto-play, but a scene the hero has already watched
(per story; the eight weathers count as one) plays at 20x (`Cine.fast`, `CINE_FAST`; game.js runs that many cut-scene
steps a frame, the voice blips are muted and a "▶▶ x20" note shows in the top bar). `G.char.skySeen` holds
`<story|base>:<scene>`; heroes who fought one before have the weathers' scenes marked seen (`migrate`). Settings ›
"Don't skip cutscenes" (`noSkipCine`, off) plays them at 1x. They show letterbox bars, a scripted
camera (pans, zooms, shakes), title cards, and a dialogue panel with a portrait, the speaker's name, typed text and a
syllable-blip voice. While one plays, there's no input, no auto-play and no monster thinks; only the scene's actors
move. Shots already in the air, lightning, frost and a captain's entrance don't hurt the hero while a scene holds them
still, and the dropped items' names are hidden.

## The cut scenes' camera
The director (`game/skybattle.js`) frames every shot on where its subject **is while the shot plays**. Positions are
read each frame, never when the scene is written, so a boat still out in the clouds when a scene starts is picked up
there and followed in. Cinema camera steps:

| Step | What it does |
|---|---|
| `on: () => [wx, wy]` | eases onto a point (an actor's face, a boat, the flagship) and keeps following it |
| `fit: () => [points]` | frames several points: a group, a knight and the captain they leap at, both ships |
| `pace` | sets a move's length from how far it goes |
| `push`, `drift` | a slow push-in or slide once the camera is there |

- **Dialogue.** Each line is a close-up on its speaker: the hero at 3x the game's zoom, a captain at 2.4x (they stand
  taller), a knight at 3.2x. The frame leans a little toward whoever they answer, and pushes in slowly. The knights'
  tale opens a little wider; the double refusal frames both knights.
- **Wide shots.** A wide shot shows the whole of what matters: both ships for the hooks, the chains coming off, the
  knights' leap onto the flagship.
- **Hand-off.** Every scene ends on the hero, at the game's own zoom, and the zoom eases home after it.
- **Weather.** In fog the clear patch moves to the shot's subject and opens with the zoom. At night the flagship
  carries lanterns along her rail.
- **Phones.** The dialogue font and the letterbox size themselves to the screen, so the panel fits a phone on its side.
- **Floor art.** While a scene moves the zoom, the floor's baked chunks are a second set at zoom steps 12% apart,
  capped at 2.4 device px per world px (render.js `drawFloors`). The game's own set is kept for when the scene ends.
- **Tests.** `skyship.js` checks that every spoken line frames its speaker between the bars, and that the flagship is
  in the shot under her title card.

## The captains' moves
Each captain draws from their own moves (`AIR_CAPTAIN_ROWS` in `src/data/airpirates.js`) plus three ship moves:

| Move | What it does |
|---|---|
| `crew` | boarders over the rail |
| `hook` | a chain that drags the hero in |
| `leap` | lands on the hero with a shockwave |
| `barrage` | the flagship's guns, or a powder volley without her |
| `storm` | lightning |
| `smoke` | vanishes and steps out behind the hero |
| `climb` | up onto the bridge spire, a bridge corner, a turret dome or the stern crest; a taunt, then a dive onto the hero |
| `swing` | a rope off the bridge spire or the flagship's rigging, a long swing through the hero, hitting the hero's side along the path |
| `rappel` | boarders slide down ropes out of the sky round the hero |

## The knights
Two of the ten townsfolk knights (`src/data/townsfolk.js`) are recoloured with bright hues that don't clash: two hues a
third to a half of the wheel apart, saturated and lifted. They act their lines with their sheet's poses plus scripted
motions (`KNIGHT_ACTS`: laugh, cry, rage, flex, dance, spin, salute, swoon, faint, hop, point, shrug, bow, attack;
drawn through `n.pose` in `drawNpc`). As allies they chase the nearest pirate near the hero and strike. Each strike is
the Death Knight's 3D Runeblade (`src/gfx/runeblade3d.js`) drawn only for the strike, in a palette turned to that
knight's armour hue, with a glowing trail in the same colour. They are townsfolk records, not creatures: nothing can
hit them.

## The eight scenarios (`src/data/skybattle.js`)
| Id | Name | Weather | What the weather does |
|---|---|---|---|
| clear | The Black-Sail Ambush | Clear Skies | — |
| storm | Eye of the Storm | Thunderstorm | lightning strikes the deck (telegraphed, hurts both sides) |
| night | Lanterns at Midnight | Moonless Night | darkness: the lanterns, braziers, gate and the boats' lights light the deck |
| fog | Ghosts in the Fog | Fog Bank | a grey bank you only see a few tiles into; boats loom out of it |
| sunset | Red Sky Reckoning | Sunset | — |
| gale | Against the Gale | Gale | gusts shove everyone (pirates too) across the deck |
| blizzard | Frostbitten Rigging | Blizzard | frost gusts sweep a line across the deck: cold damage that slows |
| ash | Ember Skies | Ashfall | burning embers land and set patches of deck alight |

Each scenario has its own sky, clouds, ambience, boat mix, mid-boss and final pair of captains. A hero never gets the
same scenario twice in a row (`G.char.lastSkyVariant`).

## Art
- **The ironclad** (`tools/airship3d_ironclad.js`) is baked like the Castle (docs/CASTLE_3D.md) by
  `tools/skyship_bake.html`. The game camera's render is cut into one piece per tile (624 pieces).
  `src/world/skyship.js` holds the hull curves and deck plan that both the model and the game read, and builds the
  walk map: 290 deck tiles; the grand stairs, quarterdeck and forecastle as height levels; bulwarks, the bridge,
  helm, turrets and braziers solid.
- **Drawing.** The terrain engine draws the pieces (`map.c3only`: no ground of their own; `map.occStruct`: every
  structure tile redraws over whoever stands behind it). Animated things are separate sprites, all baked in four
  frames: the galleon, the three boats (ramp up and down) and the ironclad's engine props. The hook, chain links and
  cannonball are baked from the same materials. Everything else in motion is effects in `src/gfx/skyship.js`:
  - the sky and pixel clouds, wind streaks, and the rain, snow, ash and fog
  - the furnace glow, braziers, lift crystals and lanterns
  - the gate's swirl, drawn in the door's own plane in the game's portal colours
  - ropes, chains, cannon shot, lightning and the knights' blades
  - the parley gasbag's white flag (16 baked frames), the cloud bank the flagship comes out of, and the cloud the
    arrival's camera comes down through
- **The Air Pirates** (the user's Air Pirate Expansion Pack): 30 boarders and 10 captains in `assets/source/enemies/air/`,
  packed by `python tools/process_assets.py enemies air`, catalogued in `src/data/airpirates.js`. Like the Breach's
  creatures, they never join the regular bestiary's draws.
- **Bake output.** Three atlas pages, about 8.4 MB of lossless WebP (`assets/tiles/skyship/`). The source PNGs
  (`assets/source/skyship/out/`) are not committed.

## Limits
- The camera is the game's 2D iso camera. Cut scenes pan, track, zoom, push in and shake; they don't orbit, because
  the art is baked from one angle.
- The boats lie alongside to port only. Port is behind the deck in the iso view, so they never hide it.
- The Credits (`src/ui/credits.js`) draws every bestiary monster with generated lines, the Air Pirates included.
- Not verified: how it plays on a real phone (the cut scenes were checked at 844 x 390 in headless Chromium), and
  Safari or Firefox.
