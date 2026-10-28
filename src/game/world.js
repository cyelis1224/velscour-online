// World: everything that lives in the current level.
import { augHazard } from './augments.js';
import { G } from '../state.js';
import { net } from '../net/network.js';
import { camera, isoX, isoY } from '../core/view.js';
import { rand, dist2, TAU, chance } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { spawn, updateVfx, addLight, sparkle, smoke, lights } from '../gfx/vfx.js';
import { bodyR } from '../world/map.js';

const CELL = 2;

export class World {
  constructor(kind, opts) {
    this.kind = kind; // 'town' | 'dungeon'
    Object.assign(this, opts); // map, tileset, biome, depth, ...
    this.creatures = [];
    this.hazards = [];
    this.loot = [];
    this.corpses = [];
    this.fallen = []; // dead summons' last poses (core/petart.js)
    this.props = this.props || [];
    this.buildings = this.buildings || [];
    this.npcs = this.npcs || [];
    this.chests = this.chests || [];
    this.torches = this.torches || [];
    this.wallHangings = this.wallHangings || [];
    this.portals = this.portals || [];
    this.grid = new Map();
    this.gridPool = [];
    this.time = 0;
    this.flowTimer = 0;
    this.ambT = 0;
    this.boss = null;
    this.exitOpen = kind === 'town';
    this.kills = 0;
    this.lastPlayerTile = -1;
  }

  add(c) {
    c.world = this;
    // never start inside a wall or prop: a body that overlaps one can't take a step
    if (this.map && !c.ghost && !c.isPlayer) [c.x, c.y] = this.map.nudge(c.x, c.y, bodyR(c));
    this.creatures.push(c);
    if (c.team === 'enemy') {
      if (!c.netId) {
        c.netId = 'dyn_' + (net.myId || 'h') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
      }
      if (!c.idx) {
        c.idx = (this._monsterSeq = (this._monsterSeq || 2000) + 1);
      }
      if (G.room && !c.fromNetwork && !this._generatingDungeon && !c.ambusher && G.game?.isDungeonAuthority(this.depth)) {
        net.sendMonsterSpawn({
          netId: c.netId,
          idx: c.idx,
          depth: this.depth || 0,
          worldKind: this.kind || 'dungeon',
          x: Math.round(c.x * 100) / 100,
          y: Math.round(c.y * 100) / 100,
          z: Math.round((c.z || 0) * 10) / 10,
          hp: Math.round(c.hp),
          maxHp: Math.round(c.maxHp),
          dmg: Math.round(c.dmg || 10),
          level: c.level || 1,
          rank: c.rank || 'normal',
          arch: c.arch,
          name: c.name,
          biome: this.biome?.id || 'dungeon',
          look: c.look,
          sprite: c.sprite,
          art: c.art,
          artH: c.artH,
          aura: c.aura,
          color: c.aura || (c.pal ? c.pal.a : null),
          el: c.el,
          ai: c.ai,
          static: !!c.static,
          fly: !!c.fly,
          isWard: !!c.isWard,
          vk: c.vk,
          scale: c.scale || 1,
          traits: c.traits,
          enteringKind: c.enteringKind,
          enteringFrom: c.enteringFrom,
        });
      }
    }
    return c;
  }
  remove(c) {
    const idx = this.creatures.indexOf(c);
    if (idx !== -1) this.creatures.splice(idx, 1);
    if (c.world === this) c.world = null;
    return c;
  }
  addHazard(h) { h.world = this; this.hazards.push(h); return h; }
  addLoot(l) { this.loot.push(l); return l; }

  rebuildGrid() {
    for (const cell of this.grid.values()) { cell.length = 0; this.gridPool.push(cell); }
    this.grid.clear();
    // also: the creatures of each team (in grid order) with the cell each was bucketed in, and whether anything
    // taunts, so nearestHostile/pickTarget can skip the grid when the other side is a handful (the hero and summons)
    const teams = this.teams || (this.teams = new Map());
    for (const a of teams.values()) a.length = 0;
    this.taunters = 0;
    for (const c of this.creatures) {
      if (c.dead) continue;
      const gx = Math.floor(c.x / CELL), gy = Math.floor(c.y / CELL), k = (gx << 16) | (gy & 0xffff);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = this.gridPool.pop() || []));
      a.push(c);
      c._gx = (k >> 16); c._gy = (k << 16) >> 16; // the cell as the grid key encodes it
      let t = teams.get(c.team);
      if (!t) teams.set(c.team, (t = []));
      t.push(c);
      if (c.taunt) this.taunters++;
    }
  }

  /** Creatures within r of (x,y). filter(c) optional. */
  query(x, y, r, filter, out = []) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const a = this.grid.get((cx << 16) | (cy & 0xffff));
        if (!a) continue;
        for (const c of a) {
          if (c.dead) continue;
          const rr = r + c.r;
          if (dist2(x, y, c.x, c.y) <= rr * rr && (!filter || filter(c))) out.push(c);
        }
      }
    }
    return out;
  }
  hostiles(team, x, y, r) { return this.query(x, y, r, (c) => c.team !== team && c.targetable !== false); }
  nearestHostile(team, x, y, r, needLos = false) {
    let best = null, bd = Infinity;
    let bestX = Infinity, bestY = Infinity;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    const visit = (cell, cx, cy) => {
      for (const c of cell) {
        if (c.dead || c.team === team || c.targetable === false) continue;
        const d = dist2(x, y, c.x, c.y), rr = r + c.r;
        // Preserve query's row/column tie order even when scanning occupied cells.
        if (d > rr * rr || d > bd || (d === bd && (cy > bestY || (cy === bestY && cx >= bestX)))) continue;
        if (needLos && !this.map.los(x, y, c.x, c.y)) continue;
        bd = d; best = c; bestX = cx; bestY = cy;
      }
    };
    // the other teams' creatures, when they are fewer than the cells to scan (a monster looking for the hero and his
    // summons among hundreds of monsters): same cells, same distance test and tie order as the grid scans below
    let others = 0;
    if (this.teams) for (const [t, a] of this.teams) if (t !== team) others += a.length;
    if (this.teams && others < Math.min(this.grid.size, (x1 - x0 + 1) * (y1 - y0 + 1))) {
      for (const [t, a] of this.teams) {
        if (t === team) continue;
        for (const c of a) {
          const cx = c._gx, cy = c._gy;
          if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
          if (c.dead || c.targetable === false) continue;
          const d = dist2(x, y, c.x, c.y), rr = r + c.r;
          if (d > rr * rr || d > bd || (d === bd && (cy > bestY || (cy === bestY && cx >= bestX)))) continue;
          if (needLos && !this.map.los(x, y, c.x, c.y)) continue;
          bd = d; best = c; bestX = cx; bestY = cy;
        }
      }
    } else if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.grid.size) {
      // Awake monsters search thirty tiles: visiting hundreds of empty buckets
      // per monster costs much more than scanning the sparse occupied grid.
      for (const [key, cell] of this.grid) {
        const cx = key >> 16, cy = (key << 16) >> 16;
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) visit(cell, cx, cy);
      }
    } else {
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const cell = this.grid.get((cx << 16) | (cy & 0xffff));
        if (cell) visit(cell, cx, cy);
      }
    }
    return best;
  }
  alliesOf(team, x, y, r) { return this.query(x, y, r, (c) => c.team === team); }

  update(dt) {
    this.time += dt;
    lights.length = 0; // refilled by this update's addLight calls, drawn by the next render (paused frames keep the last set)
    this.pathBudget = 10; // A* searches monsters and minions may run this frame (Monster.navTo)
    const p = this.player;
    // flow field toward the player for monster path finding
    this.flowTimer -= dt;
    if (p && !p.dead && this.flowTimer <= 0) {
      this.map.buildFlow(p.x, p.y, this.map.flowRange || 64); // (the Castle's: far enough to lead round by its stairs)
      this.flowTimer = 0.25;
    }
    this.rebuildGrid();
    if (p && !p.dead) p.update(dt);
    if (G.world && G.world !== this) return; // the hero just stepped through a portal: this world stops with him gone
    const activePlayers = [];
    if (p && !p.dead) activePlayers.push({ x: p.x, y: p.y });
    if (G.remotePlayers) {
      for (const rp of G.remotePlayers.values()) {
        if (!rp.dead && (rp.world === this || (rp.worldKind === this.kind && (this.kind !== 'dungeon' || rp.depth === this.depth)))) {
          activePlayers.push({ x: rp.x, y: rp.y });
        }
      }
    }
    const maxSimDistSq = 28 * 28;
    for (const c of this.creatures) {
      if (c === p || c.dead) continue;
      // on non-authority clients in multiplayer dungeon, smoothly interpolate monster position to net target every frame
      if (c.team === 'enemy' && c.netTargetX != null && G.room && !(G.game && G.game.isDungeonAuthority(this.depth))) {
        const dx = c.netTargetX - c.x;
        const dy = c.netTargetY - c.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.02) {
          const step = Math.min(1, dt * 14);
          c.x += dx * step;
          c.y += dy * step;
          c.moving = true;
        } else {
          c.moving = false;
        }
      }
      // only simulate creatures near the action (near any active player or awake, or bosses)
      if (c.team === 'enemy' && !c.awake && !c.isRaid && c.rank !== 'boss' && c !== this.boss) {
        const nearPlayer = activePlayers.some(pl => dist2(c.x, c.y, pl.x, pl.y) <= maxSimDistSq);
        if (!nearPlayer) continue;
      }
      c.update(dt);
    }
    if (this.townLife) this.townLife.update(dt);
    for (const n of this.npcs) n.update && n.update(dt);
    this.openDoors();
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.update(dt) === false || h.dead) this.hazards.splice(i, 1);
      else if (h.o && h.o.aug) augHazard(h, dt);
    }
    this.separate();
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      if (c.dead && c !== p && (c.removeT = (c.removeT || 0) + dt) > 0.05) this.creatures.splice(i, 1);
    }
    for (let i = this.loot.length - 1; i >= 0; i--) {
      if (this.loot[i].update(dt, this) === false) this.loot.splice(i, 1);
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t += dt;
      if (c.t > 40 || c.used) this.corpses.splice(i, 1);
    }
    if (this.corpses.length > 70) this.corpses.splice(0, this.corpses.length - 70);
    for (let i = this.fallen.length - 1; i >= 0; i--) if ((this.fallen[i].t += dt) > 3) this.fallen.splice(i, 1);
    if (p) this.map.reveal(p.x, p.y, 11);
    this.ambient(dt);
    updateVfx(dt, this);
  }

  /** Push overlapping creatures apart. */
  separate() {
    for (const [, cell] of this.grid) {
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i];
        if (a.static) continue;
        for (let j = i + 1; j < cell.length; j++) {
          const b = cell[j];
          if (b.static && (b.owner === a || (a.team === 'player' && b.team === 'player'))) continue; // walk through friendly turrets and totems
          const dx = b.x - a.x, dy = b.y - a.y;
          const rr = (a.r + b.r) * 0.85;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          const wa = b.static ? 1 : a.isPlayer ? 0.25 : b.isPlayer ? 0.75 : 0.5;
          const wb = 1 - wa;
          this.map.move(a, -nx * push * wa * 2, -ny * push * wa * 2, a.ghost);
          if (!b.static) this.map.move(b, nx * push * wb * 2, ny * push * wb * 2, b.ghost);
        }
      }
    }
  }

  /** Doors swing open (and stay open) when anyone walks up to them. They never block: monsters path straight through. */
  openDoors() {
    for (const d of this.map.doors) {
      if (d.open || this.query(d.x, d.y, 1.1).length === 0) continue;
      d.open = true;
      sfx('door', 0.8);
    }
  }

  ambient(dt) {
    const b = this.biome;
    const vr = camera.viewRect(60);
    // torches & lamps
    for (const t of this.torches) {
      const px = isoX(t.x, t.y), py = isoY(t.x, t.y);
      if (px < vr.x0 || px > vr.x1 || py < vr.y0 || py > vr.y1 + 80) continue;
      addLight(t.x, t.y, 5.5 + Math.sin(this.time * 9 + t.x) * 0.3, 0.9, t.flameZ ?? 20, b.torch || '#ff9a40');
      if (chance(dt * 18)) spawn({ type: 'glow', x: t.x + rand(-0.04, 0.04), y: t.y + rand(-0.04, 0.04), z: t.flameZ ?? 40, vz: rand(15, 35), life: rand(0.3, 0.6), size: rand(2, 3.5), size1: 0.5, color: chance(0.5) ? (b.torch || '#ff9a40') : '#fff0a0', add: true });
    }
    // lit props and portals near the view only: a light reaches about 40 px a unit of radius past its spot, and the
    // 48 lights a frame (vfx.js) were filling with ones across the map (a Breach floor's 30+ lamps and shrines), so the
    // ones on screen (spells, the fight at hand) were dropped
    const lr = camera.viewRect(280);
    const lit = (x, y) => { const px = isoX(x, y), py = isoY(x, y); return px > lr.x0 && px < lr.x1 && py > lr.y0 && py < lr.y1 + 80; };
    for (const pr of this.props) {
      if (!pr.light && !pr.smoke) continue;
      if (pr.light && lit(pr.x, pr.y)) addLight(pr.x, pr.y, pr.light + Math.sin(this.time * 7 + pr.x) * 0.15, 0.8, 20 + (pr.z || 0), pr.lightColor || '#ffb050');
      if (pr.smoke) {
        // camp fires and chimneys (the Castle): a slow plume drifting downwind, embers off a fire
        const px = isoX(pr.x, pr.y), py = isoY(pr.x, pr.y);
        if (px < vr.x0 || px > vr.x1 || py < vr.y0 || py > vr.y1 + 160) continue;
        if (chance(dt * pr.smoke)) spawn({ type: 'smoke', x: pr.x + rand(-0.15, 0.15), y: pr.y + rand(-0.15, 0.15), z: pr.smokeZ ?? 16, vx: rand(0.05, 0.3), vy: rand(-0.25, 0), vz: rand(12, 22), life: rand(2.4, 3.8), size: rand(4, 7), size1: rand(15, 24), color: '#3b3733', alpha: 0.26 });
        if (pr.light && chance(dt * 5)) spawn({ type: 'glow', x: pr.x + rand(-0.2, 0.2), y: pr.y + rand(-0.2, 0.2), z: 14, vz: rand(30, 60), life: rand(0.6, 1.2), size: rand(1.5, 2.5), size1: 0.4, color: chance(0.5) ? '#ffb050' : '#ffe0a0', add: true });
      }
    }
    // portals
    for (const po of this.portals) {
      if (!po.active || !lit(po.x, po.y)) continue;
      addLight(po.x, po.y, 6, 1, 20, po.color || '#ff6030');
      if (chance(dt * 30)) sparkle(po.x, po.y, rand(10, 60), po.color || '#ff6030', 1, 0.6);
    }
    if (this.raining) {
      this.rainT = (this.rainT || 0) + dt;
      const rate = G.touch ? 26 : 70;
      while (this.rainT >= 1 / rate) {
        this.rainT -= 1 / rate;
        const [x, y] = camera.screenToTile(rand(0, G.W), rand(-G.H * 0.1, G.H));
        spawn({ type: 'streak', x, y, z: rand(100, 180), vx: 0.35, vy: 0.1, vz: -105,
          life: 1.4, size: G.touch ? 1 : 1.25, color: '#c6dbe5' });
      }
    }
    // ambient particles around the camera
    if (!b || !b.ambient) return;
    this.ambT += dt;
    const rate = G.touch ? 10 : 22;
    while (this.ambT > 1 / rate) {
      this.ambT -= 1 / rate;
      const [tx, ty] = camera.screenToTile(rand(0, G.W), rand(-G.H * 0.1, G.H));
      const a = b.ambient, col = a.color;
      switch (a.type) {
        case 'snow': spawn({ type: 'dot', x: tx, y: ty, z: rand(80, 160), vx: rand(-0.3, 0.3), vy: rand(0.1, 0.4), vz: -rand(25, 45), life: 4, size: rand(1.2, 2.4), color: col }); break;
        case 'ember': spawn({ type: 'glow', x: tx, y: ty, z: rand(0, 30), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(15, 40), life: rand(1.5, 3), size: rand(1, 2.2), size1: 0, color: col, add: true }); break;
        case 'ash': spawn({ type: 'dot', x: tx, y: ty, z: rand(60, 140), vx: rand(-0.4, 0.1), vy: rand(0, 0.3), vz: -rand(10, 25), life: 5, size: rand(1, 2), color: col }); break;
        case 'spore': case 'mote': case 'glitter': case 'firefly':
          spawn({ type: 'glow', x: tx, y: ty, z: rand(10, 70), vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25), vz: rand(-5, 8), life: rand(2, 4), size: rand(0.8, 1.8), size1: 0.2, color: col, add: true }); break;
        case 'drip': if (chance(0.5)) spawn({ type: 'dot', x: tx, y: ty, z: 120, vz: -60, g: 200, life: 1.2, size: 1.5, color: col }); break;
        case 'bubble': spawn({ type: 'glow', x: tx, y: ty, z: 0, vz: rand(8, 20), life: rand(0.8, 1.6), size: rand(1, 2), size1: 2.5, color: col, add: true }); break;
        case 'sand': spawn({ type: 'dot', x: tx, y: ty, z: rand(5, 40), vx: rand(0.6, 1.2), vy: rand(-0.6, -0.2), life: 2.5, size: 1.2, color: col }); break;
        case 'leaf': spawn({ type: 'dot', x: tx, y: ty, z: rand(60, 120), vx: rand(-0.4, 0.4), vy: rand(0, 0.4), vz: -rand(10, 20), life: 5, size: 2, color: col }); break;
        case 'spark': if (chance(0.3)) spawn({ type: 'glow', x: tx, y: ty, z: rand(20, 80), vx: rand(-2, 2), vy: rand(-2, 2), life: 0.3, size: 1.5, color: col, add: true }); break;
        case 'wisp': smoke(tx, ty, 0, '#120c18', 1, 10); break;
        default: spawn({ type: 'dot', x: tx, y: ty, z: rand(10, 90), vx: rand(-0.1, 0.1), vy: rand(-0.1, 0.1), vz: rand(-3, 3), life: 4, size: 1, color: col });
      }
    }
  }
}

export { TAU };
