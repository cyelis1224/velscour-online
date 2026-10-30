import { G } from '../state.js';
import { net } from '../net/network.js';
import { rand, chance, clamp, angleTo, dist, TAU } from '../core/util.js';
import { sfx, levelUpFanfare } from '../core/audio.js';
import { camera } from '../core/view.js';
import { floatText, addEffect, Column, Ring, Sigil, SigilFlames, SkyBolts, sparkle, burst, spawn, elem, bloodSpray, smoke } from '../gfx/vfx.js';
import { Creature } from './creature.js';
import { CLASSES, DMG_TUNE, DMG_TUNE_AT } from '../data/classes.js';
import { SKILLS, CLASS_SKILLS, effLevel, skillBaseDamage, manaCost, rageCost, cooldown, useTime, weaponCoef, grantedSkillsAt, skillRange } from '../data/skills.js';
import { SLOTS, RING_SLOTS, itemStats, itemDmg, itemArmor, GEMS, shownEquip } from '../data/items.js';
import { augHits, augmentable } from '../data/rings.js';
import { depthLevel, fortitude, logCurve } from '../data/depth.js';
import { heroBonus } from './defiance.js';
import { MAX_MASTERY, masteryNeed, masteryMul, masteryTier, TIER_NAMES } from './augments.js';
import { castSkill, Timer } from './skillrun.js';
import { Orbit, Area, BeamCh, Whirl, Leap } from './hazards.js';
import { hit, aoe } from './combat.js';
import { heroLook, heroFrame, gearFxOf, finishOf } from '../core/gearart.js';
import { castArtFx } from '../gfx/artfx.js';
import { drawGearFx, updateGearFx } from '../gfx/gearfx.js';
import { heldHero, drawHeldLayer } from '../gfx/heldart.js';
import { fxColor } from '../data/gear.js';
import { freeSlot } from '../data/bar.js';
import { bardCompose, bardUpdate, harmonyMul } from './bard.js';
import { ASTRONOMER, astroAfterCast, astroUpdate } from './astronomer.js';
import { sigCast, sigHit, sigUpdate } from './signature.js';
import { bladeOnBack } from './sigs/deathknight.js';
import { relicBonuses } from '../data/relics.js';
import { relicProc } from './relicprocs.js';
import { noteFind, codexMf } from './reliquary.js';
import { markBonuses, gainMarkXp } from './marks.js';
import { heresyHero, heresyAllows } from './heresies.js';
import { endgame, saveEndgame } from './endgame.js';

// XP for the next level. The (L/30)^1.5 term paces a hero who clears every depth to stay ~10-50 levels above its
// monsters and reach ~270 by Velscour (depth 500, monster level 258); without it a full-clearing hero hit level 300
// by depth 160. Past level 240 a level costs L/240 times the level-240 price, so in the Endless Torment (depths past
// 500) a full-clearing hero keeps pace with its monsters and reaches the cap around depth 1200 (tools/tests/endgame.js).
const xpCurve = (L) => (60 * L * L + 40 * L) * (1 + Math.pow(L / 30, 1.5));
export const xpToNext = (L) => Math.round(L <= 240 ? xpCurve(L) : xpCurve(240) * L / 240);
export const MAX_LEVEL = 600;
/** The class's damage tuning at a hero level (data/classes.js DMG_TUNE). */
export function classTune(cls, level) {
  const T = DMG_TUNE[cls];
  return T ? logCurve(DMG_TUNE_AT.map((L, i) => [L, T[i]]), level) : 1;
}

const ELEM_KEYS = ['fire', 'cold', 'light', 'poison', 'arcane', 'holy', 'shadow', 'blood', 'acid'];

export class Player extends Creature {
  constructor(char) {
    super({ team: 'player', r: 0.3, speed: 4.2 });
    this.isPlayer = true;
    this.char = char;
    this.classId = char.classId;
    this.cls = CLASSES[char.classId];
    this.rage = char.classId === 'barbarian' ? clamp(Number(char.rage) || 0, 0, 100) : 0;
    this.spriteH = 60;
    this.cooldowns = {};
    this.castLock = 0;
    this.channel = null;
    this.potionCd = 0;
    this.potionRegen = [];
    this.buffs = [];
    this.moveVec = [0, 0];
    this.moveTarget = null;
    this.path = null;
    this.aim = null;
    this.hitCounter = 0;
    this.bashCastSerial = 0;
    this.bashRageClaim = -1;
    this.whirlAuto = false;
    this.phoenixCd = 0;
    this.infernoT = 0;
    this.st = {};
    this.recompute();
    this.hp = this.maxHp;
    this.mana = this.maxMana;
  }

  // ------------------------------------------------------------------ stats
  recompute() {
    const c = this.char, C = this.cls;
    const add = {};
    const put = (k, v) => { add[k] = (add[k] || 0) + v; };
    let itemArmorSum = 0;
    let weapon = null;
    const legendary = {};
    for (const slot of SLOTS) {
      const it = c.equip[slot];
      if (!it) continue;
      for (const [k, v] of itemStats(it)) put(k, v);
      itemArmorSum += itemArmor(it);
      if (slot === 'weapon') weapon = it;
      if (it.legendary) legendary[it.legendary] = true;
    }
    // Heirloom, Covenant and Glyphword powers and set bonuses (data/relics.js)
    const rb = relicBonuses(c.equip);
    for (const [k, v] of rb.stats) put(k, v);
    Object.assign(legendary, rb.legs);
    // buffs
    let buffDmg = 0, buffAs = 0, buffArmor = 0, buffRes = 0, buffRegen = 0, buffSpeed = 0, buffCrit = 0, buffThorns = 0, buffLeech = 0, buffBlock = 0, buffLife = 0, buffCdr = 0, buffProj = 0;
    let buffReduce = 0, buffMf = 0, buffGf = 0, buffXp = 0;
    for (const b of this.buffs) {
      const s = b.stats;
      buffDmg += s.dmg || 0; buffAs += s.as || 0; buffArmor += s.armor || 0; buffRes += s.res || 0; buffRegen += s.regen || 0;
      buffSpeed += s.speed || 0; buffCrit += s.crit || 0; buffThorns += s.thorns || 0; buffLeech += s.leech || 0; buffBlock += s.block || 0;
      buffLife += s.life || 0; buffCdr += s.cdr || 0; buffProj += s.proj || 0;
      buffReduce += s.reduce || 0; buffMf += s.mf || 0; buffGf += s.gf || 0; buffXp += s.xp || 0;
    }
    // Defiance (deaths in this five-depth block) and the town's blessing (game/defiance.js)
    const hb = heroBonus(c);
    buffDmg += hb.dmg; buffLife += hb.life; buffReduce += hb.reduce; buffMf += hb.mf + (this.codexMf = codexMf()); buffGf += hb.gf; buffXp += hb.xp;
    // the Endgame (docs/ENDGAME.md): Infernal Marks (every hero's) and the Glass Cannon Heresy (this hero's)
    const mk = this.marks = markBonuses(), hh = heresyHero(c);
    buffLife += mk.life + hh.life; buffDmg += hh.dmg; buffMf += mk.mf;
    const attr = (k) => c.attrs[k] + (add[k] || 0) + (add.allAttr || 0);
    const str = attr('str'), dex = attr('dex'), vit = attr('vit'), int = attr('int');
    const st = {
      str, dex, vit, int, legendary, procs: rb.procs,
      armor: Math.round((itemArmorSum + (add.armor || 0) + str) * (1 + ((add.armorPct || 0) + buffArmor) / 100)),
      res: {
        fire: (add.resFire || 0) + (add.resAll || 0) + buffRes,
        cold: (add.resCold || 0) + (add.resAll || 0) + buffRes,
        light: (add.resLight || 0) + (add.resAll || 0) + buffRes,
        poison: (add.resPoison || 0) + (add.resAll || 0) + buffRes,
        magic: Math.round(((add.resAll || 0) + buffRes) * 0.75),
      },
      critChance: clamp(5 + dex * 0.05 + (add.critChance || 0) + buffCrit / 4 + mk.crit, 0, 75),
      critDmg: 50 + (add.critDmg || 0),
      atkSpeed: Math.min(150, dex * 0.3 + (add.atkSpeed || 0) + buffAs),
      castSpeed: Math.min(150, int * 0.1 + (add.castSpeed || 0) + buffAs),
      moveSpeed: Math.min(80, (add.moveSpeed || 0) + buffSpeed * 0.6),
      lifeSteal: (add.lifeSteal || 0) + buffLeech / 4,
      manaSteal: add.manaSteal || 0,
      block: Math.min(60, (add.block || 0) + buffBlock / 2),
      thorns: (add.thorns || 0) + buffThorns * c.level * 0.2,
      goldFind: (add.goldFind || 0) + buffGf,
      magicFind: (add.magicFind || 0) + buffMf,
      xpPct: (add.xpPct || 0) + buffXp,
      reduce: Math.min(60, (add.reduce || 0) + buffReduce),
      fortitude: fortitude(c.level),
      cdr: Math.min(60, (add.cdr || 0) + buffCdr / 2),
      areaPct: add.areaPct || 0,
      projSpeed: add.projSpeed || 0,
      extraProj: (add.extraProj || 0) + buffProj,
      pierce: add.pierce || 0,
      chainPlus: add.chainPlus || 0,
      splitChance: add.splitChance || 0,
      echoChance: add.echoChance || 0,
      homing: add.homing || 0,
      novaOnCast: add.novaOnCast || 0,
      orbitOnCast: add.orbitOnCast || 0,
      bossDmg: add.bossDmg || 0,
      summonPct: add.summonPct || 0,
      skillsAll: add.skillsAll || 0,
      skillTree0: add.skillTree0 || 0, skillTree1: add.skillTree1 || 0, skillTree2: add.skillTree2 || 0, skillTree3: add.skillTree3 || 0,
      dmgPct: (add.dmgPct || 0) + buffDmg + (this.furyT > 0 ? 30 : 0),
      physPct: (add.physPct || 0) + str,
      elemPct: {},
      primary: { str, dex, vit, int }[C.primary],
      regenPct: buffRegen / 10,
    };
    for (const k of ELEM_KEYS) st.elemPct[k] = (add[k + 'Pct'] || 0) + int;
    st.weapon = weapon ? itemDmg(weapon) : [1, 3];
    // Barbarians can carry an actual second melee weapon instead of a shield.
    const second = c.equip.offhand;
    if (this.classId === 'barbarian' && second?.slot === 'weapon') {
      const pair = itemDmg(second);
      st.weapon = st.weapon.map((v, i) => (v + pair[i]) * 0.6);
      st.atkSpeed = Math.min(150, st.atkSpeed + 12);
    }
    if (weapon) { const fd = add.flatDmg || 0; st.weapon = [st.weapon[0] + fd, st.weapon[1] + fd]; }
    const lifePct = (add.lifePct || 0) + buffLife;
    this.maxHp = Math.round((C.life + (c.level - 1) * C.lifeLvl + vit * 3 + (add.life || 0)) * (1 + lifePct / 100) * st.fortitude);
    this.maxMana = Math.round(C.mana + (c.level - 1) * C.manaLvl + int * 2 + (add.mana || 0));
    st.lifeRegen = heresyAllows('regen', c) ? 0.6 + c.level * 0.12 + vit * 0.05 + (add.lifeRegen || 0) + this.maxHp * st.regenPct / 100 : 0; // Hunger of the Abyss: none
    st.manaRegen = 1.6 + c.level * 0.15 + int * 0.06 + (add.manaRegen || 0);
    this.st = st;
    this.augs = RING_SLOTS.flatMap((s) => (c.equip[s] && c.equip[s].aug) || []);
    this.augCache = new Map();
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.mana > this.maxMana) this.mana = this.maxMana;
    this.speed = 4.2 * (this.classId === 'barbarian' ? 1.25 : 1) * (1 + st.moveSpeed / 100);
    this.ghost = !!legendary.wraith && false;
    this.dirty = false;
  }

  skillLevel(sk) { return effLevel(this, sk); }

  /** The ring augments on skill sk as {id: power} (powers of the same augment add up), or null. */
  augFor(sk) {
    if (!this.augs || !this.augs.length || !sk) return null;
    let a = this.augCache.get(sk.id);
    if (a !== undefined) return a;
    a = null;
    for (const x of this.augs) if (augHits(x, sk)) { a = a || {}; a[x.id] = (a[x.id] || 0) + x.pow; }
    this.augCache.set(sk.id, a);
    return a;
  }

  // ------------------------------------------------------------------ skill mastery (1-1000, per skill)
  mastery(sk) { const m = this.char.mastery && this.char.mastery[sk.id || sk]; return m ? m[0] : 1; }
  gainMastery(id, xp) {
    const c = this.char;
    if (!c.skills[id] || xp <= 0) return;
    const m = c.mastery[id] || (c.mastery[id] = [1, 0]);
    if (m[0] >= MAX_MASTERY) return;
    m[1] += xp * (1 + this.st.xpPct / 100);
    let up = 0;
    while (m[0] < MAX_MASTERY && m[1] >= masteryNeed(m[0])) { m[1] -= masteryNeed(m[0]); m[0]++; up++; }
    if (m[0] >= MAX_MASTERY) m[1] = 0;
    if (up) this.masteryUp(SKILLS[id], m[0], masteryTier(m[0]) > masteryTier(m[0] - up));
  }
  masteryUp(sk, M, tierUp) {
    if (!sk) return;
    const E = elem(sk.el);
    floatText(this.x, this.y, 84, `${sk.name} ${M}`, E.glow, tierUp ? 16 : 12, { life: tierUp ? 2 : 1.2, vz: 30 });
    sparkle(this.x, this.y, 30, E.glow, tierUp ? 30 : 8, 0.6);
    if (tierUp) {
      addEffect(new Column(this.x, this.y, E.glow, 0.9, 40, 420));
      addEffect(new Ring(this.x, this.y, 0.2, 3.5, 0.9, E.glow, 6));
      burst(this.x, this.y, 30, sk.el, 30, 4, { up: 2 });
      sfx('levelup', 0.6);
      if (G.ui) G.ui.log(`<b style="color:${E.glow}">${sk.name}</b> reaches mastery ${M}: <b>${TIER_NAMES[masteryTier(M)]}</b>. Its power and effects grow.`, '#ffd860');
    } else if (M % 10 === 0 && G.ui) G.ui.log(`${sk.name} mastery ${M}.`, E.glow);
    if (G.ui) G.ui.refresh();
  }

  synergy(sk) {
    let pts = 0;
    for (const s of CLASS_SKILLS[this.classId]) if (s.tree === sk.tree && s.id !== sk.id) pts += this.char.skills[s.id] || 0;
    return 1 + pts * 0.03;
  }

  skillDamage(sk, L) {
    const st = this.st;
    const base = skillBaseDamage(sk, L);
    const wc = weaponCoef(sk);
    const elBonus = sk.el === 'phys' ? st.physPct : st.elemPct[sk.el] || 0;
    let mult = (1 + (st.dmgPct + st.primary + elBonus) / 100) * this.synergy(sk) * masteryMul(this.mastery(sk)) * classTune(this.classId, this.char.level) * (sk.m.pow ?? 1);
    if (st.legendary.berserk) mult *= 1 + 0.04 * Math.floor((1 - this.hp / this.maxHp) * 10);
    if (this.score) mult *= harmonyMul(this); // the Bard's Harmony
    const lo = (base * 0.85 + st.weapon[0] * wc) * mult, hi = (base * 1.15 + st.weapon[1] * wc) * mult;
    return [Math.max(1, Math.round(lo)), Math.max(2, Math.round(hi))];
  }

  heal(n, quiet) {
    if (this.dead || n <= 0) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (!quiet && this.hp - before > 1) floatText(this.x, this.y, 50, '+' + Math.round(this.hp - before), '#60ff60', 13);
  }

  addBuff(b) {
    const old = this.buffs.find((x) => x.id === b.id);
    if (old) { Object.assign(old, b); this.recompute(); return old; }
    this.buffs.push(b);
    this.recompute();
    return b;
  }

  // ------------------------------------------------------------------ progression
  gainXp(n, flat = false) { // flat: no penalty for out-levelling the depth (gilded critters pay by hero level)
    const c = this.char;
    const depth = depthLevel((this.world && this.world.depth) || 1);
    const diff = c.level - depth;
    const pen = !flat && diff > 5 ? Math.max(0.1, 1 - (diff - 5) * 0.1) : 1;
    const gain = Math.round(n * pen * (1 + this.st.xpPct / 100));
    if (c.level >= MAX_LEVEL) { gainMarkXp(gain); return; } // at the cap XP becomes Infernal Marks (game/marks.js)
    c.xp += gain;
    while (c.level < MAX_LEVEL && c.xp >= xpToNext(c.level)) {
      c.xp -= xpToNext(c.level);
      this.levelUp();
    }
    if (c.level >= MAX_LEVEL && c.xp > 0) { gainMarkXp(c.xp); c.xp = 0; } // the last level's spare XP counts too
  }
  levelUp() {
    const c = this.char;
    c.level++;
    c.statPoints += 5;
    c.skillPoints += 1;
    const granted = this.applyGrants();
    this.recompute();
    this.hp = this.maxHp; this.mana = this.maxMana;
    this.levelUpFx();
    if (G.ui) {
      if (G.ui.hud) G.ui.hud.levelUp(c.level, levelUpFanfare());
      for (const id of granted) G.ui.log(`New ability learned: <b>${SKILLS[id].name}</b>`, '#ffd860');
      G.ui.refresh();
    }
  }
  /** Grimdark level-up: a dark sigil bursting into flames, a column of blood-red hellfire, rainbow lightning forking
   *  into the sky, smoke and a blood fountain, a shove. */
  levelUpFx() {
    const { x, y } = this;
    G.hitStop = Math.max(G.hitStop, 0.08);
    camera.shake(7);
    sfx('thunder');
    const sig = addEffect(new Sigil(x, y, 2.6, 3.4, '#8a0a06', '#3a0000'), 'ground');
    addEffect(new SigilFlames(sig), 'ground');
    addEffect(new Column(x, y, '#7a0804', 1.6, 60, 520));
    addEffect(new Column(x, y, '#2a0000', 1.8, 90, 380));
    addEffect(new SkyBolts(x, y));
    addEffect(new Ring(x, y, 0.2, 6, 1.4, '#5a0404', 9, { fill: true }));
    smoke(x, y, 10, '#120606', 14, 14);
    sparkle(x, y, 30, '#a01008', 24, 0.9);
    burst(x, y, 30, 'blood', 36, 5, { up: 2.2 });
    for (let i = 0; i < 10; i++) bloodSpray(x, y, 30, (i * TAU) / 10, 6, '#5a0604', 1.8);
    // the blast throws nearby monsters back
    for (const m of this.world ? this.world.creatures : []) {
      if (m.team !== 'enemy' || m.dead || m.rank === 'boss') continue;
      const d = dist(x, y, m.x, m.y);
      if (d > 4 || d < 0.01) continue;
      const k = 14 * (1 - d / 4) + 4;
      m.kbx += ((m.x - x) / d) * k; m.kby += ((m.y - y) / d) * k;
    }
  }
  /** Grant default class abilities for the current level. Returns newly granted ids. */
  applyGrants() {
    const c = this.char;
    const out = [];
    for (const id of grantedSkillsAt(this.classId, c.level)) {
      if (!c.granted[id]) {
        c.granted[id] = true;
        if (!c.skills[id]) { c.skills[id] = 1; out.push(id); }
        // auto-slot into the first free bar slot
        if (!c.bar.includes(id)) {
          if (id.endsWith('.0.0') && !c.bar[0]) c.bar[0] = id;
          else {
            const free = freeSlot(c.bar);
            if (free >= 0) c.bar[free] = id;
          }
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ items & potions
  pickup(g) {
    const c = this.char;
    switch (g.kind) {
      case 'gold':
        c.gold += g.amount; sfx('gold');
        floatText(this.x, this.y, 46, `+${g.amount} gold`, '#ffd34a', 12);
        if (G.room && g.lootId) net.sendLootPickup(g.lootId);
        G.ui && G.ui.refresh();
        return true;
      case 'orb_hp': this.heal(this.maxHp * 0.15); sfx('orb'); return true;
      case 'orb_mp': this.mana = Math.min(this.maxMana, this.mana + this.maxMana * 0.18); sfx('orb'); floatText(this.x, this.y, 46, '+mana', '#6a8aff', 11); return true;
      case 'key': { // an Abyssal Key (docs/ENDGAME.md): three open Velscour Unbound
        c.keys = (c.keys | 0) + 1; endgame().keysFound++; saveEndgame();
        sfx('levelup', 0.5); floatText(this.x, this.y, 56, `ABYSSAL KEY ${Math.min(3, c.keys)}/3`, '#20e0ff', 15, { life: 2 });
        if (G.ui) { G.ui.log(`An <b style="color:#20e0ff">Abyssal Key</b>: ${c.keys} held${c.keys >= 3 ? ' — three open <b>Velscour Unbound</b> at the Altar of Heresy' : ' (three open Velscour Unbound)'}.`, '#a0f0ff'); G.ui.refresh(); }
        return true;
      }
      case 'potion':
        if ((c.potions[g.item.kind] || 0) >= 30) { if (g.t > 0.6 && !g.warned) { g.warned = true; floatText(this.x, this.y, 50, 'Potion belt full', '#ccc', 11); } return false; }
        c.potions[g.item.kind] = (c.potions[g.item.kind] || 0) + 1; sfx('pickup');
        if (G.room && g.lootId) net.sendLootPickup(g.lootId);
        G.ui && G.ui.refresh();
        return true;
      case 'item': {
        if (g.lootId) g.item._lootId = g.lootId;
        const ok = addToBag(c, g.item);
        if (!ok) { if (!g.warned) { g.warned = true; floatText(this.x, this.y, 50, 'Inventory full', '#ff8080', 12); sfx('error'); } return false; }
        sfx('pickup');
        if (G.room && g.lootId) net.sendLootPickup(g.lootId);
        if (G.ui) { G.ui.log(`Picked up <span style="color:${g.color}">${g.label}</span>`); G.ui.refresh(); }
        return true;
      }
    }
    return false;
  }

  usePotion(kind) {
    const c = this.char;
    if (this.dead || this.potionCd > 0) return;
    if (!heresyAllows('potion', c)) { floatText(this.x, this.y, 50, 'The Heresy forbids it', '#ff8060', 11); sfx('error'); return; } // Dry Throat
    if (!c.potions[kind]) { floatText(this.x, this.y, 50, 'No potions', '#ccc', 11); sfx('error'); return; }
    c.potions[kind]--;
    this.potionCd = 0.9;
    sfx('potion');
    switch (kind) {
      case 'hp': this.potionRegen.push({ hp: this.maxHp * 0.45 / 2, mp: 0, t: 2 }); break;
      case 'mp': this.potionRegen.push({ hp: 0, mp: this.maxMana * 0.5 / 2, t: 2 }); break;
      case 'rejuv': this.heal(this.maxHp * 0.35); this.mana = Math.min(this.maxMana, this.mana + this.maxMana * 0.35); break;
      case 'fury':
        this.furyT = 15;
        this.addBuff({ id: 'fury', name: 'Elixir of Fury', el: 'fire', stats: { as: 30 }, t: 15, max: 15 });
        burst(this.x, this.y, 20, 'fire', 20, 3);
        break;
    }
    const col = { hp: '#ff3030', mp: '#4060ff', rejuv: '#c040ff', fury: '#ffa020' }[kind];
    sparkle(this.x, this.y, 20, col, 12, 0.4);
    G.ui && G.ui.refresh();
  }

  // ------------------------------------------------------------------ skills
  canUse(skOrId) {
    const sk = typeof skOrId === 'string' ? SKILLS[skOrId] : skOrId;
    if (!sk) return 'unlearned';
    const L = this.skillLevel(sk);
    if (!L) return 'unlearned';
    if ((this.cooldowns[sk.id] || 0) > 0) return 'cooldown';
    if (sk.classId === 'barbarian' && ((sk.kind === 'whirl' && this.rage < 10) || this.rage < rageCost(sk))) return 'rage';
    if (this.mana < manaCost(sk, L)) return 'mana';
    return null;
  }

  tryUseSkill(skOrId, tx, ty, target = null) {
    const sk = typeof skOrId === 'string' ? SKILLS[skOrId] : skOrId;
    if (this.dead || !sk) return false;
    if (sk.classId === 'barbarian' && ((sk.kind === 'whirl' && this.rage < 10) || this.rage < rageCost(sk))) {
      if ((this.noRageT || 0) <= 0) { floatText(this.x, this.y, 60, 'Need Rage', '#ff9933', 12); this.noRageT = 0.8; }
      return false;
    }
    if (this.world.kind === 'town') {
      if ((this.noManaT || 0) <= 0) { floatText(this.x, this.y, 60, 'You cannot fight in town', '#c0b090', 12); this.noManaT = 1; }
      return false;
    }
    if (this.castLock > 0) { this.queued = { sk, tx, ty, target }; return false; }
    if (this.channel) {
      if (!(this.channel instanceof BeamCh)) return false;
      this.channel = null; // re-casting cancels a channelled beam
    }
    const L = this.skillLevel(sk);
    if (!L) return false;
    if ((this.cooldowns[sk.id] || 0) > 0) return false;
    const aug = this.augFor(sk), quick = aug && aug.haste ? 1 - Math.min(0.6, 0.25 * aug.haste) : 1;
    const cost = Math.round(manaCost(sk, L) * quick);
    if (this.mana < cost) {
      if ((this.noManaT || 0) <= 0) { floatText(this.x, this.y, 60, 'Not enough mana', '#6a8aff', 12); sfx('error'); this.noManaT = 0.8; }
      return false;
    }
    // melee needs to be in range of a clicked monster
    if (sk.kind === 'melee' && target && !target.dead) {
      const reach = skillRange(sk) + target.r;
      if (dist(this.x, this.y, target.x, target.y) > reach + 0.2) {
        this.attackTarget = { sk, target };
        this.moveTarget = null; this.path = null;
        return false;
      }
      tx = target.x; ty = target.y;
    }
    this.mana -= cost;
    if (this.st.legendary.surge && chance(0.15)) { this.mana += cost; sparkle(this.x, this.y, 30, '#c060ff', 6, 0.3); }
    if (this.st.procs.length) relicProc(this, 'cast', target && !target.dead ? target : null, 0);
    const spd = sk.attack ? this.st.atkSpeed : this.st.castSpeed;
    this.castLock = useTime(sk) / (1 + spd / 100);
    this.cooldowns[sk.id] = cooldown(sk) * (1 - this.st.cdr / 100) * quick;
    this.aim = [tx, ty];
    this.lastEl = sk.el;
    if (sk.id === 'barbarian.0.0') this.bashCastSerial++;
    const ok = castSkill(this, sk, L, tx, ty);
    let extra = null;
    if (this.classId === 'bard') {
      const sc = this.score;
      extra = {
        mel: sc?.mel ?? -1,
        keyId: sc?.keyId ?? null,
        tabAt: this.char?.tabAt ?? 0,
        bar: sc?.bar ?? 1,
        songI: sc?.song ? sc.song.i : null,
      };
    }
    if (G.room) net.sendSkillCast(sk.id, tx, ty, target?.id || null, L, extra);
    if (rageCost(sk)) { this.rage -= rageCost(sk); this.char.rage = this.rage; }
    // Attacks build Rage; no passive regeneration. Hits award most of the resource.
    if (this.classId === 'barbarian' && sk.attack) this.gainRage(sk.id === 'barbarian.0.0' ? 3 : sk.kind === 'whirl' ? 0 : 0.7);
    castArtFx(this, sk, tx, ty);
    if (this.classId === 'bard') bardCompose(this, sk, L); // write the note into the measure (may play a Cadence)
    if (this.classId === ASTRONOMER) astroAfterCast(this, sk, L, tx, ty); // chart the star the spell lands on
    sigCast(this, sk, L, tx, ty); // the class signature (game/signature.js) charges
    // casting trains the skill a little (kills with it train it more: combat.kill); skills that deal no damage train on casts alone
    const dl = depthLevel(this.world.depth || 1);
    this.gainMastery(sk.id, 4 * Math.pow(dl, 1.5) * (augmentable(sk) ? 0.15 : 1.2));
    const echo = (this.st.echoChance || 0) / 100 + (aug && aug.echo ? Math.min(0.6, 0.2 * aug.echo) : 0);
    if (echo && chance(echo) && sk.kind !== 'summon' && sk.kind !== 'buff') {
      this.world.addHazard(new Timer(0.2, () => { if (!this.dead) { castSkill(this, sk, L, this.aim ? this.aim[0] : tx, this.aim ? this.aim[1] : ty, { echo: true }); floatText(this.x, this.y, 64, 'Echo!', '#ff80ff', 11); } }));
    }
    this.moving = false;
    return true;
  }

  gainRage(amount) {
    if (this.classId !== 'barbarian' || amount <= 0) return;
    this.rage = Math.min(100, this.rage + amount);
    this.char.rage = this.rage;
  }

  onHit(tgt, dmg, el, o = {}) {
    sigHit(this, tgt, dmg, el, o);
    if (this.classId === 'barbarian' && !o.dot && o.sk?.startsWith('barbarian.')) {
      if (o.sk === 'barbarian.0.0') {
        // One large payout per landed Bash, not one payout for each lightning-fan bolt.
        if (this.bashRageClaim !== o.rageCast) {
          this.bashRageClaim = o.rageCast;
          this.gainRage(15);
        }
      } else this.gainRage(SKILLS[o.sk]?.kind === 'whirl' ? 0.35 : 2.5);
    }
    // Bash must not inherit the Paladin-like spiralling hammer from legendary procs.
    if (this.st.legendary.hammer && !(this.classId === 'barbarian' && o.sk === 'barbarian.0.0') && ++this.hitCounter % 6 === 0) {
      this.world.addHazard(new Orbit({ world: this.world, src: this, n: 1, radius: 1.6, dur: 2.5, spiral: true, fx: 'hammer', el: 'holy', dmg: [dmg * 0.5, dmg * 0.7], o: {}, speed: 5 }));
    }
    if (!o.proc && this.st.procs.length) relicProc(this, 'hit', tgt, dmg);
  }

  // ------------------------------------------------------------------ gear look
  /**
   * The hero image (gear art: the body armor's design and finish with the helm over the head; null = the class
   * has no gear art, and the old class sprite stands in). A single frame, drawn with the usual bob.
   */
  artFrame() {
    const eq = shownEquip(this.char), base = heroLook(this.classId, eq.body, eq.head); // the vanity looks over the real gear
    if (!base) return null;
    // the weapon and off-hand in his fists (src/gfx/heldart.js), unless the settings turn held gear off
    const held = G.settings.heldGear !== false ? heldHero(base, this.classId, eq) : null, img = held ? held.img : base;
    this.heldArt = { held, base };
    const f = heroFrame(this.classId, this.spriteH);
    return { img, frame: 0, cw: img.width, ch: img.height, ax: f.ax, ay: f.ay, k: f.k };
  }

  /** The body armor's effect and its colour (null below Rare, and for most Rares). */
  gearFx() {
    const b = shownEquip(this.char).body, fx = b && gearFxOf(b);
    return fx ? { fx, col: fxColor(fx, finishOf(b), b.rarity) } : null;
  }
  /** Called by Creature.drawArt around the hero image: 'back' before it, 'front' after. */
  drawArtLayer(ctx, layer, art) {
    const g = this.gearFx();
    if (g) drawGearFx(ctx, this, g.fx, g.col, layer, art);
    if (layer === 'front' && this.heldArt && G.settings.heldGear !== false) drawHeldLayer(ctx, this, this.heldArt.held, this.heldArt.base, art);
    if (layer === 'back' && this.classId === 'death_knight') bladeOnBack(ctx, this, art, this.heldArt?.base); // his flying sword at rest
  }

  // ------------------------------------------------------------------ death
  die(src) {
    if (this.st.legendary.phoenix && this.phoenixCd <= 0) {
      this.phoenixCd = 90;
      this.hp = this.maxHp * 0.5;
      addEffect(new Column(this.x, this.y, '#ff8020', 1, 50, 300));
      burst(this.x, this.y, 20, 'fire', 40, 5);
      floatText(this.x, this.y, 70, 'PHOENIX!', '#ffa020', 20, { life: 1.5 });
      sfx('roar');
      return;
    }
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.channel = null;
    sfx('die');
    if (G.game) G.game.onPlayerDeath(src);
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const st = this.st;
    this.animT += dt;
    const gfx = this.gearFx();
    if (gfx) updateGearFx(this, gfx.fx, gfx.col, dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.noManaT > 0) this.noManaT -= dt;
    if (this.phoenixCd > 0) this.phoenixCd -= dt;
    if (this.furyT > 0) this.furyT -= dt;
    if (this.noRageT > 0) this.noRageT -= dt;
    if (this.chatTimer > 0) {
      this.chatTimer -= dt;
      this.chatAge = (this.chatAge || 0) + dt;
      if (this.chatTimer <= 0) {
        this.chatBubble = null;
        this.chatTimer = 0;
        this.chatAge = 0;
      }
    }
    if (this.classId === 'bard' && this.world) bardUpdate(this, dt);
    if (this.classId === ASTRONOMER && this.world) astroUpdate(this, dt);
    if (this.world) sigUpdate(this, dt);
    const canAct = this.tickStatus(dt, (k, amount, src) => {
      hit(src, this, amount, k === 'burn' ? 'fire' : k === 'poison' ? 'poison' : 'blood', { dot: true });
    });
    if (this.dead) return;
    // a dash, leap or beam whose effect was swept away under him (a level section changing round him: game/caverns.js,
    // dunes.js, tower.js) would hold him channelling for good, unable to move or fight: let it go
    if (this.channel && this.world && !this.world.hazards.includes(this.channel)) { if (this.channel instanceof Leap) this.z = 0; this.channel = null; }
    // regen
    if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + st.lifeRegen * dt);
    if (this.mana < this.maxMana) this.mana = Math.min(this.maxMana, this.mana + st.manaRegen * dt);
    for (let i = this.potionRegen.length - 1; i >= 0; i--) {
      const r = this.potionRegen[i];
      const k = Math.min(dt, r.t);
      this.hp = Math.min(this.maxHp, this.hp + r.hp * k);
      this.mana = Math.min(this.maxMana, this.mana + r.mp * k);
      r.t -= dt;
      if (r.t <= 0) this.potionRegen.splice(i, 1);
    }
    if (this.potionCd > 0) this.potionCd -= dt;
    // buffs
    let changed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.t -= dt;
      if (b.pulse) {
        b.pulse.acc += dt;
        if (b.pulse.acc >= 1) {
          b.pulse.acc -= 1;
          const E = elem(b.el);
          addEffect(new Ring(this.x, this.y, 0.3, 2.6, 0.4, E.glow, 3));
          aoe(this.world, this, this.x, this.y, 2.6, rand(b.pulse.dmg[0], b.pulse.dmg[1]), b.el, { dot: false, slow: b.slowPulse });
        }
      }
      if (b.t <= 0) { this.buffs.splice(i, 1); changed = true; }
    }
    if (changed) this.recompute();
    this.scale = (this.buffs.some((b) => b.transform) ? 1.22 : 1) * (this.sigScale || 1); // sigScale: the Slime Lord's mass
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
    if (this.castLock > 0) {
      this.castLock -= dt;
      if (this.castLock <= 0 && this.queued) { const q = this.queued; this.queued = null; this.tryUseSkill(q.sk, q.tx, q.ty, q.target); }
    }
    // legendary passives
    if (st.legendary.orbit && !this.world.hazards.some((h) => h.legendaryOrbit && !h.dead)) {
      const d = this.skillDamage(SKILLS[`${this.classId}.0.0`], Math.max(1, this.char.skills[`${this.classId}.0.0`] || 1));
      const o = new Orbit({ world: this.world, src: this, n: 3, radius: 1.5, dur: 1e9, fx: 'blade', el: 'arcane', dmg: d.map((v) => v * 0.4), o: {} });
      o.legendaryOrbit = true;
      this.world.addHazard(o);
    }
    if (st.legendary.inferno && this.moving) {
      this.infernoT -= dt;
      if (this.infernoT <= 0) {
        this.infernoT = 0.3;
        const d = this.skillDamage(SKILLS[`${this.classId}.0.0`], 1);
        this.world.addHazard(new Area({ world: this.world, src: this, x: this.x, y: this.y, r: 0.7, dur: 2, tick: 0.5, dmg: d.map((v) => v * 0.3), el: 'fire', fx: 'fire' }));
      }
    }
    if (!canAct) { this.moving = false; return; }
    if (this.channel) return;
    // movement
    this.moving = false;
    if (this.castLock > 0) return;
    const [vx, vy] = this.moveVec;
    if (vx || vy) {
      this.moveTarget = null; this.path = null; this.attackTarget = null; this.interact = null;
      const sp = this.speed * this.speedMul();
      const moved = this.world.map.move(this, vx * sp * dt, vy * sp * dt, false);
      this.moving = moved;
      this.face(Math.atan2(vy, vx));
      return;
    }
    if (this.attackTarget) {
      const { sk, target } = this.attackTarget;
      if (target.dead) { this.attackTarget = null; return; }
      if (dist(this.x, this.y, target.x, target.y) <= skillRange(sk) + target.r) {
        this.attackTarget = null;
        this.tryUseSkill(sk, target.x, target.y, target);
        return;
      }
      this.walkTo(target.x, target.y, dt);
      return;
    }
    if (this.interact) {
      const t = this.interact;
      if (dist(this.x, this.y, t.x, t.y) <= (t.reach || 1.4)) { this.interact = null; this.moveTarget = null; this.path = null; t.use(); return; }
      this.walkTo(t.x, t.y, dt);
      return;
    }
    if (this.moveTarget) this.walkTo(this.moveTarget[0], this.moveTarget[1], dt);
  }

  setMoveTarget(x, y) {
    this.moveTarget = [x, y];
    this.path = null;
    this.pathFor = null;
  }

  walkTo(x, y, dt) {
    const m = this.world.map;
    const key = Math.floor(x) + ',' + Math.floor(y);
    if (!this.path || this.pathFor !== key) {
      this.pathFor = key;
      this.path = m.losWide(this.x, this.y, x, y) ? [[x, y]] : m.findPath(this.x, this.y, x, y, 2500) || [[x, y]];
    }
    const node = this.path[0];
    if (!node) { this.moveTarget = null; return; }
    const sp = this.speed * this.speedMul();
    const rem = this.moveToward(node[0], node[1], dt, sp);
    if (rem < 0.08 || (!this.moving && rem < 0.6)) {
      this.path.shift();
      if (!this.path.length) { this.moveTarget = null; this.path = null; }
    } else if (!this.moving) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 0.4) { this.stuckT = 0; this.moveTarget = null; this.path = null; }
    }
  }
}

/** Put an item in the first free bag slot (gems stack). */
export function addToBag(c, item) {
  if (c === G.char) noteFind(item); // the Codex (game/reliquary.js) records relics and Sigils as they come in
  if (item.type === 'gem') {
    const same = c.bag.find((b) => b && b.type === 'gem' && b.gem === item.gem && b.tier === item.tier);
    if (same) { same.count = (same.count || 1) + (item.count || 1); return true; }
  }
  const i = c.bag.findIndex((b) => !b);
  if (i < 0) return false;
  c.bag[i] = item;
  return true;
}

export { GEMS, TAU, angleTo, spawn };
