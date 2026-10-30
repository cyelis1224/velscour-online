// Top-down plans of the Castle variants (src/data/castles.js) for designing and checking layouts, no browser:
//   node tools/castle_map.mjs [ids|all] [seed]   -> tools/tests/out/castle_map_<id>.png
// 3 px a tile, north up (the game's view turns this 45 degrees). Ground by material; masonry by kind and height (walks
// pale, towers and gates darker, buildings brown); props as dots, village and ward buildings as boxes; red rings: the
// scenario sites, green: the start, blue: the exit. Grid lines every 10 tiles, heavier every 50.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const pack = json('assets/tiles/castle/pack.json'), trees = json('assets/tiles/dark_forest/trees.json'), ramparts = json('assets/tiles/castle/ramparts.json');
globalThis.fetch = async (url) => ({ ok: true, json: async () => String(url).includes('dark_forest') ? trees : String(url).includes('ramparts') ? ramparts : pack });
globalThis.Image = class { set src(_) { queueMicrotask(() => this.onload?.()); } };
const imp = (p) => import(pathToFileURL(path.join(root, p)));
const { loadCastlePack } = await imp('src/gfx/castle.js');
const { loadDarkForestTrees } = await imp('src/gfx/darkforest.js');
const { A } = await imp('src/core/assets.js');
const { BIOME_BY_ID } = await imp('src/data/biomes.js');
const { generateOverworld } = await imp('src/world/overworld.js');
const { castle3d, K } = await imp('src/world/castle3d.js');
const { CASTLE_VARIANTS } = await imp('src/data/castles.js');
const { MAT } = await imp('src/gfx/castleground.js');
await loadCastlePack(); await loadDarkForestTrees();
A.town = { meta: json('assets/tiles/town/town.json'), objects: {}, ground: {} };
globalThis.CASTLE_DEBUG = true;   // draw it even if a route is blocked

const arg = process.argv[2] || 'all', seed = +process.argv[3] || 1808;
const ids = arg === 'all' ? CASTLE_VARIANTS.map((v) => v.id) : arg.split(',');
const OUT = path.join(root, 'tools/tests/out'); fs.mkdirSync(OUT, { recursive: true });
const PX = 3;
const MATC = { [MAT.meadow]: [96, 128, 60], [MAT.lush]: [70, 110, 48], [MAT.forest]: [40, 70, 34], [MAT.dirt]: [130, 104, 70], [MAT.road]: [168, 140, 96],
  [MAT.mud]: [100, 80, 54], [MAT.field]: [140, 116, 60], [MAT.sand]: [200, 184, 130], [MAT.cobble]: [150, 146, 136], [MAT.pave]: [170, 166, 156],
  [MAT.dark]: [90, 88, 84], [MAT.moss]: [110, 130, 90], [MAT.plank]: [140, 100, 60], [MAT.water]: [50, 90, 160], [MAT.hall]: [180, 150, 110],
  [MAT.grave]: [80, 96, 70], [MAT.bright]: [120, 150, 70], [MAT.wall]: [70, 66, 64], [MAT.mid]: [86, 118, 56] };

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const id of ids) {
  const L = castle3d(id), gen = generateOverworld(19, BIOME_BY_ID.castle, seed, id), m = gen.map, W = m.w, H = m.h;
  const img = Buffer.alloc(W * PX * H * PX * 3);
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W * PX || y >= H * PX) return; const o = (y * W * PX + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
  const tile = (tx, ty, c) => { for (let dy = 0; dy < PX; dy++) for (let dx = 0; dx < PX; dx++) put(tx * PX + dx, ty * PX + dy, c); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let c = MATC[m.castleMat[i]] || [90, 120, 60];
    if (L.struct[i] || L.bld[i]) {
      const k = L.kind[i], lv = L.hgt[i], t = Math.min(1, lv / 50);
      c = k === K.keep ? [120, 84, 60] : k === K.floor ? [196, 170, 130] : k === K.door ? [230, 200, 120] : k === K.gate ? [100, 80, 130] : k === K.tower ? [150, 120, 120]
        : k === K.stair ? [230, 220, 90] : k === K.parapet ? [60, 60, 66] : k === K.pier || k === K.bridge ? [150, 120, 80] : [200 - t * 60, 200 - t * 60, 210 - t * 50];
    } else if (m.block[i] && m.castleMat[i] !== MAT.water) c = c.map((v) => v * 0.55);
    if ((x % 50 === 0 || y % 50 === 0)) c = [255, 255, 255];
    else if (x % 10 === 0 || y % 10 === 0) c = c.map((v) => Math.min(255, v + 28));
    tile(x, y, c);
  }
  for (const b of gen.buildings) for (let y = b.y0; y < b.y0 + b.fp; y++) for (let x = b.x0; x < b.x0 + b.fp; x++) tile(x, y, [170, 70, 50]);
  for (const p of gen.props) { if (p.c3) continue; const c = p.tree ? [20, 50, 20] : p.tent ? [220, 200, 160] : p.light ? [255, 200, 60] : [30, 30, 30]; put(Math.floor(p.x * PX), Math.floor(p.y * PX), c); }
  const ring = (cx, cy, r, c) => { for (let a = 0; a < 64; a++) put(Math.round(cx * PX + Math.cos(a / 64 * 6.283) * r), Math.round(cy * PX + Math.sin(a / 64 * 6.283) * r), c); };
  gen.sites.forEach((s) => ring(s[0], s[1], 7, [255, 40, 40]));
  ring(gen.start[0], gen.start[1], 9, [40, 255, 60]); ring(gen.exit[0], gen.exit[1], 9, [60, 160, 255]);
  for (const s of gen.spawns) put(Math.floor(s.x * PX), Math.floor(s.y * PX), [255, 0, 255]);
  for (const p of m.rampartPosts) ring(p[0], p[1], 2, [255, 140, 0]);
  const file = path.join(OUT, `castle_map_${id}.png`);
  fs.writeFileSync(file, png(W * PX, H * PX, img));
  console.log(id, gen.variant?.name || '', 'props', gen.props.length, 'buildings', gen.buildings.length, '->', path.relative(root, file));
}
