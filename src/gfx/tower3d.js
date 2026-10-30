// THE SERPENTINE TOWER in three.js (docs/SERPENTINE_TOWER.md). Unlike the Castle and the arches (baked to sprites),
// the tower is drawn live every frame behind the 2D sprites, because the camera turns with the hero as he climbs.
// The camera is the game's own: orthographic, 30 degrees down, 45 degrees round, one three.js unit = one tile
// (HW * sqrt 2 = 45.25 world px across, VZ = 39.19 px up), framed on the 2D camera's view rect, so a tile position
// warped by game/tower.js lands on the same pixel the 3D stair shows. The tower turns (root.rotation.y = alpha), the
// camera never does. While climbing, everything nearer the camera than the axis is clipped away (a cutaway: the far
// half of the tower, its stair, its lanterns and the chandeliers on their chains down the middle); back faces show as
// the dark cut stone. A second, tilted plane held on the hero cuts away the turn above where it comes round behind him
// (world/tower.js upCut). On the roof the clips are off and the dome hidden. Materials are the Castle 3D masonry and the
// airship pack's metals, palette swapped per variant (core/util.js recolor). three.js is loaded on demand from the
// import map in index.html; the airships come from tools/airship3d*.js (docs/AIRSHIP_3D.md).
import { G } from '../state.js';
import { camera, HW } from '../core/view.js';
import { recolor, makeCanvas } from '../core/util.js';
import { VZ, TOWER_VARIANTS, CUT_N, CUT_C, UP_H, UP_K, UP_D } from '../world/tower.js';

const SC = HW * Math.SQRT2;                 // world px per tile (one three.js unit) across the screen
const TEXDIR = 'assets/source/castle3d/tex/', AIRDIR = 'assets/source/airship/textures/';
let T = null, BGU = null;                   // three, BufferGeometryUtils
let R = null;                               // the renderer and its camera, shared by every tower
let S = null;                               // the scene of the tower being played
let UPN, UPP, UPZ;                          // scratch vectors for the upper cut
const IMG = new Map();                      // source images by path

const loadImg = (src) => IMG.get(src) || IMG.set(src, new Promise((ok, no) => {
  const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Failed to load ' + src)); im.src = src;
})).get(src);

/** three.js and the tower's textures. Rejects if three.js can't be fetched (the game then picks another biome). */
export async function loadTower3D() {
  if (!T) [T, BGU] = await Promise.all([import('three'), import('three/addons/utils/BufferGeometryUtils.js')]);
  const names = new Set(['iron', 'slate', 'wood'].map((k) => TEXDIR + k + '.png'));
  for (const v of TOWER_VARIANTS) { for (const k of [v.stone, v.trim, v.floor]) names.add(TEXDIR + k + '.png'); names.add(AIRDIR + 'metal/' + v.metal + '.png'); }
  names.add(AIRDIR + 'sailcloth/CLOTH-02_Stitched_Charcoal.png'); names.add(AIRDIR + 'gold/GOLD-01_Beaten_Antique_Gold.png');
  await Promise.all([...names].map(loadImg));
}
export const tower3dReady = () => !!T;

// ------------------------------------------------------------------ renderer
function renderer() {
  if (R) return R;
  const gl = new T.WebGLRenderer({ antialias: false, alpha: true, stencil: true, powerPreference: 'high-performance' });   // stencil: the cut caps; alpha: the front pass
  gl.setPixelRatio(1); gl.localClippingEnabled = true;
  const cam = new T.OrthographicCamera(-10, 10, 10, -10, 1, 1400);
  const e = Math.PI / 6, a = Math.PI / 4;
  cam.position.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).multiplyScalar(700);
  cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  R = { gl, cam, w: 0, h: 0 };
  UPN = new T.Vector3(); UPP = new T.Vector3(); UPZ = new T.Vector3(0, 0, 1);
  return R;
}

// ------------------------------------------------------------------ materials
async function texture(src, swap, rep = true) {
  const img = await loadImg(src), c = recolor(img, swap);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = rep ? T.RepeatWrapping : T.ClampToEdgeWrapping;
  t.magFilter = T.NearestFilter; t.anisotropy = 4;
  return t;
}
// The well's dark: stone far below the hero fades into the variant's fog (and a little far above), so the stair
// falls away into the deep and the turn you're on stands out. Shared by every tower material, set each frame.
const FOG = { y: { value: 0 }, k: { value: 1 }, c: { value: null } };
/** Height fog, and back faces drawn as the stone itself, unlit and dark: they only show where the cutaway slices a
 * solid the stencil caps (below) don't cover. */
function capped(m, cap) {
  m.side = T.DoubleSide;
  m.onBeforeCompile = (sh) => fogged(sh, `if (!gl_FrontFacing) gl_FragColor = linearToOutputTexel(vec4(diffuseColor.rgb * uCap, 1.0));`, cap);
  m.customProgramCacheKey = () => 'towercap';
  return m;
}
function fogged(sh, extra = '', cap = 0) {
  sh.uniforms.uCap = { value: new T.Color(cap) }; sh.uniforms.uFogY = FOG.y; sh.uniforms.uFogK = FOG.k; sh.uniforms.uFogC = FOG.c;
  sh.vertexShader = 'varying float vWY;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
  sh.fragmentShader = 'uniform vec3 uCap; uniform float uFogY; uniform float uFogK; uniform vec3 uFogC; varying float vWY;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
    `#include <dithering_fragment>\n\t${extra}\n\tfloat fogD = clamp((uFogY - vWY - 6.0) / 24.0, 0.0, 1.0), fogU = clamp((vWY - uFogY - 14.0) / 34.0, 0.0, 1.0);\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, uFogC, uFogK * (fogD * 0.92 + fogU * 0.4));`);
}
async function materials(v, clips) {
  const M = {}, cap = 0x3a3634;
  FOG.c.value = new T.Color(v.fog);
  const std = async (key, src, swap, o = {}) => {
    const map = await texture(src, swap), bump = map.clone(); bump.colorSpace = T.NoColorSpace; bump.needsUpdate = true;
    M[key] = capped(new T.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: o.bump ?? 1.2, roughness: o.rough ?? 0.92, metalness: o.metal ?? 0, color: o.color ?? 0xd8d2ca, clippingPlanes: clips }), cap);
  };
  await Promise.all([
    std('stone', TEXDIR + v.stone + '.png', v.stoneSwap),
    std('trim', TEXDIR + v.trim + '.png', v.trimSwap, { color: 0xe8e2da }),
    std('floor', TEXDIR + v.floor + '.png', v.floorSwap, { bump: 0.8 }),
    std('metal', AIRDIR + 'metal/' + v.metal + '.png', null, { metal: 0.45, rough: 0.55, bump: 0.6 }),
    std('iron', TEXDIR + 'iron.png', { sat: 0.4, light: -0.15 }, { metal: 0.35, rough: 0.6, bump: 0.6 }),
    std('slate', TEXDIR + 'slate.png', v.trimSwap, { bump: 0.8, color: 0xb8b4b0 }),
    std('wood', TEXDIR + 'wood.png', { light: -0.1 }, { bump: 0.6 }),
    std('gold', AIRDIR + 'gold/GOLD-01_Beaten_Antique_Gold.png', null, { metal: 0.55, rough: 0.5, bump: 0.5 }),
    std('cloth', AIRDIR + 'sailcloth/CLOTH-02_Stitched_Charcoal.png', null, { color: v.banner, bump: 0.4 }),
    std('paving', TEXDIR + v.floor + '.png', v.floorSwap, { bump: 0.8, color: 0xf2eee8 }),   // the roof deck, under the open sky
    std('nose', TEXDIR + v.trim + '.png', v.trimSwap, { color: 0xfff6ea, bump: 0.5 }),       // the steps' worn nosings catch the light
  ]);
  const lead = stainedGlass(v.stained);
  M.glass = capped(new T.MeshStandardMaterial({ map: lead, emissiveMap: lead, color: 0x404850, emissive: 0xffffff, emissiveIntensity: 0.62, roughness: 0.35, clippingPlanes: clips }), cap);
  M.lamp = new T.MeshStandardMaterial({ color: 0xfff0d0, emissive: v.lantern, emissiveIntensity: 2.4, clippingPlanes: clips });
  M.flame = new T.MeshBasicMaterial({ color: 0xffe6a0, clippingPlanes: clips });
  M.door = new T.MeshBasicMaterial({ map: portalTexture(), transparent: true, side: T.DoubleSide, clippingPlanes: clips });
  M.crystal = capped(new T.MeshStandardMaterial({ color: 0xc8f0ff, emissive: v.glass, emissiveIntensity: 1.2, roughness: 0.2, flatShading: true, clippingPlanes: clips }), cap);
  M.rune = new T.MeshBasicMaterial({ color: v.glass, clippingPlanes: clips });
  M.ivy = capped(new T.MeshStandardMaterial({ color: 0x4a7a44, roughness: 0.9, clippingPlanes: clips }), cap);
  const emb = emblemTexture(v, 'banner');
  M.banner = capped(new T.MeshStandardMaterial({ map: emb, roughness: 0.95, side: T.DoubleSide, clippingPlanes: clips }), cap);
  M.mosaic = capped(new T.MeshStandardMaterial({ map: emblemTexture(v, 'mosaic'), color: 0xb8b2aa, roughness: 0.85, clippingPlanes: clips }), cap);
  for (const k of ['lamp', 'flame', 'rune']) M[k].onBeforeCompile = (sh) => fogged(sh), M[k].customProgramCacheKey = () => 'towerfog';
  return M;
}
/** Stained glass: quarries of three colours in lead cames, one unit square (window shapes keep their own units as uvs). */
function stainedGlass(cols) {
  const c = makeCanvas(48, 48), x = c.getContext('2d');
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    x.fillStyle = cols[(i * 7 + j * 3 + (i ^ j)) % cols.length]; x.fillRect(i * 12, j * 12, 12, 12);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(i * 12 + 2, j * 12 + 2, 4, 3);
  }
  x.strokeStyle = '#0a0c0e'; x.lineWidth = 2;
  for (let k = -48; k <= 96; k += 12) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 48, 48); x.stroke(); x.beginPath(); x.moveTo(k + 48, 0); x.lineTo(k, 48); x.stroke(); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1.2, 1.2); t.magFilter = T.NearestFilter;
  return t;
}
/** A variant's emblem on cloth (banners, flags) or as a floor mosaic in rings of tesserae. */
function emblemTexture(v, kind) {
  const n = 128, c = makeCanvas(n, kind === 'banner' ? 192 : n), x = c.getContext('2d'), H = c.height;
  const hex = (h) => '#' + h.toString(16).padStart(6, '0'), base = hex(v.banner), gild = v.gild;
  if (kind === 'banner') {
    x.fillStyle = base; x.fillRect(0, 0, n, H);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`; x.fillRect(Math.random() * n, Math.random() * H, 2, 1); }
    x.strokeStyle = gild; x.lineWidth = 5; x.strokeRect(8, 8, n - 16, H - 24);
    x.fillStyle = gild; x.fillRect(0, 0, n, 8);
  } else {
    x.fillStyle = '#1a1612'; x.fillRect(0, 0, n, n);
    const ring = (r, col) => { x.strokeStyle = col; x.lineWidth = 6; x.beginPath(); x.arc(n / 2, n / 2, r, 0, 7); x.stroke(); };
    x.fillStyle = base; x.beginPath(); x.arc(n / 2, n / 2, 60, 0, 7); x.fill();
    ring(60, gild); ring(44, '#2a2420'); ring(40, gild);
    for (let a = 0; a < 7; a += 0.26) { x.fillStyle = gild; x.fillRect(n / 2 + Math.cos(a) * 52 - 2, n / 2 + Math.sin(a) * 52 - 2, 4, 4); }
  }
  const cx = n / 2, cy = kind === 'banner' ? H * 0.45 : n / 2, s = kind === 'banner' ? 1 : 0.8;
  x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = gild; x.strokeStyle = gild; x.lineWidth = 7; x.lineCap = 'round';
  if (v.emblem === 'serpent') { x.beginPath(); x.moveTo(-22, 34); x.bezierCurveTo(30, 30, 30, 4, 0, 0); x.bezierCurveTo(-30, -4, -30, -30, 18, -32); x.stroke(); x.beginPath(); x.arc(22, -32, 7, 0, 7); x.fill(); }
  else if (v.emblem === 'eye') { x.beginPath(); x.moveTo(-32, 0); x.quadraticCurveTo(0, -26, 32, 0); x.quadraticCurveTo(0, 26, -32, 0); x.stroke(); x.beginPath(); x.arc(0, 0, 9, 0, 7); x.fill(); }
  else if (v.emblem === 'flame') { x.beginPath(); x.moveTo(0, -34); x.quadraticCurveTo(24, -4, 14, 22); x.quadraticCurveTo(0, 34, -14, 22); x.quadraticCurveTo(-24, -4, 0, -34); x.fill(); }
  else if (v.emblem === 'flake') { for (let i = 0; i < 6; i++) { x.rotate(Math.PI / 3); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -32); x.moveTo(0, -18); x.lineTo(-9, -26); x.moveTo(0, -18); x.lineTo(9, -26); x.stroke(); } }
  else { x.beginPath(); x.moveTo(-20, 20); x.quadraticCurveTo(-20, -28, 0, -28); x.quadraticCurveTo(20, -28, 20, 20); x.lineTo(28, 26); x.lineTo(-28, 26); x.closePath(); x.fill(); x.beginPath(); x.arc(0, 32, 6, 0, 7); x.fill(); }
  x.restore();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.magFilter = T.NearestFilter;
  return t;
}
/** The cut faces of the cutaway: rough dressed stone, flat on the cut (drawn where the stencil says a solid was sliced). */
function cutTexture() {
  const c = makeCanvas(64, 64), x = c.getContext('2d');
  x.fillStyle = '#9a948c'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 260; i++) { const v = 110 + Math.random() * 60 | 0; x.fillStyle = `rgb(${v},${v - 4},${v - 10})`; x.fillRect(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 3, 2); }
  x.fillStyle = 'rgba(40,36,32,0.5)'; for (let y = 0; y < 64; y += 16) x.fillRect(0, y, 64, 1);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter;
  return t;
}
/** The stairhead door's swirl: the game's portal colours, orange-red round a white-hot core. */
function portalTexture() {
  const c = makeCanvas(64, 96), x = c.getContext('2d'), g = x.createRadialGradient(32, 58, 2, 32, 58, 44);
  g.addColorStop(0, '#fff8e0'); g.addColorStop(0.25, '#ffc060'); g.addColorStop(0.6, '#ff5020'); g.addColorStop(1, '#3a0800');
  x.fillStyle = g; x.fillRect(0, 0, 64, 96);
  x.globalAlpha = 0.35; x.strokeStyle = '#fff0c0';
  for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(32, 58, 6 + i * 6, i, i + 2.4); x.stroke(); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
/** Diamond quarries of glass in lead cames, one unit square (the window shapes keep their own units as uvs). */
function leadedGlass() {
  const c = makeCanvas(32, 32), x = c.getContext('2d');
  x.fillStyle = '#8a98a0'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#b8c8d0'; for (let i = 0; i < 6; i++) x.fillRect((i * 13) % 28, (i * 7) % 28, 3, 2);
  x.strokeStyle = '#101418'; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(0, 16); x.lineTo(16, 0); x.lineTo(32, 16); x.lineTo(16, 32); x.closePath(); x.stroke();
  x.beginPath(); x.moveTo(0, 0); x.lineTo(1, 0); x.moveTo(31, 31); x.lineTo(32, 32); x.stroke();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1.6, 1.6); t.magFilter = T.NearestFilter;
  return t;
}
let haloTex = null;
function halo() {
  if (haloTex) return haloTex;
  const c = makeCanvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(0.22, '#fff8'); g.addColorStop(1, '#fff0');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  haloTex = new T.CanvasTexture(c); haloTex.colorSpace = T.SRGBColorSpace;
  return haloTex;
}
const glowSprite = (color, size, clips) => {
  const s = new T.Sprite(new T.SpriteMaterial({ map: halo(), color, blending: T.AdditiveBlending, depthWrite: false, transparent: true, clippingPlanes: clips || [] }));
  s.scale.setScalar(size); return s;
};

// ------------------------------------------------------------------ geometry
/** Triangles collected per material, merged into one mesh each. Quads are wound to face their given normal. */
class Build {
  constructor() { this.by = new Map(); }
  arr(k) { let a = this.by.get(k); if (!a) this.by.set(k, (a = { p: [], n: [], u: [], g: [] })); return a; }
  /** A quad a b c d (tower-frame three.js points), facing n (one normal, or four for smooth shading), uvs [[u,v] x4]. */
  quad(k, a, b, c, d, n, uv) {
    const N = n.length === 4 ? n : [n, n, n, n], ab = sub(b, a), ac = sub(c, a);
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    let P = [a, b, c, d], U = uv, NN = N;
    if (cr[0] * N[0][0] + cr[1] * N[0][1] + cr[2] * N[0][2] < 0) { P = [a, d, c, b]; U = [uv[0], uv[3], uv[2], uv[1]]; NN = [N[0], N[3], N[2], N[1]]; }
    const A = this.arr(k);
    for (const i of [0, 1, 2, 0, 2, 3]) { A.p.push(...P[i]); A.n.push(...NN[i]); A.u.push(...U[i]); }
  }
  add(k, g) { g = g.index ? g.toNonIndexed() : g; if (!g.attributes.normal) g.computeVertexNormals(); this.arr(k).g.push(g); }
  build(M, name) {
    const grp = new T.Group(); grp.name = name;
    for (const [k, a] of this.by) {
      const list = [...a.g.map((g) => { for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n); return g; })];
      if (a.p.length) {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(a.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(a.n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(a.u, 2));
        list.push(g);
      }
      if (!list.length) continue;
      const mesh = new T.Mesh(list.length > 1 ? BGU.mergeGeometries(list) : list[0], M[k]);
      mesh.name = name + ':' + k; mesh.frustumCulled = false; grp.add(mesh);
    }
    return grp;
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** Tower frame (r, theta, z: tiles) to three.js (x, y up, z). */
const P = (r, t, z) => [r * Math.cos(t), z, r * Math.sin(t)];
const radial = (t, k = 1) => [k * Math.cos(t), 0, k * Math.sin(t)];
const tangent = (t) => [-Math.sin(t), 0, Math.cos(t)];    // the way theta grows: down the stair
const UP = [0, 1, 0], DOWN = [0, -1, 0];
/** A box w (radial) x h x d (along the wall) centred at (r, theta, z), turned to face the axis. */
function wallBox(r, t, z, w, h, d) {
  const g = new T.BoxGeometry(w, h, d);
  g.rotateY(-t); g.translate(r * Math.cos(t), z, r * Math.sin(t));
  return worldUV(g);
}
/** UVs from position by face direction (masonry runs on across parts): 1 repeat per 1.6 tiles across, 3 up. */
function worldUV(g, ku = 1 / 1.6, kv = 1 / 3) {
  g = g.index ? g.toNonIndexed() : g;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay > 0.7) { uv[i * 2] = x * ku; uv[i * 2 + 1] = z * ku; }
    else if (ax > az) { uv[i * 2] = z * ku; uv[i * 2 + 1] = y * kv; }
    else { uv[i * 2] = x * ku; uv[i * 2 + 1] = y * kv; }
  }
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return g;
}
const at = (g, x, y, z) => g.translate(x, y, z);

/** The scene of one tower: built once per level (generateTower's geo). */
export async function buildTower3D(g) {
  const v = g.v, rd = renderer();
  if (S && S.g === g) return S;
  disposeTower3D();
  const clip = new T.Plane(new T.Vector3(CUT_N[0], 0, CUT_N[1]), CUT_C), up = new T.Plane(new T.Vector3(0, -1, 0), 1e6), clips = [clip, up];
  const M = await materials(v, clips);
  const scene = new T.Scene(), root = new T.Group(), lightSrc = [], spin = [], flick = [];
  scene.add(root);
  const B = new Build(), climb = new Build(), roof = new Build(), front = new Build();   // front: drawn again over the sprites (drawTowerFront)
  const { rIn, rWall, rc, N, d, rise, H, L } = g, wallTop = H + 4, T2 = 1.6, rOut = rWall + T2;
  const th = (s) => g.theta(s);

  // `solid` gets the tower's masses as closed solids (no inner faces) for the stencil caps where the cutaway slices them
  const solid = new Build();
  const block = (t0, t1, r0, r1, b0, b1, top0, top1) => {   // a closed curved block (solid set only)
    const c = [[r0, t0, b0], [r1, t0, b0], [r1, t1, b1], [r0, t1, b1], [r0, t0, top0], [r1, t0, top0], [r1, t1, top1], [r0, t1, top1]].map(([r, t, z]) => P(r, t, z));
    const mid = P((r0 + r1) / 2, (t0 + t1) / 2, (b0 + top0 + b1 + top1) / 4), o = [0, 0];
    for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]) {
      const q = f.map((i) => c[i]), cx = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
      solid.quad('s', ...q, sub(cx, mid), [o, o, o, o]);
    }
  };
  // ---- the wall: inner face, outer face, and the course at the dome's foot
  const SEG = 192;
  for (let i = 0; i < SEG; i++) {
    const t0 = (i / SEG) * Math.PI * 2, t1 = ((i + 1) / SEG) * Math.PI * 2, u0 = t0 * rWall / 1.6, u1 = t1 * rWall / 1.6, z0 = -2, z1 = wallTop;
    B.quad('stone', P(rWall, t0, z0), P(rWall, t1, z0), P(rWall, t1, z1), P(rWall, t0, z1),
      [radial(t0, -1), radial(t1, -1), radial(t1, -1), radial(t0, -1)], [[u0, z0 / 3], [u1, z0 / 3], [u1, z1 / 3], [u0, z1 / 3]]);
    const o0 = t0 * rOut / 1.6, o1 = t1 * rOut / 1.6, zt = g.roofZ + 0.2;
    B.quad('stone', P(rOut, t0, -14), P(rOut, t1, -14), P(rOut, t1, zt), P(rOut, t0, zt),
      [radial(t0), radial(t1), radial(t1), radial(t0)], [[o0, -14 / 3], [o1, -14 / 3], [o1, zt / 3], [o0, zt / 3]]);
    // a cornice where the dome springs, and a string course outside under the parapet
    const zc = wallTop - 0.1;
    climb.quad('trim', P(rWall, t0, zc), P(rWall, t1, zc), P(rWall - 0.5, t1, zc + 0.35), P(rWall - 0.5, t0, zc + 0.35), [radial(t0, -0.7)[0], 0.7, radial(t0, -0.7)[2]], [[u0, 0], [u1, 0], [u1, 0.2], [u0, 0.2]]);
    B.quad('trim', P(rOut, t0, g.roofZ - 0.9), P(rOut, t1, g.roofZ - 0.9), P(rOut + 0.35, t1, g.roofZ - 0.4), P(rOut + 0.35, t0, g.roofZ - 0.4), [radial(t0, 0.7)[0], -0.7, radial(t0, 0.7)[2]], [[o0, 0], [o1, 0], [o1, 0.2], [o0, 0.2]]);
    block(t0, t1, rWall, rOut, -14, -14, g.roofZ + 0.2, g.roofZ + 0.2);
  }
  // ---- the ground floor: paving in rings, a raised dais at the centre
  for (let i = 0; i < 96; i++) {
    const t0 = (i / 96) * Math.PI * 2, t1 = ((i + 1) / 96) * Math.PI * 2;
    for (const [r0, r1] of [[3.2, 7], [7, 11], [11, rWall + 0.2]]) {
      const p = [P(r0, t0, 0), P(r1, t0, 0), P(r1, t1, 0), P(r0, t1, 0)];
      B.quad('floor', ...p, UP, p.map((q) => [q[0] / 2, q[2] / 2]));
    }
  }
  B.add('trim', worldUV(new T.CylinderGeometry(3.2, 3.4, 0.5, 48).translate(0, 0.25, 0)));
  B.add('floor', worldUV(new T.CylinderGeometry(2.4, 2.4, 0.62, 48).translate(0, 0.31, 0), 0.5, 0.5));
  B.add('metal', worldUV(new T.TorusGeometry(1.6, 0.12, 6, 40).rotateX(Math.PI / 2).translate(0, 0.66, 0)));
  lightSrc.push({ p: [0, 1.2, 0], c: v.lantern, r: 7, i: 0.6 });
  B.add('mosaic', new T.CircleGeometry(7.2, 48).rotateX(-Math.PI / 2).translate(0, 0.02, 0));
  extras(B, climb, g, v, lightSrc);

  // ---- the stair: treads with lit nosings, risers, a curb on the inner edge over the stringer, the soffit under it all
  const thick = 1.4, sub3 = 3, CW = 0.32, rTr = rIn + CW;
  for (let k = 0; k < N; k++) {
    const s0 = k * d, s1 = (k + 1) * d, z0 = k * rise, z1 = (k + 1) * rise, t0 = th(s0), t1 = th(s1);
    for (let j = 0; j < sub3; j++) {
      const a = t0 + (t1 - t0) * j / sub3, b = t0 + (t1 - t0) * (j + 1) / sub3;
      const p = [P(rTr, a, z1), P(rWall + 0.1, a, z1), P(rWall + 0.1, b, z1), P(rTr, b, z1)];
      B.quad('floor', ...p, UP, p.map((q) => [q[0] / 1.6, q[2] / 1.6]));
    }
    const tn = tangent(t0), rr = [P(rTr, t0, z0), P(rWall + 0.1, t0, z0), P(rWall + 0.1, t0, z1), P(rTr, t0, z1)];
    B.quad('trim', ...rr, tn, [[0, z0 / 3], [w16(g.w), z0 / 3], [w16(g.w), z1 / 3], [0, z1 / 3]]);
    // the nosing: a worn lip along the front of each tread, lighter than the tread, so the steps read at a glance
    const tq = t0 + 0.12 / rc, nz = z1 + 0.035;
    B.quad('nose', P(rTr, t0, nz), P(rWall, t0, nz), P(rWall, tq, nz), P(rTr, tq, nz), UP, [[0, 0], [g.w / 1.6, 0], [g.w / 1.6, 0.08], [0, 0.08]]);
    B.quad('nose', P(rTr, t0, z1 - 0.06), P(rWall, t0, z1 - 0.06), P(rWall, t0, nz), P(rTr, t0, nz), tn, [[0, 0], [g.w / 1.6, 0], [g.w / 1.6, 0.05], [0, 0.05]]);
    // the stringer: a smooth band on the inner edge, over the step ends, down to the soffit; its top is a curb
    const top0 = s0 * g.slope + rise + 0.06, top1 = s1 * g.slope + rise + 0.06, bot0 = s0 * g.slope - thick, bot1 = s1 * g.slope - thick;
    const ua = s0 * rIn / rc / 1.6, ub = s1 * rIn / rc / 1.6;
    B.quad('trim', P(rIn, t0, bot0), P(rIn, t1, bot1), P(rIn, t1, top1), P(rIn, t0, top0), [radial(t0, -1), radial(t1, -1), radial(t1, -1), radial(t0, -1)],
      [[ua, bot0 / 3], [ub, bot1 / 3], [ub, top1 / 3], [ua, top0 / 3]]);
    B.quad('trim', P(rIn, t0, top0), P(rIn, t1, top1), P(rTr, t1, top1), P(rTr, t0, top0), UP, [[ua, 0], [ub, 0], [ub, 0.1], [ua, 0.1]]);
    B.quad('trim', P(rTr, t0, z1), P(rTr, t1, z1), P(rTr, t1, top1), P(rTr, t0, top0), [radial(t0), radial(t1), radial(t1), radial(t0)], [[ua, 0], [ub, 0], [ub, 0.06], [ua, 0.06]]);
    const sp = [P(rIn, t0, bot0), P(rWall + 0.1, t0, bot0), P(rWall + 0.1, t1, bot1), P(rIn, t1, bot1)];
    B.quad('stone', ...sp, DOWN, sp.map((q) => [q[0] / 1.6, q[2] / 1.6]));
    block(t0, t1, rIn + 0.02, rWall + 0.4, bot0, bot1, z1, z1);
    block(t0, t1, rIn, rTr + 0.02, bot0 + 0.05, bot1 + 0.05, top0, top1);
    // a skirting where the stair meets the wall, and a sill course along the wall half a turn up, under the windows
    const sk = 0.42, wa = s0 / 1.6, wb = s1 / 1.6, kz0 = z0 + rise, kz1 = z1 + rise;
    B.quad('trim', P(rWall - 0.06, t0, kz0 - rise), P(rWall - 0.06, t1, kz1 - rise), P(rWall - 0.06, t1, kz1 + sk), P(rWall - 0.06, t0, kz0 + sk), [radial(t0, -1), radial(t1, -1), radial(t1, -1), radial(t0, -1)], [[wa, 0], [wb, 0], [wb, 0.14], [wa, 0.14]]);
    const cz0 = s0 * g.slope + v.pitch * 0.52 - 1.85, cz1 = s1 * g.slope + v.pitch * 0.52 - 1.85;
    if (cz1 < wallTop - 1) {
      B.quad('trim', P(rWall - 0.2, t0, cz0), P(rWall - 0.2, t1, cz1), P(rWall - 0.2, t1, cz1 + 0.28), P(rWall - 0.2, t0, cz0 + 0.28), [radial(t0, -1), radial(t1, -1), radial(t1, -1), radial(t0, -1)], [[wa, 0], [wb, 0], [wb, 0.1], [wa, 0.1]]);
      B.quad('trim', P(rWall - 0.2, t0, cz0 + 0.28), P(rWall - 0.2, t1, cz1 + 0.28), P(rWall, t1, cz1 + 0.28), P(rWall, t0, cz0 + 0.28), UP, [[wa, 0], [wb, 0], [wb, 0.06], [wa, 0.06]]);
    }
  }
  // the landings: the stairhead runs on level to the door
  {
    const s0 = L, s1 = g.sEnd + 1.2, n = Math.ceil((s1 - s0) / 0.6);
    for (let j = 0; j < n; j++) {
      const a = th(s0 + (s1 - s0) * j / n), b = th(s0 + (s1 - s0) * (j + 1) / n);
      const p = [P(rTr, a, H), P(rWall + 0.1, a, H), P(rWall + 0.1, b, H), P(rTr, b, H)];
      B.quad('floor', ...p, UP, p.map((q) => [q[0] / 1.6, q[2] / 1.6]));
      B.quad('trim', P(rIn, a, H - thick), P(rIn, b, H - thick), P(rIn, b, H + 0.06), P(rIn, a, H + 0.06), [radial(a, -1), radial(b, -1), radial(b, -1), radial(a, -1)], [[j * 0.4, 0], [j * 0.4 + 0.4, 0], [j * 0.4 + 0.4, 0.5], [j * 0.4, 0.5]]);
      B.quad('trim', P(rIn, a, H + 0.06), P(rIn, b, H + 0.06), P(rTr, b, H + 0.06), P(rTr, a, H + 0.06), UP, [[0, 0], [0.4, 0], [0.4, 0.1], [0, 0.1]]);
      B.quad('trim', P(rTr, a, H), P(rTr, b, H), P(rTr, b, H + 0.06), P(rTr, a, H + 0.06), [radial(a), radial(b), radial(b), radial(a)], [[0, 0], [0.4, 0], [0.4, 0.02], [0, 0.02]]);
      B.quad('stone', P(rIn, a, H - thick), P(rWall, a, H - thick), P(rWall, b, H - thick), P(rIn, b, H - thick), DOWN, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      block(a, b, rIn, rWall + 0.4, H - thick, H - thick, H + 0.06, H + 0.06);
    }
    railing(front, g, v, s0 - 0.2, s1, (s) => H, lightSrc);
  }
  railing(front, g, v, 0, L, (s) => s * g.slope + rise + 0.06, lightSrc);

  // ---- ribs, windows, banners and lanterns on the wall
  const turnsAt = (t) => {   // the stair's heights where it passes angle t (one per turn)
    const out = [];
    for (let k = -1; k < g.v.turns + 1; k++) {
      let s = (g.theta0 - t) * rc + k * g.C;
      if (s >= -2 && s <= L) out.push(g.z(s));
    }
    return out;
  };
  const RIBS = 24;
  for (let i = 0; i < RIBS; i++) {
    const t = (i / RIBS) * Math.PI * 2;
    if (v.ribs) { B.add('trim', wallBox(rWall - 0.15, t, wallTop / 2 - 1, 0.5, wallTop + 2, 0.7)); solid.add('s', wallBox(rWall - 0.15, t, wallTop / 2 - 1, 0.5, wallTop + 2, 0.7)); }
    const tw = t + Math.PI / RIBS, zs = turnsAt(tw);
    for (const z of zs) {
      const zc = z + v.pitch * 0.52;
      if (zc + 2.2 > wallTop - 0.3) continue;
      if ((i + Math.round(z)) % 3 === 0 && v.banner) banner(B, rWall - 0.12, tw, zc + 1.6);
      else window_(B, v, rWall - 0.06, tw, zc);
    }
  }
  for (let s = 4; s < g.sEnd; s += 8.5) {
    const t = th(s), z = g.z(s) + 2.5;
    lantern(B, rWall - 0.05, t, z, lightSrc, v.lantern);
  }

  // ---- the stairhead door: a gothic arch across the stair, its doorway a swirl of portal light
  {
    const t = th(g.sEnd), z = H, w = rWall - rIn;
    for (const r of [rIn + 0.35, rWall - 0.35]) B.add('trim', worldUV(new T.BoxGeometry(0.7, 3.2, 0.7).rotateY(-t).translate(...P(r, t, z + 1.6))));
    const steps = 12, rm = (rIn + rWall) / 2;
    for (let i = 0; i < steps; i++) {
      const f0 = i / steps, f1 = (i + 1) / steps, arc = (f) => { const q = f * 2 - 1; return [rm + q * (w / 2 - 0.35), z + 3.2 + 1.9 * Math.sqrt(Math.max(0, 1 - Math.abs(q)))]; };
      const [ra, za] = arc(f0), [rb, zb] = arc(f1);
      const len = Math.hypot(rb - ra, zb - za), cr = (ra + rb) / 2, cz = (za + zb) / 2, ang = Math.atan2(zb - za, rb - ra);
      const bx = new T.BoxGeometry(len + 0.08, 0.5, 0.7).rotateZ(ang);
      bx.translate(cr, cz, 0); bx.rotateY(-t);
      B.add('trim', worldUV(bx));
    }
    const sh = new T.Shape(); sh.moveTo(-w / 2 + 0.7, 0); sh.lineTo(w / 2 - 0.7, 0); sh.lineTo(w / 2 - 0.7, 3.2);
    sh.quadraticCurveTo(w / 2 - 0.7, 4.6, 0, 5.0); sh.quadraticCurveTo(-w / 2 + 0.7, 4.6, -w / 2 + 0.7, 3.2); sh.lineTo(-w / 2 + 0.7, 0);
    const dg = new T.ShapeGeometry(sh); const pa = dg.attributes.position, ua = new Float32Array(pa.count * 2);
    for (let i = 0; i < pa.count; i++) { ua[i * 2] = (pa.getX(i) + w / 2) / w; ua[i * 2 + 1] = 1 - pa.getY(i) / 5; }
    dg.setAttribute('uv', new T.BufferAttribute(ua, 2)); dg.rotateY(-t);
    const door = new T.Mesh(dg, M.door); door.position.set(...P(rm, t, z)); door.position.x += tangent(t)[0] * 0.05; door.position.z += tangent(t)[2] * 0.05;
    root.add(door);
    const gl = glowSprite(0xff7a30, 6, clips); gl.position.set(...P(rm, t, z + 2.2)); root.add(gl); flick.push({ o: gl, base: 6 });
    lightSrc.push({ p: P(rm, t + 0.06, z + 2), c: 0xff8040, r: 10, i: 1.6, door: true });
  }

  // ---- chandeliers on one chain down the middle, between the turns
  const dome = wallTop + rWall * 0.5;
  const chandH = [];
  for (let k = 0; k < Math.floor(v.turns); k++) chandH.push((k + 0.62) * v.pitch + 1.5);
  front.add('metal', worldUV(new T.CylinderGeometry(0.07, 0.07, dome - chandH[0], 5).translate(0, (dome + chandH[0]) / 2, 0)));
  for (let k = chandH[0] + 0.5; k < dome; k += 0.7) front.add('metal', worldUV(new T.TorusGeometry(0.16, 0.05, 4, 6).rotateY(k * 2).translate(0, k, 0)));
  for (const [i, z] of chandH.entries()) chandelier(front, v.chandelier, z, i, lightSrc, v);

  // ---- the dome over the stairhead (climbing only; the roof deck stands above it)
  {
    const NU = 64, NV = 10;
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const t0 = (i / NU) * Math.PI * 2, t1 = ((i + 1) / NU) * Math.PI * 2, a0 = (j / NV) * Math.PI / 2, a1 = ((j + 1) / NV) * Math.PI / 2;
      const q = (t, a) => P(rWall * Math.cos(a), t, wallTop + rWall * 0.5 * Math.sin(a)), nn = (t, a) => { const x = -Math.cos(a) * Math.cos(t), y = -Math.sin(a) * 2, z = -Math.cos(a) * Math.sin(t), l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
      climb.quad((i % 8 === 0) ? 'trim' : 'stone', q(t0, a0), q(t1, a0), q(t1, a1), q(t0, a1), [nn(t0, a0), nn(t1, a0), nn(t1, a1), nn(t0, a1)], [[t0 * 8, a0 * 6], [t1 * 8, a0 * 6], [t1 * 8, a1 * 6], [t0 * 8, a1 * 6]]);
    }
  }

  // ---- the roof: deck, parapet and merlons, the stairhead turret, three braziers (only when the hero is up there)
  const rz = g.roofZ, RT = g.RT;
  for (let i = 0; i < 128; i++) {
    const t0 = (i / 128) * Math.PI * 2, t1 = ((i + 1) / 128) * Math.PI * 2;
    for (const [r0, r1] of [[0, 4], [4, 9], [9, RT + 0.6]]) {
      const p = [P(r0, t0, rz), P(r1, t0, rz), P(r1, t1, rz), P(r0, t1, rz)];
      roof.quad('paving', ...p, UP, p.map((q) => [q[0] / 2, q[2] / 2]));
    }
    // the parapet: a ring wall from the deck's edge to the outer face
    const a = P(RT + 0.6, t0, rz), b = P(RT + 0.6, t1, rz), u0 = t0 * RT / 1.6, u1 = t1 * RT / 1.6, ph = 0.85;
    roof.quad('stone', a, b, P(RT + 0.6, t1, rz + ph), P(RT + 0.6, t0, rz + ph), [radial(t0, -1), radial(t1, -1), radial(t1, -1), radial(t0, -1)], [[u0, 0], [u1, 0], [u1, ph / 3], [u0, ph / 3]]);
    roof.quad('trim', P(RT + 0.6, t0, rz + ph), P(RT + 0.6, t1, rz + ph), P(rOut + 0.2, t1, rz + ph), P(rOut + 0.2, t0, rz + ph), UP, [[u0, 0], [u1, 0], [u1, 0.4], [u0, 0.4]]);
    roof.quad('stone', P(rOut + 0.2, t0, rz - 0.4), P(rOut + 0.2, t1, rz - 0.4), P(rOut + 0.2, t1, rz + ph), P(rOut + 0.2, t0, rz + ph), [radial(t0), radial(t1), radial(t1), radial(t0)], [[u0, 0], [u1, 0], [u1, 0.5], [u0, 0.5]]);
  }
  for (let i = 0; i < 56; i++) {
    const t = (i / 56) * Math.PI * 2;
    roof.add('stone', wallBox((RT + 0.6 + rOut + 0.2) / 2, t, rz + 1.2, rOut + 0.2 - RT - 0.6 - 0.1, 0.7, 0.8));
  }
  roof.add('mosaic', new T.CircleGeometry(5.2, 48).rotateX(-Math.PI / 2).translate(0, rz + 0.02, 0));
  for (const ca of [Math.PI * 0.25, Math.PI * 0.62, -Math.PI * 0.25, -Math.PI * 0.62]) {   // flags on the parapet
    const t = ca + g.alphaTop, r = (RT + 0.6 + rOut + 0.2) / 2, [x, , zz] = P(r, t, 0), tn = tangent(t);
    roof.add('iron', new T.CylinderGeometry(0.05, 0.06, 3.4, 5).translate(x, rz + 0.85 + 1.7, zz));
    roof.add('gold', new T.SphereGeometry(0.11, 6, 4).translate(x, rz + 0.85 + 3.45, zz));
    const fl = new T.PlaneGeometry(1.5, 1.0), pa = fl.attributes.position;
    for (let k = 0; k < pa.count; k++) pa.setZ(k, Math.sin((pa.getX(k) + 0.75) * 3.2) * 0.12 * (pa.getX(k) + 0.75));   // a wave in the wind
    fl.computeVertexNormals(); fl.rotateY(Math.atan2(tn[0], tn[2]) + Math.PI / 2); fl.translate(x + tn[0] * 0.78, rz + 0.85 + 2.9, zz + tn[2] * 0.78);
    roof.add('banner', fl);
  }
  const tt = g.theta(g.sEnd);
  roof.add('stone', worldUV(new T.CylinderGeometry(2.3, 2.4, 4.6, 32, 1).translate(...P(rc, tt, rz + 2.3))));
  roof.add('slate', worldUV(new T.ConeGeometry(2.9, 3.4, 32, 1).translate(...P(rc, tt, rz + 6.3)), 0.6, 0.6));
  roof.add('gold', worldUV(new T.ConeGeometry(0.12, 1.4, 6).translate(...P(rc, tt, rz + 8.6))));
  {
    const out = P(rc - 2.34, tt, rz);     // the turret's door faces the roof's centre
    const dm = new T.Mesh(new T.PlaneGeometry(1.5, 2.6), M.door); dm.position.set(out[0], rz + 1.3, out[2]); dm.rotation.y = Math.atan2(-Math.cos(tt), -Math.sin(tt)); dm.userData.roof = true;
    root.add(dm);
    lightSrc.push({ p: [out[0], rz + 1.6, out[2]], c: 0xff8040, r: 8, i: 1.2, roof: true });
  }
  for (const ca of [0, Math.PI / 2, Math.PI]) {
    const t = ca + g.alphaTop, r = RT * 0.68;
    roof.add('trim', worldUV(new T.CylinderGeometry(0.75, 0.9, 1.0, 12).translate(...P(r, t, rz + 0.5))));
    roof.add('metal', worldUV(new T.CylinderGeometry(0.85, 0.45, 0.5, 12).translate(...P(r, t, rz + 1.25))));
    roof.add('flame', new T.ConeGeometry(0.5, 1.0, 7).translate(...P(r, t, rz + 1.9)));
    const gl = glowSprite(0xff9040, 4.5); gl.position.set(...P(r, t, rz + 2)); gl.userData.roof = true; root.add(gl); flick.push({ o: gl, base: 4.5 });
    lightSrc.push({ p: P(r, t, rz + 2.4), c: 0xff9a50, r: 9, i: 1.4, roof: true });
  }

  const shell = B.build(M, 'tower'), inner = climb.build(M, 'climb'), top = roof.build(M, 'roof'), fr = front.build(M, 'front');
  inner.add(fr); fr.traverse((o) => o.layers.enable(1));   // the railings and chandeliers: layer 1 is the front pass
  root.add(shell, inner, top);
  // ---- the cut caps: where the cutaway slices a solid, a flat face of dressed stone on the cut. The solid set's back
  // faces count up and its front faces down in the stencil (behind the clip plane only); a quad on the plane fills
  // wherever the count isn't zero, i.e. where the cut runs inside stone (three.js's clipping-stencil technique). The
  // upper cut gets a quad of its own; each quad is clipped by the other plane, so only the one the eye meets first draws.
  const sg = solid.build({}, 'solid').children[0].geometry;
  const writer = (side, op) => new T.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true,
    stencilFunc: T.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op, clippingPlanes: clips });
  const caps = new T.Group(), wb = new T.Mesh(sg, writer(T.BackSide, T.IncrementWrapStencilOp)), wf = new T.Mesh(sg, writer(T.FrontSide, T.DecrementWrapStencilOp));
  for (const m of [wb, wf]) { m.renderOrder = -3; m.frustumCulled = false; caps.add(m); }
  root.add(caps);
  const ct = cutTexture(), capW = 2 * (rOut + 5), capH = g.roofZ + 46;
  ct.repeat.set(capW / 2.4, capH / 2.4);
  const capMat = (map, other) => {
    const m = new T.MeshStandardMaterial({ map, color: 0xb0aaa2, roughness: 1, stencilWrite: true, stencilRef: 0, stencilFunc: T.NotEqualStencilFunc,
      stencilFail: T.ReplaceStencilOp, stencilZFail: T.ReplaceStencilOp, stencilZPass: T.ReplaceStencilOp, clippingPlanes: [other] });
    m.onBeforeCompile = (sh) => fogged(sh); m.customProgramCacheKey = () => 'towercut';
    return m;
  };
  const cap = new T.Mesh(new T.PlaneGeometry(capW, capH), capMat(ct, up));
  cap.position.set(-CUT_C * CUT_N[0], (g.roofZ - 6) / 2, -CUT_C * CUT_N[1]); cap.rotation.y = Math.atan2(-CUT_N[0], -CUT_N[1]);
  cap.renderOrder = -2; cap.frustumCulled = false;
  const ut = cutTexture(); ut.repeat.set(160 / 2.4, 160 / 2.4);
  const upCap = new T.Mesh(new T.PlaneGeometry(160, 160), capMat(ut, clip));   // laid on the upper cut each frame (drawTower3D)
  upCap.renderOrder = -1.5; upCap.frustumCulled = false; upCap.onAfterRender = (r) => r.clearStencil();
  scene.add(cap, upCap);
  for (const o of root.children) if (o.userData.roof) o.visible = false;
  top.visible = false;
  // halos on the lanterns and chandeliers
  for (const l of lightSrc) if (l.halo) { const s = glowSprite(l.c, l.halo, clips); s.position.set(...l.p); root.add(s); flick.push({ o: s, base: l.halo }); }

  // ---- light: a dim fill, a cold moon from the upper left (fixed to the camera), lanterns near the hero
  const amb = new T.AmbientLight(v.ambient, 1.1), hemi = new T.HemisphereLight(v.moon, 0x1a1410, 0.55);
  scene.add(amb, hemi);
  const moon = new T.DirectionalLight(v.moon, 0.9);
  moon.position.copy(new T.Vector3(-0.6, 0.85, 0.5).normalize().transformDirection(rd.cam.matrixWorld).multiplyScalar(100));
  scene.add(moon, moon.target);
  const pool = [];
  for (let i = 0; i < (G.touch ? 4 : 7); i++) { const l = new T.PointLight(0xffffff, 0, 10, 1.4); scene.add(l); pool.push(l); }
  const hero = new T.PointLight(0xffe8c8, 14, 9, 1.3); scene.add(hero);
  for (const l of [amb, hemi, moon, hero, ...pool]) l.layers.enable(1);
  scene.background = skyTexture(v);
  const clouds = cloudLayer(v); scene.add(clouds.grp);
  const moonS = moonSprite(v); scene.add(moonS);

  S = { g, v, M, scene, root, clip, up, climb: inner, roof: top, pool, hero, lightSrc, flick, spin, clouds, ships: [], t: 0, roofOn: false, amb, hemi, moon, caps, cap, upCap, moonS };
  return S;
}
const w16 = (w) => w / 1.6;

/** The railing on the stair's inner edge from s0 to s1, its foot at foot(s). Each variant has its own. */
function railing(B, g, v, s0, s1, foot, lightSrc) {
  const r = g.rIn + 0.16, th = (s) => g.theta(s), kind = v.rail, n = Math.ceil((s1 - s0) / 0.5);
  const railH = kind === 'arcade' ? 0.95 : 1.05;
  // the handrail (or the coping of the parapet): a swept box along the helix
  const hw = kind === 'arcade' ? 0.22 : kind === 'serpent' ? 0.17 : 0.12, hh = kind === 'serpent' ? 0.3 : 0.14;
  for (let j = 0; j < n; j++) {
    const a = s0 + (s1 - s0) * j / n, b = s0 + (s1 - s0) * (j + 1) / n, ta = th(a), tb = th(b), za = foot(a) + railH, zb = foot(b) + railH;
    const mat = kind === 'iron' ? 'iron' : kind === 'serpent' ? 'metal' : 'trim', ua = a / 1.6, ub = b / 1.6;
    B.quad(mat, P(r - hw, ta, za + hh), P(r - hw, tb, zb + hh), P(r + hw, tb, zb + hh), P(r + hw, ta, za + hh), UP, [[ua, 0], [ub, 0], [ub, 0.15], [ua, 0.15]]);
    B.quad(mat, P(r - hw, ta, za), P(r - hw, tb, zb), P(r - hw, tb, zb + hh), P(r - hw, ta, za + hh), [radial(ta, -1), radial(tb, -1), radial(tb, -1), radial(ta, -1)], [[ua, 0], [ub, 0], [ub, 0.15], [ua, 0.15]]);
    B.quad(mat, P(r + hw, ta, za), P(r + hw, tb, zb), P(r + hw, tb, zb + hh), P(r + hw, ta, za + hh), [radial(ta), radial(tb), radial(tb), radial(ta)], [[ua, 0], [ub, 0], [ub, 0.15], [ua, 0.15]]);
    B.quad(mat, P(r - hw, ta, za), P(r + hw, ta, za), P(r + hw, tb, zb), P(r - hw, tb, zb), DOWN, [[ua, 0], [ub, 0], [ub, 0.15], [ua, 0.15]]);
    if (kind === 'arcade') {   // a solid parapet wall carved with the chapel arcade
      const fa = foot(a), fb = foot(b), va = (fa) / 3, vb = (fb) / 3;
      for (const [rr, nk] of [[r - 0.14, -1], [r + 0.14, 1]]) B.quad('trim', P(rr, ta, fa - 0.05), P(rr, tb, fb - 0.05), P(rr, tb, zb), P(rr, ta, za), [radial(ta, nk), radial(tb, nk), radial(tb, nk), radial(ta, nk)],
        [[ua, va], [ub, vb], [ub, vb + railH / 3], [ua, va + railH / 3]]);
    }
  }
  if (kind === 'arcade') return;
  // posts: balusters, iron bars or the serpent's ribs, newels with caps at every quarter turn
  const gap = kind === 'iron' ? 0.42 : kind === 'serpent' ? 1.2 : 0.62;
  for (let s = s0 + gap / 2; s < s1; s += gap) {
    const t = th(s), z = foot(s), [x, , zz] = P(r, t, 0);
    if (kind === 'iron') B.add('iron', new T.CylinderGeometry(0.035, 0.035, railH, 4).translate(x, z + railH / 2, zz));
    else if (kind === 'serpent') B.add('metal', worldUV(new T.CylinderGeometry(0.06, 0.09, railH, 5).translate(x, z + railH / 2, zz)));
    else B.add('trim', worldUV(new T.LatheGeometry([[0.1, 0], [0.13, 0.08], [0.07, 0.25], [0.12, 0.55], [0.07, 0.85], [0.11, railH]].map(([a, b]) => new T.Vector2(a, b)), 6).translate(x, z, zz)));
  }
  const quarter = g.C / 4;
  for (let s = s0 + 0.4; s < s1; s += quarter) {
    const t = th(s), z = foot(s), [x, , zz] = P(r, t, 0);
    B.add('trim', worldUV(new T.BoxGeometry(0.42, railH + 0.25, 0.42).rotateY(-t).translate(x, z + (railH + 0.25) / 2, zz)));
    if (kind === 'serpent') {   // a serpent's head rearing off the newel, looking down the stair
      const tn = tangent(t), hx = x + tn[0] * 0.25, hz = zz + tn[2] * 0.25, zh = z + railH + 0.45;
      const head = new T.SphereGeometry(0.26, 8, 6).scale(1, 0.75, 1.6);
      head.rotateY(-t + Math.PI); head.translate(hx, zh, hz); B.add('metal', worldUV(head));
      const jaw = new T.ConeGeometry(0.16, 0.5, 6).rotateX(Math.PI / 2); jaw.rotateY(-t + Math.PI); jaw.translate(hx + tn[0] * 0.38, zh - 0.08, hz + tn[2] * 0.38); B.add('metal', worldUV(jaw));
      lightSrc.push({ p: [hx + tn[0] * 0.1, zh + 0.05, hz + tn[2] * 0.1], c: 0x60ffb0, r: 2, i: 0.25, halo: 0.6 });
    } else B.add('metal', worldUV(new T.SphereGeometry(0.2, 8, 6).translate(x, z + railH + 0.4, zz)));
  }
}
function window_(B, v, r, t, zc) {
  const kind = v.windows, w = kind === 'slit' ? 0.36 : 0.95, h = kind === 'slit' ? 2.4 : 2.9, tn = tangent(t);
  if (kind === 'rose') {
    const c = new T.CircleGeometry(1.1, 20); c.rotateY(-Math.PI / 2 - t); c.translate(...P(r - 0.02, t, zc + 0.4)); B.add('glass', c);
    const ring = new T.TorusGeometry(1.15, 0.13, 5, 24); ring.rotateY(-Math.PI / 2 - t); ring.translate(...P(r - 0.06, t, zc + 0.4)); B.add('trim', worldUV(ring));
    for (let i = 0; i < 4; i++) { const bar = new T.BoxGeometry(0.08, 2.2, 0.08).rotateZ(i * Math.PI / 4); bar.rotateY(-Math.PI / 2 - t); bar.translate(...P(r - 0.06, t, zc + 0.4)); B.add('trim', worldUV(bar)); }
    return;
  }
  const sh = new T.Shape(); sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2 - w * 0.5);
  sh.quadraticCurveTo(w / 2, h / 2, 0, h / 2 + w * 0.35); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - w * 0.5); sh.lineTo(-w / 2, -h / 2);
  const gl = new T.ShapeGeometry(sh); gl.rotateY(-Math.PI / 2 - t); gl.translate(...P(r - 0.02, t, zc)); B.add('glass', gl);
  // the frame: jambs, sill and a hood mould
  for (const sd of [-1, 1]) B.add('trim', worldUV(new T.BoxGeometry(0.2, h, 0.2).translate(0, 0, 0).rotateY(-t).translate(...P(r - 0.1, t, zc)).translate(tn[0] * sd * (w / 2 + 0.1), 0, tn[2] * sd * (w / 2 + 0.1))));
  B.add('trim', worldUV(new T.BoxGeometry(0.3, 0.18, w + 0.6).rotateY(-t).translate(...P(r - 0.14, t, zc - h / 2 - 0.09))));
  B.add('trim', worldUV(new T.BoxGeometry(0.24, 0.16, w + 0.4).rotateY(-t).translate(...P(r - 0.12, t, zc + h / 2 + w * 0.45))));
}
function banner(B, r, t, ztop) {
  const w = 1.15, h = 3.3, sh = new T.Shape();
  sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, -h); sh.lineTo(0, -h + 0.55); sh.lineTo(-w / 2, -h); sh.lineTo(-w / 2, 0);
  const g = new T.ShapeGeometry(sh), pa = g.attributes.position, uv = new Float32Array(pa.count * 2);
  for (let i = 0; i < pa.count; i++) { uv[i * 2] = (pa.getX(i) + w / 2) / w; uv[i * 2 + 1] = 1 + pa.getY(i) / h; }
  g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.rotateY(-Math.PI / 2 - t); g.translate(...P(r - 0.04, t, ztop));
  B.add('banner', g);
  B.add('metal', worldUV(new T.BoxGeometry(0.12, 0.12, w + 0.4).rotateY(-t).translate(...P(r - 0.08, t, ztop + 0.05))));
}
function lantern(B, r, t, z, lightSrc, color) {
  const out = (k) => P(r - k, t, 0);
  const arm = new T.BoxGeometry(0.75, 0.08, 0.08).rotateY(-t); arm.translate(...out(0.38)); arm.translate(0, z + 0.55, 0); B.add('iron', worldUV(arm));
  const [x, , zz] = out(0.72);
  B.add('iron', worldUV(new T.BoxGeometry(0.4, 0.06, 0.4).rotateY(-t).translate(x, z - 0.32, zz)));
  B.add('iron', worldUV(new T.ConeGeometry(0.3, 0.3, 4).rotateY(Math.PI / 4 - t).translate(x, z + 0.42, zz)));
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const c = Math.cos(-t), s = Math.sin(-t), ox = (dx * c + dz * s) * 0.17, oz = (-dx * s + dz * c) * 0.17;
    B.add('iron', new T.BoxGeometry(0.04, 0.6, 0.04).translate(x + ox, z, zz + oz));
  }
  B.add('lamp', new T.BoxGeometry(0.24, 0.42, 0.24).rotateY(-t).translate(x, z, zz));
  lightSrc.push({ p: [x, z, zz], c: color, r: 8.5, i: 1.25, halo: 2.4 });
}
function chandelier(B, kind, z, i, lightSrc, v) {
  const ring = (r, y, tube = 0.09) => B.add('metal', worldUV(new T.TorusGeometry(r, tube, 6, 36).rotateX(Math.PI / 2).translate(0, y, 0)));
  const candles = (r, y, n, off = 0) => {
    for (let j = 0; j < n; j++) {
      const a = off + (j / n) * Math.PI * 2, x = Math.cos(a) * r, zz = Math.sin(a) * r;
      B.add('trim', new T.CylinderGeometry(0.07, 0.07, 0.34, 5).translate(x, y + 0.17, zz));
      B.add('flame', new T.ConeGeometry(0.06, 0.18, 5).translate(x, y + 0.43, zz));
    }
  };
  const chains = (r, y0, y1, n = 4) => {
    for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2 + i, x = Math.cos(a) * r, zz = Math.sin(a) * r, len = Math.hypot(x, y1 - y0, zz);
      const c = new T.CylinderGeometry(0.03, 0.03, len, 3); c.translate(0, len / 2, 0);
      c.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(-x, y1 - y0, -zz).normalize())); c.translate(x, y0, zz);
      B.add('metal', c);
    }
  };
  if (kind === 'bell') {
    const prof = [[0.05, 2.3], [0.7, 2.25], [1.0, 1.9], [1.1, 1.2], [1.35, 0.4], [1.75, 0.0], [1.6, -0.08]].map(([a, b]) => new T.Vector2(a * 0.72, b * 0.72));
    B.add('gold', worldUV(new T.LatheGeometry(prof, 24).translate(0, z - 0.6, 0)));
    B.add('metal', worldUV(new T.SphereGeometry(0.22, 8, 6).translate(0, z - 0.72, 0)));
    ring(1.5, z - 0.62, 0.06); candles(1.5, z - 0.62, 10, i);
    lightSrc.push({ p: [0, z - 0.4, 0], c: v.lantern, r: 10, i: 1.4, halo: 4.5 });
    return;
  }
  if (kind === 'crystal') {
    ring(1.8, z, 0.08); ring(1.1, z + 0.6, 0.07); chains(1.8, z, z + 2.2);
    for (let j = 0; j < 14; j++) { const a = (j / 14) * Math.PI * 2, x = Math.cos(a) * 1.8, zz = Math.sin(a) * 1.8; B.add('crystal', new T.OctahedronGeometry(0.2).scale(1, 2.2, 1).translate(x, z - 0.55, zz)); }
    for (let j = 0; j < 7; j++) { const a = (j / 7) * Math.PI * 2, x = Math.cos(a) * 1.1, zz = Math.sin(a) * 1.1; B.add('crystal', new T.OctahedronGeometry(0.16).scale(1, 2.4, 1).translate(x, z + 0.05, zz)); }
    B.add('crystal', new T.OctahedronGeometry(0.45).scale(1, 2.6, 1).translate(0, z - 0.6, 0));
    lightSrc.push({ p: [0, z, 0], c: v.glass, r: 10, i: 1.3, halo: 5 });
    return;
  }
  if (kind === 'crown') {
    ring(2.0, z, 0.1); ring(2.0, z + 0.55, 0.08); chains(2.0, z + 0.55, z + 2.6);
    for (let j = 0; j < 16; j++) { const a = (j / 16) * Math.PI * 2; B.add('metal', new T.ConeGeometry(0.11, 0.7, 4).translate(Math.cos(a) * 2, z + 0.9, Math.sin(a) * 2)); }
    for (let j = 0; j < 8; j++) { const a = (j / 8) * Math.PI * 2; B.add('metal', new T.BoxGeometry(0.06, 0.55, 0.06).translate(Math.cos(a) * 2, z + 0.27, Math.sin(a) * 2)); }
    candles(2.0, z + 0.08, 12, 0.2);
    lightSrc.push({ p: [0, z + 0.4, 0], c: v.lantern, r: 11, i: 1.4, halo: 5.5 });
    return;
  }
  if (kind === 'candelabra') {
    const tiers = [[2.1, 0], [1.45, 0.75], [0.8, 1.5]];
    for (const [r, y] of tiers) { ring(r, z + y, 0.08); candles(r, z + y, Math.round(r * 7), y); }
    B.add('metal', worldUV(new T.CylinderGeometry(0.1, 0.16, 2.2, 6).translate(0, z + 0.7, 0)));
    for (const [r, y] of tiers) for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2 + y; B.add('metal', new T.BoxGeometry(r, 0.05, 0.05).rotateY(-a).translate(Math.cos(a) * r / 2, z + y, Math.sin(a) * r / 2)); }
    lightSrc.push({ p: [0, z + 0.8, 0], c: v.lantern, r: 11, i: 1.5, halo: 6 });
    return;
  }
  // 'ring': a cartwheel of iron with spokes and a crown of candles
  ring(1.9, z, 0.11); ring(0.5, z, 0.08); chains(1.9, z, z + 2.4);
  for (let j = 0; j < 6; j++) { const a = (j / 6) * Math.PI * 2 + i; B.add('metal', new T.BoxGeometry(1.4, 0.06, 0.06).rotateY(-a).translate(Math.cos(a) * 1.2, z, Math.sin(a) * 1.2)); }
  candles(1.9, z + 0.06, 14, i);
  lightSrc.push({ p: [0, z + 0.3, 0], c: v.lantern, r: 10, i: 1.4, halo: 5 });
}

/** What only one variant has: violet runes down the Obsidian Coil's stringer, candles on the Bloodstone Spire's steps,
 * icicles under the Rimeglass Tower's stair, small bells under the Sunken Bell Tower's, ivy on the Serpentine's wall. */
function extras(B, climb, g, v, lightSrc) {
  const { rIn, rWall, d, rise, L } = g, th = (s) => g.theta(s), tread = (s) => (Math.floor(s / d) + 1) * rise;
  let h = 1234567;
  const rnd = () => ((h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) | 0) >>> 0) / 4294967296;
  if (v.extra === 'runes') for (let s = 0; s < L; s += d / 2) {
    const t0 = th(s), t1 = th(s + d / 2), z0 = s * g.slope - 0.62, z1 = (s + d / 2) * g.slope - 0.62;
    B.quad('rune', P(rIn - 0.015, t0, z0), P(rIn - 0.015, t1, z1), P(rIn - 0.015, t1, z1 + 0.09), P(rIn - 0.015, t0, z0 + 0.09), [radial(t0, -1), radial(t1, -1), radial(t1, -1), radial(t0, -1)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    if (Math.round(s / d) % 9 === 0) lightSrc.push({ p: P(rIn - 0.3, t0, z0), c: v.glass, r: 3, i: 0.3, halo: 0.9 });
  }
  if (v.extra === 'icicles') for (let s = 0.3; s < L; s += 0.55 + rnd() * 0.5) {
    const t = th(s), len = 0.35 + rnd() * rnd() * 1.6, z = s * g.slope - 1.4, [x, , zz] = P(rIn + 0.12 + rnd() * 0.25, t, 0);
    B.add('crystal', new T.ConeGeometry(0.06 + len * 0.04, len, 5).rotateX(Math.PI).translate(x, z - len / 2, zz));
  }
  if (v.extra === 'candles') for (let s = 2; s < g.sEnd; s += 4.2 + rnd() * 2) {
    const t = th(s), z = s > L ? g.H : tread(s);
    for (let i = 0; i < 3; i++) {
      const hh = 0.18 + rnd() * 0.3, [x, , zz] = P(rWall - 0.3 - rnd() * 0.25, t + (rnd() - 0.5) * 0.06, 0);
      B.add('trim', new T.CylinderGeometry(0.06, 0.07, hh, 6).translate(x, z + hh / 2, zz));
      B.add('flame', new T.ConeGeometry(0.045, 0.14, 5).translate(x, z + hh + 0.08, zz));
    }
    lightSrc.push({ p: P(rWall - 0.4, t, z + 0.5), c: 0xffa050, r: 4, i: 0.5, halo: 1.3 });
  }
  if (v.extra === 'bells') for (let s = 3; s < L; s += 7) {
    const t = th(s), z = s * g.slope - 1.4, [x, , zz] = P(rIn + 0.18, t, 0);
    B.add('iron', new T.CylinderGeometry(0.025, 0.025, 0.5, 4).translate(x, z - 0.25, zz));
    const prof = [[0.02, 0.42], [0.14, 0.4], [0.2, 0.26], [0.24, 0.06], [0.32, 0], [0.3, -0.03]].map(([a, b]) => new T.Vector2(a, b));
    B.add('gold', worldUV(new T.LatheGeometry(prof, 10).translate(x, z - 0.92, zz)));
  }
  if (v.extra === 'serpent') for (let s = 1; s < L; s += 2.2 + rnd() * 2.4) {   // ivy creeping up the wall from the skirting
    const t = th(s), z = tread(s) + 0.4, hgt = 0.8 + rnd() * 2.6;
    for (let k = 0; k < hgt / 0.22; k++) {
      const tt = t + (rnd() - 0.5) * 0.05, leaf = new T.CircleGeometry(0.13 + rnd() * 0.08, 5);
      leaf.rotateY(-Math.PI / 2 - tt); leaf.translate(...P(rWall - 0.07, tt, z + k * 0.22 + rnd() * 0.1));
      B.add('ivy', leaf);
    }
  }
}

// ------------------------------------------------------------------ sky and clouds
/** The night: the variant's gradient with stars thinning toward the horizon (drawn behind everything, screen-fixed). */
function skyTexture(v) {
  const c = makeCanvas(256, 256), x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, v.sky[0]); gr.addColorStop(0.55, v.sky[1]); gr.addColorStop(1, v.sky[2]);
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  let h = 99;
  const rnd = () => ((h = (Math.imul(h ^ (h >>> 13), 1274126177) + 0x6d2b79f5) | 0) >>> 0) / 4294967296;
  for (let i = 0; i < 260; i++) {
    const y = rnd() * rnd() * 220, a = 0.25 + rnd() * 0.75 * (1 - y / 240);
    x.fillStyle = `rgba(255,248,230,${a.toFixed(2)})`; x.fillRect(rnd() * 256 | 0, y | 0, 1, 1);
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.magFilter = T.NearestFilter; return t;
}
/** The moon: a pale disc with a softer halo, kept at a fixed spot on screen (drawTower3D). */
function moonSprite(v) {
  const c = makeCanvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 8, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#f4f0e6'; x.beginPath(); x.arc(32, 32, 11, 0, 7); x.fill();
  x.fillStyle = 'rgba(160,150,140,0.35)'; for (const [a, b, r] of [[28, 29, 3], [36, 35, 2], [33, 26, 1.5]]) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  const s = new T.Sprite(new T.SpriteMaterial({ map: t, color: v.moon, transparent: true, depthWrite: false, fog: false }));
  s.scale.setScalar(6); s.renderOrder = -5;
  return s;
}
/** Pixel clouds drifting behind and below the tower (camera frame: they don't turn with it). */
function cloudLayer(v) {
  const grp = new T.Group(), list = [], tex = [];
  for (let k = 0; k < 4; k++) {
    const c = makeCanvas(192, 96), x = c.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const cx = 30 + Math.random() * 132, cy = 50 + Math.random() * 18 - Math.abs(cx - 96) * 0.12, r = 14 + Math.random() * 20;
      const gr = x.createRadialGradient(cx - r * 0.25, cy - r * 0.35, r * 0.1, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.35, v.cloud); gr.addColorStop(1, v.cloud + '00');
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; tex.push(t);
  }
  for (let i = 0; i < 26; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex[i % 4], transparent: true, opacity: 0.55 + Math.random() * 0.3, depthWrite: false }));
    const w = 14 + Math.random() * 22; s.scale.set(w, w / 2, 1);
    list.push({ s, a: Math.random() * Math.PI * 2, d: 34 + Math.random() * 40, y: -20 + Math.random() * 90, sp: (Math.random() - 0.5) * 0.01 });
    grp.add(s);
  }
  return { grp, list };
}

// ------------------------------------------------------------------ each frame
/** Game time for the 3D: ships fly and dock, muzzle flashes fade, flames flicker, clouds drift (game/tower.js update). */
export function tickTower3D(dt, tw) {
  if (!S || S.g !== tw.g) return;
  S.t += dt;
  for (const sh of [...S.ships]) sh.update(dt, S.t);
  tickTowerFx(dt);
  for (const f of S.flick) f.o.scale.setScalar(f.base * (0.9 + 0.1 * Math.sin(S.t * 11 + f.base * 3)));
  for (const c of S.clouds.list) c.a += c.sp * dt;
}
/**
 * Draw the tower behind the sprites: tw = world.tower (game/tower.js: alpha, clip, roof, focus). The 3D view is
 * rendered at one pixel per world px (less on touch) and scaled up without smoothing, like the pixel art over it.
 */
export function drawTower3D(ctx, tw) {
  const W = G.W * G.dpr, H = G.H * G.dpr;
  if (!S || S.g !== tw.g) { ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H); return; }
  const rd = renderer(), z = camera.zoom, q = G.touch ? 0.75 : 1;
  const pw = Math.max(16, Math.round(G.W / z * q)), ph = Math.max(16, Math.round(G.H / z * q));
  if (rd.w !== pw || rd.h !== ph) { rd.gl.setSize(pw, ph, false); rd.w = pw; rd.h = ph; }
  const cx = camera.x + camera.shakeX, cy = camera.y + camera.shakeY, hw = G.W / 2 / z, hh = G.H / 2 / z, cam = rd.cam;
  cam.left = (cx - hw) / SC; cam.right = (cx + hw) / SC; cam.top = -(cy - hh) / SC; cam.bottom = -(cy + hh) / SC; cam.updateProjectionMatrix();
  S.root.rotation.y = tw.alpha;
  S.clip.constant = tw.roof ? 1e6 : CUT_C;
  // the upper cut, held on the hero (world/tower.js upCut), and its cap quad laid on it facing the camera
  const [fx, fy, fz] = tw.focus, k = UP_K / Math.SQRT2, un = UPN.set(-(k + UP_D), -1, k - UP_D).normalize();
  S.up.setFromNormalAndCoplanarPoint(un, UPP.set(fx, fy + UP_H, fz));
  if (tw.roof) S.up.constant = 1e6;
  S.upCap.position.copy(UPP); S.upCap.quaternion.setFromUnitVectors(UPZ, un.negate());
  if (S.roofOn !== tw.roof) {
    S.roofOn = tw.roof; S.roof.visible = tw.roof; S.climb.visible = !tw.roof; S.caps.visible = S.cap.visible = S.upCap.visible = !tw.roof;
    S.amb.intensity = tw.roof ? 1.9 : 1.1; S.hemi.intensity = tw.roof ? 1.3 : 0.55; S.moon.intensity = tw.roof ? 2.6 : 0.9;   // the open sky
    for (const o of S.root.children) if (o.userData.roof) o.visible = tw.roof;
  }
  // lanterns nearest the hero get the point lights; the rest glow on their own
  const ca = Math.cos(tw.alpha), sa = Math.sin(tw.alpha);
  const near = [];
  for (const l of S.lightSrc) {
    if (!!l.roof !== tw.roof) continue;
    const x = l.p[0] * ca + l.p[2] * sa, zz = -l.p[0] * sa + l.p[2] * ca, y = l.p[1];
    const dd = (x - fx) ** 2 + (y - fy) ** 2 + (zz - fz) ** 2;
    if (dd < 900) near.push([dd, x, y, zz, l]);
  }
  for (const sh of S.ships) for (const l of sh.lights) { sh.root.localToWorld(l.v.set(...l.p)); near.push([(l.v.x - fx) ** 2 + (l.v.y - fy) ** 2 + (l.v.z - fz) ** 2, l.v.x, l.v.y, l.v.z, l]); }
  near.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < S.pool.length; i++) {
    const L = S.pool[i], n = near[i];
    if (!n) { L.intensity = 0; continue; }
    const l = n[4], fl = 0.88 + 0.12 * Math.sin(S.t * 9 + i * 1.7) * Math.sin(S.t * 5.3 + i);
    L.position.set(n[1], n[2], n[3]); L.color.setHex(l.c); L.distance = l.r; L.intensity = 16 * l.i * fl;
  }
  S.hero.position.set(fx, fy + 2.2, fz);
  FOG.y.value = fy; FOG.k.value = tw.roof ? 0 : 1;
  // the moon keeps its place on screen, a fifth of the way in from the upper left, behind everything
  const mx = cam.left + (cam.right - cam.left) * 0.2, my = cam.top - (cam.top - cam.bottom) * 0.16;
  S.moonS.position.set(0.7071 * mx - 0.3536 * my, 0.866 * my, -0.7071 * mx - 0.3536 * my).addScaledVector(cam.position, -0.8);
  for (const c of S.clouds.list) {
    // behind the tower (far side of the camera), below it on the roof
    const ang = -Math.PI * 0.75 + Math.sin(c.a) * 1.3, d = c.d;
    c.s.position.set(Math.cos(ang) * d, tw.roof ? tw.g.roofZ - 30 + c.y * 0.3 : c.y * (tw.g.H + 30) / 90 - 8, Math.sin(ang) * d);
  }
  rd.gl.render(S.scene, cam);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(rd.gl.domElement, 0, 0, W, H);
  ctx.imageSmoothingEnabled = sm;
  // the front pass: the railings and chandeliers again, alone, against the scene's depth, so whatever stands behind
  // them in the 2D pass (bodies at the railing, things on the far stair) is drawn under them (drawTowerFront)
  S.frontOn = !tw.roof;
  if (S.frontOn) {
    const bg = S.scene.background, gl = rd.gl;
    S.scene.background = null; gl.autoClear = false; gl.setClearColor(0x000000, 0); gl.clearColor();
    cam.layers.set(1); gl.render(S.scene, cam); cam.layers.set(0);
    gl.autoClear = true; S.scene.background = bg;
    const f = S.front2d && S.front2d.width === pw && S.front2d.height === ph ? S.front2d : (S.front2d = makeCanvas(pw, ph));
    const fx = f.getContext('2d'); fx.clearRect(0, 0, pw, ph); fx.drawImage(gl.domElement, 0, 0);
  }
}
/** The front pass over the sprites (render.js, after the depth-sorted pass). */
export function drawTowerFront(ctx) {
  if (!S || !S.frontOn || !S.front2d) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(S.front2d, 0, 0, G.W * G.dpr, G.H * G.dpr);
  ctx.restore();
}

export function disposeTower3D() {
  if (!S) return;
  S.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  for (const m of Object.values(S.M)) { m.map?.dispose(); m.bumpMap?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
  // this tower's own textures and materials outside M (the shared halo and the airships' materials stay)
  for (const m of [S.cap.material, S.upCap.material, S.moonS.material, ...S.clouds.list.map((c) => c.s.material)]) { m.map?.dispose(); m.dispose(); }
  S.scene.background?.dispose();
  S = null;
}

// ------------------------------------------------------------------ airships
let AS = null;   // the airship modules and their materials
export async function loadAirships() {
  if (AS) return AS;
  const [a, i, k] = await Promise.all([import('../../tools/airship3d.js'), import('../../tools/airship3d_ironclad.js'), import('../../tools/airship3d_skiffs.js')]);
  const M = await a.airshipMaterials(AIRDIR);
  AS = { a, i, k, M };
  return AS;
}
export const airshipsReady = () => !!AS;

/**
 * Bring a ship to the roof (camera frame, tiles): kind galleon | ironclad | gasbag | cutter | hauler, docking at angle
 * phi (camera frame) with its starboard side to the roof. Returns a handle: state 'in' -> 'docked' (ramp down) ->
 * 'out' -> 'gone'; board() gives the boarding path, leave() sends it off, sink() burns it down. Setting rush hurries
 * the approach and the ramp.
 */
export function spawnShip(kind, phi, g, o = {}) {
  if (!AS || !S) return null;
  const big = kind === 'galleon' || kind === 'ironclad';
  const ship = kind === 'galleon' ? AS.a.buildAirship(AS.M) : kind === 'ironclad' ? AS.i.buildIronclad(AS.M) : AS.k.buildSkiff(AS.M, kind, 1);
  const root = new T.Group(), hold = new T.Group(); hold.add(ship.root); root.add(hold); S.scene.add(root);
  if (o.tint) ship.root.traverse((m) => { if (m.material && m.material.color) { m.material = m.material.clone(); m.material.color.multiply(new T.Color(o.tint)); if (o.ghost) { m.material.transparent = true; m.material.opacity = 0.72; } } });
  const lights = [];
  for (const gl of ship.info.glow || []) {
    const s = glowSprite(gl.c, gl.r); s.position.set(gl.x, gl.y, gl.z); ship.root.add(s);
    if (gl.light || gl.r > 2.5) lights.push({ p: [gl.x, gl.y, gl.z], c: gl.c, r: gl.lr || 7, i: 1.1, v: new T.Vector3() });
  }
  const rOut = g.rWall + 1.6, rz = g.roofZ, ux = Math.cos(phi), uz = Math.sin(phi);
  root.rotation.y = Math.PI - phi;
  // where it stops: a big ship hangs its gangplank on the parapet, a boat drops its own ramp on it
  let dock, deckY, plank = null;
  const axis = [Math.sin(phi), -Math.cos(phi)];   // the ship's local +z (stern) in the camera frame
  if (big) {
    const D = rOut + 6.2 + 1.6;
    dock = [ux * D, uz * D]; deckY = rz + 0.45;
    plank = AS.a.ramp(AS.M, 'deck', D - 6.2 - g.RT - 0.4, 1.8, 1); plank.position.set(6.1, 1.0, 0); ship.root.add(plank);
  } else {
    const reach = ship.info.rampLen * Math.cos(0.1), D = rOut - 0.3 + reach + ship.info.rampX;
    dock = [ux * D - axis[0] * ship.info.rampZ, uz * D - axis[1] * ship.info.rampZ];
    deckY = rz + 1.25 + reach * Math.tan(0.1) - ship.info.rampY;
  }
  const from = o.from ?? 1, start = [dock[0] + axis[0] * 55 * from + ux * 22, dock[1] + axis[1] * 55 * from + uz * 22];
  const h = {
    kind, big, root, ship, lights, state: 'in', t: 0, dur: o.dur || 6, phi, dock, deckY, ramp: 0, sinkT: 0, fire: [],
    update(dt, t) {
      this.t += dt;
      const bob = Math.sin(t * 0.8 + phi) * 0.22;
      if (this.state === 'in') {
        // rush (set by game/tower.js when the hero has nothing to fight): the rest of the approach takes 0.3 s
        if (this.rush) { this.rushK ??= Math.max(1, (this.dur - this.t) / 0.3); this.t += dt * (this.rushK - 1); }
        const k = Math.min(1, this.t / this.dur), e = 1 - Math.pow(1 - k, 3);
        root.position.set(start[0] + (dock[0] - start[0]) * e, deckY + 9 * (1 - e) + bob, start[1] + (dock[1] - start[1]) * e);
        hold.rotation.z = -0.06 * (1 - k);
        if (k >= 1) { this.state = 'docked'; this.t = 0; }
      } else if (this.state === 'docked') {
        root.position.set(dock[0], deckY + bob, dock[1]);
        this.ramp = Math.min(1, this.ramp + dt * (this.rush ? 6 : 0.8));
      } else if (this.state === 'out') {
        this.ramp = Math.max(0, this.ramp - dt * 1.5);
        const k = Math.min(1, this.t / 6), e = k * k;
        root.position.set(dock[0] - axis[0] * 60 * e + ux * 18 * e, deckY + 6 * e + bob, dock[1] - axis[1] * 60 * e + uz * 18 * e);
        if (k >= 1) this.remove();
      } else if (this.state === 'sink') {
        this.sinkT += dt; const k = this.sinkT;
        root.position.set(dock[0] + ux * k * 2.5, deckY - 0.6 * k * k + bob, dock[1] + uz * k * 2.5);
        hold.rotation.z = -0.08 * k; hold.rotation.x = 0.04 * k;
        if (this.fire.length < 14 && Math.random() < dt * 8) {
          const s = glowSprite(Math.random() < 0.5 ? 0xff6020 : 0xffb040, 2 + Math.random() * 3);
          s.position.set((Math.random() - 0.5) * 10, 1 + Math.random() * 3, (Math.random() - 0.5) * 30); ship.root.add(s); this.fire.push(s);
        }
        for (const f of this.fire) f.scale.setScalar(f.scale.x * (0.98 + Math.random() * 0.05) + 0.02);
        if (k > 9) this.remove();
      }
      if (plank) plank.userData.set(this.ramp); else if (ship.setRamp) ship.setRamp(this.ramp);
      ship.anim?.(t, dt);
    },
    leave() { if (this.state !== 'gone' && this.state !== 'sink') { this.state = 'out'; this.t = 0; } },
    sink() { if (this.state !== 'gone') { this.state = 'sink'; this.sinkT = 0; } },
    remove() { this.state = 'gone'; S.scene.remove(root); const i = S.ships.indexOf(this); if (i >= 0) S.ships.splice(i, 1); },
    get ready() { return this.state === 'docked' && this.ramp >= 1; },
    /** The walk off the ship onto the roof, as camera-frame points [x, z, height] (tiles), lane j of n. */
    board(j = 0, n = 1) {
      const lane = (j - (n - 1) / 2) * 0.55;
      const along = (d) => [dock[0] - ux * d + axis[0] * lane, dock[1] - uz * d + axis[1] * lane];
      if (big) {
        const D = Math.hypot(dock[0], dock[1]);
        return [[...along(2.5 + j * 0.3), deckY], [...along(6), deckY + 1.0], [...along(D - g.RT - 0.3), rz + 1.15], [...along(D - g.RT + 0.9), rz]];
      }
      const hz = ship.info.rampZ, deck = [dock[0] + axis[0] * (hz - 1.2 - j * 0.6), dock[1] + axis[1] * (hz - 1.2 - j * 0.6)];
      const hinge = [dock[0] - ux * ship.info.rampX + axis[0] * hz, dock[1] - uz * ship.info.rampX + axis[1] * hz];
      return [[...deck, deckY], [...hinge, deckY + ship.info.rampY], [ux * (rOut - 0.3), uz * (rOut - 0.3), rz + 1.2], [ux * (g.RT - 0.7), uz * (g.RT - 0.7), rz]];
    },
    /** Camera-frame point of the ship's side facing the roof, for a broadside's muzzle flash. */
    gun(f) { return [dock[0] - ux * 6 + axis[0] * (f - 0.5) * 24, deckY + 0.4, dock[1] - uz * 6 + axis[1] * (f - 0.5) * 24]; },
    flash(f) {
      const p = this.gun(f), s = glowSprite(0xffd080, 4); s.position.set(...p); S.scene.add(s);
      let life = 0.35; const tick = { update: (dt) => { life -= dt; s.scale.setScalar(4 + (0.35 - life) * 10); s.material.opacity = Math.max(0, life / 0.35); if (life <= 0) { S.scene.remove(s); return false; } return true; } };
      S.fx.push(tick);
    },
  };
  S.fx ||= [];
  S.ships.push(h);
  return h;
}
/** Short-lived 3D effects (muzzle flashes) tick with the ships. */
export function tickTowerFx(dt) {
  if (!S || !S.fx) return;
  for (let i = S.fx.length - 1; i >= 0; i--) if (!S.fx[i].update(dt)) S.fx.splice(i, 1);
}
export function clearShips() { if (S) for (const sh of [...S.ships]) sh.remove(); }
