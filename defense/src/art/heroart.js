// Heroes in Velscour's Grim Nocturne gear, composed for Defense: an armor frame (assets/sprites/gear/<cls>/), an
// enclosed helmet (gear/helmets/), palette finishes (the art index's palettes) and the held weapon and off-hand
// (assets/sprites/held/) laid in the armor's fists. The recolour is the main game's (src/core/gearart.js recolorPx,
// src/gfx/heldart.js recolor), ported so this page imports none of its modules.
import { clamp, hexToRgb, makeCanvas } from '../core/util.js';
import { ART, loadImage, loadAssetJSON, pixelsOf } from '../core/assets.js';

export const FRAME_W = 128, FRAME_H = 192;
const gear = {};          // cls -> { meta, armor: bytes, aw, mask: bytes }
let helms = null;         // { meta, atlas: bytes, aw, placements }
let heldIndex = null;
const heldSets = {};      // set -> { meta, img }

export const ELEMENT_COL = { phys: '#e8e0d0', fire: '#ff7a2a', cold: '#7ad8ff', light: '#ffe86a', poison: '#8ae04a', arcane: '#c87aff',
  holy: '#ffe9a0', shadow: '#9a5aff', blood: '#ff3040', acid: '#4ab8ff' };

export async function loadHeroArt(cls) {
  const jobs = [];
  if (!gear[cls]) jobs.push((async () => {
    const [meta, armor, mask] = await Promise.all([loadAssetJSON(`assets/sprites/gear/${cls}/gear.json`),
      loadImage(`assets/sprites/gear/${cls}/armor.webp`), loadImage(`assets/sprites/gear/${cls}/armor_mask.png`)]);
    const md = pixelsOf(mask), m = new Uint8Array(md.length / 4);
    for (let i = 0; i < m.length; i++) m[i] = md[i * 4] > 127 ? 1 : 0;
    gear[cls] = { meta, armor: pixelsOf(armor), aw: armor.width, mask: m };
  })());
  if (!helms) jobs.push((async () => {
    const [meta, atlas, placements] = await Promise.all([loadAssetJSON('assets/sprites/gear/helmets/index.json'),
      loadImage('assets/sprites/gear/helmets/atlas.webp'), loadAssetJSON('assets/sprites/gear/helmets/placements.json').catch(() => ({}))]);
    helms = { meta, atlas: pixelsOf(atlas), aw: atlas.width, placements, boxes: new Map() };
  })());
  jobs.push((async () => {
    if (!heldIndex) heldIndex = await loadAssetJSON('assets/sprites/held/index.json');
    const c = ART.classes[cls];
    await Promise.all([c.weapon, c.offhand].filter(Boolean).map(loadHeldSet));
  })());
  await Promise.all(jobs);
}
export async function loadHeldSet(set) {
  if (heldSets[set]) return heldSets[set];
  const [meta, img] = await Promise.all([loadAssetJSON(`assets/sprites/held/${set}.json`), loadImage(`assets/sprites/held/${set}.webp`)]);
  return (heldSets[set] = { meta, img, px: null });
}
export const heroArtReady = (cls) => !!(gear[cls] && helms && heldIndex);
export const heldDesigns = (set) => heldSets[set]?.meta.designs || null;
export const gearMeta = (cls) => gear[cls]?.meta || null;
export const helmDesigns = () => helms?.meta.designs || [];

// ------------------------------------------------------------------ finishes
const lutCache = new Map();
function luts(pi) {
  let L = lutCache.get(pi);
  if (L) return L;
  L = {};
  for (const [m, stops] of Object.entries(ART.palettes[pi].ramps)) {
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
function recolorPx(d, i, L, k) {
  const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn, s = mx > 0 ? dd / mx : 0;
  let h = 0;
  if (dd > 1e-6) h = mx === r ? (((g - b) / dd) % 6 + 6) % 6 * 60 : mx === g ? ((b - r) / dd + 2) * 60 : ((r - g) / dd + 4) * 60;
  const lum = r * 0.299 + g * 0.587 + b * 0.114, warm = h >= 12 && h <= 62 ? 1 : 0;
  let wT = ss(0.35, 0.55, s) * ss(0.42, 0.62, mx) * warm, wL = ss(0.25, 0.45, s) * (1 - ss(0.42, 0.62, mx)) * warm;
  const wN = (1 - ss(0.2, 0.42, s)) * (1 - wT) * (1 - wL), rest = Math.max(0, 1 - wT - wN - wL), bright = ss(0.42, 0.62, mx);
  const wC = rest * (1 - warm);
  wT += rest * warm * bright; wL += rest * warm * (1 - bright);
  const li = Math.round(clamp((lum - 0.02) * 1.2, 0, 1) * 255) * 3;
  let nr = 0, ng = 0, nb = 0;
  for (const [t, w] of [[L.metal, wN], [L.cloth, wC], [L.trim, wT], [L.leather, wL]]) {
    if (w <= 0) continue;
    nr += t[li] * w; ng += t[li + 1] * w; nb += t[li + 2] * w;
  }
  const f = (lum + 0.01) / (nr * 0.299 + ng * 0.587 + nb * 0.114 + 0.01);
  d[i] = (r * (1 - k) + Math.min(1, nr * f) * k) * 255;
  d[i + 1] = (g * (1 - k) + Math.min(1, ng * f) * k) * 255;
  d[i + 2] = (b * (1 - k) + Math.min(1, nb * f) * k) * 255;
}
const toCanvas = (px, w, h) => { const c = makeCanvas(w, h); c.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0); return c; };

/** One armor frame (1-based id) recoloured by finish pi, as a 128x192 canvas. */
const armorCache = new Map();
export function armorCanvas(cls, id, pi) {
  const G = gear[cls];
  if (!G) return null;
  const key = cls + '|' + id + '|' + pi;
  let c = armorCache.get(key);
  if (c) return c;
  const { meta } = G, [fw, fh] = meta.frame;
  id = clamp(id | 0, 1, meta.armor.n);
  const sx = ((id - 1) % meta.cols) * fw, sy = Math.floor((id - 1) / meta.cols) * fh, out = new Uint8ClampedArray(fw * fh * 4);
  const pal = ART.palettes[pi] || ART.palettes[0], L = pal.k ? luts(pi) : null;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const si = (sy + y) * G.aw + sx + x, o = (y * fw + x) * 4;
    if (!G.armor[si * 4 + 3]) continue;
    out[o] = G.armor[si * 4]; out[o + 1] = G.armor[si * 4 + 1]; out[o + 2] = G.armor[si * 4 + 2]; out[o + 3] = 255;
    if (L && !G.mask[si]) recolorPx(out, o, L, pal.k);
  }
  c = toCanvas(out, fw, fh);
  if (armorCache.size > 96) armorCache.delete(armorCache.keys().next().value);
  armorCache.set(key, c);
  return c;
}

/** A helmet cell (160x160) for this class, recoloured, plus its opaque box. */
const helmCache = new Map();
export function helmCanvas(cls, id, pi) {
  if (!helms) return null;
  const key = cls + '|' + id + '|' + pi;
  let r = helmCache.get(key);
  if (r) return r;
  const [cw, ch] = helms.meta.frame, col = helms.meta.classes.indexOf(cls), sx = col * cw, sy = (id - 1) * ch;
  const out = new Uint8ClampedArray(cw * ch * 4), pal = ART.palettes[pi] || ART.palettes[0], L = pal.k ? luts(pi) : null;
  let x0 = cw, y0 = ch, x1 = 0, y1 = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = (sy + y) * helms.aw + sx + x, o = (y * cw + x) * 4, a = helms.atlas[si * 4 + 3];
    if (!a) continue;
    out[o] = helms.atlas[si * 4]; out[o + 1] = helms.atlas[si * 4 + 1]; out[o + 2] = helms.atlas[si * 4 + 2]; out[o + 3] = a;
    if (L) recolorPx(out, o, L, pal.k);
    if (a > 24) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  }
  r = { img: toCanvas(out, cw, ch), box: x1 > x0 ? [x0, y0, x1, y1] : [0, 0, cw, ch] };
  if (helmCache.size > 64) helmCache.delete(helmCache.keys().next().value);
  helmCache.set(key, r);
  return r;
}

// ------------------------------------------------------------------ held gear
const MAT = { 1: 'metal', 2: 'trim', 3: 'leather' };
const heldCache = new Map();
/** A held piece's sprite ('held') or icon ('icon') cell, recoloured by finish pi and glowing in element el. */
export function heldCanvas(set, i, pi, el, kind = 'held') {
  const S = heldSets[set], d = S?.meta.designs[i];
  if (!d) return null;
  const key = `${set}|${i}|${pi}|${el}|${kind}`;
  let c = heldCache.get(key);
  if (c) return c;
  if (!S.px) S.px = pixelsOf(S.img);
  const [x, y, w, h] = kind === 'held' ? d.held : d.icon, mr = kind === 'held' ? d.mask : d.iconMask, aw = S.img.width;
  const out = new Uint8ClampedArray(w * h * 4), ec = hexToRgb(ELEMENT_COL[el || d.element] || '#ffffff');
  const pal = ART.palettes[pi], L = pi && pal?.k ? luts(pi) : null, k = pi ? pal.k : 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const si = ((y + yy) * aw + x + xx) * 4, mi = ((mr[1] + yy) * aw + mr[0] + xx) * 4, o = (yy * w + xx) * 4;
    if (!S.px[si + 3]) continue;
    out[o] = S.px[si]; out[o + 1] = S.px[si + 1]; out[o + 2] = S.px[si + 2]; out[o + 3] = S.px[si + 3];
    if (!S.px[mi + 3]) continue;
    const code = Math.round(S.px[mi] / 40), r = out[o] / 255, g = out[o + 1] / 255, b = out[o + 2] / 255, lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (code === 4) {
      const s = Math.min(1.35, lum * 1.7), wh = Math.max(0, lum - 0.72) * 2.4;
      out[o] = Math.min(255, ec[0] * s * (1 - wh) + 255 * wh); out[o + 1] = Math.min(255, ec[1] * s * (1 - wh) + 255 * wh); out[o + 2] = Math.min(255, ec[2] * s * (1 - wh) + 255 * wh);
    } else if (L && MAT[code]) {
      const t = L[MAT[code]] || L.metal, li = Math.round(lum * 255) * 3, nr = t[li], ng = t[li + 1], nb = t[li + 2];
      const f = (lum + 0.01) / (nr * 0.299 + ng * 0.587 + nb * 0.114 + 0.01);
      out[o] = (r * (1 - k) + Math.min(1, nr * f) * k) * 255; out[o + 1] = (g * (1 - k) + Math.min(1, ng * f) * k) * 255; out[o + 2] = (b * (1 - k) + Math.min(1, nb * f) * k) * 255;
    }
  }
  c = toCanvas(out, w, h);
  if (heldCache.size > 256) heldCache.delete(heldCache.keys().next().value);
  heldCache.set(key, c);
  return c;
}

/**
 * A hero in a look: { cls, armor 1-26, armorFin, helm 0-15 (0 bare), helmFin, weapon design 0-49 | -1, weaponFin,
 * offhand design | -1, offFin, element }. Returns a canvas FRAME_W*hd x FRAME_H*hd (feet at row meta.feet*hd).
 */
const heroCache = new Map();
export const lookKey = (L) => [L.cls, L.armor, L.armorFin, L.helm, L.helmFin, L.weapon, L.weaponFin, L.offhand, L.offFin, L.element].join('|');
export function heroCanvas(L, hd = 2) {
  const G = gear[L.cls];
  if (!G || !helms || !heldIndex) return null;
  const key = lookKey(L) + '@' + hd;
  let c = heroCache.get(key);
  if (c) return c;
  const { meta } = G;
  c = makeCanvas(FRAME_W * hd, FRAME_H * hd);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(armorCanvas(L.cls, L.armor, L.armorFin), 0, 0, FRAME_W * hd, FRAME_H * hd);
  if (L.helm > 0) {
    const h = helmCanvas(L.cls, L.helm, L.helmFin), f = helms.meta.fit, [cw] = helms.meta.frame;
    const pl = { x: f.xAnchor - cw * f.scaleX / 2, y: meta.headTop + f.baselineOffset - (f.sourceBaseline || 0) * f.scaleY, scaleX: f.scaleX, scaleY: f.scaleY, rotation: 0,
      ...helms.placements?.classes?.[L.cls]?.[String(L.helm)] };
    const [hdx, hdy] = meta.armor.head?.[L.armor - 1] || [0, 0];
    const [x0, y0, x1, y1] = h.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x.save();
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.scale(hd, hd);
    x.translate(pl.x + cx * pl.scaleX + hdx, pl.y + cy * pl.scaleY + hdy);
    x.rotate((pl.rotation || 0) * Math.PI / 180);
    x.scale(pl.scaleX, pl.scaleY);
    x.drawImage(h.img, -cx, -cy);
    x.restore();
  }
  // the held pieces in the armor's fists (the main hand wins a hand both want)
  const cl = ART.classes[L.cls], fists = heldIndex.fists[L.cls]?.[L.armor - 1], pieces = [];
  for (const [set, i, fin] of [[cl.offhand, L.offhand, L.offFin], [cl.weapon, L.weapon, L.weaponFin]]) {
    if (!set || i < 0 || !heldSets[set] || !fists) continue;
    const S = heldSets[set], d = S.meta.designs[i], F = fists[S.meta.hand];
    if (!d || !F) continue;
    pieces.push({ set, i, fin, d, hand: S.meta.hand, x: F[0] + d.off[0], y: F[1] + d.off[1], shadow: S.meta.shadow });
  }
  if (pieces.length === 2 && pieces[0].hand === pieces[1].hand) pieces.shift();
  x.imageSmoothingEnabled = false;
  for (const p of pieces) {
    const s = heldCanvas(p.set, p.i, p.fin, L.element, 'held');
    if (!s) continue;
    if (p.shadow) {
      const t = makeCanvas(s.width, s.height), tx = t.getContext('2d');
      tx.drawImage(s, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#0c0806'; tx.fillRect(0, 0, t.width, t.height);
      x.globalAlpha = p.shadow[2]; x.globalCompositeOperation = 'source-atop';
      x.drawImage(t, (p.x + p.shadow[0]) * hd, (p.y + p.shadow[1]) * hd, s.width * hd, s.height * hd);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    x.drawImage(s, p.x * hd, p.y * hd, s.width * hd, s.height * hd);
  }
  c.feet = meta.feet * hd; c.headTop = meta.headTop * hd; c.hd = hd;
  c.pts = pieces.map((p) => ({ set: p.set, x: p.x, y: p.y, pts: p.d.pts, rarity: p.d.rarity }));
  if (heroCache.size > 48) heroCache.delete(heroCache.keys().next().value);
  heroCache.set(key, c);
  return c;
}

/** An armor piece cropped to its box, or a helmet cell cropped, fitted in a w x h canvas. */
export function gearIconCanvas(kind, cls, id, pi, w, h = w) {
  let src, box;
  if (kind === 'armor') { src = armorCanvas(cls, id, pi); box = gear[cls]?.meta.armor.box[id - 1]; }
  else { const r = helmCanvas(cls, id, pi); src = r?.img; box = r?.box; }
  if (!src || !box) return null;
  const [x0, y0, x1, y1] = box, bw = x1 - x0, bh = y1 - y0, k = Math.min(w / bw, h / bh) * 0.94;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.imageSmoothingEnabled = k < 1; x.imageSmoothingQuality = 'high';
  x.drawImage(src, x0, y0, bw, bh, (w - bw * k) / 2, (h - bh * k) / 2, bw * k, bh * k);
  return c;
}
