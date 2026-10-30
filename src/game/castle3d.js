// The Castle's moving parts (docs/CASTLE_3D.md): the drawbridge comes down (and the portcullis goes up) when the hero
// nears the gatehouse, and opens the crossing; doors swing open while anyone stands near them and close behind them.
// Their frames are baked by tools/castle3d.html; world/castleworld.js places them as props (`c3move`). The drawbridge
// works without its art too (the crossing opens all the same).
import { G } from '../state.js';
import { UI } from '../ui/ui.js';
import { sfx } from '../core/audio.js';

const LOWER_S = 2.6, NEAR_GATE = 11, NEAR_DOOR = 2.8;

export function castle3dTick(world, dt) {
  const map = world.map, p = world.player, D = map.drawbridge;
  if (D && !D.down) {
    if (!D.lowering && p && Math.hypot(p.x - D.x0 - 1, p.y - D.hinge) < NEAR_GATE) {
      D.lowering = true; D.t = 0;
      UI.centerMsg('THE DRAWBRIDGE', 'comes down with a rattle of chains', 2.2);
      sfx('door');
    }
    if (D.lowering) {
      D.t = Math.min(1, D.t + dt / LOWER_S);
      if (D.t >= 1) {
        D.down = true;
        // the deck's tiles come up out of the sunken moat to the ground and open: the terrain's caches start again
        for (const i of D.tiles) { map.block[i] = 0; if (map.hgt) map.hgt[i] = 0; }
        map._terr = null; map._stepMask = null; world.floorChunks?.map?.clear(); world.flowTimer = 0;
        // the deck's frames hang from the anchor's ground point, and its z cancelled the sunken tile under it
        // (world/castleworld.js); that tile is ground now, so the lift goes too or the deck floats short of the pier
        for (const o of world.props) if (o.c3move?.kind === 'drawbridge') o.z = 0;
      }
    }
  }
  const moving = world._c3moving || (world._c3moving = world.props.filter((o) => o.c3move));
  for (const o of moving) {
    const m = o.c3move;
    if (m.kind === 'drawbridge' || m.kind === 'portcullis') {
      const t = D ? (D.down ? 1 : D.lowering ? D.t : 0) : 1, ease = t * t * (3 - 2 * t);
      setFrame(o, Math.round(ease * (m.frames.length - 1)));
      continue;
    }
    // a door: open while anyone is within reach of its mouth
    let near = !!p && Math.hypot(p.x - o.x, p.y - o.y) < NEAR_DOOR;
    if (!near) for (const c of world.creatures) if (!c.dead && Math.abs(c.x - o.x) < NEAR_DOOR && Math.abs(c.y - o.y) < NEAR_DOOR) { near = true; break; }
    if (!near) for (const n of world.npcs) if (Math.abs(n.x - o.x) < NEAR_DOOR && Math.abs(n.y - o.y) < NEAR_DOOR) { near = true; break; }
    const was = m.open || 0;
    m.open = Math.max(0, Math.min(1, was + (near ? dt * 2.8 : -dt * 1.6)));
    if (was === 0 && m.open > 0 && G.time - (m.sound || -9) > 1.5) { m.sound = G.time; sfx('door'); }
    setFrame(o, Math.round(m.open * (m.frames.length - 1)));
  }
}
function setFrame(o, f) { if (o.c3move.f !== f) { o.c3move.f = f; o.spr = o.c3move.frames[f]; } }
