// DEPTH'S EDGE CAVERNS in three.js (docs/DEPTHS_EDGE.md): the whole cave is one height field (world/caverns.js),
// drawn live behind the 2D sprites each frame with the game's own camera (orthographic, 30 degrees down, 45 round; one
// unit = one tile, so a tile position at height h lands where isoX/isoY put it with the field as the elevation).
// Floors and walls blend smoothly by slope, triplanar, from the pack's seamless tiles (palette swapped per variant);
// rock fades into the dark above each region's wall height. Stalactites hang live in front of the tall back walls;
// free-standing stalagmites, clusters, columns and the stalactites over open floor are the same 3D models baked to
// sprites, because they must hide whoever walks behind them (game/caverns.js draws them in the depth-sorted pass).
// Water: the lake, the cavern pools, the river across the plateau, the shaft's pool, all from the pack's water tiles in
// the variant's blues; the waterfall is a scrolling curtain with spray, mist and four blues of droplets. Around the
// hero, terrain nearer the camera and higher than his feet is cut away (the shaft's upper ledges would hide him).
import { G } from '../state.js';
import { camera, HW, HH } from '../core/view.js';
import { recolor, makeCanvas } from '../core/util.js';
import { VZ, CAVE_VARIANTS, CAVE_S, vnoise } from '../world/caverns.js';

const SC = HW * Math.SQRT2;                 // world px per tile (one three.js unit) across the screen
const DIR = 'assets/tiles/depths_edge/';
let T = null;                               // three
let R = null;                               // the renderer and its camera
let S = null;                               // the scene of the cave being played
const IMG = new Map();
const loadImg = (src) => IMG.get(src) || IMG.set(src, new Promise((ok, no) => {
  const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Failed to load ' + src)); im.src = src;
})).get(src);
const files = (v) => [...v.floors, ...v.walls].map((k) => DIR + 'tex/' + k + '.webp').concat([DIR + 'hd/' + v.hd + '.webp', DIR + 'water/' + v.water + '.webp']);

/** three.js and a variant's textures (all six if vi is null). Rejects if three.js can't be fetched. */
export async function loadCave3D(vi = null) {
  if (!T) T = await import('three');
  const vs = vi == null ? CAVE_VARIANTS : [CAVE_VARIANTS[vi % CAVE_VARIANTS.length]];
  await Promise.all(vs.flatMap(files).map(loadImg));
}
export const cave3dReady = () => !!T;

function renderer() {
  if (R) return R;
  const gl = new T.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  gl.setPixelRatio(1);
  const cam = new T.OrthographicCamera(-10, 10, 10, -10, 1, 1600);
  const e = Math.PI / 6, a = Math.PI / 4;
  cam.position.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).multiplyScalar(800);
  cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  R = { gl, cam, w: 0, h: 0 };
  return R;
}
const rgb3 = (hex) => { const n = parseInt(hex.slice(1), 16); return new T.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const col = (hex) => new T.Color(hex);

// ------------------------------------------------------------------ textures
function tex(canvas, { srgb = true, mirror = false } = {}) {
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.wrapS = t.wrapT = mirror ? T.MirroredRepeatWrapping : T.RepeatWrapping;
  t.magFilter = T.NearestFilter; t.anisotropy = 4;
  return t;
}
/** One 510 px panel of a 3x2 sheet (3 px gutters). */
const panel = (img, k, swap) => recolor(img, swap, (k % 3) * 513, Math.floor(k / 3) * 513, 510, 510);
/** A soft cloud for the mist and spray (alpha only). */
function puffTexture() {
  const c = makeCanvas(64, 64), x = c.getContext('2d'), d = x.createImageData(64, 64);
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
    const r = Math.hypot(i - 31.5, j - 31.5) / 32, n = vnoise(i * 0.12, j * 0.12, 5) * 0.6 + vnoise(i * 0.3, j * 0.3, 9) * 0.4;
    const a = Math.max(0, 1 - r) ** 1.6 * (0.45 + 0.75 * n);
    d.data.set([255, 255, 255, Math.min(255, a * 255)], (j * 64 + i) * 4);
  }
  x.putImageData(d, 0, 0);
  const t = new T.CanvasTexture(c); t.colorSpace = T.NoColorSpace;
  return t;
}
let haloTex = null;
function halo() {
  if (haloTex) return haloTex;
  const c = makeCanvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(0.2, '#fffa'); g.addColorStop(1, '#fff0');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  haloTex = new T.CanvasTexture(c); haloTex.colorSpace = T.SRGBColorSpace;
  return haloTex;
}
const glow = (color, size, opacity = 1) => {
  const s = new T.Sprite(new T.SpriteMaterial({ map: halo(), color, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size); return s;
};

// ------------------------------------------------------------------ the terrain material
const CUT = `
uniform vec4 uCut; uniform vec2 uCutR;
bool caveCut(vec3 p) {
  if (uCut.w < 0.5) return false;
  float dz = (p.x + p.z) - (uCut.x + uCut.z);
  // the rock's inner (back) faces go too, at any depth: left standing they filled the hole with a dark slab (gfx/dunes3d.js)
  if ((dz < 0.35 && gl_FrontFacing) || p.y < uCut.y + 0.75) return false;
  vec2 sp = vec2((p.x - p.z) * 32.0, (p.x + p.z) * 16.0 - p.y * 39.19);
  vec2 sh = vec2((uCut.x - uCut.z) * 32.0, (uCut.x + uCut.z) * 16.0 - uCut.y * 39.19 - 30.0);
  float r = length((sp - sh) / uCutR);
  if (r >= 1.0) return false;
  float th = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  return r < 0.78 || th > (r - 0.78) / 0.22;
}`;
function terrainMaterial(M) {
  const m = new T.MeshStandardMaterial({ roughness: 0.93, metalness: 0, side: T.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, M.uni);
    sh.vertexShader = 'attribute vec4 cmat; attribute float cceil;\nvarying vec3 vWp; varying vec3 vWn; varying vec4 vMat; varying float vCeil;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvWp = position; vWn = normal; vMat = cmat; vCeil = cceil;');
    sh.fragmentShader = `uniform sampler2D tFA, tFB, tWA, tWB, tHD; uniform float uTS, uBump; uniform vec3 uFog, uCapC, uWetC;
varying vec3 vWp; varying vec3 vWn; varying vec4 vMat; varying float vCeil;
float caveH = 0.0;
${CUT}
vec3 perturbCave(vec3 sp, vec3 sn, vec2 dH, float fd) {
  vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd;
  return normalize(abs(det) * sn - sign(det) * (dH.x * r1 + dH.y * r2));
}
` + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (caveCut(vWp)) discard;')
      .replace('#include <map_fragment>', `
  vec3 n = normalize(vWn), w = pow(abs(n), vec3(8.0)); w /= (w.x + w.y + w.z);
  vec2 uxz = vWp.xz * uTS, uxy = vec2(vWp.x, -vWp.y * 1.1) * uTS, uzy = vec2(vWp.z, -vWp.y * 1.1) * uTS;
  vec3 floorC = mix(texture2D(tFA, uxz).rgb, texture2D(tFB, uxz).rgb, vMat.x);
  vec3 wA = texture2D(tWA, uxy).rgb * w.z + texture2D(tWA, uzy).rgb * w.x + texture2D(tWA, uxz).rgb * w.y;
  vec3 wB = texture2D(tWB, uxy).rgb * w.z + texture2D(tWB, uzy).rgb * w.x + texture2D(tWB, uxz).rgb * w.y;
  vec3 hd = texture2D(tHD, vec2(vWp.x - vWp.z, -vWp.y * 1.1) * 0.088).rgb;
  vec3 wallC = mix(mix(wA, wB, vMat.y), hd, 0.25 * smoothstep(0.5, 0.0, abs(n.y)));
  vec3 alb = mix(wallC, floorC, smoothstep(0.55, 0.86, n.y));
  alb = mix(alb, alb * uWetC, vMat.z * 0.6);
  alb *= mix(0.5, 1.0, vMat.w) * mix(0.66, 1.0, smoothstep(0.4, 0.9, n.y));
  caveH = dot(alb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb *= alb;`)
      .replace('#include <normal_fragment_maps>', 'normal = perturbCave(-vViewPosition, normal, vec2(dFdx(caveH), dFdy(caveH)) * uBump, faceDirection);')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, smoothstep(vCeil - 1.7, vCeil + 0.5, vWp.y));
  if (!gl_FrontFacing) gl_FragColor.rgb = uCapC + diffuseColor.rgb * 0.16;`);
  };
  m.customProgramCacheKey = () => 'caveterrain';
  return m;
}
/** A standard material that fades into the dark above the ceiling and is cut round the hero like the terrain. */
function darkened(m, M, key) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, M.uni);
    sh.vertexShader = 'varying vec3 vWp2;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp2 = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWp2 = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    sh.fragmentShader = 'varying vec3 vWp2;\n' + CUT + '\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (caveCut(vWp2)) discard;');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// ------------------------------------------------------------------ build
/** The scene of one cave (generateCaverns' cave). Synchronous once loadCave3D has fetched the variant's images. */
export async function buildCave3D(cv) {
  if (S && S.cv === cv) return S;
  disposeCave3D();
  renderer();
  const v = cv.v;
  const [fa, fb, wa, wb] = await Promise.all([...v.floors, ...v.walls].map((k) => loadImg(DIR + 'tex/' + k + '.webp')));
  const hdImg = await loadImg(DIR + 'hd/' + v.hd + '.webp'), waterImg = await loadImg(DIR + 'water/' + v.water + '.webp');
  const M = {
    fa: tex(recolor(fa, v.swap)), fb: tex(recolor(fb, v.swap)), wa: tex(recolor(wa, v.swap)), wb: tex(recolor(wb, v.swap)),
    hd: tex(panel(hdImg, (cv.seed >>> 2) % 6, v.swap), { mirror: true }), hd2: tex(panel(hdImg, ((cv.seed >>> 2) + 3) % 6, v.swap), { mirror: true }),
    water: tex(panel(waterImg, cv.seed % 6, null), { srgb: false }), puff: puffTexture(),
  };
  M.water.magFilter = T.LinearFilter;
  M.uni = {
    tFA: { value: M.fa }, tFB: { value: M.fb }, tWA: { value: M.wa }, tWB: { value: M.wb }, tHD: { value: M.hd },
    uTS: { value: 1 / 8 }, uBump: { value: 1.6 }, uFog: { value: rgb3(v.fog) }, uCapC: { value: rgb3('#0c0b10') }, uWetC: { value: new T.Vector3(0.62, 0.72, 0.9) },
    uCut: { value: new T.Vector4(0, 0, 0, 0) }, uCutR: { value: new T.Vector2(150, 120) },
  };
  const scene = new T.Scene();
  scene.background = null;
  const root = new T.Group(); scene.add(root);
  S = { cv, v, scene, root, M, t: 0, lightSrc: [], flick: [], pool: [], hero: null, fx: [], water: [], cam: R.cam };
  buildTerrain(S);
  buildWallStalactites(S);
  buildTorches(S);
  buildWater(S);
  buildFalls(S);
  buildMouths(S);
  // lights: a dim cave ambience, a cold fill from up-screen left, and point lights handed to the nearest flames each frame
  S.amb = new T.AmbientLight(col(v.ambient), 0.55); scene.add(S.amb);
  S.hemi = new T.HemisphereLight(0xb8c4dc, 0x18141a, 1.1); scene.add(S.hemi);
  const key = new T.DirectionalLight(0xd8dcea, 1.2); key.position.set(-60, 90, 20); scene.add(key); scene.add(key.target);
  for (let i = 0; i < (G.touch ? 5 : 9); i++) { const L = new T.PointLight(0xffffff, 0, 10, 1.3); scene.add(L); S.pool.push(L); }
  S.props = bakeProps(S);
  return S;
}

function buildTerrain(S) {
  const cv = S.cv, { VW, VH, hv, ceil, mat, vd } = cv, CH = 24 * CAVE_S, s = 1 / CAVE_S;
  const mtl = terrainMaterial(S.M);
  const show = (k) => vd[k] < 4.2 || cv.cls[k];   // deep rock is all dark: those quads are left out (the clear colour is the dark)
  const h = (i, j) => hv[Math.min(VH - 1, Math.max(0, j)) * VW + Math.min(VW - 1, Math.max(0, i))];
  for (let cj = 0; cj < VH - 1; cj += CH) for (let ci = 0; ci < VW - 1; ci += CH) {
    const i1 = Math.min(VW - 1, ci + CH), j1 = Math.min(VH - 1, cj + CH), cw = i1 - ci + 1, chh = j1 - cj + 1;
    const pos = new Float32Array(cw * chh * 3), nor = new Float32Array(cw * chh * 3), cm = new Uint8Array(cw * chh * 4), cc = new Float32Array(cw * chh), idx = [];
    for (let j = cj; j <= j1; j++) for (let i = ci; i <= i1; i++) {
      const k = j * VW + i, q = (j - cj) * cw + (i - ci);
      pos[q * 3] = i * s; pos[q * 3 + 1] = hv[k]; pos[q * 3 + 2] = j * s;
      const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * s), dz = (h(i, j + 1) - h(i, j - 1)) / (2 * s), l = Math.hypot(dx, 1, dz);
      nor[q * 3] = -dx / l; nor[q * 3 + 1] = 1 / l; nor[q * 3 + 2] = -dz / l;
      cm.set(mat.subarray(k * 4, k * 4 + 4), q * 4); cc[q] = ceil[k];
    }
    for (let j = cj; j < j1; j++) for (let i = ci; i < i1; i++) {
      const k = j * VW + i;
      if (!show(k) && !show(k + 1) && !show(k + VW) && !show(k + VW + 1)) continue;
      const a = (j - cj) * cw + (i - ci), b = a + 1, c = a + cw, d = c + 1;
      // split along the flatter diagonal
      if (Math.abs(hv[k] - hv[k + VW + 1]) < Math.abs(hv[k + 1] - hv[k + VW])) idx.push(a, c, d, a, d, b); else idx.push(a, c, b, b, c, d);
    }
    if (!idx.length) continue;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    g.setAttribute('cmat', new T.BufferAttribute(cm, 4, true)); g.setAttribute('cceil', new T.BufferAttribute(cc, 1));
    g.setIndex(idx); g.computeBoundingSphere();
    const mesh = new T.Mesh(g, mtl); mesh.matrixAutoUpdate = false;
    S.root.add(mesh);
  }
}

/** A lathe with a jagged, dripping profile: radius at height y given by rad(t), noise pushed out of it. */
function spire(rad, h, seed, seg = 14, rows = 14, amp = 0.16) {
  const pts = [];
  for (let r = 0; r <= rows; r++) { const t = r / rows; pts.push(new T.Vector2(Math.max(0.004, rad(t)), t * h)); }
  const g = new T.LatheGeometry(pts, seg);
  const p = g.attributes.position, uv = g.attributes.uv, n = p.count, colr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z);
    if (rr > 0.005) {
      const a = Math.atan2(z, x), k = 1 + amp * (vnoise(a * 2.2 + seed, y * 1.6, seed + 3) - 0.5) * 2 + 0.07 * Math.sin(y * 7 + seed);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    uv.setXY(i, uv.getX(i) * 1.6 + seed * 0.13, y * 0.24 + seed * 0.07);
  }
  g.deleteAttribute('normal'); g.computeVertexNormals();
  g.setAttribute('color', new T.BufferAttribute(colr.fill(1), 3));
  return g;
}
/** Vertex colours darkening toward y = top (into the dark above) or toward the root of a hanging one. */
function shadeBy(g, f) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const k = f(p.getY(i)); c.setXYZ(i, k, k, k * 1.04); }
  return g;
}

function buildWallStalactites(S) {
  const list = S.cv.wallStal;
  if (!list.length) return;
  const mtl = darkened(new T.MeshStandardMaterial({ map: S.M.hd2, color: 0xe8e4dc, roughness: 0.9, vertexColors: true }), S.M, 'cavestal');
  const kinds = 6, by = Array.from({ length: kinds }, () => []);
  for (const s of list) by[s.m % kinds].push(s);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3(), up = new T.Euler();
  for (let k = 0; k < kinds; k++) {
    if (!by[k].length) continue;
    // a unit stalactite: root at y 0, tip at y -1, radius 1 at the root
    const g = spire((t) => (k % 3 === 2 ? 0.3 + 0.7 * (1 - t) : 1 - t) ** (0.9 + (k % 3) * 0.3) * (1 + 0.1 * Math.sin(t * 9 + k)), 1, k * 3.1 + 1, 10, 10, 0.2);
    g.rotateX(Math.PI); g.translate(0, 0, 0);   // hang it: the lathe's base at the top
    shadeBy(g, (y) => 0.15 + 0.85 * Math.min(1, -y * 1.4));
    const mesh = new T.InstancedMesh(g, mtl, by[k].length);
    by[k].forEach((s, i) => {
      up.set(0, (s.x * 7 + s.y * 3) % 6.28, 0); q.setFromEuler(up);
      ps.set(s.x, s.top, s.y); sc.set(s.r, s.len, s.r);
      mesh.setMatrixAt(i, m4.compose(ps, q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false;
    S.root.add(mesh);
  }
}

function buildTorches(S) {
  const v = S.v, iron = new T.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.5 });
  const arm = new T.BoxGeometry(0.07, 0.07, 0.34), cup = new T.CylinderGeometry(0.11, 0.06, 0.16, 8), stick = new T.CylinderGeometry(0.035, 0.045, 0.3, 6);
  const wood = new T.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
  for (const t of S.cv.torches) {
    const g = new T.Group(), ang = Math.atan2(t.nx, t.ny);
    g.position.set(t.x, t.h, t.y); g.rotation.y = ang;
    const a = new T.Mesh(arm, iron); a.position.set(0, -0.12, -0.12); g.add(a);
    const c = new T.Mesh(cup, iron); c.position.set(0, -0.02, 0.06); g.add(c);
    const st = new T.Mesh(stick, wood); st.position.set(0, 0.1, 0.06); st.rotation.x = 0.15; g.add(st);
    const f1 = glow(col(v.torch), 1.1, 0.9), f2 = glow(0xfff0c0, 0.45, 1);
    f1.position.set(0, 0.36, 0.1); f2.position.set(0, 0.3, 0.1); g.add(f1, f2);
    S.flick.push({ o: f1, base: 1.1 }, { o: f2, base: 0.45 });
    S.root.add(g);
    S.lightSrc.push({ p: [t.x + t.nx * 0.3, t.h + 0.4, t.y + t.ny * 0.3], c: v.torch, i: 1, r: 9 });
  }
}

// ------------------------------------------------------------------ water
const WATER_V = `attribute float wdepth; attribute vec2 wflow; varying vec3 vP; varying float vD; varying vec2 vF;
void main() { vP = position; vD = wdepth; vF = wflow; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WATER_F = `uniform sampler2D tW; uniform float uT; uniform vec3 cDeep, cMid, cHi; uniform vec2 uPl;
varying vec3 vP; varying float vD; varying vec2 vF;
void main() {
  if (vD < 0.01) discard;
  vec2 p = vP.xz, off = vF * uT * 1.1;
  float a = texture2D(tW, (p + off) * 0.105 + vec2(uT * 0.006, uT * 0.004)).r;
  float b = texture2D(tW, (p * 0.83 + off * 1.3) * 0.105 - vec2(uT * 0.005, -uT * 0.007)).r;
  float l = (a + b) * 0.5;
  float dp = length(p - uPl), rip = (sin(dp * 3.4 - uT * 5.0) * 0.5 + 0.5) * exp(-dp * 0.16);
  vec3 c = mix(cDeep, cMid, smoothstep(0.12, 0.5, l + rip * 0.25));
  c += cHi * (smoothstep(0.6, 0.82, l) * 0.75 + rip * 0.3 + length(vF) * 0.25 * smoothstep(0.5, 0.75, a));
  float shore = 1.0 - smoothstep(0.0, 0.3, vD);
  c = mix(c, cHi, shore * (0.35 + 0.25 * sin(uT * 2.0 + p.x * 3.0 + p.y * 2.3)));
  gl_FragColor = vec4(c, mix(0.42, 0.9, smoothstep(0.0, 1.1, vD)));
}`;
function buildWater(S) {
  const cv = S.cv, { VW, VH, surf, hv } = cv, s = 1 / CAVE_S, v = S.v;
  const pos = [], dep = [], flw = [], idx = [], map = new Int32Array(VW * VH).fill(-1);
  // the river's way: the curve from the spring to the lip
  const riv = cv.river, flowAt = (x, y) => {
    let best = 1e9, fx = 0, fy = 0;
    for (let i = 0; i < riv.length - 1; i++) { const d = (riv[i][0] - x) ** 2 + (riv[i][1] - y) ** 2; if (d < best) { best = d; fx = riv[i + 1][0] - riv[i][0]; fy = riv[i + 1][1] - riv[i][1]; } }
    const l = Math.hypot(fx, fy) || 1;
    return best < 9 ? [fx / l, fy / l] : [0, 0];
  };
  // every vertex of a quad touching water stands at the water's level, its depth the level less the ground there, so
  // the shore follows the ground's own contour where it rises out of the water
  const vert = (i, j, lq) => {
    const k = j * VW + i;
    if (map[k] >= 0) return map[k];
    const x = i * s, y = j * s, lv = Number.isNaN(surf[k]) ? lq : surf[k], f = Math.abs(lv - cv.HP) < 1 ? flowAt(x, y) : [0, 0];
    map[k] = pos.length / 3; pos.push(x, lv, y); dep.push(lv - hv[k]); flw.push(f[0] * 1.6, f[1] * 1.6);
    return map[k];
  };
  for (let j = 0; j < VH - 1; j++) for (let i = 0; i < VW - 1; i++) {
    const k = j * VW + i, ks = [k, k + 1, k + VW, k + VW + 1], wl = ks.filter((q) => !Number.isNaN(surf[q]));
    if (!wl.length) continue;
    const lq = wl.reduce((a, q) => a + surf[q], 0) / wl.length;
    const a = vert(i, j, lq), b = vert(i + 1, j, lq), c = vert(i, j + 1, lq), d = vert(i + 1, j + 1, lq);
    idx.push(a, c, d, a, d, b);
  }
  if (!idx.length) return;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('wdepth', new T.Float32BufferAttribute(dep, 1)); g.setAttribute('wflow', new T.Float32BufferAttribute(flw, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  S.waterUni = { tW: { value: S.M.water }, uT: { value: 0 }, cDeep: { value: rgb3(v.deep) }, cMid: { value: rgb3(v.mid) }, cHi: { value: rgb3(v.hi) }, uPl: { value: new T.Vector2(cv.plunge[0], cv.plunge[1]) } };
  const m = new T.ShaderMaterial({ uniforms: S.waterUni, vertexShader: WATER_V, fragmentShader: WATER_F, transparent: true, depthWrite: false });
  const mesh = new T.Mesh(g, m); mesh.renderOrder = 2; mesh.frustumCulled = false;
  S.root.add(mesh);
}

// ------------------------------------------------------------------ the falls
const FALL_V = `attribute vec2 fuv; varying vec2 vU; void main() { vU = fuv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_F = `uniform sampler2D tW; uniform float uT, uSpeed, uA; uniform vec3 cMid, cHi;
varying vec2 vU;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n1(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float y = vU.y * 6.0 - uT * uSpeed;
  float wob = (n1(vec2(vU.y * 4.0 - uT * 0.7, 1.7)) - 0.5) * 0.24, x = vU.x + wob * (0.35 + vU.y);   // the edges waver
  float s1 = n1(vec2(x * 26.0, y * 1.5)), s2 = n1(vec2(x * 61.0 + 3.0, y * 3.1 + 7.0)), tx = texture2D(tW, vec2(x * 1.3, y * 0.18)).r;
  float st = s1 * 0.5 + s2 * 0.3 + tx * 0.4;
  float edge = smoothstep(0.0, 0.3, x) * smoothstep(1.0, 0.7, x), top = smoothstep(0.0, 0.025, vU.y);
  float foam = smoothstep(0.07, 0.0, vU.y) * 0.8 + smoothstep(0.78, 1.0, vU.y);   // white at the lip and where it lands
  vec3 c = mix(cMid, cHi, smoothstep(0.35, 0.85, st)) + cHi * smoothstep(0.8, 1.0, st) * 0.6 + vec3(0.85) * foam * (0.4 + 0.4 * s2);
  gl_FragColor = vec4(c, uA * edge * top * (0.5 + 0.5 * st) * (1.0 - smoothstep(0.93, 1.0, vU.y) * 0.6));
}`;
const PART_V = `attribute vec4 seed; uniform float uT; uniform vec3 uA, uB, uDir, uOut; uniform float uFall, uSize, uMode; uniform vec3 c0, c1, c2, c3;
varying vec3 vC; varying float vA;
void main() {
  float u = seed.x, ph = seed.y, sp = 0.6 + seed.z * 0.8, sz = 0.6 + seed.w * 0.8;
  vec3 p; float a = 1.0;
  if (uMode < 0.5) {        // droplets down the curtain
    float t = fract(ph + uT * sp * 0.55);
    p = mix(uA, uB, u) + uDir * (seed.z - 0.5) * 0.4;
    p.y = uA.y - uFall * pow(t, 1.5);
    p += vec3(-uDir.z, 0.0, uDir.x) * (0.15 + 1.0 * sqrt(t) + (seed.w - 0.5) * 0.5);
    a = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.88, 1.0, t));
  } else if (uMode < 1.5) { // spray and mist rising off the plunge
    float t = fract(ph + uT * (0.05 + seed.z * 0.07));
    float ang = u * 6.2832, r = 0.6 + seed.w * 2.6 + t * 2.2;
    p = uA + vec3(cos(ang) * r, t * (1.5 + seed.z * 4.5), sin(ang) * r * 0.8);
    a = sin(3.1416 * t);
    sz *= 0.5 + t * 1.6;
  } else if (uMode < 2.5) { // splash sparks thrown up out of the pool
    float t = fract(ph + uT * (0.45 + seed.z * 0.5));
    float ang = u * 6.2832, vh = 1.2 + seed.w * 2.2;
    p = uA + vec3(cos(ang) * vh * t * 1.6, (4.5 + seed.z * 3.0) * t - 9.0 * t * t, sin(ang) * vh * t * 1.6);
    a = 1.0 - t;
    if (p.y < uA.y - 0.1) a = 0.0;
  } else {                  // motes drifting and twinkling over the water
    float t = uT * (0.03 + seed.z * 0.04) + ph * 6.2832;
    p = uA + vec3((u - 0.5) * uB.x + sin(t) * 1.5, 0.3 + seed.w * 3.5 + sin(t * 1.7) * 0.4, (seed.y - 0.5) * uB.z + cos(t * 0.8) * 1.5);
    a = 0.5 + 0.5 * sin(uT * (1.5 + seed.w * 3.0) + ph * 20.0);
  }
  float k = fract(seed.x * 7.13 + seed.w * 3.7);
  vC = k < 0.25 ? c0 : k < 0.5 ? c1 : k < 0.75 ? c2 : c3;
  vA = a;
  gl_PointSize = uSize * sz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const PART_F = `uniform sampler2D tP; uniform float uMode, uAlpha; varying vec3 vC; varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5; float d = length(q);
  float a = uMode > 0.5 && uMode < 1.5 ? texture2D(tP, gl_PointCoord).a : smoothstep(0.5, 0.1, d);
  if (a * vA < 0.01) discard;
  gl_FragColor = vec4(vC, a * vA * uAlpha);
}`;
/** A field of n particles (mode 0 droplets, 1 mist, 2 splash, 3 motes) whose motion runs on the GPU from uT. */
function particles(S, n, mode, o) {
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) seed[i] = Math.random();
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('seed', new T.BufferAttribute(seed, 4));
  const bl = S.v.blues.map(rgb3), mist = rgb3(S.v.mist);
  const uni = {
    uT: { value: 0 }, uA: { value: new T.Vector3(...o.a) }, uB: { value: new T.Vector3(...(o.b || o.a)) }, uDir: { value: new T.Vector3(...(o.dir || [1, 0, 0])) },
    uOut: { value: new T.Vector3(...(o.out || [0, -99, 0])) }, uFall: { value: o.fall || 1 }, uSize: { value: o.size || 3 }, uMode: { value: mode }, uAlpha: { value: o.alpha ?? 1 },
    c0: { value: mode === 1 ? mist : bl[0] }, c1: { value: mode === 1 ? mist : bl[1] }, c2: { value: mode === 1 ? bl[3] : bl[2] }, c3: { value: mode === 1 ? mist : bl[3] }, tP: { value: S.M.puff },
  };
  const m = new T.ShaderMaterial({ uniforms: uni, vertexShader: PART_V, fragmentShader: PART_F, transparent: true, depthWrite: false, blending: mode === 1 ? T.NormalBlending : T.AdditiveBlending });
  const pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4;
  S.root.add(pts); S.fx.push(uni);
  return pts;
}
/** A curtain of falling water from top (x, y, h) down to the pool at height h1, wid tiles across, facing the camera. */
function curtain(S, top, h1, wid, out, alpha, speed) {
  const nu = 12, nv = 28, pos = [], uv = [], idx = [], [x, y, h] = top, ex = Math.SQRT1_2, ez = -Math.SQRT1_2, ox = Math.SQRT1_2, oz = Math.SQRT1_2;
  for (let j = 0; j <= nv; j++) {
    const t = j / nv, o = out * (1 - (1 - t) * (1 - t)) + 0.08, ww = wid * (1 + 0.28 * t);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu - 0.5;
      pos.push(x + ex * u * ww + ox * o, h + (h1 - h) * t, y + ez * u * ww + oz * o); uv.push(i / nu, t);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, d, a, d, b); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('fuv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const uni = { tW: S.waterUni ? S.waterUni.tW : { value: S.M.water }, uT: { value: 0 }, uSpeed: { value: speed }, uA: { value: alpha }, cMid: { value: rgb3(S.v.mid) }, cHi: { value: rgb3(S.v.hi) } };
  const m = new T.ShaderMaterial({ uniforms: uni, vertexShader: FALL_V, fragmentShader: FALL_F, transparent: true, depthWrite: false, side: T.DoubleSide });
  const mesh = new T.Mesh(g, m); mesh.renderOrder = 3; mesh.frustumCulled = false;
  S.root.add(mesh); S.fx.push(uni);
}
function buildFalls(S) {
  const cv = S.cv, [lx, ly] = cv.lip, top = cv.HP + 0.06, base = cv.WL, fall = top - base, few = G.touch;
  // the main falls: a bright core and a wide faint veil, foam where it hits, spray and mist rising, droplets in four blues
  curtain(S, [lx, ly, top], base, 3.6, 0.9, 0.92, 2.6);
  curtain(S, [lx, ly, top + 0.04], base, 5.4, 1.25, 0.32, 1.6);
  const ex = Math.SQRT1_2, ez = -Math.SQRT1_2, A = [lx - ex * 2, top, ly - ez * 2], B = [lx + ex * 2, top, ly + ez * 2];
  const foot = [lx + Math.SQRT1_2 * 1.4, base + 0.05, ly + Math.SQRT1_2 * 1.4];
  particles(S, few ? 260 : 620, 0, { a: A, b: B, dir: [ex, 0, ez], out: [0, base, 0], fall, size: 3.2 });
  particles(S, few ? 40 : 90, 1, { a: foot, size: 70, alpha: 0.34 });
  particles(S, few ? 90 : 220, 2, { a: foot, size: 3.5 });
  particles(S, few ? 20 : 46, 1, { a: [lx + 0.5, base + fall * 0.45, ly + 0.5], size: 56, alpha: 0.16 });   // the downpour's veil of mist
  const lk = cv.lake;
  particles(S, few ? 60 : 140, 3, { a: [lk.x, base, lk.y], b: [lk.A * 1.6, 0, lk.A * 1.6], size: 2.6 });
  S.lightSrc.push({ p: [foot[0], base + 1.2, foot[2]], c: S.v.hi, i: 1.6, r: 14, fixed: true }, { p: [lx, top + 0.5, ly], c: S.v.mid, i: 0.9, r: 9, fixed: true });
  S.falls = { foot: [foot[0], foot[2]], top: [lx, ly] };
  // the shaft's inner fall: a thin rope of water out of the dark into its pool
  const sh = cv.shaft, pool = sh.pool;
  curtain(S, [sh.x, sh.y, cv.HP + 9], pool, 1.3, 0.1, 0.8, 2.2);
  particles(S, few ? 20 : 40, 1, { a: [sh.x, pool + 0.05, sh.y], size: 48, alpha: 0.28 });
  particles(S, few ? 40 : 90, 2, { a: [sh.x, pool + 0.05, sh.y], size: 3 });
  S.lightSrc.push({ p: [sh.x, pool + 1, sh.y], c: S.v.hi, i: 1.1, r: 11, fixed: true });
}
/** The dark mouths of the passage: at the notch under the cliff, and where it comes out in the shaft. */
function buildMouths(S) {
  const cv = S.cv;
  const arch = (x, y, h, nx, ny, w, ht) => {
    const sh = new T.Shape();
    sh.moveTo(-w / 2, 0); sh.lineTo(-w / 2, ht * 0.55); sh.quadraticCurveTo(-w / 2, ht, 0, ht); sh.quadraticCurveTo(w / 2, ht, w / 2, ht * 0.55); sh.lineTo(w / 2, 0); sh.lineTo(-w / 2, 0);
    const g = new T.ShapeGeometry(sh, 8);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0x020203, side: T.DoubleSide, depthWrite: true }));
    m.position.set(x + nx * 0.05, h - 0.05, y + ny * 0.05); m.rotation.y = Math.atan2(nx, ny);
    S.root.add(m);
    const halo2 = glow(col(S.v.mist), 2.2, 0.12); halo2.position.set(x + nx * 0.4, h + ht * 0.5, y + ny * 0.4); S.root.add(halo2);
  };
  const [nx, ny] = cv.notchIn, H2 = cv.H2;
  arch(nx - Math.SQRT1_2 * 1.25, ny - Math.SQRT1_2 * 1.25, H2(nx, ny), Math.SQRT1_2, Math.SQRT1_2, 1.9, 2.3);
  const [mx, my] = cv.mouth, [dx, dy] = cv.mouthDir;
  arch(mx, my, cv.mouthH, dx, dy, 2, 2.3);
}

// ------------------------------------------------------------------ baked props
/** The free-standing rock (stalagmites, clusters, columns, boulders) and the stalactites over open floor: each model
 * rendered once with the game's camera into a sprite { img, sx, sy, w, h, ox, oy } (world px; its base point at 0, 0). */
function bakeProps(S) {
  const rd = renderer(), gl = rd.gl, v = S.v, scene = new T.Scene();
  scene.add(new T.AmbientLight(col(v.ambient), 3.2));
  const keyL = new T.DirectionalLight(0xfff0dc, 3.4); keyL.position.set(-40, 70, 30); scene.add(keyL, keyL.target);
  const rim = new T.DirectionalLight(0x9ab8ff, 1.1); rim.position.set(50, 30, -60); scene.add(rim, rim.target);
  const mtl = new T.MeshStandardMaterial({ map: S.M.hd, bumpMap: S.M.hd, bumpScale: 1.4, color: 0xf0ece4, roughness: 0.9, vertexColors: true });
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 1600);
  cam.position.copy(rd.cam.position); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const bake = (g) => {
    const p = g.attributes.position;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i), sx = (X - Z) * HW, sy = (X + Z) * HH - Y * VZ;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; x1 = Math.ceil(x1) + 2; y1 = Math.ceil(y1) + 2;
    const w = x1 - x0, h = y1 - y0;
    cam.left = x0 / SC; cam.right = x1 / SC; cam.top = -y0 / SC; cam.bottom = -y1 / SC; cam.updateProjectionMatrix();
    const mesh = new T.Mesh(g, mtl); scene.add(mesh);
    gl.setSize(w, h, false); gl.setClearColor(0x000000, 0); gl.render(scene, cam);
    const c = makeCanvas(w, h); c.getContext('2d').drawImage(gl.domElement, 0, 0);
    scene.remove(mesh); g.dispose();
    return { img: c, sx: 0, sy: 0, w, h, ox: x0, oy: y0 };
  };
  const out = { mite: [], cluster: [], column: [], tite: [], boulder: [] };
  const miteG = (k, h, rb) => shadeBy(spire((t) => rb * (1 - t) ** (0.75 + (k % 4) * 0.12) * (1 + 0.15 * Math.max(0, Math.sin(t * 11 + k))), h, k * 1.7 + 2, 12, 14, 0.2), (y) => 0.55 + 0.45 * Math.min(1, y / h + 0.3));
  for (let k = 0; k < 8; k++) out.mite.push(bake(miteG(k, 1.1 + (k % 4) * 0.55, 0.32 + (k % 3) * 0.08)));
  for (let k = 0; k < 4; k++) {
    const parts = [];
    const n = 3 + (k % 3);
    for (let i = 0; i < n; i++) {
      const g = miteG(k * 5 + i, 0.6 + Math.random() * (i === 0 ? 1.8 : 1.1), 0.18 + Math.random() * 0.16), a = (i / n) * 6.28 + k, r = i === 0 ? 0 : 0.28 + Math.random() * 0.25;
      g.translate(Math.cos(a) * r, 0, Math.sin(a) * r); parts.push(g.toNonIndexed());
    }
    out.cluster.push(bake(merge(parts)));
  }
  const colH = 7.1;
  for (let k = 0; k < 3; k++) {
    const g = spire((t) => { const a = Math.abs(t - 0.52 - (k - 1) * 0.06) * 2; return 0.24 + 0.85 * a ** 1.6 + 0.08 * Math.sin(t * 17 + k); }, colH, k * 4.4 + 9, 16, 30, 0.22);
    out.column.push(bake(shadeBy(g, (y) => 0.6 * Math.max(0, 1 - Math.max(0, y - 2.5) / (colH - 2.8)) + 0.12 + 0.28 * Math.min(1, y))));
  }
  for (let k = 0; k < 6; k++) {
    const len = 1.6 + (k % 3) * 1.2, g = spire((t) => (0.3 + (k % 2) * 0.1) * (1 - t) ** 0.9, len, k * 2.3 + 5, 10, 12, 0.18);
    g.rotateX(Math.PI);
    out.tite.push(bake(shadeBy(g, (y) => 0.08 + 0.92 * Math.min(1, -y / len * 1.5))));
  }
  for (let k = 0; k < 4; k++) {
    const g = new T.IcosahedronGeometry(0.42 + k * 0.08, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + 0.32 * (vnoise(x * 3 + k, y * 3 + z * 2, k + 40) - 0.5); p.setXYZ(i, x * f, Math.max(-0.05, y * f * 0.72) + 0.1, z * f); }
    g.deleteAttribute('normal'); g.computeVertexNormals();
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(p.count * 3).fill(1), 3));
    out.boulder.push(bake(shadeBy(g, (y) => 0.6 + 0.4 * Math.min(1, y * 1.6))));
  }
  mtl.dispose();
  rd.w = rd.h = 0;
  return out;
}
function merge(list) {
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), colr = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); colr.set(g.attributes.color.array, o * 3);
    o += c; g.dispose();
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setAttribute('color', new T.BufferAttribute(colr, 3));
  return g;
}
/** The baked sprite of a prop (null until the scene is built). */
export function caveSprite(kind, m) { const l = S && S.props && S.props[kind]; return l && l.length ? l[m % l.length] : null; }

// ------------------------------------------------------------------ each frame
/** Game time for the 3D: the water runs, flames flicker, particles move. */
export function tickCave3D(dt, cr) {
  if (!S || S.cv !== cr.cv) return;
  S.t += dt;
  if (S.waterUni) S.waterUni.uT.value = S.t;
  for (const u of S.fx) u.uT.value = S.t;
  for (const f of S.flick) f.o.scale.setScalar(f.base * (0.86 + 0.14 * Math.sin(S.t * 13 + f.base * 9) * Math.sin(S.t * 7.3 + f.base)));
}
/**
 * Draw the cave behind the sprites. cr = world.cave (game/caverns.js: focus = the hero's [x, height, y], cut). The 3D
 * view renders at one pixel per world px (less on touch) and is scaled up without smoothing, like the pixel art over it.
 */
export function drawCave3D(ctx, cr) {
  const W = G.W * G.dpr, H = G.H * G.dpr;
  if (!S || S.cv !== cr.cv) { ctx.fillStyle = '#050509'; ctx.fillRect(0, 0, W, H); return; }
  const rd = renderer(), z = camera.zoom, q = G.touch ? 0.75 : 1;
  const pw = Math.max(16, Math.round(G.W / z * q)), ph = Math.max(16, Math.round(G.H / z * q));
  if (rd.w !== pw || rd.h !== ph) { rd.gl.setSize(pw, ph, false); rd.w = pw; rd.h = ph; }
  const cx = camera.x + camera.shakeX, cy = camera.y + camera.shakeY, hw = G.W / 2 / z, hh = G.H / 2 / z, cam = rd.cam;
  cam.left = (cx - hw) / SC; cam.right = (cx + hw) / SC; cam.top = -(cy - hh) / SC; cam.bottom = -(cy + hh) / SC; cam.updateProjectionMatrix();
  const [fx, fy, fz] = cr.focus;
  S.M.uni.uCut.value.set(fx, fy, fz, cr.cut ? 1 : 0);
  // the flames nearest the hero get the point lights (one follows the hero); the rest glow on their own
  const near = [];
  for (const l of S.lightSrc) {
    const dd = (l.p[0] - fx) ** 2 + (l.p[1] - fy) ** 2 * 0.5 + (l.p[2] - fz) ** 2;
    if (dd < 700 || l.fixed) near.push([dd * (l.fixed ? 0.4 : 1), l]);
  }
  near.sort((a, b) => a[0] - b[0]);
  const pool = S.pool;
  pool[0].position.set(fx, fy + 2.4, fz); pool[0].color.set(0xffe0b8); pool[0].distance = 9; pool[0].intensity = 7;
  for (let i = 1; i < pool.length; i++) {
    const L = pool[i], n = near[i - 1];
    if (!n) { L.intensity = 0; continue; }
    const l = n[1], fl = l.fixed ? 1 : 0.85 + 0.15 * Math.sin(S.t * 9 + i * 1.7) * Math.sin(S.t * 5.3 + i);
    L.position.set(...l.p); L.color.set(l.c); L.distance = l.r; L.intensity = 14 * l.i * fl;
  }
  rd.gl.setClearColor(S.v.fog, 1);
  rd.gl.render(S.scene, cam);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(rd.gl.domElement, 0, 0, W, H);
  ctx.imageSmoothingEnabled = sm;
}

export function disposeCave3D() {
  if (!S) return;
  S.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
  for (const k of ['fa', 'fb', 'wa', 'wb', 'hd', 'hd2', 'water', 'puff']) S.M[k]?.dispose();
  S = null;
}
export const caveScene = () => S;
