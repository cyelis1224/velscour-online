// What the battle looks like in motion: particles, floating numbers, and how each class's shots, slashes and skills
// are drawn. Reads the sim's shots/zones every frame and turns its events into bursts.
import { TAU, rand, chance, rgba, shade, clamp, makeCanvas } from '../core/util.js';
import { isoX, isoY, HZ } from '../art/terrain.js';
import { ELEMENT_COL } from '../art/heroart.js';
import { sfx, playJingle } from '../core/audio.js';

export const parts = [], texts = [], rings = [], flashes = [];
const P_MAX = 900;
const glows = new Map();
export function glow(col) {
  let c = glows.get(col);
  if (c) return c;
  c = makeCanvas(64, 64); const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.35, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); glows.set(col, c);
  return c;
}
const EL = (el) => ELEMENT_COL[el] || '#ffffff';
/** p: { x, y, z (levels), vx, vy (tiles/s), vz (levels/s), g, life, size, size1, color, add, kind } */
export function spawn(p) {
  if (parts.length >= P_MAX) parts.shift();
  p.t = 0; p.size1 ??= p.size; p.g ??= 0; p.vx ??= 0; p.vy ??= 0; p.vz ??= 0;
  parts.push(p);
}
export function burst(x, y, z, col, n = 10, sp = 2, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(0.3, 1) * sp;
    spawn({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(0.5, 3) * (o.up ?? 1), g: o.g ?? 6, life: rand(0.3, 0.7) * (o.life ?? 1), size: o.size ?? rand(1.5, 3), size1: 0.3, color: col, add: o.add ?? true, kind: o.kind });
  }
}
export function ring(x, y, z, r0, r1, dur, col, w = 3) { rings.push({ x, y, z, r0, r1, dur, col, w, t: 0 }); }
export function float(x, y, z, text, col, size = 13) { if (texts.length > 70) texts.shift(); texts.push({ x, y, z, text, col, size, t: 0 }); }

export function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) { parts.splice(i, 1); continue; }
    p.vz -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.floor !== undefined && p.z < p.floor) { p.z = p.floor; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
  }
  for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].t += dt) >= rings[i].dur) rings.splice(i, 1);
  for (let i = texts.length - 1; i >= 0; i--) if ((texts[i].t += dt) >= 1) texts.splice(i, 1);
  for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].t += dt) >= flashes[i].dur) flashes.splice(i, 1);
}

// ------------------------------------------------------------------ the sim's events become bursts and sounds
export function handleEvents(b, R) {
  for (const e of b.events) {
    switch (e.type) {
      case 'hit': {
        const m = e.m, col = EL(e.el);
        if (chance(0.7)) burst(m.x, m.y, m.z + 0.9, col, 4, 1.4, { size: 2 });
        if (R.settings.numbers && e.d >= 1) float(m.x, m.y, m.z + 2.2, Math.round(e.d), e.u?.def?.kit?.dmg === 'magic' ? '#c8a8ff' : '#ffe8c0', 11);
        break;
      }
      case 'kill': {
        const m = e.m;
        burst(m.x, m.y, m.z + 0.8, m.boss ? '#ff4030' : '#8a1010', m.boss ? 60 : 14, m.boss ? 4 : 2.2, { add: false, size: 2.5, g: 9 });
        burst(m.x, m.y, m.z + 0.8, '#ffd070', m.boss ? 30 : 4, 1.2, { size: 1.6 });
        R.corpse(m);
        if (m.boss || m.lt) { R.shake(m.boss ? 14 : 7); sfx('rock_meteor_swarm', 0.9); }
        else if (chance(0.25)) sfx('sword_impact_hit', 0.25);
        break;
      }
      case 'leak': ring(e.m.x, e.m.y, e.m.z, 0.2, 1.4, 0.5, '#ff3030', 4); R.shake(6); R.heartHit(); sfx('sword_blocked', 0.7); break;
      case 'deploy': {
        const u = e.u;
        ring(u.x, u.y, u.z, 0.1, 1.2, 0.5, u.def.kit ? EL(u.def.kit.el) : '#fff', 4);
        for (let i = 0; i < 18; i++) spawn({ x: u.x + rand(-0.3, 0.3), y: u.y + rand(-0.3, 0.3), z: u.z, vz: rand(2, 6), life: rand(0.5, 0.9), size: rand(1.5, 3), size1: 0, color: '#9ad0ff', add: true });
        sfx('gate_open', 0.35);
        break;
      }
      case 'empower': ring(e.u.x, e.u.y, e.u.z, 0.2, 1, 0.6, '#ffd060', 3); burst(e.u.x, e.u.y, e.u.z + 1, '#ffe080', 16, 1.6, { up: 2 }); sfx('firebuff', 0.5); break;
      case 'retreat': burst(e.u.x, e.u.y, e.u.z + 0.8, '#9ad0ff', 14, 1.5); break;
      case 'wave': R.banner(e.boss ? 'BOSS WAVE' : e.lt ? 'LIEUTENANT' : `WAVE ${e.g}`, e.boss || e.lt ? '#ff4a30' : '#9ad0ff'); if (e.boss || e.lt) sfx('portcullis_gate', 0.8); break;
      case 'attack': attackFx(e.u, e.m); break;
      case 'melee': meleeFx(e.u, e.m, e.fx); break;
      case 'breath': breathFx(e.u, e.m, e.r, 1); break;
      case 'land': ring(e.x, e.y, e.z, 0.2, e.r + 0.3, 0.35, '#9ad0ff', 3); burst(e.x, e.y, e.z + 0.2, '#c0e0ff', 14, 2.5, { add: true }); R.shake(3); sfx('sword_impact_hit', 0.5); break;
      case 'impact': impactFx(e); break;
      case 'skill': skillFx(e, R); break;
      case 'roar': case 'hex': for (const u of e.units) { ring(u.x, u.y, u.z + 1, 0.1, 0.6, 0.5, '#c060ff', 2); float(u.x, u.y, u.z + 2.6, 'STUNNED', '#d080ff', 11); } if (e.type === 'roar') { ring(e.m.x, e.m.y, e.m.z, 0.3, 3, 0.7, '#ff6030', 5); R.shake(5); } break;
      case 'heal': ring(e.m.x, e.m.y, e.m.z, 0.2, 1.8, 0.6, '#60ff90', 2); break;
      case 'summon': ring(e.m.x, e.m.y, e.m.z, 0.5, 2.5, 0.8, '#ff2040', 4); break;
      case 'enrage': float(e.m.x, e.m.y, e.m.z + 4, 'ENRAGED!', '#ff3020', 18); R.shake(10); break;
      case 'raise': burst(e.x, e.y, e.z + 0.3, '#80ff9a', 18, 1.4, { up: 2 }); ring(e.x, e.y, e.z, 0.1, 0.8, 0.5, '#80ff9a', 3); break;
      case 'unraise': burst(e.x, e.y, e.z + 0.5, '#d8e8d0', 10, 1.2, { add: false }); break;
      case 'crit': float(e.m.x, e.m.y, e.m.z + 2.8, 'CRIT', '#ffcc30', 12); break;
      case 'crows': for (const m of e.ts.slice(0, 6)) spawn({ x: m.x + rand(-0.4, 0.4), y: m.y + rand(-0.4, 0.4), z: m.z + rand(1, 2), vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(-1, 1), life: 0.5, size: 3, size1: 2, color: '#1a1418', add: false, kind: 'crow' }); break;
    }
  }
  b.events.length = 0;
}

const SND = { arrow: 'bow_attack', bullet: 'torch_attack_strike', fireball: 'fireball', bonespear: 'ice_throw', crow: 'wave_attack', note: null, starfall: 'spell_impact',
  boomerang: 'wave_attack', chain: 'spell_impact', hammer: 'sword_attack', cleave: 'sword_attack', frostslash: 'ice_throw', slimeslam: 'waterspray', thrust: 'sword_attack', breath: 'firespray', leap: 'sword_attack' };
function attackFx(u, m) {
  const fx = u.def.kit.fx, s = SND[fx];
  if (s && chance(fx === 'bullet' ? 0.35 : 0.8)) sfx(s, fx === 'bullet' ? 0.22 : 0.32);
  if (fx === 'bullet') { burst(u.x + (m.x - u.x) * 0.1, u.y + (m.y - u.y) * 0.1, u.z + 1.1, '#ffd080', 3, 0.8, { size: 1.5, life: 0.4 }); }
}
function meleeFx(u, m, fx) {
  const col = fx === 'frostslash' ? '#9ae6ff' : fx === 'hammer' ? '#ffe080' : fx === 'slimeslam' ? '#4ab8ff' : fx === 'skeleton' ? '#d0ffd8' : fx === 'thrust' ? '#fff6c0' : '#ff9060';
  flashes.push({ kind: fx === 'thrust' ? 'thrust' : 'slash', x: u.x, y: u.y, z: u.z, tx: m.x, ty: m.y, tz: m.z, col, t: 0, dur: fx === 'hammer' ? 0.3 : 0.22, big: fx === 'cleave' || fx === 'hammer', flip: chance(0.5) });
  burst(m.x, m.y, m.z + 0.8, col, fx === 'cleave' ? 10 : 6, 2);
  if (fx === 'hammer') ring(m.x, m.y, m.z, 0.1, 0.9, 0.3, '#ffe080', 2);
  if (fx === 'slimeslam') for (let i = 0; i < 8; i++) spawn({ x: m.x, y: m.y, z: m.z + 0.5, vx: rand(-1.5, 1.5), vy: rand(-1.5, 1.5), vz: rand(2, 4), g: 10, life: 0.5, size: 3, size1: 1, color: '#4ab8ff', add: false, floor: m.z });
}
function breathFx(u, m, r, k) {
  const a = Math.atan2(m.y - u.y, m.x - u.x);
  for (let i = 0; i < 22 * k; i++) {
    const aa = a + rand(-0.55, 0.55), sp = rand(3, 6) * r / 2;
    spawn({ x: u.x, y: u.y, z: u.z + 1, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, vz: rand(-0.2, 0.8), life: rand(0.3, 0.5) * r / 1.7, size: rand(3, 5), size1: rand(7, 11), color: chance(0.5) ? '#ff7a2a' : '#ffd040', add: true });
  }
}
function impactFx(e) {
  const s = e.s, col = EL(s.el);
  switch (s.kind) {
    case 'fireball': case 'bomb': case 'cannon':
      burst(e.x, e.y, e.z + 0.3, '#ff8a30', 18, 2.6); burst(e.x, e.y, e.z + 0.3, '#ffe080', 8, 1.5);
      ring(e.x, e.y, e.z, 0.1, (e.r || 0.8) + 0.2, 0.35, '#ff7020', 3);
      for (let i = 0; i < 5; i++) spawn({ x: e.x, y: e.y, z: e.z + 0.4, vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), vz: rand(0.5, 1.4), life: rand(0.8, 1.4), size: rand(4, 7), size1: rand(10, 16), color: '#3a2a22', add: false });
      sfx('fireball', 0.3); break;
    case 'meteor':
      burst(e.x, e.y, e.z + 0.3, '#ff6020', 60, 4.5); burst(e.x, e.y, e.z + 0.3, '#ffe0a0', 30, 3);
      ring(e.x, e.y, e.z, 0.2, e.r + 0.5, 0.6, '#ff5010', 6); flashes.push({ kind: 'flash', col: '#ff8040', t: 0, dur: 0.25 });
      sfx('rock_meteor_swarm', 1); break;
    case 'supernova':
      ring(e.x, e.y, e.z, 0.1, e.r + 0.8, 0.8, '#c87aff', 8); ring(e.x, e.y, e.z, 0.1, e.r, 0.5, '#ffffff', 4);
      burst(e.x, e.y, e.z + 1, '#c87aff', 70, 5); burst(e.x, e.y, e.z + 1, '#80d0ff', 40, 3.5);
      flashes.push({ kind: 'flash', col: '#d0a0ff', t: 0, dur: 0.35 }); sfx('spell_impact', 1); break;
    case 'starfall': burst(e.x, e.y, e.z + 0.2, '#b8a0ff', 16, 2.2); ring(e.x, e.y, e.z, 0.1, e.r || 1, 0.4, '#c8a8ff', 3); break;
    case 'arrowrain': burst(e.x, e.y, e.z + 0.2, '#e8e0c0', 4, 1.2); break;
    case 'crow': for (let i = 0; i < 4; i++) spawn({ x: e.x, y: e.y, z: e.z + 0.8, vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(0, 2), life: 0.6, size: 2, size1: 1, color: '#9ac84a', add: true }); break;
    case 'note': burst(e.x, e.y, e.z + 0.8, '#ff8ab0', 6, 1.2); break;
    default: burst(e.x, e.y, e.z + 0.8, col, 5, 1.4);
  }
}
function skillFx(e, R) {
  const w = e.where || e.u, u = e.u;
  R.skillName(u, e.id);
  switch (e.id) {
    case 'dawnbreak': ring(w.x, w.y, w.z, 0.2, 2.2, 0.7, '#ffe080', 6); flashes.push({ kind: 'pillar', x: w.x, y: w.y, z: w.z, col: '#ffe9a0', t: 0, dur: 0.8 }); burst(w.x, w.y, w.z + 1, '#fff0b0', 40, 3, { up: 2 }); sfx('firebuff', 1); break;
    case 'whirlwind': sfx('wave_attack', 0.8); break;
    case 'obliterate': ring(w.x, w.y, w.z, 0.2, 1.8, 0.6, '#9ae6ff', 6); burst(w.x, w.y, w.z + 0.6, '#d0f4ff', 50, 3.5); for (let i = 0; i < 14; i++) spawn({ x: w.x, y: w.y, z: w.z + 0.3, vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(3, 7), g: 14, life: 0.9, size: 3, size1: 2, color: '#bff0ff', add: false, kind: 'shard', floor: w.z }); sfx('ice_freeze', 1); R.shake(8); break;
    case 'phalanx': ring(w.x, w.y, w.z, 0.2, 2.6, 0.5, '#fff6c0', 5); burst(u.x, u.y, u.z + 0.3, '#c8b898', 30, 3, { add: false }); sfx('sword_parry', 1); R.shake(6); break;
    case 'wyrmfire': breathFx(u, { x: u.x + Math.cos(w.ang) * 3, y: u.y + Math.sin(w.ang) * 3 }, 3.5, 4); sfx('firespray', 1); R.shake(5); break;
    case 'crescendo': {
      ring(u.x, u.y, u.z, 0.2, 3.2, 1, '#ff8ab0', 5); ring(u.x, u.y, u.z, 0.2, 2.4, 0.8, '#ffe0f0', 2);
      for (let i = 0; i < 26; i++) { const a = rand(TAU); spawn({ x: u.x, y: u.y, z: u.z + 1.5, vx: Math.cos(a) * rand(1, 3), vy: Math.sin(a) * rand(1, 3), vz: rand(0.5, 2), g: 0, life: rand(1, 1.6), size: 12, size1: 9, color: chance(0.5) ? '#ff8ab0' : '#ffe080', add: true, kind: 'note', glyph: chance(0.5) ? '♪' : '♫' }); }
      playJingle(); // the only time the Bard plays music
      break;
    }
    case 'legion': sfx('rock_wall', 0.7); break;
    case 'thundertotem': sfx('spell_impact', 0.8); break;
    case 'jellywall': sfx('waterspray', 0.9); break;
    case 'murder': sfx('wave_attack', 0.9); break;
    case 'eclipse': sfx('wave_attack', 0.9); break;
    case 'volley': sfx('bow_attack', 1); break;
    case 'dive': sfx('sword_attack', 1); break;
    case 'meteor': sfx('rock_meteor_throw', 1); break;
    case 'supernova': sfx('ice_barrage', 0.8); break;
    case 'cannonade': sfx('torch_attack_strike', 1); break;
  }
}

// ------------------------------------------------------------------ drawing (world px, camera transform applied)
const P = (x, y, z) => [isoX(x, y), isoY(x, y, z)];
export function drawShots(ctx, b, t) {
  for (const s of b.shots) {
    if (s.t < 0) continue;
    const col = EL(s.el), k = clamp(s.t / s.dur, 0, 1);
    switch (s.kind) {
      case 'rang': case 'leap': case 'bolt': break;
      case 'arrowrain': case 'meteor': case 'supernova': case 'cannon': {
        const [gx, gy] = P(s.x, s.y, s.z), hgt = (1 - k) * (s.kind === 'meteor' ? 320 : s.kind === 'supernova' ? 240 : 200);
        ctx.globalAlpha = 0.35 + 0.4 * k; ctx.strokeStyle = s.kind === 'supernova' ? '#c87aff' : '#ff6020'; ctx.lineWidth = 2;
        if (s.kind !== 'arrowrain') { ctx.beginPath(); ctx.ellipse(gx, gy, s.splash * 32 * 1.41, s.splash * 16 * 1.41, 0, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1;
        const x = gx + (s.kind === 'arrowrain' ? 0 : (1 - k) * 90), y = gy - hgt;
        if (s.kind === 'arrowrain') { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y); ctx.stroke(); }
        else if (s.kind === 'supernova') { const r = 10 + 30 * k; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('#c87aff'), x - r * 2, y - r * 2, r * 4, r * 4); ctx.drawImage(glow('#ffffff'), x - r, y - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; }
        else {
          const r = s.kind === 'meteor' ? 16 : 7;
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 1; i < 6; i++) ctx.drawImage(glow('#ff6020'), x + i * 9 - r * 1.5, y - i * 18 - r * 1.5, r * 3, r * 3);
          ctx.drawImage(glow('#ffd080'), x - r * 2, y - r * 2, r * 4, r * 4);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = s.kind === 'meteor' ? '#4a2010' : '#222'; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.fill();
        }
        break;
      }
      default: {
        const [x, y] = P(s.x, s.y, s.z), [px, py] = s.px !== undefined ? P(s.px, s.py, s.z) : [x, y];
        const ang = Math.atan2(y - py, x - px);
        drawProjectile(ctx, s.kind, x, y, ang, col, t);
      }
    }
  }
}
function drawProjectile(ctx, kind, x, y, a, col, t) {
  ctx.save(); ctx.translate(x, y);
  switch (kind) {
    case 'arrow': ctx.rotate(a); ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(6, 0); ctx.stroke(); ctx.fillStyle = '#e8e8f0'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -2.5); ctx.lineTo(4, 2.5); ctx.fill(); ctx.fillStyle = '#c04030'; ctx.fillRect(-13, -2, 4, 4); break;
    case 'bullet': ctx.rotate(a); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,220,140,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(3, 0); ctx.stroke(); ctx.drawImage(glow('#ffd080'), -6, -6, 12, 12); break;
    case 'fireball': case 'bomb': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow(kind === 'bomb' ? '#ffa040' : '#ff7020'), -16, -16, 32, 32); ctx.drawImage(glow('#ffe080'), -7, -7, 14, 14);
      if (kind === 'bomb') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); }
      break;
    }
    case 'bonespear': ctx.rotate(a); ctx.fillStyle = '#ece4d0'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-2, -3); ctx.lineTo(-14, -1.2); ctx.lineTo(-14, 1.2); ctx.lineTo(-2, 3); ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('#a070ff'), -18, -8, 36, 16); break;
    case 'crow': { const f = Math.sin(t * 30) * 4; ctx.scale(Math.cos(a) < 0 ? -1 : 1, 1); ctx.fillStyle = '#141014'; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, -1 - f); ctx.lineTo(3, 0); ctx.lineTo(0, 1 + f * 0.3); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.ellipse(1, 0, 4, 2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#9ac84a'; ctx.fillRect(3, -1, 1.5, 1.5); break; }
    case 'note': ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('#ff6a8a'), -12, -12, 24, 24); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#ffe0ec'; ctx.font = 'bold 16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Math.floor(t * 3) % 2 ? '♪' : '♫', 0, 0); break;
    case 'starfall': ctx.globalCompositeOperation = 'lighter'; for (let i = 1; i < 5; i++) ctx.drawImage(glow('#9a80ff'), -8 - i * 3, -8 - i * 9, 16, 16); ctx.drawImage(glow('#ffffff'), -9, -9, 18, 18); star(ctx, 0, 0, 7, t * 6); break;
    default: ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(col), -10, -10, 20, 20);
  }
  ctx.restore();
}
function star(ctx, x, y, r, rot) {
  ctx.fillStyle = '#fffbe0'; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
/** Boomerangs, lightning, leaps' lance trails, zones (totems, jelly walls, whirlwinds, eclipse rangs). */
export function drawOverlays(ctx, b, t) {
  for (const s of b.shots) {
    if (s.t < 0) continue;
    if (s.kind === 'rang') {
      const [x, y] = P(s.x, s.y, s.u.z + 1);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 22);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('#7af0d0'), -14, -14, 28, 28); ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#e0fff4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 7, 0.3, 2.6); ctx.stroke(); ctx.restore();
    } else if (s.kind === 'bolt') {
      const from = s.from || s.u, [x0, y0] = P(from.x, from.y, (from.z || 0) + 1.3), [x1, y1] = P(s.m.x, s.m.y, s.m.z + 0.9);
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,240,140,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let i = 1; i < 7; i++) { const f = i / 7; ctx.lineTo(x0 + (x1 - x0) * f + rand(-6, 6), y0 + (y1 - y0) * f + rand(-6, 6)); }
      ctx.lineTo(x1, y1); ctx.stroke(); ctx.drawImage(glow('#ffe86a'), x1 - 12, y1 - 12, 24, 24); ctx.globalCompositeOperation = 'source-over';
    }
  }
  for (const z of b.zones) {
    const [x, y] = P(z.x, z.y, z.z), fade = Math.min(1, z.t * 2);
    ctx.globalAlpha = fade;
    switch (z.kind) {
      case 'totem':
        ctx.strokeStyle = 'rgba(255,232,106,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, z.r * 45, z.r * 22.6, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 5, y - 46, 10, 46); ctx.fillStyle = '#5ac8a0'; ctx.fillRect(x - 8, y - 50, 16, 10); ctx.fillStyle = '#ffe86a'; ctx.fillRect(x - 3, y - 47, 6, 4);
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('#ffe86a'), x - 20, y - 68, 40, 40); ctx.globalCompositeOperation = 'source-over';
        if (chance(0.3)) { const a = rand(TAU), r = rand(0.5, z.r); spawn({ x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, z: z.z + 0.2, vz: 3, life: 0.2, size: 3, size1: 1, color: '#fff6a0', add: true }); }
        break;
      case 'jelly': {
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('#4ab8ff'), x - 50, y - 36, 100, 56); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(60,150,255,0.55)'; ctx.beginPath(); ctx.ellipse(x, y - 10 + Math.sin(t * 6) * 2, 34, 22, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(200,240,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - 10, y - 20, 9, 5, -0.4, 0, TAU); ctx.fill();
        break;
      }
      case 'whirl': {
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,170,110,0.8)'; ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) { const a = t * 14 + i * 2.1; ctx.beginPath(); ctx.ellipse(x, y - 14, z.r * 40, z.r * 20, 0, a, a + 1.4); ctx.stroke(); }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'eclipse': {
        const [rx, ry] = P(z.x + Math.cos(z.ang) * z.r, z.y + Math.sin(z.ang) * z.r, z.z + 1);
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(t * 18);
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('#9af0ff'), -30, -30, 60, 60); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#eafcff'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.arc(5, -3, 12, 0, TAU, true); ctx.fill('evenodd'); ctx.restore();
        break;
      }
      case 'crows':
        for (let i = 0; i < 10; i++) { const a = t * 3 + i * 0.63, r = z.r * (0.4 + 0.5 * ((i * 37) % 10) / 10); const [cx, cy] = P(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, z.z + 1.8 + Math.sin(t * 5 + i)); drawProjectile(ctx, 'crow', cx, cy, a + 1.57, '#000', t + i); }
        break;
    }
    ctx.globalAlpha = 1;
  }
  // melee slashes, thrusts and sky pillars
  for (const f of flashes) {
    const k = f.t / f.dur;
    if (f.kind === 'flash') continue;
    if (f.kind === 'pillar') {
      const [x, y] = P(f.x, f.y, f.z);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k;
      const g = ctx.createLinearGradient(0, y - 300, 0, y); g.addColorStop(0, rgba(f.col, 0)); g.addColorStop(1, rgba(f.col, 0.9));
      ctx.fillStyle = g; ctx.fillRect(x - 22 * (1 - k * 0.5), y - 300, 44 * (1 - k * 0.5), 300);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    const [x0, y0] = P(f.x, f.y, f.z + 1), [x1, y1] = P(f.tx, f.ty, f.tz + 0.9), a = Math.atan2(y1 - y0, x1 - x0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k;
    if (f.kind === 'thrust') {
      ctx.strokeStyle = f.col; ctx.lineWidth = 4 * (1 - k) + 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * (0.6 + k * 0.6), y0 + (y1 - y0) * (0.6 + k * 0.6)); ctx.stroke();
    } else {
      ctx.translate(x1, y1); ctx.rotate(a + (f.flip ? Math.PI : 0)); ctx.scale(1, 0.55);
      const r = f.big ? 30 : 22, s0 = -1.6 + k * 0.6, s1 = s0 + 2.4;
      ctx.strokeStyle = f.col; ctx.lineWidth = (f.big ? 7 : 5) * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r, s0, s1); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r, s0 + 0.3, s1 - 0.3); ctx.stroke();
    }
    ctx.restore();
  }
  // rings on the ground
  for (const r of rings) {
    const k = r.t / r.dur, rr = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)), [x, y] = P(r.x, r.y, r.z);
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.col; ctx.lineWidth = r.w * (1 - k) + 0.5;
    ctx.beginPath(); ctx.ellipse(x, y, rr * 45, rr * 22.6, 0, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
export function drawParticles(ctx) {
  for (const p of parts) {
    if (!p.life) continue;
    const k = p.t / p.life, s = p.size + (p.size1 - p.size) * k, [x, y] = P(p.x, p.y, p.z), a = 1 - k * k;
    if (p.kind === 'note') { ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.font = `bold ${s | 0}px serif`; ctx.textAlign = 'center'; ctx.fillText(p.glyph || '♪', x, y); continue; }
    if (p.kind === 'crow') { ctx.globalAlpha = a; drawProjectile(ctx, 'crow', x, y, Math.atan2(p.vy, p.vx), '#000', p.t * 3); continue; }
    if (p.add) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(glow(p.color), x - s * 2, y - s * 2, s * 4, s * 4); ctx.globalCompositeOperation = 'source-over'; }
    else { ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(x - s / 2, y - s / 2, s, s); }
  }
  ctx.globalAlpha = 1;
}
export function drawTexts(ctx) {
  ctx.textAlign = 'center';
  for (const f of texts) {
    const [x, y] = P(f.x, f.y, f.z + f.t * 1.3);
    ctx.globalAlpha = Math.min(1, (1 - f.t) * 2.5);
    ctx.font = `bold ${f.size}px "Alegreya Sans", sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(f.text, x, y); ctx.fillStyle = f.col; ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
}
export function clearFx() { parts.length = 0; texts.length = 0; rings.length = 0; flashes.length = 0; }
export { shade };
