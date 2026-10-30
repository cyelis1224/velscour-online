# VELScour Material Texture Pack

A texture-only set in the VELScour / Grim Nocturne pixel-art direction. It contains 35 distinct 160×160 seamless square RGB textures: 10 ship-deck planks, 10 metallic surfaces, 5 sail and cloth materials, 5 wood-grain surfaces, and 5 metallic gold surfaces.

The 160×160 source tile matches the square material template used by the existing biome source art. Each sample is palette-limited to no more than 8 opaque colors, following the material-sample guidance. Opposing edge pixels match exactly for horizontal and vertical repeat. Use nearest-neighbor filtering in the game engine.

`textures/` holds individual game-ready PNGs, `atlases/` provides tightly packed category sheets, and `manifest.json` / `manifest.csv` list IDs, category, dimensions, color count, source cell, and repeat check. `Texture_Index.png` is a labeled visual index.
