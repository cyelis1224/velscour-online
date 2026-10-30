// Small helpers for VELSCOUR DEFENSE (its own copy: nothing here is shared with the main game's src/).
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

/** FNV-1a: a stable 32-bit hash of a string. */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** mulberry32, seeded: the battle sim and the map generator use it so a stage plays the same every time. */
export class RNG {
  constructor(seed = 1) { this.s = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0; }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  /** [[value, weight], ...] */
  weighted(list) {
    let t = 0; for (const [, w] of list) t += w;
    let r = this.next() * t;
    for (const [v, w] of list) if ((r -= w) <= 0) return v;
    return list[list.length - 1][0];
  }
}

export function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
  return String(n);
}

export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
export function shade(h, f) {
  const [r, g, b] = hexToRgb(h), t = f < 0 ? 0 : 255, p = Math.abs(f);
  const c = (v) => Math.round((t - v) * p + v);
  return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + ((1 << 24) | (Math.round(lerp(A[0], B[0], t)) << 16) | (Math.round(lerp(A[1], B[1], t)) << 8) | Math.round(lerp(A[2], B[2], t))).toString(16).slice(1);
}

export function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function timeLeft(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

// ------------------------------------------------------------------ canvas colour filters everywhere
// ctx.filter is missing from some browsers (WebKit long left it out, and has drawn offscreen canvases unfiltered), so
// baked looks (tints, darkened corpses) would come out plain there. filterOK() tests it once on a pixel; where it
// fails, drawFiltered() draws plainly, then puts the colour filters (brightness, contrast, saturate, grayscale, sepia,
// hue-rotate, invert; others are skipped) through the pixels by the CSS spec's matrices.
let FOK;
export function filterOK() {
  if (FOK !== undefined) return FOK;
  if (globalThis.VELSCOUR_NO_CANVAS_FILTER) return (FOK = false);   // tests: the by-hand path in a browser that has filters
  try {
    const a = makeCanvas(1, 1), b = makeCanvas(1, 1), x = b.getContext('2d', { willReadFrequently: true });
    a.getContext('2d').fillStyle = '#fff'; a.getContext('2d').fillRect(0, 0, 1, 1);
    x.filter = 'brightness(0)'; x.drawImage(a, 0, 0); x.filter = 'none';
    FOK = x.getImageData(0, 0, 1, 1).data[0] < 128;
  } catch (e) { FOK = false; }
  return FOK;
}
const LUM = [0.2126, 0.7152, 0.0722];
function filterOps(f) {
  const ops = [];
  for (const [, fn, arg] of String(f).matchAll(/([a-z-]+)\(([^)]*)\)/g)) {
    let v = parseFloat(arg); if (/%/.test(arg)) v /= 100;
    if (fn === 'hue-rotate') { v = /rad/.test(arg) ? v : /turn/.test(arg) ? v * 2 * Math.PI : v * Math.PI / 180; const c = Math.cos(v), s = Math.sin(v); ops.push([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]); }
    else if (fn === 'saturate') ops.push([0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v]);
    else if (fn === 'grayscale') { const k = 1 - Math.min(1, v); ops.push([LUM[0] + (1 - LUM[0]) * k, LUM[1] - LUM[1] * k, LUM[2] - LUM[2] * k, LUM[0] - LUM[0] * k, LUM[1] + (1 - LUM[1]) * k, LUM[2] - LUM[2] * k, LUM[0] - LUM[0] * k, LUM[1] - LUM[1] * k, LUM[2] + (1 - LUM[2]) * k]); }
    else if (fn === 'sepia') { const k = 1 - Math.min(1, v); ops.push([0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k]); }
    else if (fn === 'brightness') ops.push([v, 0, 0, 0, v, 0, 0, 0, v]);
    else if (fn === 'contrast') ops.push([v, 0, 0, 0, v, 0, 0, 0, v, 0.5 - 0.5 * v]);
    else if (fn === 'invert') { const k = Math.min(1, v); ops.push([1 - 2 * k, 0, 0, 0, 1 - 2 * k, 0, 0, 0, 1 - 2 * k, k]); }
  }
  return ops;
}
/** Run filter f's colour functions through the pixels of (x, y, w, h) on ctx (the fallback for ctx.filter). */
export function filterPixels(ctx, f, x = 0, y = 0, w = ctx.canvas.width, h = ctx.canvas.height) {
  const ops = filterOps(f);
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
  w = Math.min(ctx.canvas.width - x, Math.ceil(w) + 1); h = Math.min(ctx.canvas.height - y, Math.ceil(h) + 1);
  if (!ops.length || w <= 0 || h <= 0) return;
  const id = ctx.getImageData(x, y, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    for (const m of ops) {
      const o = m[9] || 0, nr = r * m[0] + g * m[1] + b * m[2] + o, ng = r * m[3] + g * m[4] + b * m[5] + o, nb = r * m[6] + g * m[7] + b * m[8] + o;
      r = nr < 0 ? 0 : nr > 1 ? 1 : nr; g = ng < 0 ? 0 : ng > 1 ? 1 : ng; b = nb < 0 ? 0 : nb > 1 ? 1 : nb;
    }
    d[i] = r * 255 + 0.5; d[i + 1] = g * 255 + 0.5; d[i + 2] = b * 255 + 0.5;
  }
  ctx.putImageData(id, x, y);
}
/** ctx.drawImage(img, ...args) through filter f: the canvas filter where it works, else filterPixels on the drawn box. */
export function drawFiltered(ctx, f, img, ...args) {
  if (filterOK()) { ctx.filter = f; ctx.drawImage(img, ...args); ctx.filter = 'none'; return; }
  ctx.drawImage(img, ...args);
  const [dx, dy, dw, dh] = args.length >= 8 ? args.slice(4) : [args[0], args[1], args[2] ?? img.width, args[3] ?? img.height];
  const t = ctx.getTransform(), x0 = t.a * dx + t.e, y0 = t.d * dy + t.f, x1 = t.a * (dx + dw) + t.e, y1 = t.d * (dy + dh) + t.f;   // (scale and shift only)
  filterPixels(ctx, f, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
}
