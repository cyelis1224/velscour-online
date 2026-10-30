// Weapon and off-hand families for tools/weapons3d.js. Each builds one seeded design of rarity R (0 Common .. 5 Mythic)
// from the material kit M (weapons3d_parts.js kitFor) and returns { g, form } (haft pieces, local +Y from the grip to
// the head, or from the foot up for planted ones) or { g, grip, form } (pieces held flat, +Z their face). Fancier with
// rarity: plain at Common; bands and better metal; gold, a jewel; glowing runes; glowing edges and cores; at Mythic
// floating shards and halos. Markers ('slot', 'head', 'tip', 'l0'/'l1', 'orbit') feed the bake's sockets and effects.
import * as THREE from 'three';
import { smooth, mirror, inset, extrude, bow, cyl, band, ball, cone, spike, fib, shape } from './handheld3d.js';
import { V, put, box, tube, slab, down, torus, lathe, oct, ico, mark, jewel, runes, shards, halo, studs, solid, glow, range, pick, int, chance } from './weapons3d_parts.js';

const PI = Math.PI;
const upto = (a, R, per) => a.slice(0, Math.min(a.length, per[R])); // the forms open to a rarity

// ------------------------------------------------------------------ swords (hang: the hilt at the origin, blade +Y)
export function sword(r, R, M, { L = 46, W = 3.2 } = {}) {
  const g = new THREE.Group(), type = pick(r, upto(['straight', 'broad', 'leaf', 'falchion', 'flamberge', 'spined', 'cleaver', 'needle'], R, [3, 4, 5, 6, 8, 8]));
  const len = L * range(r, 0.9, 1.08), w = W * range(r, 0.85, 1.2) * ({ broad: 1.3, cleaver: 1.4, needle: 0.65 }[type] || 1), y0 = 6.4, N = 30;
  const lft = [], rgt = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = y0 + t * len, tipK = t > 0.84 ? Math.max(0.03, (1 - t) / 0.16) : 1;
    let k = type === 'leaf' ? 0.75 + 0.45 * Math.sin(PI * Math.min(1, t * 1.15)) : 1 - 0.22 * t;
    if (type === 'flamberge') k *= 1 + 0.2 * Math.sin(t * 26);
    let l = w * k * tipK, rr = l;
    if (type === 'falchion') { l *= 0.55; rr *= 1 + 0.55 * Math.sin(PI * t * 0.95); }
    if (type === 'cleaver') { rr = w * (0.9 + 0.35 * t) * (t > 0.92 ? Math.max(0.15, (1 - t) / 0.08) : 1); l = w * 0.7 * tipK; }
    if (type === 'spined' && i % 3 === 1 && t < 0.82) rr += w * 0.5;
    lft.push([-l, y]); rgt.push([rr, y]);
  }
  const outline = [...rgt, ...lft.reverse()], depth = 0.9 + w * 0.14;
  g.add(slab(outline, depth, M.blade, 0.25));
  g.add(slab(outline.map(([x, y]) => [x * 1.08 + Math.sign(x) * 0.3, y + (y > y0 + len * 0.97 ? 0.8 : 0)]), depth * 0.5, R >= 4 ? M.glow : M.edge, 0)); // the edge: bright steel, glowing from Legendary
  if (R >= 3) runes(g, M, 0, y0 + 3, y0 + len * 0.62, w * 0.62, depth / 2 + 0.08);
  else { for (const s of [1, -1]) g.add(put(box(w * 0.32, len * 0.55, 0.12, M.dark), 0, y0 + 2 + len * 0.275, s * (depth / 2 + 0.03))); mark(g, 'l0', 0, y0 + 3); mark(g, 'l1', 0, y0 + len * 0.85); }
  // the guard
  const gt = pick(r, upto(['bar', 'curved', 'drooped', 'balls', 'winged', 'dragon'], R, [2, 3, 4, 5, 6, 6])), gw = w * range(r, 2.2, 3);
  const gm = R >= 2 ? M.trim : M.metal2;
  if (gt === 'bar' || gt === 'balls') { g.add(put(box(gw * 2, 1.6, 2.2, gm), 0, 5.2)); if (gt === 'balls') for (const s of [-1, 1]) g.add(put(ball(1.1, 0, gm, 8), s * gw, 5.2)); }
  if (gt === 'curved' || gt === 'drooped') { const d = gt === 'curved' ? 1 : -1; g.add(tube([[-gw, 5 + d * 3], [-gw * 0.6, 5.2], [0, 5], [gw * 0.6, 5.2], [gw, 5 + d * 3]], 0.8, gm, 20, 6)); }
  if (gt === 'winged' || gt === 'dragon') {
    for (const s of [-1, 1]) { const p = [[s * 1.5, 4], [s * gw, 4.6], [s * gw * 1.25, 8.4], [s * gw * 0.8, 6.8], [s * gw * 0.55, 8], [s * 1.5, 6.4]]; g.add(slab(s > 0 ? p : p.reverse(), 1.4, gm, 0.3)); }
    if (gt === 'dragon') { g.add(put(ball(1.8, 0, M.metal2, 10), 0, 5.4, 0.4)); for (const x of [-0.7, 0.7]) g.add(put(ball(0.4, 0, M.glow, 6), x, 5.6, 2)); }
  }
  g.add(put(box(3.2, 2.2, 2.4, gm), 0, 5.2));
  // grip and pommel
  g.add(cyl(1.05, 1, -4.2, 4, M.grip)); if (R >= 1) g.add(band(1.2, -4, gm, 0.7), band(1.2, 3.8, gm, 0.7));
  const pt = pick(r, upto(['ball', 'disc', 'facet', 'spike', 'claw'], R, [2, 3, 4, 5, 5]));
  if (pt === 'ball') g.add(ball(1.6, -5.8, gm, 10));
  if (pt === 'disc') { const d = put(cyl(2, 2, -0.6, 0.6, gm, 14), 0, -6); d.rotation.x = PI / 2; g.add(d); }
  if (pt === 'facet') g.add(put(oct(2, gm), 0, -6));
  if (pt === 'spike') g.add(ball(1.4, -5.6, gm, 8), spike(0.9, 3.4, gm, [0, -6.6, 0], [0, -1, 0], 6));
  if (pt === 'claw') { g.add(put(ball(1.5, 0, M.gem, 10), 0, -6.4)); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; g.add(tube([[0, -4.4, 0], [Math.cos(a) * 1.8, -5.6, Math.sin(a) * 1.8], [Math.cos(a) * 1.2, -7.6, Math.sin(a) * 1.2]], 0.3, gm, 8, 5)); } }
  if (R >= 2) jewel(g, M, [0, 5.2, 1.3], 0.9);
  if (R >= 4) jewel(g, M, [0, y0 + len * 0.18, depth / 2 + 0.2], 0.8, [0, 0, 1], 'ball');
  if (R >= 5) shards(g, M, [0, y0 + len * 0.5, 0], w * 2.6, 4, r, 0.8);
  for (const t of [0.12, 0.3, 0.48]) mark(g, 'slot', 0, y0 + len * t, depth / 2);
  mark(g, 'slot', 0, -5.8, 1); mark(g, 'tip', 0, y0 + len); mark(g, 'head', 0, y0 + len * 0.55, 0, len * 0.5);
  return { g, form: { straight: 'Longsword', broad: 'Broadsword', leaf: 'Leaf Blade', falchion: 'Falchion', flamberge: 'Flamberge', spined: 'Sawblade', cleaver: 'Cleaver', needle: 'Estoc' }[type] };
}

// ------------------------------------------------------------------ axes (planted: the butt at the origin; or a hand axe, the grip near -3)
export function axe(r, R, M, { len = 100, k = 1.6, planted = true } = {}) {
  const g = new THREE.Group(), y = planted ? len - 10 : len - 8, base = planted ? 2 : -6, hr = planted ? 1.45 : 1.05;
  const type = pick(r, upto(['bearded', 'broad', 'crescent', 'dane', 'double', 'moon'], R, [3, 4, 5, 6, 6, 6]));
  g.add(cyl(hr, hr * 0.9, base, y + (planted ? 10 : 8), M.wood, 8));
  if (planted) g.add(put(down(cone(hr, 3, M.metal2, 6)), 0, 1.5), put(cyl(hr + 0.3, hr + 0.3, -6, 6, M.grip), 0, 60));
  else g.add(cyl(hr + 0.2, hr + 0.2, -5, 2, M.grip));
  if (R >= 1) for (const b of planted ? [30, 75, y - 12] : [5, y - 7]) g.add(band(hr + 0.3, b, R >= 2 ? M.trim : M.metal2, 1.1));
  const K = (p) => p.map(([a, b]) => [a < 1.5 ? a : a * k, y + b * k]);
  const shapes = {
    bearded: [[1.4, 4], [5, 6], [10, 9.5], [11.6, 3], [11, -6], [8, -11.5], [5, -5], [1.4, -3]],
    broad: [[1.4, 4], [10.5, 6.5], [12, 5.5], [12, -8], [10, -10], [1.4, -4]],
    crescent: [[1.4, 3], [5, 6], [8, 12], [11, 8], [12.5, 0], [11, -8], [8, -12], [5, -6], [1.4, -3]],
    dane: [[1.4, 3], [6, 5], [10.5, 7.5], [11.6, 0], [10, -9], [6, -15], [4, -12], [2.5, -5], [1.4, -3]],
    double: [[1.4, 3.5], [7, 6], [10.5, 8.5], [11.5, 0], [10.5, -8.5], [7, -6], [1.4, -3.5]],
    moon: [[1.4, 3], [4, 4], [7, 11], [12, 12], [10, 6], [11, 0], [10, -6], [12, -12], [7, -11], [4, -4], [1.4, -3]],
  };
  const out = K(shapes[type]), d = planted ? 2 : 1.5;
  g.add(slab(out, d, M.blade, 0.4));
  const edge = out.slice(1, -1);
  g.add(tube(edge.map(([a, b]) => [a + 0.3, b, 0]), planted ? 0.75 : 0.5, R >= 4 ? M.glow : M.edge, 24, 5));
  if (type === 'double' || type === 'moon') { g.add(slab(out.map(([a, b]) => [-a, b]).reverse(), d, M.blade, 0.4)); g.add(tube(edge.map(([a, b]) => [-a - 0.3, b, 0]), planted ? 0.75 : 0.5, R >= 4 ? M.glow : M.edge, 24, 5)); }
  else {
    const back = pick(r, ['spike', 'hammer', 'none', 'hook']);
    if (back === 'spike') g.add(spike(1.4 * k / 1.6, 6 * k / 1.6, M.metal2, [-hr, y + 1, 0], [-1, 0.1, 0], 6));
    if (back === 'hammer') g.add(put(box(5 * k / 1.6, 4 * k / 1.6, 3.4 * k / 1.6, M.metal2), -hr - 2 * k / 1.6, y + 1));
    if (back === 'hook') g.add(tube([[-hr, y + 2, 0], [-4 * k, y + 3 * k, 0], [-6 * k, y - 1, 0], [-5 * k, y - 4 * k, 0]], 0.8 * k / 1.6, M.metal2, 14, 5));
  }
  g.add(put(cyl(hr + 0.7, hr + 0.7, -4 * k / 1.6, 4 * k / 1.6, R >= 2 ? M.trim : M.metal2, 10), 0, y + 1));
  if (R >= 2) g.add(spike(hr * 0.9, 6 * k / 1.6, M.metal2, [0, y + 5 * k / 1.6, 0], [0, 1, 0], 6));
  if (R >= 1 && chance(r, 0.5)) for (const [x, yy] of [[-3 * k / 1.6, y - 6], [-4.4 * k / 1.6, y - 9]]) g.add(put(cyl(0.6, 0.6, -2.5, 0, M.bone, 5), x, yy)); // bone charms
  if (R >= 2) jewel(g, M, [6 * k, y, d / 2 + 0.2], 1 + R * 0.12);
  if (R >= 3) runes(g, M, 8 * k, y - 4 * k, y + 4 * k, 1.6, d / 2 + 0.1, 3);
  if (R >= 5) { shards(g, M, [6 * k, y, 0], 9 * k, 5, r); halo(g, M, [0, y + 1, 0], 6 * k, 1.4); }
  mark(g, 'head', 6 * k, y, 0, 10 * k); mark(g, 'tip', 0, y + 9); mark(g, 'l0', edge[0][0], edge[0][1]); mark(g, 'l1', edge.at(-1)[0], edge.at(-1)[1]);
  mark(g, 'slot', 4 * k, y + 2, d / 2); mark(g, 'slot', 4 * k, y - 3, d / 2); mark(g, 'slot', 0, y - 14, hr);
  return { g, form: { bearded: 'Bearded Axe', broad: 'Broad Axe', crescent: 'Crescent Axe', dane: 'Dane Axe', double: 'Double Axe', moon: 'Moon Axe' }[type] + (planted ? '' : '') };
}

// ------------------------------------------------------------------ maces (across: the grip at the origin)
export function mace(r, R, M, { slime = false } = {}) {
  const g = new THREE.Group(), H = range(r, 19, 23);
  const type = slime ? pick(r, upto(['blob', 'spiked', 'bubbles', 'crystal', 'skull', 'crown'], R, [2, 3, 4, 5, 6, 6]))
    : pick(r, upto(['club', 'ball', 'flanged', 'star', 'hammer', 'pernach', 'scepter', 'crown'], R, [3, 4, 5, 6, 8, 8]));
  const gm = R >= 2 ? M.trim : M.metal2;
  g.add(ball(1.45, -5.4, gm, 10), band(1.2, -4.3, gm, 0.9), cyl(0.95, 0.95, -3.9, 3.9, M.grip), band(1.2, 4.2, gm, 0.9));
  g.add(cyl(0.85, 0.78, 4.6, H + 1, type === 'club' ? M.wood : M.metal, 10));
  if (R >= 1) g.add(band(1.1, H * 0.6, gm, 0.8));
  const c = H + 5.5; // the head's centre
  const slimeM = new THREE.MeshStandardMaterial({ color: M.e, emissive: M.e, emissiveIntensity: 0.45, roughness: 0.12, metalness: 0.05, envMapIntensity: 1.6 }); slimeM.userData.region = 'glow';
  if (type === 'club') { g.add(lathe([[0.9, H - 4], [1.6, H], [2.8, H + 6], [3, H + 10], [0.5, H + 11.5]], M.wood, 10)); studs(g, M.metal2, [[0, H + 4, 2.4], [1.6, H + 7, 2.3], [-1.6, H + 8, 2.4], [0, H + 9.5, 2.5]]); }
  if (type === 'ball') { g.add(ball(3.6, c, M.metal, 14)); for (const yy of [-1.6, 1.6]) g.add(band(3.3, c + yy, gm, 0.6)); }
  if (type === 'flanged' || type === 'pernach') {
    g.add(cyl(1.6, 1.4, H, H + 10, M.metal2, 8));
    const n = int(r, 5, 8), wd = range(r, 3.6, 5);
    const prof = pick(r, [[[1, -0.5], [2.1, -0.5], [wd, 2.5], [wd - 1, 5], [wd, 8.5], [2.3, 10.5], [1, 10.4]], [[1, 0], [wd, 1.5], [wd, 9], [1, 10.5]], [[1, -0.5], [wd * 0.6, 0], [wd, 5], [wd * 0.6, 10], [1, 10.4]]]);
    const fs = shape(prof.map(([x, yy]) => [x, H + yy]));
    if (type === 'pernach') fs.holes.push(shape(smooth([[wd * 0.45, H + 3], [wd * 0.7, H + 5], [wd * 0.45, H + 7], [wd * 0.3, H + 5]], 3).reverse()));
    const fg = extrude(fs, 0.9, 0.25); fg.translate(0, 0, -0.45);
    for (let i = 0; i < n; i++) { const f = new THREE.Mesh(fg, M.metal); f.rotation.y = (i / n) * PI * 2; g.add(f); }
    g.add(band(2.1, H, gm, 1.1)); g.add(put(cone(1.6, 2, gm, 8), 0, H + 11.4));
  }
  if (type === 'star') { const rr = range(r, 3.2, 4); g.add(ball(rr, c, M.metal, 14)); for (const dd of fib(int(r, 10, 18))) g.add(spike(0.75, range(r, 2.2, 3.2), M.metal2, [dd[0] * rr * 0.9, c + dd[1] * rr * 0.9, dd[2] * rr * 0.9], dd)); }
  if (type === 'hammer') {
    g.add(put(box(5.6, 3.8, 3.8, M.metal2), 2.2, c), put(box(2.4, 4.6, 4.2, gm), 0, c));
    const f = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.1, 1.2, 8), M.metal); f.rotation.z = PI / 2; g.add(put(f, 5.4, c));
    g.add(spike(1.5, 6.2, M.metal2, [-0.4, c, 0], [-1, -0.28, 0]), spike(0.9, 4.5, M.metal, [0, c + 2.2, 0], [0, 1, 0]));
  }
  if (type === 'scepter') {
    g.add(ball(1.6, H + 0.4, gm, 10));
    const top = pick(r, ['sun', 'cross', 'ring']), cc = H + 6;
    if (top === 'sun') { g.add(put(torus(3.2, 0.75, gm, 18), 0, cc)); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; g.add(spike(0.85, i % 2 ? 2.2 : 3.6, gm, [Math.sin(a) * 3.6, cc + Math.cos(a) * 3.6, 0], [Math.sin(a), Math.cos(a), 0])); } }
    if (top === 'cross') g.add(slab([[-1.2, H + 1], [1.2, H + 1], [1.2, cc], [4, cc], [4, cc + 2.4], [1.2, cc + 2.4], [1.2, cc + 5.6], [-1.2, cc + 5.6], [-1.2, cc + 2.4], [-4, cc + 2.4], [-4, cc], [-1.2, cc]], 1.2, gm, 0.3));
    if (top === 'ring') g.add(put(torus(3, 0.6, gm, 20), 0, cc), spike(0.7, 3, gm, [0, cc + 3, 0], [0, 1, 0]));
    g.add(put(ball(1.9, 0, M.gem, 12), 0, cc + (top === 'cross' ? 1.2 : 0), 0.4));
  }
  if (type === 'crown') { g.add(lathe([[1, H], [3.4, H + 2], [3.6, H + 6], [2.8, H + 6.4]], gm, 14)); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; g.add(spike(0.9, 4, gm, [Math.cos(a) * 3, H + 6, Math.sin(a) * 3], [Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3], 5)); } g.add(put(ball(2.2, 0, M.gem, 12), 0, H + 5)); }
  if (slime) {
    const bs = range(r, 4, 5.2);
    const bg = new THREE.SphereGeometry(bs, 18, 14), p = bg.attributes.position, sd = r() * 9;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i), z = p.getZ(i), q = 1 + 0.12 * Math.sin(x * 1.7 + sd) * Math.cos(yy * 1.9 - sd) + 0.08 * Math.sin(z * 2.3 + sd); p.setXYZ(i, x * q, yy * q, z * q); }
    bg.computeVertexNormals(); g.add(put(new THREE.Mesh(bg, slimeM), 0, H + bs * 0.9));
    for (let i = 0; i < 3; i++) { const a = r() * PI * 2, x = Math.cos(a) * bs * 0.6, z = Math.sin(a) * bs * 0.6; g.add(put(ball(0.8, 0, slimeM, 8), x, H - 0.4, z), spike(0.6, 2, slimeM, [x, H - 0.8, z], [0, -1, 0], 6)); }
    if (type === 'spiked') for (const dd of fib(10)) g.add(spike(0.6, 2.4, M.metal2, [dd[0] * bs * 0.9, H + bs * 0.9 + dd[1] * bs * 0.9, dd[2] * bs * 0.9], dd));
    if (type === 'bubbles') for (let i = 0; i < 6; i++) g.add(put(ball(range(r, 0.4, 0.9), 0, M.glow2, 6), range(r, -2, 2), H + bs * 0.9 + range(r, -2, 2), bs * 0.85));
    if (type === 'crystal') for (let i = 0; i < 4; i++) { const s = oct(1.2, M.gem); s.scale.y = 2.4; s.rotation.z = (i - 1.5) * 0.5; g.add(put(s, (i - 1.5) * 1.6, H + bs * 1.6, 0.5)); }
    if (type === 'skull') { g.add(put(ball(2.2, 0, M.bone, 10), 0, H + bs * 0.9, 0.6)); for (const x of [-0.8, 0.8]) g.add(put(ball(0.55, 0, M.dark, 6), x, H + bs * 0.95, 2.6)); }
    if (type === 'crown') for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; g.add(spike(0.8, 3, M.trim, [Math.cos(a) * bs * 0.6, H + bs * 1.6, Math.sin(a) * bs * 0.6], [0, 1, 0], 5)); }
    g.add(band(1.6, H - 0.4, gm, 1.2));
  }
  if (R >= 2 && !['scepter', 'crown'].includes(type)) jewel(g, M, [0, slime ? H - 0.4 : c, slime ? 1.8 : 4], 0.9);
  if (R >= 3) { g.add(band(1.05, 8, M.glow, 0.6), band(1.0, 14, M.glow, 0.6)); mark(g, 'l0', 0, 6); mark(g, 'l1', 0, H); }
  if (R >= 4 && !slime) g.add(put(ball(1.4, 0, M.glow2, 10), 0, c, 0));
  if (R >= 5) { shards(g, M, [0, c, 0], 7, 5, r, 0.8); halo(g, M, [0, c, 0], 6, 1.3); }
  mark(g, 'head', 0, c, 0, 6); mark(g, 'tip', 0, H + 12); mark(g, 'slot', 0, c, 3.6); mark(g, 'slot', 0, H - 4, 1); mark(g, 'slot', 0, -5.4, 1.2);
  return { g, form: slime ? { blob: 'Ooze Mace', spiked: 'Spiked Ooze', bubbles: 'Bubbling Mace', crystal: 'Gel Crystal Mace', skull: 'Drowned Skull Mace', crown: 'Slime Crown Mace' }[type]
    : { club: 'Studded Club', ball: 'Ball Mace', flanged: 'Flanged Mace', star: 'Morning Star', hammer: 'War Hammer', pernach: 'Pernach', scepter: 'Scepter', crown: 'Crown Mace' }[type] };
}

// ------------------------------------------------------------------ polearms (planted: the foot at the origin)
export function spear(r, R, M) {
  const g = new THREE.Group(), top = range(r, 104, 112), hr = 1.1;
  const type = pick(r, upto(['leaf', 'winged', 'broad', 'trident', 'glaive', 'dragon'], R, [2, 3, 4, 5, 6, 6]));
  g.add(cyl(hr, hr * 0.95, 3, top, M.wood, 8), put(down(cone(1.1, 3, M.metal2, 6)), 0, 1.5), put(cyl(1.5, 1.5, -5, 5, M.grip), 0, 60));
  const gm = R >= 2 ? M.trim : M.metal2;
  if (R >= 1) for (const y of [30, 88, top - 6]) g.add(band(1.35, y, gm, 1));
  if (R >= 1 && chance(r, 0.7)) g.add(put(down(cone(2.8, 6.5, solid(pick(r, [0xc02a20, 0x2a40c0, 0xd8b030, 0xe8e0d0]), 0, 0.8, 1, 'grip'), 10)), 0, top - 3));
  g.add(cyl(1.6, 1.3, top, top + 4, gm, 8));
  const t0 = top + 3.5, hl = range(r, 22, 30);
  const blade = {
    leaf: [[0, t0], [2.6, t0 + hl * 0.25], [2.8, t0 + hl * 0.5], [0, t0 + hl], [-2.8, t0 + hl * 0.5], [-2.6, t0 + hl * 0.25]],
    winged: [[0, t0], [2.4, t0 + 4], [2.6, t0 + hl * 0.55], [0, t0 + hl], [-2.6, t0 + hl * 0.55], [-2.4, t0 + 4]],
    broad: [[0, t0], [4, t0 + 3], [3.6, t0 + hl * 0.6], [0, t0 + hl * 1.05], [-3.6, t0 + hl * 0.6], [-4, t0 + 3]],
    trident: [[0, t0], [1.6, t0 + 2], [1.4, t0 + hl], [0, t0 + hl + 3], [-1.4, t0 + hl], [-1.6, t0 + 2]],
    glaive: [[-1, t0], [2, t0 + 2], [5, t0 + hl * 0.5], [3, t0 + hl], [-1, t0 + hl * 0.9], [-1.4, t0 + hl * 0.4]],
    dragon: [[0, t0], [2.5, t0 + 4.5], [2.7, t0 + 10.5], [0, t0 + hl], [-2.7, t0 + 10.5], [-2.5, t0 + 4.5]],
  }[type];
  g.add(slab(smooth(blade, 3), 1, M.blade, 0.3));
  if (R < 4) g.add(slab(smooth(blade, 3).map(([x, y]) => [x * 1.22, y + (y > t0 + hl * 0.9 ? 0.6 : 0)]), 0.5, M.edge, 0));
  if (type === 'winged') for (const s of [-1, 1]) g.add(slab(s > 0 ? [[1, t0 + 1], [6, t0 + 2], [6.5, t0 + 4], [1, t0 + 3.4]] : [[-1, t0 + 3.4], [-6.5, t0 + 4], [-6, t0 + 2], [-1, t0 + 1]], 1, M.metal2, 0.25));
  if (type === 'broad') for (const s of [-1, 1]) g.add(slab(s > 0 ? [[3, t0 + 1], [7, t0 - 2], [7.4, t0 + 2], [3.6, t0 + 4]] : [[-3.6, t0 + 4], [-7.4, t0 + 2], [-7, t0 - 2], [-3, t0 + 1]], 1, M.metal, 0.25));
  if (type === 'trident') for (const s of [-1, 1]) { g.add(tube([[s * 1, t0 + 1, 0], [s * 4.5, t0 + 3, 0], [s * 5, t0 + 10, 0], [s * 4.6, t0 + hl * 0.8, 0]], 0.7, M.metal, 16, 5)); g.add(spike(0.9, 3, M.metal, [s * 4.6, t0 + hl * 0.8, 0], [0, 1, 0], 5)); }
  if (type === 'dragon') for (const s of [-1, 1]) g.add(slab(s > 0 ? [[1.2, t0 - 0.5], [6, t0 + 2], [7.8, t0 + 7], [5, t0 + 4.8], [1.2, t0 + 3]] : [[-1.2, t0 + 3], [-5, t0 + 4.8], [-7.8, t0 + 7], [-6, t0 + 2], [-1.2, t0 - 0.5]], 0.9, gm, 0.25));
  if (R >= 2) jewel(g, M, [0, t0 + 1.5, 0.9], 0.8);
  if (R >= 3) runes(g, M, 0, t0 + 3, t0 + hl * 0.65, 1.2, 0.6, 3);
  if (R >= 4) g.add(slab(smooth(blade, 3).map(([x, y]) => [x * 1.3, y + (y > t0 + hl * 0.9 ? 1 : 0)]), 0.4, M.glow, 0));
  if (R >= 5) { shards(g, M, [0, t0 + hl * 0.5, 0], 7, 5, r); halo(g, M, [0, t0, 0], 5, 1.3); }
  mark(g, 'head', 0, t0 + hl * 0.5, 0, hl * 0.6); mark(g, 'tip', 0, t0 + hl); mark(g, 'l0', 0, t0 + 2); mark(g, 'l1', 0, t0 + hl);
  mark(g, 'slot', 0, t0 + 2, 1); mark(g, 'slot', 0, top - 6, 1.4); mark(g, 'slot', 0, 70, 1.3);
  return { g, form: { leaf: 'Leaf Spear', winged: 'Winged Spear', broad: 'Partisan', trident: 'Trident', glaive: 'Glaive', dragon: 'Dragon Spear' }[type] };
}

export function lance(r, R, M) {
  const g = new THREE.Group(), V0 = 61, V1 = 69, R0 = range(r, 3.6, 4.6), TIP = range(r, 188, 198);
  const pal = pick(r, [['#22387a', '#c8bc9e'], ['#7a1a1a', '#c8bc9e'], ['#1a1a1a', '#b8a070'], ['#2a5a2a', '#d8c8a0'], ['#5a2a6a', '#c0b0d0'], ['#c8a040', '#2a2a30']]);
  const sc = document.createElement('canvas'); sc.width = sc.height = 64;
  const sx = sc.getContext('2d'), sw = pick(r, [8, 16, 16, 32]), plain = R === 0 && chance(r, 0.6);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { sx.fillStyle = plain ? '#b89068' : ((x + y) / sw | 0) % 2 ? pal[0] : pal[1]; sx.fillRect(x, y, 1, 1); }
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; st.wrapS = st.wrapT = THREE.RepeatWrapping; st.repeat.set(1, int(r, 5, 9));
  const paint = new THREE.MeshStandardMaterial({ map: st, metalness: 0.05, roughness: 0.45, envMapIntensity: 1.1 }); paint.userData.region = 'other';
  const gm = R >= 2 ? M.trim : M.metal2;
  g.add(cyl(1.6, 1.7, 0, 2.5, gm, 10), cyl(1.25, 1.35, 2.5, V0, M.wood, 10), band(1.55, 30, gm, 1.2), put(cyl(1.6, 1.6, -4.5, 4.5, M.grip), 0, 55));
  const vt = pick(r, upto(['cone', 'bell', 'disc', 'wing'], R, [2, 3, 4, 4, 4, 4]));
  const vm = gm.clone(); vm.side = THREE.DoubleSide; vm.userData.region = 'trim';
  if (vt === 'cone') { const vg = new THREE.CylinderGeometry(R0 + 0.3, 8, V1 - V0, 20, 1, true); vg.translate(0, (V0 + V1) / 2, 0); g.add(new THREE.Mesh(vg, vm)); }
  if (vt === 'bell') g.add(lathe([[8.5, V0], [7.6, V0 + 2], [5.4, V0 + 5], [R0 + 0.3, V1]], vm, 20));
  if (vt === 'disc') g.add(put(cyl(7.6, 7.6, -0.8, 0.8, gm, 22), 0, V0 + 2), lathe([[3, V0 + 2], [R0 + 0.3, V1]], vm, 16));
  if (vt === 'wing') { g.add(lathe([[7.5, V0], [5, V0 + 4], [R0 + 0.3, V1]], vm, 18)); for (const s of [-1, 1]) g.add(slab(s > 0 ? [[3, V0 + 2], [11, V0 + 7], [8, V0 + 8], [3, V0 + 6]] : [[-3, V0 + 6], [-8, V0 + 8], [-11, V0 + 7], [-3, V0 + 2]], 0.8, gm, 0.25)); }
  g.add(put(cyl(8.1, 8.1, -0.45, 0.45, M.metal2, 20), 0, V0), band(R0 + 0.5, V1, gm, 1.2));
  const shaft = new THREE.CylinderGeometry(1, R0, 180 - V1, 16, 1); shaft.translate(0, (V1 + 180) / 2, 0);
  g.add(new THREE.Mesh(shaft, paint), band(1.25, 180, gm, 1));
  const tt = pick(r, upto(['point', 'long', 'coronel'], R, [2, 3, 3, 3, 3, 3]));
  if (tt === 'coronel') { g.add(put(cyl(1.6, 1.2, 180, 183, M.metal, 8))); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; g.add(spike(0.6, 3.5, M.metal, [Math.cos(a) * 1.2, 183, Math.sin(a) * 1.2], [Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3], 5)); } }
  else g.add(put(cone(1.2, (tt === 'long' ? TIP + 6 : TIP) - 180, M.metal, 6), 0, (180 + (tt === 'long' ? TIP + 6 : TIP)) / 2));
  if (R >= 2) jewel(g, M, [0, V0 + 3, 6], 1);
  if (R >= 3) for (let i = 0; i < 4; i++) g.add(band(R0 - (R0 - 1) * (i + 1) / 5 + 0.2, V1 + (180 - V1) * (i + 1) / 5, M.glow, 0.8));
  if (R >= 4) { for (const s of [-1, 1]) jewel(g, M, [s * 4.5, V0 + 2.5, 4], 0.8); }
  if (R >= 5) { shards(g, M, [0, 160, 0], 6, 4, r); halo(g, M, [0, V0 + 3, 0], 9, 1.4); }
  mark(g, 'head', 0, 150, 0, 25); mark(g, 'tip', 0, TIP); mark(g, 'l0', 0, V1 + 4); mark(g, 'l1', 0, TIP - 4);
  mark(g, 'slot', 0, V0 + 3, 6); mark(g, 'slot', 0, 100, R0 * 0.7); mark(g, 'slot', 0, 140, 2);
  return { g, form: { cone: 'Lance', bell: 'Tourney Lance', disc: 'War Lance', wing: 'Winged Lance' }[vt] };
}

// ------------------------------------------------------------------ staves (planted: the foot at the origin)
export function staff(r, R, M, theme) {
  const g = new THREE.Group(), top = range(r, 98, 108), gm = R >= 2 ? M.trim : M.metal2;
  const shaftT = pick(r, theme === 'witch' ? ['gnarl', 'gnarl', 'bone'] : theme === 'totem' ? ['straight', 'straight', 'gnarl'] : ['straight', 'gnarl', 'twist']);
  if (shaftT === 'straight') g.add(cyl(1.2, 1.05, 0, top, M.wood, 8));
  else if (shaftT === 'bone') { for (let y = 0; y < top; y += 9) g.add(cyl(0.9, 0.9, y, y + 9, M.bone, 7), ball(1.3, y, M.bone, 7)); }
  else { const pts = []; for (let i = 0; i <= 12; i++) pts.push([Math.sin(i * 1.9 + r() * 2) * (shaftT === 'twist' ? 0.3 : 0.6), i * top / 12, Math.cos(i * 1.4) * 0.4]); g.add(tube(pts, 1.15, M.wood, 60, 7)); }
  g.add(put(down(cone(1.2, 2.6, M.metal2, 6)), 0, 1.3), put(cyl(1.45, 1.45, -5, 5, M.grip), 0, 57));
  if (R >= 1) g.add(band(1.5, top - 4, gm, 1.2), band(1.4, top - 9, gm, 0.8));
  const T = top, sub = pick(r, {
    wizard: upto(['claw', 'ring', 'crystal', 'brazier', 'crescent', 'sun', 'gnarlorb'], R, [3, 4, 5, 6, 7, 7]),
    totem: upto(['faces', 'bird', 'horns', 'feathers', 'mask', 'antlers'], R, [3, 4, 5, 6, 6, 6]),
    witch: upto(['crook', 'crow', 'antler', 'lantern', 'thorn', 'cage'], R, [3, 4, 5, 6, 6, 6]),
  }[theme]);
  const core = (y, s = 2.6) => { const o = oct(s, M.glow); o.scale.y = 1.5; g.add(put(o, 0, y)); mark(g, 'head', 0, y, 0, s * 2.4); mark(g, 'slot', 0, y, s); };
  // wizard
  if (sub === 'claw') { for (let i = 0; i < int(r, 3, 4); i++) { const a = i / 3.5 * PI * 2, c = Math.cos(a), s = Math.sin(a); g.add(tube([[c * 0.8, T, s * 0.8], [c * 3.2, T + 3, s * 3.2], [c * 3.8, T + 8, s * 3.8], [c * 1.5, T + 13, s * 1.5]], 0.55, gm, 14, 5)); } core(T + 8); }
  if (sub === 'ring') { g.add(put(torus(5, 0.9, gm, 28), 0, T + 6)); core(T + 6, 2.2); }
  if (sub === 'crystal') { for (let i = 0; i < 5; i++) { const s = oct(range(r, 1, 1.8), M.gem); s.scale.y = 2.6; s.rotation.z = (i - 2) * 0.35; g.add(put(s, (i - 2) * 1.3, T + 6 + (2 - Math.abs(i - 2)) * 1.5, (i % 2) * 0.8)); } core(T + 7, 1.6); }
  if (sub === 'brazier') { g.add(lathe([[1, T - 1], [2.5, T + 1], [4.6, T + 4], [4.8, T + 5], [4, T + 5]], gm, 14)); for (let i = 0; i < 3; i++) { const f = oct(1.6 - i * 0.3, i ? M.glow2 : M.glow); f.scale.y = 2.4; g.add(put(f, (i - 1) * 1.5, T + 7 + i * 0.8)); } mark(g, 'head', 0, T + 7, 0, 6); mark(g, 'slot', 0, T + 3, 4); }
  if (sub === 'crescent') { const m = []; for (let i = 0; i <= 12; i++) { const a = -2.3 + i / 12 * 4.6; m.push([Math.sin(a) * 6, T + 7 - Math.cos(a) * 6]); } for (let i = 12; i >= 0; i--) { const a = -2 + i / 12 * 4; m.push([Math.sin(a) * 4.4, T + 8 - Math.cos(a) * 4.8]); } g.add(slab(m, 1.2, gm, 0.25)); core(T + 7, 1.8); }
  if (sub === 'sun') { g.add(put(torus(4.2, 0.8, gm, 24), 0, T + 6)); for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; g.add(spike(0.8, i % 2 ? 2.4 : 4, gm, [Math.sin(a) * 4.6, T + 6 + Math.cos(a) * 4.6, 0], [Math.sin(a), Math.cos(a), 0], 5)); } core(T + 6, 2); }
  if (sub === 'gnarlorb') { for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2; g.add(tube([[0, T - 2, 0], [Math.cos(a) * 4, T + 4, Math.sin(a) * 4], [Math.cos(a + 1) * 3, T + 10, Math.sin(a + 1) * 3], [0, T + 13, 0]], 0.7, M.wood, 16, 5)); } g.add(put(ball(3, 0, M.gem, 14), 0, T + 6)); mark(g, 'head', 0, T + 6, 0, 6); mark(g, 'slot', 0, T + 6, 3); }
  // totem
  if (sub === 'faces' || sub === 'mask') {
    const n = sub === 'faces' ? int(r, 2, 3) : 1;
    for (let i = 0; i < n; i++) { const y = T + 3 + i * 6.5, col = pick(r, [M.wood, solid(0x2a8a7a, 0.2, 0.6, 1, 'other'), solid(0xa83224, 0, 0.6, 1, 'other')]); g.add(put(box(6, 6, 4.4, col), 0, y)); for (const x of [-1.5, 1.5]) g.add(put(box(1.4, 1.2, 0.4, M.glow), x, y + 1, 2.3)); g.add(put(box(2.6, 0.7, 0.4, M.dark), 0, y - 1.4, 2.3)); }
    if (sub === 'mask') { g.add(put(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 1, 20), solid(0xd8c098, 0, 0.6, 1, 'other')), 0, T + 3, 2.4).rotateX(PI / 2)); }
    mark(g, 'head', 0, T + 6, 0, 7);
  }
  if (sub === 'bird') { g.add(put(box(5, 5, 4.4, M.wood), 0, T + 3), spike(1.5, 5, solid(0xe0b040, 0, 0.5, 1, 'other'), [0, T + 3, 2], [0, -0.3, 1], 4)); for (const x of [-1.3, 1.3]) g.add(put(box(1, 1, 0.4, M.glow), x, T + 4.2, 2.3)); for (const s of [-1, 1]) g.add(slab(s > 0 ? [[2.5, T + 4], [11, T + 9], [12, T + 5], [9, T + 3], [10, T + 1], [2.5, T + 1.5]] : [[-2.5, T + 1.5], [-10, T + 1], [-9, T + 3], [-12, T + 5], [-11, T + 9], [-2.5, T + 4]], 0.8, solid(0x2a8a7a, 0.2, 0.6, 1, 'other'), 0.25)); mark(g, 'head', 0, T + 4, 0, 8); }
  if (sub === 'horns') { g.add(put(ball(3, 0, M.bone, 12), 0, T + 3)); for (const s of [-1, 1]) g.add(tube([[s * 2, T + 4, 0], [s * 5, T + 7, 0.5], [s * 7, T + 4, 1], [s * 6, T + 1, 1.5]], 0.9, M.bone, 16, 6)); for (const x of [-1, 1]) g.add(put(ball(0.6, 0, M.glow, 6), x, T + 3.4, 2.6)); mark(g, 'head', 0, T + 4, 0, 7); }
  if (sub === 'feathers' || sub === 'antlers') {
    g.add(put(box(4, 4, 3.6, M.wood), 0, T + 2));
    for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; if (sub === 'feathers') { const f = slab([[0, 0], [1, 1.5], [0.7, 7], [0, 8], [-0.7, 7], [-1, 1.5]], 0.3, solid(i % 2 ? 0xa83224 : 0xe8e0d0, 0, 0.8, 1, 'other'), 0); f.position.set(0, T + 4, -0.5); f.rotation.z = a; g.add(f); } }
    if (sub === 'antlers') for (const s of [-1, 1]) { g.add(tube([[s * 1.5, T + 3, 0], [s * 4, T + 8, 0], [s * 5, T + 14, 0]], 0.5, M.bone, 12, 5), tube([[s * 3.5, T + 7, 0], [s * 7, T + 10, 0]], 0.4, M.bone, 6, 5), tube([[s * 4.6, T + 11, 0], [s * 2.5, T + 15, 0]], 0.35, M.bone, 6, 5)); }
    mark(g, 'head', 0, T + 7, 0, 7);
  }
  // witch
  if (sub === 'crook') { g.add(tube([[0, T - 2, 0], [0.5, T + 4, 0], [3, T + 9, 0], [7, T + 8, 0], [7.4, T + 3, 0], [5, T + 1, 0]], 1.1, M.wood, 30, 7)); mark(g, 'head', 4, T + 6, 0, 6); }
  if (sub === 'crow' || sub === 'thorn') {
    g.add(tube([[0, T - 2, 0], [1, T + 6, 0], [6, T + 11, 0], [8.6, T + 6, 0], [6.4, T + 2, 0]], 1, M.wood, 30, 7));
    const sk = new THREE.Group(); sk.position.set(5, T - 4, 0);
    const cr = ball(1.9, 0, M.bone, 12); cr.scale.set(1, 0.9, 1.1); sk.add(cr, spike(0.9, 5.4, M.bone, [0, -0.6, 1.4], [0.15, -0.55, 1], 6));
    for (const x of [-0.8, 0.8]) sk.add(put(ball(0.55, 0, M.glow, 6), x, 0.4, 1.6));
    g.add(sk);
    if (sub === 'thorn') for (let i = 0; i < 8; i++) g.add(spike(0.35, 1.6, M.wood, [range(r, -1, 6), T + range(r, 0, 9), 0.6], [range(r, -1, 1), range(r, -1, 1), 0.5], 4));
    mark(g, 'head', 5, T - 4, 0, 6);
  }
  if (sub === 'antler') { for (const s of [-1, 1]) g.add(tube([[0, T, 0], [s * 3, T + 6, 0], [s * 4, T + 12, 0]], 0.6, M.bone, 12, 5), tube([[s * 2.6, T + 5, 0], [s * 6, T + 7, 0]], 0.45, M.bone, 6, 5)); g.add(put(ball(1.8, 0, M.gem, 10), 0, T + 4)); mark(g, 'head', 0, T + 6, 0, 6); }
  if (sub === 'lantern') {
    g.add(tube([[0, T - 2, 0], [0.5, T + 6, 0], [5, T + 9, 0], [7.4, T + 6, 0]], 1, M.wood, 24, 7));
    const L = new THREE.Group(); L.position.set(7.4, T - 1, 0);
    L.add(put(box(3.6, 0.6, 3.6, M.metal2), 0, 2), put(box(2.8, 4, 2.8, M.glow), 0, -0.6), put(box(3.6, 0.6, 3.6, M.metal2), 0, -2.8), put(cyl(0.2, 0.2, 2.3, 7, M.metal2, 4)));
    g.add(L); mark(g, 'head', 7.4, T - 1, 0, 5);
  }
  if (sub === 'cage') { for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; g.add(tube([[0, T, 0], [Math.cos(a) * 3.6, T + 5, Math.sin(a) * 3.6], [0, T + 11, 0]], 0.4, M.bone, 12, 5)); } g.add(put(ball(2.4, 0, M.glow, 12), 0, T + 5.5)); mark(g, 'head', 0, T + 5.5, 0, 5); }
  if (theme === 'witch' && R >= 1) for (const [x, l] of [[2, 7], [5.5, 10]]) { g.add(put(cyl(0.2, 0.2, -l, 0, solid(0x6a5a40, 0, 0.9, 1, 'other'), 4), x, T + 4)); g.add(put(cyl(0.45, 0.45, -3, 0, M.bone, 5), x, T + 4 - l)); }
  if (R >= 2) jewel(g, M, [0, T - 9, 1.4], 0.8);
  if (R >= 3) for (const y of [T - 20, T - 26]) g.add(band(1.3, y, M.glow, 0.6));
  if (R >= 4) { g.add(put(ball(1.2, 0, M.glow2, 8), 0, T + 6, 3)); jewel(g, M, [0, 80, 1.3], 0.7); }
  if (R >= 5) { shards(g, M, [0, T + 6, 0], 8, 6, r); halo(g, M, [0, T + 6, 0], 7, 1.2); }
  mark(g, 'tip', 0, T + 13); mark(g, 'l0', 0, T - 20); mark(g, 'l1', 0, T + 2); mark(g, 'slot', 0, T - 9, 1.4); mark(g, 'slot', 0, 80, 1.3);
  const names = { claw: 'Claw Staff', ring: 'Ring Staff', crystal: 'Crystal Staff', brazier: 'Brazier Staff', crescent: 'Moon Staff', sun: 'Sun Staff', gnarlorb: 'Rootwood Staff', faces: 'Totem Pole', bird: 'Thunderbird Totem', horns: 'Horned Totem', feathers: 'Feathered Totem', mask: 'Spirit Mask Totem', antlers: 'Antler Totem', crook: 'Crook', crow: 'Crow-Skull Crook', antler: 'Antler Staff', lantern: 'Lantern Crook', thorn: 'Thorn Crook', cage: 'Bone Cage Staff' };
  return { g, form: names[sub] };
}

// ------------------------------------------------------------------ wands (across: the grip at the origin)
export function wand(r, R, M, theme) {
  const g = new THREE.Group(), L = range(r, 15, 19), gm = R >= 2 ? M.trim : M.metal2;
  const necro = theme === 'necro';
  const sub = pick(r, necro ? upto(['bone', 'skull', 'claw', 'spine', 'hand', 'ribs'], R, [2, 3, 4, 5, 6, 6]) : upto(['star', 'moon', 'planet', 'comet', 'sun', 'stars'], R, [2, 3, 4, 5, 6, 6]));
  const shaftM = necro ? M.bone : gm;
  if (necro && (sub === 'spine' || sub === 'bone')) { for (let y = -4; y < L; y += 3) g.add(cyl(0.7, 0.6, y, y + 2.6, M.bone, 7), ball(0.95, y + 2.8, M.bone, 7)); }
  else g.add(cyl(0.75, 0.6, 3.5, L, shaftM, 8));
  g.add(cyl(0.95, 0.95, -4, 3.5, M.grip), ball(1.2, -5, gm, 8), band(0.95, 4, gm, 0.8));
  const c = L + 3.5;
  if (sub === 'bone') g.add(put(ball(1.8, 0, M.bone, 10), 0, L + 1.5));
  if (sub === 'skull' || sub === 'ribs') { const sk = ball(3, 0, M.bone, 14); sk.scale.set(1, 1.05, 1.1); g.add(put(sk, 0, c), put(box(3.2, 1.8, 2.6, M.bone), 0, c - 2.6, 0.6)); for (const x of [-1.15, 1.15]) g.add(put(ball(1, 0, M.dark, 8), x, c, 2.5), put(ball(0.55, 0, M.glow, 6), x, c, 3.2)); }
  if (sub === 'ribs') for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.add(tube([[0, L - 4 - i * 2.5, 0], [s * 2.5, L - 4.5 - i * 2.5, 1.4], [s * 1.6, L - 6 - i * 2.5, 2.4]], 0.3, M.bone, 8, 4));
  if (sub === 'claw' || sub === 'hand') { g.add(put(ball(2.2, 0, sub === 'claw' ? M.gem : M.glow, 12), 0, c)); for (let i = 0; i < (sub === 'hand' ? 5 : 4); i++) { const a = i / (sub === 'hand' ? 5 : 4) * PI * 2; g.add(tube([[0, L, 0], [Math.cos(a) * 2.6, c - 1, Math.sin(a) * 2.6], [Math.cos(a) * 1.3, c + 2.6, Math.sin(a) * 1.3]], 0.35, M.bone, 10, 4)); } }
  if (sub === 'spine') g.add(put(ball(1.8, 0, M.glow, 10), 0, L + 1.5));
  if (sub === 'star' || sub === 'stars') { const st = []; for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2, rr = i % 2 ? 1.6 : 4.4; st.push([Math.sin(a) * rr, c + Math.cos(a) * rr]); } g.add(slab(st, 0.9, sub === 'stars' ? M.glow2 : gm, 0.2), put(ball(1, 0, M.glow, 8), 0, c, 0.6)); }
  if (sub === 'stars') for (const [x, y] of [[-3.4, L - 1], [3.6, L + 1], [2.6, c + 4]]) g.add(put(ball(0.7, 0, M.glow, 6), x, y), tube([[0, c, 0], [x, y, 0]], 0.12, M.glow, 2, 3));
  if (sub === 'moon') { const m = []; for (let i = 0; i <= 12; i++) { const a = -2.2 + i / 12 * 4.4; m.push([Math.sin(a) * 4, c - 1.5 - Math.cos(a) * 4]); } for (let i = 12; i >= 0; i--) { const a = -1.9 + i / 12 * 3.8; m.push([Math.sin(a) * 3, c - 0.5 - Math.cos(a) * 3.2]); } g.add(slab(m, 0.8, gm, 0.2), put(ball(1.1, 0, M.glow, 8), 0, c - 1)); }
  if (sub === 'planet') { g.add(put(ball(2.6, 0, M.gem, 14), 0, c)); const ring = torus(4, 0.35, gm, 28); ring.rotation.set(1.2, 0, 0.4); g.add(put(ring, 0, c)); }
  if (sub === 'comet') { g.add(put(ball(1.8, 0, M.glow2, 12), 0, c + 1)); for (let i = 0; i < 3; i++) g.add(tube([[0, c + 1, 0], [(i - 1) * 1.2, c - 3, -0.5], [(i - 1) * 2, c - 7, -1]], 0.5 - i * 0.1, M.glow, 10, 5)); }
  if (sub === 'sun') { g.add(put(ball(2.2, 0, M.glow, 12), 0, c)); for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; g.add(spike(0.5, i % 2 ? 1.6 : 2.8, gm, [Math.sin(a) * 2.6, c + Math.cos(a) * 2.6, 0], [Math.sin(a), Math.cos(a), 0], 4)); } }
  if (R >= 2) jewel(g, M, [0, 5.2, 0.9], 0.7);
  if (R >= 3) { g.add(band(0.8, 9, M.glow, 0.5), band(0.75, 12, M.glow, 0.5)); }
  if (R >= 4) halo(g, M, [0, c, 0], 4.6, 1.4);
  if (R >= 5) shards(g, M, [0, c, 0], 6, 5, r, 0.7);
  mark(g, 'head', 0, c, 0, 4.5); mark(g, 'tip', 0, c + 4); mark(g, 'l0', 0, 5); mark(g, 'l1', 0, L); mark(g, 'slot', 0, c, 3); mark(g, 'slot', 0, 5.2, 1); mark(g, 'slot', 0, -5, 1.2);
  const names = { bone: 'Bone Wand', skull: 'Skull Wand', claw: 'Claw Wand', spine: 'Spine Rod', hand: 'Grasping Wand', ribs: 'Ribcage Wand', star: 'Star Wand', moon: 'Moon Wand', planet: 'Planet Rod', comet: 'Comet Wand', sun: 'Sun Rod', stars: 'Constellation Wand' };
  return { g, form: names[sub] };
}

// ------------------------------------------------------------------ the Ranger: bows (clutched, limbs along Y) and arrows (hang)
export function longbow(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['self', 'recurve', 'composite', 'elven', 'bone', 'crystal'], R, [2, 3, 4, 5, 6, 6]));
  const H = range(r, 50, 58), bend = range(r, 10, 14), pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = -1 + i / 8, a = Math.abs(t);
    let x = -bend * t * t + (a > 0.78 ? (a - 0.78) ** 2 * (type === 'recurve' || type === 'composite' ? 150 : 84) : 0);
    pts.push([x, t * H, 0]);
  }
  const limbM = type === 'bone' ? M.bone : type === 'crystal' ? M.glow : type === 'composite' ? M.metal2 : M.wood;
  g.add(tube(pts, type === 'composite' ? 1.3 : 1.05, limbM, 56, 6), cyl(1.5, 1.5, -4.5, 4.5, M.grip));
  if (type === 'elven') for (const s of [-1, 1]) { const b = []; for (let i = 0; i <= 6; i++) { const t = s * (0.25 + i * 0.1), p = pts[Math.round((t + 1) * 8)]; b.push([p[0] - 1.5 - Math.sin(i / 6 * PI) * 2.4, p[1]]); } const blade = [...b, ...pts.filter((p) => Math.sign(p[1]) === s && Math.abs(p[1]) > H * 0.24 && Math.abs(p[1]) < H * 0.86).map((p) => [p[0], p[1]]).sort((a, c) => s * (c[1] - a[1]))]; if (blade.length > 3) g.add(slab(blade, 0.4, M.metal, 0.15)); }
  const gm = R >= 2 ? M.trim : M.metal2;
  for (const s of [-1, 1]) g.add(put(ball(1.1, 0, gm, 8), pts[0][0], H * s));
  if (R >= 1) for (const s of [-1, 1]) g.add(put(band(1.4, 0, gm, 0.8), 0, s * 5));
  const strM = R >= 4 ? M.glow : solid(0x7a7060, 0, 0.7, 1, 'other');
  g.add(put(cyl(0.48, 0.48, -H, H, strM, 4), pts[0][0]));
  if (R >= 2) jewel(g, M, [-0.8, 0, 1.3], 0.8);
  if (R >= 3) for (const s of [-1, 1]) g.add(tube(pts.slice(s > 0 ? 9 : 1, s > 0 ? 15 : 7).map(([x, y]) => [x - 1.1, y, 0.6]), 0.3, M.glow, 16, 4));
  if (R >= 5) { shards(g, M, [-6, 0, 0], 10, 6, r, 0.8); halo(g, M, [0, 0, 0], 4, 0.2, PI / 2); }
  mark(g, 'head', -6, 0, 0, H * 0.6); mark(g, 'tip', pts[0][0], H); mark(g, 'l0', pts[0][0], -H * 0.9); mark(g, 'l1', pts[0][0], H * 0.9);
  mark(g, 'slot', -0.8, 0, 1.4); mark(g, 'slot', pts[4][0], pts[4][1], 1); mark(g, 'slot', pts[12][0], pts[12][1], 1);
  return { g, grip: [0, 0], form: { self: 'Longbow', recurve: 'Recurve Bow', composite: 'Composite Bow', elven: 'Leafblade Bow', bone: 'Bone Bow', crystal: 'Crystal Bow' }[type] };
}
export function arrow(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['broad', 'bodkin', 'barbed', 'crescent', 'fire', 'crystal'], R, [2, 3, 4, 5, 6, 6]));
  g.add(cyl(0.65, 0.65, -9, 24, M.wood, 6), cyl(0.8, 0.8, -9.6, -8.6, M.metal2, 6));
  const hm = type === 'crystal' ? M.glow : M.metal;
  if (type === 'broad') g.add(slab([[0, 24], [2.4, 25.4], [0, 30.5], [-2.4, 25.4]], 0.5, hm, 0.2));
  if (type === 'bodkin') g.add(put(cone(1.2, 6, hm, 4), 0, 27));
  if (type === 'barbed') g.add(slab([[0, 23], [1, 24], [3, 23], [1.4, 26], [0, 31], [-1.4, 26], [-3, 23], [-1, 24]], 0.5, hm, 0.2));
  if (type === 'crescent') g.add(slab([[0, 24], [3.4, 29], [2, 27.6], [0, 26.8], [-2, 27.6], [-3.4, 29]], 0.5, hm, 0.2));
  if (type === 'fire') { g.add(put(cone(1.3, 5, hm, 4), 0, 27.5), put(cyl(1.4, 1.4, -2, 2, solid(0x5a3a24, 0, 0.9, 1, 'other'), 7), 0, 22)); for (let i = 0; i < 3; i++) { const f = oct(1.2 - i * 0.2, i ? M.glow2 : M.glow); f.scale.y = 2; g.add(put(f, (i - 1) * 0.6, 22.5 + i * 1.5, 0.4)); } }
  if (type === 'crystal') { const c = oct(1.8, M.glow); c.scale.y = 2.4; g.add(put(c, 0, 27.5)); }
  const fl = pick(r, [[0xc8c0b0, 0xb02a22], [0x2a2a2a, 0xe0d8c8], [0x3a6a3a, 0xc8c0b0], [0x2a3a8a, 0xd8d0c0], [0xe0b030, 0x7a2a2a]]);
  for (let i = 0; i < 3; i++) { const f = slab([[0, -8.6], [2.6, -7.4], [2.6, -2.8], [0, -1.6]], 0.25, solid(i ? fl[1] : fl[0], 0, 0.8, 1, 'other'), 0); f.rotation.y = i * 2 * PI / 3; g.add(f); }
  if (R >= 2) g.add(band(0.85, 19, M.trim, 0.8));
  if (R >= 3) g.add(band(0.75, 10, M.glow, 0.6), band(0.75, 14, M.glow, 0.6));
  if (R >= 5) shards(g, M, [0, 27, 0], 4, 4, r, 0.5);
  mark(g, 'head', 0, 27, 0, 4); mark(g, 'tip', 0, 31); mark(g, 'l0', 0, 0); mark(g, 'l1', 0, 24); mark(g, 'slot', 0, 19, 0.9); mark(g, 'slot', 0, 12, 0.7);
  return { g, form: { broad: 'Broadhead Arrow', bodkin: 'Bodkin Arrow', barbed: 'Barbed Arrow', crescent: 'Crescent Arrow', fire: 'Fire Arrow', crystal: 'Crystal Arrow' }[type] };
}

// ------------------------------------------------------------------ the Gunner: pistols (hang: the hand on the grip, barrel +Y, the top +X) and bombs (palm)
export function pistol(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['flintlock', 'long', 'blunderbuss', 'double', 'pepperbox', 'dragon', 'arcane'], R, [2, 3, 4, 5, 6, 7]));
  const wood = M.wood, steel = M.metal, brass = R >= 2 ? M.trim : M.metal2, len = type === 'long' ? 25 : range(r, 18, 22);
  g.add(slab([[0.8, 8], [1.6, 8], [1.6, 1.6], [0.6, -0.6], [-0.6, -1.6], [-1.8, -1.2], [-1.6, 0.4], [-0.8, 3.4], [0.4, 5]], 1.7, wood, 0.4));
  g.add(put(box(1.4, 3.4, 2.6, steel), 1.8, 1.6), put(box(2.2, 1, 0.8, steel), 3.6, 0.4));
  const guard = torus(1.3, 0.25, brass, 12); guard.geometry.dispose(); guard.geometry = new THREE.TorusGeometry(1.3, 0.25, 5, 12, PI); guard.rotation.z = PI / 2; g.add(put(guard, -0.2, 2.4));
  const barrel = (x, z = 0, rr = 1.15) => { g.add(put(cyl(rr + 0.05, rr, 1, len, steel, 10), x, 0, z), put(cyl(rr + 0.45, rr + 0.25, -0.9, 0.9, brass, 10), x, len - 0.4, z)); };
  if (type === 'double') { barrel(2, -0.9, 1); barrel(2, 0.9, 1); }
  else if (type === 'pepperbox') { for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; g.add(put(cyl(0.7, 0.7, 1, len * 0.6, steel, 8), 2.5 + Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3)); } g.add(put(cyl(2.2, 2.2, -0.6, 0.6, brass, 12), 2.5, len * 0.6)); }
  else barrel(2.5);
  if (type === 'blunderbuss') g.add(lathe([[1.2, len - 2], [2.4, len + 0.5], [3, len + 1]], brass, 14)).children.at(-1).position.x = 2.5;
  if (type === 'dragon') { const h = new THREE.Group(); h.position.set(2.5, len + 0.5, 0); h.add(ball(1.9, 0, brass, 10), spike(0.8, 2.6, brass, [0, 0.8, 0], [0.2, 1, 0], 5)); for (const s of [-1, 1]) h.add(spike(0.5, 2.6, M.bone, [-0.6, 0, s * 1.2], [-1, 0.6, s * 0.4], 4), put(ball(0.4, 0, M.glow, 6), 0.8, 0.6, s * 1.2)); g.add(h); }
  if (type === 'arcane') { for (let i = 0; i < 4; i++) g.add(put(torus(1.7, 0.25, M.glow, 14), 2.5, 6 + i * 3.5).rotateX(PI / 2)); }
  if (R >= 1) g.add(put(cyl(1.4, 1.4, -0.5, 0.5, brass, 10), 2.5, 8.6));
  if (R >= 2) jewel(g, M, [-0.4, 2.6, 1.1], 0.6);
  if (R >= 3) runes(g, M, 2.5, 10, len - 2, 1.2, 1.25, 3);
  if (R >= 5) { shards(g, M, [2.5, len, 0], 4, 4, r, 0.6); }
  mark(g, 'head', 2.5, len, 0, 3); mark(g, 'tip', 2.5, len + 1); mark(g, 'slot', -0.4, 2.6, 1); mark(g, 'slot', 2.5, 12, 1.2); mark(g, 'slot', -1, -0.6, 1);
  if (R < 3) { mark(g, 'l0', 2.5, 4); mark(g, 'l1', 2.5, len); }
  return { g, form: { flintlock: 'Flintlock', long: 'Long Pistol', blunderbuss: 'Blunderbuss Pistol', double: 'Twin-Barrel Pistol', pepperbox: 'Pepperbox', dragon: 'Dragon Pistol', arcane: 'Arcane Pistol' }[type] };
}
export function bomb(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['round', 'grenade', 'flask', 'spiked', 'skull', 'arcane'], R, [2, 3, 4, 5, 6, 6]));
  const brass = R >= 2 ? M.trim : M.metal2, spark = glow(0xffd040, 3.2);
  let top = 5.4;
  if (type === 'round' || type === 'spiked') { g.add(ball(4.2, 0, M.metal2, 18)); if (type === 'spiked') for (const d of fib(12)) g.add(spike(0.6, 2, M.metal, [d[0] * 4, d[1] * 4, d[2] * 4], d, 5)); }
  if (type === 'grenade') { g.add(ball(4, 0, M.metal2, 14)); for (let i = 0; i < 6; i++) g.add(put(torus(4.05 * Math.cos((i - 2.5) / 6 * PI * 0.9), 0.25, M.metal, 20), 0, 4.05 * Math.sin((i - 2.5) / 6 * PI * 0.9)).rotateX(PI / 2)); }
  if (type === 'flask') { g.add(lathe([[0.1, -4], [3.6, -3.6], [4, -1], [2.4, 2.4], [1.4, 3.6], [1.4, 5]], solid(0x9ab0b8, 0.3, 0.05, 1.6, 'other'), 18), put(ball(3, 0, M.glow, 14), 0, -1.4)); top = 6.4; g.add(put(cyl(1.6, 1.6, 4.6, 6.2, M.wood, 10))); }
  if (type === 'skull') { const s = ball(4, 0, M.bone, 16); s.scale.set(1, 1, 1.05); g.add(s, put(box(3.6, 2, 2.6, M.bone), 0, -3.4, 1)); for (const x of [-1.4, 1.4]) g.add(put(ball(1.1, 0, M.glow, 8), x, 0, 3.5)); }
  if (type === 'arcane') { g.add(ball(3.6, 0, M.metal2, 16)); for (const [rx, rz] of [[1.2, 0.3], [0.3, 1.2], [-0.6, -0.4]]) { const t = torus(4.4, 0.3, M.glow, 28); t.rotation.set(rx, 0, rz); g.add(t); } }
  if (type !== 'flask') g.add(cyl(1.4, 1.5, 3.6, top, brass, 10), band(1.6, 4, brass, 0.4));
  g.add(tube([[0, top - 0.2, 0], [0.4, top + 1.4, 0.3], [1.6, top + 2.4, 0.6], [2.6, top + 2.8, 0.4]], 0.4, solid(0xd8c090, 0, 0.9, 1, 'other'), 10, 5));
  g.add(put(oct(1.3, spark), 2.9, top + 3, 0.4), put(ball(0.75, 0, glow(0xff5a10, 2.6), 6), 2.7, top + 2.9, 0.4));
  if (R >= 2) jewel(g, M, [0, 0, 4.2], 0.8);
  if (R >= 3 && type !== 'arcane') for (const s of [-1, 1]) g.add(put(torus(4.25, 0.2, M.glow, 28), 0, s * 1.6).rotateX(PI / 2));
  if (R >= 5) shards(g, M, [0, 0, 0], 6.5, 5, r, 0.7);
  mark(g, 'head', 0, 0, 0, 4.5); mark(g, 'tip', 2.9, top + 3); mark(g, 'slot', 0, 0, 4.2); mark(g, 'slot', -2.6, 1.4, 3.2); mark(g, 'slot', 2.4, -1.8, 3.4);
  return { g, grip: [0, 2.5], form: { round: 'Black Powder Bomb', grenade: 'Grenade', flask: 'Fire Flask', spiked: 'Spiked Mine', skull: 'Skull Bomb', arcane: 'Arcane Charge' }[type] };
}

// ------------------------------------------------------------------ the Bard: lutes (hang: the hand on the neck by the pegbox, the body +Y, the top +Z) and percussion (clutch)
export function lute(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['lute', 'mandolin', 'fiddle', 'cittern', 'harp-lute', 'starlute'], R, [2, 3, 4, 5, 6, 6]));
  const wood = M.wood, top = solid(pick(r, [0xd8b880, 0xc8a070, 0xe0c898, 0x8a5a38]), 0, 0.6, 1, 'other'), dark = solid(0x24160c, 0, 0.7, 1, 'other');
  const bw = range(r, 5.6, 7) * (type === 'mandolin' ? 0.9 : 1), by = 21;
  let outline;
  if (type === 'fiddle') outline = smooth([[0, by + 9], [4.4, by + 7.5], [4.8, by + 4], [3, by + 1], [4.8, by - 2.5], [4.6, by - 5.5], [0, by - 7], [-4.6, by - 5.5], [-4.8, by - 2.5], [-3, by + 1], [-4.8, by + 4], [-4.4, by + 7.5]], 4);
  else if (type === 'cittern') outline = smooth([[0, by + 8.5], [bw, by + 4], [bw * 0.9, by - 2], [3, by - 6], [-3, by - 6], [-bw * 0.9, by - 2], [-bw, by + 4]], 4);
  else outline = smooth([[0, by + 8.4], [bw * 0.72, by + 6.6], [bw, by + 1.6], [bw * 0.86, by - 3.4], [bw * 0.5, by - 7.4], [1.4, by - 9.6], [-1.4, by - 9.6], [-bw * 0.5, by - 7.4], [-bw * 0.86, by - 3.4], [-bw, by + 1.6], [-bw * 0.72, by + 6.6]], 4);
  const back = ball(1, 0, wood, 18); back.scale.set(bw * 0.95, 7.6, type === 'fiddle' || type === 'cittern' ? 1.6 : 3.4); back.position.set(0, by, -1.6);
  g.add(back, put(new THREE.Mesh(new THREE.ShapeGeometry(shape(outline)), top), 0, 0, 1.55), slab(outline, 1.6, wood, 0.2, 0.7));
  if (type === 'fiddle') { for (const s of [-1, 1]) g.add(put(box(0.4, 3.2, 0.1, dark), s * 1.8, by, 1.62)); g.add(put(box(4, 0.8, 1, dark), 0, by - 3, 1.9)); }
  else { const hr = type === 'mandolin' ? 1.4 : 1.9; g.add(put(new THREE.Mesh(new THREE.CircleGeometry(hr, 18), dark), 0, by + 0.4, 1.6), put(torus(hr + 0.4, 0.35, R >= 2 ? M.trim : M.metal2, 20), 0, by + 0.4, 1.65)); }
  g.add(put(box(4.4, 0.9, 0.7, dark), 0, by + 5.4, 1.85), put(box(2.2, 13, 1.4, wood), 0, 5.5, 0.6), put(box(1.9, 12, 0.35, dark), 0, 6, 1.45));
  if (type === 'harp-lute') { g.add(tube([[-bw, by + 2, 0], [-bw - 3, by - 6, 0], [-3, 2, 0]], 0.6, R >= 2 ? M.trim : M.metal2, 20, 5)); for (let i = 0; i < 4; i++) g.add(put(cyl(0.12, 0.12, 0, 10 + i * 2, solid(0xf0e8d0, 0.4, 0.3, 1, 'other'), 3), -bw - 1 + i, by - 9 - i * 1.5)); }
  const peg = put(box(2, 5.4, 1.3, wood), 0, -2.2, -0.8); peg.rotation.x = -0.9; g.add(peg);
  for (const y of [-1, -2.6, -4]) for (const s of [-1, 1]) g.add(put(box(1.7, 0.6, 0.6, dark), s * 1.4, y, -0.5 + y * 0.6));
  if (type === 'starlute') { const st = []; for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2, rr = i % 2 ? 1.2 : 3; st.push([Math.sin(a) * rr, by + 0.4 + Math.cos(a) * rr]); } g.add(slab(st, 0.4, M.glow, 0.1, 1.7)); }
  if (R >= 1) studs(g, R >= 2 ? M.trim : M.metal2, [[-bw * 0.6, by - 4, 1.6], [bw * 0.6, by - 4, 1.6]], 0.45);
  if (R >= 2) jewel(g, M, [0, by - 5, 1.7], 0.7);
  if (R >= 3) for (let i = 0; i < 4; i++) g.add(put(box(0.12, 22, 0.1, M.glow), (i - 1.5) * 0.4, 13, 1.75));
  if (R >= 4) for (const s of [-1, 1]) jewel(g, M, [s * bw * 0.55, by + 4.5, 1.7], 0.55);
  if (R >= 5) { shards(g, M, [0, by, 0], bw + 4, 5, r, 0.6); halo(g, M, [0, by + 0.4, 1.7], 3, 0); }
  mark(g, 'head', 0, by, 0, bw + 1); mark(g, 'tip', 0, by + 8.4); mark(g, 'l0', 0, 2); mark(g, 'l1', 0, by + 5); mark(g, 'slot', 0, by - 5, 1.7); mark(g, 'slot', -bw * 0.55, by + 4.5, 1.7); mark(g, 'slot', bw * 0.55, by + 4.5, 1.7);
  return { g, form: { lute: 'Lute', mandolin: 'Mandolin', fiddle: 'Fiddle', cittern: 'Cittern', 'harp-lute': 'Harp-Lute', starlute: 'Starlute' }[type] };
}
export function percussion(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['tambourine', 'drum', 'bell', 'crescent', 'lyre', 'chimes'], R, [2, 3, 4, 5, 6, 6]));
  const gm = R >= 2 ? M.trim : M.metal2, jm = M.trim;
  let grip = [0, 6.2];
  if (type === 'tambourine' || type === 'drum') {
    const Rr = type === 'drum' ? range(r, 6.4, 7.2) : range(r, 5.8, 6.4), rim = new THREE.Mesh(new THREE.CylinderGeometry(Rr, Rr, type === 'drum' ? 3.4 : 2.8, 32, 1, true), M.wood); rim.material = M.wood; rim.rotation.x = PI / 2; M.wood.side = THREE.DoubleSide;
    g.add(rim, put(new THREE.Mesh(new THREE.CircleGeometry(Rr, 32), solid(pick(r, [0x8a6a48, 0x9a7a58, 0x6a4a30]), 0, 0.85, 1, 'other')), 0, 0, 1.4), put(torus(Rr, 0.5, M.wood, 32), 0, 0, 1.4));
    g.add(put(torus(Rr * 0.58, 0.45, solid(pick(r, [0xa02a28, 0x2a3a8a, 0xd8a030]), 0, 0.6, 1, 'other'), 28), 0, 0, 1.45));
    if (type === 'tambourine') for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2 + 0.3, j = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 1.4, 10), jm); j.position.set(Math.cos(a) * (Rr + 0.5), Math.sin(a) * (Rr + 0.5), 0.6); j.rotation.z = a; g.add(j); }
    for (const [x, c] of [[-1.2, 0xc0303a], [1.2, 0x3a60c0]]) g.add(put(slab([[0, 0], [0.8, 0], [1.2, -6], [0.2, -7], [0.6, -3]], 0.2, solid(c, 0, 0.8, 1, 'other'), 0), x, -Rr + 0.4, 0.4));
    grip = [0, Rr]; mark(g, 'head', 0, 0, 0, Rr); mark(g, 'slot', 0, 0, 1.6); mark(g, 'slot', Rr * 0.6, Rr * 0.4, 1.6); mark(g, 'slot', -Rr * 0.6, Rr * 0.4, 1.6);
  }
  if (type === 'bell') { g.add(lathe([[0.1, 5.4], [2.4, 5], [3.4, 2], [4, -2], [5, -4.4], [5.2, -5]], jm, 18), cyl(1, 1, 5, 11, M.wood, 8), ball(1.3, 11.4, gm, 8), put(ball(1.2, 0, M.metal2, 8), 0, -4.4)); grip = [0, 8]; mark(g, 'head', 0, 0, 0, 5); mark(g, 'slot', 0, 1, 3.8); mark(g, 'slot', 0, 9, 1); }
  if (type === 'crescent') { const m = []; for (let i = 0; i <= 14; i++) { const a = -2.4 + i / 14 * 4.8; m.push([Math.sin(a) * 7, -Math.cos(a) * 7]); } for (let i = 14; i >= 0; i--) { const a = -2.1 + i / 14 * 4.2; m.push([Math.sin(a) * 5, 1 - Math.cos(a) * 5.4]); } g.add(slab(m, 1.4, M.wood, 0.3)); for (let i = 0; i < 6; i++) { const a = -2 + i / 5 * 4, j = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.2, 10), jm); j.position.set(Math.sin(a) * 6, -Math.cos(a) * 6, 0.9); j.rotation.x = PI / 2; g.add(j); } grip = [0, -6]; mark(g, 'head', 0, -3, 0, 7); mark(g, 'slot', 0, -6, 1); mark(g, 'slot', 4.4, -4, 1); mark(g, 'slot', -4.4, -4, 1); }
  if (type === 'lyre') { for (const s of [-1, 1]) g.add(tube([[s * 1.5, -5, 0], [s * 5, -2, 0], [s * 4.6, 4, 0], [s * 6, 8, 0]], 0.7, gm, 20, 6)); g.add(put(box(13, 1, 1, gm), 0, 6), put(box(5, 2, 2, M.wood), 0, -5.4)); for (let i = 0; i < 6; i++) g.add(put(cyl(0.12, 0.12, -4.4, 6, solid(0xf0e8d0, 0.4, 0.3, 1, 'other'), 3), -2.5 + i, 0)); grip = [0, -5.4]; mark(g, 'head', 0, 1, 0, 6); mark(g, 'slot', 0, 6, 0.8); mark(g, 'slot', -4.6, 4, 0.8); mark(g, 'slot', 4.6, 4, 0.8); }
  if (type === 'chimes') { g.add(put(box(10, 1, 1.4, gm), 0, 6), cyl(0.8, 0.8, 6, 11, M.wood, 8)); for (let i = 0; i < 5; i++) g.add(put(cyl(0.6, 0.6, -2 - i * 1.2, 0, jm, 8), -4 + i * 2, 5.4), put(cyl(0.1, 0.1, 0, 0.6, M.dark, 3), -4 + i * 2, 5.4)); grip = [0, 9]; mark(g, 'head', 0, 2, 0, 5); mark(g, 'slot', 0, 6, 0.8); mark(g, 'slot', -4, 6, 0.8); mark(g, 'slot', 4, 6, 0.8); }
  if (R >= 2) jewel(g, M, [0, type === 'bell' ? 1 : 0, type === 'bell' ? 3.9 : 1.6], 0.8);
  if (R >= 3 && (type === 'tambourine' || type === 'drum')) g.add(put(torus(3, 0.25, M.glow, 24), 0, 0, 1.5));
  if (R >= 4) halo(g, M, [0, 0, 0], 8, 0.1);
  if (R >= 5) shards(g, M, [0, 0, 0], 9, 5, r, 0.6);
  mark(g, 'tip', 0, 6); mark(g, 'l0', -4, 0); mark(g, 'l1', 4, 0);
  return { g, grip, form: { tambourine: 'Tambourine', drum: 'Frame Drum', bell: 'Handbell', crescent: 'Crescent Jingle', lyre: 'Lyre', chimes: 'Chimes' }[type] };
}

// ------------------------------------------------------------------ the Boomerang Knight: boomerangs (clutch, held by the end of an arm, the face +Z)
export function boomerang(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['vee', 'banana', 'hook', 'tri', 'cross', 'wing'], R, [2, 3, 4, 5, 6, 6]));
  const paint = solid(pick(r, [0x2ab8a0, 0xc8402a, 0x3a5ac8, 0xd8a030, 0x8a3ab8, 0x2a2a2a]), 0.2, 0.45, 1, 'other');
  const mat0 = R >= 4 ? M.metal : M.wood, arm = (pts, w) => {
    const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => V(x, y)), false, 'centripetal', 0.2), N = 30, rim = [], inn = [], mid = [], midb = [];
    for (let i = 0; i <= N; i++) { const t = i / N, p = c.getPointAt(t), d = c.getTangentAt(t), n = V(-d.y, d.x), ww = w * (0.6 + 0.4 * Math.sin(PI * t)), m = w * 0.45 * Math.sin(PI * t) ** 0.5; rim.push([p.x + n.x * ww, p.y + n.y * ww]); inn.push([p.x - n.x * ww, p.y - n.y * ww]); if (t > 0.08 && t < 0.92) { mid.push([p.x + n.x * m, p.y + n.y * m]); midb.push([p.x - n.x * m, p.y - n.y * m]); } }
    g.add(slab([...rim, ...inn.reverse()], 1.1, mat0, 0.35), slab([...mid, ...midb.reverse()], 0.3, R >= 3 ? M.glow : paint, 0, 0.75));
    if (R >= 4) g.add(tube(rim.map(([x, y]) => [x, y, 0]), 0.3, M.trim, 30, 4));
    return c;
  };
  let grip = [-13.4, 9.6];
  if (type === 'vee') arm([[-15, 11], [-6, 3.6], [0, -0.4], [6, 3.6], [15, 11]], 2.5);
  if (type === 'banana') arm([[-15, 6], [-8, 1], [0, -0.6], [8, 1], [15, 6]], 2.4), grip = [-13.6, 5.2];
  if (type === 'hook') { arm([[-15, 11], [-6, 3.6], [0, -0.4], [6, 3.6], [14, 9]], 2.5); g.add(tube([[14, 9, 0], [16.5, 12, 0], [14.5, 14, 0]], 1.1, mat0, 12, 6)); }
  if (type === 'tri') { for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2 + PI / 2, b = a + 0.7; arm([[0, 0], [Math.cos(a) * 6, Math.sin(a) * 6], [Math.cos(b) * 12, Math.sin(b) * 12]], 2.1); } grip = [Math.cos(PI / 2 + 0.7) * 11, Math.sin(PI / 2 + 0.7) * 11]; }
  if (type === 'cross') { arm([[-13, 0], [0, 0.6], [13, 0]], 2.3); arm([[0, -13], [0.6, 0], [0, 13]], 2.3); grip = [-11.5, 0]; }
  if (type === 'wing') { arm([[-15, 11], [-6, 3.6], [0, -0.4], [6, 3.6], [15, 11]], 2.6); for (const s of [-1, 1]) g.add(slab(s > 0 ? [[4, 3], [10, 1], [13, 3], [9, 4.5]] : [[-9, 4.5], [-13, 3], [-10, 1], [-4, 3]], 0.6, M.trim, 0.2, 0.3)); }
  for (const p of type === 'cross' ? [[-13, 0], [13, 0], [0, -13], [0, 13]] : type === 'tri' ? [] : [[-15, type === 'banana' ? 6 : 11], [type === 'hook' ? 14.5 : 15, type === 'banana' ? 6 : type === 'hook' ? 14 : 11]]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.5, 12), R >= 2 ? M.trim : M.metal2); cap.rotation.x = PI / 2; g.add(put(cap, ...p)); }
  if (R >= 2) jewel(g, M, [0, type === 'banana' ? -0.4 : 0, 0.9], 0.8);
  if (R >= 5) { shards(g, M, [0, 3, 0], 12, 5, r, 0.6); halo(g, M, [0, 3, 0], 5, 0); }
  mark(g, 'head', 0, 3, 0, 12); mark(g, 'tip', 15, 11); mark(g, 'l0', -14, 9); mark(g, 'l1', 14, 9); mark(g, 'slot', 0, 0, 0.9); mark(g, 'slot', -7, 4, 0.9); mark(g, 'slot', 7, 4, 0.9);
  return { g, grip, form: { vee: 'Boomerang', banana: 'Hunting Boomerang', hook: 'Hook Boomerang', tri: 'Tri-Blade', cross: 'Cross Boomerang', wing: 'Winged Boomerang' }[type] };
}

// ------------------------------------------------------------------ shields (strapped to the forearm, the face +Z)
export function shield(r, R, M, theme) {
  const g = new THREE.Group();
  const forms = { holy: ['heater', 'kite', 'round', 'buckler', 'tower', 'oval'], dragon: ['heater', 'kite', 'round', 'spiked'], tower: ['tower', 'pavise', 'kite', 'oval'], buckler: ['buckler', 'spiked', 'targe'] }[theme];
  const type = pick(r, upto(forms, R, [2, 3, 4, 4, 6, 6]));
  const O = {
    heater: [[-13, 14.5], [0, 15.2], [13, 14.5], [13.2, 5], [11.4, -5], [7.4, -13], [0, -19.5], [-7.4, -13], [-11.4, -5], [-13.2, 5]],
    kite: [[0, 18.5], [6.6, 17.4], [10.6, 13], [11, 6], [9.4, -4], [6, -13], [0, -24], [-6, -13], [-9.4, -4], [-11, 6], [-10.6, 13], [-6.6, 17.4]],
    tower: [[0, 21], [7, 20], [11, 18.5], [11.4, 6], [11, -12], [9, -19], [0, -21], [-9, -19], [-11, -12], [-11.4, 6], [-11, 18.5], [-7, 20]],
    pavise: [[-11, 21], [-4, 19], [0, 21.5], [4, 19], [11, 21], [11.6, -18], [8, -21], [-8, -21], [-11.6, -18]],
    oval: Array.from({ length: 24 }, (_, i) => [Math.sin(i / 24 * PI * 2) * 11, Math.cos(i / 24 * PI * 2) * 16]),
  };
  const round = type === 'round' || type === 'buckler' || type === 'spiked' || type === 'targe', Rr = type === 'buckler' ? 7.6 : type === 'targe' ? 8.6 : type === 'spiked' ? 9 : 13;
  const out = round ? Array.from({ length: 40 }, (_, i) => [Math.cos(i / 40 * PI * 2) * Rr, Math.sin(i / 40 * PI * 2) * Rr]) : smooth(O[type], type === 'oval' ? 1 : 4);
  const K = round ? Rr * 4 : 110, ky = round ? Rr * 4 : 0;
  const field = theme === 'dragon' ? solid(pick(r, [0xa83a28, 0x6a1a14, 0x2a2a30, 0xc89020]), 0.45, 0.4, 1, 'other') : R === 0 ? M.wood : chance(r, 0.5) ? M.metal : solid(pick(r, [0xe9e3d6, 0x2a3a8a, 0x8a2a2a, 0x2a5a3a, 0x1a1a22, 0xc89030]), 0.15, 0.45, 1, 'other');
  const back = M.wood;
  g.add(put(new THREE.Mesh(bow(extrude(shape(out), 1.4, 0.35), K, ky), [field, back]), 0, 0, -1.4));
  const rim = shape(out); rim.holes.push(shape(inset(out, round ? 1.6 : 1.8).reverse()));
  const rimM = R >= 2 ? M.trim : M.metal2;
  g.add(put(new THREE.Mesh(bow(extrude(rim, 0.9, 0.3), K, ky), rimM), 0, 0, 0.05));
  const relief = (pts, d, m, z) => g.add(put(new THREE.Mesh(bow(extrude(shape(pts), d, 0.3), K, ky), m), 0, 0, z));
  const em = R >= 4 ? M.glow : rimM, cy = round ? 0 : type === 'heater' ? 2.5 : 4;
  const emblem = pick(r, theme === 'dragon' ? ['dragon', 'dragon', 'wing', 'eye'] : theme === 'buckler' ? ['boss', 'eye', 'star', 'spiral'] : ['cross', 'star', 'sun', 'chevron', 'quarter', 'boss']);
  if (emblem === 'cross') relief([[-1.6, cy + 10], [1.6, cy + 10], [1.6, cy + 1.6], [8.4, cy + 1.6], [8.4, cy - 1.6], [1.6, cy - 1.6], [1.6, cy - 14], [-1.6, cy - 14], [-1.6, cy - 1.6], [-8.4, cy - 1.6], [-8.4, cy + 1.6], [-1.6, cy + 1.6]], 0.5, em, 0.1);
  if (emblem === 'star' || emblem === 'sun') { const n = emblem === 'sun' ? 24 : 16, st = []; for (let i = 0; i < n; i++) { const a = i / n * PI * 2, rr = i % 2 ? (emblem === 'sun' ? 3.4 : 2.4) * Rr / 13 : 6.6 * Rr / 13; st.push([Math.sin(a) * rr, cy + Math.cos(a) * rr]); } relief(st, 0.6, em, 0.2); }
  if (emblem === 'chevron') relief([[-10, cy - 2], [0, cy + 6], [10, cy - 2], [10, cy - 6], [0, cy + 2], [-10, cy - 6]], 0.5, em, 0.1);
  if (emblem === 'quarter') { relief([[-12, cy], [0, cy], [0, cy + 16], [-12, cy + 16]], 0.3, solid(pick(r, [0x8a2a2a, 0x2a3a8a, 0xc8a040]), 0.1, 0.5, 1, 'other'), 0.05); relief([[0, cy], [12, cy], [12, cy - 22], [0, cy - 22]], 0.3, solid(0xe0d8c8, 0.1, 0.5, 1, 'other'), 0.05); }
  if (emblem === 'spiral') for (let i = 0; i < 3; i++) g.add(put(torus(1.5 + i * 1.8, 0.3, em, 24), 0, 0, 0.7 - i * 0.3));
  if (emblem === 'dragon') { relief(mirror([[0, 8], [2.4, 7.4], [4.2, 5.8], [4.8, 3], [3.6, 0.6], [3, -3], [2.2, -7], [1, -9.6], [0.01, -10]]).map(([x, y]) => [x * 1.3, y * 1.3 + cy]), 1.2, rimM, 0.3); for (const s of [-1, 1]) { const h = [[s * 2.6, 7.2], [s * 5, 9], [s * 8.4, 13.4], [s * 6.6, 9.2], [s * 4.2, 6]].map(([x, y]) => [x * 1.3, y * 1.3 + cy]); relief(s > 0 ? h : h.reverse(), 1, M.bone, 0.6); } for (const x of [-2.9, 2.9]) { const e = ball(1.1, 0, R >= 2 ? M.glow : M.dark, 8); e.scale.set(1.3, 0.6, 0.6); g.add(put(e, x, cy + 3.1, 2)); } }
  if (emblem === 'wing') for (const s of [-1, 1]) relief((s > 0 ? [[1, cy], [9, cy + 6], [10, cy + 2], [8, cy], [9, cy - 3], [1, cy - 2]] : [[-1, cy - 2], [-9, cy - 3], [-8, cy], [-10, cy + 2], [-9, cy + 6], [-1, cy]]), 0.6, em, 0.15);
  if (emblem === 'eye') { const e = ball(1, 0, M.glow, 12); e.scale.set(Rr * 0.22, Rr * 0.34, 0.8); g.add(put(e, 0, cy, 0.4), put(box(0.55, Rr * 0.45, 0.3, solid(0x140a06)), 0, cy, 1.15)); }
  if (emblem === 'boss' || round) { const b = new THREE.Mesh(new THREE.SphereGeometry(round ? Rr * 0.26 : 2.6, 14, 8, 0, PI * 2, 0, PI / 2), M.metal); b.rotation.x = PI / 2; b.scale.set(1, 0.7, 1); g.add(put(b, 0, cy, 0.5)); }
  if (type === 'spiked') { for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; g.add(spike(0.7, 2.6, M.metal2, [Math.cos(a) * (Rr - 0.4), Math.sin(a) * (Rr - 0.4), -Rr * Rr / K * 2], [Math.cos(a), Math.sin(a), 0], 5)); } g.add(spike(1.4, 3.6, M.metal2, [0, 0, 1.4], [0, 0, 1], 6)); }
  if (R >= 1) { const n = round ? 10 : 12; studs(g, rimM, inset(out, round ? 0.8 : 0.9).filter((_, i) => i % Math.ceil(out.length / n) === 0).map(([x, y]) => [x, y, 0.8 - (x * x) / K - (ky ? y * y / ky : 0)]), 0.45); }
  if (R >= 2) jewel(g, M, [0, cy, round ? Rr * 0.18 + 0.6 : 1.6], 1 + R * 0.1);
  if (R >= 4) for (const s of [-1, 1]) jewel(g, M, [s * (round ? Rr * 0.55 : 7), cy + (round ? 0 : 7), 0.6], 0.7);
  if (R >= 5) { shards(g, M, [0, cy, 1], round ? Rr + 3 : 15, 6, r, 0.8); halo(g, M, [0, cy, 1.5], round ? Rr * 0.55 : 6, 0); }
  mark(g, 'head', 0, cy, 1, round ? Rr : 14); mark(g, 'tip', 0, round ? Rr : 15); mark(g, 'l0', round ? -Rr : -12, cy + 4); mark(g, 'l1', round ? Rr : 12, cy + 4);
  mark(g, 'slot', 0, cy, 2); mark(g, 'slot', round ? -Rr * 0.55 : -7, cy + (round ? 0 : 7), 1); mark(g, 'slot', round ? Rr * 0.55 : 7, cy + (round ? 0 : 7), 1); mark(g, 'slot', 0, round ? -Rr * 0.6 : cy - 10, 1);
  return { g, grip: [0, round ? 0 : type === 'kite' ? 4 : type === 'tower' || type === 'pavise' ? 2 : 0], form: { heater: 'Heater Shield', kite: 'Kite Shield', round: 'Round Shield', buckler: 'Buckler', tower: 'Tower Shield', oval: 'Oval Shield', pavise: 'Pavise', spiked: 'Spiked Shield', targe: 'Targe' }[type] };
}

// ------------------------------------------------------------------ the Wizard's tomes (clutch, the cover +Z)
export function tome(r, R, M) {
  const g = new THREE.Group(), w = range(r, 9, 11), h = range(r, 12, 14.5), t = range(r, 2.8, 4);
  const cover = solid(pick(r, [[0x6a4a30, 0x5a3a28], [0x7a3a2a, 0x2a3a5a], [0xa82c2c, 0x2a3a8a, 0x2a5a3a], [0x8a1a1a, 0x1a1a5a, 0x4a1a5a, 0x1a1a1a], [0x2a0a3a, 0x0a1a3a, 0x3a0a0a], [0x0e0a14, 0xf0ecf8]][R]), 0, 0.55, 1, 'other');
  const pages = solid(R >= 3 ? 0xd8c8a0 : 0xc8bc9c, 0, 0.9, 1, 'other'), gm = R >= 2 ? M.trim : M.metal2;
  for (const s of [-1, 1]) g.add(put(box(w, h, 0.7, cover), 0, 0, s * (t / 2 - 0.35)));
  g.add(put(box(1, h, t, cover), -w / 2 + 0.5), put(box(w - 1.4, h - 1.2, t - 1.2, R >= 3 ? M.trim : pages), 0.5));
  if (R >= 1) for (const [x, y] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(put(box(2, 2, 0.4, gm), x * (w / 2 - 1), y * (h / 2 - 1), t / 2 + 0.1));
  g.add(put(box(1.6, 2.6, t + 0.4, gm), w / 2 - 0.3));
  const em = pick(r, ['circle', 'eye', 'star', 'skull', 'flame', 'rune']), ec = R >= 2 ? M.glow : gm, z = t / 2 + 0.15;
  if (em === 'circle') g.add(put(torus(2.6, 0.4, ec, 24), 0.6, 0.4, z), put(box(0.6, 3.8, 0.3, ec), 0.6, 0.4, z + 0.05));
  if (em === 'eye') { const e = ball(1, 0, ec, 10); e.scale.set(3, 1.6, 0.4); g.add(put(e, 0.6, 0.4, z)); g.add(put(ball(0.8, 0, M.dark, 8), 0.6, 0.4, z + 0.3)); }
  if (em === 'star') { const st = []; for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2, rr = i % 2 ? 1.1 : 3; st.push([0.6 + Math.sin(a) * rr, 0.4 + Math.cos(a) * rr]); } g.add(slab(st, 0.3, ec, 0.1, z)); }
  if (em === 'skull') { g.add(put(ball(2, 0, M.bone, 10), 0.6, 0.8, z - 0.8)); for (const x of [-0.7, 0.7]) g.add(put(ball(0.5, 0, R >= 2 ? M.glow : M.dark, 6), 0.6 + x, 0.9, z + 0.9)); }
  if (em === 'flame') { for (let i = 0; i < 3; i++) { const f = oct(1.3 - i * 0.25, i ? M.glow2 : ec); f.scale.y = 2; f.scale.z = 0.3; g.add(put(f, 0.6 + (i - 1) * 0.9, 0.4 + i * 0.6, z)); } }
  if (em === 'rune') for (const [x, y, a] of [[0, 2, 0], [0, -1, 0], [-1.2, 0.5, 0.8], [1.2, 0.5, -0.8]]) g.add(put(box(0.5, 3, 0.3, ec), 0.6 + x, 0.4 + y, z).rotateZ(a));
  if (R >= 2) g.add(put(box(1.6, h * 0.5, 0.2, solid(pick(r, [0xa02a28, 0x2a3a8a, 0x2a6a3a]), 0, 0.8, 1, 'other')), -1.5, -h / 2 - h * 0.15, 0));
  if (R >= 3) jewel(g, M, [0.6, -h / 2 + 2.6, z], 0.7);
  if (R >= 4) { g.add(tube([[w / 2, h / 2 - 2, 0], [w / 2 + 3, 0, 1], [w / 2 + 1.5, -h / 2, 1.5]], 0.25, gm, 14, 4)); }
  if (R >= 5) { const sg = put(torus(4.2, 0.3, M.glow, 32), 0.6, 0.4, z + 3); g.add(sg); shards(g, M, [0.6, 0.4, z + 2], 8, 5, r, 0.6); }
  mark(g, 'head', 0.6, 0.4, z, w * 0.6); mark(g, 'tip', 0, h / 2); mark(g, 'l0', -w / 2, -h / 2); mark(g, 'l1', w / 2, h / 2);
  mark(g, 'slot', 0.6, 0.4, z + 0.3); mark(g, 'slot', w / 2 - 0.3, 0, t / 2 + 0.3); mark(g, 'slot', 0.6, -h / 2 + 2.6, z);
  return { g, grip: [-w / 2 + 0.5, h / 2 - 2.5], form: pick(r, ['Spellbook', 'Grimoire', 'Tome', 'Codex']) };
}

// ------------------------------------------------------------------ orbs (palm: held in front of the hand)
export function orb(r, R, M, theme) {
  const g = new THREE.Group(), rr = range(r, 3.8, 4.8), gm = R >= 2 ? M.trim : M.metal2, astro = theme === 'astro';
  const sub = pick(r, astro ? upto(['armillary', 'planet', 'moonorb', 'starcage', 'orrery', 'sunorb'], R, [2, 3, 4, 5, 6, 6]) : upto(['talons', 'skullcage', 'ribcage', 'dark', 'eye', 'souls'], R, [2, 3, 4, 5, 6, 6]));
  const glass = new THREE.MeshStandardMaterial({ color: new THREE.Color(M.e).multiplyScalar(astro ? 0.5 : 0.18), emissive: new THREE.Color(M.e).multiplyScalar(astro ? 0.6 : 0.35), emissiveIntensity: 1, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.6 }); glass.userData.region = 'glow';
  if (sub !== 'armillary' && sub !== 'orrery') g.add(new THREE.Mesh(new THREE.SphereGeometry(rr, 20, 14), glass));
  g.add(put(ball(rr * 0.35, 0, M.glow, 10), -rr * 0.15, rr * 0.1, rr * 0.75), put(ball(rr * 0.15, 0, glow(0xffffff, 2), 6), -rr * 0.4, rr * 0.4, rr * 0.85));
  if (sub === 'talons' || sub === 'skullcage' || sub === 'ribcage') for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4, c = Math.cos(a), s = Math.sin(a); g.add(tube([[c * 1.2, -rr - 1.6, s * 1.2], [c * rr * 0.9, -rr * 0.9, s * rr * 0.9], [c * (rr + 0.4), -rr * 0.1, s * (rr + 0.4)], [c * rr * 0.85, rr * 0.4, s * rr * 0.85]], 0.55, M.bone, 12, 5)); }
  if (sub === 'skullcage') { g.add(put(ball(1.8, 0, M.bone, 10), 0, rr + 1.2)); for (const x of [-0.7, 0.7]) g.add(put(ball(0.45, 0, M.glow, 6), x, rr + 1.3, 1.6)); }
  if (sub === 'ribcage') for (let i = 0; i < 3; i++) g.add(put(torus(rr + 0.3, 0.3, M.bone, 24, PI), 0, (i - 1) * 2.2).rotateX(PI / 2));
  if (sub === 'dark' || sub === 'souls') for (let i = 0; i < (sub === 'souls' ? 5 : 0); i++) { const a = i / 5 * PI * 2; g.add(put(ball(0.6, 0, M.glow2, 6), Math.cos(a) * (rr + 1.6), Math.sin(a) * (rr + 1.6) * 0.6, Math.sin(a) * 1.5)); }
  if (sub === 'eye') { const e = ball(rr * 0.6, 0, glow(0xf0e0d0, 1.2), 12); e.scale.z = 0.5; g.add(put(e, 0, 0, rr * 0.6), put(ball(rr * 0.3, 0, M.dark, 10), 0, 0, rr * 0.85)); }
  if (sub === 'armillary' || sub === 'orrery') { g.add(new THREE.Mesh(new THREE.SphereGeometry(rr * 0.45, 16, 12), M.glow), cyl(0.3, 0.3, -rr - 1.2, rr + 1.2, gm, 6)); for (const [x, y] of [[PI / 2, 0], [0.5, 0.9], [-0.6, -0.4]]) { const t = torus(rr, 0.42, gm, 40); t.rotation.set(x, y, 0); g.add(t); } if (sub === 'orrery') for (let i = 0; i < 3; i++) { const a = i * 2.1; g.add(put(ball(0.8 + i * 0.2, 0, i % 2 ? M.gem : M.glow2, 8), Math.cos(a) * (rr + 1.4), Math.sin(a) * 1, Math.sin(a) * (rr + 1.4))); } }
  if (sub === 'planet' || sub === 'sunorb') { const t = torus(rr + 2, 0.5, sub === 'sunorb' ? M.glow : gm, 40); t.rotation.set(1.2, 0, 0.35); g.add(t); }
  if (sub === 'moonorb') { const m = ball(rr * 0.4, 0, solid(0xe8e4d8, 0, 0.7), 10); g.add(put(m, rr + 1.6, rr * 0.5, 0)); }
  if (sub === 'starcage') for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; g.add(tube([[0, -rr - 1, 0], [Math.cos(a) * (rr + 0.6), 0, Math.sin(a) * (rr + 0.6)], [0, rr + 1, 0]], 0.25, gm, 14, 4)); }
  if (!astro || sub === 'planet' || sub === 'moonorb' || sub === 'sunorb') g.add(put(down(cone(1.3, 2.4, gm, 6)), 0, -rr - 1.6));
  if (R >= 2) jewel(g, M, [0, -rr - 0.4, rr * 0.4], 0.6);
  if (R >= 4) halo(g, M, [0, 0, 0], rr + 3, 1.3, 0.3);
  if (R >= 5) shards(g, M, [0, 0, 0], rr + 5, 6, r, 0.7);
  mark(g, 'head', 0, 0, 0, rr + 1); mark(g, 'orbit', 0, 0, 0, rr + 2.5); mark(g, 'tip', 0, rr + 1); mark(g, 'slot', 0, -rr - 0.4, rr * 0.4); mark(g, 'slot', -rr * 0.6, rr * 0.4, rr * 0.7); mark(g, 'slot', rr * 0.6, -rr * 0.2, rr * 0.7);
  const names = { talons: 'Taloned Orb', skullcage: 'Skull Orb', ribcage: 'Ribcage Orb', dark: 'Void Orb', eye: 'Watching Orb', souls: 'Orb of Souls', armillary: 'Armillary Sphere', planet: 'Ringed World', moonorb: 'Moon Orb', starcage: 'Star Cage', orrery: 'Orrery', sunorb: 'Captured Sun' };
  return { g, grip: [0, astro ? 3 : 3.4], form: names[sub] };
}

// ------------------------------------------------------------------ the Death Knight's skulls (palm)
export function skull(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['plain', 'crystal', 'horned', 'crowned', 'helmed', 'lich'], R, [2, 3, 4, 5, 6, 6]));
  const bone = solid(pick(r, [0x7c8c9c, 0x9aa4ae, 0x8a8478, 0x6a7a8a]), 0, 0.45, 0.9, 'other'), hole = M.dark;
  const ice = new THREE.MeshStandardMaterial({ color: 0x48a8e0, emissive: new THREE.Color(M.e).multiplyScalar(0.6), emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.1 }); ice.userData.region = 'glow';
  const cr = ball(3.6, 0.6, bone, 16); cr.scale.set(1, 1, 1.1);
  g.add(cr, put(box(4, 2.2, 3, bone), 0, -2.8, 0.9), put(box(0.8, 1, 0.4, M.dark), 0, -1.1, 3.7));
  for (const x of [-1.4, 1.4]) g.add(put(ball(1.4, 0, hole, 8), x, 0.4, 2.8), put(ball(0.4, 0, M.glow, 6), x, 0.4, 4.1));
  if (type === 'crystal' || type === 'lich') for (const [x, y, z, l] of [[0, 5, 0, 6], [2.2, 4, -0.5, 4.6], [-2.2, 3.8, 0.6, 4.2], [3.2, 2.4, 0.5, 3.2]]) { const c = oct(1, ice); c.scale.set(0.95, l / 2, 0.95); c.position.set(x, y, z); c.rotation.z = -x * 0.25; g.add(c); }
  if (type === 'horned') for (const s of [-1, 1]) g.add(tube([[s * 2.6, 2.4, 0], [s * 5, 4.4, -0.5], [s * 6, 7.6, -1], [s * 5, 9.4, -1]], 0.8, M.bone, 16, 6));
  if (type === 'crowned' || type === 'lich') { g.add(put(lathe([[3.7, 0], [3.9, 1.4]], M.trim, 18), 0, 2.4)); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; g.add(spike(0.6, 2.4, M.trim, [Math.cos(a) * 3.6, 3.8, Math.sin(a) * 3.6], [0, 1, 0], 4)); } }
  if (type === 'helmed') { const h = new THREE.Mesh(new THREE.SphereGeometry(3.9, 16, 10, 0, PI * 2, 0, PI / 2), M.metal); h.position.y = 0.8; g.add(h, put(box(8, 0.6, 0.6, M.metal), 0, 1.2, 3), spike(0.6, 3, M.metal, [0, 4.6, 0], [0, 1, 0], 5)); }
  if (R >= 2) jewel(g, M, [0, 2.4, 3.4], 0.7);
  if (R >= 4) halo(g, M, [0, 6.5, 0], 3, 1.45);
  if (R >= 5) shards(g, M, [0, 1, 0], 7, 5, r, 0.7);
  mark(g, 'head', 0, 1, 0, 5); mark(g, 'orbit', 0, 1, 0, 6); mark(g, 'tip', 0, 6); mark(g, 'slot', -1.4, 0.4, 3.8); mark(g, 'slot', 1.4, 0.4, 3.8); mark(g, 'slot', 0, 2.4, 3.4);
  return { g, grip: [0, 3], form: { plain: 'Frost Skull', crystal: 'Rime Skull', horned: 'Horned Skull', crowned: 'Crowned Skull', helmed: 'Helmed Skull', lich: 'Lich Skull' }[type] };
}

// ------------------------------------------------------------------ the Totem Master's hand idols (clutch)
export function idol(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['post', 'winged', 'beast', 'stack', 'sun', 'spirit'], R, [2, 3, 4, 5, 6, 6]));
  const wood = M.wood, teal = solid(pick(r, [0x60c8b0, 0x3a8a6a, 0x4a7ac8]), 0.3, 0.6, 1, 'other'), red = solid(pick(r, [0xa83224, 0xc86a20, 0x8a2a6a]), 0, 0.7, 1, 'other');
  g.add(put(box(3.4, 4, 3, wood), 0, -3.4), put(box(4.4, 4.6, 3.4, teal), 0, 0.8), put(box(4, 0.8, 3.6, red), 0, -1.2));
  for (const x of [-1.1, 1.1]) g.add(put(box(1.1, 1, 0.4, M.glow), x, 1.6, 1.75));
  g.add(put(box(2.4, 0.7, 0.4, M.dark), 0, -0.2, 1.75));
  const head = new THREE.Group(); head.position.y = 4.8;
  head.add(box(3.6, 3, 3.2, wood), spike(0.9, 2.4, red, [0, -0.2, 1.5], [0, -0.4, 1], 4));
  for (const x of [-0.9, 0.9]) head.add(put(box(0.8, 0.7, 0.3, M.glow), x, 0.5, 1.65));
  if (type === 'winged' || type === 'spirit') for (const s of [-1, 1]) head.add(slab(s > 0 ? [[1.6, 0.8], [6, 3], [6.6, 0.8], [5, -0.4], [1.6, -0.8]] : [[-1.6, -0.8], [-5, -0.4], [-6.6, 0.8], [-6, 3], [-1.6, 0.8]], 0.6, teal, 0.2));
  if (type === 'beast') for (const s of [-1, 1]) head.add(tube([[s * 1.6, 1, 0], [s * 3.4, 3, 0], [s * 3, 5, 0]], 0.5, M.bone, 10, 5));
  if (type === 'stack') { head.add(put(box(4, 3, 3.4, red), 0, 3.2)); for (const x of [-1, 1]) head.add(put(box(0.8, 0.7, 0.3, M.glow), x, 3.4, 1.75)); }
  if (type === 'sun') { const s = put(new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.8, 16), teal), 0, 1, -1.8); s.rotation.x = PI / 2; head.add(s); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; head.add(spike(0.6, 2, red, [Math.cos(a) * 4.4, 1 + Math.sin(a) * 4.4, -1.8], [Math.cos(a), Math.sin(a), 0], 4)); } }
  g.add(head);
  if (R >= 1) for (let i = 0; i < 3; i++) g.add(put(ball(0.5, 0, solid(pick(r, [0xe8e0d0, 0xa83224, 0x2a6a8a]), 0, 0.5, 1, 'other'), 6), -2.3, -2 - i * 1.1, 0.4));
  if (R >= 2) jewel(g, M, [0, -3.4, 1.6], 0.6);
  if (R >= 4) halo(g, M, [0, 5, 0], 4, 1.45);
  if (R >= 5) shards(g, M, [0, 2, 0], 7, 5, r, 0.6);
  mark(g, 'head', 0, 3, 0, 5); mark(g, 'tip', 0, 7); mark(g, 'slot', 0, 0.8, 1.8); mark(g, 'slot', 0, 5.3, 1.7); mark(g, 'slot', 0, -3.4, 1.6);
  return { g, grip: [0, -3.6], form: { post: 'Hand Idol', winged: 'Winged Idol', beast: 'Beast Idol', stack: 'Twin-Face Idol', sun: 'Sun Idol', spirit: 'Spirit Idol' }[type] };
}

// ------------------------------------------------------------------ the Carrion Witch's lanterns (clutch, hanging from the hand)
export function lantern(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['box', 'round', 'hex', 'censer', 'skull', 'cage'], R, [2, 3, 4, 5, 6, 6]));
  const iron = M.metal2, gm = R >= 2 ? M.trim : M.metal2;
  const glassM = new THREE.MeshStandardMaterial({ color: new THREE.Color(M.e).multiplyScalar(0.5), emissive: M.e, emissiveIntensity: 1.4, roughness: 0.1 }); glassM.userData.region = 'glow';
  g.add(torus(1.5, 0.45, iron, 16));
  for (const y of [-2.4, -4]) { const l = torus(0.8, 0.3, iron, 10); l.position.y = y; l.rotation.y = y < -3 ? PI / 2 : 0; g.add(l); }
  const c = -11.4;
  if (type === 'box' || type === 'hex') { const n = type === 'hex' ? 6 : 4; const roof = cone(3.4, 2.6, gm, n); roof.rotation.y = PI / n; g.add(put(roof, 0, -6), put(new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.8, n), iron), 0, -7.4), put(new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.9, n), iron), 0, -15.4), put(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 7.2, n), glassM), 0, c)); for (let i = 0; i < n; i++) { const a = i / n * PI * 2 + PI / n; g.add(put(box(0.6, 8, 0.6, iron), Math.cos(a) * 2.8, c, Math.sin(a) * 2.8)); } }
  if (type === 'round') { g.add(lathe([[0.4, -6], [2.6, -8], [3.4, -11.4], [2.6, -14.6], [0.4, -16]], glassM, 18)); for (let i = 0; i < 4; i++) g.add(put(torus(3.2, 0.25, iron, 20, PI), 0, c).rotateY(i * PI / 4)); g.add(put(cone(2, 1.8, gm, 10), 0, -5.6)); }
  if (type === 'censer') { g.add(put(ball(3.4, 0, iron, 14), 0, c)); for (let i = 0; i < 10; i++) { const d = fib(10)[i]; g.add(put(ball(0.5, 0, glassM, 5), d[0] * 3.3, c + d[1] * 3.3, d[2] * 3.3)); } g.add(put(cone(1.6, 2, gm, 8), 0, -7.4)); }
  if (type === 'skull') { const s = ball(3.4, 0, M.bone, 14); g.add(put(s, 0, c), put(box(3, 1.8, 2.4, M.bone), 0, c - 2.6, 0.8)); for (const x of [-1.2, 1.2]) g.add(put(ball(1, 0, glassM, 8), x, c, 2.6)); g.add(put(ball(1.8, 0, glassM, 10), 0, c)); }
  if (type === 'cage') { for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; g.add(tube([[0, -6.4, 0], [Math.cos(a) * 3.4, c, Math.sin(a) * 3.4], [0, -16.4, 0]], 0.3, M.bone, 14, 4)); } g.add(put(ball(2, 0, glassM, 12), 0, c)); }
  g.add(put(down(cone(0.9, 2, iron, 4)), 0, -16.8));
  if (R >= 1) g.add(put(ball(0.6, 0, gm, 6), 0, -6.8, 0));
  if (R >= 2) jewel(g, M, [0, -7.4, 3.1], 0.6);
  if (R >= 4) halo(g, M, [0, c, 0], 5, 1.4);
  if (R >= 5) shards(g, M, [0, c, 0], 7, 5, r, 0.6);
  mark(g, 'head', 0, c, 0, 4); mark(g, 'orbit', 0, c, 0, 5); mark(g, 'tip', 0, -16.8); mark(g, 'slot', 0, -7.4, 3.1); mark(g, 'slot', -2.8, c, 2.8); mark(g, 'slot', 2.8, c - 2, 2.8);
  return { g, grip: [0, 0], form: { box: 'Iron Lantern', round: 'Globe Lantern', hex: 'Hex Lantern', censer: 'Censer', skull: 'Skull Lantern', cage: 'Bone Lantern' }[type] };
}

// ------------------------------------------------------------------ the Slime Lord's jars (palm)
export function jar(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['jar', 'flask', 'bottle', 'cauldron', 'skulljar', 'heart'], R, [2, 3, 4, 5, 6, 6]));
  const glass = solid(0x8ab0c0, 0.3, 0.05, 1.6, 'other'), cork = M.wood, gm = R >= 2 ? M.trim : M.metal2;
  const goo = glow(pick(r, [M.e, 0x48c050, 0x3a8aff, 0xa040e0, 0xe04040]), 1.1), hi = glow(0xd0ffb0, 1.8);
  let top = 4.6;
  if (type === 'jar') { g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 7, 20), goo)); for (const y of [3.4, -3.4]) g.add(put(torus(3.35, 0.38, glass, 24), 0, y).rotateX(PI / 2)); g.add(cyl(2.6, 2.2, 3.4, 4.6, glass, 16)); }
  if (type === 'flask') { g.add(lathe([[0.1, -4], [3.8, -3.4], [4, 0], [1.6, 2.6], [1.4, 4.6]], glass, 18), put(ball(3.3, 0, goo, 14), 0, -0.8)); }
  if (type === 'bottle') { g.add(lathe([[0.1, -4], [2.8, -3.8], [3, 1], [1.2, 3], [1, 5.6]], glass, 16), put(cyl(2.6, 2.6, -3.6, 0.6, goo, 14))); top = 5.6; }
  if (type === 'cauldron') { g.add(lathe([[0.1, -3.4], [3.4, -3], [4.4, 0], [4, 2.6], [3.4, 3], [3.6, 3.4]], gm, 18), put(new THREE.Mesh(new THREE.CircleGeometry(3.5, 18), goo), 0, 2.8).rotateX(-PI / 2)); for (const s of [-1, 1]) g.add(put(torus(1, 0.3, gm, 10), s * 4.2, 1.6)); top = 3.4; }
  if (type === 'skulljar') { g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 7, 20), goo), put(ball(1.8, 0, M.bone, 10), 0, 0, 1.2)); for (const x of [-0.7, 0.7]) g.add(put(ball(0.4, 0, M.dark, 5), x, 0.2, 2.7)); g.add(cyl(2.6, 2.2, 3.4, 4.6, glass, 16)); }
  if (type === 'heart') { const h = ball(3.6, 0, goo, 16); h.scale.set(1, 1.1, 0.9); g.add(h, put(ball(1.6, 0, M.glow2, 10), 0.4, 0.6, 1.4)); for (let i = 0; i < 3; i++) g.add(tube([[0, 3.4, 0], [(i - 1) * 2, 5, 0], [(i - 1) * 2.6, 6.6, 0]], 0.5, goo, 8, 5)); top = 3.4; }
  if (type !== 'cauldron' && type !== 'heart') g.add(cyl(2, 2, top, top + 2, cork, 12));
  if (type === 'jar' || type === 'skulljar') g.add(put(box(3.4, 2.6, 0.3, solid(0xb8a880, 0, 0.9, 1, 'other')), 0, -0.4, 3.35));
  for (const [x, y] of [[-1.8, 1.8], [-2.4, -2], [2.2, 2.4]]) g.add(put(ball(0.5, 0, hi, 6), x, y, 2.6));
  if (R >= 2) g.add(put(torus(3.5, 0.3, gm, 24), 0, -1.6).rotateX(PI / 2));
  if (R >= 3) jewel(g, M, [0, 3.2, 2.6], 0.6);
  if (R >= 4) halo(g, M, [0, 0, 0], 6, 1.35);
  if (R >= 5) shards(g, M, [0, 0, 0], 7.5, 5, r, 0.6);
  mark(g, 'head', 0, 0, 0, 4); mark(g, 'orbit', 0, 0, 0, 5); mark(g, 'tip', 0, top + 2); mark(g, 'slot', 0, 3.2, 2.8); mark(g, 'slot', -2, -1, 3); mark(g, 'slot', 2, 0.5, 3);
  return { g, grip: [0, 2], form: { jar: 'Slime Jar', flask: 'Ooze Flask', bottle: 'Gel Bottle', cauldron: 'Pocket Cauldron', skulljar: 'Specimen Jar', heart: 'Slime Heart' }[type] };
}

// ------------------------------------------------------------------ daggers (hang, like the swords but short)
export function dagger(r, R, M) {
  const d = sword(r, R, M, { L: 15, W: 2 });
  d.form = { Longsword: 'Dirk', Broadsword: 'Parrying Dagger', 'Leaf Blade': 'Leaf Dagger', Falchion: 'Seax', Flamberge: 'Kris', Sawblade: 'Sawtooth Knife', Cleaver: 'Cleaver Knife', Estoc: 'Stiletto' }[d.form] || 'Dagger';
  return d;
}

// ------------------------------------------------------------------ crossbows (hang: the grip at the origin, the stock +Y, seen from above, the prod across X)
export function crossbow(r, R, M) {
  const g = new THREE.Group(), type = pick(r, upto(['light', 'heavy', 'repeater', 'recurve', 'dragon', 'arcane'], R, [2, 3, 4, 5, 6, 6]));
  const L = type === 'heavy' ? 24 : range(r, 19, 22), gm = R >= 2 ? M.trim : M.metal2, pw = type === 'heavy' ? 13 : range(r, 10, 12);
  g.add(slab([[-1.3, -4], [1.3, -4], [1.4, L], [-1.4, L]], 2.2, M.wood, 0.4), put(cyl(1.2, 1.2, -4.5, 2.5, M.grip), 0, -1));
  g.add(put(box(1.6, 2.4, 2.8, gm), 0, L - 9), put(box(3.2, 1.4, 2.2, gm), 0, L - 1));
  const prod = []; for (let i = 0; i <= 10; i++) { const t = -1 + i / 5; prod.push([t * pw, L - 1 - (Math.abs(t) ** 2) * (type === 'recurve' ? 5 : 3) + (type === 'recurve' && Math.abs(t) > 0.8 ? (Math.abs(t) - 0.8) * 12 : 0), 0]); }
  g.add(tube(prod, type === 'heavy' ? 1.1 : 0.85, type === 'arcane' ? M.glow : M.metal, 30, 6));
  const str = R >= 4 ? M.glow : solid(0xb8ae98, 0, 0.6, 1, 'other');
  for (const s of [-1, 1]) g.add(tube([[s * pw, prod[s > 0 ? 10 : 0][1], 0], [0, L - 9, 0.4]], 0.25, str, 2, 3));
  g.add(put(cyl(0.45, 0.45, L - 9, L + 4, M.wood, 5)), put(cone(1, 2.4, M.metal, 4), 0, L + 5));
  if (type === 'repeater') g.add(put(box(3, 9, 3, M.wood), 0, L - 4, 1.8));
  if (type === 'dragon') { g.add(put(ball(2, 0, gm, 10), 0, L + 0.5, 0.6)); for (const s of [-1, 1]) g.add(spike(0.6, 3, M.bone, [s * 1.2, L + 1.5, 0.6], [s * 0.4, 1, 0.3], 4), put(ball(0.4, 0, M.glow, 6), s * 0.8, L + 1.4, 2.2)); }
  if (R >= 1) g.add(put(box(2.8, 0.6, 2.6, gm), 0, L - 14));
  if (R >= 2) jewel(g, M, [0, -2, 1.3], 0.7);
  if (R >= 3) runes(g, M, 0, L - 18, L - 11, 1.4, 1.2, 3);
  if (R >= 5) { shards(g, M, [0, L, 0], 8, 5, r, 0.6); halo(g, M, [0, L - 1, 0], 5, 0); }
  mark(g, 'head', 0, L, 0, pw); mark(g, 'tip', 0, L + 6); mark(g, 'l0', -pw, L - 2); mark(g, 'l1', pw, L - 2); mark(g, 'slot', 0, -2, 1.3); mark(g, 'slot', 0, L - 9, 1.6); mark(g, 'slot', 0, L - 1, 1.2);
  return { g, form: { light: 'Light Crossbow', heavy: 'Arbalest', repeater: 'Repeater', recurve: 'Recurve Crossbow', dragon: 'Dragon Crossbow', arcane: 'Arcane Crossbow' }[type] };
}

// ------------------------------------------------------------------ scythes (planted: the foot at the origin, the blade sweeping out from the top)
export function scythe(r, R, M) {
  const g = new THREE.Group(), top = range(r, 96, 104), gm = R >= 2 ? M.trim : M.metal2;
  const type = pick(r, upto(['field', 'war', 'reaper', 'twin', 'crescent', 'bone'], R, [2, 3, 4, 5, 6, 6]));
  const pts = []; for (let i = 0; i <= 10; i++) pts.push([Math.sin(i * 0.5) * 1.2 * (type === 'war' ? 0.3 : 1), i * top / 10, 0]);
  g.add(tube(pts, 1.15, type === 'bone' ? M.bone : M.wood, 40, 7), put(down(cone(1.2, 2.6, M.metal2, 6)), 0, 1.3), put(cyl(1.45, 1.45, -5, 5, M.grip), 0, 57));
  g.add(put(cyl(0.6, 0.6, 0, 6, M.wood, 6), 1.6, 72).rotateZ(-PI / 2)); // the nib
  const bl = range(r, 26, 34), sweep = (s = 1, k = 1) => {
    const o = [], N = 16;
    for (let i = 0; i <= N; i++) { const t = i / N, a = t * (type === 'crescent' ? 2.4 : 1.6); o.push([s * Math.sin(a) * bl * k * 0.62, top + 2 - (1 - Math.cos(a)) * bl * k * 0.28 + (type === 'reaper' ? 0 : -t * 2)]); }
    const inner = o.slice().reverse().map(([x, y], i) => [x * 0.9, y - (4.4 * k) * Math.sin(PI * (1 - i / N)) ** 0.7]);
    return [[0, top - 2], ...o, ...inner];
  };
  g.add(slab(sweep(1), 0.9, type === 'bone' ? M.bone : M.blade, 0.25));
  if (R < 4 && type !== 'bone') g.add(slab(sweep(1).map(([x, y]) => [x * 1.05, y + 0.4]), 0.45, M.edge, 0));
  if (type === 'twin' || type === 'crescent') g.add(slab(sweep(-1, 0.7).map(([x, y]) => [x, y]).reverse(), 0.9, M.metal, 0.25));
  g.add(put(cyl(1.7, 1.7, -3, 3, gm, 8), 0, top - 1));
  if (R >= 1) g.add(band(1.4, top - 10, gm, 1), band(1.4, 30, gm, 1));
  if (R >= 2) jewel(g, M, [0, top - 1, 1.8], 0.9);
  if (R >= 3) runes(g, M, bl * 0.25, top - 1, top + 2, 1.2, 0.55, 2);
  if (R >= 4) g.add(slab(sweep(1).map(([x, y]) => [x * 1.06, y + 0.5]), 0.4, M.glow, 0));
  if (R >= 5) { shards(g, M, [bl * 0.4, top, 0], 9, 5, r); halo(g, M, [0, top - 1, 0], 5, 1.3); }
  mark(g, 'head', bl * 0.35, top - 2, 0, bl * 0.5); mark(g, 'tip', bl * 0.62, top - 6); mark(g, 'l0', 2, top); mark(g, 'l1', bl * 0.6, top - 6); mark(g, 'slot', 0, top - 1, 1.8); mark(g, 'slot', 0, top - 10, 1.4); mark(g, 'slot', 0, 30, 1.4);
  return { g, form: { field: 'Scythe', war: 'War Scythe', reaper: 'Reaper', twin: 'Twin Scythe', crescent: 'Moon Scythe', bone: 'Bone Scythe' }[type] };
}
