// Auto-play: an AI that plays the hero. It spends skill and attribute points, keeps the skill bar sorted, fights
// with every skill on the bar (dodging telegraphed attacks, kiting with ranged builds, drinking potions), loots,
// equips upgrades and sockets gems, then shops in town (sell, potions, gear, gems, sockets, upgrades, enchants,
// gambling) and keeps delving. Toggled by the HUD's Auto button or P. Gear, stats and skills are judged by
// simulation: apply the change, recompute the hero, score the result with charScore(), undo.
import { G } from '../state.js';
import { input } from '../core/input.js';
import { sfx } from '../core/audio.js';
import { dist, clamp, TAU, fmtInt, escapeHtml, angleDiff, angleTo } from '../core/util.js';
import { MEASURE, NOTES, beatsOf } from '../data/notation.js';
import { bardNoteFor, bardFitGain, bardPerforming } from './bard.js';
import { SKILLS, CLASS_SKILLS, MAX_SKILL_LEVEL, manaCost, rageCost, cooldown, useTime, skillRange, spearBarrageAreas, buffAmount, curseAmount, skillDuration, effLevel, ricochetCount } from '../data/skills.js';
import { SUMMONS } from '../data/summons.js';
import { SLOTS, RING_SLOTS, itemValue, itemName, itemColor, upgradeCost, socketCost, enchantCost, unsocketCost, addAffix, makeGem, RARITY, POTION_PRICE, GEMS, powerLevel } from '../data/items.js';
import { depthLevel, armorDiv } from '../data/depth.js';
import { breachLevel } from '../data/breach.js';
import { riftLevel } from '../data/rifts.js';
import { riftOpen } from './rifts.js';
import { endgameUnlocked } from './endgame.js';
import { heresyAllows } from './heresies.js';
import { marksFree, autoSpend } from './marks.js';
import { drawBiome } from '../data/biomes.js';
import { augHits } from '../data/rings.js';
import { canLearn } from '../ui/skills.js';
import { equipFromBag, socketGem, dropFromBag, changed } from '../ui/inventory.js';
import { GLYPHWORDS, glyphOf } from '../data/relics.js';
import { Vendor, fuseAll } from '../ui/vendor.js';
import { Stash, addToStash } from '../ui/stash.js';
import { activeFilter, filterPasses, filterKeeps } from './lootfilter.js';
import { addToBag } from './player.js';
import { Delayed, Area, Whirl } from './hazards.js';
import { bountyGoal } from './wanderers.js';
import { heroVisit } from './townlife.js';
import { homunculusChat, isHomunculus } from './homunculus.js';
import { effects, Telegraph } from '../gfx/vfx.js';
import { BAR_SIZE, LMB, RMB, FILL_ORDER, SLOT_KEYS, freeSlot } from '../data/bar.js';

const OFFENSIVE = new Set(['melee', 'proj', 'nova', 'aoe', 'beam', 'chain', 'wall', 'zone', 'orbit', 'cyclone', 'whirl', 'leap', 'dash', 'trap', 'rain', 'strike', 'fissure', 'corpse']);
const CROWD = 2.2; // enemies a typical cast is expected to reach, for planning
const CC = new Set(['fear', 'freeze', 'confuse', 'charm', 'stun']);
const POT_TARGET = { hp: 16, mp: 8, rejuv: 4, fury: 2 };
// The player's stance dial (HUD, saved as c.stance): how hard auto-play presses in. bold: added to boldness();
// low: life share below which it turns timid; pot/potBoss: life share for a healing potion; retreat: life share for
// running to town with nothing left to heal; farm: levels over the monsters before it stops clearing whole maps;
// lim: how far (tiles) it detours for monsters on the way to the guardian. Kiting (ranged builds step back between
// casts): kiteNear: a melee foe this close (tiles past its reach) sends it back; kiteCrowd: this many foes within
// 2.2 tiles; kiteHp: below this life share any foe beside it. backoff: melee builds below this life share step out
// of the crowd while a potion works (or with none left). stand: the share of a ranged skill's reach it fights from.
export const STANCES = {
  cautious: { name: 'Cautious', bold: -0.35, low: 0.65, pot: 0.7, potBoss: 0.8, retreat: 0.4, farm: 3, lim: 18, kiteNear: 2.6, kiteCrowd: 2, kiteHp: 0.75, backoff: 0.55, stand: 1.1 },
  balanced: { name: 'Balanced', bold: 0, low: 0.45, pot: 0.5, potBoss: 0.6, retreat: 0.22, farm: 1, lim: 12, kiteNear: 0.8, kiteCrowd: 3, kiteHp: 0.5, backoff: 0.35, stand: 1 },
  reckless: { name: 'Reckless', bold: 0.45, low: 0.25, pot: 0.3, potBoss: 0.4, retreat: 0.1, farm: -2, lim: 6, kiteNear: -1, kiteCrowd: 7, kiteHp: 0.22, backoff: 0, stand: 0.55 },
};
export const stanceOf = (c = G.char) => STANCES[c && c.stance] || STANCES.balanced;
/** Seconds the Standard/Breach menu waits for a choice before auto-play keeps its last one. */
const DEST_WAIT = 8;
/** Fewer free bag slots than this sends auto-play back to town (where a bag with none free after trading keeps it: bagWait). */
const BAG_LOW = 14;
const ROYAL_ORDER = ['king', 'queen', 'dowager queen', 'prince', 'princess', 'royal heir', 'duke', 'duchess']; // who auto-play greets first in town

// ================================================================== power model
const isWide = (sk) => (sk.m.arc ?? (sk.m.cleave ? 170 : sk.fx === 'spin' ? 360 : 115)) >= 170;
/** Expected hits per cast against `crowd` enemies near the target (very rough, per skill kind). */
function hitsPerCast(sk, crowd, L = 1) {
  const m = sk.m, n = m.n || 1, extra = Math.max(0, crowd - 1);
  if (m.ricochet) return Math.min(ricochetCount(sk, L), crowd) + 0.75 * Math.min(crowd, 2.2); // Shield Throw: its strikes, then the blast
  switch (sk.kind) {
    case 'melee': return n * (isWide(sk) ? Math.min(crowd, 2.4) : 1.1) * (m.exp ? 1 + extra * 0.4 : 1) * (m.chain ? 1 + Math.min(m.chain, extra + 1) * 0.4 : 1);
    case 'proj': {
      let h = m.ring ? Math.max(1, n * 0.18 * crowd) : n > 1 ? 1 + (Math.min(n, crowd * 1.5) - 1) * 0.5 : 1;
      if (m.pierce) h *= 1 + extra * 0.35;
      if (m.exp) h *= 1 + extra * 0.45;
      if (m.bounce) h *= 1 + Math.min(m.bounce, extra + 1) * 0.5;
      if (m.chain) h *= 1 + Math.min(m.chain, extra + 1) * 0.5;
      if (m.split) h *= 1.25;
      if (m.ret) h *= 1.4; // a boomerang cuts the pack again on its way home
      return h;
    }
    case 'nova': return (m.n || 1) * crowd * 0.9;
    case 'aoe': return m.barrage ? crowd * (m.barrage === 3 ? 1.6 : 1) : m.n && m.dur ? m.n * 0.5 * crowd * 0.8 : m.dur ? (m.dur / 0.3) * 0.4 * crowd * 0.7 : crowd;
    case 'beam': return m.dur ? (m.dur / 0.13) * 0.32 * Math.min(crowd, 1.6) : 1 + extra * 0.4;
    case 'chain': return 1 + Math.min(m.n || 4, extra + 2) * 0.6;
    case 'wall': return m.block ? 0.4 : m.ring ? 2 * crowd : 1.2 * crowd; // monsters walk through a wall, or are kept out by it
    case 'zone': return (Math.min(m.dur || 5, 3) / 0.5) * (m.follow ? 0.45 : 0.35) * crowd;
    case 'orbit': return (m.n || 3) * (m.dur || 4) * 0.35 * Math.min(crowd, 2);
    case 'cyclone': return n * ((m.dur || 3.5) / 0.25) * 0.12 * crowd;
    case 'whirl': return ((m.dur || 2) / 0.22) * 0.6 * Math.min(crowd, 2.5);
    case 'leap': return crowd;
    case 'dash': return n * Math.min(crowd, 2);
    case 'blink': return m.nova ? crowd * 0.8 : 0;
    case 'trap': return n * Math.min(crowd, 2) * 0.6;
    case 'rain': return n * 0.3 * Math.min(crowd, 2.5);
    case 'strike': return n * 0.9;
    case 'fissure': return n * 1.1 * Math.min(crowd, 2);
    case 'corpse': return (m.n || 3) * 0.8;
  }
  return 0;
}
/** Seconds the hero is busy casting it (channels and whirls last their whole duration). */
function castTime(p, sk) {
  const spd = sk.attack ? p.st.atkSpeed : p.st.castSpeed;
  let t = useTime(sk) / (1 + spd / 100);
  if ((sk.kind === 'beam' && sk.m.dur) || sk.kind === 'whirl') t = Math.max(t, sk.m.dur || 2);
  return t;
}
/** How far a skill really reaches (skillRange already halves a returning projectile's). */
const reachOf = (sk) => skillRange(sk) * (sk.kind === 'proj' && sk.m.ret ? 0.96 : 1);
/** How close the hero should stand to use a skill on target t. bold (0..1, Auto.boldness): ranged builds close in. */
function engageRange(sk, t, bold = 0) {
  if (!sk) return 1.5;
  switch (sk.kind) {
    case 'melee': return skillRange(sk) + t.r;
    case 'whirl': case 'nova': return 2;
    case 'orbit': return sk.m.shields ? 1.1 : 2;
    case 'zone': return sk.m.follow ? 1.8 : 7;
    case 'wall': return sk.m.ring ? 2 : 6;
    case 'leap': case 'dash': return Math.min(skillRange(sk), 5);
  }
  const r = reachOf(sk);
  return Math.max(Math.min(r * 0.8, 2.6), Math.min(r * (0.8 - 0.4 * bold), 8 - 2.5 * bold));
}
const cdOf = (p, sk) => cooldown(sk) * (1 - p.st.cdr / 100);
const avg = (d) => (d[0] + d[1]) / 2;
const critMul = (p) => 1 + (p.st.critChance / 100) * (p.st.critDmg / 100);
const summonMax = (sk) => sk.m.max || sk.m.n || 1;

// ================================================================== build focus
// How the user wants some classes played on auto-play. Pet classes raise as many minions as they can (every summon
// skill that fits under the minion cap, kept up at all times); the Paladin builds around his hammers: Blessed Hammer
// and Hammerstorm (hammers spiralling out around him) as the main attack, Wheel of Hammers (six hammers circling him)
// fired whenever it is ready, and Hammer of the Gods, with Shield Throw (his 3D shield ricocheting through the pack)
// beside them. Only skill spending and the bar use it (focus = true); the HUD's DPS and gear choices (charScore) stay
// unbiased.
export const PET_CLASSES = new Set(['necromancer', 'totem_master', 'carrion_witch', 'slime_lord', 'ranger', 'gunner']);
const PET_CAP = 40; // createSummon keeps at most 40 minions per hero; more would only kill the oldest
const isHammer = (sk) => sk.fx === 'hammer' || /hammer/i.test(sk.name) || !!sk.m.ricochet; // and Shield Throw
const petsOf = (sk) => (sk.m.sum === 'revive' ? 0 : summonMax(sk));
/** Skills a class pours its points into first, when it can (the Paladin's hammers), or null. */
const focusSkills = (classId) => {
  const list = CLASS_SKILLS[classId];
  if (classId === 'paladin') return list.filter(isHammer);
  if (classId === 'barbarian') return list.filter((sk) => sk.kind === 'whirl' || sk.kind === 'leap' || sk.kind === 'dash' || sk.name === 'Earthquake');
  if (classId === 'lancer') return list.filter((sk) => sk.m.shields || sk.kind === 'leap' || sk.kind === 'dash');
  if (classId === 'dragoon') return list.filter((sk) => sk.kind === 'leap' || sk.kind === 'dash' || sk.m.barrage || sk.m.weave);
  return null;
};
const mobility = (sk) => ['leap', 'dash', 'blink'].includes(sk.kind) ||
  (sk.kind === 'buff' && (sk.m.buff || []).includes('speed'));
/** The Paladin's Shield Throw stands beside his hammers: its prerequisites are learned as its level gate nears (so it
 *  opens with Hammerstorm at 12), then it stays within two ranks of his best swirling hammer. The point it wants, or null. */
function shieldStep(c, focus) {
  const st = focus.find((sk) => sk.m.ricochet);
  if (!st) return null;
  let step = null;
  if (!(c.skills[st.id] > 0)) {
    if (st.reqLevel - c.level > 2) return null;
    step = st;
    while (step.prereq && !(c.skills[step.prereq] > 0)) step = SKILLS[step.prereq];
  } else {
    const top = Math.max(0, ...focus.filter((sk) => sk.kind === 'orbit' && cooldown(sk) < 1.2).map((sk) => c.skills[sk.id] || 0));
    if (c.skills[st.id] + 2 < top) step = st;
  }
  return step && !canLearn(step) ? step : null;
}
/** Value multiplier for a skill under the class's build focus. */
function focusMul(classId, sk) {
  if (classId === 'paladin') return isHammer(sk) ? (sk.kind === 'orbit' || sk.m.ricochet ? 4 : 2.5) : 1; // hammers and Shield Throw
  if (classId === 'barbarian') return sk.kind === 'whirl' ? 6 : mobility(sk) ? 1.8 : 1;
  if (classId === 'lancer') return sk.m.shields ? 5 : mobility(sk) ? 1.8 : 1;
  if (classId === 'dragoon') return sk.m.barrage ? 5 : sk.kind === 'leap' ? 5 : sk.m.weave ? 2.5 : mobility(sk) ? 1.8 : 1;
  if (PET_CLASSES.has(classId) && sk.kind === 'summon') return sk.m.dur ? 2.5 : 4;
  if (classId === 'bard') return sk.m.dacapo ? 2 : sk.kind === 'proj' || sk.kind === 'orbit' || sk.kind === 'rain' ? 1.5 : 1; // notes in the air
  if (classId === 'arcane_sorcerer') return sk.m.astro ? 2.5 : sk.fx === 'starmissile' ? 1.5 : 1; // the Astronomer: falling suns, black holes, star swarms
  return 1;
}

/** Damage per second one skill adds when used as often as its cast time, cooldown and mana allow. */
function skillDps(p, sk, L, crowd = CROWD) {
  const per = avg(p.skillDamage(sk, L)) * hitsPerCast(sk, crowd, L) * critMul(p);
  const period = Math.max(castTime(p, sk), cdOf(p, sk), 0.05);
  const cost = manaCost(sk, L), rage = rageCost(sk);
  const supply = p.st.manaRegen + p.maxMana / 40;
  const sustain = cost ? Math.min(1, supply / (cost / period)) :
    rage ? Math.min(1, 12 / (rage / period)) : 1;
  return { dps: per / period, sustain, period };
}

/**
 * The hero's damage output with the current skills and gear: the best spammable skill (topped up by the free skill
 * when mana runs dry), plus every cooldown skill, minion, buff and curse that fits on the 15-slot bar.
 * Returns { total, parts:[{sk, v, role}] } with parts sorted by value. `only` (a Set of skill ids) limits it to those.
 */
export function buildPower(p, crowd = CROWD, only = null, focus = false) {
  const c = p.char;
  const fm = (sk) => (focus ? focusMul(c.classId, sk) : 1);
  const learned = CLASS_SKILLS[c.classId].filter((s) => (c.skills[s.id] || 0) > 0 && (!only || only.has(s.id)));
  const spam = [], parts = [];
  for (const sk of learned) {
    if (!OFFENSIVE.has(sk.kind) || sk.kind === 'corpse') continue;
    const L = effLevel(p, sk);
    const r = skillDps(p, sk, L, crowd);
    if (cooldown(sk) >= 1.2) parts.push({ sk, v: r.dps * r.sustain * 0.85 * fm(sk), role: 'cd' });
    else spam.push({ sk, v: r.dps * fm(sk), sustain: r.sustain });
  }
  spam.sort((a, b) => b.v * b.sustain - a.v * a.sustain);
  let base = 0;
  if (spam.length) {
    const best = spam[0];
    const free = spam.filter((s) => !manaCost(s.sk, 1)).sort((a, b) => b.v - a.v)[0];
    base = best.v * best.sustain + (best.sustain < 1 && free && free !== best ? (1 - best.sustain) * free.v : 0);
    parts.push({ sk: best.sk, v: base, role: 'main' });
    if (spam[1]) parts.push({ sk: spam[1].sk, v: spam[1].v * spam[1].sustain * 0.15, role: 'alt' });
    if (best.sustain < 1 && free && free !== best && free !== spam[1]) parts.push({ sk: free.sk, v: 0.01, role: 'filler' });
  }
  const ref = Math.max(base, 1);
  for (const sk of learned) {
    const L = effLevel(p, sk), m = sk.m;
    if (sk.kind === 'corpse') parts.push({ sk, v: skillDps(p, sk, L, crowd).dps * 0.35, role: 'cd' });
    else if (sk.kind === 'summon') {
      const def = SUMMONS[m.sum] || { dmg: 1, atk: { cd: 1 } };
      const n = m.sum === 'revive' ? (m.n || 1) * 0.5 : summonMax(sk);
      const up = m.dur ? Math.min(1, m.dur / Math.max(m.dur, cooldown(sk) * (1 - p.st.cdr / 100), 1)) : 1;
      const one = avg(p.skillDamage(sk, L)) * (def.dmg || 1) * (1 + (p.st.summonPct || 0) / 100) / ((def.atk && def.atk.cd) || 1);
      // under a pet focus every extra minion counts on its own too
      const pets = focus && PET_CLASSES.has(c.classId) ? ref * 0.12 * petsOf(sk) * up : 0;
      parts.push({ sk, v: (one * n * up * 0.55 + ref * 0.05) * fm(sk) + pets, role: 'summon' });
    } else if (sk.kind === 'buff') {
      const amt = buffAmount(sk, L) / 100, dur = skillDuration(sk, L);
      const up = Math.min(1, dur / Math.max(dur, cooldown(sk) * (1 - p.st.cdr / 100)));
      let v = 0;
      for (const b of m.buff || ['dmg']) v += (b === 'dmg' || b === 'as') ? amt : b === 'crit' ? amt * 0.15 : amt * 0.25;
      if (m.pulse) v += avg(p.skillDamage(sk, L)) * crowd / ref;
      parts.push({ sk, v: ref * v * up * (m.party ? 1.1 : 1), role: 'buff' });
    } else if (sk.kind === 'curse') {
      const amt = curseAmount(sk, L) / 100;
      let v = 0;
      for (const k of m.curse || ['amp']) v += k === 'amp' || k === 'mark' ? amt * 0.6 : ['decay', 'bomb', 'doom'].includes(k) ? avg(p.skillDamage(sk, L)) * crowd * 0.15 / ref : 0.06;
      parts.push({ sk, v: ref * v, role: 'curse' });
    } else if (sk.kind === 'heal') {
      parts.push({ sk, v: ref * 0.12 * ((m.amt || 20) / 20) * (1 + 0.04 * (L - 1)), role: 'heal' });
    } else if (sk.kind === 'blink') {
      parts.push({ sk, v: ref * 0.04 + (m.nova ? skillDps(p, sk, L, crowd).dps * 0.3 : 0), role: 'move' });
    }
  }
  parts.sort((a, b) => b.v - a.v);
  if (focus && PET_CLASSES.has(c.classId)) { // summons past the minion cap would only replace each other
    let pets = 0;
    for (const x of parts) if (x.role === 'summon') { pets += petsOf(x.sk); if (pets > PET_CAP) x.v *= 0.05; }
    parts.sort((a, b) => b.v - a.v);
  }
  const kept = parts.slice(0, BAR_SIZE);
  return { total: kept.reduce((a, x) => a + x.v, 0), parts: kept };
}

const DAMAGE_ROLES = new Set(['main', 'alt', 'cd', 'summon']);
/**
 * The HUD's sheet numbers. dps: what the skill bar deals to one target per second at the current stats (crits,
 * attack/cast speed, cooldowns, mana and minions included). atk: the average hit of the main attack, crits included.
 */
export function heroDamage(p) {
  const bar = p.char.bar.filter((id) => id && SKILLS[id]);
  const { parts } = buildPower(p, 1, new Set(bar));
  const dps = parts.reduce((a, x) => a + (DAMAGE_ROLES.has(x.role) ? x.v : 0), 0);
  const lmb = SKILLS[p.char.bar[0]];
  const main = lmb && OFFENSIVE.has(lmb.kind) ? lmb : (parts.find((x) => x.role === 'main') || {}).sk || SKILLS[`${p.classId}.0.0`];
  const atk = main ? avg(p.skillDamage(main, Math.max(1, effLevel(p, main)))) * critMul(p) : 0;
  return { dps, atk };
}

/** One number for "how strong is the hero": log offense + log effective life + a little utility. */
export function charScore(p) {
  // armor is weighed against the monsters' level (as combat does), not the hero's: a level 420 hero at depth 500 meets
  // level 260 monsters, and the hero's level made every point of armor look worthless
  const st = p.st, lvl = Math.max(1, depthLevel((G.char && G.char.depth) || 1));
  const off = buildPower(p, CROWD, null, true).total; // attributes and gear follow the build focus too
  const armK = st.armor / (st.armor + armorDiv(lvl));
  const res = ['fire', 'cold', 'light', 'poison'].reduce((a, k) => a + clamp(st.res[k], -100, 75), 0) / 4 / 100;
  const taken = (1 - armK) * 0.5 + (1 - res) * 0.4 + (1 - clamp(st.res.magic, -100, 75) / 100) * 0.1;
  const ehp = (p.maxHp / Math.max(0.1, taken) / (1 - Math.min(0.6, st.block / 100)) / (1 - Math.min(0.6, (st.reduce || 0) / 100))) * (1 + Math.min(st.lifeSteal, 15) * 0.03) + st.lifeRegen * 10;
  return Math.log(off + 1) + 0.8 * Math.log(ehp + 1) + 0.15 * Math.log(p.maxMana + 10) + augScore(p)
    + st.moveSpeed * 0.003 + st.magicFind * 0.0008 + st.goldFind * 0.0003 + st.xpPct * 0.002;
}

/** What the ring augments on the bar's skills are worth (they change how skills play, so buildPower can't see them). */
function augScore(p) {
  if (!p.augs || !p.augs.length) return 0;
  const bar = p.char.bar.filter(Boolean).map((id) => SKILLS[id]).filter(Boolean);
  let v = 0;
  for (const a of p.augs) { const n = bar.filter((sk) => augHits(a, sk)).length; if (n) v += a.pow * (0.12 + 0.03 * Math.min(4, n - 1)); }
  return v;
}
/**
 * The gems `it` would carry if it replaced `old`: its own, plus old's moved across (best first) into its free sockets.
 * `buy`: also count the sockets the jeweler could add now (in town, with the gold). Gems need bag room on the way.
 */
function movedGems(c, it, old, buy) {
  if (!old || !old.gems.length || it.uid === old.uid || bagFree(c) < old.gems.length || c.gold < unsocketCost(old)) return null;
  let sockets = it.sockets, gold = c.gold - unsocketCost(old);
  while (buy && sockets < it.maxSockets && sockets - it.gems.length < old.gems.length) {
    const cost = socketCost({ ...it, sockets });
    if (cost > gold * 0.5) break;
    gold -= cost; sockets++;
  }
  const room = sockets - it.gems.length;
  if (room <= 0) return null;
  const take = [...old.gems].sort((a, b) => b.tier - a.tier).slice(0, room);
  return { gems: [...it.gems, ...take], sockets, moved: take.length };
}
/**
 * Score with item `it` equipped (a ring tries each ring slot): {s, slot, move}. The worn piece's gems count as moved
 * into `it` (auto-play pries them out when it swaps), so a +10 old piece full of top gems no longer beats a far
 * better new one just because the new one's sockets are empty.
 */
function fitScore(p, it, buy = G.world && G.world.kind === 'town', keep = null) {
  const c = p.char;
  let best = { s: -Infinity, slot: it.slot, move: null };
  for (const slot of it.slot === 'ring' ? RING_SLOTS : [it.slot]) {
    const old = c.equip[slot];
    if (old && (old.locked || (keep && keep.has(old.uid)))) continue;   // the player locked what's worn there (keep: just put on)
    const move = movedGems(c, it, old, buy);
    const s = simulate(p, () => {
      const g0 = it.gems, s0 = it.sockets, og = old && old.gems;
      c.equip[slot] = it;
      if (move) { it.gems = move.gems; it.sockets = move.sockets; old.gems = []; }
      return () => { c.equip[slot] = old; it.gems = g0; it.sockets = s0; if (old) old.gems = og; };
    });
    // The aggregate stat score can make an upgraded, socketed low-level item look "good enough"
    // forever. Give gear a modest progression value so auto-play actually replaces stale pieces.
    const targetIlvl = Math.max(1, c.level, depthLevel(c.depth || 1));
    const freshness = (gear) => gear ? clamp((gear.ilvl || 1) / targetIlvl, 0, 1) : 0;
    // never a downgrade in rarity for being newer, but an older piece of lower rarity still pays for its age: zeroing
    // both made the swap back free, and an old Common ring and a newer Uncommon one took turns every tick for hours
    const age = 0.28 * (freshness(it) - freshness(old)), ageGain = old && it.rarity < old.rarity ? Math.min(0, age) : age;
    if (s + ageGain > best.s) best = { s: s + ageGain, slot, move };
  }
  return best;
}

/** buildPower with one more point in each skill of `chain`. */
function buildPowerWith(p, chain) {
  const c = p.char;
  for (const s of chain) c.skills[s.id] = (c.skills[s.id] || 0) + 1;
  const v = buildPower(p, CROWD, null, true).total;
  for (const s of chain) if (!--c.skills[s.id]) delete c.skills[s.id];
  return v;
}
const mainTree = (p) => { const sk = SKILLS[p.char.bar[0]]; return sk ? sk.tree : 0; };

/** Score the hero after mutate() (which returns an undo function), then put everything back. */
function simulate(p, mutate) {
  const hp = p.hp, mana = p.mana;
  const undo = mutate();
  p.recompute();
  const s = charScore(p);
  undo();
  p.recompute();
  p.hp = Math.min(hp, p.maxHp); p.mana = Math.min(mana, p.maxMana);
  return s;
}

// ================================================================== small helpers
/** The score a piece must beat to be worn (optimizeGear); buying or picking up by a looser bar sells it again. */
/** The score a piece must beat to be worn (optimizeGear); buying or picking up by a looser bar sells it again. A fixed
 *  margin: a share of the score (it grows with level) asked a depth 500 hero for ~17% more before a swap. */
const equipBar = (cur) => cur + 0.05;
/** Settings › "Auto-play manages gear". Off: it never equips, sells, buys, drops, stashes, sockets, upgrades or
 *  enchants anything; in town it only buys potions, and a full bag waits in town for the player (bagWait). */
const gearOn = () => G.settings.autoGear !== false;
/** A town stop auto-play skips while the gear is the player's (everything but the alchemist). */
const handsOff = (step) => !gearOn() && step.vendor !== 'alchemist';
/** Gear upgraded at the blacksmith (+N): auto-play keeps it in the chest, never sells or drops it. */
const upgraded = (it) => it.type === 'gear' && ((it.upg || 0) > 0 || !!it.relic || !!glyphOf(it)); // +N gear and relics are kept (the chest)
/** What auto-play puts in the storage chest: gems, the loot filter's keepers, +N gear, and good gear the hero is still
 *  too low-level to wear. */
const forChest = (it, c) => !it.sealed && !it.locked && (it.type === 'gem' || filterKeeps(it) || upgraded(it) || (it.type === 'gear' && (it.req || 1) > c.level && it.rarity >= 2));
/** Gamble only with this many gambles' worth of gold: a miss sells back for ~5% of its price. */
const GAMBLE_GOLD = 20;
function bagFree(c) { return c.bag.reduce((a, b) => a + (b ? 0 : 1), 0); }
/** In town with no free bag slot left after trading (sealed treasures, or nothing auto-play may sell or stash): wait for the player. */
function bagWait(c) { return bagFree(c) === 0; }
function sellPrice(it) { return Math.max(1, Math.floor(itemValue(it) / 4)) * (it.type === 'gem' ? (it.count || 1) : 1); }
function vendorNpc(w, id) { return w.npcs.find((n) => n.vendor && n.vendor.id === id); }
function potionPrice(k, c) { return Math.round(POTION_PRICE[k] * (1 + c.level * 0.08)); }
function enemyNear(w, p, r) { return w.hostiles('player', p.x, p.y, r).filter((m) => !m.dead && m.team === 'enemy'); }
function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

// ================================================================== the bot
export const Auto = {
  on: false,
  status: '',
  overrideT: 0,

  toggle(v = !this.on) {
    this.on = v;
    G.autoplayOn = v;
    this.errors = 0;
    this.reset();
    const p = G.player;
    if (!v && p) { p.moveVec = [0, 0]; p.lootTarget = null; p.whirlAuto = false; }
    if (v && G.ui) G.ui.log(`<b>Auto-play on.</b> ${G.touch ? 'Use the controls to take over for a moment; tap Auto to stop.' : 'Move or click to take over for a moment; P or the Auto button stops it.'} ${gearOn() ? 'It manages your gear (Settings to turn that off).' : 'Your gear is left alone.'}`, '#8fe0ff');
    else if (G.ui) G.ui.log('Auto-play off.', '#8fe0ff');
    this.setStatus(v ? 'Thinking…' : '');
    const btn = document.getElementById('auto-btn');
    if (btn) btn.classList.toggle('on', v);
    if (v && G.world && G.world.kind === 'town' && G.ui && G.char) this.askDest();
  },

  // ---------------------------------------------------------------- THE ETERNAL BREACH (docs/ETERNAL_BREACH.md)
  /** Turned on in town: which portal to play through, the Standard Adventure Portal or THE ETERNAL BREACH. */
  dest: 'standard',
  askDest() {
    if (G.autoDest) { this.dest = G.autoDest; return; } // tests
    const c = G.char, f = this.breachFloor(), rt = this.riftTier(), rift = endgameUnlocked(c);
    if (this.dest === 'rift' && !rift) this.dest = 'standard';
    const d = G.ui.dialog({
      title: 'Where to, adventurer?', cls: 'auto-dest',
      html: `<p>Auto-play is on. Which portal should it take?</p>
        <div class="pc-row"><button type="button" class="pc-card${this.dest === 'standard' ? ' sel' : ''}" data-d="standard" style="--pc:#ff8040"><i class="pc-swirl"></i><b class="pc-name">Standard Adventure Portal</b><span class="pc-tag">The descent: Depth ${c.depth}</span></button>
        <button type="button" class="pc-card${this.dest === 'breach' ? ' sel' : ''}" data-d="breach" style="--pc:#b050ff"><i class="pc-swirl"></i><b class="pc-name">THE ETERNAL BREACH</b><span class="pc-tag">Challenge: Floor ${f} (monster level ${breachLevel(f)}, you are ${c.level})</span></button>
        ${rift ? `<button type="button" class="pc-card${this.dest === 'rift' ? ' sel' : ''}" data-d="rift" style="--pc:#20e0ff"><i class="pc-swirl"></i><b class="pc-name">ABYSSAL RIFT</b><span class="pc-tag">Against the clock: Tier ${rt} (monster level ${riftLevel(rt)}, you are ${c.level})</span></button>` : ''}</div>
        <p class="pc-auto"></p>`,
      closable: false,
      buttons: [{ label: 'Standard Adventure Portal', fn: () => this.setDest('standard') }, { label: 'THE ETERNAL BREACH', cls: 'red', fn: () => this.setDest('breach') }, ...(rift ? [{ label: 'ABYSSAL RIFT', cls: 'red', fn: () => this.setDest('rift') }] : [])],
    });
    // the cards choose too; with no choice in DEST_WAIT seconds auto-play keeps the portal it took last
    d.box.querySelectorAll('.pc-card').forEach((b) => b.addEventListener('click', () => { sfx('ui'); d.close(); this.setDest(b.dataset.d); }));
    this.destPick = { t: DEST_WAIT, d, el: d.box.querySelector('.pc-auto'), last: '' };
  },
  /** The Standard/Breach menu's countdown (runs while the dialog pauses the world; game.update). */
  tickDest(dt) {
    const k = this.destPick;
    if (!k) return;
    if (!k.el.isConnected || !this.on) { this.destPick = null; if (k.el.isConnected) k.d.close(); return; }
    if ((k.t -= dt) <= 0) { this.destPick = null; k.d.close(); this.setDest(this.dest); return; }
    const txt = `Auto-play takes the ${this.dest === 'breach' ? 'Eternal Breach' : this.dest === 'rift' ? 'Abyssal Rift' : 'Standard Adventure Portal'} in ${Math.ceil(k.t)}… tap one to choose.`;
    if (txt !== k.last) { k.last = txt; k.el.innerHTML = txt; }
  },
  setDest(d) {
    this.dest = d; this.town = null; this.destPick = null;
    G.ui.log(d === 'breach' ? `Auto-play heads for <b style="color:#c080ff">THE ETERNAL BREACH</b> (Floor ${this.breachFloor()}).` : d === 'rift' ? `Auto-play heads for the <b style="color:#20e0ff">Abyssal Rift</b> (Tier ${this.riftTier()}).` : 'Auto-play takes the Standard Adventure Portal.', '#8fe0ff');
  },
  // ---------------------------------------------------------------- ABYSSAL RIFTS (docs/ENDGAME.md)
  /** Can the hero take rift tier T? Its monsters at most two levels above the hero. */
  riftReady(T) { return riftLevel(T) <= (G.char?.level || 1) + 2; },
  /** A rift whose Guardian stirred but has not woken (the hero is not in its arena yet): auto-play makes for it. */
  riftRush(w) { const g = w.rift && w.rift.guardian; return !!g && !g.dead && !g.awake && !w.rift.done; },
  /** The tier auto-play enters: the highest open one the hero is ready for (tier 1 at the least). */
  riftTier() {
    let t = riftOpen(G.char);
    while (t > 1 && !this.riftReady(t)) t--;
    return t;
  },
  /** Can the hero take Breach floor n? Its monsters at most two levels above the hero. */
  breachReady(n) { return breachLevel(n) <= (G.char?.level || 1) + 2; },
  /** The floor auto-play enters: the highest open one the hero is ready for (floor 1 at the least). */
  breachFloor() {
    const top = (G.char?.breach?.best || 0) + 1;
    let f = top;
    while (f > 1 && !this.breachReady(f)) f--;
    return f;
  },
  /** Fell in the Breach: auto-play goes back to the descent until it is turned on again. */
  breachDied() { if (this.dest === 'breach') { this.dest = 'standard'; G.ui?.log('Auto-play fell in the Breach: it takes the Standard Adventure Portal from now on (turn it off and on in town to choose again).', '#8fe0ff'); } },

  reset() {
    this.world = null; this.nav = null; this.path = null; this.goal = null; this.thinkT = 0; this.navT = 0;
    this.town = null; this.sealWaiting = false; this.transitT = 0; this.stuck = { t: 0, x: 0, y: 0, n: 0 }; this.jiggle = null;
    this.target = null; this.dodge = null; this.retreat = false; this.ignore = new WeakSet(); this.lastSig = '';
    this.screenT = 0; this.lastCast = {}; this.stall = null; this.banT = 0; this.shun = new WeakMap(); this.giveUp = new WeakSet();
    this.lootFor = null; this.lootT = 0; this.lootDry = 0; this.lootBusy = -99; this.lootSpent = new WeakMap(); this.stalls = new WeakMap(); this.hunts = new WeakMap(); this.edgeT = 0; this.dangerList = null;
    this.wantCache = new WeakMap(); this.hurt = 0; this.lastHp = -1; this.climbTo = null;
    this.dragoonJumps = 0; this.dragoonJumpGoal = 3 + Math.floor(Math.random() * 6);
    this.dragoonCastUntil = 0; this.dragoonLastBarrage = 0; this.dragoonLastWeaveAt = -1;
    G.heroListen = null;
  },

  setStatus(s) {
    if (s === this.status) return;
    this.status = s;
    const el = document.getElementById('auto-status');
    if (el) { el.textContent = s ? `AUTO · ${s}` : ''; el.classList.toggle('hidden', !this.on); }
  },

  /** Did the player touch the controls this frame? (checked before controls.update eats the input) */
  noteInput() {
    if (!this.on) return;
    const k = input.keys;
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ...SLOT_KEYS.filter(Boolean)];
    if (input.joy.active || input.worldTouch || keys.some((x) => k.has(x)) || ((input.mouse.left || input.mouse.right) && input.mouse.inside && input.lastPointerType === 'mouse')) this.overrideT = 1.5;
  },

  // ---------------------------------------------------------------- main tick (after controls.update)
  update(dt) {
    if (!this.on) return;
    // a bug in the bot must never stop the world from updating
    try { this.tick(dt); } catch (e) {
      console.error('auto-play:', e);
      this.path = null; this.nav = null;
      // skip the town errand that failed instead of starting the whole shopping round over
      if (this.town) {
        const st = this.town.steps[this.town.i];
        if (st) G.ui.log(`Auto-play hit a snag (${escapeHtml(st.label.toLowerCase())}) and moved on.`, '#ff8080');
        this.town.i++; this.town.phase = 'walk'; this.town.t = 0;
        try { G.ui.closeAll(); } catch (e2) { /* ignore */ }
      }
      if (++this.errors > 20) { this.toggle(false); G.ui.log('Auto-play stopped after repeated errors.', '#ff8080'); }
    }
  },
  tick(dt) {
    const p = G.player, w = G.world, c = G.char;
    if (!p || !w || !c) return;
    if (w !== this.world) { const keep = this.ignore; this.reset(); this.ignore = keep; this.world = w; }
    p.whirlAuto = this.overrideT <= 0;
    if (this.handleScreens(dt)) return;
    if (p.dead) { this.setStatus('Fallen…'); return; }
    if (this.transitT > 0) { this.transitT -= dt; this.setStatus('Travelling…'); return; }
    if (this.overrideT > 0) { p.whirlAuto = false; this.overrideT -= dt; this.setStatus('Manual control'); return; }
    if (this.listen(dt)) return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 1; this.manageHero(); }
    p.moveVec = [0, 0];
    if (this.nav && this.nav.job) this.stepRoadNav(2);   // the next road field, a slice a frame (buildNav)
    if (w.kind === 'town') this.townTick(dt);
    else this.dungeonTick(dt);
  },

  /** Someone is talking to the hero (townlife.js heroHears): stand still and face them until the bubble has been
   *  read (a second at least), unless monsters are close. */
  listen(dt) {
    const L = G.heroListen, p = G.player, w = G.world;
    if (!L) return false;
    if ((L.t -= dt) <= 0 || L.who.hidden || w.creatures.some((m) => !m.dead && m.team === 'enemy' && m.awake && dist(m.x, m.y, p.x, p.y) < 7)) { G.heroListen = null; return false; }
    p.moveVec = [0, 0];
    p.facing = Math.atan2(L.who.y - p.y, L.who.x - p.x);
    this.setStatus(`Listening to ${L.who.name}`);
    return true;
  },

  /** Click through the death and victory screens. */
  handleScreens(dt) {
    const scr = [...document.querySelectorAll('#screens > .screen')].find((x) => x.querySelector('.death-title'));
    if (!scr) { this.screenT = 0; return false; }
    const btn = [...scr.querySelectorAll('button')].find((b) => /Return to Town|Continue/.test(b.textContent));
    if (!btn) return false;
    this.screenT += dt;
    this.setStatus(/Return/.test(btn.textContent) ? 'Back to town…' : 'Victory!');
    if (this.screenT > (/Return/.test(btn.textContent) ? 2.5 : 5)) { this.screenT = 0; btn.click(); }
    return true;
  },

  // ================================================================ character management
  manageHero() {
    const p = G.player, c = G.char;
    let dirty = false;
    if (c.statPoints > 0 && G.settings.autoStatPoints !== false) { this.spendStats(); dirty = true; }
    if (marksFree() > 0 && G.settings.autoStatPoints !== false && autoSpend()) dirty = true; // Infernal Marks (game/marks.js), spread evenly
    if (c.skillPoints > 0 && G.settings.autoSkillPoints !== false) { if (this.spendSkills()) dirty = true; }
    const sig = Object.entries(c.skills).map((e) => e.join(':')).join(',') + '|' + c.level;
    if (sig !== this.lastSig) { this.lastSig = sig; this.arrangeBar(); dirty = true; }
    if (this.optimizeGear()) dirty = true;
    if (this.socketGems()) dirty = true;
    if (dirty) { p.recompute(); G.ui.refresh(); G.game.autosave(); }
  },

  spendStats() {
    const p = G.player, c = G.char;
    while (c.statPoints > 0) {
      let best = 'vit', bs = -Infinity;
      for (const k of ['str', 'dex', 'vit', 'int']) {
        const s = simulate(p, () => { c.attrs[k]++; return () => { c.attrs[k]--; }; });
        if (s > bs) { bs = s; best = k; }
      }
      c.attrs[best]++;
      c.statPoints--;
    }
    p.recompute();
  },

  /** The Paladin alternates hammers and Shield Throw: hammers cast since his last shield. */
  hammersSince: 1,
  countFocus(sk) { if (sk.m.ricochet) this.hammersSince = 0; else if (isHammer(sk)) this.hammersSince++; },

  /** Put each skill point where it raises buildPower most (counting the prerequisites a new skill needs). */
  spendSkills() {
    const p = G.player, c = G.char;
    const list = CLASS_SKILLS[c.classId];
    let spent = false;
    while (c.skillPoints > 0) {
      const base = buildPower(p, CROWD, null, true).total;
      let best = null, bv = 0;
      const focus = focusSkills(c.classId) || [];
      // Unlock each class-defining skill as soon as its level gate opens.
      // Walk backwards through prerequisites, instead of endlessly maxing
      // the first high-DPS skill and leaving the rest of the build locked.
      if (focus.length && c.classId !== 'paladin') {
        for (const goal of focus.filter((sk) => sk.reqLevel <= c.level && !c.skills[sk.id])
          .sort((a, b) => a.reqLevel - b.reqLevel || a.tree - b.tree || a.idx - b.idx)) {
          let step = goal;
          while (step.prereq && !c.skills[step.prereq]) step = SKILLS[step.prereq];
          if (!canLearn(step)) { best = step; break; }
        }
        // Spread later points through the focused rotation, not one spell.
        if (!best) best = focus.filter((sk) => !canLearn(sk))
          .sort((a, b) => (c.skills[a.id] || 0) - (c.skills[b.id] || 0) ||
            (a.kind === 'whirl' ? -1 : 0) - (b.kind === 'whirl' ? -1 : 0) || a.idx - b.idx)[0];
        if (best) {
          c.skills[best.id] = (c.skills[best.id] || 0) + 1;
          c.skillPoints--; spent = true;
          if (c.skills[best.id] === 1) G.ui.log(`Auto-play learned <b>${escapeHtml(best.name)}</b>.`, '#8fe0ff');
          continue;
        }
      }
      // a focused build (the Paladin's hammers) takes the point whenever one of its skills can use it; the Paladin's
      // even when the plan reads a rank as a loss (a mana-starved early rank whose cost rounds up faster than its damage)
      let fv = c.classId === 'paladin' ? -Infinity : bv;
      best = c.classId === 'paladin' ? shieldStep(c, focus) : null;
      for (const sk of best ? [] : focus) {
        if (canLearn(sk)) continue;
        const v = (buildPowerWith(p, [sk]) - base) * (sk.kind === 'orbit' ? 1.5 : 1) + 1e-6; // the swirling hammers first
        if (v > fv) { fv = v; best = sk; }
      }
      if (best) bv = Infinity;
      // none can take it yet, but one opens within a few levels (Blessed Hammer at 6): save the points for it
      else if ((focusSkills(c.classId) || []).some((sk) => !(c.skills[sk.id] > 0) && sk.reqLevel > c.level && sk.reqLevel - c.level <= 4 && (!sk.prereq || c.skills[sk.prereq] > 0))) break;
      for (const sk of bv === Infinity ? [] : list) {
        if ((c.skills[sk.id] || 0) >= MAX_SKILL_LEVEL || c.level < sk.reqLevel) continue;
        // the chain of unlearned prerequisites below this skill (same column)
        const chain = [];
        let s = sk;
        while (s) { if (!(c.skills[s.id] > 0) || s === sk) chain.push(s); s = s.prereq && !(c.skills[s.prereq] > 0) ? SKILLS[s.prereq] : null; }
        if (chain.length > c.skillPoints + 3) continue;
        const v = buildPowerWith(p, chain) - base;
        let per = v / chain.length + (chain[0].tree === mainTree(p) ? base * 0.002 : 0);
        if (sk.kind === 'summon' && PET_CLASSES.has(c.classId)) per *= 1.6; // pet builds grow their minions first
        if (per > bv) { bv = per; best = chain[chain.length - 1]; }
      }
      if (!best || canLearn(best)) best = [SKILLS[c.bar[0]], ...list].find((x) => x && !canLearn(x));
      if (!best) break;
      c.skills[best.id] = (c.skills[best.id] || 0) + 1;
      c.skillPoints--;
      spent = true;
      if (c.skills[best.id] === 1) G.ui.log(`Auto-play learned <b>${escapeHtml(best.name)}</b>.`, '#8fe0ff');
    }
    if (spent) { p.recompute(); this.lastSig = ''; }
    return spent;
  },

  /** LMB = main attack, RMB = the second attack (or the free one), ` 1-9 0 - = = cooldowns, minions, buffs, curses, heals. */
  arrangeBar() {
    const p = G.player, c = G.char;
    const { parts } = buildPower(p, CROWD, null, true);
    const learned = CLASS_SKILLS[c.classId].filter((sk) => effLevel(p, sk) > 0);
    const focused = (focusSkills(c.classId) || []).filter((sk) => effLevel(p, sk) > 0);
    let bar = Array(BAR_SIZE).fill(null);
    const main = parts.find((x) => x.role === 'main');
    const alt = parts.find((x) => x.role === 'alt' || x.role === 'filler');
    const free = (c.classId === 'barbarian' && learned.find((sk) => sk.id === 'barbarian.0.0')) || learned.find((sk) => !manaCost(sk, 1) && !rageCost(sk) &&
      !(sk.classId === 'barbarian' && sk.kind === 'whirl') && OFFENSIVE.has(sk.kind));
    const hammer = c.classId === 'paladin' && parts.filter((x) => x.sk.kind === 'orbit' &&
      isHammer(x.sk) && cooldown(x.sk) < 1.2).sort((a, b) => b.v - a.v)[0];
    const signature = c.classId === 'barbarian' ? learned.find((sk) => sk.name === 'Whirlwind') || learned.find((sk) => sk.kind === 'whirl') :
      c.classId === 'lancer' ? learned.find((sk) => sk.m.shields) :
      c.classId === 'dragoon' ? learned.find((sk) => sk.kind === 'leap') : null;
    bar[LMB] = signature?.id || hammer?.sk?.id || main?.sk.id || free?.id || c.bar[LMB];
    const lmbSk = SKILLS[bar[LMB]];
    const rmb = free && free.id !== bar[LMB] && (lmbSk && (manaCost(lmbSk, 1) || rageCost(lmbSk) || lmbSk.kind === 'whirl' || lmbSk.kind === 'orbit' || lmbSk.kind === 'leap')) ? free :
      alt && alt.sk;
    if (rmb && rmb.id !== bar[LMB]) bar[RMB] = rmb.id;
    const shield = c.classId === 'paladin' && focused.find((sk) => sk.m.ricochet); // the Paladin: hammers on LMB, Shield Throw on RMB
    if (shield && shield.id !== bar[LMB]) bar[RMB] = shield.id;
    // All learned bar skills participate, including low-ranked gap closers.
    // Put signature and mobility skills before pure damage picks if slots fill.
    const priority = [...focused, ...learned.filter(mobility), ...parts.map((x) => x.sk),
      ...learned.filter((sk) => OFFENSIVE.has(sk.kind)),
      ...learned];
    const keys = FILL_ORDER.filter((k) => k !== RMB);
    let i = 0;
    for (const sk of priority) {
      if (i >= keys.length) break;
      if (bar.includes(sk.id)) continue;
      bar[keys[i++]] = sk.id;
    }
    if (G.settings.lockSkillBar) { // locked: keep the player's slots, only fill the empty ones
      const out = c.bar.slice();
      for (const id of [bar[LMB], bar[RMB], ...FILL_ORDER.map((k) => bar[k])]) {
        if (!id || out.includes(id)) continue;
        const k = !out[LMB] ? LMB : freeSlot(out);
        if (k < 0) break;
        out[k] = id;
      }
      bar = out;
    }
    if (bar.join() !== c.bar.join()) { c.bar = bar; G.ui.refresh(); }
  },

  // ---------------------------------------------------------------- gear
  /** Equip any bag item that makes the hero stronger. */
  optimizeGear() {
    const p = G.player, c = G.char;
    let any = false;
    if (!gearOn()) return false;
    const placed = new Set(); // what this call put on stays on (a later pass swapped an old ring back over a new one)
    for (let pass = 0; pass < 3; pass++) {
      const cur = simulate(p, () => () => {});
      let best = -1, bs = equipBar(cur), bslot = null, bmove = null;
      c.bag.forEach((it, i) => {
        if (!it || it.type !== 'gear' || it.unid || it.sealed || it.locked || (it.req || 1) > c.level) return;
        const f = fitScore(p, it, undefined, placed);
        if (f.s > bs) { bs = f.s; best = i; bslot = f.slot; bmove = f.move; }
      });
      // a fresh look: body armor or a helm of the same or better rarity that's nearly as strong gets worn anyway
      if (best < 0) {
        this.worn = this.worn || new Set();
        c.bag.forEach((it, i) => {
          if (best >= 0 || !it || it.type !== 'gear' || it.unid || it.sealed || it.locked || (it.req || 1) > c.level || (it.slot !== 'body' && it.slot !== 'head') || this.worn.has(it.uid)) return;
          const old = c.equip[it.slot];
          if (old && (old.locked || it.rarity < old.rarity || it.ilvl < old.ilvl - 4)) return;
          const f = fitScore(p, it); if (f.s > cur - 0.02) { best = i; bslot = f.slot; bmove = f.move; }
        });
      }
      if (best < 0) break;
      if (this.worn) { this.worn.add(c.bag[best].uid); if (c.equip[bslot]) this.worn.add(c.equip[bslot].uid); }
      const it = c.bag[best], was = c.equip[bslot];
      placed.add(it.uid);
      equipFromBag(best, bslot);
      G.ui.log(`Auto-play equipped <span style="color:${itemColor(it)}">${escapeHtml(itemName(it))}</span>.`, '#8fe0ff');
      if (bmove && was && was.gems.length) this.moveGems(was, it, bmove.sockets);
      any = true;
    }
    return any;
  },

  /** Pry the gems out of `from` (just taken off) and set the best of them into `to`, adding sockets up to `sockets`. */
  moveGems(from, to, sockets) {
    const c = G.char, cost = unsocketCost(from);
    if (c.gold < cost || bagFree(c) < from.gems.length) return;
    c.gold -= cost;
    for (const g of from.gems) addToBag(c, makeGem(g.gem, g.tier));
    const n = from.gems.length;
    from.gems = [];
    while (to.sockets < Math.min(sockets, to.maxSockets) && c.gold >= socketCost(to)) { c.gold -= socketCost(to); to.sockets++; }
    this.socketGems();
    G.ui.log(`Auto-play moved ${n} gem${n > 1 ? 's' : ''} into <span style="color:${itemColor(to)}">${escapeHtml(itemName(to))}</span>.`, '#c8f0ff');
  },

  /** Fill free sockets of equipped gear with the bag gems that help most. */
  socketGems() {
    const p = G.player, c = G.char;
    let any = false;
    if (!gearOn()) return false;
    for (let guard = 0; guard < 12; guard++) {
      let best = null, bs = simulate(p, () => () => {}) + 0.0005;
      for (const slot of SLOTS) {
        const it = c.equip[slot];
        if (!it || it.locked || it.gems.length >= it.sockets) continue;
        const tried = new Set();
        c.bag.forEach((g, gi) => {
          if (!g || g.type !== 'gem' || GEMS[g.gem].sigil || tried.has(g.gem + g.tier)) return; // Sigils wait for a Glyphword
          tried.add(g.gem + g.tier);
          const s = simulate(p, () => { it.gems.push({ gem: g.gem, tier: g.tier }); return () => { it.gems.pop(); }; });
          if (s > bs) { bs = s; best = { gi, slot }; }
        });
      }
      if (!best) break;
      socketGem(best.gi, { where: 'equip', slot: best.slot });
      any = true;
    }
    return any;
  },

  /** Would we pick this ground item up? (gear verdicts are cached for a couple of seconds: they simulate) */
  wantLoot(g) {
    if (g.kind !== 'item') return this.wantLootNow(g); // (keys included: wantLootNow says yes)
    const now = G.world.time, hit = this.wantCache.get(g);
    if (hit && now - hit.t < 2) return hit.v;
    const v = this.wantLootNow(g);
    this.wantCache.set(g, { t: now, v });
    return v;
  },
  wantLootNow(g) {
    const c = G.char, p = G.player;
    if (this.ignore.has(g.item || g) || this.giveUp.has(g)) return false;
    if (g.kind === 'gold' || g.kind === 'key') return true;
    if (g.kind === 'orb_hp') return p.hp < p.maxHp * 0.85;
    if (g.kind === 'orb_mp') return p.mana < p.maxMana * 0.7;
    if (g.kind === 'potion') return (c.potions[g.item.kind] || 0) < 30;
    if (g.kind !== 'item') return false;
    const it = g.item, free = bagFree(c), f = activeFilter();
    if (it.type === 'gem') return (!f || f.gems) && (free > 0 || c.bag.some((b) => b && b.type === 'gem' && b.gem === it.gem && b.tier === it.tier) || this.worstBag(itemValue(it)) >= 0);
    if (it.type !== 'gear' || it.sealed) return free > 0; // a sealed treasure is Epic or better: always worth a slot
    if (f) { // the player's loot filter (game/lootfilter.js) decides, plus upgrades to wear unless that's off too
      if (!filterPasses(it) && !(f.upgrades && (it.req || 1) <= c.level && this.isUpgrade(it))) return false;
      return free > 0 || this.worstBag(itemValue(it)) >= 0;
    }
    const upgrade = (it.req || 1) <= c.level && this.isUpgrade(it);
    if (upgrade) return true;
    if ((it.slot === 'body' || it.slot === 'head') && (it.req || 1) <= c.level && (!c.equip[it.slot] || it.rarity >= c.equip[it.slot].rarity) && free > 0) return true; // new looks
    const minRarity = free > 30 ? 1 : free > 12 ? 2 : 3;
    if (it.rarity < minRarity) return false;
    return free > 0 || this.worstBag(itemValue(it)) >= 0;
  },
  isUpgrade(it) {
    const p = G.player, c = G.char;
    const cur = simulate(p, () => () => {});
    return fitScore(p, it).s > equipBar(cur);
  },
  /** Index of the cheapest sellable bag item worth less than `than`, or -1 (always, while the gear is the player's). */
  worstBag(than) {
    const c = G.char;
    if (!gearOn()) return -1;
    let wi = -1, wv = than * 0.8;
    c.bag.forEach((b, i) => { if (b && b.type === 'gear' && !b.sealed && !b.locked && !filterKeeps(b) && !upgraded(b) && sellPrice(b) * 4 < wv) { wv = sellPrice(b) * 4; wi = i; } });
    return wi;
  },
  makeRoom(it) {
    const i = this.worstBag(itemValue(it));
    if (i < 0) return false;
    const old = G.char.bag[i];
    this.ignore.add(old);
    dropFromBag(i);
    return true;
  },

  // ================================================================ navigation
  /** BFS distance field from the hero's tile (8-way, no corner cutting). */
  buildNav() {
    const w = G.world, p = G.player, m = w.map, W = m.w, H = m.h;
    if (!this.nav || this.nav.d.length !== W * H) this.nav = { d: new Int32Array(W * H), q: new Int32Array(W * H) };
    const { d, q } = this.nav;
    let sx = Math.floor(p.x), sy = Math.floor(p.y);
    if (!m.walkableTile(sx, sy)) {
      let found = false;
      for (let r = 1; r < 3 && !found; r++) for (let oy = -r; oy <= r && !found; oy++) for (let ox = -r; ox <= r && !found; ox++) if (m.walkableTile(sx + ox, sy + oy)) { sx += ox; sy += oy; found = true; }
    }
    if (m.road) {
      // the Castle's field covers 100k tiles (~9 ms, three or four times that on a phone): built again only once the
      // hero has left his tile, or every 2 s, and then over the next frames (stepRoadNav, 2 ms a frame) while the last
      // one serves; roadPath starts from the hero, wherever he is along it. A hero far from its origin waits for none.
      const at = sy * W + sx, now = w.time, nav = this.nav;
      this.navT = 0.35;
      if (nav.c && nav.from === at && now - nav.at < 2) return;
      const far = !nav.c || Math.max(Math.abs((nav.from % W) - sx), Math.abs(((nav.from / W) | 0) - sy)) > 6;
      if (!far) { if (!nav.job) nav.job = this.roadJob(sx, sy); return; }
      nav.job = this.roadJob(sx, sy);
      this.stepRoadNav(Infinity);
      return;
    }
    d.fill(-1);
    this.nav.from = -1;
    // straight off the typed arrays (the dunes and caverns are 60k tiles, rebuilt every 0.35 s): stepMask holds each
    // tile's in-bounds, height-legal steps (map.stepsOk), floor and props are read live
    const T = m.t, Bl = m.block, SM = m.stepMask();
    let h = 0, t = 0;
    if (!m.inb(sx, sy)) { this.navT = 0.35; return; }
    q[t++] = sy * W + sx; d[sy * W + sx] = 0;
    while (h < t) {
      const i = q[h++], nd = d[i] + 1, sm = SM[i];
      for (let k = 0; k < 9; k++) {
        if (!((sm >> k) & 1)) continue;
        const ox = (k % 3) - 1, oy = ((k / 3) | 0) - 1, ni = i + oy * W + ox;
        if (d[ni] !== -1 || T[ni] !== 1 || Bl[ni]) continue;
        if (ox && oy && (T[i + ox] !== 1 || Bl[i + ox] || T[i + oy * W] !== 1 || Bl[i + oy * W])) continue;
        d[ni] = nd; q[t++] = ni;
      }
    }
    this.navT = 0.35;
  },
  /** Start a road field from tile (sx, sy) in spare buffers (stepRoadNav runs it). */
  roadJob(sx, sy) {
    const m = G.world.map, W = m.w, N = W * m.h, nav = this.nav;
    // the buffers of a search left unfinished (the hero was carried off), else the last field's
    let j = nav.job && nav.job.d.length === N ? nav.job : null;
    if (!j && nav.spare && nav.spare.d.length === N) { j = nav.spare; nav.spare = null; }
    j ||= { d: new Int32Array(N), c: new Int32Array(N), p: new Int32Array(N), bk: Array.from({ length: 8 }, () => []) };
    j.d.fill(-1); j.c.fill(0x3fffffff); j.p.fill(-1);
    for (const b of j.bk) b.length = 0;
    // a raised drawbridge is planned across (straight, not diagonally): it comes down as the hero walks up to it
    // (game/castle3d.js), so a goal inside the walls is not given up at the moat
    // (a byte per tile, not a Set: two lookups per step of a 100k-tile search cost more than the rest of it)
    j.DB = null;
    if (m.planOpen && m.drawbridge && !m.drawbridge.down) {
      if (nav.dbOf !== m.drawbridge || !nav.db || nav.db.length !== N) { nav.db = new Uint8Array(N); for (const i of m.drawbridge.tiles) nav.db[i] = 1; nav.dbOf = m.drawbridge; }
      j.DB = nav.db;
    }
    j.m = m; j.s0 = sy * W + sx; j.at = G.world.time; j.cur = 0; j.left = 1;
    j.c[j.s0] = 0; j.d[j.s0] = 0; j.bk[0].push(j.s0);
    return j;
  },
  /**
   * Run the road field's search (roadJob) for up to `ms`; once done it becomes the field (nav.d, nav.c, nav.p).
   * On a map with roads (map.road: the Castle's roads, lanes, trails and paving) the field is the cheapest way rather
   * than the shortest: a step onto road costs 2, onto open ground 5 (diagonals 3 / 7), so the hero keeps to the roads
   * and trails unless leaving them saves real distance. Dial's buckets; d still counts the steps, p the way back.
   */
  stepRoadNav(ms) {
    const nav = this.nav, j = nav.job, m = j.m;
    if (m !== G.world.map) { nav.job = null; return; }
    const W = m.w, R = m.road, T = m.t, Bl = m.block, d = j.d, c = j.c, pv = j.p, bk = j.bk, B = 8, DB = j.DB;
    // each tile's height-legal steps (map.stepMask, worked out once a map)
    const SM = m.stepMask();
    const OX = [-1, 0, 1, -1, 0, 1, -1, 0, 1], OFF = OX.map((ox, k) => (((k / 3) | 0) - 1) * W + ox);
    const end = performance.now() + ms;
    let cur = j.cur, left = j.left, n = 0;
    for (; left > 0; cur++) {
      const b = bk[cur % B];
      while (b.length) {
        if ((++n & 2047) === 0 && performance.now() > end) { j.cur = cur; j.left = left; return; }
        const i = b.pop(); left--;
        if (c[i] !== cur) continue;
        const sm = SM[i], dbi = DB ? DB[i] : 0;
        for (let k = 0; k < 9; k++) {
          const step = (sm >> k) & 1;
          if (!step && !(DB && (k & 1))) continue;
          const ni = i + OFF[k], dbn = DB ? DB[ni] : 0;
          if (!step && !dbn && !dbi) continue;
          if ((T[ni] !== 1 || Bl[ni]) && !dbn) continue;
          const diag = !(k & 1);   // (k 4, the tile itself, is never a step)
          if (diag) { const a = i + OX[k], o = i + OFF[k] - OX[k]; if (T[a] !== 1 || Bl[a] || T[o] !== 1 || Bl[o]) continue; }
          const nc = cur + (diag ? (R[ni] ? 3 : 7) : (R[ni] ? 2 : 5));
          if (nc >= c[ni]) continue;
          c[ni] = nc; d[ni] = d[i] + 1; pv[ni] = i;
          bk[nc % B].push(ni); left++;
        }
      }
    }
    // done: it serves now, and the old field's buffers wait for the next search
    nav.spare = nav.c ? { d: nav.d, c: nav.c, p: nav.p, bk: nav.bk || Array.from({ length: B }, () => []) } : null;
    nav.d = d; nav.c = c; nav.p = pv; nav.bk = bk; nav.from = j.s0; nav.at = j.at; nav.job = null;
  },
  /** Path distance (tiles) from the hero to (x,y), or Infinity. */
  navDist(x, y) {
    const m = G.world.map, d = this.nav && this.nav.d;
    if (!d) return Infinity;
    const tx = Math.floor(x), ty = Math.floor(y);
    let best = Infinity;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const nx = tx + ox, ny = ty + oy;
      if (!m.inb(nx, ny)) continue;
      const v = d[ny * m.w + nx];
      if (v >= 0) best = Math.min(best, v + (ox || oy ? 1 : 0));
      if (!ox && !oy && v >= 0) return v;
    }
    return best;
  },
  pathTo(gx, gy) {
    const w = G.world, m = w.map, W = m.w, d = this.nav.d, p = G.player;
    // straight there when in sight (on a map with roads only when near: further, the roads lead)
    if ((!m.road || dist(p.x, p.y, gx, gy) < 8) && m.losWide(p.x, p.y, gx, gy)) return [[gx, gy]];
    if (m.road && this.nav.p) return this.roadPath(gx, gy);
    let tx = Math.floor(gx), ty = Math.floor(gy), cur = -1, cd = Infinity;
    for (let r = 0; r < 4 && cur < 0; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (!m.inb(tx + ox, ty + oy)) continue;
      const v = d[(ty + oy) * W + tx + ox];
      if (v >= 0 && v < cd) { cd = v; cur = (ty + oy) * W + tx + ox; }
    }
    if (cur < 0) return null;
    const path = [];
    for (let guard = 0; d[cur] > 0 && guard < 5000; guard++) {
      path.push([(cur % W) + 0.5, ((cur / W) | 0) + 0.5]);
      const x = cur % W, y = (cur / W) | 0;
      let next = -1;
      for (let oy = -1; oy <= 1 && next < 0; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if ((!ox && !oy) || !m.inb(nx, ny)) continue;
        if (ox && oy && (!m.walkableTile(x + ox, y) || !m.walkableTile(x, y + oy))) continue;
        if (m.hgt && !m.stepsOk(nx, ny, -ox, -oy)) continue; // walked from there to here
        if (d[ny * W + nx] === d[cur] - 1) { next = ny * W + nx; break; }
      }
      if (next < 0) break;
      cur = next;
    }
    path.reverse();
    if (path.length) path[path.length - 1] = [gx, gy];
    return m.smooth(p.x, p.y, path);
  },
  /** The cheapest way to (gx,gy) down the road field, its corners cut only where the cut keeps to the same ground. */
  roadPath(gx, gy) {
    const m = G.world.map, W = m.w, d = this.nav.d, pv = this.nav.p, p = G.player, R = m.road;
    let tx = Math.floor(gx), ty = Math.floor(gy), cur = -1;
    for (let r = 0; r < 4 && cur < 0; r++) for (let oy = -r; oy <= r && cur < 0; oy++) for (let ox = -r; ox <= r; ox++) {
      if (m.inb(tx + ox, ty + oy) && d[(ty + oy) * W + tx + ox] >= 0) { cur = (ty + oy) * W + tx + ox; break; }
    }
    if (cur < 0) return null;
    const path = [];
    for (let guard = 0; pv[cur] >= 0 && guard < 20000; guard++) { path.push([(cur % W) + 0.5, ((cur / W) | 0) + 0.5]); cur = pv[cur]; }
    path.reverse();
    // the field's origin can be a few tiles behind the hero (buildNav builds the next one over several frames): join
    // the way at its point nearest him, not back where it starts
    let k0 = 0, kd = Infinity;
    for (let k = 0; k < Math.min(path.length - 1, 16); k++) { const dd = dist(p.x, p.y, path[k][0], path[k][1]); if (dd < kd) { kd = dd; k0 = k; } }
    if (k0) path.splice(0, k0);
    if (path.length) path[path.length - 1] = [gx, gy];
    // smooth: skip a waypoint only if the straight line stays all on road, or all off it
    const same = (ax, ay, bx, by) => {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2), r0 = R[m.tileIdx(ax, ay)];
      for (let k = 1; k <= n; k++) if (R[m.tileIdx(ax + (bx - ax) * k / n, ay + (by - ay) * k / n)] !== r0) return false;
      return true;
    };
    const out = [];
    let ax = p.x, ay = p.y, i = 0;
    while (i < path.length) {
      let j = Math.min(path.length - 1, i + 12);
      while (j > i && !(same(ax, ay, path[j][0], path[j][1]) && m.losWide(ax, ay, path[j][0], path[j][1]))) j--;
      out.push(path[j]); ax = path[j][0]; ay = path[j][1]; i = j + 1;
    }
    return out;
  },
  /** Steer toward (gx,gy) along a path. Returns true when there. */
  goTo(gx, gy, near = 0.35, dt = 0, hold = true) {
    const p = G.player;
    if (dist(p.x, p.y, gx, gy) <= near) { this.path = null; return true; }
    if (!this.path || !this.goal || dist(this.goal[0], this.goal[1], gx, gy) > 0.7 || this.navT <= 0) {
      if (this.navT <= 0) this.buildNav();
      this.goal = [gx, gy];
      const path = this.pathTo(gx, gy);
      this.path = path && path.length ? path : [[gx, gy]];
    }
    // move on to the next waypoint early only if the hero itself (not the waypoint) can see it; cutting a corner
    // from a spot near the waypoint can clip a prop and leave the hero sliding along it
    while (this.path.length > 1) {
      const d0 = dist(p.x, p.y, this.path[0][0], this.path[0][1]);
      if (d0 < 0.08 || (d0 < 0.3 && G.world.map.losWide(p.x, p.y, this.path[1][0], this.path[1][1]))) this.path.shift();
      else break;
    }
    let [nx, ny] = this.path[0];
    if (this.jiggle && this.jiggle.t > 0) { this.jiggle.t -= dt; nx = p.x + Math.cos(this.jiggle.a); ny = p.y + Math.sin(this.jiggle.a); }
    if (hold && this.holdEdge(nx, ny, dt)) return false; // (not when running for cover or a raid mechanic)
    this.steer(nx, ny);
    return false;
  },
  /** The next step would take him into a telegraph or burning ground he just got out of: wait at its edge (it is
   *  usually gone in a second) instead of stepping in and dodging straight back out, over and over. After 1.5 s he
   *  walks on through it, not dodging for 2 s while he is healthy. */
  holdEdge(nx, ny, dt) {
    const L = this.dangerList, p = G.player;
    if (!L || !L.length) { this.edgeT = 0; return false; }
    const dx = nx - p.x, dy = ny - p.y, l = Math.hypot(dx, dy) || 1, s = Math.min(0.6, l);
    if (this.inDanger(L, p.x, p.y) || !this.inDanger(L, p.x + (dx / l) * s, p.y + (dy / l) * s)) { this.edgeT = 0; return false; }
    if ((this.edgeT += dt || G.dt || 1 / 30) > 1.5) { this.edgeT = 0; this.braveT = 2; return false; }
    p.moveVec = [0, 0];
    return true;
  },
  steer(x, y) {
    const p = G.player, dx = x - p.x, dy = y - p.y, l = Math.hypot(dx, dy);
    if (l > 1e-3) p.moveVec = [dx / l, dy / l];
  },
  /** Notice when the hero walks into a wall or a crowd and wiggle free. */
  watchStuck(dt) {
    const p = G.player, s = this.stuck;
    const trying = (p.moveVec[0] || p.moveVec[1]) && p.castLock <= 0 &&
      (!p.channel || (p.channel instanceof Whirl && p.classId === 'barbarian'));
    s.t += dt;
    if (s.t < 0.6) return;
    const moved = dist(p.x, p.y, s.x, s.y);
    // sliding along a wall counts as stuck too: moving, but no closer to the waypoint
    const wp = this.path && this.path[0], wd = wp ? dist(p.x, p.y, wp[0], wp[1]) : 0;
    const noGain = wp && wp === s.wp && wd > s.wd - 0.15;
    if (trying && (moved < 0.12 || noGain)) {
      s.n++;
      this.navT = 0; this.path = null;
      if (s.n >= 2) this.jiggle = { t: 0.35, a: Math.random() * TAU };
    } else s.n = 0;
    s.t = 0; s.x = p.x; s.y = p.y; s.wp = this.path && this.path[0]; s.wd = s.wp ? dist(p.x, p.y, s.wp[0], s.wp[1]) : 0;
  },

  // ================================================================ dungeon
  dungeonTick(dt) {
    const p = G.player, w = G.world, c = G.char;
    this.navT -= dt;
    // life lost per second (share of max), smoothed over a few seconds: how hard the fight is pushing back
    if (this.lastHp >= 0) this.hurt += (Math.max(0, this.lastHp - p.hp) / p.maxHp / dt - this.hurt) * Math.min(1, dt / 3);
    this.lastHp = p.hp;
    if (!this.nav || this.navT <= 0) this.buildNav();
    this.potions(w);
    // danger first: hide from a raid boss's cataclysm, step out of telegraphed attacks and enemy ground effects
    if (this.takeCover(dt)) { this.watchStuck(dt); return; }
    // the Breach's casters can keep him side-stepping all fight long: healthy and barely hurt, he pushes on a while
    // (so does a rift's clock)
    if (this.braveT > 0) this.braveT -= dt;
    const brave = w.breach || w.rift;
    this.dangerList = null; // (dodgeDanger fills it: goTo waits at the edge of what it holds)
    if (!(this.braveT > 0 && p.hp > p.maxHp * 0.6) && this.dodgeDanger(dt)) {
      if (brave && (this.dodgeRun = (this.dodgeRun || 0) + dt) > (w.rift ? 2 : 6) && p.hp > p.maxHp * 0.7 && this.hurt < 0.02) { this.braveT = w.rift ? 4 : 3; this.dodgeRun = 0; }
      this.watchStuck(dt); return;
    }
    this.dodgeRun = Math.max(0, (this.dodgeRun || 0) - dt * 0.5);
    // raid mechanics (game/raidsigs.js): be where the fight says to be (beacons, conduits, the safe half...)
    if (this.mechGoal(dt)) { this.watchStuck(dt); return; }
    // Instant damage already landed, but hold the pose while the lances rain down.
    if (p.classId === 'dragoon' && w.time < this.dragoonCastUntil) {
      this.setStatus('Spearstorm!'); p.moveVec = [0, 0]; return;
    }
    // an Abyssal Rift's Guardian has stirred: on the clock, so auto-play runs for its arena (the chasers follow it in),
    // and once the rift is closed for the exit (picking up the hoard on the way); it fights only what blocks the way
    // (no ground gained on the path for 1.5 s: then 4.5 s of fighting, and it tries to run on again)
    const rush = this.riftRush(w), dash = rush ? w.boss : w.rift && w.rift.done ? w.portals.find((q) => q.type === 'exit') : null;
    if (dash) { const nd = this.navDist(dash.x, dash.y); if (!(nd > (this.rushBest ?? Infinity) - 0.5)) { this.rushBest = nd; this.rushT = 0; } else if ((this.rushT = (this.rushT || 0) + dt) > 6) this.rushT = -1.5; }
    else this.rushBest = this.rushT = undefined;
    const blocked = dash && this.rushT > 1.5;
    // (a foe he landed nothing on in 12 s of trying is left alone for a while: fighting it on is the loop)
    const foes = enemyNear(w, p, 13).filter((m) => w.map.los(p.x, p.y, m.x, m.y) && (!dash || m === w.boss || (blocked && Math.hypot(m.x - p.x, m.y - p.y) < 4)) && !(this.shun.get(m) > w.time));
    // a foe he is taking the stairs to stays in mind while the walls and stairs hide it (12 s from the last sighting)
    const ct = this.climbTo;
    if (ct && (ct.dead || w.time - this.climbSeen > 12)) this.climbTo = null;
    else if (ct && !foes.includes(ct)) foes.push(ct);
    // retreat to the town portal when nearly dead with nothing left to heal with
    const healLeft = c.potions.hp + c.potions.rejuv > 0 || this.readySkill((s) => s.kind === 'heal');
    const sealed = (w.raid && w.raid.sealed) || (w.velscour && w.velscour.phase > 0 && !w.velscour.m.dead); // no way out of a sealed boss room or Velscour's arena
    if (!this.retreat && p.hp < p.maxHp * stanceOf(c).retreat && !healLeft && foes.length && !sealed) this.retreat = true;
    if (this.retreat && (p.hp > p.maxHp * 0.75 || !foes.length && p.hp > p.maxHp * 0.5)) this.retreat = false;
    if (this.retreat) {
      const tp = w.portals.find((q) => q.type === 'town');
      this.setStatus('Retreating to town!');
      if (foes.length && p.castLock <= 0) this.combat(foes, true);
      if (tp && this.goTo(tp.x, tp.y, 1.2, dt)) { this.transitT = 3; G.game.enterTown(); return; }
      this.watchStuck(dt);
      return;
    }
    // a shrine a few steps away is worth grabbing even mid-fight (game/happenings.js)
    const sh = w.chests.find((ch) => ch.shrine && !ch.opened && !this.giveUp.has(ch) && dist(p.x, p.y, ch.x, ch.y) < 5);
    if (sh && this.navDist(sh.x, sh.y) < 7) {
      this.lootFor = sh;
      if ((this.lootT = this.spend(sh, dt)) > 6) this.giveUp.add(sh);
      this.setStatus(`Activating the ${sh.label}`);
      if (this.goTo(sh.x, sh.y, sh.reach - 0.2, dt)) sh.use();
      this.watchStuck(dt); return;
    }
    // a fight that needs him somewhere (a cache to dig, a relic to break, back inside its ring: game/dunes.js `duty`):
    // after a few seconds of fighting he pushes through to it, and stands on a cache until it is dug
    const duty = foes.length && w.overworldScenario && w.overworldScenario.duty;
    if (duty) {
      if (duty.hold && dist(p.x, p.y, duty.x, duty.y) <= duty.reach) { this.setStatus(duty.label); p.path = null; p.moveVec = [0, 0]; this.dutyT = this.dutyPush = 0; return; }
      if (!(this.dutyPush > 0) && (this.dutyT = (this.dutyT || 0) + dt) > 5) { this.dutyPush = 3; this.dutyT = 0; }
      if (this.dutyPush > 0) {
        this.dutyPush -= dt; this.setStatus(duty.label);
        if (this.goTo(duty.x, duty.y, duty.reach * 0.8, dt)) this.dutyPush = 0;
        this.watchStuck(dt); return;
      }
    } else this.dutyT = this.dutyPush = 0;
    if (foes.length) { this.combat(foes, false); this.watchStuck(dt); return; }
    this.target = null;
    // keep pets and buffs up between fights
    if (p.castLock <= 0 && !p.channel) this.preCast(w);
    // Town Commission objects (game/commissions.js): walk to each one in the level and use it
    const co = w.chests.filter((ch) => ch.commission && !ch.opened && !this.giveUp.has(ch));
    if (co.length) {
      let best = null, bd = Infinity;
      for (const ch of co) { const d = this.navDist(ch.x, ch.y); if (d < bd) { bd = d; best = ch; } }
      if (best && bd < 400) {
        this.lootFor = best;
        if ((this.lootT = this.spend(best, dt)) > 60) this.giveUp.add(best); // can't get there
        this.setStatus(`Commission: the ${best.label}`);
        if (this.goTo(best.x, best.y, (best.reach || 1.3) - 0.2, dt)) best.use();
        this.watchStuck(dt); return;
      }
    }
    // townsfolk bounties on the overworld maps (game/wanderers.js): take them, fetch the heirloom, hunt the mark
    const bg = w.kind === 'dungeon' && w.overworldScenario && bountyGoal(w);
    if (bg && this.navDist(bg.x, bg.y) < 80 && !(this.bountySkip > w.time)) {
      if (this.bountyFor !== bg.what) { this.bountyFor = bg.what; this.bountyT = 0; }
      if ((this.bountyT += dt) > 25) this.bountySkip = w.time + 60; // can't get there: leave it a while
      this.setStatus(bg.what);
      if (this.goTo(bg.x, bg.y, bg.reach, dt) && bg.use) bg.use();
      this.watchStuck(dt); return;
    }
    // Outdoor trials are explicitly shrine-started; auto-play must participate instead of
    // roaming forever after killing ambient enemies. Combat and self-preservation take priority.
    const ow = w.overworldScenario;
    if (ow && !ow.completed && !ow.failed) {
      const nearEnemy = foes.some((m) => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 6);
      if (!ow.active) {
        if (w.breach && this.lootStep(w, dt)) { this.watchStuck(dt); return; } // the shrines' reliquaries, loot between fights
        this.setStatus(w.breach ? `To the shrine — ${ow.target?.title || 'the Breach Heart'}` : 'Finding the scenario shrine');
        if (this.goTo(ow.shrine.x, ow.shrine.y, 1.4, dt)) ow.shrine.use();
        this.watchStuck(dt); return;
      }
      let objective = null;
      if (ow.objective !== undefined) objective = ow.objective; // the trial says where to go (game/darkforest.js)
      else if (ow.type === 'zones' && ow.route && ow.route[ow.stage]) {
        const spot = ow.route[ow.stage];
        objective = { x: spot[0], y: spot[1], reach: 2.5 };
      } else if (ow.type === 'escort' && ow.escort && ow.routeIndex < ow.route.length) {
        objective = { x: ow.escort.x, y: ow.escort.y, reach: 3.5 };
      } else if (ow.markers.length && !nearEnemy) {
        objective = ow.markers.reduce((a,b) =>
          !a || Math.hypot(b.x-p.x,b.y-p.y) < Math.hypot(a.x-p.x,a.y-p.y) ? b : a, null);
      }
      // the Breach's fights keep arriving: after a while fighting with an objective waiting, push through to it
      if (objective && nearEnemy && w.breach) { this.objWait = (this.objWait || 0) + dt; if (this.objWait > 10) this.objPush = 4; } else this.objWait = 0;
      if (this.objPush > 0) this.objPush -= dt;
      if (objective && (!nearEnemy || this.objPush > 0)) {
        this.setStatus('Completing '+ow.title);
        if (this.goTo(objective.x, objective.y, objective.reach||1.4, dt) && objective.use) objective.use();
        this.watchStuck(dt); return;
      }
    }
    // a dungeon scenario that needs the hero somewhere (a stone to hold, a soul to lead: game/scenarios.js)
    const ds = w.scenario;
    if (ds && ds.objective && !ds.done && !ds.failed && !foes.some((m) => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 5)) {
      this.setStatus('Completing ' + ds.title);
      this.goTo(ds.objective.x, ds.objective.y, ds.objective.reach, dt);
      this.watchStuck(dt); return;
    }
    // loot, chests, then the job at hand
    if (!rush && this.lootStep(w, dt)) { this.watchStuck(dt); return; }
    const exit = w.portals.find((q) => q.type === 'exit');
    const bossDead = !w.boss || w.boss.dead;
    if (bossDead && exit && exit.active) {
      this.setStatus('Heading for the exit');
      if (this.goTo(exit.x, exit.y, Math.max(1.1, (exit.reach || 1.6) - 0.5), dt)) this.leaveLevel(w);
      this.watchStuck(dt);
      return;
    }
    const goal = this.huntGoal(w);
    if (goal) {
      this.setStatus(goal === w.boss ? `Hunting the guardian${w.boss.name ? ' — ' + w.boss.name : ''}` : 'Clearing the level');
      // no ground gained on it in 8 s of hunting it (the path field reaches a spot the hero can't): leave it for 30 s
      const nd = this.navDist(goal.x, goal.y);
      let h = this.hunts.get(goal);
      if (!h || nd < h.d - 1) this.hunts.set(goal, h = { d: nd, t: 0 });
      else if ((h.t += dt) > 8 && goal !== w.boss) { this.shun.set(goal, w.time + 30); this.hunts.delete(goal); }
      this.goTo(goal.x, goal.y, 1, dt);
    } else {
      // nothing known to hunt: walk to the nearest reachable tile not yet revealed, else to the exit
      const f = this.frontier(w);
      this.setStatus('Exploring');
      if (f) this.goTo(f[0], f[1], 1.2, dt);
      else if (exit) this.goTo(exit.x, exit.y, 1.1, dt);
    }
    this.watchStuck(dt);
  },
  /** The closest (by path) walkable tile next to an unrevealed one, or null. Cached for a second. */
  frontier(w) {
    const m = w.map, d = this.nav && this.nav.d;
    if (!d) return null;
    if (this.front && this.front.t > w.time) return this.front.at;
    let best = -1, bd = Infinity;
    const W = m.w, H = m.h, T = m.t, S = m.seen, unseen = (j) => T[j] === 1 && !S[j];
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (v < 2 || v >= bd) continue;
      const x = i % W, y = (i / W) | 0;
      if (!S[i] || (x + 1 < W && unseen(i + 1)) || (x > 0 && unseen(i - 1)) || (y + 1 < H && unseen(i + W)) || (y > 0 && unseen(i - W))) { bd = v; best = i; }
    }
    if (best < 0) return null;
    const at = [(best % m.w) + 0.5, ((best / m.w) | 0) + 0.5];
    this.front = { i: best, at, t: w.time + 1 };
    return at;
  },

  /** The next monster to walk to: the boss, unless the hero is under-levelled or something is close by. */
  huntGoal(w) {
    const p = G.player, c = G.char;
    const S = stanceOf(c);
    if (w.rift && w.boss && !w.boss.dead) return w.boss; // the Guardian ends the run: straight to it
    const farm = !!w.rift || c.level < depthLevel(w.depth) + S.farm; // the monster level, not the raw depth (they part after depth 60); a rift's quota wants the whole level
    let best = null, bd = Infinity;
    for (const m of w.creatures) {
      if (m.dead || m.team !== 'enemy' || m.targetable === false || this.giveUp.has(m) || this.shun.get(m) > w.time) continue;
      const d = this.navDist(m.x, m.y);
      if (d === Infinity) continue;
      const lim = m.goblin ? 60 : farm ? 999 : S.lim;
      if (m !== w.boss && d > lim) continue;
      const v = m === w.boss ? d + (farm ? 40 : 0) : m.goblin ? d - 30 : d;
      if (v < bd) { bd = v; best = m; }
    }
    if (!best && w.boss && !w.boss.dead) return w.boss;
    return best;
  },

  /** Seconds spent going for this loot, chest or shrine, summed over every try (flipping between targets can't reset it). */
  spend(o, dt) { const s = (this.lootSpent.get(o) || 0) + dt; this.lootSpent.set(o, s); return s; },
  /** Pick up good loot, gold and orbs, and open chests, when they're close. Returns true while busy with it. */
  lootStep(w, dt) {
    const p = G.player, c = G.char;
    let best = null, bd = 16;
    for (const g of w.loot) {
      if (g.z > 0 || g.t < 0.4 || this.giveUp.has(g)) continue;
      const lim = g.kind === 'gold' ? 9 : g.kind.startsWith('orb') ? 7 : 16;
      const d = this.navDist(g.x, g.y);
      if (d > lim || d >= bd || !this.wantLoot(g)) continue;
      bd = d; best = g;
    }
    for (const ch of w.chests) {
      if (ch.opened || ch.inert || this.giveUp.has(ch)) continue; // (inert: a scenario's goal marker, nothing to use)
      const d = this.navDist(ch.x, ch.y);
      if (d < (ch.far || 14) && d - (ch.far ? 6 : 0) < bd) { bd = d - (ch.far ? 6 : 0); best = ch; } // shrines and caches are worth a walk
    }
    // the last target picked up (gone from the ground) or opened: the looting is getting somewhere
    const lf = this.lootFor;
    if (lf && (w.chests.includes(lf) ? lf.opened : !w.loot.includes(lf))) { this.lootDry = 0; this.lootFor = null; }
    if (!best) return false;
    this.lootFor = best;
    // the time on each target is summed (a hero flipping between two items, or losing sight of one for a frame, never
    // starts its clock over), and 10 s with nothing coming off the ground gives up the whole pile there (a bag that
    // won't take it, a spot he can't stand on)
    if (w.time - this.lootBusy > 5) this.lootDry = 0;
    this.lootBusy = w.time;
    this.lootT = this.spend(best, dt);
    if (this.lootT > (best.far ? 20 : 8)) { this.giveUp.add(best); return false; } // unreachable
    if ((this.lootDry = (this.lootDry || 0) + dt) > (best.far ? 20 : 10)) {
      for (const g of w.loot) if (dist(g.x, g.y, best.x, best.y) < 6) this.giveUp.add(g);
      this.giveUp.add(best); this.lootDry = 0;
      return false;
    }
    if (best.use) {
      this.setStatus(best.shrine ? `Activating the ${best.label}` : best.scen ? best.label : best.label ? `Opening the ${best.label}` : 'Opening a chest'); // (a scenario's says what it does)
      if (this.goTo(best.x, best.y, (best.reach || 1.3) - 0.2, dt)) best.use();
      return true;
    }
    this.setStatus(best.kind === 'item' ? `Picking up ${best.label}` : 'Collecting');
    if (best.kind === 'item' && best.item.type !== 'potion' && bagFree(c) === 0 && !(best.item.type === 'gem' && c.bag.some((b) => b && b.type === 'gem' && b.gem === best.item.gem && b.tier === best.item.tier))) {
      if (!this.makeRoom(best.item)) { this.ignore.add(best.item); return false; }
    }
    p.lootTarget = best.kind === 'item' || best.kind === 'potion' ? best : null;
    this.goTo(best.x, best.y, 0.25, dt);
    return true;
  },

  leaveLevel(w) {
    const c = G.char;
    const next = w.depth + 1;
    const town = this.needTown();
    this.transitT = 3;
    if (w.breach) { G.game.breachExit(w, { auto: true, town }); return; }
    if (w.rift) { G.game.riftExit(w, { auto: true, town }); return; }
    if (w.unbound) { G.ui.log('Auto-play heads back to town.', '#8fe0ff'); G.game.enterTown(); return; }
    // the three portals down (game.portalChoice): the player has a few seconds to pick before auto-play does
    if (G.game.portalChoice) { G.game.portalChoice(w, { auto: true, town }); return; }
    c.depth = next;
    c.nextBiome = drawBiome(c, next);
    if (town) { G.ui.log('Auto-play heads back to town to trade.', '#8fe0ff'); G.game.enterTown(); }
    else G.game.enterDungeon();
  },
  needTown() {
    const c = G.char;
    this.sinceTown = (this.sinceTown || 0) + 1;
    if (gearOn() && bagFree(c) < BAG_LOW) return true; // hands off the gear: a full bag doesn't stop it (it leaves new gear on the ground)
    if (c.potions.hp < 5 && c.gold > potionPrice('hp', c) * 6 && heresyAllows('potion', c, null)) return true; // (Dry Throat: none to buy)
    if (this.sinceTown >= 4 && gearOn() && c.gold > 400 * Math.pow(1.06, c.level)) return true;
    return false;
  },

  // ---------------------------------------------------------------- dodging
  /** A raid boss is winding up its cataclysm: get out of its sight (behind a pillar) before it lands. */
  takeCover(dt) {
    const p = G.player, w = G.world, m = w.map;
    const g = w.hazards.find((h) => h.safeAt && !h.dead);
    if (!g) { this.cover = null; return false; }
    if (g.safeAt(p.x, p.y) && !this.cover) return false; // already hidden: fight on from here
    if (!this.cover || !g.safeAt(this.cover[0], this.cover[1])) {
      let best = null, bs = Infinity;
      const x0 = Math.floor(p.x), y0 = Math.floor(p.y);
      for (let y = y0 - 14; y <= y0 + 14; y++) {
        for (let x = x0 - 14; x <= x0 + 14; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          if (!m.circleFree(cx, cy, 0.35) || !g.safeAt(cx, cy)) continue;
          // well inside the shadow: its neighbours are hidden too
          if (!g.safeAt(cx + 0.6, cy) || !g.safeAt(cx - 0.6, cy) || !g.safeAt(cx, cy + 0.6) || !g.safeAt(cx, cy - 0.6)) continue;
          const d = this.navDist(cx, cy);
          if (d < bs) { bs = d; best = [cx, cy]; }
        }
      }
      if (!best) return false;
      this.cover = best;
    }
    this.setStatus('Taking cover!');
    this.goTo(this.cover[0], this.cover[1], 0.3, dt, false);
    return true;
  },

  /** The raid's rules for the hero right now: {goal, holdFire, still, move} read off the live hazards. */
  mechRules(w) {
    const p = G.player, r = { goal: null, holdFire: false, still: false, move: false };
    let bd = Infinity;
    for (const h of w.hazards) {
      if (h.dead) continue;
      if (h.holdFire) r.holdFire = true;
      if (h.autoStill) r.still = true;
      if (h.autoMove) r.move = true;
      const g = h.autoGoal && h.autoGoal();
      if (g) { const d = dist(p.x, p.y, g.x, g.y) - g.r; if (d < bd) { bd = d; r.goal = g; } }
    }
    return r;
  },
  mechGoal(dt) {
    const p = G.player, w = G.world;
    if (!w.raid && !w.hazards.some((h) => h.autoGoal)) { this.rules = null; return false; }
    const r = this.rules = this.mechRules(w);
    if (!r.goal) return false;
    const g = r.goal;
    if (dist(p.x, p.y, g.x, g.y) <= g.r) return false; // in place: fight from here (combat() holds position)
    this.setStatus('Raid mechanic!');
    // keep shooting on the way when the hero can
    const foes = enemyNear(w, p, 13);
    if (foes.length && p.castLock <= 0 && !r.holdFire) { const t = this.pickTarget(foes); if (t) { const pick = this.chooseSkill(foes, t, dist(p.x, p.y, t.x, t.y), true); if (pick && !['leap', 'dash'].includes(pick.sk.kind) && p.tryUseSkill(pick.sk, pick.x, pick.y, pick.sk.kind === 'melee' ? t : null)) this.countFocus(pick.sk); } }
    this.goTo(g.x, g.y, Math.max(0.3, g.r * 0.6), dt, false);
    return true;
  },

  /** Dangerous circles and lines on the ground right now (enemy telegraphs, delayed blasts, damaging zones). */
  dangers(w) {
    const out = [];
    for (const h of w.hazards) {
      if (h.team !== 'enemy' || h.dead) continue;
      if (h.danger) { h.danger(out); continue; } // raid hazards describe their own zones
      if (h instanceof Delayed) out.push({ x: h.x, y: h.y, r: h.r + 0.45 });
      else if (h instanceof Area && h.dmg && h.dmg[1] > 0) out.push({ x: h.x, y: h.y, r: h.r + 0.3 });
      else if (h.lob && h.exp && h.tx !== undefined) out.push({ x: h.tx, y: h.ty, r: h.exp + 0.4, minor: true });
    }
    for (const e of effects) {
      if (!(e instanceof Telegraph) || e.color === '#40ff60' || e.t >= e.dur) continue;
      if (e.kind === 'line') out.push({ line: true, x: e.x, y: e.y, x1: e.x + Math.cos(e.ang) * e.len, y1: e.y + Math.sin(e.ang) * e.len, r: e.w / 2 + 0.45 });
      else if (e.kind === 'cone') out.push({ cone: true, x: e.x, y: e.y, ang: e.ang, half: e.half + 0.15, r: e.len + 0.5 });
      else out.push({ x: e.x, y: e.y, r: (e.r || 1.5) + 0.45 });
    }
    return out;
  },
  inDanger(list, x, y) {
    for (const d of list) {
      if (d.outside) { if (((x - d.x) / d.rx) ** 2 + ((y - d.y) / d.ry) ** 2 > 1) return true; continue; } // Velscour's lava tide
      if (d.ring) {
        const r = Math.hypot(x - d.x, y - d.y);
        if (r > d.r0 && r < d.r1 && Math.abs(angleDiff(d.gap, Math.atan2(y - d.y, x - d.x))) > d.gapW / 2) return true;
      } else if (d.cone) {
        if (Math.hypot(x - d.x, y - d.y) < d.r && Math.abs(angleDiff(d.ang, Math.atan2(y - d.y, x - d.x))) < d.half) return true;
      } else if (d.line ? segDist(x, y, d.x, d.y, d.x1, d.y1) < d.r : Math.hypot(x - d.x, y - d.y) < d.r) return true;
    }
    return false;
  },
  dodgeDanger(dt) {
    const p = G.player, w = G.world, m = w.map;
    if (p.channel) return false;
    let list = this.dangers(w);
    // a lobbed shot is worth eating once or twice to close on a shooter: healthy and not melting, push through
    const tough = p.hp > p.maxHp * 0.7 && this.hurt < 0.03 && enemyNear(w, p, 4).length < 3 && this.target && !this.target.dead && dist(p.x, p.y, this.target.x, this.target.y) > 2.2;
    if (tough) list = list.filter((d) => !d.minor);
    this.dangerList = list;
    if (this.dodge) {
      this.dodge.t -= dt;
      if (this.dodge.t > 0 && this.inDanger(list, p.x, p.y)) { this.setStatus('Dodging!'); this.steer(this.dodge.x, this.dodge.y); return true; }
      this.dodge = null;
    }
    if (!list.length || !this.inDanger(list, p.x, p.y)) return false;
    const foes = enemyNear(w, p, 8);
    let best = null, bs = -Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      for (const r of [1.4, 2.3, 3.3]) {
        const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (!m.circleFree(x, y, 0.3) || !m.losWide(p.x, p.y, x, y) || this.inDanger(list, x, y)) continue;
        let s = -r;
        for (const f of foes) s += Math.min(3, dist(x, y, f.x, f.y)) * 0.15;
        // side-step toward a shooter rather than away from it, so the gap still closes
        const t = this.target;
        if (t && !t.dead && (t.ai === 'ranged' || t.ai === 'caster')) s -= dist(x, y, t.x, t.y) * 0.35;
        if (s > bs) { bs = s; best = [x, y]; }
      }
    }
    if (!best) return false;
    this.dodge = { x: best[0], y: best[1], t: 0.9 };
    this.setStatus('Dodging!');
    this.steer(best[0], best[1]);
    return true;
  },

  // ---------------------------------------------------------------- potions
  potions(w) {
    const p = G.player, c = G.char;
    if (p.potionCd > 0 || p.dead || !heresyAllows('potion', c, w)) return; // Dry Throat (game/heresies.js): it never tries
    const boss = w.boss && !w.boss.dead && w.boss.awake && dist(p.x, p.y, w.boss.x, w.boss.y) < 14;
    const hpK = p.hp / p.maxHp;
    const regen = p.potionRegen.some((r) => r.hp > 0);
    if (hpK < 0.28 && c.potions.rejuv > 0) return p.usePotion('rejuv');
    const S = stanceOf(c);
    if (hpK < (boss ? S.potBoss : S.pot) && !regen && c.potions.hp > 0) return p.usePotion('hp');
    if (hpK < 0.35 && !regen && c.potions.rejuv > 0) return p.usePotion('rejuv');
    const main = SKILLS[c.bar[0]];
    const needMana = main && manaCost(main, effLevel(p, main)) > 0;
    if (needMana && p.mana < p.maxMana * 0.18 && !p.potionRegen.some((r) => r.mp > 0) && c.potions.mp > 0 && enemyNear(w, p, 10).length) return p.usePotion('mp');
    if (boss && c.potions.fury > 0 && !(p.furyT > 0) && w.boss.hp < w.boss.maxHp * 0.95) return p.usePotion('fury');
  },

  // ---------------------------------------------------------------- combat
  barSkills() {
    const c = G.char, p = G.player;
    return [...new Set(c.bar)].map((id) => id && SKILLS[id]).filter((sk) => sk && effLevel(p, sk) > 0);
  },
  readySkill(pred) {
    const p = G.player;
    return this.barSkills().find((sk) => pred(sk) && !p.canUse(sk));
  },
  meleeBuild() {
    const sk = SKILLS[G.char.bar[0]];
    return ['lancer', 'barbarian', 'dragoon'].includes(G.char.classId) ||
      !!sk && ['melee', 'whirl', 'leap', 'dash'].includes(sk.kind);
  },

  pickTarget(foes) {
    const p = G.player, w = G.world;
    let best = null, bs = Infinity;
    for (const m of foes) {
      if ((this.shun.get(m) || 0) > w.time && foes.length > 1) continue;
      let s = dist(p.x, p.y, m.x, m.y);
      if (m === this.target) s -= 1.5;
      if (m.isWard) s -= 6; // a raid boss's warding crystals: break them first
      if (m.goblin) s -= 5; // a treasure imp before it escapes (game/happenings.js)
      if (m.raidPriority) s -= m.raidPriority; // heads, thralls, pipes, corpses (game/raidsigs.js)
      if (this.rules && this.rules.holdFire && m.rank === 'boss') s += 50;
      else if (m.rank === 'boss') s -= m.ward < 1 ? -4 : 2.5;
      else if (m.rank === 'unique' || m.rank === 'champion') s -= 0.5;
      if (m.hp < m.maxHp * 0.3) s -= 0.7;
      if (m.ai === 'ranged' || m.ai === 'caster') s -= 0.4;
      if (this.offTier(m.x, m.y)) s += 12; // up on the walls (or down in the ward): fight what's on his own level first
      if (s < bs) { bs = s; best = m; }
    }
    return best;
  },
  /**
   * On a height map: is (x,y) on another level than the hero, more than a drop apart (a wall-walk over the ward, the
   * ward under it)? Auto-play fights there by walking the stairs, never by shooting up or leaping off.
   */
  offTier(x, y, from = G.player) {
    const m = G.world.map;   // (the Castle's walls: on hills and islands a ledge is fought from where he stands)
    return !!m.rampartDeck && Math.abs(m.hgt[m.tileIdx(x, y)] - m.hgt[m.tileIdx(from.x, from.y)]) > m.drop;
  },
  /** May the hero leap, dash or blink from where he stands to (x,y)? On a height map only along ground that stays
   *  within a hop of both ends: never up onto the walls or off them, or across a stair's side. */
  hopLine(x, y) {
    const m = G.world.map, p = G.player;
    if (!m.hgt) return true;
    const H = m.hgt, a = H[m.tileIdx(p.x, p.y)], b = H[m.tileIdx(x, y)], k = m.rampartDeck ? m.climb : m.drop; // (hills: a ledge is fine)
    if (Math.abs(a - b) > k) return false;
    const lo = Math.min(a, b) - k, hi = Math.max(a, b) + k, n = Math.ceil(dist(p.x, p.y, x, y) * 3);
    for (let i = 1; i < n; i++) { const h = H[m.tileIdx(p.x + (x - p.x) * i / n, p.y + (y - p.y) * i / n)]; if (h < lo || h > hi) return false; }
    return true;
  },

  /**
   * 0..1: how hard the hero can press in. High when over-levelled for the depth, healthy and barely scratched;
   * drops fast when life is low or melting, and near a boss. Ranged builds close in and kite less as it rises.
   */
  boldness() {
    const p = G.player, w = G.world, c = G.char;
    const hpK = p.hp / p.maxHp;
    const S = stanceOf(c);
    let k = 0.55 + S.bold + clamp((c.level - depthLevel(w.depth || 1)) / 8, -0.5, 0.4) + (hpK - 0.7) * 0.9 - this.hurt * 4;
    if (w.boss && !w.boss.dead && w.boss.awake && dist(p.x, p.y, w.boss.x, w.boss.y) < 12) k -= 0.25;
    if (hpK < S.low) k = Math.min(k, 0.15);
    return clamp(k, 0, 1);
  },

  /** Fight: choose a skill and cast it, or move into position. */
  combat(foes, fleeing) {
    const p = G.player, w = G.world;
    const t = this.target = this.pickTarget(foes);
    if (!t) return;
    // a foe on another level that the hero can walk to (the Castle's walls by their stairs): go there to fight it
    const climb = !fleeing && this.offTier(t.x, t.y) && this.navDist(t.x, t.y) < 220;
    // watchdog: a target whose life hasn't moved in 4 s is walked right up to, after 6 s only damage is thrown at it, and
    // after 12 s (never a boss) it is left alone for 30 s. Kept per target, so flipping between two never starts it over.
    let sw = this.stalls.get(t);
    if (!sw || t.hp < sw.hp - 1) this.stalls.set(t, sw = { m: t, hp: t.hp, t: 0 });
    else if (!climb && (sw.t += 1 / 30) > 6) {
      this.banT = 5;
      if (sw.t > 12 && t.rank !== 'boss') { this.shun.set(t, w.time + 30); this.stalls.delete(t); }
    }
    this.stall = sw;
    if (this.banT > 0) this.banT -= 1 / 30;
    p.aim = [t.x, t.y];
    if (!fleeing) this.setStatus(`Fighting ${t.name || 'a monster'}`);
    // A Barbarian can run at distant visible foes WHILE channeling Whirlwind.
    // This feeds the same goTo/steer path waypoints as ordinary movement.
    if (p.channel instanceof Whirl && p.classId === 'barbarian') {
      // low on life with a potion working (or none left): spin back out of the crowd (how soon is the stance's call)
      const S = stanceOf(G.char), near = foes.filter((m) => dist(p.x, p.y, m.x, m.y) < 2.2).length;
      if (!fleeing && near >= 2 && p.hp < p.maxHp * S.backoff && t.rank !== 'boss' && (p.potionCd > 0 || p.potionRegen.some((r) => r.hp > 0) || G.char.potions.hp + G.char.potions.rejuv === 0) && this.kite(foes)) return;
      if (!fleeing && dist(p.x, p.y, t.x, t.y) > Math.max(0.7, p.channel.r * 0.65))
        this.goTo(t.x, t.y, Math.max(0.6, p.channel.r * 0.6), 1 / 30);
      return;
    }
    if (p.channel) return;
    if (climb) {
      if (this.climbTo !== t || w.map.los(p.x, p.y, t.x, t.y)) this.climbSeen = w.time;
      this.climbTo = t;
      const up = G.world.map.hgt[G.world.map.tileIdx(t.x, t.y)] > G.world.map.hgt[G.world.map.tileIdx(p.x, p.y)];
      this.setStatus(`Taking the stairs ${up ? 'up' : 'down'} to ${t.name || 'a monster'}`);
      // heals, buffs and minions on the way; no attacks across the height
      const pick = p.castLock <= 0 && this.chooseSkill(foes, t, dist(p.x, p.y, t.x, t.y), false);
      if (pick && ['heal', 'buff', 'summon'].includes(pick.sk.kind) && p.tryUseSkill(pick.sk, p.x + Math.cos(p.facing), p.y + Math.sin(p.facing))) this.lastCast[pick.sk.id] = w.time;
      this.goTo(t.x, t.y, 0.9, 1 / 30);
      return;
    }
    const d = dist(p.x, p.y, t.x, t.y);
    const melee = this.meleeBuild();
    const R = this.rules;
    if (R && R.holdFire && t.rank === 'boss') { this.setStatus('Holding fire — riposte!'); if (!this.kite([t])) p.moveVec = [0, 0]; return; }
    if (R && R.move && !fleeing && p.castLock <= 0 && Math.hypot(p.moveVec[0], p.moveVec[1]) < 0.1) {
      // static builds while standing: circle the target between casts
      const a = angleTo(t.x, t.y, p.x, p.y) + (this.strafe || (this.strafe = 1)) * 0.9, sx = t.x + Math.cos(a) * Math.max(2, d), sy = t.y + Math.sin(a) * Math.max(2, d);
      if (!G.world.map.circleFree(sx, sy, 0.3)) this.strafe = -this.strafe; else this.steer(sx, sy);
    }
    if (p.castLock <= 0) {
      const pick = this.chooseSkill(foes, t, d, fleeing);
      if (pick && p.tryUseSkill(pick.sk, pick.x, pick.y, pick.sk.kind === 'melee' ? t : null)) {
        this.countFocus(pick.sk);
        this.lastCast[pick.sk.id] = w.time;
        if (p.classId === 'dragoon') {
          if (pick.sk.m.barrage) {
            this.dragoonLastBarrage = pick.sk.m.barrage;
            this.dragoonCastUntil = w.time + (pick.sk.m.barrage === 3 ? 1.65 : 1.35);
            this.dragoonJumps = 0;
            this.dragoonJumpGoal = 3 + Math.floor(Math.random() * 6);
            this.dragoonLastWeaveAt = -1;
          } else if (pick.sk.kind === 'leap' || pick.sk.kind === 'dash') {
            this.dragoonJumps = Math.min(8, (this.dragoonJumps || 0) + 1);
          } else this.dragoonLastWeaveAt = this.dragoonJumps;
        }
        return;
      }
    }
    if (fleeing) return;
    // a raid rule pins the hero: stand still, or hold the spot the mechanic needs
    if (R && (R.still || (R.goal && dist(p.x, p.y, R.goal.x, R.goal.y) <= R.goal.r))) { if (R.still) p.moveVec = [0, 0]; return; }
    // positioning
    const near = foes.filter((m) => dist(p.x, p.y, m.x, m.y) < 2.2).length;
    const bold = this.boldness();
    let reach = engageRange(SKILLS[G.char.bar[0]], t, bold);
    // If a point-blank Spearstorm is ready, finish approaching after a leap
    // instead of idling at the primary jump attack's much greater reach.
    if (p.classId === 'dragoon' && this.readySkill((sk) => sk.m.barrage)) reach = Math.min(reach, 1.8);
    if (this.stall && this.stall.t > 4) reach = Math.min(reach, 1.6); // nothing is landing: walk right up to it
    // shooters and casters: don't trade shots from the edge of range (they win that), close in to a sure hit
    else if ((t.ai === 'ranged' || t.ai === 'caster') && p.hp > p.maxHp * 0.55) reach = Math.min(reach, Math.max(2.4, reach * (0.65 - 0.25 * bold)));
    // ranged builds back off between casts from a crowd, from a melee foe closing in, or from anything when hurt (how
    // soon is the stance's call); melee builds step out of the crowd while a potion works when life runs low
    const S = stanceOf(G.char), hpK = p.hp / p.maxHp;
    if (!melee) {
      reach *= S.stand;
      const closing = S.kiteNear >= 0 && foes.some((m) => (m.ai === 'melee' || m.ai === 'brute' || m.ai === 'charger' || m.ai === 'swarm' || m.ai === 'exploder') && dist(p.x, p.y, m.x, m.y) < m.r + p.r + (m.atkReach || 0.55) + S.kiteNear);
      if ((near >= S.kiteCrowd + Math.round(bold * 2) || (near >= 1 && hpK < S.kiteHp - 0.15 * bold) || (closing && t.rank !== 'boss')) && this.kite(foes)) return;
    } else if (near >= 1 && hpK < S.backoff && (p.potionCd > 0 || p.potionRegen.some((r) => r.hp > 0) || G.char.potions.hp + G.char.potions.rejuv === 0) && t.rank !== 'boss' && this.kite(foes)) return;
    if (d > reach || !w.map.los(p.x, p.y, t.x, t.y)) this.goTo(t.x, t.y, Math.max(0.6, reach * 0.85));
  },
  /** Step away from the crowd (ranged builds). */
  kite(foes) {
    const p = G.player, m = G.world.map, w = G.world;
    // commit to a retreat line for a moment: re-picking every tick zig-zagged the hero and strobed its facing
    const k = this.kiteTo;
    if (k && k.until > w.time && m.circleFree(k.x, k.y, 0.3) && dist(p.x, p.y, k.x, k.y) > 0.4) { this.setStatus('Kiting'); this.steer(k.x, k.y); return true; }
    let best = null, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, x = p.x + Math.cos(a) * 2.2, y = p.y + Math.sin(a) * 2.2;
      if (!m.circleFree(x, y, 0.3) || !m.losWide(p.x, p.y, x, y)) continue;
      let s = 0;
      for (const f of foes) s += Math.min(6, dist(x, y, f.x, f.y));
      s += m.rayLength(x, y, a, 3) * 0.6; // don't back into corners
      if (s > bs) { bs = s; best = [x, y]; }
    }
    if (!best) return false;
    this.kiteTo = { x: best[0], y: best[1], until: w.time + 0.45 };
    this.setStatus('Kiting');
    this.steer(best[0], best[1]);
    return true;
  },

  /** Best skill to cast right now, with its aim point, or null. */
  chooseSkill(foes, t, d, fleeing) {
    const p = G.player, w = G.world, c = G.char;
    const hpK = p.hp / p.maxHp;
    const boss = t.rank === 'boss';
    const crowdAt = (x, y, r) => foes.filter((m) => dist(x, y, m.x, m.y) <= r).length;
    const los = w.map.los(p.x, p.y, t.x, t.y);
    const choices = [];
    const consider = (sk, score, x = t.x, y = t.y) => {
      if (score > 0) choices.push({ sk, score, x, y });
    };
    const now = G.world.time;
    for (const sk of this.barSkills()) {
      if (p.canUse(sk)) continue;
      // Do not repeatedly overwrite a still-active spinning ring; this also
      // gives other shield abilities a turn in the rotation.
      if (sk.m.shields && w.hazards.some((h) => !h.dead && h.o?.sk === sk.id &&
        h.t < h.dur - 2)) continue;
      // Four seconds of useful Whirlwind at minimum, not a 0.1s spin at 10 Rage.
      if (sk.classId === 'barbarian' && sk.kind === 'whirl' && p.rage < 40) continue;
      // Spend 25 Rage on Earthquake only with surplus Rage and a real crowd,
      // keeping enough in reserve to initiate another Whirlwind.
      if (rageCost(sk) && this.barSkills().some((s) => s.kind === 'whirl') &&
        (p.rage < 85 || (t.rank !== 'boss' && foes.filter((m) => dist(m.x, m.y, t.x, t.y) < 2.5).length < 2))) continue;
      if (sk.kind === 'summon' && now - (this.lastCast[sk.id] || -99) < 1.5) continue;
      if (this.banT > 0 && !OFFENSIVE.has(sk.kind) && sk.kind !== 'heal') continue;
      const L = effLevel(p, sk), m = sk.m, cost = manaCost(sk, L);
      const lowMana = cost > 0 && p.mana - cost < p.maxMana * 0.12 && !boss;
      switch (sk.kind) {
        case 'heal': if (hpK < 0.55) consider(sk, 1e9 * (1 - hpK), p.x, p.y); continue;
        case 'buff':
          if (!p.buffs.some((b) => b.id === sk.id && b.t > 1.5)) consider(sk, 5e8, p.x, p.y);
          continue;
        case 'summon': {
          const mine = w.creatures.filter((x) => x.summon && x.skillId === sk.id && !x.dead).length;
          if (this.petCount(w) + (m.n || 1) > PET_CAP) continue; // past the cap a new minion only replaces an old one
          if (m.sum === 'revive') {
            if (mine < (m.max || m.n || 1) && w.corpses.some((k) => !k.used && dist(k.x, k.y, p.x, p.y) < 5)) consider(sk, 4e8, p.x, p.y);
          } else if (mine < summonMax(sk) || (m.dur && cooldown(sk) >= 3)) consider(sk, 4e8 - mine, t.x, t.y);
          continue;
        }
        case 'curse': {
          const self = m.at === 'self', r = 2.2 * (m.r ?? 1);
          const cx = self ? p.x : t.x, cy = self ? p.y : t.y;
          if (self ? d > 3.5 : d > 8.5 || !los) continue;
          const n = crowdAt(cx, cy, r);
          if (now - (this.lastCast[sk.id] || -99) < Math.max(2, skillDuration(sk, L) * 0.6)) continue;
          // bosses shrug off fear, freezes, confusion and charms (and most stuns)
          const fresh = (m.curse || ['amp']).some((k) => !(boss && CC.has(k)) && !(t.curses[k] && t.curses[k].t > 0.5) && !(t.status[k] && t.status[k].t > 0.2));
          if (fresh && (n >= 3 || boss || t.rank === 'unique' || t.rank === 'champion') && !lowMana) consider(sk, 3e8, cx, cy);
          continue;
        }
        case 'blink': {
          const crowded = crowdAt(p.x, p.y, 2) >= 2;
          if (fleeing || (crowded && hpK < 0.45)) {
            const away = this.escapePoint(foes, 6);
            if (away) consider(sk, 6e8, away[0], away[1]);
          } else if (this.meleeBuild() && d > 3 && d <= skillRange(sk) && los && !lowMana && this.hopLine(t.x, t.y)) consider(sk, 1e6, t.x, t.y);
          else if (m.nova && d < 3 && !lowMana) consider(sk, avg(p.skillDamage(sk, L)) * crowdAt(p.x, p.y, 2.2), p.x, p.y);
          continue;
        }
      }
      if (!OFFENSIVE.has(sk.kind) || fleeing && !['nova', 'orbit'].includes(sk.kind) && !m.ricochet) continue; // Shield Throw flies while he backs off
      // can it reach?
      let n = 1, ok = true, ax = t.x, ay = t.y;
      switch (sk.kind) {
        case 'melee': ok = d <= skillRange(sk) + t.r + 0.1; n = isWide(sk) ? crowdAt(p.x, p.y, skillRange(sk) + 0.4) : 1; break;
        case 'nova': { const r = 3 * (m.r ?? 1) * (1 + p.st.areaPct / 100); n = crowdAt(p.x, p.y, r * 0.95); ok = n > 0; ax = p.x; ay = p.y; break; }
        case 'orbit': n = crowdAt(p.x, p.y, sk.m.shields ? Math.max(1.5, 0.75 * (sk.m.r || 1) + 2.2) : 2.6); ok = n > 0 && d < 4; break;
        case 'whirl': n = crowdAt(p.x, p.y, 2.6); ok = n > 0 && d < 3; break;
        case 'zone': if (m.follow) { n = crowdAt(p.x, p.y, 2); ok = n > 0; } else { ok = d < 8.5 && los; n = crowdAt(t.x, t.y, 1.8); } break;
        case 'wall': ok = m.ring ? d < 2.6 : d < 7 && los; n = crowdAt(t.x, t.y, 2); break;
        case 'leap': ok = d <= 6.5 * (m.range ?? 1) && los && this.hopLine(t.x, t.y); n = crowdAt(t.x, t.y, 1.6); break; // never on or off the walls
        case 'dash': ok = d <= 5 * (m.range ?? 1) && los && this.hopLine(t.x, t.y); n = crowdAt(t.x, t.y, 1.5); break;
        case 'corpse': ok = w.corpses.some((k) => !k.used && dist(k.x, k.y, t.x, t.y) < 4 * (m.r ?? 1)) && d < 9 && los; n = crowdAt(t.x, t.y, 2); break;
        case 'aoe':
          if (m.barrage) {
            const { centers, radius } = spearBarrageAreas(sk, p.x, p.y, Math.atan2(t.y - p.y, t.x - p.x),
              1 + (p.st.areaPct || 0) / 100, (x, y) => w.map.isFloor(x, y));
            n = foes.filter((foe) => centers.some(([x, y]) => dist(x, y, foe.x, foe.y) <= radius + (foe.r || 0))).length;
            ok = d <= skillRange(sk) + (t.r || 0) && n > 0 && los;
            // Keep the enemy aim vector so the three circles rotate with the target;
            // spearBarrageAreas() still anchors their damage and visuals on the hero.
            ax = t.x; ay = t.y;
            break;
          }
          // fall through for ordinary ranged AoE skills
        case 'rain': case 'strike': case 'trap': n = crowdAt(t.x, t.y, 2); ok = d <= Math.min(9.5, skillRange(sk)) && los; break;
        default: ok = d <= reachOf(sk) * 0.92 && los; n = crowdAt(t.x, t.y, 2.2);
      }
      if (!ok) continue;
      if (lowMana) continue;
      const per = avg(p.skillDamage(sk, L)) * hitsPerCast(sk, Math.max(1, n), L);
      let score = per / Math.max(0.2, castTime(p, sk));
      if (cooldown(sk) >= 1.2) score *= 1.6; // fire cooldowns whenever they are up
      score *= focusMul(c.classId, sk); // the build focus: the Paladin swings hammers before anything else
      if (sk.m.ricochet && c.classId === 'paladin') score *= this.hammersSince > 0 ? 6 : 0.3; // and throws his shield between them
      if (sk.kind === 'leap' || sk.kind === 'dash') score *= d > 3 ? 2.5 : d > 1.8 ? 1.2 : 0.5;
      if (cost) score *= 1 - 0.35 * clamp(1 - p.mana / p.maxMana, 0, 1);
      consider(sk, score, ax, ay);
    }
    if (c.classId === 'bard' && p.score) this.bardMeasure(choices);
    if (!choices.length) return null;
    // Keep emergency heals, missing buffs, and summons ahead of DPS rotation.
    const urgent = choices.filter((x) => x.score >= 1e8).sort((a, b) => b.score - a.score);
    if (urgent.length) return urgent[0];
    if (c.classId === 'dragoon' && !fleeing) {
      const leaps = choices.filter((x) => x.sk.kind === 'leap' || x.sk.kind === 'dash')
        .sort((a, b) => (this.lastCast[a.sk.id] ?? -1000) - (this.lastCast[b.sk.id] ?? -1000) || b.score - a.score);
      const bursts = choices.filter((x) => x.sk.m.barrage)
        .sort((a, b) => this.dragoonLastBarrage === 1 ? b.sk.m.barrage - a.sk.m.barrage : a.sk.m.barrage - b.sk.m.barrage);
      const weave = choices.filter((x) => !x.sk.m.barrage && x.sk.kind !== 'leap' && x.sk.kind !== 'dash')
        .sort((a, b) => (this.lastCast[a.sk.id] ?? -1000) - (this.lastCast[b.sk.id] ?? -1000) || b.score - a.score);
      const jumps = this.dragoonJumps || 0, goal = this.dragoonJumpGoal || 3;
      if (bursts.length && (jumps >= goal || !leaps.length)) return bursts[0];
      // A barrage can be ready but outside its point-blank range: jump INTO
      // the mob before considering utility casts, even past the jump quota.
      const barrageWaiting = this.barSkills().some((sk) => sk.m.barrage && !p.canUse(sk));
      if (leaps.length && (jumps < goal || (barrageWaiting && !bursts.length && d > skillRange(SKILLS['dragoon.3.0'])))) return leaps[0];
      if (weave.length && jumps >= 2 && this.dragoonLastWeaveAt !== jumps && (jumps >= 8 || jumps % 3 === 0)) return weave[0];
      if (leaps.length && jumps < 8) return leaps[0];
      if (weave.length) return weave[0];
      if (bursts.length) return bursts[0];
    }
    // Leap/charge/blink replaces slow walking when a melee fighter is out of
    // range. A jump is only chosen after its usual range/LOS checks above.
    const main = SKILLS[c.bar[LMB]];
    const closing = d > 3.3 && (this.meleeBuild() ||
      (main && d > engageRange(main, t, this.boldness()) + 1.2));
    if (!fleeing && closing) {
      const gap = choices.filter((x) => ['leap', 'dash', 'blink'].includes(x.sk.kind))
        .sort((a, b) => b.score - a.score);
      if (gap.length) return gap[0];
    }
    // A valid skill that has been ignored in recent combat gets a turn even
    // when its raw damage is lower. Never override reach, Rage, mana, or CD checks.
    const lastUsed = (x) => this.lastCast[x.sk.id] ?? -1000;
    const overdue = choices.filter((x) => now - lastUsed(x) >= 9)
      .sort((a, b) => lastUsed(a) - lastUsed(b) || b.score - a.score);
    if (overdue.length) return overdue[0];
    choices.sort((a, b) => b.score - a.score);
    return choices[0];
  },
  /**
   * The Bard plays to the measure: a note that completes the 4/4 bar (a Cadence) is worth triple, one that would
   * overfill it (a Discord, which breaks Harmony) is dropped while anything else fits, and Da Capo waits for a
   * well-filled bar. Emergency heals are never held back. He also leans (a little: at most +-25%) toward notes
   * whose rhythm is one of the bar's melodies' own, and away from writing the same rhythm as his last bar, so the
   * songs come out tuneful and different.
   */
  bardMeasure(choices) {
    const p = G.player, sc = p.score, rem = MEASURE - sc.beats, rub = p.buffs.some((b) => b.t > 0 && SKILLS[b.id] && SKILLS[b.id].m.rubato);
    const beats = (sk) => (NOTES[bardNoteFor(p, sk)] || { beats: 0 }).beats; // the basic note shrinks to fit
    const writing = !bardPerforming(p), sofar = sc.notes.map((n) => n.g).join();
    for (const ch of choices) {
      const b = beats(ch.sk), g = bardNoteFor(p, ch.sk);
      if (ch.sk.m.dacapo) ch.score *= sc.beats >= 2 ? 4 : 0.2;
      else if (b && Math.abs(b - rem) < 1e-6) ch.score *= 3;
      if (writing && g && b) {
        ch.score *= 1 + 0.25 * bardFitGain(p, g);
        if (sc.rhythm && sc.rhythm.startsWith(sofar ? `${sofar},${g}` : g)) ch.score *= 0.85;
      }
    }
    if (rub) return;
    const fits = choices.filter((ch) => ch.sk.kind === 'heal' || beats(ch.sk) <= rem + 1e-6);
    if (fits.length) choices.splice(0, choices.length, ...fits);
  },
  escapePoint(foes, r) {
    const p = G.player, m = G.world.map;
    let best = null, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!m.circleFree(x, y, 0.3) || !m.los(p.x, p.y, x, y) || !this.hopLine(x, y)) continue;
      const s = foes.reduce((acc, f) => acc + Math.min(8, dist(x, y, f.x, f.y)), 0);
      if (s > bs) { bs = s; best = [x, y]; }
    }
    return best;
  },
  /** The hero's living minions (createSummon caps them at PET_CAP). */
  petCount(w) { const p = G.player; let n = 0; for (const x of w.creatures) if (x.summon && x.owner === p && !x.dead) n++; return n; },
  /** Out of combat: raise permanent minions. */
  preCast(w) {
    const p = G.player;
    for (const sk of this.barSkills()) {
      if (sk.kind !== 'summon' || sk.m.dur || sk.m.sum === 'revive' || p.canUse(sk)) continue;
      if (p.score && beatsOf(sk) > MEASURE - p.score.beats + 1e-6) continue; // the Bard never breaks his measure for it
      const mine = w.creatures.filter((x) => x.summon && x.skillId === sk.id && !x.dead).length;
      if (mine < summonMax(sk) && this.petCount(w) + (sk.m.n || 1) <= PET_CAP && p.mana > p.maxMana * 0.5) { p.tryUseSkill(sk, p.x + Math.cos(p.facing), p.y + Math.sin(p.facing)); return; }
    }
  },

  // ================================================================ town
  townTick(dt) {
    const p = G.player, w = G.world, c = G.char;
    this.navT -= dt;
    if (!this.nav || this.navT <= 0) this.buildNav();
    if (!this.town) this.town = { steps: this.townPlan(), i: 0, phase: 'walk', t: 0 };
    const T = this.town;
    // skip errands with nothing to do there (a fresh hero heads straight for the portal); checked on arrival at
    // each step, so gold from the first sale still counts
    while (T.phase === 'walk' && T.t === 0 && T.steps[T.i] && !T.steps[T.i].chat && this.idle(T.steps[T.i])) T.i++;
    const step = T.steps[T.i];
    if (!step) {
      // the bag is full of what auto-play can't sell or stash (sealed treasures...): wait here until the player makes
      // room (breaks a seal, sells, drops). A seal broken meanwhile is trade goods: run the errands again for it.
      if (G.autoOpenSeals && bagFree(c) < BAG_LOW && c.bag.some((b) => b && b.sealed)) { for (const b of c.bag) if (b && b.sealed) b.sealed = false; T.i = 0; T.steps = this.townPlan(); return; } // tests: open them and shop again
      const sealedN = c.bag.filter((b) => b && b.sealed).length;
      this.sealWaiting = gearOn() && bagWait(c);   // hands off the gear: back down with a full bag, gear left on the ground
      if (!gearOn() && !bagFree(c) && !T.fullNote) { T.fullNote = true; G.ui.log('Your bag is full: auto-play goes on and leaves new gear on the ground (gold, potions and gems still come along). Make room whenever you like.', '#ffdf8a'); }
      if (this.sealWaiting) {
        if (T.sealedN !== undefined && sealedN < T.sealedN) { T.sealedN = sealedN; T.i = 0; T.steps = this.townPlan(); return; }
        T.sealedN = sealedN;
        this.setStatus(sealedN ? `Waiting in town: bag full — break the seals on ${sealedN} treasure${sealedN > 1 ? 's' : ''}` : 'Waiting in town: bag full — free a slot to go on');
        if (!T.sealNote) {
          T.sealNote = true;
          G.ui.centerMsg('YOUR BAG IS FULL', sealedN ? 'Break the seals on your treasures: auto-play waits in town' : 'Free a bag slot: auto-play waits in town', 4);
          G.ui.log(`Auto-play waits in town: the bag is full${sealedN ? ` (<b style="color:#ffdf8a">${sealedN} sealed treasure${sealedN > 1 ? 's' : ''}</b>). Tap SEALED (or open them in the inventory) to break the seals` : '. Sell, stash or drop something'} and it goes on once a slot is free.`, '#ffdf8a');
          sfx('error');
        }
        return;
      }
      T.sealNote = false;
      if (this.townSocial(dt)) return;
      // done: through the portal (the purple one when auto-play was told to take the Breach)
      const breach = this.dest === 'breach' && w.portals.find((q) => q.breach);
      const rift = this.dest === 'rift' && endgameUnlocked(c) && w.portals.find((q) => q.rift);
      const po = breach || rift || w.portals[0];
      this.setStatus(breach ? `To THE ETERNAL BREACH — Floor ${this.breachFloor()}` : rift ? `To the Abyssal Rift — Tier ${this.riftTier()}` : `To the portal — Depth ${c.depth}`);
      if (this.goTo(po.x, po.y, 1.3, dt)) {
        G.ui.closeAll();
        this.transitT = 4;
        this.sinceTown = 0;
        if (breach) G.game.enterBreach(this.breachFloor());
        else if (rift) G.game.enterRift(this.riftTier());
        else G.game.enterDungeon();
      }
      this.watchStuck(dt);
      return;
    }
    const npc = step.stash ? w.npcs.find((n) => n.stash) : vendorNpc(w, step.vendor);
    if (!npc) { T.i++; return; }
    T.t += dt;
    if (T.phase === 'walk') {
      this.setStatus(step.label);
      // blocked short of the counter (summons, props): trade from anywhere in reach, or give up on this vendor
      const reach = npc.reach || 1.8, d = dist(p.x, p.y, npc.x, npc.y);
      if (this.goTo(npc.x, npc.y, reach - 0.3, dt) || (T.t > 6 && d <= reach)) { T.phase = step.chat && isHomunculus(npc) && w.townLife ? 'chat' : 'open'; T.t = 0; }
      else if (T.t > 25) { G.ui.log(`Auto-play couldn't reach the ${npc.vendor ? npc.vendor.title : npc.name} and moved on.`, '#ff8080'); T.i++; T.t = 0; }
      this.watchStuck(dt);
      return;
    }
    if (T.phase === 'chat') {
      // Homunculus the Proud has something to say first (game/homunculus.js): stand, face him and read it
      if (!T.scene) T.scene = homunculusChat(w.townLife, npc);
      p.facing = Math.atan2(npc.y - p.y, npc.x - p.x);
      this.setStatus('Chatting with Homunculus');
      if (T.scene.done || T.t > 16) { T.scene = null; T.phase = this.idle(step) ? 'skip' : 'open'; T.t = 0; }
      if (T.phase === 'skip') { T.i++; T.phase = 'walk'; }
      return;
    }
    if (T.phase === 'open') {
      try { if (step.stash) Stash.open(); else Vendor.open(step.vendor); } catch (e) { console.warn('auto-play could not open a vendor', e); }
      T.phase = 'act'; T.t = 0;
      return;
    }
    if (T.phase === 'act' && T.t > 0.5) {
      try { if (!handsOff(step)) step.fn(); } catch (e) { console.warn('auto-play town step failed', e); }
      try { this.manageHero(); G.ui.refresh(); } catch (e) { console.warn('auto-play town step failed', e); }
      T.phase = 'linger'; T.t = 0;
      return;
    }
    if (T.phase === 'linger' && T.t > 1.1) {
      G.ui.closeAll();
      T.i++; T.phase = 'walk'; T.t = 0;
    }
  },

  /** Errands done: a word with any royalty in town (the King and Queen first), and now and then with a townsperson,
   *  before heading back down. Royals taking part in an event are watched until they are free. */
  townSocial(dt) {
    const T = this.town, p = G.player, d = G.world.townLife;
    if (!d || T.socialDone) return false;
    if (!T.social) {
      if (d.event && !d.event.done && d.time < 8) { this.setStatus('Looking around town'); return true; } // the royal train shows up a few seconds in
      const folk = d.agents.filter((a) => !a.hidden && !a.animal && !a.wild && !a.fixed && dist(a.x, a.y, p.x, p.y) < 30);
      const rank = (a) => { const i = ROYAL_ORDER.indexOf(a.role); return i < 0 ? ROYAL_ORDER.length : i; };
      const royals = folk.filter((a) => a.royal).sort((a, b) => rank(a) - rank(b)).slice(0, 2);
      const others = folk.filter((a) => !a.royal && !a.eventRole && dist(a.x, a.y, p.x, p.y) < 16).sort(() => Math.random() - 0.5);
      T.social = royals.length ? royals.slice() : [];
      if (others.length && Math.random() < (royals.length ? 0.2 : 0.4)) T.social.push(others[0]);
      T.visit = null;
    }
    let V = T.visit;
    if (!V) {
      const a = T.social.shift();
      if (!a) { T.socialDone = true; return false; }
      V = T.visit = { a, phase: 'walk', t: 0 };
    }
    const a = V.a;
    V.t += dt; V.all = (V.all || 0) + dt;
    if (a.hidden || (V.phase === 'walk' && V.t > 20) || V.all > 75) { T.visit = null; return true; } // gone indoors, or out of reach
    if (V.phase === 'walk') {
      this.setStatus(a.royal ? `Paying respects to ${a.name}` : `Saying hello to ${a.name}`);
      if (this.goTo(a.x, a.y, a.eventRole ? 2.8 : 1.5, dt)) { V.phase = a.eventRole ? 'watch' : 'talk'; V.t = 0; if (V.phase === 'talk') V.scene = heroVisit(d, a); }
      this.watchStuck(dt);
      return true;
    }
    p.facing = Math.atan2(a.y - p.y, a.x - p.x);
    if (V.phase === 'watch') {
      // the royal progress (or a knighting) is under way: watch from the crowd, then step up when they are free
      this.setStatus(`Watching ${a.name}`);
      if (!a.eventRole) { V.phase = 'walk'; V.t = 0; } else if (V.t > 40) T.visit = null;
      return true;
    }
    if (V.scene.done) T.visit = null;
    return true;
  },

  townPlan() {
    const c = G.char;
    const steps = [];
    if (c.stash && c.stash.some((b) => b && (b.type === 'gem' || this.stashUpgrade(b)))) steps.push({ stash: true, label: 'Checking the storage chest', fn: () => this.unstash() });
    const gear = (k) => () => this.gearGain(Vendor.stock[k]);
    steps.push({ vendor: 'weapons', label: 'Selling loot', want: () => c.bag.some((b) => b && b.type !== 'gem' && !b.sealed && !upgraded(b)) || this.gearGain(Vendor.stock.weapons), fn: () => { this.sellJunk(); if (this.buyGear(Vendor.stock.weapons)) this.sellJunk(); } }); // sell what the new piece replaced too: a nearly full bag has no slot for it
    steps.push({ vendor: 'alchemist', label: 'Buying potions', want: () => this.potionsWanted(), fn: () => this.buyPotions() });
    steps.push({ vendor: 'armor', label: 'Browsing armor', want: gear('armor'), fn: () => { if (this.buyGear(Vendor.stock.armor)) this.sellJunk(); } });
    if (c.bag.some((b) => b && b.type === 'gem') || c.gold > 2000) steps.push({ vendor: 'gems', label: 'Visiting the gem merchant', fn: () => this.gemShop() });
    steps.push({ vendor: 'socket', label: 'Visiting the jeweler', want: () => c.bag.some((b) => b && b.type === 'gem') || this.equipped().some((it) => it.sockets < it.maxSockets && socketCost(it) <= this.budget(0.3)) || this.gearGain(Vendor.stock.rings), fn: () => this.jeweler() });
    steps.push({ vendor: 'upgrade', chat: true, label: 'Visiting Homunculus the Proud', want: () => this.equipped().some((it) => (it.upg || 0) < 10 && upgradeCost(it) <= this.budget(0.45)), fn: () => this.blacksmith() });
    steps.push({ vendor: 'enchant', label: 'Enchanting gear', want: () => this.equipped().some((it) => it.rarity >= 1 && enchantCost(it, true) <= this.budget(0.2)), fn: () => this.enchanter() });
    steps.push({ vendor: 'gamble', label: 'Gambling', want: () => c.gold >= Math.round(180 * Math.pow(1.065, Math.max(c.level, depthLevel(c.depth || 1)))) * GAMBLE_GOLD && bagFree(c) >= 3, fn: () => { this.gamble(); this.sellJunk(); } });
    steps.push({ stash: true, label: 'Stashing gems and gear for later', want: () => c.bag.some((b) => b && forChest(b, c)), fn: () => this.stashExtras() });
    return steps;
  },
  wants(f) { try { return !!f(); } catch (e) { return true; } },
  /** Nothing to do at this town stop: its want() says so, or the gear is the player's. */
  idle(step) { return handsOff(step) || (!!step.want && !this.wants(step.want)); },
  equipped() { return SLOTS.map((s) => G.char.equip[s]).filter(Boolean); },
  /** Is anything in this shop list an affordable upgrade (same test as buyGear)? */
  gearGain(list) {
    const p = G.player, c = G.char;
    if (!list || !bagFree(c)) return false;
    const cur = simulate(p, () => () => {});
    const bar = Math.max(equipBar(cur), cur + 0.012);
    return list.some((it) => it && it.type === 'gear' && (it.req || 1) <= c.level && itemValue(it) <= this.budget(0.85) && fitScore(p, it, false).s > bar);
  },
  potionsWanted() {
    const c = G.char;
    return ['hp', 'mp', 'rejuv'].some((k) => c.potions[k] < (k === 'mp' ? 5 : POT_TARGET[k]) && c.gold >= potionPrice(k, c) && (k === 'hp' || c.gold - potionPrice(k, c) > potionPrice('hp', c) * 4));
  },
  /** Stored gear to take out: an upgrade now, or what auto-play put away until the hero could wear it (to wear or sell).
   *  What the player stored stays put: auto-play would sell it. */
  stashUpgrade(it) { return it.type === 'gear' && !it.sealed && !it.locked && (it.req || 1) <= G.char.level && ((it.autoStash === true && bagFree(G.char) >= 12) || this.isUpgrade(it)); },
  /** Storage chest: take out the gems (for the jeweler and fusing) and the stored gear that's an upgrade now. */
  unstash() {
    const c = G.char;
    c.stash.forEach((it, i) => {
      if (!it || (it.type === 'gear' && (bagFree(c) < 2 || !this.stashUpgrade(it)))) return;
      if (!addToBag(c, it)) return;
      c.stash[i] = null;
      if (it.type !== 'gear') return;
      this.optimizeGear();
      const j = c.bag.indexOf(it);
      if (j >= 0 && it.autoStash !== true) { c.bag[j] = null; c.stash[i] = it; } // not worn after all (rings weigh each other): a stored keeper goes back, unsold
    });
    changed();
  },
  /** Storage chest: put away every gem, the +N gear and the good gear the hero is still too low-level to wear. */
  stashExtras() {
    const c = G.char;
    let n = 0;
    const store = () => c.bag.forEach((it, i) => {
      if (!it || !forChest(it, c)) return;
      // future gear comes back out once the hero can wear it; keepers (+N, the loot filter's) only as an upgrade
      if (it.type === 'gear') it.autoStash = filterKeeps(it) || upgraded(it) ? 'keep' : true;
      if (addToStash(c, it)) { c.bag[i] = null; n++; } else delete it.autoStash;
    });
    store();
    // a full chest: make room by selling the weakest gear auto-play stored (+N gear last, then lowest rarity and item
    // level), then store the rest
    if (c.stash.every(Boolean)) {
      const worst = c.stash.map((b, i) => ({ b, i })).filter(({ b }) => b.type === 'gear' && b.autoStash && !b.locked).sort((a, b) => upgraded(a.b) - upgraded(b.b) || a.b.rarity - b.b.rarity || a.b.ilvl - b.b.ilvl).slice(0, 30);
      let gold = 0;
      for (const { b, i } of worst) { gold += sellPrice(b); c.stash[i] = null; }
      c.gold += gold;
      if (worst.length) G.ui.log(`The storage chest is full: auto-play sold ${worst.length} of the weakest pieces it stored for ${fmtInt(gold)} gold.`, '#ffd34a');
      store();
    }
    if (n) G.ui.log(`Auto-play stored ${n} item${n > 1 ? 's' : ''} in the storage chest.`, '#c8f0ff');
    changed();
  },
  budget(frac) {
    const c = G.char;
    const reserve = potionPrice('hp', c) * 10;
    return Math.max(0, (c.gold - reserve) * frac);
  },

  /** Sell everything in the bag that isn't an upgrade or a near-future one; keep gems unless the bag is crowded, and
   *  +N gear (for the chest). */
  sellJunk() {
    const p = G.player, c = G.char;
    this.optimizeGear();
    let gold = 0, n = 0;
    const future = {};
    c.bag.forEach((it, i) => {
      if (!it || it.sealed || it.locked || filterKeeps(it) || upgraded(it)) return; // only the player breaks a seal or sells what's locked; keepers and +N gear go to the chest
      if (it.type === 'gem') {
        const top = Math.max(0, ...SLOTS.flatMap((s) => (c.equip[s] ? c.equip[s].gems.map((g) => g.tier) : [])), ...c.bag.filter((b) => b && b.type === 'gem').map((b) => b.tier));
        if (bagFree(c) > 15 || GEMS[it.gem].special || GEMS[it.gem].sigil || it.tier >= top - 1) return;
      } else if (it.type === 'gear' && (it.req || 1) > c.level && (it.req || 1) <= c.level + 6 && it.rarity >= 2 && !future[it.slot]) {
        const s = fitScore(p, it).s;
        if (s > simulate(p, () => () => {}) + 0.02) { future[it.slot] = true; return; }
      }
      // gems socketed in gear we're selling: pry them out when that's cheap compared to their worth
      if (it.type === 'gear' && it.gems.length) {
        const worth = it.gems.reduce((a, g) => a + itemValue(makeGem(g.gem, g.tier)) / 4, 0);
        if (worth > unsocketCost(it) * 1.5 && c.gold >= unsocketCost(it) && bagFree(c) >= it.gems.length) {
          c.gold -= unsocketCost(it);
          for (const g of it.gems) addToBag(c, makeGem(g.gem, g.tier));
          it.gems = [];
        }
      }
      const price = sellPrice(it);
      c.bag[i] = null;
      c.gold += price; gold += price; n++;
    });
    if (n) G.ui.log(`Auto-play sold ${n} item${n > 1 ? 's' : ''} for ${fmtInt(gold)} gold.`, '#ffd34a');
    changed();
  },

  buyPotions() {
    const c = G.char;
    const caster = this.barSkills().some((sk) => manaCost(sk, 1) > 0 && sk.id === c.bar[0]);
    const want = { ...POT_TARGET, mp: caster ? 12 : 5 };
    let spent = 0;
    for (const k of ['hp', 'mp', 'rejuv', 'fury']) {
      const price = potionPrice(k, c);
      while (c.potions[k] < want[k] && c.gold >= price && (k === 'hp' || c.gold - price > potionPrice('hp', c) * 4)) {
        c.gold -= price; c.potions[k]++; spent += price;
      }
    }
    if (spent) G.ui.log(`Auto-play restocked potions for ${fmtInt(spent)} gold.`, '#ffd34a');
    changed();
  },

  /** Buy the best affordable upgrades from a shop list; returns how many it bought (what they replaced is in the bag). */
  buyGear(list) {
    const p = G.player, c = G.char;
    let n = 0;
    const done = new Set(); // one purchase per slot: a cheap small upgrade bought first would be sold for the big one
    for (let guard = 0; guard < 4; guard++) {
      const cur = simulate(p, () => () => {}), bar = Math.max(equipBar(cur), cur + 0.012);
      let best = -1, bv = 0, bslot = null;
      list.forEach((it, i) => {
        if (!it || it.type !== 'gear' || (it.req || 1) > c.level) return;
        const price = itemValue(it);
        if (price > this.budget(0.85)) return;
        const f = fitScore(p, it, false); // judged on its own sockets: the gold for new ones goes on the buy
        if (f.s <= bar || done.has(f.slot)) return; // must clear the bar optimizeGear wears it by, or sellJunk sells it straight back
        if (this.betterElsewhere(it, f.s, list)) return; // another shop has a stronger one for this slot: buying both sold this one straight back
        const v = (f.s - cur) / (0.3 + price / Math.max(1, c.gold));
        if (v > bv) { bv = v; best = i; bslot = f.slot; }
      });
      if (best < 0 || !bagFree(c)) break;
      if (!Vendor.buy({ type: 'shop', list, i: best })) break;
      done.add(bslot);
      this.optimizeGear();
      n++;
    }
    return n;
  },

  /** Does another shop (weapons, armor, the jeweler's rings) sell a stronger affordable piece for `it`'s slot? Both the
   *  weaponsmith and the armorer sell shields: auto-play used to buy one here and a better one there, and sell the first. */
  betterElsewhere(it, s, list) {
    const p = G.player, c = G.char;
    for (const l of [Vendor.stock.weapons, Vendor.stock.armor, Vendor.stock.rings]) {
      if (!l || l === list) continue;
      for (const o of l) if (o && o !== it && o.type === 'gear' && o.slot === it.slot && (o.req || 1) <= c.level && itemValue(o) <= this.budget(0.85) && fitScore(p, o, false).s > s) return true;
    }
    return false;
  },

  gemShop() {
    const p = G.player, c = G.char;
    // the Gem Forge: fuse every triple it can afford, lowest grades first (never Sigils: Glyphwords need every rank)
    const fused = fuseAll(c, this.budget(0.3), true);
    if (fused) G.ui.log(`Auto-play fused ${fused} gem${fused > 1 ? 's' : ''} at the Gem Forge.`, '#c8f0ff');
    // buy gems for empty sockets when the bag has none that help
    const empty = SLOTS.reduce((a, s) => a + (c.equip[s] ? c.equip[s].sockets - c.equip[s].gems.length : 0), 0);
    for (let k = 0; k < empty; k++) {
      const list = Vendor.stock.gems;
      let best = -1, bv = 0;
      const cur = simulate(p, () => () => {});
      const slot = SLOTS.find((s) => c.equip[s] && c.equip[s].gems.length < c.equip[s].sockets);
      if (!slot) break;
      const it = c.equip[slot];
      list.forEach((g, i) => {
        if (!g || itemValue(g) > this.budget(0.2)) return;
        const gain = simulate(p, () => { it.gems.push({ gem: g.gem, tier: g.tier }); return () => { it.gems.pop(); }; }) - cur;
        if (gain > 0.003 && gain / itemValue(g) > bv) { bv = gain / itemValue(g); best = i; }
      });
      if (best < 0 || !bagFree(c)) break;
      Vendor.buy({ type: 'shop', list, i: best });
      this.socketGems();
    }
    changed();
  },

  jeweler() {
    const c = G.char;
    const spare = c.bag.reduce((a, b) => a + (b && b.type === 'gem' ? b.count || 1 : 0), 0);
    let added = 0;
    for (const s of ['weapon', 'body', 'offhand', 'head', 'legs', 'hands', 'feet']) {
      const it = c.equip[s];
      if (!it || it.locked || added >= spare + 1 || it.sockets >= it.maxSockets) continue;
      const cost = socketCost(it);
      if (cost > this.budget(0.3)) continue;
      c.gold -= cost; it.sockets++; added++;
      G.ui.log(`Auto-play had a socket added to ${escapeHtml(itemName(it))}.`, '#c8f0ff');
    }
    this.glyphwork();
    this.socketGems();
    this.buyGear(Vendor.stock.rings || []); // the jeweler's rings: augments for the bar's skills
    changed();
  },

  /**
   * Write a Glyphword (data/relics.js) when the bag's Sigils spell one: take a plain item of a slot it fits (from the
   * bag, else a shop's), give it exactly that many sockets, set the Sigils in order. optimizeGear then decides whether
   * to wear it; a written word is kept (it's never sold: upgraded-or-relic rule in sellJunk).
   */
  glyphwork() {
    const c = G.char, p = G.player;
    if (!gearOn()) return false;
    const have = {};
    for (const b of c.bag) if (b && b.type === 'gem' && GEMS[b.gem].sigil) have[b.tier] = (have[b.tier] || 0) + (b.count || 1);
    if (!Object.keys(have).length) return false;
    const lvl = Math.max(1, c.level);
    for (const gw of [...GLYPHWORDS].reverse()) { // the deepest words first
      const need = {};
      for (const r of gw.sig) need[r] = (need[r] || 0) + 1;
      if (!Object.entries(need).every(([r, n]) => (have[r] || 0) >= n)) continue;
      const n = gw.sig.length;
      const fits = (it) => it && it.type === 'gear' && it.rarity === 0 && !it.relic && !it.locked && !it.sealed && gw.slots.includes(it.slot) && it.maxSockets >= n && it.sockets <= n && !it.gems.length && (it.req || 1) <= c.level && it.ilvl >= lvl - 12;
      let idx = c.bag.findIndex(fits);
      if (idx < 0) {
        for (const list of [Vendor.stock.weapons, Vendor.stock.armor]) {
          const i = (list || []).findIndex((it) => fits(it) && itemValue(it) <= this.budget(0.3));
          if (i >= 0 && bagFree(c) && Vendor.buy({ type: 'shop', list, i })) { idx = c.bag.findIndex(fits); break; }
        }
      }
      if (idx < 0) continue;
      const it = c.bag[idx];
      let cost = 0; const s0 = it.sockets;
      while (it.sockets < n) { cost += socketCost(it); it.sockets++; }
      if (cost > c.gold) { it.sockets = s0; continue; }
      c.gold -= cost;
      for (const r of gw.sig) { const gi = c.bag.findIndex((b) => b && b.type === 'gem' && b.gem === 'sig' && b.tier === r); socketGem(gi, { where: 'bag', idx: c.bag.indexOf(it) }); }
      if (glyphOf(it)) { G.ui.log(`Auto-play wrote the Glyphword <b style="color:#f2e2b0">${escapeHtml(gw.name)}</b>.`, '#f2e2b0'); this.optimizeGear(); return true; }
    }
    return false;
  },

  blacksmith() {
    const p = G.player, c = G.char;
    for (let guard = 0; guard < 10; guard++) {
      const cur = simulate(p, () => () => {});
      let best = null, bv = 0;
      for (const s of SLOTS) {
        const it = c.equip[s];
        if (!it || it.locked || (it.upg || 0) >= 10) continue;
        const cost = upgradeCost(it);
        if (cost > this.budget(0.45)) continue;
        const gain = simulate(p, () => { it.upg = (it.upg || 0) + 1; return () => { it.upg--; }; }) - cur;
        if (gain > 0.002 && gain / cost > bv) { bv = gain / cost; best = it; }
      }
      if (!best) break;
      c.gold -= upgradeCost(best);
      best.upg = (best.upg || 0) + 1;
      G.ui.log(`Auto-play upgraded ${escapeHtml(itemName(best))}.`, '#ffd34a');
    }
    changed();
  },

  enchanter() {
    const c = G.char;
    for (const s of ['weapon', 'body', 'head', 'offhand', 'hands', 'legs', 'feet']) {
      const it = c.equip[s];
      if (!it || it.locked || it.rarity < 1) continue;
      const n = it.affixes.filter((a) => !a.implicit).length;
      if (n >= RARITY[it.rarity].affixes[1] + 1) continue;
      const cost = enchantCost(it, true);
      if (cost > this.budget(0.2)) continue;
      c.gold -= cost;
      if (addAffix(it)) G.ui.log(`Auto-play enchanted ${escapeHtml(itemName(it))} with a new affix.`, '#c090ff');
    }
    changed();
  },

  gamble() {
    const c = G.char;
    const lvl = Math.max(c.level, depthLevel(c.depth || 1));
    const price = Math.round(180 * Math.pow(1.065, lvl));
    for (let k = 0; k < 2; k++) {
      if (c.gold < price * GAMBLE_GOLD || bagFree(c) < 3) break;
      // gamble for the weakest slot
      let slot = 'weapon', low = Infinity;
      for (const s of SLOTS) {
        const it = c.equip[s];
        const v = it ? powerLevel(it.ilvl, it.rarity) : -1;
        if (v < low) { low = v; slot = s; }
      }
      const btn = [...document.querySelectorAll('.panel[data-panel="vendor"] .btn')].find((b) => b.textContent.startsWith({ weapon: 'Weapon', offhand: 'Off-hand', head: 'Head', body: 'Body', hands: 'Hands', legs: 'Legs', feet: 'Feet' }[slot] || 'Ring'));
      if (!btn || btn.disabled) break;
      btn.click();
      this.optimizeGear();
    }
  },
};

