// Every stage's battle map (300 stages over the 40 layouts, turned and flipped): it builds, every rift has a route to
// the Heart that steps tile to tile along the road, the routes are not long detours of the shortest road, and the
// stage gets the posts it needs beside the road. No browser: node defense/tests/maps.mjs
import { buildMap, K } from '../src/battle/map.js';
import { deployLimit } from '../src/data/waves.js';
let bad = 0, short = 0, tight = [], worstDetour = 0, worstMs = 0, worstAt = 0, routes = 0;
const fail = (n, m) => { bad++; console.log(`stage ${n}: ${m}`); };
for (let n = 1; n <= 300; n++) {
  const t = performance.now();
  let m;
  try { m = buildMap(n); } catch (e) { fail(n, e.message); continue; }
  const ms = performance.now() - t; if (ms > worstMs) { worstMs = ms; worstAt = n; }
  const { w, h, kind, I, heart } = m;
  // shortest road distance from the Heart
  const d = new Int16Array(w * h).fill(-1), q = [heart]; d[I(...heart)] = 0;
  for (let qi = 0; qi < q.length; qi++) { const [x, y] = q[qi]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (m.inb(nx, ny) && kind[I(nx, ny)] === K.PATH && d[I(nx, ny)] < 0) { d[I(nx, ny)] = d[I(x, y)] + 1; q.push([nx, ny]); } } }
  for (const s of m.spawns) {
    const rs = m.routes.filter((r) => r.spawn === s);
    if (!rs.length) { fail(n, `rift ${s} has no route`); continue; }
    for (const r of rs) {
      routes++;
      for (let i = 1; i < r.pts.length; i++) { const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i]; if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) { fail(n, `route jumps at ${i}`); break; } if (kind[I(bx - 0.5, by - 0.5)] !== K.PATH) { fail(n, `route leaves the road at ${bx},${by}`); break; } }
      const last = r.pts[r.pts.length - 1]; if (last[0] - 0.5 !== heart[0] || last[1] - 0.5 !== heart[1]) fail(n, 'route ends off the Heart');
      const det = (r.pts.length - 1) / Math.max(1, d[I(...s)]); worstDetour = Math.max(worstDetour, det);
      if (det > 1.6) fail(n, `route ${(det * 100 - 100).toFixed(0)}% longer than the shortest road (${r.pts.length - 1} vs ${d[I(...s)]})`);
    }
  }
  // the builder aims for three spare posts (map.js minPosts); fewer posts than heroes would be a stage that can't be
  // fielded. Stages with no spare post are listed, not failed: the campaign's calendar (DEFENSE.md) was fitted with
  // them as they are, and giving them more posts shortens it by weeks
  const near = m.posts.filter((p) => p.dist <= 2.3).length, lim = deployLimit(n);
  if (near < lim) fail(n, `${near} posts beside the road for ${lim} heroes`);
  else if (near === lim) tight.push(n);
  else if (near < Math.min(14, lim + 3)) short++;
}
console.log(`${routes} routes over 300 stages; worst detour ${(worstDetour * 100 - 100).toFixed(0)}%, slowest build ${worstMs.toFixed(0)} ms (stage ${worstAt}); ${short} stages with one or two spare posts, not three; no spare post: stages ${tight.join(', ') || 'none'}`);
console.log(bad ? `${bad} PROBLEMS` : 'DEFENSE MAPS OK');
process.exitCode = bad ? 1 : 0;
