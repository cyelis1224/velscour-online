// Card faces in the style of a collectible card game: title bar with the Valor cost, an art window with Velscour's
// art (the hero in their look, the held weapon, the armor, the helmet, the relic's gem), a type line with a rarity set
// symbol, rules text, flavour, an ATK box and a collector line. Drawn on a canvas, CARD_W x CARD_H at scale 1.
import { makeCanvas, shade, rgba, mixHex, RNG, hashStr } from '../core/util.js';
import { ART, loadImage, loadAssetJSON } from '../core/assets.js';
import { KITS, RARITIES, FRAMES, CLASS_FRAME } from '../data/kits.js';
import { TYPES, CARDS } from '../data/cards.js';
import { heroCanvas, heldCanvas, armorCanvas, helmCanvas, loadHeroArt, loadHeldSet, heroArtReady, ELEMENT_COL } from '../art/heroart.js';
import { heroBaseLook } from '../data/heroes.js';
import { loadMonsters, monsterImage } from '../art/monsterart.js';

export const CARD_W = 630, CARD_H = 880;
let gems = null;
export async function ensureCardArt(card) {
  if (card.type === 'relic') {
    if (!gems) { const [meta, img] = await Promise.all([loadAssetJSON('assets/sprites/replacements/atlas.json'), loadImage('assets/sprites/replacements/atlas.webp')]); gems = { meta, img }; }
    return;
  }
  if (card.type === 'trophy') return loadMonsters([card.monster]);
  if (!heroArtReady(card.cls)) await loadHeroArt(card.cls);
  if (card.set) await loadHeldSet(card.set);
}

const rr = (x, ctx, X, Y, W, H, r) => { ctx.beginPath(); ctx.moveTo(X + r, Y); ctx.arcTo(X + W, Y, X + W, Y + H, r); ctx.arcTo(X + W, Y + H, X, Y + H, r); ctx.arcTo(X, Y + H, X, Y, r); ctx.arcTo(X, Y, X + W, Y, r); ctx.closePath(); };
const frameOf = (card) => FRAMES[card.cls ? (card.type === 'hero' ? CLASS_FRAME[card.cls] : 'artifact') : 'gold'];

// frame textures (subtle grain + scratches) per colour
const texCache = new Map();
function frameTexture(col) {
  if (texCache.has(col)) return texCache.get(col);
  const c = makeCanvas(256, 256), x = c.getContext('2d'), r = new RNG(hashStr(col));
  x.fillStyle = col; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) { x.fillStyle = rgba(r.chance(0.5) ? '#ffffff' : '#000000', r.range(0.02, 0.08)); x.fillRect(r.int(0, 255), r.int(0, 255), r.int(1, 3), r.int(1, 3)); }
  for (let i = 0; i < 26; i++) { x.strokeStyle = rgba('#000000', r.range(0.05, 0.14)); x.lineWidth = r.range(0.5, 2); x.beginPath(); const sx = r.int(0, 255), sy = r.int(0, 255); x.moveTo(sx, sy); x.bezierCurveTo(sx + r.int(-60, 60), sy + r.int(-60, 60), sx + r.int(-60, 60), sy + r.int(-60, 60), sx + r.int(-90, 90), sy + r.int(-90, 90)); x.stroke(); }
  texCache.set(col, c);
  return c;
}

/** The rarity set symbol: a rift-diamond, black / silver / gold / violet / orange / red-gold. */
export function setSymbol(ctx, x, y, s, rarity) {
  const R = [['#202020', '#5a5a5a'], ['#9aa0aa', '#f0f4ff'], ['#9a7020', '#ffe08a'], ['#6a2aa0', '#e0a8ff'], ['#b04a10', '#ffc070'], ['#a01020', '#ffb050']][rarity];
  const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s); g.addColorStop(0, R[0]); g.addColorStop(0.5, R[1]); g.addColorStop(1, R[0]);
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0); ctx.closePath();
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = s * 0.14; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.22, s * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#05060c'; ctx.fill();
  ctx.restore();
}

function fitText(ctx, text, maxW, size, font) {
  let s = size;
  do { ctx.font = font.replace('$', s); } while (ctx.measureText(text).width > maxW && --s > 10);
  return s;
}
function wrap(ctx, text, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}

/** The art window's picture for a card, drawn into (X, Y, W, H). */
function drawArt(ctx, card, entry, X, Y, W, H) {
  const F = frameOf(card), cl = card.cls ? ART.classes[card.cls] : null, accent = card.type === 'trophy' ? '#c83028' : cl?.color || '#c8a0ff', r = new RNG(card.id);
  // backdrop: a dusk sky in the card's colour with rift light and a horizon
  const g = ctx.createLinearGradient(0, Y, 0, Y + H);
  g.addColorStop(0, shade(mixHex(accent, '#0a1030', 0.55), -0.3)); g.addColorStop(0.62, shade(mixHex(accent, '#1a1a2a', 0.65), -0.1)); g.addColorStop(1, '#07080e');
  ctx.fillStyle = g; ctx.fillRect(X, Y, W, H);
  ctx.save(); ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) { // light rays from behind the subject
    const a = -Math.PI / 2 + (i - 4) * 0.22 + r.range(-0.05, 0.05), cx = X + W / 2, cy = Y + H * 0.42;
    ctx.fillStyle = rgba(accent, 0.07); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - 0.06) * H, cy + Math.sin(a - 0.06) * H); ctx.lineTo(cx + Math.cos(a + 0.06) * H, cy + Math.sin(a + 0.06) * H); ctx.fill();
  }
  const halo = ctx.createRadialGradient(X + W / 2, Y + H * 0.45, 4, X + W / 2, Y + H * 0.45, H * 0.55);
  halo.addColorStop(0, rgba(accent, 0.55)); halo.addColorStop(1, rgba(accent, 0)); ctx.fillStyle = halo; ctx.fillRect(X, Y, W, H);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = rgba('#ffffff', r.range(0.1, 0.6)); ctx.fillRect(X + r.range(0, W), Y + r.range(0, H * 0.6), r.range(1, 2.5), r.range(1, 2.5)); }
  ctx.globalCompositeOperation = 'source-over';
  // ground
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(X + W / 2, Y + H * 0.93, W * 0.34, H * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  if (card.type === 'hero') {
    const look = entry?.look || heroBaseLook(card.hero), img = heroCanvas(look, 3);
    if (img) { const s = (H * 0.86) / (img.feet - img.headTop * 0.75), w = img.width * s; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, X + W / 2 - w / 2, Y + H * 0.95 - img.feet * s, w, img.height * s); }
  } else if (card.type === 'weapon' || card.type === 'offhand') {
    const s = heldCanvas(card.set, card.design, card.finish, card.el, 'icon');
    if (s) {
      const k = Math.floor(Math.min(W * 0.75 / s.width, H * 0.78 / s.height));
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
      const eg = ctx.createRadialGradient(X + W / 2, Y + H / 2, 4, X + W / 2, Y + H / 2, W * 0.4); eg.addColorStop(0, rgba(ELEMENT_COL[card.el] || accent, 0.7)); eg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eg; ctx.fillRect(X, Y, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(s, X + W / 2 - s.width * k / 2, Y + H * 0.48 - s.height * k / 2, s.width * k, s.height * k);
    }
  } else if (card.type === 'armor' || card.type === 'helm') {
    const src = card.type === 'armor' ? armorCanvas(card.cls, card.armor, card.finish) : helmCanvas(card.cls, card.helm, card.finish)?.img;
    const meta = card.type === 'armor' ? null : helmCanvas(card.cls, card.helm, card.finish);
    if (src) {
      let bx = 0, by = 0, bw = src.width, bh = src.height;
      if (meta) [bx, by, bw, bh] = [meta.box[0], meta.box[1], meta.box[2] - meta.box[0], meta.box[3] - meta.box[1]];
      else { bx = 24; by = 40; bw = 80; bh = 152; }
      const k = Math.min(W * 0.8 / bw, H * 0.86 / bh);
      ctx.imageSmoothingEnabled = !!meta; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, bx, by, bw, bh, X + W / 2 - bw * k / 2, Y + H * 0.5 - bh * k / 2, bw * k, bh * k);
    }
  } else if (card.type === 'trophy') {   // the monster itself, painted, on a blood-red ground
    const img = monsterImage(card.monster, card.rarity >= 3 ? 'elite' : 'base', 420);
    if (img) { const k = Math.min(W * 0.84 / img.width, H * 0.86 / img.height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, X + W / 2 - img.width * k * img.fx, Y + H * 0.95 - img.height * k, img.width * k, img.height * k); }
  } else if (card.type === 'relic' && gems) {
    const c = gems.meta[card.gem] || gems.meta.gem_diamond;
    if (c) { const k = Math.min(W * 0.55 / c.w, H * 0.62 / c.h); ctx.imageSmoothingEnabled = true; ctx.drawImage(gems.img, c.x, c.y, c.w, c.h, X + W / 2 - c.w * k / 2, Y + H * 0.48 - c.h * k / 2, c.w * k, c.h * k); }
  }
  // vignette
  const v = ctx.createRadialGradient(X + W / 2, Y + H / 2, H * 0.3, X + W / 2, Y + H / 2, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = v; ctx.fillRect(X, Y, W, H);
  ctx.restore();
}

const cache = new Map();
/**
 * A card face. entry: the save's copy ({ lvl, stars, refine, foil }) or null for the plain card. scale 1 = 630x880.
 * stats: optional { atk, range, cost } for heroes (the unit's numbers with gear), else the card's base.
 */
export function renderCard(card, entry = null, scale = 0.5, stats = null) {
  const key = `${card.id}|${scale}|${entry ? [entry.lvl, entry.stars, entry.refine, entry.foil].join(',') : '-'}|${stats ? Math.round(stats.atk) + ',' + stats.range.toFixed(1) : ''}|${entry?.look ? Object.values(entry.look).join(',') : ''}`;
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(CARD_W * scale, CARD_H * scale), ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const F = frameOf(card), rar = RARITIES[card.rarity], hero = card.type === 'hero';
  // the black border and the coloured frame
  rr(0, ctx, 0, 0, CARD_W, CARD_H, 30); ctx.fillStyle = '#0a0a0c'; ctx.fill();
  rr(0, ctx, 20, 20, CARD_W - 40, CARD_H - 40, 18); ctx.save(); ctx.clip();
  ctx.drawImage(frameTexture(F.base), 0, 0, CARD_W, CARD_H);
  const fg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H); fg.addColorStop(0, 'rgba(255,255,255,0.18)'); fg.addColorStop(0.5, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = fg; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();
  // rarity trim inside the frame
  ctx.strokeStyle = rar.color; ctx.lineWidth = 3; rr(0, ctx, 30, 30, CARD_W - 60, CARD_H - 60, 14); ctx.stroke();
  // the title bar
  const bar = (y, h, col) => {
    rr(0, ctx, 40, y, CARD_W - 80, h, 12);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, shade(col, 0.45)); g.addColorStop(0.5, shade(col, 0.15)); g.addColorStop(1, shade(col, -0.25));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#141008'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; rr(0, ctx, 44, y + 3, CARD_W - 88, h - 6, 10); ctx.stroke();
  };
  bar(42, 58, F.base);
  const cost = hero ? (stats?.cost ?? KITS[card.cls].cost + Math.max(0, card.rarity - 2) * 2) : null;
  ctx.textBaseline = 'middle';
  const nameMax = CARD_W - 120 - (cost ? 70 : 0);
  fitText(ctx, card.name, nameMax, 34, '700 $px Cinzel, serif');
  ctx.fillStyle = '#000'; ctx.fillText(card.name, 62, 73); ctx.fillStyle = shade(F.ink, 0); ctx.fillStyle = F.ink === '#e8e0f0' ? '#f4eefa' : '#120c06'; ctx.fillText(card.name, 60, 71);
  if (cost) { // the Valor cost: a blue-black rift orb
    const ox = CARD_W - 84, oy = 71, og = ctx.createRadialGradient(ox - 6, oy - 8, 2, ox, oy, 24);
    og.addColorStop(0, '#d8ecff'); og.addColorStop(0.45, '#3a6cff'); og.addColorStop(1, '#060a20');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(ox, oy, 23, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '900 26px Cinzel, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(cost, ox, oy + 2); ctx.shadowBlur = 0; ctx.textAlign = 'left';
  } else if (card.cls) { // gear: the class's colour pip
    ctx.fillStyle = ART.classes[card.cls].color; ctx.beginPath(); ctx.arc(CARD_W - 84, 71, 18, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
  }
  // art
  const AX = 52, AY = 108, AW = CARD_W - 104, AH = 372;
  ctx.fillStyle = '#000'; ctx.fillRect(AX - 4, AY - 4, AW + 8, AH + 8);
  drawArt(ctx, card, entry, AX, AY, AW, AH);
  ctx.strokeStyle = shade(F.base, -0.5); ctx.lineWidth = 2; ctx.strokeRect(AX - 1, AY - 1, AW + 2, AH + 2);
  // type line
  bar(488, 50, F.base);
  const cl = card.cls ? ART.classes[card.cls].name : 'Any hero';
  const typeLine = hero ? `Hero — ${cl} · ${KITS[card.cls].role}` : `${TYPES[card.type]} — ${cl}`;
  fitText(ctx, typeLine, CARD_W - 170, 25, '700 $px Cinzel, serif');
  ctx.fillStyle = F.ink === '#e8e0f0' ? '#f4eefa' : '#120c06'; ctx.fillText(typeLine, 60, 514);
  setSymbol(ctx, CARD_W - 76, 513, 17, card.rarity);
  // text box
  const TX = 56, TY = 546, TW_ = CARD_W - 112, TH_ = 244;
  rr(0, ctx, TX, TY, TW_, TH_, 6);
  const tg = ctx.createLinearGradient(0, TY, 0, TY + TH_); tg.addColorStop(0, mixHex(F.base, '#f6eedc', 0.8)); tg.addColorStop(1, mixHex(F.base, '#d8ccb0', 0.72));
  ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = '#1a140a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#1a1208';
  let y = TY + 34;
  const para = (bold, text, size = 21) => {
    const B = `800 ${size}px "Alegreya Sans", sans-serif`, N = `500 ${size}px "Alegreya Sans", sans-serif`;
    ctx.font = B; const bw = bold ? ctx.measureText(bold + ' ').width : 0;
    ctx.font = N;
    const lines = []; let line = '', first = true;
    for (const w of text.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > TW_ - 36 - (first ? bw : 0) && line) { lines.push([line, first]); line = w; first = false; } else line = t;
    }
    if (line) lines.push([line, first]);
    for (const [l, f] of lines) {
      if (f && bold) { ctx.font = B; ctx.fillText(bold, TX + 18, y); ctx.font = N; ctx.fillText(l, TX + 18 + bw, y); } else ctx.fillText(l, TX + 18, y);
      y += size * 1.18;
    }
    y += 5;
  };
  if (hero) {
    para(card.hero.trait.name + ' —', card.text, 20);
    const sk = KITS[card.cls].skill; para(sk.name + ' —', sk.text, 19);
  } else para('', card.text, 22);
  if (y < TY + TH_ - 50) {
    ctx.strokeStyle = 'rgba(40,30,10,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(TX + 60, y - 10); ctx.lineTo(TX + TW_ - 60, y - 10); ctx.stroke();
    ctx.font = 'italic 400 18px "Alegreya Sans", sans-serif'; ctx.fillStyle = '#3a2a14';
    for (const l of wrap(ctx, card.flavor || '', TW_ - 40)) { if (y > TY + TH_ - 14) break; ctx.fillText(l, TX + 20, y + 8); y += 21; }
  }
  // stars and level (heroes), refine (gear)
  ctx.font = '800 20px "Alegreya Sans", sans-serif';
  if (hero) {
    const st = entry?.stars || 1;
    // five stars; awakened ones (6-10) turn crimson from the left
    const aw = Math.max(0, st - 5), gold = Math.min(5, st) - aw, sw = ctx.measureText('★').width;
    ['#e8402a', '#c08a10', 'rgba(0,0,0,0.35)'].forEach((c, k) => { ctx.fillStyle = c; const n0 = [0, aw, aw + gold][k], n = [aw, gold, 5 - aw - gold][k]; ctx.fillText('★'.repeat(n), TX + 10 + n0 * sw, TY + TH_ + 30); });
    if (entry) { ctx.fillStyle = '#f0e8d8'; ctx.fillText('Lv ' + entry.lvl, TX + 130, TY + TH_ + 30); }
    // the ATK box, bottom right
    const atk = Math.round(stats?.atk ?? KITS[card.cls].atk * RARITIES[card.rarity].mult), rng = (stats?.range ?? KITS[card.cls].range).toFixed(1);
    const bx = CARD_W - 196, by = CARD_H - 104;
    rr(0, ctx, bx, by, 150, 56, 10);
    const bg = ctx.createLinearGradient(0, by, 0, by + 56); bg.addColorStop(0, shade(F.base, 0.4)); bg.addColorStop(1, shade(F.base, -0.2));
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = '#141008'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '900 30px Cinzel, serif'; ctx.fillStyle = F.ink === '#e8e0f0' ? '#fff' : '#120c06';
    ctx.fillText(`${atk}/${rng}`, bx + 75, by + 39); ctx.textAlign = 'left';
  } else if (entry?.refine) { ctx.fillStyle = '#ffe08a'; ctx.fillText('+' + entry.refine, TX + 10, TY + TH_ + 30); }
  // collector line
  ctx.font = '600 13px "Alegreya Sans", sans-serif'; ctx.fillStyle = '#d8d0c0';
  const num = Object.keys(CARDS).indexOf(card.id) + 1;
  ctx.fillText(`${String(num).padStart(4, '0')} · ${rar.name[0]} · VELSCOUR DEFENSE`, 40, CARD_H - 30);
  ctx.fillText(entry?.foil ? '✦ FOIL' : '', 40, CARD_H - 48);
  ctx.textAlign = 'right'; ctx.fillText('Art: Velscour', CARD_W - (hero ? 220 : 40), CARD_H - 30); ctx.textAlign = 'left';
  if (cache.size > 220) cache.delete(cache.keys().next().value);
  cache.set(key, c);
  return c;
}

/** The back of every card: the rift, the logo and the gilded ring. */
let backC = null, logo = null;
export async function loadCardBack() { if (!logo) logo = await loadImage('assets/ui/logo.webp').catch(() => null); }
export function renderBack(scale = 1) {
  if (backC && backC.width === Math.round(CARD_W * scale)) return backC;
  const c = makeCanvas(CARD_W * scale, CARD_H * scale), ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  rr(0, ctx, 0, 0, CARD_W, CARD_H, 30); ctx.fillStyle = '#05060c'; ctx.fill();
  const g = ctx.createRadialGradient(CARD_W / 2, CARD_H / 2, 10, CARD_W / 2, CARD_H / 2, CARD_H * 0.6);
  g.addColorStop(0, '#2a4cff'); g.addColorStop(0.25, '#0c1a5a'); g.addColorStop(0.6, '#060a1e'); g.addColorStop(1, '#020208');
  rr(0, ctx, 22, 22, CARD_W - 44, CARD_H - 44, 18); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.translate(CARD_W / 2, CARD_H / 2); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) { ctx.rotate(0.35); ctx.strokeStyle = `rgba(${90 + i * 6},${130 + i * 4},255,${0.22 - i * 0.008})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 60 + i * 13, 120 + i * 18, 0, 0, 3.6); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 4; rr(0, ctx, 36, 36, CARD_W - 72, CARD_H - 72, 14); ctx.stroke();
  ctx.lineWidth = 1.5; rr(0, ctx, 46, 46, CARD_W - 92, CARD_H - 92, 10); ctx.stroke();
  for (const [x, y] of [[60, 60], [CARD_W - 60, 60], [60, CARD_H - 60], [CARD_W - 60, CARD_H - 60]]) { ctx.fillStyle = '#e8c070'; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 12); ctx.lineTo(x - 9, y); ctx.fill(); }
  if (logo) { const w = CARD_W * 0.78, h = w * logo.height / logo.width; ctx.drawImage(logo, CARD_W / 2 - w / 2, CARD_H * 0.42 - h / 2, w, h); }
  ctx.font = '900 44px Cinzel, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cfe0ff'; ctx.shadowColor = '#3a6cff'; ctx.shadowBlur = 18;
  ctx.fillText('D E F E N S E', CARD_W / 2, CARD_H * 0.42 + 110); ctx.shadowBlur = 0;
  ctx.font = '600 18px "Alegreya Sans", sans-serif'; ctx.fillStyle = '#8aa0d0'; ctx.fillText('A RIFT CARD', CARD_W / 2, CARD_H - 76);
  backC = c;
  return c;
}
