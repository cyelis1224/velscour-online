// The Slime Lord's court: animated Glymmora slimes (assets/sprites/slimes, packed by tools/slimecourt.py).
// Each set is one atlas: a row per animation (idle walk run jump attack open ability special from the detailed sheets'
// isometric panels; idle walk squish jump attack hurt die from the cards), a column per frame, the feet at (ax, ay).
// game/slimecourt.js moves them and says which animation plays; this draws them: hop height, squash and stretch,
// a jelly shadow, blink fades, riding on a bigger slime, and little emotes over their heads.
import { G } from '../state.js';
import { isoX, isoY } from '../core/view.js';
import { TAU, makeCanvas, drawFiltered } from '../core/util.js';

export let SLIME_SETS = {};
export const SLIME_READY = fetch('assets/sprites/slimes/slimes.json').then((r) => r.json()).then((c) => { SLIME_SETS = c; return c; }).catch(() => ({}));
const imgs = {};
export function slimeImage(id) {
  let img = imgs[id];
  if (!img) { img = imgs[id] = new Image(); img.src = `assets/sprites/slimes/${id}.webp`; }
  return img.complete && img.naturalWidth ? img : null;
}
/** The sets that play a kind of slime (data: SLIME_SETS[id].kind). */
export function setsOf(kind) { return Object.keys(SLIME_SETS).filter((id) => SLIME_SETS[id].kind === kind); }

// what to show when a set lacks an animation
const FALLBACK = { run: ['walk'], walk: ['run', 'idle'], jump: ['squish', 'walk'], ability: ['attack', 'open'], special: ['ability', 'attack'],
  open: ['squish', 'idle'], squish: ['open', 'idle'], hurt: ['squish', 'open', 'idle'], die: ['squish', 'hurt', 'idle'], attack: ['ability', 'idle'], idle: ['walk'] };
const FPS = { idle: 5, walk: 8, run: 11, jump: 7, attack: 11, open: 6, ability: 8, special: 9, squish: 8, hurt: 9, die: 7 };
const ONCE = new Set(['attack', 'ability', 'special', 'hurt', 'die', 'open']);

function rowOf(meta, anim) {
  // a detailed sheet's special attack fills its whole cell with spell effects: play its special ability instead
  if (anim === 'special' && meta.src === 'detail') anim = 'ability';
  let r = meta.rows.indexOf(anim);
  if (r < 0) for (const f of FALLBACK[anim] || []) if ((r = meta.rows.indexOf(f)) >= 0) break;
  return r < 0 ? 0 : r;
}

const tints = new WeakMap();
function tinted(img, f) {
  if (!f) return img;
  let m = tints.get(img);
  if (!m) tints.set(img, (m = {}));
  if (!m[f]) { const c = makeCanvas(img.width, img.height); drawFiltered(c.getContext('2d'), f, img, 0, 0); m[f] = c; }   // (by hand where canvas filters don't work)
  return m[f];
}

const EMOTE = { heart: '♥', note: '♪', zz: 'z', bang: '!', ask: '?', star: '✦', drop: '💧', anger: '#' };
function drawEmote(ctx, e, x, y) {
  const k = Math.min(1, e.t / 0.2) * Math.min(1, (e.dur - e.t) / 0.3), bob = Math.sin(e.t * 6) * 1.5;
  if (k <= 0) return;
  ctx.globalAlpha = k;
  if (e.k === 'zz') {
    ctx.font = 'bold 7px Georgia, serif'; ctx.fillStyle = '#d8e8ff'; ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) { const t = (e.t * 0.8 + i / 3) % 1; ctx.globalAlpha = k * (1 - t); ctx.fillText('z', x + 3 + t * 8, y - t * 12); }
  } else {
    const col = { heart: '#ff6aa8', note: '#ffe070', bang: '#ffffff', ask: '#ffffff', star: '#fff2a0', anger: '#ff5040', drop: '#9ad8ff' }[e.k] || '#fff';
    ctx.font = `bold ${e.k === 'heart' || e.k === 'note' ? 10 : 9}px Georgia, serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(10,10,30,0.8)';
    const s = EMOTE[e.k] || '!';
    ctx.strokeText(s, x, y + bob); ctx.fillStyle = col; ctx.fillText(s, x, y + bob);
  }
  ctx.globalAlpha = 1;
}

/** Draw a court slime. Returns false while its art is still loading (the caller draws the old pixel slime). */
export function drawSlime(ctx, m) {
  const S = m.slime, meta = SLIME_SETS[S.set], img = meta && slimeImage(S.set);
  if (!img) return false;
  const px = isoX(m.x, m.y), py = isoY(m.x, m.y);
  // animation and frame
  const r = rowOf(meta, S.anim), n = meta.n[r] || 1;
  let f = Math.floor(S.animT * (FPS[S.anim] || 8) * (S.fps || 1));
  f = ONCE.has(S.anim) ? Math.min(n - 1, f) : f % n;
  // size: the body (idle) is S.h world px tall
  const k = (S.h * m.scale) / meta.bh;
  let sx = 1 + S.sqx, sy = 1 + S.sqy;
  const born = Math.min(1, m.spawnT / 0.45); // rises out of its own puddle
  if (born < 1) { sy *= 0.15 + 0.85 * born + Math.sin(born * Math.PI) * 0.25; sx *= 1.4 - 0.4 * born; }
  const dw = meta.cw * k * sx, dh = meta.ch * k * sy;
  const z = m.z + S.z + (S.ride ? S.ride.slime ? S.ride.slime.h * S.ride.scale * 0.8 + S.ride.slime.z : 0 : 0);
  const alpha = (m.alpha ?? 1) * S.alpha;
  // jelly shadow: a dark pool tinted with the slime's colour, smaller while it is up in the air
  const sh = Math.max(0.35, 1 - z / 90), bw = S.h * m.scale * 0.62 * sh * Math.max(1, sx * 0.9);
  if (alpha > 0.05 && !S.ride) {
    ctx.globalAlpha = 0.4 * alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.beginPath(); ctx.ellipse(px, py, bw, bw * 0.42, 0, 0, TAU); ctx.fill();
    if (z < 4) {
      ctx.globalAlpha = 0.22 * alpha; ctx.fillStyle = S.K.color;
      ctx.beginPath(); ctx.ellipse(px, py, bw * 0.8, bw * 0.3, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (alpha <= 0.02) { m.screenTop = py - S.h - z; return true; }
  const face = meta.face || 'R', flipX = face === 'S' ? false : face === 'R' ? m.flip : !m.flip;
  const ax = meta.ax * k * sx, ay = meta.ay * k * sy;
  const lx = m.lunge > 0 ? (Math.cos(m.facing) - Math.sin(m.facing)) * m.lunge * 6 : 0;
  const ly = m.lunge > 0 ? (Math.cos(m.facing) + Math.sin(m.facing)) * m.lunge * 3 : 0;
  const ox = px + lx, oy = py - z + ly;
  const cw = meta.cw, ch = meta.ch, srcX = f * cw, srcY = r * ch;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ox, oy);
  if (S.tilt) ctx.rotate(S.tilt);
  if (flipX) ctx.scale(-1, 1);
  const dx = -ax, dy = -ay;
  m.drawRim(ctx, img, srcX, srcY, cw, ch, dx, dy, dw, dh);
  ctx.drawImage(tinted(img, m.tintFilter()), srcX, srcY, cw, ch, dx, dy, dw, dh);
  if (m.flash > 0 || S.glowT > 0) {
    ctx.globalAlpha = Math.max(Math.min(1, m.flash * 8) * 0.6, Math.min(1, S.glowT * 3) * 0.55) * alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img, srcX, srcY, cw, ch, dx, dy, dw, dh);
  }
  ctx.restore();
  const top = py - S.h * m.scale * sy - z;
  if (S.emote && !G.photo) drawEmote(ctx, S.emote, px + 6, top - 6);
  m.screenTop = top;
  m.drawOverhead(ctx, px, top - 4, S.h * m.scale);
  return true;
}

// skill icons: a kind's first detailed set, or three colours of a rainbow pool
const ICON_KINDS = { rainbow: ['pouncer', 'tide', 'idol'], casters: ['tide', 'hexer', 'druid'] };
/** Idle frames for a slime summon's skill icon: [{ img, sx, sy, sw, sh, ax, ay, bh }], or null while loading. */
export function slimeIconParts(def) {
  if (!Object.keys(SLIME_SETS).length) return null;
  const kinds = def.slime ? [def.slime === 'mother' ? 'frost' : def.slime === 'volatile' ? 'pouncer' : def.slime] : ICON_KINDS[def.rainbow ? 'rainbow' : 'casters'];
  const out = [];
  for (const k of kinds) {
    const ids = setsOf(k).sort((a, b) => (SLIME_SETS[a].src === 'detail' ? 0 : 1) - (SLIME_SETS[b].src === 'detail' ? 0 : 1) || a.localeCompare(b));
    const id = ids[0], meta = SLIME_SETS[id], img = id && slimeImage(id);
    if (!img) return null;
    out.push({ img, sx: 0, sy: 0, sw: meta.cw, sh: meta.ch, ax: meta.ax, ay: meta.ay, bh: meta.bh, flip: meta.face === 'L' });
  }
  return out;
}
