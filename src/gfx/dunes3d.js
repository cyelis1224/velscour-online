// THE SEA OF SAND'S DUNES in three.js (docs/SEA_OF_SAND_DUNES.md): the level's height field (world/dunes.js) drawn live
// behind the 2D sprites with the game's own camera, as the Depth's Edge Caverns are (gfx/cave3d.js). Two scenes: the
// dunes in the variant's daylight (or moonlight) and the tomb inside the pyramid, dark but for its torches; the one the
// hero is in is drawn. The sand is the Sea of Sand pack's own floor art unprojected into seamless squares, palette
// swapped per variant, rippled across the wind; the pyramid a mesh of casing stone (or stepped tiers) with a gold
// capstone, its door sealed by a slab until the camps are won; the tomb's floors flagstones, its walls coursed masonry
// with painted bands of glyphs, rising into the dark. Obelisks, columns, urns and the sarcophagus are 3D models baked to
// sprites (game/dunes.js draws them in the depth-sorted pass, so they hide whoever walks behind them).
import { G } from '../state.js';
import { camera, HW, HH } from '../core/view.js';
import { recolor, makeCanvas } from '../core/util.js';
import { VZ, CAVE_S, vnoise } from '../world/caverns.js';
import { loadSeaOfSandPack, seaOfSandFloorTiles } from './seaofsand.js';

const SC = HW * Math.SQRT2;                 // world px per tile (one three.js unit) across the screen
let T = null;                               // three
let R = null;                               // the renderer and its camera
let S = null;                               // the scenes of the level being played

/** three.js and the Sea of Sand pack (the dunes' sand comes from its floors). Rejects if three.js can't be fetched. */
export async function loadDunes3D() {
  if (!T) T = await import('three');
  await loadSeaOfSandPack();
}
export const dunes3dReady = () => !!T;

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
const rgbA = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const col = (hex) => new T.Color(hex);

// ------------------------------------------------------------------ textures
function tex(canvas, { srgb = true, linear = false } = {}) {
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = linear ? T.LinearFilter : T.NearestFilter; t.anisotropy = 4;
  return t;
}
/** A Sea of Sand floor (an isometric 160 x 80 diamond) unprojected into a seamless square, in the variant's palette. */
function sandSquare(f, swap, N = 128) {
  const c = makeCanvas(N, N), g = c.getContext('2d');
  for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
    g.setTransform(N / 160, -N / 160, N / 80, N / 80, -N / 2 + du * N, N / 2 + dv * N);
    g.drawImage(f.img, f.sx, f.sy, f.w, f.h, 0, 0, 160, 80);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return swap ? recolor(c, swap) : c;
}
const hash = (x, y, s) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
/**
 * Coursed masonry, seamless at 256 px: courses `course` px high, blocks 64 px long staggered by half a block a course,
 * each block its own tone, lit along its top edge and shadowed along its foot; `glyph` paints a band of carved and
 * painted glyphs every fourth course; `flags` lays square flagstones instead (a floor).
 */
function masonry(base, dark, { course = 16, glyph = null, flags = false, seed = 1, N = 256 } = {}) {
  const c = makeCanvas(N, N), g = c.getContext('2d'), d = g.createImageData(N, N), p = d.data;
  const B = rgbA(base), K = rgbA(dark), bw = 64, bh = flags ? 64 : course;
  for (let y = 0; y < N; y++) {
    const row = Math.floor(y / bh), yin = y - row * bh, off = flags ? (row % 2) * 32 : (row % 2) * 32;
    for (let x = 0; x < N; x++) {
      const xx = (x + off) % N, bi = Math.floor(xx / bw), xin = xx - bi * bw;
      let k = 0.82 + 0.26 * hash(bi, row, seed);
      k *= 0.93 + 0.14 * vnoise(x * 0.3, y * 0.3, seed + 3) + 0.05 * (vnoise(x * 0.06, y * 0.06, seed + 5) - 0.5);
      if (yin < 1 || xin < 1) k *= 0.55;                     // the mortar
      else if (yin < 2) k *= 1.1;                             // lit along the top
      else if (yin > bh - 3 || xin > bw - 2) k *= 0.82;       // shadowed along the foot and the far end
      if (flags && hash(bi * 7, row * 3, seed + 9) > 0.8 && Math.abs(xin - yin * (bw / bh)) < 1.2 && xin > 6) k *= 0.7;   // a crack
      const m = Math.min(1, Math.max(0, k));
      const i = (y * N + x) * 4;
      p[i] = K[0] + (B[0] - K[0]) * m; p[i + 1] = K[1] + (B[1] - K[1]) * m; p[i + 2] = K[2] + (B[2] - K[2]) * m; p[i + 3] = 255;
    }
  }
  g.putImageData(d, 0, 0);
  if (glyph) {   // a band of glyphs every fourth course: an eye, an ankh, a bird, waves, a reed, a sun disc
    g.strokeStyle = glyph; g.fillStyle = glyph; g.lineWidth = 1.6; g.globalAlpha = 0.78;
    for (let row = 2; row * course < N; row += 4) for (let bi = 0; bi < N / 16; bi++) {
      const cx = bi * 16 + 8, cy = row * course + course / 2, kind = Math.floor(hash(bi, row, seed + 17) * 6), r = course * 0.3;
      g.beginPath();
      if (kind === 0) { g.ellipse(cx, cy, r * 1.2, r * 0.6, 0, 0, 6.283); g.moveTo(cx + 1.5, cy); g.arc(cx, cy, 1.5, 0, 6.283); g.moveTo(cx - r, cy + r * 0.6); g.lineTo(cx - r * 0.4, cy + r * 1.3); }
      else if (kind === 1) { g.ellipse(cx, cy - r * 0.6, r * 0.45, r * 0.5, 0, 0, 6.283); g.moveTo(cx, cy - r * 0.1); g.lineTo(cx, cy + r * 1.3); g.moveTo(cx - r * 0.8, cy + r * 0.2); g.lineTo(cx + r * 0.8, cy + r * 0.2); }
      else if (kind === 2) { g.moveTo(cx - r, cy + r); g.quadraticCurveTo(cx - r * 0.2, cy - r, cx + r, cy - r * 0.3); g.moveTo(cx - r * 0.2, cy); g.lineTo(cx + r * 0.3, cy + r); }
      else if (kind === 3) { for (let w = -1; w <= 1; w++) { g.moveTo(cx - r, cy + w * r * 0.6); for (let s = 0; s <= 4; s++) g.lineTo(cx - r + s * r * 0.5, cy + w * r * 0.6 + (s % 2 ? -1.6 : 1.6)); } }
      else if (kind === 4) { g.moveTo(cx, cy + r * 1.2); g.lineTo(cx, cy - r * 1.2); g.moveTo(cx, cy - r * 0.6); g.lineTo(cx + r * 0.7, cy - r * 1.1); }
      else { g.arc(cx, cy, r * 0.8, 0, 6.283); g.moveTo(cx - r * 1.3, cy + r * 1.1); g.lineTo(cx + r * 1.3, cy + r * 1.1); }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  return c;
}
/** Seamless value noise for the oases' water (only its red channel is read). */
function waterNoise(N = 128) {
  const c = makeCanvas(N, N), g = c.getContext('2d'), d = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = (x / N) * 6.2832, b = (y / N) * 6.2832;
    const v = 0.5 + 0.22 * Math.sin(a * 3 + Math.sin(b * 2) * 1.5) * Math.cos(b * 4 + Math.cos(a * 2)) + 0.18 * Math.sin(a * 7 + b * 5) * Math.sin(b * 6 - a * 3);
    d.data.set([255 * Math.min(1, Math.max(0, v)), 0, 0, 255], (y * N + x) * 4);
  }
  g.putImageData(d, 0, 0);
  return c;
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
  if (dz < 0.35 || p.y < uCut.y + 0.75) return false;
  vec2 sp = vec2((p.x - p.z) * 32.0, (p.x + p.z) * 16.0 - p.y * 39.19);
  vec2 sh = vec2((uCut.x - uCut.z) * 32.0, (uCut.x + uCut.z) * 16.0 - uCut.y * 39.19 - 30.0);
  float r = length((sp - sh) / uCutR);
  if (r >= 1.0) return false;
  float th = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  return r < 0.78 || th > (r - 0.78) / 0.22;
}`;
function terrainMaterial(M, dune) {
  const m = new T.MeshStandardMaterial({ roughness: dune ? 0.97 : 0.9, metalness: 0, side: T.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, M.uni);
    sh.vertexShader = 'attribute vec4 cmat; attribute float cceil;\nvarying vec3 vWp; varying vec3 vWn; varying vec4 vMat; varying float vCeil;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvWp = position; vWn = normal; vMat = cmat; vCeil = cceil;');
    sh.fragmentShader = `uniform sampler2D tFA, tFB, tTR, tPL, tWA, tWB; uniform float uTS, uBump; uniform vec3 uFog, uCapC; uniform vec2 uWind;
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
      .replace('#include <map_fragment>', dune ? `
  vec3 n = normalize(vWn), w = pow(abs(n), vec3(8.0)); w /= (w.x + w.y + w.z);
  vec2 uxz = vWp.xz * uTS, uxy = vec2(vWp.x, -vWp.y * 1.1) * uTS, uzy = vec2(vWp.z, -vWp.y * 1.1) * uTS;
  vec3 sA = texture2D(tFA, uxz).rgb, sB = texture2D(tFB, uxz).rgb;
  vec3 floorC = vMat.y > 0.95 ? texture2D(tPL, uxz * 0.5).rgb : mix(mix(sA, sB, vMat.x), texture2D(tTR, uxz).rgb, vMat.y * 0.75);
  vec3 flank = (texture2D(tFB, uxy).rgb * w.z + texture2D(tFB, uzy).rgb * w.x + sB * w.y) * 0.93;
  vec3 alb = mix(flank, floorC, smoothstep(0.55, 0.9, n.y));
  float rp = dot(vWp.xz, uWind) * 9.0 + sin(dot(vWp.xz, vec2(-uWind.y, uWind.x)) * 0.8) * 1.6 + sin(dot(vWp.xz, uWind) * 1.3) * 0.8;
  alb *= 0.975 + 0.04 * sin(rp) * (1.0 - vMat.y);
  alb = mix(alb, alb * vec3(0.66, 0.68, 0.6), vMat.z * 0.7);
  alb *= vMat.w;
  caveH = dot(alb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb *= alb;` : `
  vec3 n = normalize(vWn), w = pow(abs(n), vec3(8.0)); w /= (w.x + w.y + w.z);
  vec2 uxz = vWp.xz * uTS, uxy = vec2(vWp.x, -vWp.y) * uTS, uzy = vec2(vWp.z, -vWp.y) * uTS;
  vec3 floorC = mix(texture2D(tFA, uxz).rgb, texture2D(tFB, uxz).rgb, vMat.x * 0.5);
  vec3 wA = texture2D(tWA, uxy).rgb * w.z + texture2D(tWA, uzy).rgb * w.x + texture2D(tWA, uxz).rgb * w.y;
  vec3 wB = texture2D(tWB, uxy).rgb * w.z + texture2D(tWB, uzy).rgb * w.x + texture2D(tWB, uxz).rgb * w.y;
  vec3 alb = mix(mix(wA, wB, vMat.y), floorC, smoothstep(0.55, 0.86, n.y));
  alb *= mix(0.5, 1.0, vMat.w) * mix(0.72, 1.0, smoothstep(0.4, 0.9, n.y));
  caveH = dot(alb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb *= alb;`)
      .replace('#include <normal_fragment_maps>', 'normal = perturbCave(-vViewPosition, normal, vec2(dFdx(caveH), dFdy(caveH)) * uBump, faceDirection);')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, smoothstep(vCeil - 1.7, vCeil + 0.5, vWp.y));
  if (!gl_FrontFacing) gl_FragColor.rgb = uCapC + diffuseColor.rgb * 0.16;`);
  };
  m.customProgramCacheKey = () => (dune ? 'duneterrain' : 'tombterrain');
  return m;
}
/** A standard material laid on in world space (triplanar: courses level, whatever the face's slope). */
function worldMat(map, opts = {}) {
  const m = new T.MeshStandardMaterial({ roughness: 0.88, metalness: 0, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tWM = { value: map };
    sh.vertexShader = 'varying vec3 vWp3; varying vec3 vWn3;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp3 = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn3 = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform sampler2D tWM; varying vec3 vWp3; varying vec3 vWn3;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
  vec3 n3 = abs(normalize(vWn3)); n3 = pow(n3, vec3(6.0)); n3 /= (n3.x + n3.y + n3.z);
  vec3 t3 = texture2D(tWM, vec2(vWp3.x, -vWp3.y) * 0.16).rgb * n3.z + texture2D(tWM, vec2(vWp3.z, -vWp3.y) * 0.16).rgb * n3.x + texture2D(tWM, vWp3.xz * 0.16).rgb * n3.y;
  diffuseColor.rgb *= t3;`);
  };
  m.customProgramCacheKey = () => 'dunes_world_' + m.uuid.slice(0, 4);
  return m;
}

// ------------------------------------------------------------------ build
/** The scenes of one level (generateDunes' dunes). */
export async function buildDunes3D(dv) {
  if (S && S.dv === dv) return S;
  disposeDunes3D();
  renderer();
  const v = dv.v, PY = v.pyramid, floors = seaOfSandFloorTiles();
  const fl = (i) => floors[Math.min(floors.length - 1, i)];
  const M = {
    sa: tex(sandSquare(fl(v.floors[0]), v.sand)), sb: tex(sandSquare(fl(v.floors[1]), v.sand)), tr: tex(sandSquare(fl(v.floors[2]), v.sand)), pl: tex(sandSquare(fl(v.floors[3]), v.sand)),
    flag: tex(masonry(PY.stone, PY.dark, { flags: true, seed: 3 })), flag2: tex(masonry(PY.stone, PY.dark, { flags: true, seed: 11 })),
    wall: tex(masonry(PY.stone, PY.dark, { course: 16, seed: 5 })), glyph: tex(masonry(PY.stone, PY.dark, { course: 16, glyph: PY.glyph, seed: 7 })),
    casing: tex(masonry(PY.stone, PY.dark, { course: 12, seed: 13 })), water: tex(waterNoise(), { srgb: false, linear: true }),
  };
  const base = (dune) => ({
    tFA: { value: dune ? M.sa : M.flag }, tFB: { value: dune ? M.sb : M.flag2 }, tTR: { value: M.tr }, tPL: { value: M.pl }, tWA: { value: M.wall }, tWB: { value: M.glyph },
    uTS: { value: dune ? 0.5 : 1 / 5 }, uBump: { value: dune ? (v.sky.bump ?? 0.7) : 1.7 }, uFog: { value: rgb3(dune ? v.sky.haze : PY.fog) }, uCapC: { value: rgb3(dune ? '#5a4a30' : '#0c0a08') },
    uWind: { value: new T.Vector2(Math.cos(v.dune.wind), Math.sin(v.dune.wind)) }, uCut: { value: new T.Vector4(0, 0, 0, 0) }, uCutR: { value: new T.Vector2(150, 120) },
  });
  S = { dv, v, M, t: 0, cam: R.cam, seals: [], door: null, ext: null, int: null };
  for (const inside of [false, true]) {
    const scene = new T.Scene(); scene.background = null;
    const root = new T.Group(); scene.add(root);
    const sc = { scene, root, inside, uni: base(!inside), lightSrc: [], flick: [], pool: [] };
    buildTerrain(sc, dv, inside);
    if (inside) {
      sc.amb = new T.AmbientLight(col(v.sky.amb), 0.5); scene.add(sc.amb);
      scene.add(new T.HemisphereLight(0xc8b8a0, 0x18120c, 0.55));
      for (let i = 0; i < (G.touch ? 5 : 9); i++) { const L = new T.PointLight(0xffffff, 0, 10, 1.3); scene.add(L); sc.pool.push(L); }
    } else {
      const sky = v.sky;
      sc.amb = new T.AmbientLight(col(sky.amb), sky.night ? 0.9 : 0.7); scene.add(sc.amb);
      scene.add(new T.HemisphereLight(col(sky.hemiSky), col(sky.hemiGround), sky.night ? 1.1 : 1.9));
      const sun = new T.DirectionalLight(col(sky.sun), sky.sunI); sun.position.set(-55, 60, 35); scene.add(sun, sun.target);
      for (let i = 0; i < (G.touch ? 3 : 5); i++) { const L = new T.PointLight(0xffffff, 0, 9, 1.3); scene.add(L); sc.pool.push(L); }
      buildPyramid(sc, dv);
      buildWater(sc, dv);
    }
    buildTorches(sc, dv, inside);
    S[inside ? 'int' : 'ext'] = sc;
  }
  buildSeals(S.int, dv);
  S.props = bakeProps(dv);
  return S;
}

function buildTerrain(sc, dv, inside) {
  const { VW, VH, hv, ceil, mat, vd, vin, cls } = dv, CH = 24 * CAVE_S, s = 1 / CAVE_S;
  const mtl = terrainMaterial({ uni: sc.uni }, !inside);
  const lim = inside ? VW : dv.E * CAVE_S;   // outside: the square of dunes, the skirt beyond it
  const show = inside ? (k) => vin[k] === 1 && (cls[k] || vd[k] < 4.2) : (k) => k % VW <= lim;
  const h = (i, j) => hv[Math.min(VH - 1, Math.max(0, j)) * VW + Math.min(VW - 1, Math.max(0, i))];
  if (!inside) buildSkirt(sc, dv, mtl);
  for (let cj = 0; cj < VH - 1; cj += CH) for (let ci = 0; ci < Math.min(VW - 1, lim); ci += CH) {
    const i1 = Math.min(VW - 1, ci + CH), j1 = Math.min(VH - 1, cj + CH), cw = i1 - ci + 1, chh = j1 - cj + 1;
    const pos = new Float32Array(cw * chh * 3), nor = new Float32Array(cw * chh * 3), cm = new Uint8Array(cw * chh * 4), cc = new Float32Array(cw * chh), idx = [];
    for (let j = cj; j <= j1; j++) for (let i = ci; i <= i1; i++) {
      const k = j * VW + i, q = (j - cj) * cw + (i - ci);
      pos[q * 3] = i * s; pos[q * 3 + 1] = hv[k]; pos[q * 3 + 2] = j * s;
      const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * s), dz = (h(i, j + 1) - h(i, j - 1)) / (2 * s), l = Math.hypot(dx, 1, dz);
      nor[q * 3] = -dx / l; nor[q * 3 + 1] = 1 / l; nor[q * 3 + 2] = -dz / l;
      cm.set(mat.subarray(k * 4, k * 4 + 4), q * 4); cc[q] = ceil[k];
    }
    for (let j = cj; j < j1; j++) for (let i = ci; i < Math.min(i1, lim); i++) {
      const k = j * VW + i;
      if (!show(k) && !show(k + 1) && !show(k + VW) && !show(k + VW + 1)) continue;
      const a = (j - cj) * cw + (i - ci), b = a + 1, c = a + cw, d = c + 1;
      if (Math.abs(hv[k] - hv[k + VW + 1]) < Math.abs(hv[k + 1] - hv[k + VW])) idx.push(a, c, d, a, d, b); else idx.push(a, c, b, b, c, d);
    }
    if (!idx.length) continue;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    g.setAttribute('cmat', new T.BufferAttribute(cm, 4, true)); g.setAttribute('cceil', new T.BufferAttribute(cc, 1));
    g.setIndex(idx); g.computeBoundingSphere();
    const mesh = new T.Mesh(g, mtl); mesh.matrixAutoUpdate = false;
    sc.root.add(mesh);
  }
}

/**
 * Rolling dunes past the map's edges, so the camera never looks off the end of the world: the edge's own height and
 * sand at the seam (a band under the edge, a little lower, hides the cracks between the two grids), easing into a low
 * swell along the wind further out. Kept low past the near edges, so it never hides the ground behind it.
 */
function buildSkirt(sc, dv, mtl) {
  const { VW, hv, mat, E, seed } = dv, st = 2, P = 60, N = Math.round((E + 2 * P) / st) + 1, ns = (seed % 997) + 3;
  const wx = Math.cos(dv.v.dune.wind), wz = Math.sin(dv.v.dune.wind);
  const vk = (x, y) => Math.round(Math.min(E, Math.max(0, y)) * CAVE_S) * VW + Math.round(Math.min(E, Math.max(0, x)) * CAVE_S);
  const fb = (x, y) => vnoise(x * 0.04, y * 0.04, ns) * 0.65 + vnoise(x * 0.11, y * 0.11, ns + 7) * 0.35;
  const hs = (x, y) => {
    const ex = Math.min(E, Math.max(0, x)), ey = Math.min(E, Math.max(0, y)), d = Math.hypot(x - ex, y - ey), he = hv[vk(x, y)];
    if (d === 0) return x > 0 && y > 0 && x < E && y < E ? he - 0.2 : he;
    const u = x * wx + y * wz, swell = 1.3 * Math.sin(u * 0.16 + fb(x, y) * 5) + 2.2 * (fb(x, y) - 0.45);
    return he + swell * (d * d / (d * d + 60)) + (x > E || y > E ? 0 : 0.06 * d);
  };
  const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), cm = new Uint8Array(N * N * 4), cc = new Float32Array(N * N), idx = [];
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    const x = -P + a * st, y = -P + b * st, q = b * N + a, y0 = hs(x, y), k = vk(x, y);
    const dx = (hs(x + 0.5, y) - hs(x - 0.5, y)), dz = (hs(x, y + 0.5) - hs(x, y - 0.5)), l = Math.hypot(dx, 1, dz);
    pos.set([x, y0, y], q * 3); nor.set([-dx / l, 1 / l, -dz / l], q * 3);
    cm.set([mat[k * 4], 0, 0, mat[k * 4 + 3]], q * 4); cc[q] = y0 + 200;
  }
  for (let b = 0; b < N - 1; b++) for (let a = 0; a < N - 1; a++) {
    const x = -P + a * st, y = -P + b * st;
    if (x >= st && y >= st && x + st <= E - st && y + st <= E - st) continue;   // the dunes' own mesh covers it
    const p = b * N + a; idx.push(p, p + N, p + N + 1, p, p + N + 1, p + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
  g.setAttribute('cmat', new T.BufferAttribute(cm, 4, true)); g.setAttribute('cceil', new T.BufferAttribute(cc, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  const mesh = new T.Mesh(g, mtl); mesh.matrixAutoUpdate = false; sc.root.add(mesh);
}

/** Flat-shaded triangles from a list of [a, b, c] corner triples ([x, y, z] each). */
function tris(list) {
  const pos = new Float32Array(list.length * 9);
  list.forEach((t, n) => t.forEach((p, k) => pos.set(p, n * 9 + k * 3)));
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
const quadT = (a, b, c, d) => [[a, b, c], [a, c, d]];
function buildPyramid(sc, dv) {
  const P = dv.pyramid, PY = dv.v.pyramid, x0 = P.pc - P.half, x1 = P.pc + P.half + 1, z0 = x0, z1 = x1, cx = (x0 + x1) / 2, cz = cx, y0 = P.base, top = P.top;
  const stone = worldMat(S.M.casing, { color: 0xffffff });
  const gold = new T.MeshStandardMaterial({ color: col(PY.cap), roughness: 0.32, metalness: 0.75, emissive: col(PY.cap), emissiveIntensity: 0.12 });
  const faces = [];
  if (!P.steps) {
    // the casing up to the capstone, then the capstone in gold
    const k = 0.92, h = top * k, r = (x1 - x0) / 2 * (1 - k);
    const A = [x0, y0, z1], B = [x1, y0, z1], C = [x1, y0, z0], D = [x0, y0, z0];
    const a = [cx - r, y0 + h, cz + r], b = [cx + r, y0 + h, cz + r], c = [cx + r, y0 + h, cz - r], d = [cx - r, y0 + h, cz - r];
    faces.push(...quadT(A, B, b, a), ...quadT(B, C, c, b), ...quadT(C, D, d, c), ...quadT(D, A, a, d));
    const apex = [cx, y0 + top, cz];
    sc.root.add(new T.Mesh(tris([[a, b, apex], [b, c, apex], [c, d, apex], [d, a, apex]]), gold));
  } else {
    // stepped tiers, each a little inset from the one below, a gilded shrine on top
    const n = P.steps;
    for (let t = 0; t < n; t++) {
      const r = (x1 - x0) / 2 * (1 - t / (n + 0.6)), ya = y0 + top * t / n, yb = y0 + top * (t + 1) / n;
      const A = [cx - r, ya, cz + r], B = [cx + r, ya, cz + r], C = [cx + r, ya, cz - r], D = [cx - r, ya, cz - r];
      const a = [cx - r, yb, cz + r], b = [cx + r, yb, cz + r], c = [cx + r, yb, cz - r], d = [cx - r, yb, cz - r];
      faces.push(...quadT(A, B, b, a), ...quadT(B, C, c, b), ...quadT(C, D, d, c), ...quadT(D, A, a, d), ...quadT(a, b, c, d));
    }
    const r = (x1 - x0) / 2 * (1 - n / (n + 0.6)) * 0.6, y = y0 + top;
    const shrine = new T.Mesh(new T.BoxGeometry(r * 2, r * 1.4, r * 2), gold); shrine.position.set(cx, y + r * 0.7, cz); sc.root.add(shrine);
    // the stair up the front
    const st = new T.Mesh(new T.BoxGeometry(5, top * 0.12, Math.hypot(top, (x1 - x0) / 2) * 1.02), stone);
    st.position.set(cx, y0 + top / 2, z1 - (x1 - x0) / 4 + 1); st.rotation.x = -Math.atan2(top, (x1 - x0) / 2 - 1.2); sc.root.add(st);
  }
  const body = new T.Mesh(tris(faces), stone); sc.root.add(body);
  // the door: a portal standing out of the face toward the camera, dark inside, sealed by a slab until the camps are won
  const portal = new T.Group(), frame = worldMat(S.M.glyph, { color: 0xe8e0d0 });
  const pw = 7, ph = 6.2, pd = 1.7, zf = z1 + 0.6;
  const mk = (w, h, d, x, y, z, m) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); portal.add(o); return o; };
  mk(1.6, ph, pd, cx - pw / 2 + 0.8, y0 + ph / 2, zf - pd / 2, frame); mk(1.6, ph, pd, cx + pw / 2 - 0.8, y0 + ph / 2, zf - pd / 2, frame);
  mk(pw + 1, 1.5, pd + 0.3, cx, y0 + ph - 0.2, zf - pd / 2, frame); mk(pw + 2, 0.8, pd + 0.6, cx, y0 + ph + 0.8, zf - pd / 2, gold);
  const hole = new T.Mesh(new T.PlaneGeometry(pw - 3.2, ph - 1.5), new T.MeshBasicMaterial({ color: 0x050302 })); hole.position.set(cx, y0 + (ph - 1.5) / 2, zf - pd + 0.05); portal.add(hole);
  const slab = mk(pw - 3.1, ph - 1.4, 0.45, cx, y0 + (ph - 1.4) / 2, zf - 0.3, stone);
  sc.root.add(portal);
  S.door = { slab, y: slab.position.y, t: 0, open: false };
}

function buildWater(sc, dv) {
  const { VW, VH, surf, hv } = dv, s = 1 / CAVE_S, pos = [], dep = [], idx = [], map = new Int32Array(VW * VH).fill(-1);
  const vert = (i, j, lq) => {
    const k = j * VW + i;
    if (map[k] >= 0) return map[k];
    const lv = Number.isNaN(surf[k]) ? lq : surf[k];
    map[k] = pos.length / 3; pos.push(i * s, lv, j * s); dep.push(lv - hv[k]);
    return map[k];
  };
  for (let j = 0; j < VH - 1; j++) for (let i = 0; i < VW - 1; i++) {
    const k = j * VW + i, ks = [k, k + 1, k + VW, k + VW + 1], wl = ks.filter((q) => !Number.isNaN(surf[q]));
    if (!wl.length || dv.vin[k]) continue;
    const lq = wl.reduce((a, q) => a + surf[q], 0) / wl.length;
    const a = vert(i, j, lq), b = vert(i + 1, j, lq), c = vert(i, j + 1, lq), d = vert(i + 1, j + 1, lq);
    idx.push(a, c, d, a, d, b);
  }
  if (!idx.length) return;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('wdepth', new T.Float32BufferAttribute(dep, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  S.waterUni = { tW: { value: S.M.water }, uT: { value: 0 }, cDeep: { value: rgb3('#0a4050') }, cMid: { value: rgb3('#1c8a86') }, cHi: { value: rgb3('#b8fff0') } };
  const m = new T.ShaderMaterial({ uniforms: S.waterUni, transparent: true, depthWrite: false,
    vertexShader: 'attribute float wdepth; varying vec3 vP; varying float vD; void main() { vP = position; vD = wdepth; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tW; uniform float uT; uniform vec3 cDeep, cMid, cHi; varying vec3 vP; varying float vD;
void main() {
  if (vD < 0.01) discard;
  float a = texture2D(tW, vP.xz * 0.12 + vec2(uT * 0.01, uT * 0.007)).r, b = texture2D(tW, vP.xz * 0.09 - vec2(uT * 0.008, -uT * 0.011)).r, l = (a + b) * 0.5;
  vec3 c = mix(cDeep, cMid, smoothstep(0.1, 0.9, 1.0 - min(1.0, vD / 1.4)) * 0.6 + smoothstep(0.35, 0.6, l) * 0.4);
  c += cHi * (smoothstep(0.62, 0.78, l) * 0.6 + (1.0 - smoothstep(0.0, 0.25, vD)) * 0.4);
  gl_FragColor = vec4(c, mix(0.5, 0.92, smoothstep(0.0, 1.0, vD)));
}` });
  const mesh = new T.Mesh(g, m); mesh.renderOrder = 2; mesh.frustumCulled = false;
  sc.root.add(mesh);
}

function buildTorches(sc, dv, inside) {
  const v = dv.v, color = inside ? v.pyramid.torch : '#ffb050', iron = new T.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.5 });
  const bronze = new T.MeshStandardMaterial({ color: 0x9a6a30, roughness: 0.4, metalness: 0.7 });
  const arm = new T.BoxGeometry(0.07, 0.07, 0.34), cup = new T.CylinderGeometry(0.11, 0.06, 0.16, 8), stick = new T.CylinderGeometry(0.035, 0.045, 0.3, 6);
  const post = new T.CylinderGeometry(0.09, 0.14, 1.1, 8), bowl = new T.CylinderGeometry(0.32, 0.14, 0.22, 10);
  const wood = new T.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
  for (const t of dv.torches) {
    if ((t.x >= dv.OXI - 2) !== inside) continue;
    const g = new T.Group();
    if (t.stand) {
      g.position.set(t.x, t.h, t.y);
      const p = new T.Mesh(post, bronze); p.position.y = 0.55; g.add(p);
      const b = new T.Mesh(bowl, bronze); b.position.y = 1.18; g.add(b);
      const f1 = glow(col(color), 1.6, 0.9), f2 = glow(0xfff0c0, 0.6, 1); f1.position.set(0, 1.55, 0); f2.position.set(0, 1.42, 0); g.add(f1, f2);
      sc.flick.push({ o: f1, base: 1.6 }, { o: f2, base: 0.6 });
      sc.lightSrc.push({ p: [t.x, t.h + 1.7, t.y], c: color, i: inside ? 1.2 : 0.8, r: 10 });
    } else {
      g.position.set(t.x, t.h, t.y); g.rotation.y = Math.atan2(t.nx, t.ny);
      const a = new T.Mesh(arm, iron); a.position.set(0, -0.12, -0.12); g.add(a);
      const c = new T.Mesh(cup, iron); c.position.set(0, -0.02, 0.06); g.add(c);
      const st = new T.Mesh(stick, wood); st.position.set(0, 0.1, 0.06); st.rotation.x = 0.15; g.add(st);
      const f1 = glow(col(color), 1.1, 0.9), f2 = glow(0xfff0c0, 0.45, 1); f1.position.set(0, 0.36, 0.1); f2.position.set(0, 0.3, 0.1); g.add(f1, f2);
      sc.flick.push({ o: f1, base: 1.1 }, { o: f2, base: 0.45 });
      sc.lightSrc.push({ p: [t.x + t.nx * 0.3, t.h + 0.4, t.y + t.ny * 0.3], c: color, i: 1, r: 9 });
    }
    sc.root.add(g);
  }
}

/** The slabs across the tomb's ways on (game/dunes.js lowers one when its room is won). */
function buildSeals(sc, dv) {
  const stone = worldMat(S.M.glyph, { color: 0xd8d0c4 });
  for (const s of dv.seals) {
    const w = s.axis === 'x' ? 3.4 : 0.6, d = s.axis === 'x' ? 0.6 : 3.4, h = 3.4;
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), stone);
    o.position.set(s.x, s.h + h / 2, s.y); sc.root.add(o);
    S.seals.push({ k: s.k, o, y: o.position.y, t: 0, open: false });
  }
}
/** Lower seal k (the slab sinks into the floor), or the pyramid's door (k = 'door'). */
export function openSeal(k) {
  if (!S) return;
  if (k === 'door') { if (S.door) S.door.open = true; return; }
  const s = S.seals.find((q) => q.k === k);
  if (s) s.open = true;
}

// ------------------------------------------------------------------ baked props
/** Obelisks, columns, urns and the sarcophagus: each model rendered once with the game's camera into a sprite. */
function bakeProps(dv) {
  const rd = renderer(), gl = rd.gl, v = dv.v, PY = v.pyramid, scene = new T.Scene();
  scene.add(new T.AmbientLight(0xffffff, 1.4));
  const keyL = new T.DirectionalLight(0xfff0dc, 2.6); keyL.position.set(-40, 70, 30); scene.add(keyL, keyL.target);
  const rim = new T.DirectionalLight(0xb8c8ff, 0.8); rim.position.set(50, 30, -60); scene.add(rim, rim.target);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 1600);
  cam.position.copy(rd.cam.position); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const stone = worldMat(S.M.glyph, { color: 0xffffff }), plain = worldMat(S.M.casing, { color: 0xffffff });
  const gold = new T.MeshStandardMaterial({ color: col(PY.cap), roughness: 0.3, metalness: 0.8 });
  const clay = new T.MeshStandardMaterial({ color: 0xb07040, roughness: 0.8 }), blue = new T.MeshStandardMaterial({ color: col(PY.glyph), roughness: 0.5, metalness: 0.2 });
  const bake = (group) => {
    group.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(group), cs = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) cs.push([x, y, z]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [X, Y, Z] of cs) { const sx = (X - Z) * HW, sy = (X + Z) * HH - Y * VZ; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; x1 = Math.ceil(x1) + 2; y1 = Math.ceil(y1) + 2;
    const w = x1 - x0, h = y1 - y0;
    cam.left = x0 / SC; cam.right = x1 / SC; cam.top = -y0 / SC; cam.bottom = -y1 / SC; cam.updateProjectionMatrix();
    scene.add(group);
    gl.setSize(w, h, false); gl.setClearColor(0x000000, 0); gl.render(scene, cam);
    const c = makeCanvas(w, h); c.getContext('2d').drawImage(gl.domElement, 0, 0);
    scene.remove(group);
    group.traverse((o) => o.geometry && o.geometry.dispose());
    return { img: c, sx: 0, sy: 0, w, h, ox: x0, oy: y0 };
  };
  const out = { obelisk: [], pillar: [], urn: [], sarcophagus: [] };
  for (let k = 0; k < 3; k++) {   // obelisks: tall tapered shafts with a gilded pyramidion
    const g = new T.Group(), hgt = k === 2 ? 7.5 : 5 + k, r0 = k === 2 ? 0.55 : 0.42, r1 = r0 * 0.62;
    const shaft = new T.Mesh(new T.CylinderGeometry(r1 * Math.SQRT2, r0 * Math.SQRT2, hgt, 4, 1), stone); shaft.rotation.y = Math.PI / 4; shaft.position.y = hgt / 2; g.add(shaft);
    const tip = new T.Mesh(new T.ConeGeometry(r1 * Math.SQRT2, r1 * 1.6, 4), gold); tip.rotation.y = Math.PI / 4; tip.position.y = hgt + r1 * 0.8; g.add(tip);
    const plinth = new T.Mesh(new T.BoxGeometry(r0 * 3, 0.4, r0 * 3), plain); plinth.position.y = 0.2; g.add(plinth);
    out.obelisk.push(bake(g));
  }
  {   // a column: a papyrus shaft, bands, an open lotus capital, an abacus
    const g = new T.Group(), H = 5.4, shaft = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, H * 0.8, 14), stone); shaft.position.y = H * 0.4; g.add(shaft);
    for (const y of [0.55, 0.62]) { const b = new T.Mesh(new T.CylinderGeometry(0.47, 0.47, 0.12, 14), blue); b.position.y = H * y; g.add(b); }
    const cap = new T.Mesh(new T.CylinderGeometry(0.85, 0.44, H * 0.14, 14), gold); cap.position.y = H * 0.87; g.add(cap);
    const ab = new T.Mesh(new T.BoxGeometry(1.5, 0.4, 1.5), plain); ab.position.y = H * 0.96; g.add(ab);
    const foot = new T.Mesh(new T.CylinderGeometry(0.66, 0.7, 0.3, 14), plain); foot.position.y = 0.15; g.add(foot);
    out.pillar.push(bake(g));
  }
  for (let k = 0; k < 3; k++) {   // canopic jars and urns
    const pts = [], h = 0.7 + k * 0.15;
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new T.Vector2(0.05 + 0.24 * Math.sin(Math.PI * (0.15 + t * 0.75)) + (t > 0.9 ? 0.04 : 0), t * h)); }
    const g = new T.Group(), body = new T.Mesh(new T.LatheGeometry(pts, 14), k === 1 ? gold : clay); g.add(body);
    const lid = new T.Mesh(new T.SphereGeometry(0.14, 10, 8), k === 2 ? blue : gold); lid.position.y = h + 0.06; g.add(lid);
    out.urn.push(bake(g));
  }
  {   // the sarcophagus: a gilded case on a stone bier
    const g = new T.Group(), bier = new T.Mesh(new T.BoxGeometry(2.6, 0.7, 3.6), plain); bier.position.y = 0.35; g.add(bier);
    const cs = new T.Mesh(new T.BoxGeometry(1.5, 0.9, 2.8), gold); cs.position.y = 1.15; g.add(cs);
    const lid = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 2.8, 12, 1, false, 0, Math.PI), blue); lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.y = 1.6; lid.scale.set(1, 1, 0.5); g.add(lid);
    const mask = new T.Mesh(new T.SphereGeometry(0.42, 12, 10), gold); mask.position.set(0, 1.75, 1.05); mask.scale.set(1, 0.8, 0.6); g.add(mask);
    out.sarcophagus.push(bake(g));
  }
  stone.dispose(); plain.dispose(); gold.dispose(); clay.dispose(); blue.dispose();
  rd.w = rd.h = 0;
  return out;
}
/** The baked sprite of a prop (null until the scenes are built). */
export function duneSprite(kind, m) { const l = S && S.props && S.props[kind]; return l && l.length ? l[m % l.length] : null; }

// ------------------------------------------------------------------ each frame
export function tickDunes3D(dt, cr) {
  if (!S || S.dv !== cr.dv) return;
  S.t += dt;
  if (S.waterUni) S.waterUni.uT.value = S.t;
  const sc = cr.inside ? S.int : S.ext;
  for (const f of sc.flick) f.o.scale.setScalar(f.base * (0.86 + 0.14 * Math.sin(S.t * 13 + f.base * 9) * Math.sin(S.t * 7.3 + f.base)));
  const sink = (o) => { if (!o.open || o.t >= 1) return; o.t = Math.min(1, o.t + dt / 1.6); const e = o.t * o.t * (3 - 2 * o.t); (o.slab || o.o).position.y = o.y - e * 4.2; };
  if (S.door) sink(S.door);
  for (const s of S.seals) sink(s);
}
/** Draw the region the hero is in (cr.inside: the tomb) behind the sprites. cr = world.cave (game/dunes.js). */
export function drawDunes3D(ctx, cr) {
  const W = G.W * G.dpr, H = G.H * G.dpr;
  if (!S || S.dv !== cr.dv) { ctx.fillStyle = cr.inside ? '#050302' : cr.dv.v.sky.haze; ctx.fillRect(0, 0, W, H); return; }
  const rd = renderer(), z = camera.zoom, q = G.touch ? 0.75 : 1, sc = cr.inside ? S.int : S.ext;
  const pw = Math.max(16, Math.round(G.W / z * q)), ph = Math.max(16, Math.round(G.H / z * q));
  if (rd.w !== pw || rd.h !== ph) { rd.gl.setSize(pw, ph, false); rd.w = pw; rd.h = ph; }
  const cx = camera.x + camera.shakeX, cy = camera.y + camera.shakeY, hw = G.W / 2 / z, hh = G.H / 2 / z, cam = rd.cam;
  cam.left = (cx - hw) / SC; cam.right = (cx + hw) / SC; cam.top = -(cy - hh) / SC; cam.bottom = -(cy + hh) / SC; cam.updateProjectionMatrix();
  const [fx, fy, fz] = cr.focus;
  sc.uni.uCut.value.set(fx, fy, fz, cr.cut ? 1 : 0);
  const near = [];
  for (const l of sc.lightSrc) { const dd = (l.p[0] - fx) ** 2 + (l.p[1] - fy) ** 2 * 0.5 + (l.p[2] - fz) ** 2; if (dd < 700) near.push([dd, l]); }
  near.sort((a, b) => a[0] - b[0]);
  const pool = sc.pool, heroLit = cr.inside || S.v.sky.night;
  pool[0].position.set(fx, fy + 2.4, fz); pool[0].color.set(0xffe0b8); pool[0].distance = 9; pool[0].intensity = heroLit ? 7 : 0;
  for (let i = 1; i < pool.length; i++) {
    const L = pool[i], n = near[i - 1];
    if (!n) { L.intensity = 0; continue; }
    const l = n[1], fl = 0.85 + 0.15 * Math.sin(S.t * 9 + i * 1.7) * Math.sin(S.t * 5.3 + i);
    L.position.set(...l.p); L.color.set(l.c); L.distance = l.r; L.intensity = 14 * l.i * fl * (cr.inside || S.v.sky.night ? 1 : 0.3);
  }
  rd.gl.setClearColor(cr.inside ? S.v.pyramid.fog : S.v.sky.haze, 1);
  rd.gl.render(sc.scene, cam);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(rd.gl.domElement, 0, 0, W, H);
  ctx.imageSmoothingEnabled = sm;
}

export function disposeDunes3D() {
  if (!S) return;
  for (const sc of [S.ext, S.int]) sc && sc.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
  for (const t of Object.values(S.M)) t.dispose?.();
  S = null;
}
export const dunesScene = () => S;
