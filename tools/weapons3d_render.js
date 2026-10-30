// Bakes a held-gear set (tools/weapons3d.js) for the game: every design held in its class's armor-1 fist, cropped, with
// its palette mask (regions, tools/handheld3d.js REGION), its 48 px icon and icon mask, packed into one atlas, and the
// sockets and effect points relative to the fist. Run by tools/weapons3d_bake.js through tools/weapons3d.html.
import { bakePiece, bakeIcon, findFists, FIST_R, ATTEMPTS } from './handheld3d.js';
import { SETS, designs, heldItem, buildDesign, poseOf } from './weapons3d.js';
import { POSE } from './handheld3d_kits.js';

const LIT = ATTEMPTS[13], fistCache = {};
export async function classFists(cls) { return (fistCache[cls] ||= await findFists(cls)); }
const fistOf = async (set) => { const S = SETS[set], cls = S.cls || 'paladin', f = (await classFists(cls))[1][S.hand], r = FIST_R[cls] || 4.5; return [f[0], f[1], r, r]; };

/** The opaque box of a canvas: [x, y, w, h] (null when empty). */
function opaqueBox(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
const crop = (c, b) => { const o = document.createElement('canvas'); o.width = b[2]; o.height = b[3]; o.getContext('2d').drawImage(c, b[0], b[1], b[2], b[3], 0, 0, b[2], b[3]); return o; };
/** Shelf-pack canvases (tallest first) into a strip `width` wide; returns rects [x, y] and the height. */
function pack(list, width = 1024) {
  const order = list.map((c, i) => i).sort((a, b) => list[b].height - list[a].height);
  const at = new Array(list.length); let x = 0, y = 0, row = 0;
  for (const i of order) {
    const c = list[i];
    if (x + c.width > width) { x = 0; y += row + 1; row = 0; }
    at[i] = [x, y]; x += c.width + 1; row = Math.max(row, c.height);
  }
  return { at, height: y + row };
}

/** One set: { png: dataURL of the atlas, meta } (meta: what assets/sprites/held/<set>.json holds). */
export async function bakeSet(set) {
  const S = SETS[set], f = await fistOf(set), r2 = (v) => Math.round(v * 100) / 100;
  const pieces = [], out = [];
  for (const d of designs(set)) {
    const it = heldItem(d, f), b = bakePiece(it, LIT), box = opaqueBox(b.art);
    const rel = (m) => [r2(m.x - f[0]), r2(m.y - f[1])], one = (k) => b.marks.find((m) => m.kind === k);
    const mk = (k) => { const m = one(k); return m ? rel(m) : null; };
    const head = one('head'), orbit = one('orbit'), l0 = mk('l0'), l1 = mk('l1');
    const built = buildDesign(d), icon = bakeIcon(built.g, LIT, { diagonal: !built.grip || set === 'bows' || set === 'quivers', turn: built.grip ? [-0.2, 0.45] : [0.25, 0.5] });
    const k = pieces.length;
    pieces.push(crop(b.art, box), crop(b.mask, box), icon.art, icon.mask);
    out.push({
      name: it.label, rarity: d.rarity, element: d.element, off: [box[0] - f[0], box[1] - f[1]], size: [box[2], box[3]], at: k,
      pts: {
        head: head ? [...rel(head), r2(head.r)] : null, tip: mk('tip'), line: l0 && l1 ? [l0, l1] : null,
        orbit: orbit ? [...rel(orbit), r2(orbit.r)] : null, slots: b.marks.filter((m) => m.kind === 'slot').map(rel),
      },
    });
  }
  const { at, height } = pack(pieces), atlas = document.createElement('canvas');
  atlas.width = 1024; atlas.height = height;
  const x = atlas.getContext('2d');
  pieces.forEach((c, i) => x.drawImage(c, at[i][0], at[i][1]));
  for (const o of out) { // rects [x, y, w, h]: the held sprite, its mask, the icon, its mask
    const r = (i) => [...at[o.at + i], pieces[o.at + i].width, pieces[o.at + i].height];
    o.held = r(0); o.mask = r(1); o.icon = r(2); o.iconMask = r(3); delete o.at;
  }
  const p = poseOf({ set }, { key: '' });
  return { png: atlas.toDataURL('image/png'), meta: { set, cls: S.cls, slot: S.slot, hand: S.hand, fist: [f[0], f[1]], shadow: p.shadow || POSE[S.pose].shadow || null, designs: out } };
}

/** Every class's fists on every armor: { cls: [null, { R: [x, y], L: [x, y] }, ...] } (art px, pixel centres). */
export async function bakeFists(classes) {
  const o = {};
  for (const c of classes) { const f = await classFists(c); o[c] = Object.keys(f).map(Number).sort((a, b) => a - b).map((n) => f[n]); }
  return o;
}
