// Damage resolution, status effects, deaths, gore.
import { G } from '../state.js';
import { net } from '../net/network.js';
import { rand, chance, clamp, angleTo, TAU, mixHex } from '../core/util.js';
import { camera } from '../core/view.js';
import { sfx } from '../core/audio.js';
import { petCorpse } from '../core/petart.js';
import { floatText, damageText, bloodSpray, gibs, addDecal, addEffect, Bolt, elem, spawn, burst } from '../gfx/vfx.js';
import { Meter } from './dpsmeter.js';
import { explosionFx, hitSpark } from '../gfx/shapes.js';
import { GORE } from '../data/enemies.js';
import { dropLoot } from './loot.js';
import { augHit } from './augments.js';
import { classHitFx } from '../gfx/classfx.js';
import { astroOnKill } from './astronomer.js';
import { sigKill } from './signature.js';
import { armorDiv } from '../data/depth.js';
import { relicProc } from './relicprocs.js';
import { commissionKill } from './commissions.js';

const PLAYER_RES = { fire: 'fire', cold: 'cold', light: 'light', poison: 'poison', acid: 'poison' };
const LEECH_K = 2; // life/mana leech: a whole monster's life taken returns LEECH_K x leech% of the hero's own
/** Heal `who` for leeching `frac` of a hit of dmg on tgt: by the share of tgt's life it took, in `who`'s own life. */
export function leechHeal(who, tgt, dmg, frac) {
  if (who && who.heal && tgt && frac > 0) who.heal(Math.min(1, dmg / Math.max(1, tgt.maxHp)) * LEECH_K * who.maxHp * frac, true);
}

function bloodOf(c) {
  if (c.bloodColor) return c.bloodColor;
  const g = GORE[c.goreType] || GORE.flesh;
  return g.blood || (c.world && c.world.biome && c.world.biome.blood) || '#8a0b08';
}

/**
 * Apply damage. Returns damage actually dealt.
 * o: { dot, crit:false to disallow, knock, ang, burn, poison, bleed, slow, freeze, stun, fear, leech, noArc, melee, aoe, silent, bossMul }
 */
export function hit(src, tgt, amount, el = 'phys', o = {}) {
  if (!tgt || tgt.dead || tgt.invuln > 0 || amount <= 0) return 0;
  if (tgt.targetable === false && !o.force) return 0;
  const world = tgt.world || G.world;
  let dmg = amount;
  let crit = false;
  if (src && src.summon && src.partyBuff && src.partyBuff.stats.dmg) dmg *= 1 + src.partyBuff.stats.dmg / 100; // banners, party buffs
  const owner = src && src.owner ? src.owner : src;
  const fromPlayer = owner && owner.isPlayer;
  if (fromPlayer && !tgt.isPlayer && G.char && G.char.madT > 0) dmg *= 2; // MADNESS (game/mayhem.js)

  if (!o.force && !o.fromNetwork) {
    if (tgt.isPlayer) {
      const st = tgt.st;
      if (!o.dot && st.block > 0 && chance(Math.min(0.6, st.block / 100))) {
        floatText(tgt.x, tgt.y, 40, 'Blocked', '#c0c8d0', 12);
        sfx('block');
        return 0;
      }
      if (el === 'phys') {
        const lvl = (src && src.level) || G.world.depth || 1;
        dmg *= 1 - st.armor / (st.armor + armorDiv(lvl));
      }
      const rk = PLAYER_RES[el];
      const res = rk ? st.res[rk] : st.res.magic;
      dmg *= 1 - clamp(res, -100, 75) / 100;
      dmg *= 1 - clamp(st.reduce || 0, 0, 60) / 100;
      if (tgt.raidTakenMul) dmg *= tgt.raidTakenMul; // raid mechanics (game/raidsigs.js): sunder stacks
      if (src && src.curses && src.curses.weaken && src.curses.weaken.t > 0) dmg *= 1 - src.curses.weaken.amt / 100;
      if (G.godMode) dmg = 0;
      // thorns
      if (src && !src.isPlayer && !o.dot && (st.thorns > 0 || st.legendary.thorns) && !src.dead) {
        const th = st.thorns + (st.legendary.thorns ? dmg * 1.5 : 0);
        if (th > 0) hit(tgt, src, th, 'phys', { dot: true, silent: false, crit: false, noArc: true });
      }
    } else {
      // monster / summon
      let res = (tgt.res && tgt.res[el === 'astral' ? 'arcane' : el]) || 0;
      if (el === 'arcane' || el === 'astral') res *= 0.5;
      dmg *= 1 - clamp(res, -1, 0.9);
      if (el === 'holy' && (tgt.undead || tgt.demon)) dmg *= 1.5;
      const C = tgt.curses;
      if (C.amp && C.amp.t > 0) dmg *= 1 + C.amp.amt / 100;
      if (C.mark && C.mark.t > 0) dmg *= 1 + C.mark.amt / 100;
      if (tgt.status.shred && tgt.status.shred.t > 0) dmg *= 1 + tgt.status.shred.amt;
      if (tgt.ward !== undefined) dmg *= tgt.ward; // a raid boss behind its warding crystals
      if (src && src.curses && src.curses.weaken && src.curses.weaken.t > 0 && !fromPlayer) dmg *= 1 - src.curses.weaken.amt / 100;
      if (tgt.reflect && src && src.isPlayer && !o.dot && !o.force) {
        // a raid boss's riposte (game/raidsigs.js): the hero's own blow comes back (minions' don't)
        hit(tgt, owner, Math.min(dmg * 0.4, owner.maxHp * 0.08), el, { force: true, crit: false, noArc: true });
        floatText(tgt.x, tgt.y, 90, 'RIPOSTE', '#e0f0ff', 13);
        return 0;
      }
      if (fromPlayer && owner && owner.raidDmgMul) dmg *= owner.raidDmgMul;
      if (fromPlayer && owner && owner.st) {
        const st = owner.st;
        if (tgt.rank === 'boss' && st.bossDmg) dmg *= 1 + st.bossDmg / 100;
        if (src.isPlayer && !o.dot && o.crit !== false && chance(st.critChance / 100)) {
          crit = true;
          dmg *= 1 + st.critDmg / 100;
        }
      }
      if (tgt.rank === 'boss' && (o.freeze || o.stun)) { o = { ...o, freeze: false, stun: o.stun && chance(0.15) }; }
    }
    dmg = tgt.isPlayer && G.godMode ? 0 : Math.max(1, dmg * rand(0.92, 1.08));
  } else if (o.fromNetwork && o.crit) {
    crit = true;
  }
  if (tgt.vel) dmg = tgt.vel.absorb(dmg); // Velscour's life gates and damage cap (game/velscour.js)

  const byHero = !tgt.isPlayer && tgt.team !== 'player' && (fromPlayer || (src && src.team === 'player'));
  if (byHero) Meter.add(Math.min(dmg, Math.max(0, tgt.hp)));
  if (byHero && src && src.isPlayer && !o.dot) G.lastHit = tgt; // the HUD's target window
  if (byHero && src && src.isPlayer && o.sk && !o.dot) classHitFx(src, tgt, o.sk, el); // the class's own splash (gfx/classfx.js)
  tgt.hp -= dmg;
  if (G.room && byHero && !o.fromNetwork && net.connected) {
    net.sendMonsterHit(tgt.idx || 0, dmg, crit, el, tgt.x, tgt.y, tgt.netId, tgt.hp <= 0, G.world?.kind, G.world?.depth || 0);
  }
  if (tgt.isPlayer && !o.dot && src && src !== tgt && tgt.st.procs && tgt.st.procs.length) relicProc(tgt, 'hurt', src, dmg);
  tgt.flash = 0.12;
  if (tgt.onDamaged && !o.dot) tgt.onDamaged(src, dmg);
  tgt.hpShow = 3;
  if (!tgt.isPlayer && !o.dot) tgt.awake = true;
  if (!tgt.isPlayer && src && !src.dead && src.team !== tgt.team) tgt.aggro = src;

  // ---- feedback
  if (!o.silent) {
    const z = clamp((tgt.artH || tgt.spriteH || 40) * (tgt.scale || 1) * 0.85, 26, 150) + (tgt.fly ? 18 : 0);
    if (tgt.isPlayer) {
      damageText(tgt.x, tgt.y, z, dmg, o.dot ? 'dot' : 'hurt', '#ff4030');
      if (!o.dot) { sfx('hurt'); G.hurtFlash = Math.min(0.5, (G.hurtFlash || 0) + dmg / tgt.maxHp * 2); camera.shake(Math.min(8, 2 + (dmg / tgt.maxHp) * 30)); }
    } else if (byHero) {
      damageText(tgt.x, tgt.y, z, dmg, crit ? 'crit' : o.dot ? 'dot' : 'hit', elem(el).glow);
    }
  }
  if (!o.dot || chance(0.15)) {
    const ang = o.ang ?? (src ? angleTo(src.x, src.y, tgt.x, tgt.y) : rand(TAU));
    const force = clamp(dmg / tgt.maxHp, 0.05, 1);
    if (!(tgt.goreType === 'spark' || tgt.goreType === 'ecto') || chance(0.5)) bloodSpray(tgt.x, tgt.y, 28, ang, Math.round(4 + force * 18), bloodOf(tgt), 0.7 + force);
    if (!o.dot) hitSpark(tgt.x, tgt.y, 28, el);
    if (!o.dot && !o.silent) sfx(crit ? 'crit' : 'hit', 0.5);
    if (crit && dmg > tgt.maxHp * 0.3) G.hitStop = Math.max(G.hitStop, 0.035);
  }

  // ---- status effects
  if (!o.dot && !tgt.dead) applyStatus(src, tgt, dmg, el, o);

  // ---- leech: by the share of the target's life the hit took (LEECH_K of the hero's own life a whole life's worth),
  // not raw damage, which runs far ahead of hero life (it healed whole life bars a hit)
  if (fromPlayer && src.isPlayer && !tgt.isPlayer) {
    const st = src.st, share = Math.min(1, dmg / Math.max(1, tgt.maxHp)) * LEECH_K;
    const ls = (st.lifeSteal + (o.leech ? 4 : 0) + (el === 'shadow' ? 2 : 0) + (el === 'blood' ? 3 : 0)) / 100;
    if (ls > 0) src.heal(share * src.maxHp * ls * (o.dot ? 0.3 : 1), true);
    if (st.manaSteal > 0) src.mana = Math.min(src.maxMana, src.mana + share * src.maxMana * st.manaSteal / 100);
    if (tgt.curses.leech && tgt.curses.leech.t > 0) src.heal(share * src.maxHp * tgt.curses.leech.amt / 100 * 0.3, true);
    src.onHit && src.onHit(tgt, dmg, el, o);
  } else if (src && src.summon && src.leech && src.owner) {
    leechHeal(src.owner, tgt, dmg, src.leech * 0.2);
  }
  // ring augments ride on skill hits (o.aug) and on the hits of a skill's minions; the skill earns mastery for kills
  if (byHero && !o.proc) {
    const sk = o.sk || (src && src.summon && src.skillId);
    if (sk) tgt.lastSk = sk;
    const aug = o.aug || (src && src.summon && src.aug);
    if (aug && owner && owner.isPlayer) augHit(src, owner, tgt, dmg, el, o.aug ? o : { aug, sk });
  } else if (byHero && o.sk) tgt.lastSk = o.sk;
  if (tgt.curses.thorns && tgt.curses.thorns.t > 0 && tgt.isPlayer === false && src && src.team === 'player') { /* handled when monster attacks */ }

  if (tgt.hp <= 0) kill(tgt, src, { el, overkill: -tgt.hp / tgt.maxHp, crit, aoe: o.aoe, sig: o.sig });
  return dmg;
}

function applyStatus(src, tgt, dmg, el, o) {
  const s = tgt.status;
  const boss = tgt.rank === 'boss';
  const leg = src && src.isPlayer ? src.st.legendary : {};
  if (el === 'fire' && (o.burn || chance(0.25))) s.burn = { t: 3, dps: Math.max(s.burn && s.burn.t > 0 ? s.burn.dps : 0, dmg * (o.burn ? 0.35 : 0.2)), src };
  if (el === 'poison' || o.poison) s.poison = { t: 3.5, dps: Math.max(s.poison && s.poison.t > 0 ? s.poison.dps : 0, dmg * (o.poison ? 0.45 : 0.3)), src };
  if (el === 'blood' || o.bleed) s.bleed = { t: 3, dps: Math.max(s.bleed && s.bleed.t > 0 ? s.bleed.dps : 0, dmg * 0.3), src };
  if (el === 'cold' || o.slow || leg.frostbite) s.chill = { t: 2.2, amt: o.slow ? 0.45 : 0.3 };
  if ((o.freeze && chance(boss ? 0 : 0.35)) || (leg.frostbite && chance(0.1) && !boss)) s.freeze = { t: tgt.isPlayer ? 0.8 : 1.4 };
  if (o.stun && (!boss || chance(0.15))) s.stun = { t: tgt.isPlayer ? 0.5 : 1.1 };
  if (o.fear && !boss) s.fear = { t: 2.5 };
  if (el === 'acid') { s.shred = { t: 3, amt: 0.15 }; s.slow = { t: 2, amt: 0.15 }; }
  if (o.curse && !tgt.isPlayer) for (const c of o.curse) tgt.curses[c] = { t: 5, amt: 25, src };
  if (o.knock && !tgt.static && !boss) {
    const a = o.ang ?? (src ? angleTo(src.x, src.y, tgt.x, tgt.y) : 0);
    const k = (o.knock === true ? 1 : o.knock) * 7 * (tgt.isPlayer ? 0.4 : 1) / Math.max(0.6, tgt.r / 0.35);
    tgt.kbx += Math.cos(a) * k; tgt.kby += Math.sin(a) * k;
  }
  if (o.pull && src && !tgt.static && !boss) {
    const a = angleTo(tgt.x, tgt.y, src.x, src.y);
    tgt.kbx += Math.cos(a) * 9; tgt.kby += Math.sin(a) * 9;
  }
  // lightning arcs to a nearby enemy
  if (el === 'light' && !o.noArc && chance(0.22)) {
    const w = tgt.world;
    if (w) {
      const team = src ? src.team : 'player';
      const n = w.hostiles(team, tgt.x, tgt.y, 3.5).filter((c) => c !== tgt)[0];
      if (n) {
        addEffect(new Bolt(tgt.x, tgt.y, 28, n.x, n.y, 28, '#a8ccff', 0.18, 2));
        hit(src, n, dmg * 0.35, 'light', { noArc: true, silent: false, crit: false });
      }
    }
  }
  if (src && src.isPlayer && leg.thunder && !o.noArc && chance(0.12)) {
    addEffect(new Bolt(tgt.x - 0.3, tgt.y - 0.3, 260, tgt.x, tgt.y, 0, '#c0d8ff', 0.25, 3));
    hit(src, tgt, dmg * 0.6, 'light', { noArc: true, crit: false });
  }
}

/** Damage all hostiles of `team` in radius. */
export function aoe(world, src, x, y, r, amount, el, o = {}) {
  const team = o.team || (src ? src.team : 'player');
  const targets = world.hostiles(team, x, y, r);
  let n = 0;
  for (const t of targets) {
    if (o.exclude && o.exclude.has(t.id)) continue;
    if (o.exclude) o.exclude.add(t.id);
    hit(src, t, amount * (o.falloff ? 1 - 0.4 * Math.hypot(t.x - x, t.y - y) / (r + 0.01) : 1), el, { ...o, aoe: true, ang: angleTo(x, y, t.x, t.y) });
    n++;
  }
  return n;
}

export function kill(tgt, src, info = {}) {
  if (tgt.dead) return;
  if (tgt.isPlayer) { tgt.hp = 0; tgt.die(src); return; }
  tgt.dead = true;
  tgt.hp = 0;
  const world = tgt.world;
  const owner = src && src.owner ? src.owner : src;
  const byPlayer = owner && (owner.isPlayer || owner.team === 'player');
  if (tgt.onDeath) tgt.onDeath(src);
  if (tgt.summon) {
    burst(tgt.x, tgt.y, 20, tgt.el || 'arcane', 10, 2);
    const fell = world && petCorpse(tgt); // its dead pose stays down a moment
    if (fell) world.fallen.push(fell);
    return;
  }
  if (src && src.summon && !src.dead) src.cheerT = 1; // a pet that lands the killing blow cheers
  // gore
  const gore = GORE[tgt.goreType] || GORE.flesh;
  const blood = bloodOf(tgt);
  const big = tgt.r > 0.45 || tgt.rank === 'boss';
  const overkill = info.overkill > 0.5 || info.aoe && info.overkill > 0.25 || (info.crit && info.overkill > 0.3);
  const goreMul = G.settings.gore === 2 ? 1.4 : 1;
  if (G.settings.gore > 0) {
    bloodSpray(tgt.x, tgt.y, 26, src ? angleTo(src.x, src.y, tgt.x, tgt.y) : rand(TAU), Math.round((big ? 40 : 22) * goreMul), blood, big ? 1.6 : 1.2);
    if (overkill || big || chance(0.35)) {
      gibs(tgt.x, tgt.y, 16, Math.round((overkill ? 14 : 6) * (big ? 1.8 : 1)), gore.gib || shade3(blood), gore.bones ? '#e8dcc0' : '#d8ccb0', overkill ? 1.4 : 1, gibSets(tgt));
    }
    if (gore.blood !== '#ffcc40') addDecal(tgt.x, tgt.y, blood, (big ? 1.1 : 0.7) * rand(0.8, 1.2), 'pool', 0.92);
  }
  sfx(gore.bones ? 'bones' : overkill ? 'gore' : 'squish', 0.8);
  if (!overkill && tgt.sprite && world && world.corpses) world.corpses.push({ x: tgt.x, y: tgt.y, sprite: tgt.sprite, pal: tgt.pal, art: tgt.art, swap: tgt.swap, artH: tgt.artH, px: tgt.px, scale: tgt.scale, flip: tgt.flip, t: 0, maxHp: tgt.maxHp, arch: tgt.arch, level: tgt.level, fly: tgt.fly });
  // elite death affix
  if (tgt.affixes && tgt.affixes.includes('fiery')) {
    explosionFx(tgt.x, tgt.y, 1.6, 'fire', 'explosion');
    if (world.player && Math.hypot(world.player.x - tgt.x, world.player.y - tgt.y) < 1.8) hit(tgt, world.player, tgt.dmg * 1.5, 'fire', {});
  }
  if (tgt.split && tgt.scale > 0.6 && tgt.spawnChild) { tgt.spawnChild(); tgt.spawnChild(); }
  if (byPlayer && world) {
    world.kills++;
    const p = G.player;
    if (p) {
      if (tgt.team === 'enemy') { p.gainXp(tgt.xp || 0); if (tgt.lastSk) p.gainMastery(tgt.lastSk, tgt.xp || 0); }
      p.char.kills = (p.char.kills || 0) + 1;
      const leg = p.st.legendary;
      if (leg.bloodbath) {
        explosionFx(tgt.x, tgt.y, 1.4, 'blood', 'explosion', { sound: false });
        aoe(world, p, tgt.x, tgt.y, 1.6, tgt.maxHp * 0.35, 'blood', { dot: true, crit: false });
      }
      if (leg.vamp) p.heal(p.maxHp * 0.02, true);
      if (p.st.procs && p.st.procs.length && !info.proc) relicProc(p, 'kill', tgt, 0);
      if (p.chart && tgt.team === 'enemy') astroOnKill(p, tgt); // the fallen may become a star on the Astronomer's chart
      if (p.sig && !info.sig) sigKill(p, tgt, src); // the class signature (game/signature.js); its own kills never feed it
    }
    if (tgt.team === 'enemy') { dropLoot(world, tgt); commissionKill(world, tgt); }
    if (world.onKill) world.onKill(tgt); // streaks, challenges (game/happenings.js)
  }
  if (tgt.rank === 'boss' && world) {
    for (const c of world.creatures) if (c.summon && !c.dead) c.cheerT = 2.5;
    if (world.onBossKilled) world.onBossKilled(tgt);
  }
}

/** Which gib-sprite sets a corpse bursts into (null: plain rects for rock, spark, ecto). */
const BUG = new Set(['spider', 'scorpion', 'beetle', 'worm']);
function gibSets(c) {
  const g = c.goreType || 'flesh', a = c.arch;
  if (g === 'bone') return ['bone'];
  if (a === 'eye') return ['eye', 'demon'];
  if (BUG.has(a)) return ['bug'];
  if (g === 'goo') return ['bug', 'eye'];
  if (g !== 'flesh') return null;
  if (c.demon || a === 'imp' || a === 'demon' || a === 'velscour') return ['demon', 'flesh'];
  if (a === 'bat' || a === 'hound') return ['flesh', 'bug'];
  return ['flesh', 'limb'];
}

/** Gib colour: blood tinted toward raw meat so chunks read as flesh, not confetti. */
function shade3(c) { return mixHex(c, '#5a1410', 0.55); }

/** Lightning/spirit chain from a source point through up to n targets. */
export function chainHit(world, src, x0, y0, first, n, dmg, el, color, o = {}) {
  const hitSet = new Set();
  let cur = first, px = x0, py = y0, pz = 30;
  for (let i = 0; i <= n && cur; i++) {
    hitSet.add(cur.id);
    addEffect(new Bolt(px, py, pz, cur.x, cur.y, 28, color, 0.22, 2.5));
    hit(src, cur, dmg, el, { ...o, noArc: true });
    px = cur.x; py = cur.y; pz = 28;
    const team = src ? src.team : 'player';
    let best = null, bd = 6 * 6;
    for (const c of world.hostiles(team, cur.x, cur.y, 6)) {
      if (hitSet.has(c.id)) continue;
      const d = (c.x - cur.x) ** 2 + (c.y - cur.y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    cur = best;
  }
}

export { spawn };
