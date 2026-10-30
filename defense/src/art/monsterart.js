// Velscour's painted monsters (assets/sprites/enemies/*): one pose each, cut from their sheets and cached.
// Variants: 'base', 'flash' (white, when hit), 'elite' (a darker, redder breed), 'ghost' (green: the necromancer's raised).
import { makeCanvas, drawFiltered } from '../core/util.js';
import { ART, loadAssetJSON, loadImage } from '../core/assets.js';

let meta = null;
const sheets = new Map(), cuts = new Map();
export async function loadMonsters(ids) {
  if (!meta) meta = await loadAssetJSON('assets/sprites/enemies/enemies.json');
  const need = new Set(ids.map((id) => ART.byId[id]?.sheet).filter(Boolean));
  await Promise.all([...need].map(async (sh) => { if (!sheets.has(sh)) sheets.set(sh, await loadImage('assets/sprites/enemies/' + meta[sh].file)); }));
}
/** A monster's image (null until its sheet loads): canvas with .fx (feet x as a fraction of its width). */
export function monsterImage(id, variant = 'base', maxH = 160) {
  const key = id + '|' + variant + '|' + maxH;
  let c = cuts.get(key);
  if (c) return c;
  const a = ART.byId[id], img = a && sheets.get(a.sheet);
  if (!img) return null;
  const cell = meta[a.sheet].cells[a.i], k = Math.min(1, maxH / cell.h);
  c = makeCanvas(cell.w * k, cell.h * k);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  // tints baked once (by hand where canvas filters don't work); a corpse is its look darkened, not a filter a frame
  const f = [/elite/.test(variant) && 'saturate(1.4) brightness(0.8) sepia(0.25) hue-rotate(-20deg)', variant === 'ghost' && 'grayscale(1) sepia(1) hue-rotate(70deg) saturate(2.2) brightness(1.1)',
    /corpse/.test(variant) && 'brightness(0.45) saturate(0.6)'].filter(Boolean).join(' ');
  if (f) drawFiltered(x, f, img, cell.x, cell.y, cell.w, cell.h, 0, 0, c.width, c.height);
  else x.drawImage(img, cell.x, cell.y, cell.w, cell.h, 0, 0, c.width, c.height);
  if (variant === 'flash') { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(0, 0, c.width, c.height); }
  c.fx = cell.fx / cell.w;
  cuts.set(key, c);
  return c;
}
export const monsterH = (id) => ART.byId[id]?.h || 50;
