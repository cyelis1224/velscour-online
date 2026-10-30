// Procedural skill icons and cached data-URLs for DOM use.
import { makeCanvas, TAU, shade, rgba } from '../core/util.js';
import { elem, glowSprite } from '../gfx/vfx.js';
import { drawShape } from '../gfx/shapes.js';
import { pixelSprite } from '../gfx/pixelart.js';
import { classSprite } from '../core/assets.js';
import { artIcon } from '../core/classart.js';
import { itemLook } from '../core/gearart.js';
import { heldIconKey } from '../gfx/heldart.js';
import { SUMMONS } from '../data/summons.js';
import { itemIcon } from '../game/loot.js';
import { enemyImage } from '../core/enemyart.js';
import { NOTES } from '../data/notation.js';
import { drawGlyph } from '../gfx/notation.js';
import { drawSun, drawMoon, drawBlackHole, drawChartStar } from '../gfx/cosmos.js';
import { slimeIconParts } from '../gfx/slimeart.js';

const cache = new Map();
const urlCache = new Map();

export function skillIcon(sk, size = 64) {
  const key = sk.id + '|' + size;
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  let keep = true; // false while a summon's painted art is still loading: draw the fallback, don't cache it
  const x = c.getContext('2d', { willReadFrequently: true }); // CPU-backed: read back by toDataURL with no GPU stall (~10-150 ms)
  const E = elem(sk.classId === 'arcane_sorcerer' && sk.el === 'arcane' ? 'astral' : sk.el); // the Astronomer's blue starlight
  const s = size / 64;
  // background
  const g = x.createRadialGradient(size * 0.5, size * 0.42, 2, size * 0.5, size * 0.5, size * 0.75);
  g.addColorStop(0, shade(E.glow, -0.15)); g.addColorStop(0.45, shade(E.dark, -0.35)); g.addColorStop(1, '#070405');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  // subtle rune ring by tree
  x.strokeStyle = rgba(E.glow, 0.25); x.lineWidth = 2 * s;
  x.beginPath(); x.arc(size / 2, size / 2, size * 0.4, 0, TAU); x.stroke();
  x.save();
  const note = NOTES[sk.m.note] ? sk.m.note : null;
  const body = { sunslam: 1, moonfall: 1, blackhole: 1, well: 1, singularity: 1, mirror: 1, bigbang: 1, eclipse: 1, heavensmap: 1, chart: 1, ignite: 1 }[sk.m.astro];
  if (sk.classId === 'arcane_sorcerer') { // a starfield behind every Astronomer icon
    for (let i = 0; i < 14; i++) { x.fillStyle = rgba('#ffffff', 0.25 + (i % 3) * 0.2); const a = i * 2.39996, r = size * (0.18 + (i * 0.037) % 0.3); x.fillRect(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, Math.max(1, s), Math.max(1, s)); }
  }
  if (body) { // the special spells show their heavenly body
    const h = size / 2, m = sk.m.astro;
    if (m === 'sunslam') drawSun(x, h, h, size * 0.24, 1.3, 0.8);
    else if (m === 'moonfall') drawMoon(x, h, h, size * 0.26, 0.5);
    else if (m === 'blackhole' || m === 'well') drawBlackHole(x, h, h + size * 0.06, size * (m === 'well' ? 0.2 : 0.26), 0.7, 1);
    else if (m === 'eclipse') { drawSun(x, h, h, size * 0.22, 0.4, 0.5); x.fillStyle = '#05040a'; x.beginPath(); x.arc(h + size * 0.05, h, size * 0.22, 0, TAU); x.fill(); }
    else if (m === 'bigbang') { for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; x.strokeStyle = ['#4aa8ff', '#ffd060', '#ff80e0'][i % 3]; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(h + Math.cos(a) * size * 0.08, h + Math.sin(a) * size * 0.08); x.lineTo(h + Math.cos(a) * size * 0.4, h + Math.sin(a) * size * 0.4); x.stroke(); } drawChartStar(x, h, h, 1.3 * s, 0); }
    else if (m === 'mirror') for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; drawChartStar(x, h + Math.cos(a) * size * 0.3, h + Math.sin(a) * size * 0.3, 0.55 * s, i); }
    else { // the chart skills: a little constellation
      const P = [[0.2, 0.7], [0.38, 0.45], [0.55, 0.55], [0.7, 0.3], [0.84, 0.42]];
      x.strokeStyle = rgba('#9fe6ff', 0.8); x.lineWidth = 1.5 * s; x.beginPath(); P.forEach(([a, b], i) => (i ? x.lineTo(a * size, b * size) : x.moveTo(a * size, b * size))); x.stroke();
      for (const [a, b] of P) drawChartStar(x, a * size, b * size, 0.5 * s, a * 9);
    }
    x.restore();
    x.strokeStyle = 'rgba(0,0,0,0.85)'; x.lineWidth = 3 * s; x.strokeRect(1, 1, size - 2, size - 2);
    x.strokeStyle = rgba(E.glow, 0.5); x.lineWidth = 1; x.strokeRect(3, 3, size - 6, size - 6);
    cache.set(key, c);
    return c;
  }
  if (note) { // a Bard skill: its glyph on a staff, with the kind's emblem shrunk into the corner
    x.strokeStyle = rgba('#f2e6c4', 0.4); x.lineWidth = Math.max(1, s);
    for (let i = 0; i < 5; i++) { const y = size * (0.34 + i * 0.075); x.beginPath(); x.moveTo(size * 0.08, y); x.lineTo(size * 0.92, y); x.stroke(); }
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.8;
    x.drawImage(glowSprite(E.glow), size * 0.12, size * 0.08, size * 0.76, size * 0.76);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    drawGlyph(x, note, size * 0.46, size * 0.46, s * (note === 's4' ? 1.25 : 1.55), '#fff8e2');
    x.translate(size * 0.8, size * 0.8);
    x.scale(s * 0.3, s * 0.3);
  } else {
    x.translate(size / 2, size / 2);
    x.scale(s, s);
  }
  x.lineCap = 'round'; x.lineJoin = 'round';
  const core = E.core, glow = E.glow;
  const stroke = (w, col = core) => { x.lineWidth = w; x.strokeStyle = col; x.stroke(); };
  switch (sk.kind) {
    case 'proj': case 'rain': {
      const n = sk.kind === 'rain' ? 3 : Math.min(3, sk.m.n || 1);
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i - (n - 1) / 2) * 12 : 0;
        if (sk.kind === 'rain') drawShape(x, sk.fx === 'ice' ? 'shard' : sk.fx === 'acid' ? 'blob' : sk.fx, off, -4 + Math.abs(off) * 0.4, Math.PI / 2 + 0.3, 1.4, E, 0.3);
        else drawShape(x, sk.fx, off * 0.6, off, -0.6, 2.1 - n * 0.3, E, 0.4);
      }
      break;
    }
    case 'orbit':
      x.beginPath(); x.arc(0, 0, 17, 0, TAU); stroke(1.5, rgba(glow, 0.6));
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU - 0.5; drawShape(x, sk.fx, Math.cos(a) * 17, Math.sin(a) * 17, a + 1.6, 1, E, 0.2); }
      break;
    case 'melee': {
      if (sk.fx === 'smash') {
        x.save(); x.rotate(-0.7);
        x.fillStyle = '#8a6a40'; x.fillRect(-2.5, -6, 5, 30);
        x.fillStyle = core; x.strokeStyle = '#100808'; x.lineWidth = 2;
        x.fillRect(-12, -18, 24, 13); x.strokeRect(-12, -18, 24, 13);
        x.restore();
      } else if (sk.fx === 'thrust') {
        x.beginPath(); x.moveTo(-20, 20); x.lineTo(16, -16); stroke(4, '#a08060');
        x.beginPath(); x.moveTo(22, -22); x.lineTo(12, -16); x.lineTo(16, -12); x.closePath(); x.fillStyle = core; x.fill();
      } else if (sk.fx === 'claw' || sk.fx === 'bite') {
        for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(-16 + i * 7, -18); x.quadraticCurveTo(i * 7, 0, -4 + i * 7, 20); stroke(4); }
      } else if (sk.fx === 'spin') {
        x.beginPath(); x.arc(0, 0, 18, 0.3, TAU - 0.3); stroke(5);
        x.beginPath(); x.moveTo(18, -6); x.lineTo(14, 4); x.lineTo(24, 2); x.fillStyle = core; x.fill();
      } else {
        x.save(); x.rotate(-0.8);
        x.fillStyle = core; x.strokeStyle = '#100808'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(0, -26); x.lineTo(4, -20); x.lineTo(4, 8); x.lineTo(-4, 8); x.lineTo(-4, -20); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = '#c0a040'; x.fillRect(-10, 8, 20, 4); x.fillStyle = '#6a4a2a'; x.fillRect(-2, 12, 4, 10);
        x.restore();
        x.beginPath(); x.arc(0, 0, 22, -2.4, -0.4); stroke(2, rgba(glow, 0.8));
      }
      if ((sk.m.n || 1) > 1) { x.fillStyle = '#fff'; x.font = 'bold 13px sans-serif'; x.fillText('x' + sk.m.n, 8, 26); }
      break;
    }
    case 'nova':
      for (let r = 6; r <= 24; r += 9) { x.beginPath(); x.arc(0, 0, r, 0, TAU); stroke(3, r > 20 ? glow : core); }
      break;
    case 'aoe':
      x.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? 9 : 24; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      x.closePath(); x.fillStyle = glow; x.fill(); x.fillStyle = core; x.beginPath(); x.arc(0, 0, 8, 0, TAU); x.fill();
      if (sk.fx === 'meteor') drawShape(x, 'meteor', -10, -12, 0.8, 1.2, E, 0);
      break;
    case 'beam':
      if (sk.m.cone) { x.beginPath(); x.moveTo(-20, 18); x.lineTo(24, -10); x.lineTo(10, -24); x.closePath(); x.fillStyle = rgba(glow, 0.8); x.fill(); }
      else { x.beginPath(); x.moveTo(-22, 22); x.lineTo(22, -22); stroke(10, glow); x.beginPath(); x.moveTo(-22, 22); x.lineTo(22, -22); stroke(3, '#fff'); }
      break;
    case 'chain': case 'strike':
      x.beginPath(); x.moveTo(6, -26); x.lineTo(-6, -4); x.lineTo(6, -2); x.lineTo(-6, 24); stroke(6, glow); x.beginPath(); x.moveTo(6, -26); x.lineTo(-6, -4); x.lineTo(6, -2); x.lineTo(-6, 24); stroke(2, '#fff');
      break;
    case 'wall':
      for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(i * 13 - 6, 18); x.quadraticCurveTo(i * 13, -26 + Math.abs(i) * 8, i * 13 + 6, 18); x.fillStyle = i ? glow : core; x.fill(); }
      break;
    case 'zone': case 'trap':
      x.beginPath(); x.ellipse(0, 6, 24, 12, 0, 0, TAU); x.fillStyle = rgba(glow, 0.5); x.fill(); stroke(2, core);
      if (sk.kind === 'trap') for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 8 - 3, 8); x.lineTo(i * 8, -6); x.lineTo(i * 8 + 3, 8); x.fillStyle = '#d0d0d8'; x.fill(); }
      else for (let i = 0; i < 6; i++) { x.fillStyle = core; x.fillRect(Math.cos(i) * 14 - 2, 4 + Math.sin(i * 2) * 5 - 6 - i, 4, 4); }
      break;
    case 'cyclone':
      x.beginPath();
      for (let t = 0; t < 1; t += 0.02) { const a = t * 14, r = 4 + t * 20; x.lineTo(Math.cos(a) * r * (1 - t * 0.2), 22 - t * 44 + Math.sin(a) * r * 0.25); }
      stroke(3, glow);
      break;
    case 'whirl':
      for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(0, 0, 10 + i * 6, i * 2, i * 2 + 3.6); stroke(3, i === 1 ? core : glow); }
      break;
    case 'leap':
      x.beginPath(); x.moveTo(-22, 14); x.quadraticCurveTo(-4, -34, 18, 10); stroke(4, glow);
      x.beginPath(); x.moveTo(18, 18); x.lineTo(10, 6); x.lineTo(24, 6); x.closePath(); x.fillStyle = core; x.fill();
      x.beginPath(); x.ellipse(18, 22, 12, 4, 0, 0, TAU); stroke(2, core);
      break;
    case 'dash':
      for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(-18 + i * 12, -14); x.lineTo(-6 + i * 12, 0); x.lineTo(-18 + i * 12, 14); stroke(5, i === 2 ? core : glow); }
      break;
    case 'blink':
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; x.beginPath(); x.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); x.lineTo(Math.cos(a) * (i % 2 ? 14 : 24), Math.sin(a) * (i % 2 ? 14 : 24)); stroke(3, core); }
      break;
    case 'summon': {
      const def = SUMMONS[sk.m.sum];
      if (def && (def.slime || def.court)) { // the Slime Lord's court: its Glymmora slimes (gfx/slimeart.js)
        const parts = slimeIconParts(def);
        if (!parts) { keep = false; x.beginPath(); x.ellipse(0, 10, 18, 12, 0, 0, TAU); x.fillStyle = glow; x.fill(); }
        else parts.forEach((q, i) => {
          const n = parts.length, k = (n > 1 ? 26 : 40) / q.bh, ox = n > 1 ? (i - 1) * 15 : 0, oy = n > 1 ? (i === 1 ? -6 : 8) : 0;
          x.save(); x.translate(ox, 22 + oy); if (q.flip) x.scale(-1, 1);
          x.drawImage(q.img, q.sx, q.sy, q.sw, q.sh, -q.ax * k, -q.ay * k, q.sw * k, q.sh * k); x.restore();
        });
        if ((sk.m.n || 1) > 1) { x.fillStyle = '#fff'; x.font = 'bold 12px sans-serif'; x.fillText('x' + sk.m.n, 10, 26); }
        break;
      }
      const look = def && def.look;
      const art = look && (look.icon || (Array.isArray(look.art) ? look.art[0] : look.art));
      let img = art ? enemyImage(art) : null;
      if (art && !img) keep = false;
      if (!img && look && look.sprite) img = pixelSprite(look.sprite, look.pal, 3);
      else if (!img && look && look.cls) img = classSprite(look.cls === true ? sk.classId : look.cls, 120, look.pal || null);
      else if (!img) img = pixelSprite('skeleton', { w: '#a0ffa0', e: '#40ff40' }, 3);
      const k = Math.min(46 / img.width, 48 / img.height);
      x.globalAlpha = 0.95;
      x.drawImage(img, -img.width * k / 2, 24 - img.height * k, img.width * k, img.height * k);
      x.globalAlpha = 1;
      if ((sk.m.n || 1) > 1) { x.fillStyle = '#fff'; x.font = 'bold 12px sans-serif'; x.fillText('x' + sk.m.n, 10, 26); }
      break;
    }
    case 'buff':
      if (sk.m.transform) {
        x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 10 : 24; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fillStyle = glow; x.fill(); stroke(2, core);
      } else {
        x.beginPath(); x.moveTo(0, -24); x.lineTo(20, -14); x.lineTo(16, 10); x.lineTo(0, 24); x.lineTo(-16, 10); x.lineTo(-20, -14); x.closePath(); x.fillStyle = rgba(glow, 0.7); x.fill(); stroke(2.5, core);
        x.beginPath(); x.moveTo(0, -12); x.lineTo(9, 0); x.lineTo(3, 0); x.lineTo(3, 12); x.lineTo(-3, 12); x.lineTo(-3, 0); x.lineTo(-9, 0); x.closePath(); x.fillStyle = '#fff'; x.fill();
      }
      break;
    case 'curse':
      x.beginPath(); x.ellipse(0, 0, 24, 13, 0, 0, TAU); x.fillStyle = rgba(glow, 0.35); x.fill(); stroke(2.5, core);
      x.beginPath(); x.arc(0, 0, 7, 0, TAU); x.fillStyle = core; x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(0, 0, 3, 0, TAU); x.fill();
      break;
    case 'heal':
      x.fillStyle = glow; x.fillRect(-7, -22, 14, 44); x.fillRect(-22, -7, 44, 14);
      x.fillStyle = '#fff'; x.fillRect(-3, -18, 6, 36); x.fillRect(-18, -3, 36, 6);
      break;
    case 'fissure':
      x.beginPath(); x.moveTo(-24, 20); x.lineTo(-10, 8); x.lineTo(-14, -2); x.lineTo(2, -8); x.lineTo(0, -18); x.lineTo(22, -24); stroke(5, glow);
      for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(-18 + i * 11, 14 - i * 10); x.lineTo(-14 + i * 11, 2 - i * 10); x.lineTo(-10 + i * 11, 14 - i * 10); x.fillStyle = core; x.fill(); }
      break;
    case 'corpse': {
      const img = pixelSprite('skeleton', { w: '#e8dcc0', e: '#ff3030' }, 2);
      x.drawImage(img, -14, -16, 28, 36);
      x.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = i % 2 ? 18 : 26; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); stroke(2, glow);
      break;
    }
    default:
      x.beginPath(); x.arc(0, 0, 14, 0, TAU); x.fillStyle = glow; x.fill();
  }
  x.restore();
  // frame
  x.strokeStyle = 'rgba(0,0,0,0.85)'; x.lineWidth = 3 * s; x.strokeRect(1, 1, size - 2, size - 2);
  x.strokeStyle = rgba(E.glow, 0.5); x.lineWidth = 1; x.strokeRect(3, 3, size - 6, size - 6);
  if (keep) cache.set(key, c);
  return c;
}

export function skillIconURL(sk) {
  let u = urlCache.get(sk.id);
  if (!u) { u = skillIcon(sk, 64).toDataURL(); if (cache.has(sk.id + '|64')) urlCache.set(sk.id, u); }
  return u;
}

const itemUrlCache = new Map();
export function itemIconURL(item) {
  const art = item.art && artIcon(item, 48); // catalog art (null until the class pack has loaded)
  const look = !art && itemLook(item); // gear art of body armor and helmets
  const held = !art && !look && !item.sealed && item.type === 'gear' && heldIconKey(item); // the held weapon designs (once their set has loaded)
  const key = item.sealed ? 'sealed' : item.type === 'gem' ? `g|${item.gem}|${item.tier}` : item.type === 'potion' ? `p|${item.kind}` : art ? `a|${item.artCls}|${item.art}` : look ? `l|${item.slot}|${look[0]}|${look[1]}` : held || `${item.icon}|${item.tier}|${item.rarity}|${item.base}`;
  let u = itemUrlCache.get(key);
  if (!u) { u = itemIcon(item, 48).toDataURL(); itemUrlCache.set(key, u); }
  return u;
}

export function smiteIcon(size = 64) {
  const key = 'special_smite|' + size;
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const x = c.getContext('2d', { willReadFrequently: true });
  const s = size / 64;
  const h = size / 2;

  // Circular clip for clean round button art
  x.save();
  x.beginPath();
  x.arc(h, h, h - 2 * s, 0, TAU);
  x.clip();

  // Dark holy backdrop
  const bg = x.createRadialGradient(h, h * 0.42, 2, h, h, h * 1.15);
  bg.addColorStop(0, '#5e3a0a');
  bg.addColorStop(0.5, '#241204');
  bg.addColorStop(1, '#070302');
  x.fillStyle = bg;
  x.fillRect(0, 0, size, size);

  // Radiant celestial sunbeams radiating downward from top center
  x.save();
  x.translate(h, size * 0.1);
  const nRays = 8;
  for (let i = 0; i < nRays; i++) {
    const a = (i / (nRays - 1) - 0.5) * Math.PI * 0.72 + Math.PI / 2;
    const len = size * 0.75;
    const gBeam = x.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    gBeam.addColorStop(0, 'rgba(255, 242, 190, 0.5)');
    gBeam.addColorStop(1, 'rgba(255, 170, 30, 0)');
    x.fillStyle = gBeam;
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(Math.cos(a - 0.07) * len, Math.sin(a - 0.07) * len);
    x.lineTo(Math.cos(a + 0.07) * len, Math.sin(a + 0.07) * len);
    x.closePath();
    x.fill();
  }
  x.restore();

  // Sacred solar halo behind the hammer head
  x.strokeStyle = 'rgba(255, 220, 90, 0.45)';
  x.lineWidth = 2 * s;
  x.beginPath();
  x.arc(h, h * 0.74, size * 0.28, 0, TAU);
  x.stroke();

  // Celestial Hammer Emblem
  x.save();
  x.translate(h, h * 0.96);

  // Hammer handle
  const hGrip = x.createLinearGradient(-3 * s, 0, 3 * s, 0);
  hGrip.addColorStop(0, '#4a2c0f');
  hGrip.addColorStop(0.5, '#8c5a24');
  hGrip.addColorStop(1, '#2c1806');
  x.fillStyle = hGrip;
  x.fillRect(-2.5 * s, -6 * s, 5 * s, 22 * s);

  // Handle pommel & wrap bands
  x.fillStyle = '#ffcf52';
  x.fillRect(-3.5 * s, 14 * s, 7 * s, 3 * s);
  x.fillRect(-3 * s, 0 * s, 6 * s, 1.5 * s);
  x.fillRect(-3 * s, 6 * s, 6 * s, 1.5 * s);

  // Massive Golden Hammer Head
  x.save();
  x.translate(0, -12 * s);
  const hHead = x.createLinearGradient(-15 * s, -9 * s, 15 * s, 9 * s);
  hHead.addColorStop(0, '#fff6c2');
  hHead.addColorStop(0.35, '#ffcc33');
  hHead.addColorStop(0.75, '#cc8810');
  hHead.addColorStop(1, '#663905');
  x.fillStyle = hHead;
  x.strokeStyle = '#ffe894';
  x.lineWidth = 1.5 * s;

  // Ornate beveled head polygon
  x.beginPath();
  x.moveTo(-15 * s, -8 * s);
  x.lineTo(-12 * s, -11 * s);
  x.lineTo(12 * s, -11 * s);
  x.lineTo(15 * s, -8 * s);
  x.lineTo(17 * s, 0);
  x.lineTo(15 * s, 8 * s);
  x.lineTo(12 * s, 11 * s);
  x.lineTo(-12 * s, 11 * s);
  x.lineTo(-15 * s, 8 * s);
  x.lineTo(-17 * s, 0);
  x.closePath();
  x.fill();
  x.stroke();

  // Holy cross rune on the hammer face
  x.strokeStyle = '#ffffff';
  x.lineWidth = 2 * s;
  x.beginPath();
  x.moveTo(0, -6 * s); x.lineTo(0, 6 * s);
  x.moveTo(-5 * s, 0); x.lineTo(5 * s, 0);
  x.stroke();

  // Divine lightning sparks
  x.strokeStyle = '#fff8e0';
  x.lineWidth = 1.8 * s;
  x.beginPath();
  x.moveTo(-16 * s, -2 * s); x.lineTo(-21 * s, -7 * s); x.lineTo(-23 * s, -5 * s);
  x.moveTo(16 * s, -2 * s); x.lineTo(21 * s, -7 * s); x.lineTo(23 * s, -5 * s);
  x.moveTo(-16 * s, 3 * s); x.lineTo(-22 * s, 7 * s);
  x.moveTo(16 * s, 3 * s); x.lineTo(22 * s, 7 * s);
  x.stroke();

  x.restore(); // end hammer head
  x.restore(); // end hammer emblem
  x.restore(); // end clip

  cache.set(key, c);
  return c;
}

export function madnessIcon(size = 64) {
  const key = 'special_madness|' + size;
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const x = c.getContext('2d', { willReadFrequently: true });
  const s = size / 64;
  const h = size / 2;

  // Circular clip for clean round button art
  x.save();
  x.beginPath();
  x.arc(h, h, h - 2 * s, 0, TAU);
  x.clip();

  // Dark abyssal void background
  const bg = x.createRadialGradient(h, h * 0.5, 2, h, h, h * 1.15);
  bg.addColorStop(0, '#46092e');
  bg.addColorStop(0.5, '#1e0316');
  bg.addColorStop(1, '#060105');
  x.fillStyle = bg;
  x.fillRect(0, 0, size, size);

  // Swirling cosmic tendrils
  x.save();
  x.translate(h, h);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    x.strokeStyle = rgba('#ff1060', 0.28);
    x.lineWidth = 2.5 * s;
    x.beginPath();
    x.moveTo(Math.cos(a) * 8 * s, Math.sin(a) * 8 * s);
    x.quadraticCurveTo(
      Math.cos(a + 0.6) * 18 * s, Math.sin(a + 0.6) * 18 * s,
      Math.cos(a + 1.2) * 28 * s, Math.sin(a + 1.2) * 28 * s
    );
    x.stroke();
  }
  x.restore();

  // Licking magenta/violet soul-flames
  x.save();
  x.translate(h, h);
  const drawFlame = (fx, fy, scaleY, col) => {
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(fx - 4 * s, fy);
    x.quadraticCurveTo(fx - 6 * s, fy - 10 * s * scaleY, fx, fy - 18 * s * scaleY);
    x.quadraticCurveTo(fx + 6 * s, fy - 10 * s * scaleY, fx + 4 * s, fy);
    x.closePath();
    x.fill();
  };
  drawFlame(-12 * s, 6 * s, 0.7, 'rgba(180, 20, 100, 0.5)');
  drawFlame(12 * s, 6 * s, 0.7, 'rgba(180, 20, 100, 0.5)');
  drawFlame(-6 * s, -4 * s, 1.1, 'rgba(255, 30, 110, 0.7)');
  drawFlame(6 * s, -4 * s, 1.1, 'rgba(255, 30, 110, 0.7)');
  drawFlame(0, -6 * s, 1.3, '#ff4090');
  x.restore();

  // The Eldritch Eye
  x.save();
  x.translate(h, h);

  // Outer Eye Contour (Almond Shape with Sharp Tips)
  const eyeGrad = x.createRadialGradient(0, 0, 1, 0, 0, 16 * s);
  eyeGrad.addColorStop(0, '#ffd8ea');
  eyeGrad.addColorStop(0.35, '#ff2070');
  eyeGrad.addColorStop(0.7, '#880845');
  eyeGrad.addColorStop(1, '#2c0418');

  x.beginPath();
  x.moveTo(-20 * s, 0);
  x.quadraticCurveTo(-10 * s, -13 * s, 0, -13 * s);
  x.quadraticCurveTo(10 * s, -13 * s, 20 * s, 0);
  x.quadraticCurveTo(10 * s, 13 * s, 0, 13 * s);
  x.quadraticCurveTo(-10 * s, 13 * s, -20 * s, 0);
  x.closePath();
  x.fillStyle = eyeGrad;
  x.fill();
  x.strokeStyle = '#ff6aa8';
  x.lineWidth = 1.8 * s;
  x.stroke();

  // Iris Ring
  x.strokeStyle = 'rgba(60, 0, 30, 0.8)';
  x.lineWidth = 2 * s;
  x.beginPath();
  x.arc(0, 0, 8.5 * s, 0, TAU);
  x.stroke();

  // Black Cat / Demon Vertical Slit Pupil
  x.fillStyle = '#080105';
  x.beginPath();
  x.moveTo(0, -10 * s);
  x.quadraticCurveTo(3.5 * s, 0, 0, 10 * s);
  x.quadraticCurveTo(-3.5 * s, 0, 0, -10 * s);
  x.closePath();
  x.fill();

  // Core Pupil Spark / Inner Gleam
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(-1.5 * s, -2.5 * s, 1.5 * s, 0, TAU);
  x.fill();

  x.restore(); // end eye
  x.restore(); // end clip

  cache.set(key, c);
  return c;
}

export function smiteIconURL(size = 64) {
  const key = 'special_smite_url|' + size;
  let u = urlCache.get(key);
  if (!u) { u = smiteIcon(size).toDataURL(); urlCache.set(key, u); }
  return u;
}

export function madnessIconURL(size = 64) {
  const key = 'special_madness_url|' + size;
  let u = urlCache.get(key);
  if (!u) { u = madnessIcon(size).toDataURL(); urlCache.set(key, u); }
  return u;
}
