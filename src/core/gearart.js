// Gear art (Grim Nocturne): per class 26 body armors (two to seven per rarity) and one shared atlas of enclosed helmets
// (three sets), a column per class and a row per design (each design has a rarity). Built by tools/nocturnegear.py.
import { makeCanvas, hexToRgb, clamp, pick, chance } from './util.js';
import { RARITY } from '../data/items.js';
import { PALETTES, GEAR_FX, FX_CHANCE } from '../data/gear.js';
import { resolveHelmetFit } from './helmetfit.js';

const BASE = 'assets/sprites/gear/';
const HELMET_DIR = { helmet: BASE + 'helmets/' };
const S = { list: null, cls: null, meta: null, armor: null, amask: null, helmetHelms: null };
const helmetPromises = { helmet: null };
const LOOK_GEN = 2; // item.look[3]: looks rolled before the Grim Nocturne library are rerolled
// Bumped with every rebuild of the gear art: a browser that kept an older gear.json beside a newer atlas read armors
// past the atlas's end, and the hero went invisible once he put one on.
const V = '?v=nocturne-5';
// The hero is composed at HD x its 128x192 frame: armor pixels enlarged as they are, helmets from their HD atlas
// (tools/nocturnegear.py), so the engine's downscale keeps more helmet detail the closer the camera zooms in.
export const HD = 4;

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Failed to load ' + src));
    img.src = src;
  });
}
function pixels(img) {
  const c = makeCanvas(img.width, img.height), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, img.width, img.height);
}
function channel(img) { // one channel of a greyscale mask
  const d = pixels(img).data, out = new Uint8Array(d.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
  return out;
}

function atlasBoxes(atlas, meta) {
  const [cw, ch] = meta.frame, boxes = [];
  for (let row = 0; row < meta.designs.length; row++) for (let col = 0; col < meta.cols; col++) {
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (!atlas.data[((row * ch + y) * atlas.width + col * cw + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    boxes[row * meta.cols + col] = x1 >= 0 ? [x0, y0, x1 + 1, y1 + 1] : [0, 0, 0, 0];
  }
  return boxes;
}

async function loadHelmetSet(set) {
  if (!helmetPromises[set]) helmetPromises[set] = Promise.all([
    fetch(HELMET_DIR[set] + 'index.json' + V).then((r) => { if (!r.ok) throw new Error(set + ' helmet index'); return r.json(); }),
    loadImage(HELMET_DIR[set] + 'atlas.webp' + V),
    fetch(HELMET_DIR[set] + 'placements.json' + V, { cache: 'no-store' }).then((r) => {
      if (!r.ok) throw new Error(set + ' helmet placements');
      return r.json();
    }),
  ]).then(([meta, img, placements]) => {
    if (img.width !== meta.frame[0] * meta.cols || img.height < meta.frame[1] * meta.designs.length) {
      throw new Error(set + ' helmet atlas dimensions do not match its index');
    }
    const atlas = pixels(img);
    return { meta, placements, atlas, boxes: atlasBoxes(atlas, meta) };
  }).catch((e) => { helmetPromises[set] = null; throw e; });
  return helmetPromises[set];
}

/** A class's armor library and the helmets, checked to belong together. */
async function loadClassGear(cls) {
  const dir = BASE + cls + '/';
  const [meta, a, am, helmetHelms] = await Promise.all([
    fetch(dir + 'gear.json' + V).then((r) => { if (!r.ok) throw new Error('gear ' + cls); return r.json(); }),
    loadImage(dir + 'armor.webp' + V), loadImage(dir + 'armor_mask.png' + V), loadHelmetSet('helmet'),
  ]);
  const [fw, fh] = meta.frame, rows = Math.ceil(meta.armor.n / meta.cols);
  if (a.width < meta.cols * fw || a.height < rows * fh || am.width !== a.width || am.height !== a.height) {
    throw new Error(cls + ' armor atlas does not match its gear.json');
  }
  if (!helmetHelms.meta.classes.includes(cls)) throw new Error('No helmet art for ' + cls);
  return { cls, meta, armor: pixels(a), amask: channel(am), helmetHelms };
}

const classGearCache = new Map();

/** Load a class's gear art. Resolves to its meta, or null if the class has none (it then keeps its old sprite). */
export async function loadGearArt(cls) {
  if (classGearCache.has(cls)) {
    const data = classGearCache.get(cls);
    if (!S.cls || S.cls === cls) Object.assign(S, data);
    return data.meta;
  }
  try {
    if (!S.list) S.list = await fetch(BASE + 'classes.json' + V).then((r) => (r.ok ? r.json() : []));
    if (!S.list.includes(cls)) {
      classGearCache.set(cls, { cls, meta: null });
      if (!S.cls || S.cls === cls) Object.assign(S, { cls, meta: null });
      return null;
    }
    const data = await loadClassGear(cls);
    classGearCache.set(cls, data);
    if (!S.cls || S.cls === cls) {
      Object.assign(S, data);
      looks.clear(); icons.clear(); recolouredHelms.clear();
    }
    return data.meta;
  } catch (e) {
    console.warn('gear art unavailable for', cls, e);
    classGearCache.set(cls, { cls, meta: null });
    if (!S.cls || S.cls === cls) Object.assign(S, { cls, meta: null });
    return null;
  }
}
export const gearMeta = (cls) => (S.cls === cls && S.meta ? S.meta : classGearCache.get(cls)?.meta || null);

// ------------------------------------------------------------------ looks of items
const rarityName = (r) => RARITY[r].name.toLowerCase();
function finishFor(rarity, forcePalette = false) {
  if (!forcePalette && chance(0.1)) return 0; // armor may keep its original colours
  const ok = PALETTES.map((p, i) => i).filter((i) => i && PALETTES[i].tier <= rarity && PALETTES[i].tier >= rarity - 2);
  return pick(ok);
}
function fxFor(rarity) {
  if (!chance(FX_CHANCE[rarity])) return -1;
  const tier = rarity >= 3 && chance(0.2) ? rarity - 1 : rarity; // now and then one tier down
  const ok = GEAR_FX.map((f, i) => i).filter((i) => GEAR_FX[i].tier === Math.min(5, tier));
  return ok.length ? pick(ok) : -1;
}

/**
 * The look of a body armor or helm for the played class: [design, finish, effect] (effect -1 = none). Rolled on
 * first use from the item's rarity and level and kept on the item (so saves keep it); null without gear art.
 */
export function itemLook(item, src = S) {
  if (!item || (item.slot !== 'body' && item.slot !== 'head') || !src.meta) return null;
  if (item.slot === 'head') {
    const designs = src.helmetHelms?.meta.designs;
    if (!designs?.length) return null;
    if (!item.look || item.look[3] !== LOOK_GEN || item.look[0] > designs.length) {
      // a design of the helm's rarity (three sets each). Sets 02/03 have Mythic in Legendary's place, so a Legendary helm
      // also rolls those Mythics: three designs, while Mythic keeps its own two.
      const top = Math.max(...designs.map((d) => d.rarity)), r = Math.min(item.rarity, top);
      const ok = designs.filter((d) => d.rarity === r || (r === 4 && d.rarity === 5));
      item.look = [pick(ok.length ? ok : designs).id, finishFor(item.rarity, true), -1, LOOK_GEN];
    }
  } else {
    const lib = src.meta.armor;
    if (!item.look || item.look[3] !== LOOK_GEN || item.look[0] > lib.n) {
      const band = lib.bands[rarityName(item.rarity)] || lib.bands.mythic || lib.bands.common; // Abyssal wears the Mythic designs
      item.look = [pick(band), finishFor(item.rarity), item.look?.[2] ?? fxFor(item.rarity), LOOK_GEN];
    }
  }
  return item.look;
}
const helmetSet = () => 'helmet';
export const finishOf = (item) => { const l = itemLook(item); return l && l[1] ? PALETTES[l[1]] : null; };
export const gearFxOf = (item) => { const l = itemLook(item); return l && l[2] >= 0 ? GEAR_FX[l[2]] || null : null; };

// ------------------------------------------------------------------ palettes
const lutCache = new Map();
/** Per palette and material a 256-entry RGB lookup by luminance (src/gfx/heldart.js recolours held gear with them too). */
export function paletteLuts(pi) { return luts(pi); }
function luts(pi) {
  let L = lutCache.get(pi);
  if (L) return L;
  L = {};
  for (const [m, stops] of Object.entries(PALETTES[pi].ramps)) {
    const rgb = stops.map(hexToRgb), n = rgb.length - 1, t = new Float32Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const u = (i / 255) * n, j = Math.min(n - 1, Math.floor(u)), f = u - j;
      for (let c = 0; c < 3; c++) t[i * 3 + c] = (rgb[j][c] * (1 - f) + rgb[j + 1][c] * f) / 255;
    }
    L[m] = t;
  }
  lutCache.set(pi, L);
  return L;
}
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Recolour pixel i of `d` (RGBA bytes) in place with palette `pi`: every material is mapped through its ramp by
 * luminance, then rescaled to the original luminance so the artist's shading survives.
 */
function recolorPx(d, i, pi, L, k) {
  const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
  const s = mx > 0 ? dd / mx : 0;
  let h = 0;
  if (dd > 1e-6) h = mx === r ? (((g - b) / dd) % 6 + 6) % 6 * 60 : mx === g ? ((b - r) / dd + 2) * 60 : ((r - g) / dd + 4) * 60;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  const warm = h >= 12 && h <= 62 ? 1 : 0;
  let wT = ss(0.35, 0.55, s) * ss(0.42, 0.62, mx) * warm;
  let wL = ss(0.25, 0.45, s) * (1 - ss(0.42, 0.62, mx)) * warm;
  const wN = (1 - ss(0.2, 0.42, s)) * (1 - wT) * (1 - wL);
  // what's left is cloth only for cool hues and reds; warm leftovers (parchment, pale bronze) go to trim or base
  const rest = Math.max(0, 1 - wT - wN - wL), bright = ss(0.42, 0.62, mx);
  const wC = rest * (1 - warm);
  wT += rest * warm * bright; wL += rest * warm * (1 - bright);
  const li = Math.round(clamp((lum - 0.02) * 1.2, 0, 1) * 255) * 3;
  let nr = 0, ng = 0, nb = 0;
  for (const [t, w] of [[L.metal, wN], [L.cloth, wC], [L.trim, wT], [L.leather, wL]]) {
    if (w <= 0) continue;
    nr += t[li] * w; ng += t[li + 1] * w; nb += t[li + 2] * w;
  }
  const nl = nr * 0.299 + ng * 0.587 + nb * 0.114, f = (lum + 0.01) / (nl + 0.01);
  d[i] = (r * (1 - k) + Math.min(1, nr * f) * k) * 255;
  d[i + 1] = (g * (1 - k) + Math.min(1, ng * f) * k) * 255;
  d[i + 2] = (b * (1 - k) + Math.min(1, nb * f) * k) * 255;
}

/** One armor frame (1-based id) as RGBA bytes, recoloured by palette `pi`. */
function armorPixels(id, pi, src = S) {
  const { meta, armor, amask } = src, [fw, fh] = meta.frame;
  id = clamp(id | 0, 1, meta.armor.n); // never past the atlas: that is an invisible hero
  const sx = ((id - 1) % meta.cols) * fw, sy = Math.floor((id - 1) / meta.cols) * fh, aw = armor.width;
  const out = new Uint8ClampedArray(fw * fh * 4);
  const pal = PALETTES[pi] || PALETTES[0], L = pal.k ? luts(pi) : null;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const si = (sy + y) * aw + sx + x, o = (y * fw + x) * 4;
      if (!armor.data[si * 4 + 3]) continue;
      out[o] = armor.data[si * 4]; out[o + 1] = armor.data[si * 4 + 1]; out[o + 2] = armor.data[si * 4 + 2]; out[o + 3] = 255;
      if (L && !amask[si]) recolorPx(out, o, pi, L, pal.k);
    }
  }
  return out;
}

const recolouredHelms = new Map();
/** The shared atlas cell for this class and design, with the item's finish applied. */
function helmetPixels(cls, id, pi, set, src = S) {
  const data = src[set + 'Helms'], [cw, ch] = data.meta.frame;
  const col = data.meta.classes.indexOf(cls), sx = col * cw, sy = (id - 1) * ch, aw = data.atlas.width;
  const key = set + '|' + cls + '|' + id + '|' + pi;
  let result = recolouredHelms.get(key);
  if (result) return result;
  const out = new Uint8ClampedArray(cw * ch * 4), pal = PALETTES[pi] || PALETTES[0], L = pal.k ? luts(pi) : null;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = (sy + y) * aw + sx + x, o = (y * cw + x) * 4;
    if (!data.atlas.data[si * 4 + 3]) continue;
    out[o] = data.atlas.data[si * 4]; out[o + 1] = data.atlas.data[si * 4 + 1];
    out[o + 2] = data.atlas.data[si * 4 + 2]; out[o + 3] = data.atlas.data[si * 4 + 3];
    if (L) recolorPx(out, o, pi, L, pal.k);
  }
  result = { px: out, box: data.boxes[(id - 1) * data.meta.cols + col] };
  if (recolouredHelms.size >= 24) recolouredHelms.delete(recolouredHelms.keys().next().value);
  recolouredHelms.set(key, result);
  return result;
}

function helmetPlacement(meta, box, design, set, src = S) {
  const helmets = src[set + 'Helms'], [cw, ch] = helmets.meta.frame;
  const f = resolveHelmetFit(helmets.meta, helmets.placements, src.cls, design, meta.headTop);
  const { x: dx, y: dy, scaleX: sx, scaleY: sy, rotation = 0 } = f;
  const [x0, y0, x1, y1] = box;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const mx = dx + cx * sx, my = dy + cy * sy, rad = rotation * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad), corners = [[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([x,y]) => {
    const vx = (x - cx) * sx, vy = (y - cy) * sy;
    return [mx + vx * cos - vy * sin, my + vx * sin + vy * cos];
  });
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  return { dx, dy, dw: cw * sx, dh: ch * sy, rotation,
    center: [mx, my], box: [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))] };
}

function rotatedHelmetCanvas(px, frame, box, rotation) {
  const [w, h] = frame, [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rad = rotation * Math.PI / 180, bw = x1 - x0, bh = y1 - y0;
  const rw = Math.max(1, Math.ceil(Math.abs(bw * Math.cos(rad)) + Math.abs(bh * Math.sin(rad))));
  const rh = Math.max(1, Math.ceil(Math.abs(bw * Math.sin(rad)) + Math.abs(bh * Math.cos(rad))));
  const c = makeCanvas(rw + 2, rh + 2), x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate(rad);
  x.drawImage(toCanvas(px, w, h), -cx, -cy);
  return c;
}

function toCanvas(px, w, h) {
  const c = makeCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
  return c;
}

// ------------------------------------------------------------------ the hero
const looks = new Map();
/** The hero's full-frame canvas wearing `body` and the new class-matched head overlay. */
export function heroLook(cls, body, head, src = null, outCache = looks) {
  const actualSrc = (src && src.cls === cls) ? src : (S.cls === cls && S.meta ? S : classGearCache.get(cls));
  if (!actualSrc || !actualSrc.meta || actualSrc.cls !== cls) return null;
  const bl = (body && itemLook(body, actualSrc)) || [1, 0, -1];
  const hl = head ? itemLook(head, actualSrc) : null;
  const set = head ? helmetSet(head) : 'common';
  const key = cls + '|' + bl[0] + '|' + bl[1] + '|' + (hl ? set + '|' + hl[0] + '|' + hl[1] : '-');
  let c = outCache.get(key);
  if (c) return c;
  const { meta } = actualSrc, [fw, fh] = meta.frame;
  c = makeCanvas(fw * HD, fh * HD);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(toCanvas(armorPixels(bl[0], bl[1], actualSrc), fw, fh), 0, 0, fw * HD, fh * HD);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.scale(HD, HD);
  c._res = HD;
  if (hl) {
    const { px: hp, box } = helmetPixels(cls, hl[0], hl[1], set, actualSrc);
    const place = helmetPlacement(meta, box, hl[0], set, actualSrc), [x0,y0,x1,y1] = box;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const [hdx, hdy] = meta.armor.head?.[bl[0] - 1] || [0, 0]; // the helmet follows this armor's head
    x.save(); x.translate(place.center[0] + hdx, place.center[1] + hdy); x.rotate(place.rotation * Math.PI / 180);
    x.scale(place.dw / actualSrc[set + 'Helms'].meta.frame[0], place.dh / actualSrc[set + 'Helms'].meta.frame[1]);
    x.drawImage(toCanvas(hp, ...actualSrc[set + 'Helms'].meta.frame), -cx, -cy); x.restore();
  }
  if (outCache.size >= 16) outCache.delete(outCache.keys().next().value);
  outCache.set(key, c);
  return c;
}

/** Draw parameters of the hero canvas: feet anchor and world px per art px for a hero `spriteH` tall. */
export function heroFrame(cls, spriteH) {
  const m = gearMeta(cls);
  return m && { ax: m.frame[0] / 2 * HD, ay: m.feet * HD, k: spriteH / (m.feet - m.headTop) / HD };
}

// ------------------------------------------------------------------ icons
const icons = new Map();
function fitCanvas(src, box, w, h) {
  const [x0, y0, x1, y1] = box, bw = x1 - x0, bh = y1 - y0;
  const k = Math.min(w / bw, h / bh) * 0.94;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, x0, y0, bw, bh, (w - bw * k) / 2, (h - bh * k) / 2, bw * k, bh * k);
  return c;
}
/** Icon canvas (w x h) of a body armor or helm in its finish, or null without gear art. */
export function gearIcon(item, w = 48, h = w) {
  const l = itemLook(item);
  if (!l) return null;
  const set = helmetSet(item);
  const key = item.slot + set + l[0] + '|' + l[1] + '|' + w + 'x' + h;
  let c = icons.get(key);
  if (!c) {
    const { meta } = S;
    if (item.slot === 'body') c = fitCanvas(toCanvas(armorPixels(l[0], l[1]), meta.frame[0], meta.frame[1]), meta.armor.box[l[0] - 1], w, h);
    else {
      const { px, box } = helmetPixels(S.cls, l[0], l[1], set);
      const placement = helmetPlacement(meta, box, l[0], set);
      const rotated = rotatedHelmetCanvas(px, S[set + 'Helms'].meta.frame, box, placement.rotation);
      c = fitCanvas(rotated, [0, 0, rotated.width, rotated.height], w, h);
    }
    if (icons.size > 300) icons.clear();
    icons.set(key, c);
  }
  return c;
}

/** The hero's portrait (w x h) for the inventory, or null without gear art. */
export function heroPortrait(cls, body, head, w, h, over = null, extra = null) {
  const c0 = heroLook(cls, body, head);
  if (!c0) return null;
  const c = over || c0; // `over`: the hero holding his gear (src/gfx/heldart.js heldPortraitArgs), `extra` its box
  const m = S.meta, b = [0, Infinity, 0, 0];
  // the armor box widened by the helm's
  const ab = m.armor.box[(body ? itemLook(body)[0] : 1) - 1];
  b[0] = ab[0]; b[1] = ab[1]; b[2] = ab[2]; b[3] = ab[3];
  if (head) {
    const set = helmetSet(head), { box } = helmetPixels(cls, itemLook(head)[0], itemLook(head)[1], set);
    const hb = helmetPlacement(m, box, itemLook(head)[0], set).box;
    b[0] = Math.min(b[0], hb[0]); b[1] = Math.min(b[1], hb[1]);
    b[2] = Math.max(b[2], hb[2]); b[3] = Math.max(b[3], hb[3]);
  }
  if (extra) { b[0] = Math.min(b[0], extra[0]); b[2] = Math.max(b[2], extra[2]); b[3] = Math.max(b[3], extra[3]); b[1] = Math.min(b[1], Math.max(extra[1], b[1] - 14)); }
  return fitCanvas(c, b.map((v) => v * HD), w, h);
}

/** A copy of canvas `c` cropped to its opaque pixels (null stays null), so a card can fill its frame with the hero. */
export function trimCanvas(c) {
  if (!c) return c;
  const { width: w, height: h } = c, d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return c;
  const t = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  t.getContext('2d').drawImage(c, -x0, -y0);
  return t;
}

// Independent, sequential save previews: never replace the active game's gear state
// while class cards are loading. Decode one class at a time and discard full atlases
// immediately after composing its body/helm. Existing saved item looks are reused.
const savedPreviews = new Map();
let previewQueue = Promise.resolve();
export function savedGearPreview(cls, body, head) {
  const signature = cls + '|' + JSON.stringify([body && [body.look, body.ilvl, body.rarity],
    head && [head.look, head.ilvl, head.rarity]]);
  if (savedPreviews.has(signature)) return savedPreviews.get(signature);
  const work = previewQueue.then(async () => {
    const src = await loadClassGear(cls);
    return trimCanvas(heroLook(cls, body, head, src, new Map()));
  });
  previewQueue = work.catch(() => {});
  const result = work.catch(e => {
    savedPreviews.delete(signature);
    console.warn('Saved hero preview unavailable for', cls, e);
    return null;
  });
  savedPreviews.set(signature, result);
  if (savedPreviews.size > 18) savedPreviews.delete(savedPreviews.keys().next().value);
  return result;
}
