// Battle auto-play: deploys heroes where they cover the most road (every road held, the short ones first), empowers the ones doing the work, buys the
// Bastion works, and calls waves early when the field is clear. Plays through the same orders the player has.
import { dist } from '../core/util.js';

/** How much of each road (weighted toward the Heart end) hero def d covers from post p: one number per route. Cached. */
function coverR(b, d, p) {
  b._cov ||= new Map();
  const key = d.id + '|' + p.id;
  let out = b._cov.get(key);
  if (out) return out;
  const r = d.range + 0.3;
  out = b.map.routes.map((route) => {
    let c = 0;
    for (let s = 0; s < route.len; s += 0.25) {
      const k = Math.floor(s), a = route.pts[Math.min(k, route.pts.length - 1)], bb = route.pts[Math.min(k + 1, route.pts.length - 1)], t = s - k;
      const x = a[0] + (bb[0] - a[0]) * t, y = a[1] + (bb[1] - a[1]) * t, z = a[2];
      const rr = r + Math.max(0, Math.min(0.75, (p.h - z) * 0.25));
      if (dist(p.x + 0.5, p.y + 0.5, x, y) <= rr) c += 0.25 * (0.6 + 0.8 * s / route.len);
    }
    return Math.min(6, c);
  });
  b._cov.set(key, out);
  return out;
}
const coverage = (b, d, p) => coverR(b, d, p).reduce((a, c) => a + c, 0);
// a short road is the dangerous one: its foes are under fire for less time
const danger = (b) => b._danger ||= b.map.routes.map((r) => Math.sqrt(27 / Math.max(8, r.len)));
const mult = (d) => (d.kit.splash || d.kit.cleave || d.kit.chain ? 1.15 : 1);
/**
 * Value of hero d on post p: its damage on each road it reaches, with diminishing returns for a road already well
 * held (cover = what the deployed heroes already put on each road), so every road gets defenders.
 */
function value(b, d, p, cover = null) {
  const cr = coverR(b, d, p), w = danger(b);
  let v = 0;
  for (let i = 0; i < cr.length; i++) { const c0 = cover ? cover[i] : 0, add = d.power * mult(d) * cr[i]; v += w[i] * (Math.sqrt(c0 + add) - Math.sqrt(c0)); }
  return v;
}
const fieldCover = (b) => { const out = b.map.routes.map(() => 0); for (const u of b.units) coverR(b, u.def, u.post).forEach((c, i) => { out[i] += u.def.power * mult(u.def) * c; }); return out; };

export function autoBattle(b, dt) {
  b._ai = (b._ai || 0) - dt;
  if (b._ai > 0 || b.done) return;
  b._ai = 0.2;
  const field = b.units.filter((u) => !u.def.ally).length, free = b.map.posts.filter((p) => b.postFree(p.id));
  // 1. deploy: the best (hero, post) pair we can afford; at the start take the cheap good ones first
  if (free.length) {
    let best = null, bv = 0;
    const cover = fieldCover(b);
    for (let i = 0; i < b.squad.length; i++) {
      const d = b.squad[i];
      if (b.deployed(i) || b.cooldown[i] > 0 || (!d.ally && field >= b.deployLimit)) continue;
      for (const p of free) {
        const v = value(b, d, p, cover) / (b.units.length < 2 ? d.cost : 1);
        if (v > bv) { bv = v; best = [i, p, d]; }
      }
    }
    if (best && coverage(b, best[2], best[1]) > 0.6) {
      if (b.valor >= best[2].cost) { b.deploy(best[0], best[1].id); return; }
      if (field < Math.min(2, b.deployLimit)) return; // save up for the first heroes
    }
  }
  // 2. Bastion works and empowering, with what is left
  const wavesLeft = b.waves.length - b.waveI;
  if (b.heart < b.heartMax * 0.5 && b.bastionCost('ward') <= b.valor) { b.buyBastion('ward'); return; }
  if (wavesLeft > 3 && b.works.drums < 2 && b.bastionCost('drums') <= b.valor && field >= Math.min(3, b.deployLimit)) { b.buyBastion('drums'); return; }
  let bu = null, bv = 0;
  for (const u of b.units) {
    const c = b.empowerCost(u);
    if (c === Infinity) continue;
    const v = value(b, u.def, u.post) * 0.22 / c;
    if (v > bv) { bv = v; bu = u; }
  }
  const rallyC = b.bastionCost('rally'), rallyV = rallyC < Infinity ? b.units.reduce((a, u) => a + value(b, u.def, u.post), 0) * 0.1 / rallyC : 0;
  if (rallyV > bv && b.valor >= rallyC && field >= b.deployLimit) { b.buyBastion('rally'); return; }
  if (bu && b.valor >= b.empowerCost(bu) && (field >= b.deployLimit || !free.length || b.valor > b.valorCap * 0.8)) { b.empower(bu); return; }
  // 3. a clear field and a full purse: bring the next wave on
  if (b.waveDone && !b.monsters.length && b.valor >= b.valorCap * 0.95 && field >= Math.min(b.deployLimit, 3)) b.callWave();
}
