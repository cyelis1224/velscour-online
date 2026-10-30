// Held weapons and off-hands (assets/sprites/held/, baked by tools/weapons3d_bake.js from the three.js designs of
// tools/weapons3d.js): 50 designs per set, by rarity. An item's look ([design within its rarity, finish, -1, gen]) picks
// one; the set comes from its base, its slot and the wearer's class (src/data/held.js). The sprite is laid over the hero
// image at the fist of the worn armor (the hero canvas mirrors with facing, so the gear turns with him); its metal, trim
// and grip take the item's palette finish (PALETTES) and its glowing parts the item's element. Icons for the bag and
// the ground come from the same designs. Effects (gem dots, rarity particles: src/gfx/heldfx.js) are drawn per frame.
import { G } from '../state.js';
import { makeCanvas, hexToRgb, randi, chance, pick, clamp } from '../core/util.js';
import { HELD_PER, HELD_START, heldSetOf, heldElement } from '../data/held.js';
import { PALETTES } from '../data/gear.js';
import { GEMS, RARITY } from '../data/items.js';
import { paletteLuts, itemLook, finishOf, gearMeta } from '../core/gearart.js';
import { fxColor, drawHeldFx, drawGearSparkle } from './heldfx.js';
import { addLight } from './vfx.js';

const BASE = 'assets/sprites/held/', LOOK_GEN = 2, W = 128;
let index = null, indexP = null, version = 0;
const sets = new Map(); // name -> { meta, img } (empty while it loads; failed: { failed: true })
/** Bumped whenever a set finishes loading (icon caches key on it). */
export const heldVersion = () => version;

export function loadHeldIndex() {
  return (indexP ||= fetch(BASE + 'index.json').then((r) => (r.ok ? r.json() : null)).then((j) => (index = j)).catch(() => null));
}
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
/** A set's { meta, img } once loaded (null while loading or unknown; starts the load). */
function ensureSet(name) {
  if (!name || !index?.sets[name]) return null;
  let s = sets.get(name);
  if (!s) {
    sets.set(name, (s = {}));
    s.p = Promise.all([fetch(BASE + name + '.json').then((r) => r.json()), loadImage(BASE + name + '.webp')])
      .then(([meta, img]) => { s.meta = meta; s.img = img; version++; })
      .catch((e) => { s.failed = true; console.warn('held art unavailable:', name, e); });
  }
  return s.meta ? s : null;
}
/** Load the index and a class's own sets (and the sets of the hero's gear), for loadClassPack. */
export async function loadHeld(cls, char = null) {
  await loadHeldIndex();
  if (!index) return;
  const names = new Set([heldSetOf(defaultBase(cls, 'weapon'), 'weapon', cls), heldSetOf(defaultBase(cls, 'offhand'), 'offhand', cls)]);
  for (const it of char ? [...Object.values(char.equip || {}), ...(char.bag || [])] : []) if (it && (it.slot === 'weapon' || it.slot === 'offhand')) names.add(heldSetOf(it.base, it.slot, cls));
  if (char?.equip?.offhand) names.add(heldSetOf(char.equip.offhand.base, 'offhand', cls));
  names.delete(null);
  for (const n of names) ensureSet(n);
  await Promise.all([...names].map((n) => sets.get(n)?.p));
}
const DEFAULTS = { weapon: { paladin: 'mace', ranger: 'bow', wizard: 'staff', necromancer: 'wand', barbarian: 'axe', dragoon: 'spear', totem_master: 'staff', death_knight: 'sword', arcane_sorcerer: 'wand', carrion_witch: 'staff', bard: 'lute', slime_lord: 'mace', boomerang_knight: 'boomerang', lancer: 'spear', dragon_knight: 'sword', gunner: 'pistol' } };
function defaultBase(cls, slot) { return slot === 'weapon' ? DEFAULTS.weapon[cls] : cls === 'barbarian' ? 'axe' : { ranger: 'quiver', wizard: 'tome', necromancer: 'orb', totem_master: 'idol', death_knight: 'skull', arcane_sorcerer: 'orb', carrion_witch: 'lantern', bard: 'drum', slime_lord: 'jar', boomerang_knight: 'rang', gunner: 'bomb' }[cls] || 'shield'; }

// ------------------------------------------------------------------ looks
function finishFor(R) {
  if (chance(0.15)) return 0; // now and then the design's own colours
  const ok = PALETTES.map((p, i) => i).filter((i) => i && PALETTES[i].tier <= R && PALETTES[i].tier >= R - 2);
  return ok.length ? pick(ok) : 0;
}
/** A weapon's or off-hand's look: [design within its rarity, finish, -1, gen], rolled on first use and kept on the item. */
export function heldLook(item) {
  if (!item || item.type !== 'gear' || (item.slot !== 'weapon' && item.slot !== 'offhand')) return null;
  const R = clamp(item.rarity | 0, 0, 5);
  if (!item.look || item.look[3] !== LOOK_GEN || !(item.look[0] < HELD_PER[R])) item.look = [randi(0, HELD_PER[R] - 1), finishFor(R), -1, LOOK_GEN];
  return item.look;
}
/** What an item shows as when `cls` holds it in `slot`: { set, S, d, i, finish, element, rarity, hand } (null: no art yet). */
function pieceOf(item, slot, cls) {
  const set = heldSetOf(item.base, slot, cls), S = ensureSet(set);
  if (!S) return null;
  const look = heldLook(item), R = clamp(item.rarity | 0, 0, 5), i = HELD_START[R] + look[0], d = S.meta.designs[i];
  return d ? { set, S, d, i, finish: look[1] | 0, element: heldElement(item) || d.element, rarity: R, hand: S.meta.hand, item } : null;
}

// ------------------------------------------------------------------ recolour
const MAT = { 1: 'metal', 2: 'trim', 3: 'leather' };
/** Recolour RGBA bytes by their region codes (mask bytes): metal, trim and grip through palette `pi`, glow to colour ec. */
function recolor(d, m, pi, ec) {
  const L = pi && PALETTES[pi]?.ramps ? paletteLuts(pi) : null, k = pi ? PALETTES[pi].k : 0;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3] || !m[i + 3]) continue;
    const code = Math.round(m[i] / 40), r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (code === 4) { // glow: the element's colour at this brightness, white-hot at the core
      const s = Math.min(1.35, lum * 1.7), w = Math.max(0, lum - 0.72) * 2.4;
      d[i] = Math.min(255, ec[0] * s * (1 - w) + 255 * w); d[i + 1] = Math.min(255, ec[1] * s * (1 - w) + 255 * w); d[i + 2] = Math.min(255, ec[2] * s * (1 - w) + 255 * w);
    } else if (L && MAT[code]) {
      const t = L[MAT[code]] || L.metal, li = Math.round(lum * 255) * 3, nr = t[li], ng = t[li + 1], nb = t[li + 2];
      const f = (lum + 0.01) / (nr * 0.299 + ng * 0.587 + nb * 0.114 + 0.01);
      d[i] = (r * (1 - k) + Math.min(1, nr * f) * k) * 255; d[i + 1] = (g * (1 - k) + Math.min(1, ng * f) * k) * 255; d[i + 2] = (b * (1 - k) + Math.min(1, nb * f) * k) * 255;
    }
  }
}
const sprites = new Map();
/** A piece's held sprite or icon ('held' | 'icon'), recoloured, cached. */
function sprite(pc, kind) {
  const key = `${pc.set}|${pc.i}|${pc.finish}|${pc.element}|${kind}`;
  let c = sprites.get(key);
  if (c) return c;
  const [x, y, w, h] = kind === 'held' ? pc.d.held : pc.d.icon, mr = kind === 'held' ? pc.d.mask : pc.d.iconMask;
  c = makeCanvas(w, h);
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(pc.S.img, x, y, w, h, 0, 0, w, h);
  const im = cx.getImageData(0, 0, w, h), mc = makeCanvas(w, h).getContext('2d', { willReadFrequently: true });
  mc.drawImage(pc.S.img, mr[0], mr[1], w, h, 0, 0, w, h);
  recolor(im.data, mc.getImageData(0, 0, w, h).data, pc.finish, fxColor(pc.element));
  cx.putImageData(im, 0, 0);
  if (sprites.size >= 160) sprites.delete(sprites.keys().next().value);
  sprites.set(key, c);
  return c;
}

// ------------------------------------------------------------------ icons
const playerClass = () => G.char?.classId || G.player?.classId || 'paladin';
const iconSlot = (item) => (item.slot === 'offhand' ? 'offhand' : 'weapon');
/** An icon cache key for a weapon or off-hand with held art (null until its set has loaded; starts the load). */
export function heldIconKey(item) {
  if (!index || (item.slot !== 'weapon' && item.slot !== 'offhand')) return null;
  const pc = pieceOf(item, iconSlot(item), playerClass());
  return pc && `h|${pc.set}|${pc.i}|${pc.finish}|${pc.element}`;
}
const icons = new Map();
/** A weapon's or off-hand's icon at `size` px (null until its set has loaded). */
export function heldIcon(item, size = 48) {
  if (!index || (item.slot !== 'weapon' && item.slot !== 'offhand')) return null;
  const pc = pieceOf(item, iconSlot(item), playerClass());
  if (!pc) return null;
  const key = `${pc.set}|${pc.i}|${pc.finish}|${pc.element}|${size}`;
  let c = icons.get(key);
  if (c) return c;
  const src = sprite(pc, 'icon');
  c = makeCanvas(size, size);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = size % src.width !== 0 && size < src.width; // nearest when it scales up or stays put
  x.drawImage(src, 0, 0, size, size);
  if (icons.size >= 256) icons.delete(icons.keys().next().value);
  icons.set(key, c);
  return c;
}

// ------------------------------------------------------------------ the hero
/** The pieces `cls` holds from `equip`, placed at the worn armor's fists (art px). Null while any set still loads. */
function heldPieces(cls, equip) {
  const fists = index?.fists?.[cls];
  if (!fists) return [];
  const armor = clamp((equip.body && itemLook(equip.body)?.[0]) || 1, 1, fists.length), F = fists[armor - 1];
  const out = [];
  for (const slot of ['weapon', 'offhand']) {
    const it = equip[slot];
    if (!it || it.type !== 'gear' || !heldSetOf(it.base, slot, cls)) continue;
    const pc = pieceOf(it, slot, cls);
    if (!pc) return null;
    if (out.some((o) => o.hand === pc.hand)) continue; // both pieces want the same hand: the main hand wins
    const f = F[pc.hand], pt = (p) => p && [f[0] + p[0], f[1] + p[1], p[2]];
    const P = pc.d.pts;
    out.push({ ...pc, x: f[0] + pc.d.off[0], y: f[1] + pc.d.off[1], shadow: pc.S.meta.shadow,
      pts: { head: pt(P.head) || [f[0], f[1], 4], tip: pt(P.tip), line: P.line && [pt(P.line[0]), pt(P.line[1])], orbit: pt(P.orbit), slots: P.slots.map(pt) },
      gems: (it.gems || []).map((g) => hexToRgb(GEMS[g.gem]?.color || '#ffffff')) });
  }
  return out;
}
const composites = new WeakMap(); // hero image -> Map(key -> canvas)
/**
 * The hero image with his weapon and off-hand laid in his fists (the same size as `base`, heroLook's HD canvas), and
 * the pieces for the effects. Returns null when there is nothing to hold or the art is still loading.
 */
export function heldHero(base, cls, equip) {
  if (!index) { loadHeldIndex(); return null; }
  const pcs = heldPieces(cls, equip);
  if (!pcs || !pcs.length) return null;
  const key = pcs.map((p) => `${p.set}:${p.i}:${p.finish}:${p.element}:${p.x},${p.y}`).join('|');
  let m = composites.get(base);
  if (!m) composites.set(base, (m = new Map()));
  let c = m.get(key);
  if (!c) {
    const HD = base.width / W;
    c = makeCanvas(base.width, base.height);
    const x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    x.imageSmoothingEnabled = false;
    for (const p of pcs) { // a contact shadow: the piece's silhouette, offset, darkening only the hero under it
      const sh = p.shadow;
      if (!sh) continue;
      const s = sprite(p, 'held'), t = makeCanvas(s.width, s.height), tx = t.getContext('2d');
      tx.drawImage(s, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#0c0806'; tx.fillRect(0, 0, t.width, t.height);
      x.globalAlpha = sh[2]; x.globalCompositeOperation = 'source-atop';
      x.drawImage(t, (p.x + sh[0]) * HD, (p.y + sh[1]) * HD, s.width * HD, s.height * HD);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    for (const p of pcs) { const s = sprite(p, 'held'); x.drawImage(s, p.x * HD, p.y * HD, s.width * HD, s.height * HD); }
    if (m.size >= 4) m.delete(m.keys().next().value);
    m.set(key, c);
  }
  return { img: c, pieces: pcs };
}

/** The inventory portrait args: [the hero holding his gear, its box in art px] (nulls without held gear). */
export function heldPortraitArgs(base, cls, equip) {
  const h = base && G.settings.heldGear !== false ? heldHero(base, cls, equip) : null;
  if (!h) return [null, null];
  const b = [W, 192, 0, 0];
  for (const p of h.pieces) { b[0] = Math.min(b[0], p.x); b[1] = Math.min(b[1], p.y); b[2] = Math.max(b[2], p.x + p.d.size[0]); b[3] = Math.max(b[3], p.y + p.d.size[1]); }
  return [h.img, [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(W, b[2]), Math.min(192, b[3])]];
}

// ------------------------------------------------------------------ effects
const spots = new WeakMap(); // hero image -> { body, head }: opaque art px of the armor and the helmet
function sparkleSpots(base, cls) {
  let s = spots.get(base);
  if (s) return s;
  const HD = base.width / W, d = base.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, base.width, base.height).data;
  const neck = (gearMeta(cls)?.headTop ?? 75) + 10, body = [], head = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < base.height / HD; y += 2) for (let x = 0; x < W; x += 2) {
    const i = ((y * HD + HD / 2) * base.width + x * HD + HD / 2) * 4;
    if (d[i + 3] > 200) (y < neck ? head : body).push([x + 0.5, y + 0.5]);
  }
  const thin = (a, n) => { const o = []; for (let i = 0; i < Math.min(n, a.length); i++) o.push(a[Math.floor(rnd() * a.length)]); return o; };
  s = { body: thin(body, 48), head: thin(head, 24) };
  spots.set(base, s);
  return s;
}
const gearCol = (it) => { const f = finishOf(it); return hexToRgb(f?.glow || RARITY[it.rarity]?.color || '#ffffff'); };
/**
 * Draw the hero's gear effects over his image: gem dots and rarity particles on what he holds, sparkles on rare armor
 * and helmets. `where` is Creature.drawArt's { x, y, dx, dy, k, sq, flip }, `base` the hero image without the gear.
 */
export function drawHeldLayer(ctx, p, held, base, where) {
  const fx = G.settings.heldFx !== false, sgn = where.flip ? -1 : 1, HD = (base?.width || 512) / W, sq = where.sq || 1;
  const map = (ax, ay) => [where.x + sgn * (where.dx + ax * HD * where.k), where.y + where.dy + ay * HD * where.k * sq];
  const s = HD * where.k, t = G.time || 0;
  let top = -1;
  for (const [i, pc] of (held?.pieces || []).entries()) {
    drawHeldFx(ctx, pc, t, map, s, { fx, seed: i * 13 + 1, size: 1.4, quality: G.lowFx ? 0.5 : 1 });
    top = Math.max(top, pc.rarity);
  }
  if (!fx) return;
  if (top >= 4) addLight(p.x, p.y, 1.4 + (top - 4) * 0.8, 0.3);
  const eq = p.char?.equip;
  if (base && eq && ((eq.body?.rarity | 0) >= 2 || (eq.head?.rarity | 0) >= 2)) {
    drawGearSparkle(ctx, sparkleSpots(base, p.classId), { body: eq.body && { rarity: eq.body.rarity, col: gearCol(eq.body) }, head: eq.head && { rarity: eq.head.rarity, col: gearCol(eq.head) } }, t, map, s, { size: 1.3 });
  }
}
