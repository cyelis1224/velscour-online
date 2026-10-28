// The powers of Heirlooms, Covenant sets and Glyphwords that fire on an event (data/relics.js POWERS procs):
// on: 'hit' (the hero's own hits), 'kill', 'cast', 'hurt' (the hero is struck). Proc hits carry o.proc so they never
// trigger procs (or ring augments) themselves. Damage is a share of the triggering hit, or of the hero's recent hits
// (p.relicDmg, a running average) for kills, casts and hurts.
import { G } from '../state.js';
import { rand, chance, TAU, dist } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { addEffect, Column, Ring, Bolt, Telegraph, burst, sparkle, smoke, elem, glowSprite } from '../gfx/vfx.js';
import { isoX, isoY } from '../core/view.js';
import { explode, Delayed } from './hazards.js';
import { hit } from './combat.js';
import { buildSummon } from './monster.js';

const PROC = { proc: true, crit: false, noArc: true };
const CAP_CD = 0.25; // seconds between two firings of the same proc (a whirlwind's hits would chain them)

/** Fire the hero's procs for event `on`. tgt: the monster hit/killed (or the attacker for 'hurt'). */
export function relicProc(p, on, tgt, dmg) {
  const list = p.st && p.st.procs;
  if (!list || !list.length || !p.world) return;
  if (on === 'hit' && dmg > 0) p.relicDmg = p.relicDmg ? p.relicDmg * 0.85 + dmg * 0.15 : dmg;
  const base = on === 'hit' ? dmg : p.relicDmg || 0;
  const now = p.world.time;
  p.procT = p.procT || {};
  for (const pr of list) {
    if (pr.on !== on) continue;
    if (pr.only === 'demon' && !(tgt && (tgt.demon || tgt.pitSpawn))) continue; // the Seal of the Pit: demons only
    const key = pr.name + pr.fx;
    if (pr.every) { p.procN = p.procN || {}; if ((p.procN[key] = (p.procN[key] || 0) + 1) % pr.every) continue; }
    else if (!chance(pr.chance)) continue;
    if (pr.fx !== 'heal' && pr.fx !== 'consecrate' && now - (p.procT[key] || -9) < CAP_CD) continue;
    p.procT[key] = now;
    fire(p, pr, tgt, base);
  }
}

function fire(p, pr, tgt, base) {
  const w = p.world, el = pr.el || 'holy', E = elem(el), amt = base * (pr.mult || 1);
  const at = tgt && !tgt.isPlayer ? tgt : null;
  switch (pr.fx) {
    case 'heal': p.heal(p.maxHp * pr.mult, true); sparkle(p.x, p.y, 30, '#80ff90', 6, 0.3); return;
    case 'pillar': if (!at) return;
      addEffect(new Column(at.x, at.y, E.glow, 1, 60, 220));
      explode(w, p, at.x, at.y, pr.r || 1.6, amt, el, { ...PROC, stun: true, sound: false }, 'eruption');
      sfx('arcane', 0.5); return;
    case 'meteor': { const t = at || nearest(p, 8); if (!t) return;
      w.addHazard(new Delayed({ world: w, src: p, x: t.x, y: t.y, r: pr.r || 1.8, delay: 0.55, fx: 'meteor', el, dmg: [amt * 0.9, amt * 1.1], o: { ...PROC }, showRing: true })); return; }
    case 'stars': { const t = at || nearest(p, 9); if (!t) return;
      for (let i = 0; i < (pr.n || 5); i++) { const a = rand(TAU), d = rand(0.4, 2.2); w.addHazard(new Delayed({ world: w, src: p, x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d, r: pr.r || 1.2, delay: 0.35 + i * 0.12, fx: 'meteor', el, dmg: [amt * 0.9, amt * 1.1], o: { ...PROC }, showRing: true })); }
      return; }
    case 'nova':
      addEffect(new Ring(p.x, p.y, 0.3, pr.r || 3, 0.45, E.glow, 5));
      explode(w, p, p.x, p.y, pr.r || 3, amt, el, { ...PROC, sound: false }, 'eruption');
      sfx(E.sfx || 'arcane', 0.5); return;
    case 'chain': { if (!at) return;
      let from = at; const hitSet = new Set([at.id]);
      for (let n = 0; n < 4; n++) {
        const next = w.hostiles(p.team, from.x, from.y, pr.r || 6).filter((m) => !m.dead && !hitSet.has(m.id)).sort((a, b) => dist(from.x, from.y, a.x, a.y) - dist(from.x, from.y, b.x, b.y))[0];
        if (!next) break;
        hitSet.add(next.id);
        addEffect(new Bolt(from.x, from.y, 30, next.x, next.y, 30, E.glow, 0.3, 3));
        hit(p, next, amt, el, { ...PROC });
        from = next;
      }
      sfx('thunder', 0.35); return; }
    case 'consecrate': if (!at) return; w.addHazard(new Consecration(w, p, at.x, at.y, pr.r || 2, Math.max(1, amt), el)); return;
    case 'void': { const t = at || nearest(p, 8); if (!t) return; // the Abyssal Edge: a rift tears open where the blow fell
      addEffect(new Ring(t.x, t.y, 0.2, pr.r || 2.2, 0.5, '#a040ff', 5)); burst(t.x, t.y, 24, el, 14, 2);
      explode(w, p, t.x, t.y, pr.r || 2.2, amt, el, { ...PROC, sound: false }, 'eruption');
      sfx('arcane', 0.5); return; }
    case 'demon': pitDemon(p); return;
  }
}

// The Crown of the Demon Lord: one Pit Demon of the Legion at the hero's side while the Crown is worn (a permanent
// summon, carried from level to level; it leaves when the Crown does, and climbs out again 20 s after it falls).
const PIT_DEMON = { name: 'Pit Demon of the Legion', look: { art: 'carmine_gorehorn', sprite: 'demon', pal: { a: '#7a1810', c: '#c03018', e: '#ffcc30' }, px: 2.8 }, ai: 'melee', hp: 0.8, dmg: 0.6, spd: 3.4, el: 'fire', atk: { type: 'melee', cd: 1 } };
export const crownWorn = (p) => Object.values(p.char.equip || {}).some((it) => it && it.relic === 'heir' && it.rid === 'crown_demon');
function pitDemon(p) {
  const w = p.world, d = p.pitDemon, sp = 1 + (p.st.summonPct || 0) / 100, dmg = Math.max(1, (p.relicDmg || 0) * PIT_DEMON.dmg * sp);
  if (d && !d.dead && d.world === w) { d.dmg = dmg; return; } // its blows follow the hero's (a share of the recent hit)
  if (w.kind === 'town' || (p.pitDemonT || 0) > w.time) return;
  p.pitDemonT = w.time + 20;
  const [x, y] = w.map.randomNear(p.x, p.y, 1.8);
  const m = buildSummon(p, PIT_DEMON, 'pit_demon', x, y, dmg, Math.max(20, p.maxHp * PIT_DEMON.hp * sp), 0);
  m.aura = '#ff4010';
  const up = m.update.bind(m);
  m.update = (dt) => { if (!crownWorn(p)) { m.dead = true; smoke(m.x, m.y, 0, '#200808', 5, 9); return; } return up(dt); };
  w.add(m); p.pitDemon = m;
  addEffect(new Telegraph({ kind: 'circle', x, y, r: 1.4, dur: 0.6, color: '#ff4010' }), 'ground');
  addEffect(new Ring(x, y, 0.2, 1.8, 0.6, '#ff3010', 4)); smoke(x, y, 0, '#200808', 5, 9);
  sfx('summon', 0.6);
}

function nearest(p, r) {
  let best = null, bd = r;
  for (const m of p.world.hostiles(p.team, p.x, p.y, r)) { const d = dist(p.x, p.y, m.x, m.y); if (!m.dead && d < bd) { bd = d; best = m; } }
  return best;
}

/** Pyre of Vows: holy ground for 4 s; foes in it burn and take 25% more damage (the 'amp' curse). */
class Consecration {
  constructor(world, src, x, y, r, dmg, el) { Object.assign(this, { world, src, x, y, r, dmg, el, t: 0, tick: 0, dur: 4, ground: true, team: 'player' }); burst(x, y, 6, el, 14, 2); }
  update(dt) {
    this.t += dt; this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.5;
      for (const m of this.world.hostiles('player', this.x, this.y, this.r)) {
        if (m.dead) continue;
        if (m.curses) { const c = m.curses.amp; if (!c || c.t < 0.8 || c.amt < 25) m.curses.amp = { t: 0.8, amt: Math.max(25, c ? c.amt : 0) }; }
        hit(this.src, m, this.dmg, this.el, { ...PROC, dot: true, silent: true });
      }
    }
    return this.t < this.dur;
  }
  draw(ctx) {
    const x = isoX(this.x, this.y), y = isoY(this.x, this.y), k = Math.min(1, (this.dur - this.t) * 2) * (0.5 + Math.sin(G.time * 6) * 0.1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
    const s = this.r * 64;
    ctx.drawImage(glowSprite(elem(this.el).glow), x - s, y - s / 2, s * 2, s);
    ctx.restore();
  }
}
