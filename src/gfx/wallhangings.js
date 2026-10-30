// Fifty biome-tinted wall ornaments, each with four authored isometric wall
// views. The view contract intentionally matches walltorches.js.
import { isoX, isoY } from '../core/view.js';
import { drawFiltered } from '../core/util.js';

const ROOT = 'assets/fx/wall_hangings/';
const CASTLE_KEEP_ATLAS = 'assets/tiles/castle_keep/wall_hangings.webp';
const CELL = 96, DISPLAY = 42, HANG = 78;
const atlases = new Map(), loading = new Map();
let castleKeepAtlas = null, castleKeepLoading = null;
const HUE = Object.freeze({
  frozen: 190, ice_temple: 194, sunken: 160, storm: 200, crystal: 170,
  abyss: 210, necropolis: 220, void: 260, shadow: 250, astral_plane: 245,
  fungal: 80, plague: 78, sewers: 84, thorn: 100, serpent: 130,
  blood: 350, flesh: 340, throne: 350, hell: 5, forge: 12, molten: 15,
  ashen: 25, desert: 32, desert_temple: 36, gilded: 42, amber: 30,
  heavenly: 46, cathedral: 34, library: 28, shattered: 210,
  obsidian: 260, catacombs: 28, overworld: 108, town: 34,
});

function fetchAtlas(sheet) {
  if (loading.has(sheet)) return loading.get(sheet);
  const promise = new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth === CELL * 4 && img.naturalHeight === CELL * 10) {
        atlases.set(sheet, img); resolve(img);
      } else { console.warn('Wall-hanging atlas has incorrect dimensions', sheet); resolve(null); }
    };
    img.onerror = () => { console.warn('Wall-hanging artwork unavailable', sheet); resolve(null); };
    img.src = `${ROOT}hangings_${sheet + 1}.webp`;
  });
  loading.set(sheet, promise);
  return promise;
}

/** Preload the catalog once before placing its wall-mounted views. */
export function preloadWallHangings(biome = null) {
  const jobs = [0, 1, 2, 3, 4].map(fetchAtlas);
  if ((typeof biome === 'string' ? biome : biome?.id) === 'castle_keep')
    jobs.push(fetchCastleKeepAtlas());
  return Promise.all(jobs);
}

function fetchCastleKeepAtlas() {
  if (castleKeepAtlas) return Promise.resolve(castleKeepAtlas);
  if (castleKeepLoading) return castleKeepLoading;
  castleKeepLoading = new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth === CELL * 2 && img.naturalHeight === CELL * 16) {
        castleKeepAtlas = img; resolve(img);
      } else {
        console.warn('Castle Keep wall-hanging atlas has incorrect dimensions');
        resolve(null);
      }
    };
    img.onerror = () => { console.warn('Castle Keep wall-hanging artwork unavailable'); resolve(null); };
    img.src = CASTLE_KEEP_ATLAS;
  });
  return castleKeepLoading;
}

/** Number of designs available to the wall placer for a biome. */
export function wallHangingCount(biome) {
  return (typeof biome === 'string' ? biome : biome?.id) === 'castle_keep' ? 16 : 50;
}

export function preloadCastleKeepWallHangings() {
  return fetchCastleKeepAtlas();
}

/** Match the established wall-torch contract: f/back, b/back, b/front, f/front. */
export function wallHangingAngle(dir, front = false) {
  return dir === 'f' ? (front ? 3 : 0) : (front ? 2 : 1);
}

export function wallHangingAtWallSegment(segment, design) {
  return {
    mountX: segment.mx, mountY: segment.my, dir: segment.dir,
    front: !!segment.front,
    depth: segment.depth + (segment.front ? 0.57 : -0.34),
    design,
  };
}

/** Place one authored view on the outward facade of a 3×3 town-pack building. */
export function wallHangingAtBuilding(building, sx, design) {
  const mountX = sx ? building.x0 + 3 : building.x0 + 1.5;
  const mountY = sx ? building.y0 + 1.5 : building.y0 + 3;
  return { mountX, mountY, dir: sx ? 'f' : 'b', front: true,
    depth: mountX + mountY + 0.05, design };
}

export function wallHangingRect(item, biome = null) {
  const castleKeep = (typeof biome === 'string' ? biome : biome?.id) === 'castle_keep';
  // Castle Keep supplies the two front-facing wall planes only. Use those
  // views for either depth side so its authored art is always player-facing.
  // every view is drawn flat on its wall plane (tools/build_wall_hangings.py), centred on the mount
  const x = isoX(item.mountX, item.mountY), y = isoY(item.mountX, item.mountY);
  return [x - DISPLAY / 2, y - HANG, DISPLAY, DISPLAY];
}

// The biome tint is baked once per atlas and hue: a ctx.filter on every draw is a slow path (a filter layer per
// hanging, every frame). Hue/saturation are per-pixel, so tinting the atlas then scaling it nearest-neighbour is the
// same picture. Only the current biomes' tints are kept.
const tinted = new Map();
function tintedAtlas(img, sheet, hue) {
  const key = sheet + '|' + hue;
  let c = tinted.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    drawFiltered(g, `hue-rotate(${hue - 34}deg) saturate(${hue === 34 ? 0.88 : 1.08})`, img, 0, 0);   // (by hand where canvas filters don't work)
    tinted.set(key, c);
    while (tinted.size > 5) tinted.delete(tinted.keys().next().value); // one biome's hue: the five atlases
  }
  return c;
}

export function drawWallHanging(ctx, item, biome, alpha = 1) {
  const castleKeep = biome?.id === 'castle_keep';
  const count = castleKeep ? 16 : 50;
  if (!item || !Number.isInteger(item.design) || item.design < 0 || item.design >= count) return;
  if (castleKeep) {
    const img = castleKeepAtlas;
    if (!img) return;
    const [x, y, w, h] = wallHangingRect(item, biome);
    const view = item.dir === 'f' ? 0 : 1;
    const a0 = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled;
    ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, view * CELL, item.design * CELL, CELL, CELL, x, y, w, h);
    ctx.globalAlpha = a0; ctx.imageSmoothingEnabled = sm;
    return;
  }
  const atlasIndex = Math.floor(item.design / 10), row = item.design % 10;
  const img = atlases.get(atlasIndex);
  if (!img) return;
  const frame = wallHangingAngle(item.dir, item.front);
  const [x, y, w, h] = wallHangingRect(item, biome);
  const hue = HUE[biome?.id] ?? 34;
  // Shift the shared hand-painted metal, stone, and cloth into the current
  // biome family while preserving the atlas alpha and four authored views.
  const src = tintedAtlas(img, atlasIndex, hue), a0 = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled;
  ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, frame * CELL, row * CELL, CELL, CELL, x, y, w, h);
  ctx.globalAlpha = a0; ctx.imageSmoothingEnabled = sm;
}
