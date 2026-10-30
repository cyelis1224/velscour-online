// Tile map: floor grid, wall segments, collision, line of sight and path finding.

/**
 * Collision half-size of a creature's body. Capped below half a tile so even a huge boss fits any one-tile gap
 * (a 2-wide corridor, a gap beside a prop); its sprite and hit radius (`r`) stay as big as they are.
 */
export const bodyR = (e) => Math.min(e.r * 0.8, 0.42);

export class TileMap {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.t = new Uint8Array(w * h); // 0 void, 1 floor
    this.v = new Uint8Array(w * h); // floor visual variant index
    this.block = new Uint8Array(w * h); // static obstacle on floor
    this.seen = new Uint8Array(w * h);
    this.segments = []; // floor/void edges
    this.walls = []; // wall draw items (buildWalls)
    this.doors = [];
    this.segGrid = null;
    this.flow = new Int16Array(w * h);
    this.flowFrom = [-999, -999];
    this.flowTime = 0;
    // height mapped maps (world/mountain.js): a level per tile; a body hops up at most `climb` levels and drops at most
    // `drop`, so a taller step is a wall one way (or both). null on flat maps, where none of this costs anything.
    this.hgt = null;
    this.climb = 2; this.drop = 5;
  }
  /** Can a walker step from tile index a onto tile index b (height map only)? */
  stepOk(a, b) { const d = this.hgt[b] - this.hgt[a]; return d <= this.climb && -d <= this.drop; }
  /** The tile index under (x,y), clamped onto the map. */
  tileIdx(x, y) { return Math.min(this.h - 1, Math.max(0, Math.floor(y))) * this.w + Math.min(this.w - 1, Math.max(0, Math.floor(x))); }
  idx(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  tile(x, y) { return this.inb(x, y) ? this.t[y * this.w + x] : 0; }
  isFloor(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && this.t[ty * this.w + tx] === 1;
  }
  walkableTile(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && this.t[ty * this.w + tx] === 1 && !this.block[ty * this.w + tx];
  }
  walkable(x, y) { return this.walkableTile(Math.floor(x), Math.floor(y)); }

  /** Is a circle at (x,y) radius r free of walls? On a height map its centre must be a hop or a drop from tile `from`
   * (default: the tile under it), and no corner may hang out over a drop too deep to take; brushing higher ground is
   * fine (the foot of a cliff, or the edge just dropped from). */
  circleFree(x, y, r, from) {
    if (!(this.walkable(x - r, y - r) && this.walkable(x + r, y - r) && this.walkable(x - r, y + r) && this.walkable(x + r, y + r))) return false;
    if (!this.hgt) return true;
    const H = this.hgt, a = from ?? this.tileIdx(x, y), lo = H[a] - this.drop;
    if (from !== undefined && !this.stepOk(a, this.tileIdx(x, y))) return false;
    return H[this.tileIdx(x - r, y - r)] >= lo && H[this.tileIdx(x + r, y - r)] >= lo && H[this.tileIdx(x - r, y + r)] >= lo && H[this.tileIdx(x + r, y + r)] >= lo;
  }

  /** Move a circle with wall sliding. Returns true if moved at all. */
  move(e, dx, dy, ghost = false) {
    if (ghost) {
      const nx = e.x + dx, ny = e.y + dy;
      if (this.isFloor(nx, ny)) { e.x = nx; e.y = ny; return true; }
      return false;
    }
    const r = bodyR(e);
    let moved = false;
    const from = this.hgt ? this.tileIdx(e.x, e.y) : undefined;
    if (!this.circleFree(e.x, e.y, r, from)) {
      // already overlapping a wall or prop (knocked, spawned or pushed there): any step onto open floor lets it out
      const nx = e.x + dx, ny = e.y + dy;
      if (this.walkable(nx, ny) && (!this.hgt || this.stepOk(from, this.tileIdx(nx, ny)))) { e.x = nx; e.y = ny; return true; }
      return false;
    }
    if (dx !== 0) {
      const nx = e.x + dx;
      if (this.circleFree(nx, e.y, r, from)) { e.x = nx; moved = true; }
    }
    if (dy !== 0) {
      const ny = e.y + dy;
      if (this.circleFree(e.x, ny, r, this.hgt ? this.tileIdx(e.x, e.y) : undefined)) { e.y = ny; moved = true; }
    }
    return moved;
  }

  /** Grid ray-march line of sight. */
  los(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const steps = Math.ceil(d * 3);
    // on a height map, ground rising more than a hop above both ends hides one from the other
    const H = this.hgt, top = H ? Math.max(H[this.tileIdx(x0, y0)], H[this.tileIdx(x1, y1)]) + (this.losRise ?? this.climb) : 0;   // losRise: a map whose low rises don't hide (the caves)
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const tx = Math.floor(x0 + dx * t), ty = Math.floor(y0 + dy * t);
      if (!this.tile(tx,ty) || (this.losBlocks && this.block[ty*this.w+tx])) return false;
      if (H && H[ty * this.w + tx] > top) return false;
    }
    return true;
  }

  /** Cast a ray, return the distance until a wall (max len). */
  rayLength(x0, y0, ang, len) {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let d = 0.2; d <= len; d += 0.2) {
      if (!this.isFloor(x0 + c * d, y0 + s * d)) return Math.max(0, d - 0.2);
    }
    return len;
  }

  /** BFS distance field toward (tx,ty) used by every monster for pathing. */
  buildFlow(px, py, maxD = 48) {
    const tx = Math.floor(px), ty = Math.floor(py);
    if (tx === this.flowFrom[0] && ty === this.flowFrom[1]) return;
    this.flowFrom = [tx, ty];
    const f = this.flow;
    f.fill(-1);
    if (!this.walkableTile(tx, ty)) return;
    const W = this.w;
    const q = this._fq || (this._fq = new Int32Array(this.w * this.h));
    let qh = 0, qt = 0;
    q[qt++] = ty * W + tx; f[ty * W + tx] = 0;
    const T = this.t, Bl = this.block, H = this.h, hg = this.hgt;
    while (qh < qt) {
      const i = q[qh++];
      const d = f[i];
      if (d >= maxD) continue;
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (T[ni] !== 1 || Bl[ni] || f[ni] !== -1) continue;
        if (hg && !this.stepOk(ni, i)) continue; // the field is walked from ni to i
        f[ni] = d + 1;
        q[qt++] = ni;
      }
    }
  }
  flowAt(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!this.inb(tx, ty)) return -1;
    return this.flow[ty * this.w + tx];
  }
  /**
   * The way down the flow field from (x,y): up to n tile centres, each the best of its 8 neighbours (no corner
   * cutting), smoothed for a mover of half-size r so it heads straight for the farthest one its body can reach.
   * null when (x,y) is off the field.
   */
  flowPath(x0, y0, r, n = 12) {
    const out = [];
    let x = x0, y = y0;
    for (let i = 0; i < n; i++) {
      const s = this.flowStep(x, y);
      if (!s) break;
      out.push(s); x = s[0]; y = s[1];
    }
    return out.length ? this.smooth(x0, y0, out, r) : null;
  }
  /** Direction (tile centre) of the best next step along the flow field. */
  flowStep(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    const here = this.flowAt(x, y);
    if (here <= 0) return null;
    let best = here, bx = 0, by = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = tx + ox, ny = ty + oy;
        if (!this.walkableTile(nx, ny)) continue;
        if (ox && oy && (!this.walkableTile(tx + ox, ty) || !this.walkableTile(tx, ty + oy))) continue;
        if (this.hgt && !this.stepsOk(tx, ty, ox, oy)) continue;
        const v = this.flow[ny * this.w + nx];
        if (v >= 0 && v < best) { best = v; bx = ox; by = oy; }
      }
    }
    if (!bx && !by) return null;
    return [tx + bx + 0.5, ty + by + 0.5];
  }

  /**
   * A* path on tiles (8-dir), returns smoothed waypoints (start excluded) or null. The goal snaps to the nearest
   * walkable tile within 3; the last waypoint is the raw goal only when it was walkable. r: the mover's collision
   * half-size for smoothing (move() uses e.r * 0.8). Binary heap + typed arrays reused between calls, so the
   * minions can afford to path every few frames.
   */
  findPath(sx, sy, gx, gy, maxNodes = 3000, r = 0.28) {
    const W = this.w, N = W * this.h;
    const stx = Math.floor(sx), sty = Math.floor(sy);
    if (!this.inb(stx, sty)) return null;
    const s = sty * W + stx;
    let gtx = Math.floor(gx), gty = Math.floor(gy), snapped = false;
    if (!this.walkableTile(gtx, gty)) {
      // snap goal to nearest walkable tile
      let best = Infinity, bx = 0, by = 0;
      for (let oy = -3; oy <= 3; oy++) {
        for (let ox = -3; ox <= 3; ox++) {
          const d = ox * ox + oy * oy;
          if (d < best && this.walkableTile(gtx + ox, gty + oy)) { best = d; bx = ox; by = oy; }
        }
      }
      if (best === Infinity) return null;
      gtx += bx; gty += by; snapped = true;
    }
    const g = gty * W + gtx;
    const end = snapped ? [gtx + 0.5, gty + 0.5] : [gx, gy];
    if (s === g) return [end];
    if (!this._as || this._as.g.length !== N) this._as = { g: new Float32Array(N), came: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0, heap: [], hf: [] };
    const A = this._as, gs = A.g, came = A.came, stamp = A.stamp, closed = A.closed;
    const gen = ++A.gen;
    const heap = A.heap, hf = A.hf;
    heap.length = 0; hf.length = 0;
    const h = (x, y) => { const dx = Math.abs(x - gtx), dy = Math.abs(y - gty); return dx + dy - 0.586 * Math.min(dx, dy); };
    const push = (i, f) => {
      let k = heap.length;
      heap.push(i); hf.push(f);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= f) break;
        heap[k] = heap[p]; hf[k] = hf[p]; k = p;
      }
      heap[k] = i; hf[k] = f;
    };
    const pop = () => {
      const top = heap[0], li = heap.pop(), lf = hf.pop(), n = heap.length;
      if (n) {
        let k = 0;
        for (;;) {
          let c = 2 * k + 1;
          if (c >= n) break;
          if (c + 1 < n && hf[c + 1] < hf[c]) c++;
          if (hf[c] >= lf) break;
          heap[k] = heap[c]; hf[k] = hf[c]; k = c;
        }
        heap[k] = li; hf[k] = lf;
      }
      return top;
    };
    const T = this.t, Bl = this.block, SM = this.stepMask();
    stamp[s] = gen; gs[s] = 0; came[s] = -1;
    push(s, h(stx, sty));
    let n = 0;
    while (heap.length && n < maxNodes) {
      const cur = pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen; n++;
      if (cur === g) {
        const path = [];
        for (let c = came[cur]; c !== s && c >= 0; c = came[c]) path.push([(c % W) + 0.5, ((c / W) | 0) + 0.5]);
        path.reverse();
        path.push(end);
        return this.smooth(sx, sy, path, r);
      }
      // the 8 neighbours in the same order as ever (ties in the heap fall the same way), off the typed arrays:
      // stepMask holds the in-bounds, height-legal steps, floor and props are read live
      const cx = cur % W, cy = (cur / W) | 0, cg = gs[cur], sm = SM[cur];
      for (let k = 0; k < 9; k++) {
        if (!((sm >> k) & 1)) continue;
        const ox = (k % 3) - 1, oy = ((k / 3) | 0) - 1, ni = cur + oy * W + ox;
        if (T[ni] !== 1 || Bl[ni]) continue;
        if (ox && oy && (T[cur + ox] !== 1 || Bl[cur + ox] || T[cur + oy * W] !== 1 || Bl[cur + oy * W])) continue;
        if (closed[ni] === gen) continue;
        const ng = cg + (ox && oy ? 1.414 : 1);
        if (stamp[ni] === gen && ng >= gs[ni]) continue;
        stamp[ni] = gen; gs[ni] = ng; came[ni] = cur;
        push(ni, ng + h(cx + ox, cy + oy));
      }
    }
    return null;
  }
  /** Height map: may a walker go from tile (x,y) to (x+ox,y+oy)? A body cutting a diagonal brushes all four tiles
   * round the corner in any order, so a diagonal needs them all within a hop of each other (drops go straight). */
  stepsOk(x, y, ox, oy) {
    const W = this.w, H = this.hgt, a = y * W + x, b = (y + oy) * W + x + ox;
    if (!(ox && oy)) return this.stepOk(a, b);
    const s1 = y * W + x + ox, s2 = (y + oy) * W + x;
    return Math.max(H[a], H[b], H[s1], H[s2]) - Math.min(H[a], H[b], H[s1], H[s2]) <= this.climb;
  }
  /** Bit k (k = (oy + 1) * 3 + ox + 1) set where a walker may step from tile i to its neighbour (ox, oy) on the map by
   *  the height map's hop rule (stepsOk); walkability is checked live (doors, props). Built once; a change to hgt (the
   *  Castle's drawbridge) clears it. */
  stepMask() {
    if (this._stepMask) return this._stepMask;
    const W = this.w, H = this.h, out = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let b = 0;
      for (let k = 0; k < 9; k++) {
        const ox = (k % 3) - 1, oy = ((k / 3) | 0) - 1;
        if (k === 4 || x + ox < 0 || y + oy < 0 || x + ox >= W || y + oy >= H) continue;
        if (!this.hgt || this.stepsOk(x, y, ox, oy)) b |= 1 << k;
      }
      out[y * W + x] = b;
    }
    return (this._stepMask = out);
  }
  smooth(sx, sy, path, r = 0.28) {
    // drop intermediate nodes with clear line of sight
    // Between two tile centres the answer is the same for every monster on the hero's flow field, and a pack
    // re-plans several times a second (up to ~66 wide checks for a 12-step path, most of a frame's update in narrow
    // corridors): those are remembered for half a second.
    const now = performance.now();
    if (!this._los || now - this._losT > 500) { this._los = new Map(); this._losT = now; }
    const C = this._los, W = this.w, WH = W * this.h, rk = Math.round(r * 50) & 63;
    const centre = (v) => v - Math.floor(v) === 0.5;
    const los = (ax, ay, bx, by) => {
      if (!centre(ax) || !centre(ay) || !centre(bx) || !centre(by)) return this.losWide(ax, ay, bx, by, r);
      const key = ((Math.floor(ay) * W + Math.floor(ax)) * WH + Math.floor(by) * W + Math.floor(bx)) * 64 + rk;
      let v = C.get(key);
      if (v === undefined) { v = this.losWide(ax, ay, bx, by, r); C.set(key, v); }
      return v;
    };
    // looking at most 24 nodes ahead: a mover re-plans long before it gets that far, and a long A* path (a castle
    // ward away) tried against its far end first cost more than the search
    const out = [];
    let ax = sx, ay = sy, i = 0;
    while (i < path.length) {
      let j = Math.min(path.length - 1, i + 24);
      while (j > i && !los(ax, ay, path[j][0], path[j][1])) j--;
      out.push(path[j]);
      ax = path[j][0]; ay = path[j][1];
      i = j + 1;
    }
    return out;
  }
  /** Can a walker go straight from (x0,y0) to (x1,y1)? r must cover the mover's collision box (move() uses r * 0.8 = 0.24). */
  losWide(x0, y0, x1, y1, r = 0.28) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
    const steps = Math.ceil(d * 4);
    // a height map walks the line tile to tile: every step from the last sample's tile must be a hop or a drop
    let from = this.hgt ? this.tileIdx(x0, y0) : undefined;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
      if (!this.circleFree(x, y, r, from)) return false;
      if (from !== undefined) {
        // a line through a tile corner is walked round one side or the other (move() slides x then y): the diagonal
        // rule, all four tiles within a hop (else the hero slips onto a lower stair beside the wall-walk and sticks)
        const to = this.tileIdx(x, y), W = this.w, ox = (to % W) - (from % W), oy = ((to / W) | 0) - ((from / W) | 0);
        if (ox && oy && !this.stepsOk(from % W, (from / W) | 0, Math.sign(ox), Math.sign(oy))) return false;
        const cx = Math.round(x), cy = Math.round(y); // passing right by a corner counts as cutting it
        if (Math.abs(x - cx) < 0.15 && Math.abs(y - cy) < 0.15 && cx > 0 && cy > 0 && cx < W && cy < this.h && !this.stepsOk(cx - 1, cy - 1, 1, 1)) return false;
        from = to;
      }
    }
    return true;
  }

  /** The nearest spot to (x,y), within 2 tiles, where a body of half-size r fits; (x,y) itself if none. */
  nudge(x, y, r) {
    if (this.circleFree(x, y, r)) return [x, y];
    for (let k = 1; k <= 8; k++) {
      const d = k * 0.25;
      for (let i = 0; i < 8 + k * 2; i++) {
        const a = (i / (8 + k * 2)) * Math.PI * 2, nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
        if (this.circleFree(nx, ny, r)) return [nx, ny];
      }
    }
    return [x, y];
  }

  /** Random walkable tile centre near (x,y) within r. */
  randomNear(x, y, r, rng = Math.random) {
    for (let i = 0; i < 40; i++) {
      const nx = x + (rng() * 2 - 1) * r, ny = y + (rng() * 2 - 1) * r;
      if (this.walkable(nx, ny) && this.circleFree(nx, ny, 0.3)) return [nx, ny];
    }
    return [x, y];
  }

  reveal(x, y, r) {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(this.w - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(this.h - 1, Math.ceil(y + r));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if ((tx - x) ** 2 + (ty - y) ** 2 <= r2) this.seen[ty * this.w + tx] = 1;
      }
    }
  }

  /**
   * Walls from the biome pack (Diablo II style thin walls on every floor/void edge). Each tile vertex on a wall gets
   * the node piece for its connections (NE=1 -y, SE=2 +x, SW=4 +y, NW=8 -x), drawn as separate half-tile arms so
   * each sorts on its own: arms facing the floor ("back" walls) sort just behind the creatures beside them, arms
   * with the floor behind them ("front" walls) just in front. Every straight run of edges gets one wall family and
   * texture variant (`families`: [[name, weight], ...]).
   * `openings` (dungeon.js findOpenings) put an arch or a pair of doors across a gap in a room's wall:
   * {axis: 'x'|'y', line, a0, a1 (vertex range along the line), kind: 'arch'|'door', design, flip}.
   * Fills this.segments (edges, for torches), this.walls (draw items) and this.doors.
   */
  buildWalls(tileset, rng = Math.random, openings = [], families = null) {
    const segs = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.t[y * this.w + x] !== 1) continue;
        // west edge (x) and east edge (x+1): "/" edges; north edge (y) and south edge (y+1): "\" edges
        if (!this.tile(x - 1, y)) segs.push({ dir: 'f', ex: x, ey0: y, ey1: y + 1, front: false });
        if (!this.tile(x + 1, y)) segs.push({ dir: 'f', ex: x + 1, ey0: y, ey1: y + 1, front: true });
        if (!this.tile(x, y - 1)) segs.push({ dir: 'b', ey: y, ex0: x, ex1: x + 1, front: false });
        if (!this.tile(x, y + 1)) segs.push({ dir: 'b', ey: y + 1, ex0: x, ex1: x + 1, front: true });
      }
    }
    for (const s of segs) {
      if (s.dir === 'f') { s.mx = s.ex; s.my = (s.ey0 + s.ey1) / 2; } else { s.mx = (s.ex0 + s.ex1) / 2; s.my = s.ey; }
      s.depth = s.mx + s.my;
    }
    this.segments = segs;
    this.walls = [];
    this.doors = [];
    if (!tileset.walls) return this.indexWalls();
    // vertex -> arms: dir -> { front, run }
    const W1 = this.w + 1, verts = new Map();
    const arm = (x, y, d, front) => {
      const k = y * W1 + x;
      let v = verts.get(k);
      if (!v) verts.set(k, (v = { x, y, arms: {} }));
      v.arms[d] = { front };
    };
    for (const s of segs) {
      if (s.dir === 'b') { arm(s.ex0, s.ey, 'SE', s.front); arm(s.ex1, s.ey, 'NW', s.front); }
      else { arm(s.ex, s.ey0, 'SW', s.front); arm(s.ex, s.ey1, 'NE', s.front); }
    }
    // an even gap's arch (one tile wider) reaches half a tile over the wall on each side: those arms give way to it
    for (const o of openings) {
      if (o.kind !== 'arch' || (o.a1 - o.a0) % 2) continue;
      const at = (a) => verts.get((o.axis === 'x' ? o.line : a) * W1 + (o.axis === 'x' ? a : o.line));
      const v0 = at(o.a0), v1 = at(o.a1);
      if (v0) delete v0.arms[o.axis === 'x' ? 'NW' : 'NE'];
      if (v1) delete v1.arms[o.axis === 'x' ? 'SE' : 'SW'];
    }
    // runs: straight chains of edges along one line share a family and a texture variant
    const fams = families || tileset.families.map((f) => [f, 1]);
    const total = fams.reduce((t, f) => t + f[1], 0);
    const pickFam = () => { let r = rng() * total; for (const [f, w] of fams) if ((r -= w) < 0) return f; return fams[0][0]; };
    const STEP = { SE: [1, 0, 'NW'], SW: [0, 1, 'NE'] };
    const runs = [];
    for (const v of verts.values()) {
      for (const d of ['SE', 'SW']) {
        if (!v.arms[d] || v.arms[d].run) continue;
        const back = d === 'SE' ? 'NW' : 'NE';
        if (v.arms[back] && !v.arms[back].run) continue; // start runs at their first vertex
        const run = { fam: pickFam(), vari: Math.floor(rng() * 3) };
        runs.push(run);
        let c = v;
        while (c && c.arms[d]) {
          c.arms[d].run = run;
          const [dx, dy, opp] = STEP[d];
          c = verts.get((c.y + dy) * W1 + c.x + dx);
          if (c && c.arms[opp]) c.arms[opp].run = run;
        }
      }
    }
    // runs meeting at a plain corner (two arms) are one wall turning: they share a family, so a room's outline
    // doesn't change material at every corner (tees and crossings may still)
    const up = new Map(runs.map((r) => [r, r]));
    const root = (r) => { while (up.get(r) !== r) r = up.get(r); return r; };
    for (const v of verts.values()) {
      const as = Object.values(v.arms);
      if (as.length === 2 && as[0].run && as[1].run) up.set(root(as[1].run), root(as[0].run));
    }
    for (const r of runs) r.fam = root(r).fam;
    const OFF = { NE: [0, -0.25], SE: [0.25, 0], SW: [0, 0.25], NW: [-0.25, 0] };
    for (const v of verts.values()) {
      let mask = 0;
      for (const d in v.arms) mask |= { NE: 1, SE: 2, SW: 4, NW: 8 }[d];
      if (!mask) continue;
      for (const d in v.arms) {
        const a = v.arms[d], run = a.run || { fam: fams[0][0], vari: 0 };
        const vars = (tileset.walls[run.fam] || tileset.walls[tileset.families[0]])[mask];
        const piece = vars[run.vari % vars.length];
        const sl = piece.find((p) => p.arm === d);
        if (!sl) continue;
        const [ox, oy] = OFF[d];
        // centre of the arm, plus a bias toward the side the floor is on (see above)
        this.walls.push({ kind: 'wall', x: v.x, y: v.y, r: sl, front: a.front, depth: v.x + v.y + ox + oy + (a.front ? 0.45 : -0.45) });
      }
    }
    for (const o of openings) {
      const ax = o.axis === 'x' ? [1, 0] : [0, 1];
      const pos = (a) => (o.axis === 'x' ? [a, o.line] : [o.line, a]);
      if (o.kind === 'arch') {
        const dir = o.axis === 'x' ? (o.flip ? 'NW' : 'SE') : (o.flip ? 'NE' : 'SW');
        const [cx, cy] = pos((o.a0 + o.a1) / 2);
        for (const sl of tileset.arches[o.design][dir]) {
          // slice offsets are along the piece's own direction; NW/NE run the other way
          const a = dir === 'NW' || dir === 'NE' ? -sl.a : sl.a;
          this.walls.push({ kind: 'arch', x: cx, y: cy, axis: o.axis, r: sl, depth: cx + cy + a * (ax[0] + ax[1]) });
        }
      } else {
        // a pair of doors, hinged at the outer jambs
        for (let a = o.a0; a < o.a1; a++) {
          const first = a === o.a0;
          const dir = o.axis === 'x' ? (first ? 'SE' : 'NW') : (first ? 'SW' : 'NE');
          const [cx, cy] = pos(a + 0.5);
          const door = { kind: 'door', x: cx, y: cy, axis: o.axis, open: false, art: tileset.doors[o.design][dir] };
          this.doors.push(door);
          for (const part of ['L', 'R', 'leaf']) {
            const sl = door.art[part === 'leaf' ? 'open' : 'closed'].find((p) => p.part === part);
            if (sl) this.walls.push({ kind: 'door', door, part, x: cx, y: cy, depth: cx + cy + sl.du + sl.dv });
          }
        }
      }
    }
    this.indexWalls();
  }

  indexWalls() {
    // spatial buckets (by 8x8 tile cells) for fast culling
    const B = 8, bw = Math.ceil((this.w + 1) / B), bh = Math.ceil((this.h + 1) / B);
    this.segGrid = { B, bw, bh, cells: Array.from({ length: bw * bh }, () => []) };
    for (const o of this.walls) {
      const cx = Math.min(bw - 1, Math.max(0, Math.floor(o.x / B))), cy = Math.min(bh - 1, Math.max(0, Math.floor(o.y / B)));
      this.segGrid.cells[cy * bw + cx].push(o);
    }
  }

  /** Wall draw items (arms, arch slices, door parts) anchored in the tile rect. */
  wallsIn(x0, y0, x1, y1, out) {
    const g = this.segGrid;
    if (!g) return out;
    const cx0 = Math.max(0, Math.floor(x0 / g.B)), cx1 = Math.min(g.bw - 1, Math.floor(x1 / g.B));
    const cy0 = Math.max(0, Math.floor(y0 / g.B)), cy1 = Math.min(g.bh - 1, Math.floor(y1 / g.B));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const o of g.cells[cy * g.bw + cx]) out.push(o);
    return out;
  }
}
