// An equipped weapon as a live three.js model: the Death Knight's flying sword in its 3D look (G.settings.dkBlade
// 'model'). Every design of a set baked with models is its own three.js JSON file (assets/models/held/<set>/NN.json,
// THREE.ObjectLoader), written by tools/weapons3d_bake.js from the same procedural build as the held and whole sprites,
// so the model and the 2D sprite are one sword. Metal, trim and grip take the item's palette finish in the shader (the
// luminance ramps heldart.js recolours the sprites with), glowing parts the item's element, and each socketed gem sits
// in a socket as a lit jewel. Drawn on one shared offscreen WebGL canvas and copied into the 2D frame at the device
// resolution, as the Runeblade is (runeblade3d.js). three.js loads on first use; until then drawHeldModel3D returns null.
import { heldSetOf, heldElement, HELD_START } from '../data/held.js';
import { PALETTES } from '../data/gear.js';
import { GEMS } from '../data/items.js';
import { paletteLuts } from '../core/gearart.js';
import { fxColor } from './heldfx.js';
import { heldLook } from './heldart.js';

const BASE = 'assets/models/held/', MAXC = 1024, LUM = 'vec3(0.299, 0.587, 0.114)';
let T = null, R = null, boot = null, dead = false;
const files = new Map();   // 'set/i' -> { obj, guard, rad } once parsed ({} while loading, { failed } on error)
const looks = new Map();   // 'set/i|finish|element|gems' -> a dressed copy: { pivot, obj, marks: [[kind, Object3D, r]] }

/** What the metal reflects (RoomEnvironment's idea, without the addon): a dim room lit by a few bright panels. */
function studio() {
  const sc = new T.Scene(), box = new T.BoxGeometry(1, 1, 1);
  sc.add(new T.Mesh(new T.BoxGeometry(12, 12, 12), new T.MeshBasicMaterial({ color: 0x4a4650, side: T.BackSide })));
  for (const [x, y, z, sx, sy, sz, c, k] of [[0, 5.8, 0, 7, 0.1, 7, 0xffffff, 5], [-5.8, 2, 3, 0.1, 4, 5, 0xfff0d8, 3], [5.8, 1, -2, 0.1, 3, 4, 0xc8d8ff, 2], [0, 1, 5.8, 5, 3, 0.1, 0xffffff, 1.5]]) {
    const m = new T.Mesh(box, new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k) }));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); sc.add(m);
  }
  return sc;
}
function start() {
  return (boot ||= import('three').then((t) => {
    T = t;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const gl = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    gl.setPixelRatio(1); gl.outputColorSpace = T.SRGBColorSpace; gl.setClearColor(0, 0); gl.autoClear = false;
    const scene = new T.Scene();
    scene.environment = new T.PMREMGenerator(gl).fromScene(studio(), 0.04).texture;
    // lit as the bake lights the sprites: a warm key from the upper left front, a cool sky fill, a faint rim
    const key = new T.DirectionalLight(0xfff0d8, 3.2); key.position.set(-0.7, 1, 0.8);
    const rim = new T.DirectionalLight(0xffe0b0, 1.0); rim.position.set(0.9, 0.5, -0.6);
    scene.add(key, rim, new T.HemisphereLight(0xd8dcff, 0x40342a, 1.3));
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, -4000, 4000); cam.position.z = 2000;
    R = { gl, canvas, scene, cam };
  }).catch((e) => { dead = true; console.warn('held 3D models unavailable:', e); }));
}

/** A design's parsed model (null while it loads; starts the load). */
function file(set, i) {
  const id = `${set}/${String(i).padStart(2, '0')}`;
  let f = files.get(id);
  if (!f) {
    files.set(id, (f = {}));
    fetch(BASE + id + '.json').then((r) => { if (!r.ok) throw new Error(id + ' ' + r.status); return r.json(); })
      .then((j) => new T.ObjectLoader().parseAsync(j))
      .then((obj) => {
        let guard = null, tip = null;
        obj.traverse((o) => { if (o.userData?.kind === 'guard') guard = o.position.clone(); if (o.userData?.kind === 'tip') tip = o.position.clone(); });
        guard ||= new T.Vector3();
        const box = new T.Box3().setFromObject(obj), c = new T.Vector3();
        let rad = 0;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) rad = Math.max(rad, c.set(x, y, z).distanceTo(guard));
        Object.assign(f, { obj, guard, rad, len: tip ? Math.max(1, tip.y - guard.y) : rad });
      })
      .catch((e) => { f.failed = true; console.warn('held model unavailable:', id, e.message || e); });
  }
  return f.obj ? f : null;
}

const ramps = new Map();
/** A palette ramp as a 256 x 1 texture (sRGB bytes, read raw). */
function rampTex(pi, m) {
  const key = pi + m;
  let t = ramps.get(key);
  if (t) return t;
  const L = paletteLuts(pi)[m] || paletteLuts(pi).metal, d = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) { d[i * 4] = L[i * 3] * 255; d[i * 4 + 1] = L[i * 3 + 1] * 255; d[i * 4 + 2] = L[i * 3 + 2] * 255; d[i * 4 + 3] = 255; }
  t = new T.DataTexture(d, 256, 1, T.RGBAFormat); t.magFilter = t.minFilter = T.LinearFilter; t.needsUpdate = true;
  ramps.set(key, t);
  return t;
}
const RAMP = { metal: 'metal', trim: 'trim', grip: 'leather' };
/** A material in palette pi: its colour (texture x tint) mapped through the ramp by luminance, keeping the luminance. */
function finished(m, pi, ramp) {
  const mm = m.clone(), tex = rampTex(pi, ramp), k = PALETTES[pi].k;
  mm.onBeforeCompile = (sh) => {
    sh.uniforms.uRamp = { value: tex }; sh.uniforms.uK = { value: k };
    sh.fragmentShader = 'uniform sampler2D uRamp; uniform float uK;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 s = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)); float l = dot(s, ${LUM}); vec3 t = texture2D(uRamp, vec2(l, 0.5)).rgb;
        diffuseColor.rgb = pow(mix(s, min(t * (l + 0.01) / (dot(t, ${LUM}) + 0.01), 1.0), uK), vec3(2.2)); }`);
  };
  mm.customProgramCacheKey = () => 'held-ramp';
  return mm;
}
/** The design dressed for one item: finish, element, socketed gems. */
function dressed(f, key, finish, element, gems) {
  let L = looks.get(key);
  if (L) return L;
  const obj = f.obj.clone(true), ec = new T.Color(...fxColor(element).map((v) => v / 255)), pal = finish && PALETTES[finish]?.ramps;
  const own = new Map(); // a material shared by several meshes is dressed once
  obj.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const m = o.material, reg = m.userData?.region;
    if (!own.has(m)) {
      let mm = m;
      if (reg === 'glow') { mm = m.clone(); mm.color = ec.clone().multiplyScalar(0.3); mm.emissive = ec.clone(); }
      else if (pal && RAMP[reg]) mm = finished(m, finish, RAMP[reg]);
      own.set(m, mm);
    }
    o.material = own.get(m);
  });
  const marks = [], slots = [];
  obj.traverse((o) => { if (o.userData?.kind) { marks.push([o.userData.kind, o, o.userData.r || 0]); if (o.userData.kind === 'slot') slots.push(o); } });
  gems.forEach((g, n) => { // the item's gems, one to a socket
    const at = slots[n % Math.max(1, slots.length)];
    if (!at) return;
    const c = new T.Color(g), gm = new T.Mesh(new T.OctahedronGeometry(0.85, 0), new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0.2 }));
    gm.scale.set(1, 1, 0.65); gm.position.copy(at.position); gm.position.z += Math.sign(at.position.z || 1) * 0.3 * Math.floor(n / Math.max(1, slots.length) + 1);
    obj.add(gm);
  });
  obj.position.copy(f.guard).multiplyScalar(-1);
  const pivot = new T.Group(); pivot.add(obj);
  if (looks.size >= 6) looks.delete(looks.keys().next().value);
  looks.set(key, (L = { pivot, obj, marks, rad: f.rad }));
  return L;
}

/** True once `item` (held by `cls`) has a model that can draw: start loading it if not. False when it never will. */
export function heldModel3DReady(item, cls) {
  if (dead || !item) return false;
  if (!T) { start(); return false; }
  const set = heldSetOf(item.base, 'weapon', cls), look = heldLook(item);
  return !!(set && look && file(set, HELD_START[item.rarity | 0] + look[0]));
}

/**
 * Draw an equipped weapon's model with its guard at (x, y) (current ctx units), the blade `len` long to its point along
 * screen angle a, turned `spin` round its length and tipped `tilt` toward the viewer. Returns the effect points in ctx
 * units ({ pts: { guard, tip, head, line, orbit, slots }, k: units per model unit, face: 0..1 how square-on }) or null
 * when the model can't draw yet (no WebGL, loading, no model for this piece).
 */
export function drawHeldModel3D(ctx, item, cls, x, y, a, len, o = {}) {
  if (!heldModel3DReady(item, cls) || !R || len <= 0) return null;
  const set = heldSetOf(item.base, 'weapon', cls), look = heldLook(item), i = HELD_START[item.rarity | 0] + look[0], f = file(set, i);
  const element = heldElement(item) || f.obj.userData.element || 'cold', gems = (item.gems || []).map((g) => GEMS[g.gem]?.color || '#ffffff');
  const L = dressed(f, `${set}/${i}|${look[1] | 0}|${element}|${gems.join()}`, look[1] | 0, element, gems);
  const k = len / f.len, half = Math.ceil(L.rad * k + 2);
  const { gl, canvas, scene, cam } = R, tf = ctx.getTransform();
  const res = Math.min(Math.max(0.25, Math.hypot(tf.a, tf.b)), MAXC / (half * 2)), w = Math.max(1, Math.ceil(half * 2 * res));
  if (canvas.width < w) { const n = Math.min(MAXC, 1 << Math.ceil(Math.log2(w))); gl.setSize(n, n, false); }
  L.pivot.rotation.set(o.tilt || 0, o.spin || 0, -a - Math.PI / 2, 'ZXY');
  L.pivot.scale.setScalar(k);
  scene.add(L.pivot); L.pivot.updateMatrixWorld(true);
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
  gl.setViewport(0, 0, w, w); gl.setScissor(0, 0, w, w); gl.setScissorTest(true);
  gl.clear(); gl.render(scene, cam); gl.setScissorTest(false);
  scene.remove(L.pivot);
  ctx.drawImage(canvas, 0, canvas.height - w, w, w, x - half, y - half, half * 2, half * 2);
  // the effect points, in ctx units
  const v = new T.Vector3(), at = (m) => { m.getWorldPosition(v); return [x + v.x, y - v.y]; }, pts = { slots: [] };
  let l0 = null, l1 = null;
  for (const [kind, m, r] of L.marks) {
    if (kind === 'slot') pts.slots.push(at(m));
    else if (kind === 'l0') l0 = at(m); else if (kind === 'l1') l1 = at(m);
    else if (kind === 'head' || kind === 'orbit') pts[kind] = [...at(m), r * k];
    else pts[kind] = at(m);
  }
  pts.line = l0 && l1 ? [l0, l1] : null;
  const face = Math.abs(v.set(0, 0, 1).applyQuaternion(L.pivot.quaternion).z);
  return { pts, k, face, name: f.obj.userData.name };
}
