// Loading for VELSCOUR DEFENSE. Velscour's art is read straight from the repo's assets/ (never written); the only
// main-game data it uses is the snapshot in defense/data/art_index.json (tools/art_index.mjs).
import { makeCanvas } from './util.js';

const ROOT = new URL('../../../', import.meta.url);      // the repo root, relative to this module (works under /velscour/)
export const assetURL = (p) => new URL(p, ROOT).href;
export const defenseURL = (p) => new URL('../../' + p, import.meta.url).href;

const imgs = new Map(), jsons = new Map();
/** An image from the repo's assets/ (path relative to the repo root), cached. */
export function loadImage(path) {
  let p = imgs.get(path);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('image failed: ' + path));
      im.src = assetURL(path);
    });
    imgs.set(path, p);
  }
  return p;
}
export function loadJSON(url) {
  let p = jsons.get(url);
  if (!p) { p = fetch(url).then((r) => { if (!r.ok) throw new Error('json failed: ' + url); return r.json(); }); jsons.set(url, p); }
  return p;
}
export const loadAssetJSON = (path) => loadJSON(assetURL(path));

/** RGBA bytes of an image (once per image). */
const pixelCache = new WeakMap();
export function pixelsOf(img) {
  let d = pixelCache.get(img);
  if (!d) {
    const c = makeCanvas(img.width, img.height), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    d = x.getImageData(0, 0, img.width, img.height).data;
    pixelCache.set(img, d);
  }
  return d;
}

/** The art index (classes, finishes, monsters, jingles). */
export const ART = { classes: null, palettes: null, monsters: null, jingles: null, byId: null };
export async function loadArtIndex() {
  if (ART.classes) return ART;
  const a = await loadJSON(defenseURL('data/art_index.json'));
  Object.assign(ART, a);
  ART.byId = Object.fromEntries(a.monsters.map((m) => [m.id, m]));
  return ART;
}
