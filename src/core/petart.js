// Animated summon atlases (tools/build_pet_animations.py): one row per pet, poses named in catalog.json
// (idle, dead, summoned, cheer/happy, scared, walk, fly, swoop, attack, active, damaged). Slime Lord pets and revived
// monsters keep their own sprites. Every cell shares a floor line; restH is the rest pose's height above it.
import { makeCanvas, drawFiltered } from './util.js';

let CAT = {};
fetch('assets/sprites/pets/catalog.json').then((r) => r.json()).then((c) => { CAT = c; }).catch(() => { CAT = {}; });
const loaded = {};
// Mirror Image is drawn as its caster's class where that class has its own copy.
const CLONES = { ranger: 'clone_ranger', arcane_sorcerer: 'clone_arcane_sorcerer', bard: 'clone_bard' };

function atlas(sheet) {
  if (loaded[sheet]) return loaded[sheet];
  const img = new Image();
  img.onerror = () => { console.warn(`Failed to load pet animation atlas ${sheet}`); };
  img.src = `assets/sprites/pets/${sheet}.webp`;
  return (loaded[sheet] = img);
}

export function petKey(c) {
  const k = c.summonKey;
  if (k === 'clone') return CLONES[c.owner && c.owner.classId] || null;
  return k;
}

const loop = (list, t, fps) => list[Math.floor(t * fps) % list.length];
const at = (list, k) => list[Math.min(list.length - 1, Math.floor(k * list.length))];

/** Which pose a summon shows now; the pose list comes from its kind (see LAYOUTS in the builder). */
function pick(c, m) {
  const S = m.states, k = m.kind;
  if (S.summoned && c.spawnT < 0.6) return at(S.summoned, c.spawnT / 0.6);
  const hurt = c.maxHp > 0 && c.hp / c.maxHp < 0.3;
  if (k === 'stationary') {
    if (c.attackAnimT > 0) return S.attack[0];
    if (hurt || c.flash > 0) return S.damaged[0];
    return Math.sin(c.animT * 2.4) > 0.35 ? S.active[0] : S.idle[0]; // a slow pulse of power
  }
  if (c.attackAnimT > 0) {
    const t = 1 - c.attackAnimT / 0.32;
    if (S.swoop) return t < 0.3 ? S.swoop[0] : at(S.attack, (t - 0.3) / 0.7);
    if (S.attack) return at(S.attack, t);
    if (t < 0.55) return (S.cheer || S.happy)[0]; // humanoids: the raised arm is the wind-up of the blow
  }
  if (c.moving) return S.fly ? loop(S.fly, c.animT, 9) : S.walk ? loop(S.walk, c.animT, 9) : S.idle[0];
  if (c.cheerT > 0 && (S.cheer || S.happy)) return (S.cheer || S.happy)[0];
  if (hurt && S.scared) return S.scared[0];
  return loop(S.idle, c.animT, 6);
}

/** The atlas frame for a summon, or null while its art loads (or when it has none). */
export function petAnimation(c) {
  const key = c.summon && !c.dead && petKey(c), m = key && CAT[key];
  if (!m) return null;
  const img = atlas(m.sheet);
  if (!img.complete || !img.naturalWidth) return null;
  const f = pick(c, m);
  return {
    img, sx: f * m.cellW, sy: m.row * m.cellH, cw: m.cellW, ch: m.cellH, floor: m.floor ?? m.cellH, restH: m.restH,
    k: (c.petH || c.artH || c.spriteH || 48) / (m.restH || m.cellH), walk: m.kind === 'humanoid' && c.moving,
  };
}

/** A fallen summon's dead pose, left on the floor for a moment (world.fallen, drawn with the corpses). */
export function petCorpse(c) {
  const key = petKey(c), m = key && CAT[key];
  if (!m || !m.states || !m.states.dead) return null;
  return { x: c.x, y: c.y, key, flip: c.flip, k: (c.petH || c.artH || c.spriteH || 48) / m.restH * (c.scale || 1), alpha: c.alpha ?? 1, t: 0 };
}

export function drawPetCorpse(ctx, f, x, y) {
  const m = CAT[f.key], img = m && atlas(m.sheet);
  if (!img || !img.complete || !img.naturalWidth) return;
  const w = m.cellW * f.k, h = m.cellH * f.k;
  ctx.save();
  ctx.globalAlpha = f.alpha * Math.min(1, (3 - f.t) / 1);
  ctx.translate(x, y);
  if (f.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, m.states.dead[0] * m.cellW, m.row * m.cellH, m.cellW, m.cellH, -w / 2, -m.floor * f.k, w, h);
  ctx.restore();
}

/** Keep hit tint generation bounded to the shared source atlas. */
export function petTintImage(img, filter) {
  if (!filter) return img;
  img._petTint ||= {};
  if (img._petTint[filter]) return img._petTint[filter];
  const c = makeCanvas(img.width, img.height);
  drawFiltered(c.getContext('2d'), filter, img, 0, 0);   // (by hand where canvas filters don't work)
  img._petTint[filter] = c;
  return c;
}
