// Effects on held weapons and off-hands, gems in their sockets, and rarity sparkles on body armor and helmets. By the
// weapon's rarity: gem dots only (Common, Uncommon), a twinkle (Rare), a pulsing core and rising motes (Epic), the
// element's own effect (Legendary: embers and flames, frost, crackling lightning, drips, shadow wisps, holy rays, orbiting
// arcana) and at Mythic motes orbiting the head with trails and a crackle along the surface. Stateless: every particle is
// a function of the time and a seed, so nothing is stepped per frame and the review sheets draw the same thing. Points
// are art px of the hero frame (128x192); map(x, y) turns them into canvas px, s is canvas px per art px and opts.size
// scales the particles (small views want them bigger than the art). Kept small and translucent: the hero comes first.
const COL = {
  holy: [255, 216, 96], fire: [255, 106, 32], cold: [122, 208, 255], light: [170, 190, 255], poison: [138, 255, 80],
  shadow: [160, 112, 255], arcane: [74, 168, 255], acid: [80, 255, 144], blood: [255, 48, 64], astral: [200, 210, 255], phys: [255, 216, 160],
};
export const fxColor = (e) => COL[e] || COL.arcane;
const lighten = (c, k) => [c[0] + (255 - c[0]) * k | 0, c[1] + (255 - c[1]) * k | 0, c[2] + (255 - c[2]) * k | 0];
/** A stable pseudo-random number in [0, 1) for integers a, b. */
const hr = (a, b = 0) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const lerp = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];

const sprites = new Map();
/** A soft round glow in colour c (a pale core fading out), 32 px, cached. */
function glowSprite(c) {
  const key = c.join(',');
  let s = sprites.get(key);
  if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 32;
  const x = s.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16), p = lighten(c, 0.55);
  g.addColorStop(0, `rgba(${p},1)`); g.addColorStop(0.3, `rgba(${c},0.75)`); g.addColorStop(1, `rgba(${c},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  if (sprites.size > 96) sprites.delete(sprites.keys().next().value);
  sprites.set(key, s);
  return s;
}
function dot(ctx, x, y, r, c, a) {
  if (a <= 0.02 || r <= 0.05) return;
  ctx.globalAlpha = Math.min(1, a); ctx.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2);
}
function star(ctx, x, y, r, c, a) {
  if (a <= 0.02) return;
  ctx.globalAlpha = Math.min(1, a) * 0.8; ctx.strokeStyle = `rgb(${lighten(c, 0.6)})`; ctx.lineWidth = Math.max(0.5, r * 0.16);
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  dot(ctx, x, y, r * 0.55, c, a);
}

/**
 * One held piece's effects. h: { rarity, element, gems: [[r, g, b]], pts: { head: [x, y, r], tip: [x, y] | null,
 * line: [[x, y], [x, y]] | null, orbit: [x, y, r] | null, slots: [[x, y]] } } in art px; t seconds. opts: fx false =
 * the gems only, steady; seed varies hero to hero; size scales the particles; quality <1 thins them out.
 */
export function drawHeldFx(ctx, h, t, map, s, opts = {}) {
  if (!h || !h.pts) return;
  const P = h.pts, c = fxColor(h.element), R = h.rarity | 0, sd = (opts.seed | 0) + 7, q = opts.quality ?? 1, z = s * (opts.size ?? 1);
  const M = (p) => map(p[0], p[1]);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // gems: a glowing dot per socketed gem, round the design's socket points
  const fx = opts.fx !== false;
  (h.gems || []).forEach((gc, i) => {
    const sp = P.slots[i % P.slots.length]; if (!sp) return;
    const [x, y] = M(sp), pulse = fx ? 0.78 + 0.22 * Math.sin(t * 3 + i * 1.7) : 0.85;
    dot(ctx, x, y, z * 2, gc, 0.5 * pulse); dot(ctx, x, y, z * 0.8, lighten(gc, 0.4), 0.85 * pulse);
  });
  if (!fx || R < 2) { ctx.restore(); return; }
  const head = P.head, [hx, hy] = M(head), hrad = Math.min(7, Math.max(2, head[2] || 4));
  const line = P.line || [[head[0], head[1] + hrad], P.tip || [head[0], head[1] - hrad]];
  // Rare+: a twinkle now and then on the tip or along the piece
  for (let i = 0; i < (R >= 4 ? 2 : 1); i++) {
    const per = 2.6 + i, k = (t + hr(sd, i) * per) / per, u = k % 1;
    if (u < 0.16) { const p = hr(sd + Math.floor(k), i) < 0.5 ? (P.tip || head) : lerp(line[0], line[1], hr(sd + Math.floor(k), i + 9)); const [x, y] = M(p); star(ctx, x, y, z * (1.5 + R * 0.2) * Math.sin(u / 0.16 * Math.PI), c, 0.8); }
  }
  if (R < 3) { ctx.restore(); return; }
  // Epic+: a soft pulse round the head and motes rising off the piece
  dot(ctx, hx, hy, s * hrad * (1 + 0.1 * Math.sin(t * 2.4)), c, (R >= 5 ? 0.22 : 0.15) * q);
  const motes = Math.round((R >= 5 ? 8 : R >= 4 ? 6 : 4) * q);
  for (let i = 0; i < motes; i++) {
    const life = 1.4 + hr(sd, i) * 0.8, k = t / life + hr(sd, i + 40), u = k % 1, cyc = Math.floor(k);
    const [x, y] = M(lerp(line[0], line[1], hr(cyc, i + sd)));
    dot(ctx, x + Math.sin(u * 6 + i) * z * 1.2, y - u * z * 9, z * (0.8 + R * 0.1), c, (1 - u) * 0.6);
  }
  if (R < 4) { ctx.restore(); return; }
  // Legendary+: the element's own effect
  const E = h.element, n = Math.round((R >= 5 ? 9 : 6) * q);
  if (E === 'fire' || E === 'blood') for (let i = 0; i < n; i++) { // embers and little flames climbing off the edge
    const life = 0.7 + hr(sd, i + 3) * 0.5, k = t / life + hr(sd, i + 60), u = k % 1, [x, y] = M(lerp(line[0], line[1], hr(Math.floor(k), i + 7)));
    const fc = E === 'fire' && u < 0.35 ? [255, 210, 110] : c;
    dot(ctx, x + Math.sin(t * 7 + i) * z * 0.8, y - u * z * (E === 'fire' ? 8 : -5), z * (1.5 - u), fc, (1 - u) * 0.7);
  }
  if (E === 'cold' || E === 'astral') for (let i = 0; i < n; i++) { // frost motes drifting down, glinting
    const life = 1.6 + hr(sd, i) * 0.8, k = t / life + hr(sd, i + 80), u = k % 1, [x, y] = M(lerp(line[0], line[1], hr(Math.floor(k), i + 5)));
    star(ctx, x + Math.sin(u * 5 + i) * z * 2.2, y + u * z * 6, z * 0.9 * (1 - u * 0.5), c, (1 - u) * 0.7);
  }
  if (E === 'poison' || E === 'acid') for (let i = 0; i < Math.ceil(n / 2); i++) { // drips off the head, bubbles rising
    const life = 1.1 + hr(sd, i) * 0.5, k = t / life + hr(sd, i + 20), u = k % 1, [x, y] = M([head[0] + (hr(Math.floor(k), i) - 0.5) * hrad, head[1] + hrad * 0.5]);
    dot(ctx, x, y + u * u * z * 11, z * 1.1, c, (1 - u) * 0.7);
    const [bx, by] = M(lerp(line[0], line[1], hr(Math.floor(k), i + 3))); dot(ctx, bx + Math.sin(u * 8) * z, by - u * z * 6, z * 0.8 * (1 + u), lighten(c, 0.3), (1 - u) * 0.45);
  }
  if (E === 'shadow') for (let i = 0; i < n; i++) { // dark wisps curling up
    const life = 1.6 + hr(sd, i) * 0.6, k = t / life + hr(sd, i + 30), u = k % 1, [x, y] = M(lerp(line[0], line[1], hr(Math.floor(k), i + 1)));
    dot(ctx, x + Math.sin(u * 4 + i) * z * 3, y - u * z * 8, z * (1.4 + u * 1.5), c, (1 - u) * 0.4);
  }
  if (E === 'holy') { // slow rays from the head
    ctx.globalAlpha = 0.3; ctx.strokeStyle = `rgb(${c})`; ctx.lineWidth = z * 0.8;
    for (let i = 0; i < 4; i++) { const a = t * 0.6 + i * Math.PI / 2, L = s * hrad * (1.5 + 0.3 * Math.sin(t * 2 + i)); ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * L * 0.3, hy + Math.sin(a) * L * 0.3); ctx.lineTo(hx + Math.cos(a) * L, hy + Math.sin(a) * L); ctx.stroke(); }
  }
  if (E === 'arcane') for (let i = 0; i < 4; i++) { const a = t * 2.2 + i * Math.PI / 2, rr = s * hrad * 0.9; dot(ctx, hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.5, z * 1.1, c, 0.7); }
  if (E === 'light' || R >= 5) { // lightning crackling along the piece, flickering
    const fr = Math.floor(t * 14);
    if (hr(fr, sd) < (E === 'light' ? 0.6 : 0.25)) {
      const a = M(line[0]), b = M(line[1]), seg = 7;
      ctx.globalAlpha = 0.8; ctx.strokeStyle = `rgb(${lighten(c, 0.45)})`; ctx.lineWidth = Math.max(0.6, z * 0.4); ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      for (let i = 1; i < seg; i++) { const u = i / seg; ctx.lineTo(a[0] + (b[0] - a[0]) * u + (hr(fr, i + sd) - 0.5) * z * 4, a[1] + (b[1] - a[1]) * u + (hr(fr + 99, i) - 0.5) * z * 4); }
      ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
  // Mythic: motes orbiting the head (or its orbit) with short trails
  if (R >= 5) {
    const o = P.orbit || head, [ox, oy] = M(o), rr = s * Math.min(9, o[2] || hrad) * 1.1;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
      const a = t * 2.6 + i * Math.PI * 2 / 3 - j * 0.16;
      dot(ctx, ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * 0.45, z * (1 - j * 0.18), j ? c : lighten(c, 0.4), 0.55 - j * 0.12);
    }
  }
  ctx.restore();
}

/**
 * Rarity sparkles on body armor and the helmet, faint so the hero stays clear: Rare a rare glint, Epic a few, Legendary
 * also motes drifting up off the piece, Mythic more and a slow shimmer. pts: { body: [[x, y]], head: [[x, y]] } (opaque
 * pixels of each, art px); gear: { body: { rarity, col }, head: { rarity, col } } (col [r, g, b]).
 */
export function drawGearSparkle(ctx, pts, gear, t, map, s, opts = {}) {
  if (!pts) return;
  const z = s * (opts.size ?? 1), sd = (opts.seed | 0) + 3;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const part of ['body', 'head']) {
    const g = gear[part], P = pts[part];
    if (!g || g.rarity < 2 || !P?.length) continue;
    const R = g.rarity, c = g.col, n = [0, 0, 1, 2, 3, 4][R] * (part === 'head' ? 1 : 2);
    for (let i = 0; i < n; i++) { // glints popping on and off at random points of the piece
      const per = 2.2 + hr(sd, i + 11) * 1.6, k = t / per + hr(sd, i + part.length * 17), u = k % 1;
      if (u > 0.22) continue;
      const [x, y] = map(...P[Math.floor(hr(Math.floor(k), i + sd) * P.length)]);
      star(ctx, x, y, z * (1.1 + R * 0.15) * Math.sin(u / 0.22 * Math.PI), c, 0.55);
    }
    if (R >= 4) for (let i = 0; i < (R >= 5 ? 5 : 3) * (part === 'head' ? 1 : 2); i++) { // motes drifting up off it
      const life = 2 + hr(sd, i + 5) * 1.2, k = t / life + hr(sd, i + 50 + part.length), u = k % 1;
      const [x, y] = map(...P[Math.floor(hr(Math.floor(k), i + 77) * P.length)]);
      dot(ctx, x + Math.sin(u * 5 + i) * z * 1.5, y - u * z * 10, z * 0.75, c, (1 - u) * (u < 0.15 ? u / 0.15 : 1) * 0.45);
    }
  }
  ctx.restore();
}
