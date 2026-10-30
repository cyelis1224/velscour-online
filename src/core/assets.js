// Asset loading + derived (recoloured / rescaled) sprite caches.
import { makeCanvas, recolor, scaleImage, pageAtlas } from './util.js';
import { G } from '../state.js';
import { preloadWallTorchHolders } from '../gfx/walltorches.js';
import { preloadWallHangings } from '../gfx/wallhangings.js';
import { preloadIsoFix, isoFix, isoFixImage } from '../gfx/isofix.js';
import { approvedBiomeArt, preloadApprovedBiomeArt, preloadBiomeVariantArt, preloadOverworldScatterArt } from '../gfx/approvedbiomeart.js';
import { preloadApprovedHeavenlyArtwork } from '../gfx/heavenlymonsters.js';
import { TW } from './view.js';
import { loadReplacementArt } from './replacementart.js';
import { loadEnemyArt } from './enemyart.js';
import { preloadSong } from './audio.js';

export const CLASS_IDS = [
  'paladin', 'ranger', 'wizard', 'necromancer',
  'barbarian', 'dragoon', 'totem_master', 'death_knight',
  'arcane_sorcerer', 'carrion_witch', 'bard', 'slime_lord',
  'boomerang_knight', 'lancer', 'dragon_knight', 'gunner',
];

export const A = {
  classes: {}, // id -> HTMLImageElement
  classScaled: {}, // `${id}|${h}|${palette}` -> canvas
  hud: null, hudGeo: null, logo: null, potions: {},
  packs: {}, // biome pack id -> { floors, walls, scatter, meta } (assets/tiles/<id>/), a Promise while loading
  town: null, // the town pack (assets/tiles/town/, tools/townpack.py): { ground, objects, meta }
  chestImg: null, chestMeta: null, // assets/props/chests.*
  gibImg: null, gibMeta: null, // assets/sprites/gibs.* (tools/gibpack.py): { set: [[x, y, w, h], ...] }
  boneImg: null, boneMeta: null, // assets/sprites/bones.* (tools/bones3d_bake.js): bone gibs' data sheet (gfx/bonegibs.js)
  biomeSets: {}, // `${biome}|${pack}` -> recoloured tile set (biomeTileSet)
};

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Failed to load ' + src));
    img.src = src;
  });
}
async function loadJSON(src) {
  const r = await fetch(src);
  if (!r.ok) throw new Error('Failed to load ' + src);
  return r.json();
}

export async function loadAssets(progress) {
  const jobs = [];
  let done = 0, song = 0;   // the title song is ~3.6 MB, so it counts as a third of the bar by its own bytes
  const report = () => progress && progress(done / jobs.length * 2 / 3 + song / 3);
  const track = (p) => p.then((v) => { done++; report(); return v; });
  jobs.push(track(loadReplacementArt()));
  jobs.push(track(preloadBiomeVariantArt()));
  jobs.push(track(preloadOverworldScatterArt()));
  jobs.push(track(preloadWallHangings()));
  jobs.push(track(preloadIsoFix()));
  jobs.push(track(preloadSong('hymn_of_the_abyss', (k) => { song = k; report(); }).then(() => { song = 1; })));
  for (const id of CLASS_IDS) jobs.push(track(loadImage(`assets/sprites/classes/${id}.webp`).then((img) => { A.classes[id] = img; })));
  jobs.push(track(loadImage('assets/ui/hud.webp').then((i) => { A.hud = i; })));
  jobs.push(track(loadJSON('assets/ui/hud.json').then((j) => { A.hudGeo = j; })));
  jobs.push(track(loadImage('assets/ui/logo.webp').then((i) => { A.logo = i; })));
  for (const c of ['red', 'blue', 'purple', 'orange']) jobs.push(track(loadImage(`assets/ui/potion_${c}.png`).then((i) => { A.potions[c] = i; })));
  jobs.push(track(loadPack(DEFAULT_PACK)));
  jobs.push(track(Promise.all([loadImage('assets/tiles/town/ground.webp'), loadImage('assets/tiles/town/objects.webp'), loadJSON('assets/tiles/town/town.json')])
    .then(([ground, objects, meta]) => { A.town = { ground, objects, meta }; })));
  jobs.push(track(loadImage('assets/props/chests.webp').then((i) => { A.chestImg = i; })));
  jobs.push(track(loadImage('assets/sprites/gibs.webp').then((i) => { A.gibImg = i; })));
  jobs.push(track(loadJSON('assets/sprites/gibs.json').then((j) => { A.gibMeta = j; })));
  jobs.push(track(loadImage('assets/sprites/bones.webp').then((i) => { A.boneImg = i; })));
  jobs.push(track(loadJSON('assets/sprites/bones.json').then((j) => { A.boneMeta = j; })));
  jobs.push(track(loadJSON('assets/props/chests.json').then((j) => { A.chestMeta = j; })));
  await Promise.all(jobs);
}

// Biome packs (assets/tiles/<pack>/, imported by tools/biomepack.py; docs/ART.md). Every dungeon biome draws from
// one of the painted packs, palette swapped and limited to its themed `part` (data/biomes.js).
const DEFAULT_PACK = 'catacombs';

async function loadPack(id) {
  return A.packs[id] || (A.packs[id] = Promise.all(['floors', 'walls', 'scatter'].map((n) => loadImage(`assets/tiles/${id}/${n}.webp`)).concat(loadJSON(`assets/tiles/${id}/pack.json`)))
    .then(([floors, walls, scatter, meta]) => (A.packs[id] = { floors, walls, scatter, meta: { ...meta, pack_id: id } })).catch((e) => { delete A.packs[id]; throw e; }));
}
const ready = (v) => v && !(v instanceof Promise);
/** Every pack a biome's tile set draws on: floors and props from `pack`, walls/arches/doors from `wallPack`,
 * more props from `morePacks` and more floors from `moreFloors` ([[pack, 1-based ranges], ...]). */
const biomePacks = (b) => [...new Set([b.pack || DEFAULT_PACK, b.wallPack, ...[...(b.morePacks || []), ...(b.moreFloors || [])].map((m) => m[0])].filter(Boolean))];

/** Fetch a biome's pack and the monster art. Safe to call repeatedly. */
export function loadBiomeArt(biome) {
  const dungeon = biome && (!biome.overworld || biome.packArt) && biome.id !== 'town'; // packArt: an overworld drawn from a biome pack
  return Promise.all([
    loadEnemyArt().catch((e) => console.warn(e)), // monsters fall back to their pixel sprites
    ...(dungeon ? biomePacks(biome).map(loadPack) : []),
    dungeon ? preloadApprovedBiomeArt(biome.id) : Promise.resolve(null),
    biome?.id === 'heavenly' ? preloadApprovedHeavenlyArtwork() : Promise.resolve(null),
    dungeon ? preloadWallTorchHolders(biome) : Promise.resolve(null),
    preloadWallHangings(biome?.id),
  ]);
}

/** A class sprite scaled to `h` px tall, optionally palette swapped (for NPCs). */
export function classSprite(id, h, palette = null) {
  const key = `${id}|${h}|${palette ? JSON.stringify(palette) : ''}`;
  let c = A.classScaled[key];
  if (!c) {
    let src = A.classes[id];
    if (palette) src = recolor(src, palette);
    c = scaleImage(src, h);
    A.classScaled[key] = c;
  }
  return c;
}

/** Floors cut to their diamonds (plus a pixel for the seams): some packs' feature tiles carry a dark slab edge
 * below the diamond that would show over the next tile. Recoloured atlases are cut in place. */
function clipFloors(img, cells) {
  const c = img instanceof HTMLCanvasElement ? img : makeCanvas(img.width, img.height);
  const g = c.getContext('2d');
  if (c !== img) g.drawImage(img, 0, 0);
  g.save();
  g.globalCompositeOperation = 'destination-in';
  g.beginPath();
  for (const { x, y, w, h } of cells) {
    g.moveTo(x + w / 2, y - 1); g.lineTo(x + w + 2, y + h / 2); g.lineTo(x + w / 2, y + h + 1); g.lineTo(x - 2, y + h / 2); g.closePath();
  }
  g.fill();
  g.restore();
  return c;
}

/**
 * Build (and cache) the tile set for a biome: its pack (loadBiomeArt first; until then the default pack stands in),
 * recoloured by `biome.palette` (walls by `wallPalette` when set). Entries are {img,sx,sy,w,h} rects plus:
 * - floors [{lum, seamless, name}]: `bases` are the self-seamless ones (indices), `features` the rest
 * - walls[family][mask] = variants, each a list of arm slices {arm:'NE'|'SE'|'SW'|'NW'|'c', ox, oy}
 *   (ox/oy: native px from the node's ground point; draw at `k` world px per native px)
 * - arches[design][dir] = slices {a (tiles along the span), ox, oy}; archSpan[design] = outer span in tiles (3, 5, 7); doors[design][dir].closed|open = slices
 *   {part:'L'|'R'|'leaf', du, dv (depth anchor, tiles from the doorway centre), ox, oy}
 * - scatter [{name, ox, oy, fp (footprint in tiles), block}], chest {closed, open, rareClosed, rareOpen}
 */
export function biomeTileSet(biome) {
  // until all of the biome's packs are in, the default pack stands in
  const full = biomePacks(biome).every((p) => ready(A.packs[p]));
  const id = full ? biome.pack || DEFAULT_PACK : DEFAULT_PACK, wid = full ? biome.wallPack || id : id;
  const key = biome.id + '|' + id + '|' + wid;
  if (A.biomeSets[key]) return A.biomeSets[key];
  // keep memory bounded: each recoloured set is ~25 MB of canvas
  const keys = Object.keys(A.biomeSets).filter((k) => !k.startsWith('town|'));
  while (keys.length >= 2) delete A.biomeSets[keys.shift()]; // a mixed level holds two sets
  const pk = A.packs[id], m = pk.meta, wm = A.packs[wid].meta, pal = biome.palette, wallPal = biome.wallPalette || pal;
  const floorImg = clipFloors(pal ? recolor(pk.floors, pal) : pk.floors, m.floors);
  const wallImg = wallPal ? recolor(A.packs[wid].walls, wallPal) : A.packs[wid].walls;
  const scatImg = pal ? recolor(pk.scatter, pal) : pk.scatter;
  const wallPage = pageAtlas(wallImg);
  const rect = (img, r) => ({ ...(img === wallImg ? wallPage(r[1], r[2]) : { img, sx: r[1], sy: r[2] }), w: r[3], h: r[4], ox: r[5], oy: r[6] });
  const set = { pack: id, k: TW / m.tile[0], zscale: m.zscale, floors: [], bases: [], features: [], walls: {}, arches: {}, doors: {}, scatter: [], chest: null };
  m.floors.forEach((f, i) => {
    set.floors.push({ img: floorImg, sx: f.x, sy: f.y, w: f.w, h: f.h, lum: f.lum, seamless: f.seamless, name: f.name });
    (f.seamless ? set.bases : set.features).push(i);
  });
  for (const [fam, masks] of Object.entries(wm.walls)) {
    set.walls[fam] = {};
    for (const [mask, vars] of Object.entries(masks)) set.walls[fam][mask] = vars.map((v) => v.map((r) => ({ ...rect(wallImg, r), arm: r[0] })));
  }
  set.families = Object.keys(set.walls);
  set.archSpan = {};
  for (const [des, dirs] of Object.entries(wm.arches)) {
    set.archSpan[des] = (wm.archSpan && wm.archSpan[des]) || 3;
    set.arches[des] = {};
    for (const [d, sl] of Object.entries(dirs)) set.arches[des][d] = sl.map((r) => ({ ...rect(wallImg, r), a: r[0] }));
  }
  for (const [des, dirs] of Object.entries(wm.doors)) {
    set.doors[des] = {};
    for (const [d, st] of Object.entries(dirs)) {
      set.doors[des][d] = {};
      for (const [k, sl] of Object.entries(st)) set.doors[des][d][k] = sl.map((r) => ({ ...rect(wallImg, r), part: r[0][0], du: r[0][1], dv: r[0][2] }));
    }
  }
  // props tools/isofix.py re-projected onto the 2:1 grid come from its atlas (recoloured the same way)
  const scat = (p, img) => {
    const src = 'pack:' + p.meta.pack_id, fimg = isoFixImage(src), fix = fimg && (pal ? recolor(fimg, pal) : fimg);
    return p.meta.scatter.map((s) => {
      const f = fix && isoFix(src, s.name);
      return { img, sx: s.x, sy: s.y, w: s.w, h: s.h, ox: s.ox, oy: s.oy, ...(f && { ...f, img: fix }), fp: s.fp, block: s.block, name: s.name };
    });
  };
  const inR = (rs, i) => !rs || rs.some(([a, b]) => i + 1 >= a && i + 1 <= b);
  const part = full && biome.part;
  set.scatter = scat(pk, scatImg).filter((s, i) => !part || inR(part.scatter, i));
  if (part) {
    set.bases = set.bases.filter((i) => inR(part.floors, i));
    set.features = set.features.filter((i) => inR(part.floors, i));
    if (part.families) set.families = set.families.filter((f) => part.families.includes(f));
    for (const k of ['arches', 'doors']) if (part[k]) for (const d of Object.keys(set[k])) if (!part[k].includes(d)) delete set[k][d];
  }
  if (full) for (const [p, ranges] of biome.morePacks || []) {
    const src = A.packs[p];
    set.scatter.push(...scat(src, pal ? recolor(src.scatter, pal) : src.scatter).filter((s, i) => inR(ranges, i)));
  }
  // floors borrowed from other packs in the biome's palette: their seamless ones join the pavings, the rest the
  // feature tiles (data/biomes.js moreFloors)
  if (full) for (const [p, ranges] of biome.moreFloors || []) {
    const src = A.packs[p], cells = src.meta.floors, img = clipFloors(pal ? recolor(src.floors, pal) : src.floors, cells);
    cells.forEach((f, i) => {
      if (!inR(ranges, i)) return;
      (f.seamless ? set.bases : set.features).push(set.floors.length);
      set.floors.push({ img, sx: f.x, sy: f.y, w: f.w, h: f.h, lum: f.lum, seamless: f.seamless, name: f.name });
    });
  }
  // town-pack furniture (anvils, scroll racks, market tables...), each cut out and recoloured on its own
  if (full && A.town) for (const name of biome.townProps || []) {
    const r = A.town.meta.objects[name];
    if (!r) continue;
    const f = isoFix('town', name) || { img: A.town.objects, sx: r[0], sy: r[1], w: r[2], h: r[3], ox: r[4], oy: r[5] };
    const fp = A.town.meta.footprints[name] || [0.5, 0.5];
    set.scatter.push({ img: recolor(f.img, pal, f.sx, f.sy, f.w, f.h), sx: 0, sy: 0, w: f.w, h: f.h, ox: f.ox, oy: f.oy, fp: fp[0], block: true, name });
  }
  // the temple biomes' approved painted floors and props, unrecoloured, on top of the pack's own; their floors
  // are listed several times so they show about as often as all of the pack's feature tiles together
  const extra = full && set.bases.length && approvedBiomeArt(biome.id, set.floors[set.bases[0]]);
  if (extra) {
    const n = set.features.length;
    for (const f of extra.floors) { for (let j = 0; j < Math.max(1, n / extra.floors.length); j++) set.features.push(set.floors.length); set.floors.push(f); }
    set.scatter.push(...extra.scatter);
  }
  if (A.chestImg && A.chestMeta) {
    const img = pal ? recolor(A.chestImg, pal) : A.chestImg;
    const c = A.chestMeta;
    const e = (r) => ({ img, sx: r.x, sy: r.y, w: r.w, h: r.h });
    set.chest = { closed: e(c.closed), open: e(c.open), rareClosed: e(c.rareClosed), rareOpen: e(c.rareOpen) };
  }
  A.biomeSets[key] = set;
  return set;
}

/**
 * A level of `biome` mixed with a like-coloured `other` (biomes.js mixPartner): floors from both palettes (`split`
 * marks where the second set starts; dungeon.js paves whole regions with one or the other), walls, arches, doors
 * and scatter from one of them (`wallsFromOther`).
 */
export function mixedTileSet(biome, other, wallsFromOther = false) {
  const a = biomeTileSet(biome);
  if (!other) return a;
  const b = biomeTileSet(other);
  const w = wallsFromOther ? b : a, n = a.floors.length;
  return {
    ...w,
    floors: [...a.floors, ...b.floors], bases: a.bases, features: a.features,
    split: n, chest: a.chest, mixed: other.id, parts: [a, b],
  };
}

/** Drop cached recoloured tile sets the new level doesn't use (~30 MB of canvas each; iOS caps a page's canvas
 * memory). The town's set stays. Call with the level's tile set once it is built. */
export function keepTileSets(tileset) {
  const keep = tileset ? tileset.parts || [tileset] : [];
  for (const k of Object.keys(A.biomeSets)) if (!k.startsWith('town|') && !keep.includes(A.biomeSets[k])) delete A.biomeSets[k];
}

/** Make a canvas icon from a potion image (for inventory / shop). */
export function potionIcon(color, size = 48) {
  const img = A.potions[color];
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  const s = Math.min(size / img.width, size / img.height) * 0.92;
  x.drawImage(img, (size - img.width * s) / 2, (size - img.height * s) / 2, img.width * s, img.height * s);
  return c;
}
