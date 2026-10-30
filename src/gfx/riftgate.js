// The Riftgate in Herrington Hollow: the blue-black tear that leads to VELSCOUR DEFENSE (defense/, a separate game
// with its own page and save). The dungeon portal's size but wilder: a black core in a churning blue vortex,
// lightning crawling round its rim, rune stones orbiting, and the ground cracked open beneath it.
import { G } from '../state.js';
import { isoX, isoY } from '../core/view.js';
import { TAU } from '../core/util.js';
import { glowSprite } from './vfx.js';

const STONES = 7, SCALE = 0.65;   // drawn at the size of the other portals (drawPortal in render.js)
/** Where the Riftgate stands: across the square from the dungeon portal, on open walkable ground. */
export function riftgateSpot(t) {
  const m = t.map, C = t.center, P = t.portal, dx = C.x - P.x, dy = C.y - P.y, l = Math.hypot(dx, dy) || 1;
  const open = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!m.walkable(x + i, y + j)) return false; return true; };
  const others = [t.breach, t.rift, t.altar].filter(Boolean);   // the Eternal Breach, the Abyssal Rift gate, the Altar of Heresy
  const clear = (x, y) => !t.npcs.some((n) => Math.hypot(n.x - x, n.y - y) < 3.5) && Math.hypot(x - P.x, y - P.y) > 8 && others.every((o) => Math.hypot(x - o.x, y - o.y) > 6);
  for (const d of [7, 6, 8, 5, 9, 10, 4, 11, 12]) for (let a = 0; a < 16; a++) {
    const ang = Math.atan2(dy, dx) + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.32;
    const x = Math.floor(C.x + Math.cos(ang) * d) + 0.5, y = Math.floor(C.y + Math.sin(ang) * d) + 0.5;
    if (open(x, y) && clear(x, y)) return { x, y };
  }
  return null;
}

export function drawRiftgate(ctx, p) {
  const t = G.time, H = 120, x = 0, y = 0, cy = -H * 0.55;
  ctx.save();
  ctx.translate(isoX(p.x, p.y), isoY(p.x, p.y)); ctx.scale(SCALE, SCALE);
  // the ground split open: dark cracks and a glow seeping out of them
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 + Math.sin(t * 2) * 0.15;
  ctx.drawImage(glowSprite('#2a4cff'), x - 70, y - 26, 140, 52);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.strokeStyle = '#04040a'; ctx.lineWidth = 2.5;
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9 + 0.3;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 4);
    ctx.lineTo(x + Math.cos(a + 0.2) * 26, y + Math.sin(a + 0.2) * 12); ctx.lineTo(x + Math.cos(a - 0.1) * 46, y + Math.sin(a - 0.1) * 21); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(110,160,255,0.75)'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + 0.3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 4); ctx.lineTo(x + Math.cos(a + 0.2) * 26, y + Math.sin(a + 0.2) * 12); ctx.stroke(); }
  // rune rings on the ground, counter-turning
  ctx.strokeStyle = 'rgba(80,130,255,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, 58, 27, 0, t * 0.7, t * 0.7 + 5.2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y, 44, 20, 0, -t, -t + 4.6); ctx.stroke();
  // the stones that orbit it (behind first, then in front after the vortex)
  const stone = (front) => {
    for (let i = 0; i < STONES; i++) {
      const a = t * 0.8 + i * TAU / STONES, s = Math.sin(a);
      if ((s > 0) !== front) continue;
      const sx = x + Math.cos(a) * 52, sy = cy + 26 + s * 18 + Math.sin(t * 2 + i) * 6, k = 0.75 + s * 0.25;
      ctx.fillStyle = '#14141e'; ctx.beginPath(); ctx.moveTo(sx, sy - 9 * k); ctx.lineTo(sx + 5 * k, sy); ctx.lineTo(sx, sy + 7 * k); ctx.lineTo(sx - 5 * k, sy); ctx.fill();
      ctx.fillStyle = `rgba(140,180,255,${0.6 + 0.4 * Math.sin(t * 5 + i)})`; ctx.fillRect(sx - 1, sy - 3 * k, 2, 4 * k);
    }
  };
  stone(false);
  // the vortex: a black core in turning blue rings, much taller than the dungeon portal
  ctx.translate(x, cy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9; ctx.drawImage(glowSprite('#3a6cff'), -70, -H * 0.75, 140, H * 1.5);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
  g.addColorStop(0, '#000000'); g.addColorStop(0.55, '#02030a'); g.addColorStop(0.85, '#0a1a5a'); g.addColorStop(1, 'rgba(20,40,140,0)');
  ctx.fillStyle = g; ctx.save(); ctx.scale(1, H / 80); ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill(); ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const r = 1 - i * 0.08, sp = 1.6 + i * 0.45;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(200,220,255,0.6)' : i % 3 === 1 ? 'rgba(70,110,255,0.75)' : 'rgba(30,50,200,0.8)';
    ctx.lineWidth = 3.2 - i * 0.25;
    ctx.beginPath(); ctx.ellipse(0, 0, 42 * r, H * 0.5 * r, Math.sin(t * 0.7 + i) * 0.08, t * sp * (i % 2 ? -1 : 1), t * sp * (i % 2 ? -1 : 1) + 3.6 + i * 0.15); ctx.stroke();
  }
  // lightning crawling round the rim
  ctx.strokeStyle = 'rgba(190,215,255,0.95)'; ctx.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) {
    if (Math.sin(t * 9 + k * 2.3) < 0.2) continue;
    let a = t * 3 + k * 2.1;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 42, Math.sin(a) * H * 0.5);
    for (let s = 0; s < 6; s++) { a += 0.14; const j = 1 + (Math.random() - 0.5) * 0.25; ctx.lineTo(Math.cos(a) * 42 * j, Math.sin(a) * H * 0.5 * j); }
    ctx.stroke();
  }
  // motes sucked into the core
  for (let i = 0; i < 18; i++) {
    const f = ((t * 0.45 + i / 18) % 1), a = i * 2.4 + t * 0.6, r = (1 - f) * 70;
    ctx.globalAlpha = f; ctx.fillStyle = i % 2 ? '#9ab8ff' : '#ffffff';
    ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r * H / 90, 2, 2);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.translate(-x, -cy);
  stone(true);
  ctx.restore();
}
