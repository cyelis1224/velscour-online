// Hero pictures for the menus: Velscour's composed hero (heroart.js) cropped and fitted into a canvas.
import { makeCanvas } from '../core/util.js';
import { heroCanvas, loadHeroArt, heroArtReady } from '../art/heroart.js';
import { heroBaseLook, HERO_BY_ID } from '../data/heroes.js';

/** A canvas showing the hero in `look`, cropped head to feet, w x h CSS px (drawn at 2x). Fills in once art loads. */
export function portrait(look, w, h, opts = {}) {
  const c = makeCanvas(w * 2, h * 2);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  const paint = () => {
    const img = heroCanvas(look, 3);
    if (!img) return;
    const x = c.getContext('2d'), top = img.headTop - 14 * img.hd, foot = img.feet + 4 * img.hd, srcH = (opts.bust ? (foot - top) * 0.55 : foot - top);
    const k = Math.min(c.height / srcH, c.width / (img.width * 0.42)), dw = img.width * k;
    x.clearRect(0, 0, c.width, c.height);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (opts.flip) { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(img, c.width / 2 - dw / 2, (opts.bust ? 0 : c.height - foot * k) - (opts.bust ? top * k : 0), dw, img.height * k);
  };
  if (heroArtReady(look.cls)) paint(); else loadHeroArt(look.cls).then(paint).catch(() => {});
  return c;
}
export const heroPortrait = (id, w, h, opts) => portrait(heroBaseLook(HERO_BY_ID[id]), w, h, opts);
export async function preloadClasses(classes) { await Promise.all([...new Set(classes)].map((c) => loadHeroArt(c).catch(() => {}))); }
