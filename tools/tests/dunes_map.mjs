// The Sea of Sand's dune variants (src/data/dunes.js, world/dunes.js), no browser: every variant over a few seeds.
// The route must join the start, every camp and the pyramid's door; the tomb its entrance to the burial chamber, seals
// open; every step between walkable neighbours within the climb limit; the camps, rooms and props where they belong.
// Writes a top-down plan of each (tools/tests/out/dunes_map_<id>.png): ground by height, rock dark, water blue, the
// route yellow, camps red, the pyramid gold, the tomb's rooms by depth, seals magenta.
//   node tools/tests/dunes_map.mjs [ids|all] [seeds]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const pack = json('assets/tiles/sea_of_sand/pack.json');
globalThis.fetch = async () => ({ ok: true, json: async () => pack });
globalThis.Image = class { set src(_) { queueMicrotask(() => this.onload?.()); } };
const imp = (p) => import(pathToFileURL(path.join(root, p)));
await (await imp('src/gfx/seaofsand.js')).loadSeaOfSandPack();
const { BIOME_BY_ID } = await imp('src/data/biomes.js');
const { generateDunes, DREG } = await imp('src/world/dunes.js');
const { DUNE_VARIANTS } = await imp('src/data/dunes.js');
const { ART_BY_ID } = await imp('src/data/bestiary.js');
const OUT = path.join(root, 'tools/tests/out'); fs.mkdirSync(OUT, { recursive: true });

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const arg = process.argv[2] || 'all', SEEDS = +process.argv[3] || 6;
const ids = arg === 'all' ? DUNE_VARIANTS.map((v) => v.id) : arg.split(',');
const fail = (m) => { console.error('FAIL ' + m); process.exitCode = 1; };
for (const v of DUNE_VARIANTS) {
  for (const l of Object.values(v.roster)) for (const id of l) if (!ART_BY_ID[id]) fail(`${v.id}: no art ${id}`);
  for (const [id] of v.bosses) if (!ART_BY_ID[id]) fail(`${v.id}: no boss art ${id}`);
}
for (const id of ids) {
  const vi = DUNE_VARIANTS.findIndex((v) => v.id === id);
  let worst = 0, ms = 0, last = null;
  for (let s = 0; s < SEEDS; s++) {
    const seed = 1000 + s * 7919 + vi * 131, t0 = performance.now(), gen = generateDunes(12, BIOME_BY_ID.sea_of_sand, seed, vi), m = gen.map, dv = gen.dunes;
    ms = Math.max(ms, performance.now() - t0); last = gen;
    const tag = `${id} seed ${seed}`;
    if (gen.variant.id !== id) fail(`${tag}: built ${gen.variant.id}`);
    if (!dv.okTrek) fail(`${tag}: the route does not join the start to ${dv.cut.join(' ')}`);
    if (!dv.okTomb) fail(`${tag}: the tomb does not join its entrance to the burial chamber`);
    if (dv.camps.length !== v_(id).dune.camps) fail(`${tag}: ${dv.camps.length} camps`);
    if (dv.rooms.filter((r) => r.room).length < 6 || dv.seals.length < 6) fail(`${tag}: rooms ${dv.rooms.filter((r) => r.room).length}, seals ${dv.seals.length}`);
    if (dv.E < 160) fail(`${tag}: the dunes are only ${dv.E} tiles across`);
    // the climb limit between walkable neighbours (3 levels), but for the oases' rims
    let steep = 0;
    for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
      const i = y * m.w + x;
      if (!m.t[i]) continue;
      for (const j of [i + 1, i + m.w]) if (m.t[j] && Math.abs(m.hgt[i] - m.hgt[j]) > 4) steep++;
    }
    worst = Math.max(worst, steep);
    if (steep > 20) fail(`${tag}: ${steep} steps over the climb limit`);
    if (dv.chamber.h > dv.rooms[0].h - 12) fail(`${tag}: the burial chamber is only ${(dv.rooms[0].h - dv.chamber.h).toFixed(1)} tiles below the entrance`);
    if (gen.spawns.length < 12) fail(`${tag}: ${gen.spawns.length} spawns`);
    if (gen.props.length < 120) fail(`${tag}: ${gen.props.length} props`);
  }
  // the plan of the last seed
  const m = last.map, dv = last.dunes, W = m.w, H = m.h, PX = 2, img = Buffer.alloc(W * PX * H * PX * 3);
  const put = (x, y, c) => { for (let dy = 0; dy < PX; dy++) for (let dx = 0; dx < PX; dx++) { const o = ((y * PX + dy) * W * PX + x * PX + dx) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, h = m.hgt[i] / (39.19 / 4);
    let c;
    if (m.wet[i] === 2) c = [50, 90, 170];
    else if (!m.t[i]) c = dv.inside(x) ? [40, 34, 30] : [120 + h * 6, 96 + h * 5, 60];
    else if (dv.inside(x)) { const d = Math.min(1, -h / 20); c = [220 - d * 120, 200 - d * 120, 160 - d * 60]; }
    else c = [200 + h * 8, 176 + h * 8, 120 + h * 6];
    if (m.block[i] && m.t[i]) c = c.map((q) => q * 0.6);
    put(x, y, c.map((q) => Math.max(0, Math.min(255, q))));
  }
  const P = dv.pyramid;
  for (let y = P.pc - P.half; y <= P.pc + P.half; y++) for (let x = P.pc - P.half; x <= P.pc + P.half; x++) put(x, y, [230, 190, 60]);
  for (const [x, y] of dv.route) put(Math.floor(x), Math.floor(y), [250, 230, 60]);
  for (const c of dv.camps) for (let a = 0; a < 6.28; a += 0.2) put(Math.floor(c.x + Math.cos(a) * c.r), Math.floor(c.y + Math.sin(a) * c.r), [230, 50, 40]);
  for (const s of dv.seals) for (const i of s.tiles) put(i % W, (i / W) | 0, [230, 40, 230]);
  put(Math.floor(dv.start[0]), Math.floor(dv.start[1]), [40, 230, 60]); put(Math.floor(P.door[0]), Math.floor(P.door[1]), [40, 230, 230]);
  fs.writeFileSync(path.join(OUT, `dunes_map_${id}.png`), png(W * PX, H * PX, img));
  console.log(`${id.padEnd(9)} ${dv.E} + tomb ${dv.IS}: grid ${W}x${H}, camps ${dv.camps.length}, oases ${dv.oases.length}, rooms ${dv.rooms.filter((r) => r.room).length}, seals ${dv.seals.length}, depth ${(dv.rooms[0].h - dv.chamber.h).toFixed(1)} tiles, props ${last.props.length}, spawns ${last.spawns.length}, torches ${dv.torches.length}, worst steps ${worst}, ${Math.round(ms)} ms`);
}
function v_(id) { return DUNE_VARIANTS.find((v) => v.id === id); }
console.log(process.exitCode ? 'DUNES MAP FAILED' : 'DUNES MAP OK');
