// Effects of high rarity body armor (presets: GEAR_FX in data/gear.js): a glow around the hero's outline,
// lights orbiting the hero, a rune circle at the feet and particle emitters (motes, embers, sparks, frost,
// smoke, flames, runes). Coloured by the effect, else by the armor's finish, else by its rarity.
import { TAU, rand, makeCanvas, mixHex } from '../core/util.js';
import { isoX, isoY } from '../core/view.js';
import { spawn, glowSprite, addLight } from './vfx.js';

const glowCache = new Map();
/** A soft outline glow of `img` in `col`: the silhouette blurred by stacking offset copies (no ctx.filter). */
function outlineGlow(img, col) {
  const key = col;
  let e = glowCache.get(img);
  if (e && e.key === key) return e.c;
  const u = img._res || 1, pad = 8 * u, w = img.width + pad * 2, h = img.height + pad * 2; // u: image px per art px
  const sil = makeCanvas(img.width, img.height), sx = sil.getContext('2d');
  sx.drawImage(img, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = col; sx.fillRect(0, 0, img.width, img.height);
  const c = makeCanvas(w, h), x = c.getContext('2d');
  for (const [r, a] of [[6, 0.12], [4, 0.2], [2, 0.35]]) {
    x.globalAlpha = a;
    for (let i = 0; i < 12; i++) { const t = (i / 12) * TAU; x.drawImage(sil, pad + Math.cos(t) * r * u, pad + Math.sin(t) * r * u); }
  }
  glowCache.set(img, { key, c });
  if (glowCache.size > 6) glowCache.delete(glowCache.keys().next().value);
  return c;
}

const runeCache = new Map();
function runeImg(col) {
  let c = runeCache.get(col);
  if (c) return c;
  c = makeCanvas(16, 16);
  const x = c.getContext('2d');
  x.strokeStyle = col; x.lineWidth = 1.6; x.lineCap = 'round';
  x.shadowColor = col; x.shadowBlur = 4;
  x.beginPath();
  x.moveTo(8, 2); x.lineTo(8, 14); x.moveTo(8, 5); x.lineTo(12, 8); x.moveTo(8, 9); x.lineTo(4, 12); x.moveTo(5, 4); x.lineTo(8, 6);
  x.stroke();
  runeCache.set(col, c);
  return c;
}

/** Orb offsets [dx, dy (tiles), dz (px)] at time t. */
function orbPos(o, i, t) {
  const n = o.n, base = (i / n) * TAU;
  switch (o.pattern) {
    case 'eight': {
      const a = t * o.speed + base;
      return [Math.sin(a) * o.r, Math.sin(a * 2) * o.r * 0.5, 30 + Math.cos(a) * 8];
    }
    case 'double': {
      const inner = i % 2, a = t * o.speed * (inner ? -1.3 : 1) + base;
      const r = o.r * (inner ? 0.6 : 1);
      return [Math.cos(a) * r, Math.sin(a) * r, inner ? 46 : 22];
    }
    case 'wobble': {
      const a = t * o.speed + base;
      return [Math.cos(a) * o.r, Math.sin(a) * o.r, 30 + Math.sin(a + t * 1.3) * 14];
    }
    default: {
      const a = t * o.speed + base;
      return [Math.cos(a) * o.r, Math.sin(a) * o.r, 32 + Math.sin(a * 2) * 3];
    }
  }
}

function drawOrb(ctx, p, fx, col, i, t, alpha) {
  const o = fx.orbs, [dx, dy, dz] = orbPos(o, i, t);
  const px = isoX(p.x + dx, p.y + dy), py = isoY(p.x + dx, p.y + dy) - dz - p.z;
  const s = o.size * (1 + Math.sin(t * 6 + i) * 0.15);
  ctx.globalCompositeOperation = 'lighter';
  if (o.trail) {
    for (let k = 1; k <= 5; k++) {
      const [tx, ty, tz] = orbPos(o, i, t - k * 0.035);
      const qx = isoX(p.x + tx, p.y + ty), qy = isoY(p.x + tx, p.y + ty) - tz - p.z, q = s * (1 - k * 0.15) * 2.4;
      ctx.globalAlpha = alpha * (0.35 - k * 0.06);
      ctx.drawImage(glowSprite(col), qx - q, qy - q, q * 2, q * 2);
    }
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(col), px - s * 3, py - s * 3, s * 6, s * 6);
  ctx.drawImage(glowSprite('#ffffff'), px - s, py - s, s * 2, s * 2);
}

/** Which orbs are behind the hero right now (further up the screen than the hero's feet). */
const behind = (fx, i, t) => { const [dx, dy] = orbPos(fx.orbs, i, t); return dx + dy < 0; };

/**
 * Draw the effect layer `layer` ('back': glow, rune circle, rear orbs; 'front': front orbs) for hero `p`
 * wearing effect `fx` in colour `col`. `art` = { img, dx, dy, w, h } is where the hero image was drawn.
 */
export function drawGearFx(ctx, p, fx, col, layer, art) {
  if (!fx) return;
  const t = p.animT, alpha = p.alpha ?? 1;
  if (layer === 'back') {
    if (fx.ring) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(isoX(p.x, p.y), isoY(p.x, p.y)); ctx.scale(1, 0.5);
      ctx.globalAlpha = alpha * (0.35 + Math.sin(t * 2) * 0.1);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke();
      ctx.rotate(t * 0.6);
      for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillRect(21, -1.5, 4, 3); }
      ctx.restore();
    }
    if (fx.glow && art) {
      const g = outlineGlow(art.img, col), pad = 8 * (art.img._res || 1) * art.k;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * fx.glow * (0.75 + Math.sin(t * 3) * 0.25);
      ctx.translate(art.x, art.y);
      if (art.flip) ctx.scale(-1, 1);
      if (art.rot) ctx.rotate(art.rot);
      if (art.sx || art.sy) ctx.scale(art.sx || 1, art.sy || 1);
      ctx.drawImage(g, art.dx - pad, art.dy - pad, g.width * art.k, g.height * art.k);
      ctx.restore();
    }
    if (fx.glow >= 0.5) addLight(p.x, p.y, 2.2 + fx.glow * 1.5, 0.35 + fx.glow * 0.3);
  }
  if (fx.orbs) {
    ctx.save();
    for (let i = 0; i < fx.orbs.n; i++) if (behind(fx, i, t) === (layer === 'back')) drawOrb(ctx, p, fx, col, i, t, alpha);
    ctx.restore();
  }
}

/** Emit the effect's particles for `dt` seconds (call from the hero's update). */
export function updateGearFx(p, fx, col, dt) {
  if (!fx || !fx.parts || p.dead) return;
  p._fxAcc = p._fxAcc || {};
  for (const e of fx.parts) {
    let acc = (p._fxAcc[e.kind] || 0) + e.rate * dt;
    for (; acc >= 1; acc--) emit(p, e.kind, col);
    p._fxAcc[e.kind] = acc;
  }
}

function emit(p, kind, col) {
  const a = rand(TAU), r = rand(0.1, 0.38), x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r, z = p.z;
  switch (kind) {
    case 'mote':
      spawn({ type: 'glow', x, y, z: z + rand(6, 54), vz: rand(8, 22), vx: rand(-0.2, 0.2), vy: rand(-0.2, 0.2), life: rand(0.7, 1.4), size: rand(1.2, 2.4), size1: 0, color: col, add: true });
      break;
    case 'ember':
      spawn({ type: 'dot', x, y, z: z + rand(0, 40), vz: rand(30, 70), vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), drag: 1, life: rand(0.5, 1.1), size: rand(1.2, 2.2), size1: 0.4, color: Math.random() < 0.5 ? '#ffd060' : mixHex(col, '#ff6010', 0.5), add: true });
      break;
    case 'spark': {
      const s = rand(3, 6), b = rand(TAU);
      spawn({ type: 'streak', x: p.x + rand(-0.15, 0.15), y: p.y + rand(-0.15, 0.15), z: z + rand(10, 50), vx: Math.cos(b) * s, vy: Math.sin(b) * s, vz: rand(-60, 60), drag: 4, life: rand(0.12, 0.25), size: rand(0.8, 1.4), color: Math.random() < 0.4 ? '#ffffff' : col, add: true });
      break;
    }
    case 'frost':
      spawn({ type: 'dot', x: x + rand(-0.2, 0.2), y: y + rand(-0.2, 0.2), z: z + rand(30, 64), vz: rand(-22, -8), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), life: rand(0.9, 1.6), size: rand(1, 2), size1: 0.6, color: Math.random() < 0.5 ? '#ffffff' : col });
      break;
    case 'smoke':
      spawn({ type: 'smoke', x, y, z: z + rand(0, 16), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(10, 26), life: rand(0.8, 1.5), size: rand(3, 5), size1: rand(8, 12), color: mixHex(col, '#000000', 0.65), alpha: 0.32 });
      break;
    case 'flame': {
      const fr = rand(0.25, 0.42);
      spawn({ type: 'glow', x: p.x + Math.cos(a) * fr, y: p.y + Math.sin(a) * fr, z: z + rand(0, 6), vz: rand(30, 65), drag: 0.5, life: rand(0.35, 0.7), size: rand(2.5, 4), size1: 0, color: Math.random() < 0.35 ? '#ffe080' : col, add: true });
      break;
    }
    case 'rune':
      spawn({ type: 'img', img: runeImg(col), x: p.x + Math.cos(a) * 0.5, y: p.y + Math.sin(a) * 0.5, z: z + rand(4, 20), vz: rand(14, 26), life: rand(1, 1.6), size: 10, size1: 7 });
      break;
  }
}
