// The 3D pack opening (three.js): a foil booster before the Riftgate, torn open; the cards rise and flip one by one
// with holo foil that moves with the light and the angle (stronger by rarity), light pillars for the rare ones.
// Also a viewer to turn any card in 3D. three.js loads only when one of these opens.
import { RARITIES } from '../data/kits.js';
import { ART } from '../core/assets.js';
import { makeCanvas, shade, rgba } from '../core/util.js';
import { renderCard, renderBack, ensureCardArt, CARD_W, CARD_H } from './cardart.js';
import { heroCanvas, loadHeroArt } from '../art/heroart.js';
import { heroBaseLook, HEROES } from '../data/heroes.js';
import { sfx } from '../core/audio.js';

let THREE = null, R = null, open = false;
export const packOpen = () => open;
const CW = 2.52, CH = 3.52;
/** What the camera sees at depth z: its width and height in world units (phones held upright see a narrow strip). */
const view = (z = 0) => { const h = 2 * Math.tan(18 * Math.PI / 180) * (10 - z); return { h, w: h * innerWidth / innerHeight }; };

const VERT = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
// foil: a rainbow that slides with the view angle, an etched sparkle pattern, a moving glare; rounded corners
const FRAG = `uniform sampler2D map; uniform float foil; uniform float galaxy; uniform float time; uniform vec3 light; uniform float corner; uniform float back;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); return v*mix(vec3(1.),k,s); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 uv = vUv; vec2 q = abs(uv - 0.5) * vec2(${(CW / CH).toFixed(4)}, 1.0) - (vec2(${(CW / CH).toFixed(4)}, 1.0) * 0.5 - corner);
  if (length(max(q, 0.0)) > corner) discard;
  vec4 base = texture2D(map, uv);
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = max(dot(n, v), 0.0);
  vec3 col = base.rgb;
  if (foil > 0.0) {
    float t = uv.x * 1.3 + uv.y * 0.8 + v.x * 1.8 - v.y * 1.2 + time * 0.03;
    vec3 rain = hsv(fract(t), 0.75, 1.0);
    vec2 g = floor(uv * vec2(180.0, 252.0)); float sp = step(0.93, hash(g)) * (0.5 + 0.5 * sin(time * 3.0 + hash(g + 3.1) * 40.0 + v.x * 20.0));
    float diag = 0.5 + 0.5 * sin((uv.x + uv.y) * 60.0 + v.x * 10.0);
    float art = step(0.455, uv.y) * step(uv.y, 0.877) * step(0.08, uv.x) * step(uv.x, 0.92);
    float frame = 1.0 - step(0.075, uv.x) * step(uv.x, 0.925) * step(0.045, uv.y) * step(uv.y, 0.955);
    float mask = 0.35 + 0.65 * max(art, frame);
    float band = pow(0.5 + 0.5 * sin((uv.x * 0.8 - uv.y * 1.2 + v.x * 2.5 + v.y * 1.5) * 6.2832), 6.0);   // a sheen that sweeps as the card turns
    float s = foil * mask * (0.18 + 0.2 * diag + 0.45 * sp + 0.7 * band);
    col = col + rain * s * 0.42 * (1.1 - ndv * 0.5);
    col = mix(col, col * (rain * 0.5 + 0.7), foil * 0.1 * mask);
    if (galaxy > 0.0) { float st = step(0.985, hash(floor(uv * vec2(160.0, 224.0)) + floor(time * 2.0))); col += vec3(0.9, 0.85, 1.0) * st * galaxy * art; }
  }
  vec3 L = normalize(light - vP); vec3 h = normalize(L + v);
  float spec = pow(max(dot(n, h), 0.0), 90.0) * (0.15 + foil * 0.35);
  col += spec * vec3(1.0, 0.97, 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;

async function ensureThree() {
  if (THREE) return;
  THREE = await import('three');
}
function setup() {
  const host = document.getElementById('pack3d');
  host.classList.remove('hidden'); host.innerHTML = '';
  open = true;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 10);
  // the rift behind everything: a swirling blue-black vortex on a big plane
  const riftMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, flash: { value: 0 }, tint: { value: new THREE.Color('#3a6cff') } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float time; uniform float flash; uniform vec3 tint; varying vec2 vUv;
      void main(){ vec2 p = vUv - 0.5; p.x *= 1.8; float r = length(p), a = atan(p.y, p.x);
        float sw = sin(a * 5.0 + r * 18.0 - time * 1.4) * 0.5 + 0.5, sw2 = sin(a * 3.0 - r * 11.0 + time * 0.9) * 0.5 + 0.5;
        float core = exp(-r * 5.5);
        vec3 c = mix(vec3(0.005, 0.008, 0.02), tint * 0.55, sw * sw2 * exp(-r * 2.6)) + tint * core * 0.9 + vec3(0.7,0.8,1.0) * exp(-r * 22.0) * 0.6;
        c += tint * flash * exp(-r * 2.0);
        gl_FragColor = vec4(c, 1.0); }` });
  const rift = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), riftMat);
  rift.position.z = -8; scene.add(rift);
  // drifting sparks
  const N = 500, pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 22; pos[i * 3 + 1] = (Math.random() - 0.5) * 14; pos[i * 3 + 2] = -6 + Math.random() * 10; spd[i] = 0.2 + Math.random() * 0.8; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#9ab8ff', size: 0.05, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pts);
  scene.add(new THREE.AmbientLight('#ffffff', 0.6));
  const light = new THREE.Vector3(3, 3, 6);
  R = { host, renderer, scene, camera, riftMat, pts, spd, light, tweens: [], t: 0, raf: 0, bursts: [], onFrame: null, cleanup: [] };
  const onResize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize); R.cleanup.push(() => removeEventListener('resize', onResize));
  const loop = (now) => {
    if (!R) return;
    const dt = Math.min(0.05, (now - (R.last || now)) / 1000); R.last = now; R.t += dt;
    riftMat.uniforms.time.value = R.t; riftMat.uniforms.flash.value = Math.max(0, riftMat.uniforms.flash.value - dt * 1.5);
    const p = pg.attributes.position.array;
    for (let i = 0; i < N; i++) { p[i * 3 + 1] += spd[i] * dt * 0.4; if (p[i * 3 + 1] > 7) p[i * 3 + 1] = -7; }
    pg.attributes.position.needsUpdate = true;
    light.set(Math.sin(R.t * 0.6) * 4, 2.5 + Math.cos(R.t * 0.4) * 1.5, 6);
    for (let i = R.tweens.length - 1; i >= 0; i--) { const tw = R.tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(tw.ease ? tw.ease(k) : k); if (k >= 1) { R.tweens.splice(i, 1); tw.done?.(); } }
    for (let i = R.bursts.length - 1; i >= 0; i--) { const b = R.bursts[i]; b.t += dt; b.update(b.t); if (b.t > b.life) { scene.remove(b.obj); R.bursts.splice(i, 1); } }
    scene.traverse((o) => { if (o.material?.uniforms?.time && o !== rift) { o.material.uniforms.time.value = R.t; o.material.uniforms.light.value.copy(light); } });
    R.onFrame?.(dt);
    if (R.shake > 0) { R.shake = Math.max(0, R.shake - dt * 3); camera.position.x = (Math.random() - 0.5) * R.shake * 0.15; camera.position.y = (Math.random() - 0.5) * R.shake * 0.15; }
    renderer.render(scene, camera);
    R.raf = requestAnimationFrame(loop);
  };
  R.raf = requestAnimationFrame(loop);
  return R;
}
export function closeOverlay() {
  if (!R) return;
  cancelAnimationFrame(R.raf);
  for (const f of R.cleanup) f();
  R.renderer.dispose();
  R.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.uniforms?.map?.value?.dispose?.(); o.material.map?.dispose?.(); o.material.dispose?.(); } });
  R.host.innerHTML = ''; R.host.classList.add('hidden');
  R = null; open = false;
}
const ease = { out: (k) => 1 - Math.pow(1 - k, 3), inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), back: (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) };
const tween = (dur, fn, done, e = ease.out) => R.tweens.push({ t: 0, dur, fn, done, ease: e });
const wait = (s) => new Promise((r) => tween(s, () => {}, r));

function foilMaterial(tex, foil, galaxy = 0) {
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, foil: { value: foil }, galaxy: { value: galaxy }, time: { value: 0 }, light: { value: new THREE.Vector3() }, corner: { value: 0.045 }, back: { value: 0 } },
    vertexShader: VERT, fragmentShader: FRAG });
}
/** A card: two faces back to back. Front foil by rarity (foil cards always shine). */
function cardMesh(card, entry, stats) {
  const g = new THREE.Group(), r = card.rarity, foil = (entry?.foil ? 0.4 : 0) + [0, 0.04, 0.14, 0.32, 0.5, 0.65][r];
  const front = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), foilMaterial(new THREE.CanvasTexture(renderCard(card, entry, 1, stats)), Math.min(1.2, foil), r === 5 ? 1 : 0));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), foilMaterial(new THREE.CanvasTexture(renderBack(1)), 0.25));
  back.rotation.y = Math.PI; front.position.z = 0.004; back.position.z = -0.004;
  g.add(front, back);
  g.userData = { card, entry };
  return g;
}
function burst(pos, color, n = 80, speed = 3) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
  for (let i = 0; i < n; i++) { p.set([pos.x, pos.y, pos.z], i * 3); const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = speed * (0.3 + Math.random()); v.push([Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s, Math.sin(a) * Math.cos(b) * s * 0.4]); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  R.scene.add(m);
  R.bursts.push({ obj: m, t: 0, life: 1.4, update: (t) => { const a = geo.attributes.position.array; for (let i = 0; i < n; i++) { a[i * 3] += v[i][0] * 0.016; a[i * 3 + 1] += (v[i][1] - t * 2) * 0.016; a[i * 3 + 2] += v[i][2] * 0.016; } geo.attributes.position.needsUpdate = true; m.material.opacity = 1 - t / 1.4; } });
}
function pillar(pos, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 16, 32, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(pos.x, pos.y, pos.z - 1.5); R.scene.add(m);
  R.bursts.push({ obj: m, t: 0, life: 1.8, update: (t) => { m.material.opacity = Math.sin(Math.min(1, t / 1.8) * Math.PI) * 0.35; m.rotation.y += 0.05; } });
}

/** The booster's wrapper art: foil colour, the pack's name, a hero from its class and the logo. */
async function packTexture(pack) {
  const c = makeCanvas(600, 920), x = c.getContext('2d'), col = pack.color;
  const g = x.createLinearGradient(0, 0, 600, 920); g.addColorStop(0, shade(col, 0.2)); g.addColorStop(0.5, shade(col, -0.45)); g.addColorStop(1, shade(col, -0.75));
  x.fillStyle = g; x.fillRect(0, 0, 600, 920);
  for (let i = 0; i < 40; i++) { x.strokeStyle = rgba('#ffffff', 0.04 + Math.random() * 0.05); x.lineWidth = 2 + Math.random() * 8; x.beginPath(); x.moveTo(Math.random() * 600, 0); x.lineTo(Math.random() * 600, 920); x.stroke(); }
  // crimped ends
  x.fillStyle = shade(col, -0.6); for (const y of [0, 880]) { x.fillRect(0, y, 600, 40); x.fillStyle = rgba('#000000', 0.35); for (let i = 0; i < 600; i += 12) x.fillRect(i, y, 6, 40); x.fillStyle = shade(col, -0.6); }
  const cls = pack.art, hero = HEROES.find((h) => h.cls === cls && h.core);
  try { await loadHeroArt(cls); const img = heroCanvas(heroBaseLook(hero), 3); if (img) { const k = 620 / (img.feet - img.headTop * 0.7); x.globalAlpha = 0.95; x.drawImage(img, 300 - img.width * k / 2, 860 - img.feet * k, img.width * k, img.height * k); x.globalAlpha = 1; } } catch { /* art optional */ }
  const v = x.createLinearGradient(0, 520, 0, 900); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)'); x.fillStyle = v; x.fillRect(0, 520, 600, 380);
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.shadowColor = col; x.shadowBlur = 20;
  x.font = '900 34px Cinzel, serif'; x.fillText('VELSCOUR DEFENSE', 300, 100);
  x.font = '900 54px Cinzel, serif'; x.fillText(pack.name.toUpperCase(), 300, 760);
  x.shadowBlur = 0; x.font = '600 26px "Alegreya Sans", sans-serif'; x.fillStyle = '#e8e0f0'; x.fillText(pack.sub, 300, 806);
  x.font = '800 24px "Alegreya Sans", sans-serif'; x.fillText(pack.kind === 'hero' ? '1 RIFT CARD' : `${pack.count} RIFT CARDS`, 300, 846);
  return c;
}
/** A 2D picture of a pack for the Altar's menu. */
export async function packPreview(pack, w = 150, h = 220) {
  const c = await packTexture(pack), out = makeCanvas(w * 2, h * 2), x = out.getContext('2d');
  x.drawImage(c, 0, 0, out.width, out.height);
  const sh = x.createLinearGradient(0, 0, out.width, out.height); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.45, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)');
  x.fillStyle = sh; x.fillRect(0, 0, out.width, out.height);
  out.style.width = w + 'px'; out.style.height = h + 'px';
  return out;
}

function ui(html) { const d = document.createElement('div'); d.innerHTML = html; R.host.appendChild(d); return d; }

/**
 * Open a pack in 3D. results: [{ card, foil, dup, entry }] from gacha.openPack. Resolves when the Commander is done;
 * opts.again: a function to open another (returns a promise) shown as a button.
 */
export async function openPack3D(pack, results, opts = {}) {
  await ensureThree();
  await document.fonts?.ready;
  await Promise.all(results.map((r) => ensureCardArt(r.card).catch(() => {})));
  setup();
  R.riftMat.uniforms.tint.value.set(pack.color);
  const hint = ui(`<div class="p3-hint">Tap the pack to tear it open</div><div class="p3-name"></div><div class="p3-ui"><button class="btn ghost" data-k="skip">Reveal all ⏭</button></div>`);
  const hintEl = hint.querySelector('.p3-hint'), nameEl = hint.querySelector('.p3-name');
  // the wrapper in two pieces: the strip that tears off (the top 9%) and the body
  const wrap = await packTexture(pack), cut = Math.round(wrap.height * 0.09);
  const piece = (y, h) => { const c = makeCanvas(wrap.width, h); c.getContext('2d').drawImage(wrap, 0, y, wrap.width, h, 0, 0, wrap.width, h); return new THREE.CanvasTexture(c); };
  const packG = new THREE.Group();
  const body = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.75 * 0.91), foilMaterial(piece(cut, wrap.height - cut), 0.55));
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.75 * 0.09), foilMaterial(piece(0, cut), 0.55));
  body.material.uniforms.corner.value = 0.0; strip.material.uniforms.corner.value = 0.0;
  body.position.y = -4.75 * 0.045; strip.position.y = 4.75 * 0.455;
  packG.add(body, strip);
  packG.position.set(0, -6, 0);
  packG.scale.setScalar(Math.min(1, view(0).w * 0.86 / 3.1, view(0).h * 0.78 / 4.75));
  R.scene.add(packG);
  tween(0.9, (k) => { packG.position.y = -6 + 6 * k; packG.rotation.z = (1 - k) * 0.4; }, null, ease.back);
  let state = 'pack', idleT = 0;
  R.onFrame = (dt) => { if (state === 'pack') { idleT += dt; packG.rotation.y = Math.sin(idleT * 1.3) * 0.25; packG.rotation.x = Math.sin(idleT * 0.9) * 0.08; packG.position.y = Math.sin(idleT * 2) * 0.08; } };
  // the cards, stacked face down inside the pack
  const s0 = Math.min(1, view(0.6).w * 0.86 / CW, view(0.6).h * 0.7 / CH), sNear = Math.min(1, view(2.6).w * 0.9 / CW, view(2.6).h * 0.76 / CH);
  const cards = results.map((r, i) => { const m = cardMesh(r.card, r.entry, null); m.position.set(0, -0.3, -0.2 - i * 0.012); m.scale.setScalar(s0); m.rotation.y = Math.PI; m.visible = false; m.userData.r = r; R.scene.add(m); return m; });
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let busy = false, revealed = 0;
  const layout = () => { // where revealed cards end up: the grid that shows them biggest on this screen (a fan in one row)
    const n = cards.length, V = view(-0.5), aw = V.w * 0.94, ah = V.h * 0.74;
    let best = null;
    for (let cols = 1; cols <= n; cols++) { const rows = Math.ceil(n / cols), s = Math.min(0.72, aw / cols / (CW * 1.06), ah / rows / (CH * 1.06)); if (!best || s > best.s + 1e-6) best = { cols, rows, s }; }
    const { cols, rows, s } = best, gx = CW * s * 1.06, gy = CH * s * 1.06;
    return cards.map((_, i) => { const c = i % cols, r = Math.floor(i / cols), inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
      return { x: (c - (inRow - 1) / 2) * gx, y: -0.3 + ((rows - 1) / 2 - r) * gy, s, rz: rows === 1 ? (c - (cols - 1) / 2) * -0.04 : 0 }; });
  };
  const tear = async () => {
    state = 'tearing'; busy = true; hintEl.textContent = '';
    sfx('chest_open', 0.9);
    tween(0.5, (k) => { strip.position.x = k * 4; strip.position.y = 4.75 * 0.455 + k * 2.5; strip.rotation.z = -k * 1.2; strip.material.uniforms.foil.value = 0.55 * (1 - k); }, () => { strip.visible = false; });
    R.riftMat.uniforms.flash.value = 1.2; burst(new THREE.Vector3(0, 2, 0.5), pack.color, 140, 4);
    await wait(0.35);
    for (const c of cards) c.visible = true;
    // cards rise out of the pack, the pack falls away
    tween(0.8, (k) => { cards.forEach((c, i) => { c.position.y = -0.3 + k * 0.2; c.position.z = 0.6 - i * 0.012; }); packG.position.y = -k * 7; packG.rotation.z = k * 0.3; }, null, ease.inOut);
    await wait(0.85);
    R.scene.remove(packG);
    state = 'cards'; busy = false;
    hintEl.textContent = 'Tap to reveal';
  };
  const reveal = async (i, fast = false) => {
    const c = cards[i], r = c.userData.r, col = RARITIES[r.card.rarity].color, L = layout()[i];
    busy = !fast;
    sfx(r.card.rarity >= 4 ? 'portcullis_gate' : 'door_open', r.card.rarity >= 4 ? 0.8 : 0.45);
    if (!fast) {
      const sa = c.scale.x;
      tween(0.45, (k) => { c.position.z = 1.4 + k * 1.2; c.scale.setScalar(sa + (sNear - sa) * k); c.rotation.y = Math.PI * (1 - k); c.position.y = -0.1 + Math.sin(k * Math.PI) * 0.4; }, null, ease.inOut);
      await wait(0.45);
      nameEl.style.color = col; nameEl.textContent = `${r.card.name}${r.foil ? ' ✦ FOIL' : ''}${r.dup ? (r.card.type === 'hero' ? ' · duplicate: ascension ↑' : ' · another copy') : ' · NEW'}`; nameEl.style.opacity = 1;
      if (r.card.rarity >= 2) burst(new THREE.Vector3(c.position.x, c.position.y, c.position.z), col, 50 + r.card.rarity * 40, 2 + r.card.rarity);
      if (r.card.rarity >= 3) { pillar(c.position, col); R.riftMat.uniforms.flash.value = 0.6 + r.card.rarity * 0.25; R.riftMat.uniforms.tint.value.set(col); }
      if (r.card.rarity >= 4) { R.shake = 1.2; sfx('firebuff', 0.9); }
      await wait(r.card.rarity >= 4 ? 1.1 : 0.55);
      nameEl.style.opacity = 0;
    }
    const from = { x: c.position.x, y: c.position.y, z: c.position.z, s: c.scale.x, ry: c.rotation.y };
    tween(fast ? 0.35 : 0.5, (k) => { c.position.set(from.x + (L.x - from.x) * k, from.y + (L.y - from.y) * k, from.z + (-0.5 + i * 0.01 - from.z) * k); c.scale.setScalar(from.s + (L.s - from.s) * k); c.rotation.y = from.ry * (1 - k); c.rotation.z = L.rz * k; }, null, ease.inOut);
    revealed = i + 1; busy = false;
    if (revealed >= cards.length) finish();
  };
  const finish = () => {
    state = 'done'; hintEl.textContent = 'Drag a card to tilt it';
    const bar = hint.querySelector('.p3-ui');
    bar.innerHTML = '';
    if (opts.again) { const b = document.createElement('button'); b.className = 'btn blue'; b.textContent = opts.againLabel || 'Open another'; b.onclick = async () => { const res = await opts.again(); if (res) { closeOverlay(); resolveDone({ again: true }); } }; bar.appendChild(b); }
    const d = document.createElement('button'); d.className = 'btn green'; d.textContent = 'Done'; d.onclick = () => { closeOverlay(); resolveDone({}); }; bar.appendChild(d);
  };
  let resolveDone;
  const donePromise = new Promise((r) => { resolveDone = r; });
  hint.querySelector('[data-k=skip]').onclick = async () => {
    if (state === 'pack') await tear();
    while (state === 'cards' && revealed < cards.length) { await reveal(revealed, true); await wait(0.06); }
  };
  // tilt a revealed card under the pointer
  let hover = null;
  const pick = (e) => { mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, R.camera); return ray; };
  const onDown = async (e) => {
    if (e.target.closest('button')) return;
    if (busy) return;
    if (state === 'pack') { const hit = pick(e).intersectObject(packG, true); if (hit.length || true) await tear(); return; }
    if (state === 'cards') await reveal(revealed);
  };
  const onMove = (e) => {
    if (state !== 'done') return;
    const hits = pick(e).intersectObjects(cards, true), g = hits[0]?.object.parent;
    if (hover && hover !== g) { hover.rotation.x = 0; hover.rotation.y = 0; }
    hover = g || null;
    if (g) { const p = hits[0].uv; g.rotation.y = (p.x - 0.5) * 0.7; g.rotation.x = -(p.y - 0.5) * 0.7; }
  };
  R.renderer.domElement.addEventListener('pointerdown', onDown);
  R.renderer.domElement.addEventListener('pointermove', onMove);
  return donePromise;
}

/** Turn a single card in 3D: drag to rotate, it drifts back; the foil follows. */
export async function inspectCard(card, entry, stats) {
  await ensureThree();
  await document.fonts?.ready;
  await ensureCardArt(card).catch(() => {});
  setup();
  R.riftMat.uniforms.tint.value.set(RARITIES[card.rarity].color);
  const m = cardMesh(card, entry, stats);
  m.scale.setScalar(Math.min(1.25, view(0).w * 0.88 / CW, view(0).h * 0.72 / CH)); R.scene.add(m);
  ui(`<div class="p3-hint">${card.name}</div><div class="p3-ui"><button class="btn ghost" data-k="flip">Flip</button><button class="btn green" data-k="close">Close</button></div>`);
  let rx = 0, ry = 0, tx = 0, ty = 0, drag = null, flip = 0;
  R.onFrame = (dt) => { if (!drag) { ty += (Math.sin(R.t * 0.7) * 0.35 + flip - ty) * dt * 2; tx += (Math.sin(R.t * 0.5) * 0.12 - tx) * dt * 2; } rx += (tx - rx) * dt * 8; ry += (ty - ry) * dt * 8; m.rotation.set(rx, ry, 0); };
  const el = R.renderer.domElement;
  el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ty, tx }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; ty = drag.ty + (e.clientX - drag.x) * 0.012; tx = drag.tx + (e.clientY - drag.y) * 0.008; });
  el.addEventListener('pointerup', () => { drag = null; flip = Math.round(ty / Math.PI) * Math.PI; });
  return new Promise((res) => {
    R.host.querySelector('[data-k=flip]').onclick = () => { flip += Math.PI; sfx('door_open', 0.4); };
    R.host.querySelector('[data-k=close]').onclick = () => { closeOverlay(); res(); };
  });
}
export { CARD_W, CARD_H };
