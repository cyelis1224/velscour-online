// The battlefield on one screen (Fantasica's fixed view) in Velscour's isometric style: the map is a floating
// diorama of tile columns, heroes on their posts, the horde on the road, the rift tears and the Bastion Heart.
import { TAU, clamp, rgba, rand, makeCanvas, drawFiltered } from '../core/util.js';
import { isoX, isoY, HW, HH, HZ, TW, dressMap, loadTheme, THEMES } from '../art/terrain.js';
import { heroCanvas, ELEMENT_COL } from '../art/heroart.js';
import { monsterImage } from '../art/monsterart.js';
import { ART } from '../core/assets.js';
import { D } from '../state.js';
import * as FX from './fx.js';

// a stunned hero, greyed once per picture (a canvas filter every frame is a slow path, and missing in some browsers)
const grey = new WeakMap();
function stunned(img) {
  let c = grey.get(img);
  if (!c) { c = makeCanvas(img.width, img.height); drawFiltered(c.getContext('2d'), 'grayscale(0.7) brightness(0.8)', img, 0, 0); grey.set(img, c); }
  return c;
}

export class BattleView {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.zoom = 1; this.cx = 0; this.cy = 0; this.shakeA = 0; this.sx = 0; this.sy = 0;
    this.corpses = []; this.sel = null; this.hoverPost = null; this.deployPreview = null; this.settings = { get numbers() { return D.save?.settings.numbers !== false; } };
    this.bannerT = 0; this.heartFlash = 0; this.time = 0;
    this.margins = { top: 64, bottom: 120, left: 8, right: 8 };
    this.onBanner = null; this.onSkill = null;
  }
  async setup(b, themeId) {
    this.b = b; this.themeId = themeId; this.theme = THEMES[themeId];
    const tex = await loadTheme(themeId);
    this.dress = dressMap(b.map, themeId, tex);
    this.fit();
    FX.clearFx(); this.corpses.length = 0;
    this.sky = null;
  }
  fit() {
    const [x0, y0, x1, y1] = this.dress.bounds, portrait = D.H > D.W * 1.1;
    const m = this.margins = portrait ? { top: 92, bottom: 128, left: 4, right: 4 } : D.H < 500 ? { top: 38, bottom: 58, left: 6, right: 6 } : { top: 62, bottom: 118, left: 10, right: 10 };
    const W = D.W - m.left - m.right, H = D.H - m.top - m.bottom, fitW = W / (x1 - x0), fitH = H / (y1 - y0);
    // the whole field on one screen (Fantasica); upright phones show it a little larger than their width and pan
    this.baseZoom = (portrait ? Math.min(fitW * 1.65, fitH) : Math.min(fitW, fitH)) * 0.97;
    this.minZoom = Math.min(1, fitW * 0.97 / this.baseZoom);   // pinched all the way out, the whole field shows
    this.userZoom = Math.max(this.minZoom, this.userZoom ?? 1); this.panX ??= 0; this.panY ??= 0;
    this.mcx = (x0 + x1) / 2; this.mcy = (y0 + y1) / 2; this.mw = x1 - x0; this.mh = y1 - y0;
    this.ox = m.left + W / 2; this.oy = m.top + H / 2; this.vw = W; this.vh = H;
    this.applyView();
    this.sky = null;
  }
  /** Zoom (pinch, wheel) and pan (drag) on top of the fitted view; the field never leaves the screen. */
  applyView() {
    this.zoom = this.baseZoom * this.userZoom;
    const sx = Math.max(0, (this.mw * this.zoom - this.vw) / 2 / this.zoom + 40 / this.zoom), sy = Math.max(0, (this.mh * this.zoom - this.vh) / 2 / this.zoom + 40 / this.zoom);
    this.panX = clamp(this.panX, -sx, sx); this.panY = clamp(this.panY, -sy, sy);
    this.cx = this.mcx + this.panX; this.cy = this.mcy + this.panY;
  }
  zoomBy(f, sx = this.ox, sy = this.oy) {
    const wx = (sx - this.ox) / this.zoom + this.cx, wy = (sy - this.oy) / this.zoom + this.cy;   // keep the point under the fingers still
    this.userZoom = clamp(this.userZoom * f, this.minZoom, 3.2);
    this.zoom = this.baseZoom * this.userZoom;
    this.panX = wx - (sx - this.ox) / this.zoom - this.mcx; this.panY = wy - (sy - this.oy) / this.zoom - this.mcy;
    this.applyView();
  }
  panBy(dx, dy) { this.panX -= dx / this.zoom; this.panY -= dy / this.zoom; this.applyView(); }
  resetView() { this.userZoom = 1; this.panX = 0; this.panY = 0; this.applyView(); }
  // world <-> screen (CSS px)
  toScreen(x, y, z = 0) { return [(isoX(x, y) - this.cx) * this.zoom + this.ox, (isoY(x, y, z) - this.cy) * this.zoom + this.oy]; }
  postAt(sx, sy) {
    let best = null, bd = 30 * Math.max(0.7, this.zoom);
    for (const p of this.b.map.posts) { const [x, y] = this.toScreen(p.x + 0.5, p.y + 0.5, p.h); const d = Math.hypot(sx - x, (sy - y + 12 * this.zoom) * 0.8); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  unitAt(sx, sy) {
    for (const u of this.b.units) { const [x, y] = this.toScreen(u.x, u.y, u.z); if (Math.abs(sx - x) < 22 * this.zoom && sy < y + 8 * this.zoom && sy > y - 64 * this.zoom) return u; }
    return null;
  }
  shake(a) { this.shakeA = Math.max(this.shakeA, a); }
  heartHit() { this.heartFlash = 0.6; }
  banner(text, col) { this.onBanner?.(text, col); }
  skillName(u, id) { this.onSkill?.(u, id); }
  corpse(m) { const img = monsterImage(m.art, m.elite ? 'elite-corpse' : 'corpse'); if (img) this.corpses.push({ img, x: m.x, y: m.y, z: m.z, h: this.mH(m), face: m.face, t: 0, air: m.air }); if (this.corpses.length > 40) this.corpses.shift(); }
  mH(m) { return (ART.byId[m.art]?.h || 50) * (m.R.h || 1) * (m.boss ? 1.6 : m.lt ? 1.35 : m.elite ? 1.1 : 1) * (m.child ? 0.7 : 1) * 0.82; }

  update(dt) {
    this.time += dt;
    FX.handleEvents(this.b, this);
    FX.updateFx(dt);
    for (const u of this.b.units) if (u.leap) { u.leap.t += dt; if (u.leap.t >= u.leap.dur) u.leap = null; }
    for (let i = this.corpses.length - 1; i >= 0; i--) if ((this.corpses[i].t += dt) > 1.6) this.corpses.splice(i, 1);
    // trails behind the shots
    for (const s of this.b.shots) {
      if (s.t < 0 || s.x === undefined) continue;
      if (s.kind === 'fireball' && Math.random() < 0.9) FX.spawn({ x: s.x, y: s.y, z: s.z, vz: 0.3, life: 0.35, size: 4, size1: 1, color: '#ff8a30', add: true });
      if (s.kind === 'starfall' && Math.random() < 0.5) FX.spawn({ x: s.x, y: s.y, z: s.z, vz: 0, life: 0.3, size: 3, size1: 0, color: '#c8a8ff', add: true });
      if (s.kind === 'bonespear' && Math.random() < 0.5) FX.spawn({ x: s.x, y: s.y, z: s.z, life: 0.25, size: 3, size1: 0, color: '#a070ff', add: true });
      if (s.kind === 'note' && Math.random() < 0.25) FX.spawn({ x: s.x, y: s.y, z: s.z, vz: 0.6, life: 0.5, size: 2, size1: 0, color: '#ff8ab0', add: true });
    }
    for (const m of this.b.monsters) {
      if (m.burnT > 0 && Math.random() < 0.4) FX.spawn({ x: m.x + rand(-0.2, 0.2), y: m.y + rand(-0.2, 0.2), z: m.z + rand(0.3, 1.2), vz: 1.6, life: 0.4, size: 3, size1: 0.5, color: '#ff7a2a', add: true });
      if (m.poison.length && Math.random() < 0.25) FX.spawn({ x: m.x + rand(-0.2, 0.2), y: m.y + rand(-0.2, 0.2), z: m.z + rand(0.5, 1.4), vz: 0.8, life: 0.6, size: 2, size1: 3, color: '#8ae04a', add: true });
    }
    // ambient particles (the region's weather) and the rift tears' sparks
    const amb = this.theme.ambient, b = this.b;
    if (Math.random() < 0.5) {
      const x = rand(0, b.map.w), y = rand(0, b.map.h), z = b.map.H(x | 0, y | 0);
      const A = { firefly: ['#d8ff80', 0.5, 2.6], dust: ['#a89880', 0, 3], ember: ['#ff9040', 1.2, 2], snow: ['#ffffff', -1.4, 3.5], sand: ['#e8c890', 0, 2], spore: ['#a0ff90', 0.4, 3], riftmote: ['#6a90ff', 0.9, 2.5] }[amb];
      if (A) FX.spawn({ x, y, z: z + rand(0.5, 4), vx: amb === 'sand' ? 2.5 : rand(-0.3, 0.3), vy: amb === 'sand' ? -1 : rand(-0.3, 0.3), vz: A[1], life: A[2], size: amb === 'snow' ? 1.6 : 1.4, size1: 0.6, color: A[0], add: amb !== 'snow' && amb !== 'sand' && amb !== 'dust' });
    }
    for (const [sx, sy] of b.map.spawns) if (Math.random() < 0.6) FX.spawn({ x: sx + 0.5 + rand(-0.3, 0.3), y: sy + 0.5 + rand(-0.3, 0.3), z: b.map.H(sx, sy) + rand(0.2, 2.2), vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), vz: rand(-0.2, 0.6), life: rand(0.6, 1.2), size: rand(1.5, 3), size1: 0, color: Math.random() < 0.5 ? '#3a6cff' : '#9ab8ff', add: true });
    if (this.shakeA > 0) { this.shakeA = Math.max(0, this.shakeA - dt * 30); this.sx = rand(-1, 1) * this.shakeA; this.sy = rand(-1, 1) * this.shakeA; } else this.sx = this.sy = 0;
    if (this.heartFlash > 0) this.heartFlash -= dt;
  }

  draw() {
    const { ctx, b } = this, dpr = D.dpr, t = this.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSky(ctx);
    ctx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, dpr * (this.ox - this.cx * this.zoom + this.sx), dpr * (this.oy - this.cy * this.zoom + this.sy));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    const cols = this.dress.cols;
    for (const c of cols) ctx.drawImage(c.img, isoX(c.x + 0.5, c.y + 0.5) + c.ox, isoY(c.x + 0.5, c.y + 0.5, c.h) + c.oy);
    // water shimmer and the posts' daises
    for (const c of cols) if (c.water) { const [x, y] = [isoX(c.x + 0.5, c.y + 0.5), isoY(c.x + 0.5, c.y + 0.5, c.h)]; ctx.strokeStyle = 'rgba(200,240,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); const o = Math.sin(t * 2 + c.x + c.y * 1.3) * 6; ctx.moveTo(x - 14 + o, y - 2); ctx.lineTo(x - 2 + o, y - 2); ctx.stroke(); }
    for (const p of b.map.posts) this.drawPost(ctx, p, t);
    // the depth pass: sprites in front-to-back order with raised columns cutting in front of what stands behind them
    const list = [];
    for (const c of cols) if (c.occl) list.push([c.key, 0, c]);
    for (const pr of this.dress.props) list.push([pr.x + pr.y, 1, pr]);
    for (const co of this.corpses) list.push([co.x + co.y - 0.2, 2, co]);
    for (const m of b.monsters) list.push([m.x + m.y + (m.air ? 0.3 : 0), 3, m]);
    for (const s of b.summons) list.push([s.x + s.y, 4, s]);
    for (const u of b.units) list.push([u.x + u.y + 0.05, 5, u]);
    for (const sp of b.map.spawns) list.push([sp[0] + sp[1] + 1, 6, sp]);
    list.push([b.map.heart[0] + b.map.heart[1] + 1, 7, b.map.heart]);
    list.sort((a, c) => a[0] - c[0]);
    for (const [, k, o] of list) {
      if (k === 0) ctx.drawImage(o.img, isoX(o.x + 0.5, o.y + 0.5) + o.ox, isoY(o.x + 0.5, o.y + 0.5, o.h) + o.oy);
      else if (k === 1) this.drawProp(ctx, o);
      else if (k === 2) this.drawCorpse(ctx, o);
      else if (k === 3) this.drawMonster(ctx, o, t);
      else if (k === 4) this.drawSummon(ctx, o, t);
      else if (k === 5) this.drawUnit(ctx, o, t);
      else if (k === 6) this.drawRift(ctx, o, t);
      else this.drawHeart(ctx, o, t);
    }
    FX.drawOverlays(ctx, b, t);
    FX.drawShots(ctx, b, t);
    FX.drawParticles(ctx);
    // bars over everything
    for (const m of b.monsters) this.drawBar(ctx, m);
    if (this.sel) this.drawRange(ctx, this.sel.post, this.sel.def, '#9ad0ff');
    if (this.deployPreview) this.drawRange(ctx, this.deployPreview.post, this.deployPreview.def, '#ffd060');
    FX.drawTexts(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of FX.flashes) if (f.kind === 'flash') { ctx.globalAlpha = 0.35 * (1 - f.t / f.dur); ctx.fillStyle = f.col; ctx.fillRect(0, 0, D.W, D.H); }
    if (this.heartFlash > 0) { ctx.globalAlpha = this.heartFlash * 0.5; const g = ctx.createRadialGradient(D.W / 2, D.H / 2, D.H * 0.3, D.W / 2, D.H / 2, D.H); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(255,0,0,0.9)'); ctx.fillStyle = g; ctx.fillRect(0, 0, D.W, D.H); }
    ctx.globalAlpha = 1;
  }
  drawSky(ctx) {
    if (!this.sky || this.sky.w !== D.W || this.sky.h !== D.H) {
      const c = makeCanvas(D.W * D.dpr, D.H * D.dpr), x = c.getContext('2d'), [a, bcol] = this.theme.sky;
      x.scale(D.dpr, D.dpr);
      const g = x.createRadialGradient(D.W / 2, D.H * 0.45, 30, D.W / 2, D.H * 0.5, Math.max(D.W, D.H) * 0.75);
      g.addColorStop(0, a); g.addColorStop(1, bcol); x.fillStyle = g; x.fillRect(0, 0, D.W, D.H);
      for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(200,210,255,${Math.random() * 0.35})`; x.fillRect(Math.random() * D.W, Math.random() * D.H, 1, 1); }
      this.sky = { c, w: D.W, h: D.H };
    }
    ctx.drawImage(this.sky.c, 0, 0, D.W, D.H);
  }
  drawPost(ctx, p, t) {
    const x = isoX(p.x + 0.5, p.y + 0.5), y = isoY(p.x + 0.5, p.y + 0.5, p.h), free = this.b.postFree(p.id);
    ctx.fillStyle = 'rgba(10,14,24,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, 25, 12.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = p.raised ? 'rgba(255,214,120,0.75)' : 'rgba(170,200,255,0.65)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, y, 22, 11, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, 15, 7.5, 0, t * 0.6, t * 0.6 + 4.6); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = t * 0.6 + i * Math.PI / 2; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x + Math.cos(a) * 22 - 1.5, y + Math.sin(a) * 11 - 1.5, 3, 3); }
    if (free && this.highlight) { // deploy mode: free posts pulse
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + Math.sin(t * 6) * 0.25;
      ctx.drawImage(FX.glow(this.highlight === p ? '#ffe080' : '#6aa8ff'), x - 30, y - 22, 60, 36);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  drawProp(ctx, pr) {
    const s = pr.src, x = isoX(pr.x, pr.y), y = isoY(pr.x, pr.y, pr.z), k = pr.k;
    ctx.save(); ctx.translate(x, y); if (pr.flip) ctx.scale(-1, 1);
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, s.ox * k, s.oy * k, s.w * k, s.h * k);
    ctx.restore();
  }
  drawCorpse(ctx, c) {
    const x = isoX(c.x, c.y), y = isoY(c.x, c.y, c.z), h = c.h, w = h * c.img.width / c.img.height, k = Math.min(1, c.t / 0.25);
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, c.t - 0.8) / 0.8) * 0.85;
    ctx.translate(x, y - 2); ctx.scale(c.face < 0 ? -1 : 1, 1); ctx.rotate(-Math.PI / 2 * 0.85 * k); ctx.scale(1, 1 - 0.38 * k);
    ctx.drawImage(c.img, -w / 2, -h, w, h);   // (darkened when it was cut: monsterImage's corpse looks)
    ctx.restore();
  }
  drawMonster(ctx, m, t) {
    const img = monsterImage(m.art, m.hitT > 0 ? 'flash' : m.elite ? 'elite' : 'base');
    const fly = m.air ? 1.3 + Math.sin(m.anim * 4) * 0.15 : 0;
    const x = isoX(m.x, m.y), gy = isoY(m.x, m.y, m.z), y = gy - fly * HZ, h = this.mH(m);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, gy, h * 0.24, h * 0.09, 0, 0, TAU); ctx.fill();
    if (!img) { ctx.fillStyle = '#802020'; ctx.fillRect(x - 6, y - h * 0.6, 12, h * 0.6); return; }
    const w = h * img.width / img.height, walking = !m.stun && !m.held;
    const bob = walking ? Math.abs(Math.sin(m.anim * 9)) * 2 : 0, sq = walking ? 1 + Math.sin(m.anim * 18) * 0.03 : 1;
    ctx.save(); ctx.translate(x, y - bob); ctx.scale(m.face < 0 ? -1 : 1, 1);
    if (m.boss || m.lt || m.elite) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.2; ctx.drawImage(FX.glow(m.boss ? '#ff2020' : m.lt ? '#ff8020' : '#c02040'), -w * 0.7, -h * 1.1, w * 1.4, h * 1.25); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(img, -w * img.fx, -h * sq, w, h * sq);
    if (m.slowT > 0 && m.slow > 0.05) { ctx.globalCompositeOperation = 'source-atop'; }
    ctx.restore();
    if (m.slowT > 0 && m.slow > 0.05) { ctx.globalAlpha = 0.35; ctx.drawImage(FX.glow('#7ad8ff'), x - w * 0.5, y - h, w, h); ctx.globalAlpha = 1; }
    if (m.stun > 0) this.stars(ctx, x, y - h - 6, t);
  }
  drawBar(ctx, m) {
    if (m.hp >= m.maxHp && !m.boss && !m.lt) return;
    const h = this.mH(m), x = isoX(m.x, m.y), y = isoY(m.x, m.y, m.z) - h - (m.air ? 22 : 6), w = m.boss ? 60 : m.lt ? 44 : 26, f = clamp(m.hp / m.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, m.boss ? 6 : 4);
    ctx.fillStyle = m.boss ? '#ff3020' : m.lt ? '#ff8a20' : m.elite ? '#ff5060' : '#e04030'; ctx.fillRect(x - w / 2, y, w * f, m.boss ? 4 : 2);
  }
  drawSummon(ctx, s, t) {
    const art = this.b.waves[0]?.groups[0]?.art, img = art && monsterImage(art, 'ghost');
    const x = isoX(s.x, s.y), y = isoY(s.x, s.y, s.z), h = 40;
    ctx.globalAlpha = Math.min(1, s.t * 2);
    if (img) { const w = h * img.width / img.height; ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(img, -w * img.fx, -h, w, h); ctx.restore(); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 12, y - h - 6, 24, 3); ctx.fillStyle = '#80ff9a'; ctx.fillRect(x - 12, y - h - 6, 24 * clamp(s.hp / s.maxHp, 0, 1), 3);
    ctx.globalAlpha = 1;
  }
  drawUnit(ctx, u, t) {
    const img = heroCanvas(u.def.look, 2);
    let x = isoX(u.x, u.y), y = isoY(u.x, u.y, u.z), lift = 0;
    if (u.leap) { // the Dragoon's leap: up, over to the foe, back to the post
      const k = u.leap.t / u.leap.dur, f = k < 0.5 ? k * 2 : 2 - k * 2, tx = isoX(u.leap.x, u.leap.y), ty = isoY(u.leap.x, u.leap.y, u.z);
      x += (tx - x) * f; y += (ty - y) * f; lift = Math.sin(f * Math.PI / 2) * (u.leap.big ? 90 : 46) * (1 - f * 0.3);
      if (Math.random() < 0.7) FX.spawn({ x: u.x + (u.leap.x - u.x) * f, y: u.y + (u.leap.y - u.y) * f, z: u.z + lift / HZ + 1, life: 0.3, size: 3, size1: 0, color: '#9ad0ff', add: true });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, 14, 6, 0, 0, TAU); ctx.fill();
    const el = ELEMENT_COL[u.def.kit.el] || '#fff';
    if (u.lvl > 1 || u.cast > 0 || u.buffs.length) { // empowered heroes glow brighter
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.85, 0.12 * u.lvl + (u.cast > 0 ? 0.6 : 0) + (u.buffs.length ? 0.2 : 0));
      ctx.drawImage(FX.glow(u.cast > 0 ? '#ffffff' : u.buffs.some((b) => b.song) ? '#ff8ab0' : el), x - 30, y - 74 - lift, 60, 86); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (!img) return;
    const s = 56 / (img.feet - img.headTop), w = img.width * s, h = img.height * s;
    const atk = u.anim < 0.16 ? Math.sin(u.anim / 0.16 * Math.PI) : 0, breathe = Math.sin(t * 2.4 + u.id) * 0.012;
    ctx.save(); ctx.translate(x + atk * 4 * u.face, y - lift); ctx.scale(u.face < 0 ? -1 : 1, 1); ctx.scale(1 - breathe, 1 + breathe);
    ctx.drawImage(u.stun > 0 ? stunned(img) : img, -w / 2, -img.feet * s, w, h);
    ctx.restore();
    // empower pips, the skill charge ring and stars when stunned
    for (let i = 1; i < u.lvl; i++) { ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.arc(x - (u.lvl - 2) * 4 + (i - 1) * 8, y + 7, 2.4, 0, TAU); ctx.fill(); }
    const ch = clamp(u.charge / u.def.skill.charge, 0, 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 15, y - 60 - lift, 5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = ch >= 1 ? '#ffffff' : el; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 15, y - 60 - lift, 5, -Math.PI / 2, -Math.PI / 2 + ch * TAU); ctx.stroke();
    if (u.stun > 0) this.stars(ctx, x, y - 64, t);
    if (u.def.ally) { ctx.fillStyle = '#ffd060'; ctx.font = 'bold 9px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ALLY', x, y + 18); }
  }
  stars(ctx, x, y, t) { for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 9, y + Math.sin(a) * 3, 2, 0, TAU); ctx.fill(); } }
  drawRift(ctx, sp, t) {
    const z = this.b.map.H(sp[0], sp[1]), x = isoX(sp[0] + 0.5, sp[1] + 0.5), y = isoY(sp[0] + 0.5, sp[1] + 0.5, z) - 30;
    ctx.save(); ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(FX.glow('#2a4cff'), -40, -50, 80, 100); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#04040c'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 29, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { ctx.strokeStyle = i % 2 ? 'rgba(80,120,255,0.8)' : 'rgba(170,200,255,0.7)'; ctx.lineWidth = 2 - i * 0.25; ctx.beginPath(); ctx.ellipse(0, 0, 15 - i * 2.2, 31 - i * 4.5, 0, t * (2 + i * 0.7), t * (2 + i * 0.7) + 4); ctx.stroke(); }
    ctx.restore();
  }
  drawHeart(ctx, hp, t) {
    const b = this.b, z = b.map.H(hp[0], hp[1]), x = isoX(hp[0] + 0.5, hp[1] + 0.5), y = isoY(hp[0] + 0.5, hp[1] + 0.5, z);
    const f = b.heart / b.heartMax, col = f > 0.5 ? '#6ab8ff' : f > 0.25 ? '#ffb040' : '#ff3030', bob = Math.sin(t * 2) * 3;
    // a stone plinth
    ctx.fillStyle = '#3a3a44'; ctx.beginPath(); ctx.moveTo(x - 18, y - 4); ctx.lineTo(x, y + 5); ctx.lineTo(x + 18, y - 4); ctx.lineTo(x + 18, y - 14); ctx.lineTo(x, y - 5); ctx.lineTo(x - 18, y - 14); ctx.fill();
    ctx.fillStyle = '#5a5a66'; ctx.beginPath(); ctx.moveTo(x - 18, y - 14); ctx.lineTo(x, y - 23); ctx.lineTo(x + 18, y - 14); ctx.lineTo(x, y - 5); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7 + Math.sin(t * 3) * 0.2; ctx.drawImage(FX.glow(col), x - 40, y - 96 + bob, 80, 90); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const cy = y - 52 + bob;
    const g = ctx.createLinearGradient(x - 12, cy - 26, x + 12, cy + 26); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, col); g.addColorStop(1, '#101830');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, cy - 28); ctx.lineTo(x + 13, cy); ctx.lineTo(x, cy + 24); ctx.lineTo(x - 13, cy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, cy - 28); ctx.lineTo(x, cy + 24); ctx.moveTo(x - 13, cy); ctx.lineTo(x + 13, cy); ctx.stroke();
    // cracks as it takes damage
    ctx.strokeStyle = 'rgba(20,0,0,0.85)'; ctx.lineWidth = 1.2;
    const cracks = Math.floor((1 - f) * 7);
    for (let i = 0; i < cracks; i++) { const a = i * 2.4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 3, cy + Math.sin(a) * 5); ctx.lineTo(x + Math.cos(a) * 9, cy + Math.sin(a) * 15); ctx.lineTo(x + Math.cos(a + 0.4) * 11, cy + Math.sin(a + 0.4) * 19); ctx.stroke(); }
  }
  drawRange(ctx, p, d, col) {
    const x = isoX(p.x + 0.5, p.y + 0.5), y = isoY(p.x + 0.5, p.y + 0.5, p.h), r = d.range + (this.sel && this.sel.def === d ? 0.1 * (this.sel.lvl - 1) : 0);
    ctx.fillStyle = rgba(col, 0.1); ctx.strokeStyle = rgba(col, 0.75); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, r * HW * 1.414, r * HH * 1.414, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
}
export { TW };
