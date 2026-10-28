// Drops on the ground: gold, health/mana orbs, potions, gear and gems.
import { G } from '../state.js';
import { rand, chance, randi, TAU, pick, clamp, measureCtx } from '../core/util.js';
import { isoX, isoY, camera } from '../core/view.js';
import { sfx } from '../core/audio.js';
import { spawn, glowSprite, sparkle, floatText, addLight, elem } from '../gfx/vfx.js';
import { replacementIcon } from '../core/replacementart.js';
import { pixelSprite, gemIcon, goldIcon, ringIcon } from '../gfx/pixelart.js';
import { rollItem, rollGem, itemName, itemColor, goldPile, goldScale, MATERIALS, GEMS, potionItem, RARITY_COLORS, SEAL_RARITY, SEALED_COLOR, SEAL_GAP } from '../data/items.js';
import { potionIcon } from '../core/assets.js';
import { artIcon } from '../core/classart.js';
import { gearIcon } from '../core/gearart.js';
import { AUGMENTS } from '../data/rings.js';
import { depthLevel } from '../data/depth.js';
import { filterPasses } from './lootfilter.js';
import { rollSigil, SIGILS } from '../data/items.js';
import { maybeRelic } from '../data/relics.js';
import { heresyAllows } from './heresies.js';
import { keyChance } from './unbound.js';

const sigilCache = new Map();
/** A Sigil Stone's icon: a dark rune slab with its sigil's mark in the stone's colour, more ornate by rank. */
export function sigilIcon(rank, size = 48) {
  const key = rank + '|' + size;
  let c = sigilCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), S = SIGILS[rank] || SIGILS[0], s = size;
  x.translate(s / 2, s / 2);
  const w = s * 0.56, h = s * 0.72, r = s * 0.12;
  const g = x.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#5a5048'); g.addColorStop(1, '#1c1814');
  x.fillStyle = g; x.strokeStyle = '#0a0806'; x.lineWidth = Math.max(2, s / 20);
  x.beginPath(); x.moveTo(-w / 2 + r, -h / 2); x.arcTo(w / 2, -h / 2, w / 2, h / 2, r); x.arcTo(w / 2, h / 2, -w / 2, h / 2, r); x.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r); x.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r); x.closePath();
  x.fill(); x.stroke();
  // the mark: strokes seeded by the rank, so each stone has its own glyph
  x.shadowColor = S.color; x.shadowBlur = s * (0.12 + rank * 0.008);
  x.strokeStyle = S.color; x.lineWidth = Math.max(2, s / 16); x.lineCap = 'round';
  let q = rank * 7919 + 13;
  const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
  x.beginPath(); x.moveTo(0, -h * 0.32); x.lineTo(0, h * 0.32);
  for (let i = 0; i < 2 + (rank % 3); i++) { const y0 = (rnd() - 0.5) * h * 0.55, dx = (rnd() < 0.5 ? -1 : 1) * w * 0.3; x.moveTo(0, y0); x.lineTo(dx, y0 + (rnd() - 0.5) * h * 0.3); }
  x.stroke();
  if (rank >= 10) { x.shadowBlur = 0; x.strokeStyle = 'rgba(255,230,160,.55)'; x.lineWidth = 1; x.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6); }
  sigilCache.set(key, c);
  return c;
}

export class GroundItem {
  constructor(x, y, kind, data = {}) {
    this.x = x; this.y = y; this.z = 0;
    this.kind = kind; // gold | orb_hp | orb_mp | item | potion
    Object.assign(this, data);
    // an Epic or better hits the floor sealed, once (dropFromBag marks items that were already opened), when the seal
    // clock allows one (SEAL_GAP); otherwise it arrives open
    if (kind === 'item' && this.item.type === 'gear' && this.item.rarity >= SEAL_RARITY && this.item.sealed === undefined) {
      const c = G.char, ready = !c || (c.sealT ?? SEAL_GAP) >= SEAL_GAP;
      this.item.sealed = ready;
      if (ready && c) c.sealT = 0;
    }
    const a = rand(TAU), s = rand(0.5, 1.6);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s; this.vz = rand(90, 150);
    this.t = 0;
    this.r = 0.35;
  }
  get label() {
    if (this.kind === 'gold') return `${this.amount} Gold`;
    if (this.kind === 'item') return itemName(this.item);
    if (this.kind === 'potion') return this.item.name;
    if (this.kind === 'key') return 'Abyssal Key';
    return null;
  }
  get color() {
    if (this.kind === 'gold') return '#ffd34a';
    if (this.kind === 'key') return KEY_COLOR;
    if (this.kind === 'item' || this.kind === 'potion') return itemColor(this.item);
    return '#fff';
  }
  update(dt, world) {
    this.t += dt;
    if (this.z > 0 || this.vz > 0) {
      this.vz -= 420 * dt; this.z += this.vz * dt;
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      if (world.map.walkable(nx, ny)) { this.x = nx; this.y = ny; }
      if (this.z <= 0) { this.z = 0; this.vz = this.vz < -60 ? -this.vz * 0.3 : 0; if (this.kind === 'item' && this.item.rarity >= SEAL_RARITY) sfx('pickup'); }
    }
    const p = world.player;
    if (!p || p.dead) return true;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    const magnet = this.kind === 'gold' ? 2.2 : this.kind.startsWith('orb') || this.kind === 'key' ? 3.2 : 0;
    if (magnet && d < magnet && this.t > 0.4) {
      const k = Math.min(1, dt * 9);
      this.x += (p.x - this.x) * k; this.y += (p.y - this.y) * k;
    }
    const auto = this.kind !== 'item' || ((G.touch || G.settings.autoLoot) && filterPasses(this.item)); // the loot filter (game/lootfilter.js)
    if (this.t > 0.35 && (d < 0.55 || (p.lootTarget === this && d < 1.2)) && (auto || p.lootTarget === this)) {
      if (p.pickup(this)) {
        if (p.lootTarget === this) p.lootTarget = null;
        return false;
      }
    }
    if (this.t > 120 && this.kind !== 'item' && this.kind !== 'key') return false; // (an Abyssal Key waits)
    // light pillars for good loot
    if (this.kind === 'item' && this.item.rarity >= 2) {
      const r = this.item.sealed ? SEAL_RARITY : this.item.rarity;
      addLight(this.x, this.y, 1.6 + r * 0.5, 0.6);
      if (chance(dt * (r * 4))) sparkle(this.x, this.y, rand(4, 30), itemColor(this.item), 1, 0.2);
    }
    if (this.kind.startsWith('orb')) addLight(this.x, this.y, 1.8, 0.7);
    if (this.kind === 'key') { addLight(this.x, this.y, 2.6, 0.8, 30, KEY_COLOR); if (chance(dt * 10)) sparkle(this.x, this.y, rand(6, 34), KEY_COLOR, 1, 0.25); }
    return true;
  }
  icon() {
    if (this.kind === 'item') return itemIcon(this.item);
    if (this.kind === 'key') return keyIcon(48);
    if (this.kind === 'potion') return this._ic || (this._ic = potionIcon(this.item.color, 48)); // (kept per drop: it built a canvas a frame)
    if (this.kind === 'gold') return goldIcon(48, this.amount);
    return null;
  }
  draw(ctx) {
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y) - this.z;
    if (this.kind === 'orb_hp' || this.kind === 'orb_mp') {
      const c = this.kind === 'orb_hp' ? '#ff2a2a' : '#3a6aff';
      const b = 8 + Math.sin(this.t * 6) * 1.5;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowSprite(c), px - b * 2.2, py - 10 - b * 2.2, b * 4.4, b * 4.4);
      ctx.globalCompositeOperation = 'source-over';
      const orb = replacementIcon(this.kind, 20);
      if (orb) { ctx.drawImage(orb, px - 10, py - 20 - Math.sin(this.t * 4) * 2); return; }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py - 10 - Math.sin(this.t * 4) * 2, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 2, py - 13 - Math.sin(this.t * 4) * 2, 2, 2);
      return;
    }
    const img = this.icon();
    if (!img) return;
    if (this.kind === 'key') { // a cyan column of light reaching for the sky, like a top-rarity drop
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7;
      const g = ctx.createLinearGradient(px, py - 110, px, py);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, KEY_COLOR);
      ctx.fillStyle = g; ctx.fillRect(px - 9, py - 110, 18, 110);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const art = this.kind === 'item' && !this.item.sealed && ((this.item.art && artIcon(this.item)) || gearIcon(this.item));
    const s = this.kind === 'gold' ? 20 : art ? 30 : this.kind === 'key' ? 26 : 22;
    if (this.kind === 'item' && this.item.rarity >= 2) {
      const col = itemColor(this.item), r = this.item.sealed ? SEAL_RARITY : this.item.rarity;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + r * 0.08;
      const g = ctx.createLinearGradient(px, py - 90, px, py);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
      ctx.fillStyle = g; ctx.fillRect(px - 3 - r, py - 90, 6 + r * 2, 90);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(px, py + 1, 9, 4, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(px, py - s * 0.45);
    if (this.kind === 'item' && this.item.type === 'gear' && !art && !this.item.sealed) ctx.rotate(-0.6); // catalog and gear art are drawn upright / diagonal already
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

const iconCache = new Map();
export const KEY_COLOR = '#20e0ff';
/** An Abyssal Key (docs/ENDGAME.md): a skeleton key of black iron with a cyan void-stone in its bow. */
export function keyIcon(size = 48) {
  const key = 'key|' + size;
  let c = iconCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), s = size / 48;
  const g = x.createRadialGradient(24 * s, 24 * s, 2, 24 * s, 24 * s, 26 * s);
  g.addColorStop(0, 'rgba(32,224,255,0.5)'); g.addColorStop(1, 'rgba(32,224,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.save(); x.translate(24 * s, 24 * s); x.rotate(-0.7);
  x.strokeStyle = '#1a1c24'; x.lineWidth = 5 * s; x.lineCap = 'round';
  x.beginPath(); x.moveTo(-6 * s, 0); x.lineTo(17 * s, 0); x.stroke(); // the shaft
  x.beginPath(); x.moveTo(12 * s, 0); x.lineTo(12 * s, 6 * s); x.moveTo(17 * s, 0); x.lineTo(17 * s, 7 * s); x.stroke(); // the bit
  x.strokeStyle = '#3a3e4c'; x.lineWidth = 2 * s;
  x.beginPath(); x.moveTo(-6 * s, -1 * s); x.lineTo(17 * s, -1 * s); x.stroke();
  x.fillStyle = '#1a1c24'; x.beginPath(); x.arc(-12 * s, 0, 8 * s, 0, TAU); x.fill(); // the bow
  x.fillStyle = '#0a0c12'; x.beginPath(); x.arc(-12 * s, 0, 4.5 * s, 0, TAU); x.fill();
  x.fillStyle = KEY_COLOR; x.beginPath(); x.arc(-12 * s, 0, 3 * s, 0, TAU); x.fill(); // the void-stone
  x.fillStyle = '#ffffff'; x.fillRect(-13.5 * s, -1.5 * s, 1.5 * s, 1.5 * s);
  x.restore();
  iconCache.set(key, c);
  return c;
}
/** A sealed treasure: a little iron-bound casket with a wax seal (the same for every sealed item, by design). */
function sealedIcon(size) {
  const key = 'sealed|' + size;
  let c = iconCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), s = size / 48;
  const g = x.createRadialGradient(24 * s, 24 * s, 2, 24 * s, 24 * s, 26 * s);
  g.addColorStop(0, 'rgba(255,223,138,0.55)'); g.addColorStop(1, 'rgba(255,223,138,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.fillStyle = '#5a3418'; x.fillRect(9 * s, 20 * s, 30 * s, 18 * s); // box
  x.fillStyle = '#7a4a22'; x.beginPath(); x.moveTo(9 * s, 20 * s); x.quadraticCurveTo(24 * s, 6 * s, 39 * s, 20 * s); x.fill(); // lid
  x.fillStyle = '#c8a050';
  for (const bx of [12, 33]) x.fillRect(bx * s, 12 * s, 3 * s, 26 * s); // gilded bands
  x.fillRect(9 * s, 19 * s, 30 * s, 2.5 * s);
  x.strokeStyle = '#2a1608'; x.lineWidth = 1.5 * s; x.strokeRect(9 * s, 20 * s, 30 * s, 18 * s);
  x.fillStyle = '#b0182a'; x.beginPath(); x.arc(24 * s, 27 * s, 5.5 * s, 0, TAU); x.fill(); // the wax seal
  x.fillStyle = '#e04050'; x.beginPath(); x.arc(23 * s, 26 * s, 2.2 * s, 0, TAU); x.fill();
  x.fillStyle = SEALED_COLOR; x.font = `bold ${9 * s}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 24 * s, 27.5 * s);
  iconCache.set(key, c);
  return c;
}
/** Inventory icon canvas for any item. */
export function itemIcon(item, size = 48) {
  if (item.sealed) return sealedIcon(size);
  if (item.type === 'gem' && GEMS[item.gem].sigil) return sigilIcon(item.tier, size);
  if (item.type === 'gem') return gemIcon(item.gem, GEMS[item.gem].color, item.tier, size);
  if (item.type === 'potion') return potionIcon(item.color, size);
  if (item.slot === 'ring') return ringIcon(MATERIALS[item.tier].color, elem((AUGMENTS[(item.aug && item.aug[0] || {}).id] || {}).el || 'arcane').glow, item.rarity, size);
  if (item.art) { const a = artIcon(item, size); if (a) return a; }
  { const g = gearIcon(item, size); if (g) return g; }
  const key = `${item.icon}|${item.tier}|${item.rarity}|${item.base}|${size}`;
  let c = iconCache.get(key);
  if (c) return c;
  const mat = MATERIALS[item.tier].color;
  const pal = { m: mat, w: '#ffffff', b: item.icon === 'shield' ? '#5a2a1a' : '#5a3a20', g: item.rarity >= 3 ? '#ffd040' : '#b08a3a', c: item.rarity >= 2 ? RARITY_COLORS[item.rarity] : '#8a6a40', e: '#ff4040', k: '#101010' };
  if (item.icon === 'orb') { pal.c = mat; pal.e = '#c060ff'; }
  if (item.icon === 'staff' || item.icon === 'wand') { pal.c = ['#a0a0a0', '#60ff60', '#60a0ff', '#c060ff', '#ffa020', '#ff4058', '#20e0ff'][item.rarity]; pal.b = '#6a4a2a'; pal.e = '#ffffff'; }
  c = replacementIcon('item_' + item.icon, size, mat) || (item.icon ? pixelSprite(item.icon, pal, 4) : null);
  iconCache.set(key, c);
  return c;
}

// ------------------------------------------------------------------ drops
export function dropLoot(world, m) {
  const p = G.player;
  if (!p) return;
  const st = p.st;
  const lvl = m.level;
  const rank = m.rank || 'normal';
  const R = { normal: 1, champion: 3, unique: 5, boss: 10 }[rank];
  const add = (kind, data) => world.addLoot(new GroundItem(m.x + rand(-0.2, 0.2), m.y + rand(-0.2, 0.2), kind, data));
  // gold
  if (chance(rank === 'normal' ? 0.45 : 1)) {
    const n = rank === 'boss' ? 5 : 1;
    for (let i = 0; i < n; i++) add('gold', { amount: Math.max(1, Math.round(goldPile(lvl) * rand(0.6, 1.4) * Math.sqrt(R) * (1 + st.goldFind / 100) * (world.goldMul || 1))) });
  }
  if (st.legendary.greed && chance(0.15)) for (let i = 0; i < 4; i++) add('gold', { amount: Math.round((2 + lvl) * goldScale(lvl) * (1 + st.goldFind / 100)) });
  // orbs (none under the Hunger of the Abyss Heresy)
  if (heresyAllows('orb', p.char, world)) {
    if (chance(0.14 * Math.sqrt(R))) add('orb_hp', {});
    if (chance(0.1 * Math.sqrt(R))) add('orb_mp', {});
  }
  // potions
  if (chance(0.035 * R)) add('potion', { item: potionItem(pick(['hp', 'hp', 'mp', 'mp', 'rejuv', 'fury'])) });
  // gear
  const items = rank === 'boss' ? randi(4, 6) + (world.depth % 10 === 0 ? 2 : 0) : rank === 'unique' ? randi(2, 3) : rank === 'champion' ? (chance(0.6) ? randi(1, 2) : 0) : (chance(0.085 * (world.lootMul || 1)) ? 1 : 0); // lootMul: omens (game/happenings.js)
  const bonus = rank === 'boss' ? 1.2 : rank === 'unique' ? 0.6 : rank === 'champion' ? 0.3 : 0;
  const boost = (world.raid || m.isRaid || m.isVelscour ? 3 : 1) * (world.relicMul || 1); // BOSS ROOMs triple the Covenant odds (data/relics.js); Heresies raise them
  for (let i = 0; i < items; i++) {
    const ilvl = lvl + (rank === 'boss' ? 2 : rank === 'normal' ? 0 : 1) + randi(-1, 1);
    add('item', { item: maybeRelic(rollItem(ilvl, { mf: st.magicFind + (world.mfAdd || 0), bonus }), boost) });
  }
  // Sigil Stones: rare from the rank and file, common from guardians (Heresies: world.sigilMul)
  const sig = { normal: 0.004, champion: 0.03, unique: 0.08, boss: 0.45 }[rank] * (world.lootMul || 1) * (world.sigilMul || 1);
  if (world.depth && chance(sig)) add('item', { item: rollSigil(world.depth, rank === 'boss' ? 1 : 0) });
  // an Abyssal Key (docs/ENDGAME.md): BOSS ROOM bosses past depth 600 under Heresy rank 10, rift guardians from tier 10
  if (m.isRaid && chance(keyChance(world, m))) add('key', {}); // (keyChance rolls once a boss: a raid boss pays out three dropLoots)
  // rings: a guardian usually drops one
  if ((rank === 'boss' && chance(0.6)) || (rank === 'unique' && chance(0.2))) add('item', { item: rollItem(lvl + 2, { slot: 'ring', mf: st.magicFind + (world.mfAdd || 0), bonus }) });
  // gems
  const gems = rank === 'boss' ? randi(1, 3) : chance(rank === 'normal' ? 0.025 : 0.25) ? 1 : 0;
  for (let i = 0; i < gems; i++) add('item', { item: rollGem(lvl + (rank === 'boss' ? 6 : 0)) });
}

export function dropChest(world, chest, depth) {
  const st = G.player ? G.player.st : { magicFind: 0, goldFind: 0 };
  const n = chest.rare ? randi(3, 5) : randi(1, 3);
  const add = (kind, data) => world.addLoot(new GroundItem(chest.x, chest.y + 0.3, kind, data));
  for (let i = 0; i < n; i++) add('item', { item: maybeRelic(rollItem(depthLevel(depth) + 1, { mf: st.magicFind + (world.mfAdd || 0), bonus: chest.rare ? 0.8 : 0.25 })) });
  if (chance(chest.rare ? 0.25 : 0.06)) add('item', { item: rollSigil(depth) });
  for (let i = 0; i < randi(2, 4); i++) add('gold', { amount: Math.round((10 + depthLevel(depth) * 4) * goldScale(depthLevel(depth)) * rand(0.6, 1.4) * (1 + st.goldFind / 100)) });
  if (chance(chest.rare ? 0.8 : 0.3)) add('item', { item: rollGem(depthLevel(depth) + 4) });
  if (chance(0.5)) add('potion', { item: potionItem(pick(['hp', 'mp', 'rejuv'])) });
}

/** Draw D2-style ground labels for nearby items (screen space). Returns hit boxes. */
// Loot label text baked once per text/colour/font (measureText + fillText every frame for every label on the ground
// added up on phones); the box behind it still draws live (it lights up under the mouse).
const labelCache = new Map();
function labelSprite(text, color, font) {
  const key = font + '|' + color + '|' + text;
  let e = labelCache.get(key);
  if (e) return e;
  const tw = measureCtx(font).measureText(text).width, fs = parseFloat(font), pad = 2;
  const c = document.createElement('canvas'); c.width = Math.ceil(tw) + pad * 2; c.height = Math.ceil(fs * 1.6) + pad * 2;
  const g = c.getContext('2d'); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
  g.fillText(text, c.width / 2, c.height / 2);
  e = { c, tw };
  // the fallback face draws until the web font loads: don't keep that one
  if (!document.fonts || document.fonts.check(font)) { labelCache.set(key, e); if (labelCache.size > 256) labelCache.delete(labelCache.keys().next().value); }
  return e;
}

export function drawLootLabels(ctx, world, mouse) {
  const boxes = [];
  const p = world.player;
  const font = `${Math.round(12 * G.dpr)}px "Alegreya Sans", sans-serif`;
  const placed = [];
  let shown = false;
  for (const l of world.loot) {
    if (l.kind !== 'item' && l.kind !== 'potion' && l.kind !== 'key' && !(l.kind === 'gold' && l.amount > 0)) continue;
    if (p && Math.hypot(p.x - l.x, p.y - l.y) > 14) continue;
    if (l.kind === 'gold' && !G.settings.showGoldLabels) continue;
    if (G.settings.hideItemNames) {
      // no labels: an unseen hit box on the item itself still picks it up, and the name shows only under the mouse
      const [gx, gy] = camera.tileToScreen(l.x, l.y, 6), z = camera.zoom || 1;
      const box = { x: gx, y: gy, w: 30 * z, h: 24 * z, loot: l };
      boxes.push(box);
      if (shown || !mouse || Math.abs(mouse.x - gx) >= box.w / 2 || Math.abs(mouse.y - gy) >= box.h / 2) continue;
      shown = true;
    }
    const [sx, sy0] = camera.tileToScreen(l.x, l.y, 26);
    let sy = sy0;
    const text = l.label, spr = labelSprite(text, l.color, font);
    const w = spr.tw / G.dpr + 10, h = 16;
    // avoid overlapping labels
    for (let k = 0; k < 8; k++) {
      if (!placed.some((b) => Math.abs(b.x - sx) < (b.w + w) / 2 && Math.abs(b.y - sy) < h)) break;
      sy -= h + 1;
    }
    const box = { x: sx, y: sy, w, h, loot: l };
    placed.push(box);
    const hover = G.settings.hideItemNames || (mouse && Math.abs(mouse.x - sx) < w / 2 && Math.abs(mouse.y - sy) < h / 2);
    ctx.fillStyle = hover ? 'rgba(40,30,80,0.9)' : 'rgba(0,0,0,0.72)';
    ctx.fillRect((sx - w / 2) * G.dpr, (sy - h / 2) * G.dpr, w * G.dpr, h * G.dpr);
    ctx.drawImage(spr.c, Math.round(sx * G.dpr - spr.c.width / 2), Math.round((sy + 1) * G.dpr - spr.c.height / 2));
    boxes.push(box);
  }
  return boxes;
}

export { clamp, floatText, spawn };
