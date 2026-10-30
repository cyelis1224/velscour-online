// Rings and their skill augments. A hero wears up to four rings (ring1-4). Every ring carries one to three
// augments; each augment changes how a skill behaves (burning hammers, lightning-tethered orbits, chain lightning,
// meteors on hit, extra projectiles...) for one skill, a kind of skill, or (weaker) every skill. The runtime is
// game/augments.js; a skill's hits carry its augments in o.aug (skillrun.castSkill), summons inherit them.
import { pick, chance, rand } from '../core/util.js';
import { CLASS_SKILLS } from './skills.js';

const pc = (v) => `${Math.round(v * 100)}%`;

/** id: { name, el (colour), word (ring name prefix), desc(pow), hit(pow): [share of the skill's hit, what it is] for the
 *  tooltip's damage figure (ui/itemui.js) } */
export const AUGMENTS = {
  ignite: { name: 'Immolation', el: 'fire', word: 'Smouldering', desc: (p) => `Hits set enemies ablaze for ${pc(1.1 * p)} of the hit as fire over 3s. The skill burns with flame.`, hit: (p) => [1.1 * p, 'burning over 3 s'] },
  venom: { name: 'Venomous', el: 'poison', word: 'Venomous', desc: (p) => `Hits inflict a stacking poison: ${pc(0.8 * p)} of the hit over 4s. The skill drips venom.`, hit: (p) => [0.8 * p, 'of poison a hit, over 4 s'] },
  frost: { name: 'Rime', el: 'cold', word: 'Rimed', desc: (p) => `Hits chill, with a ${pc(Math.min(0.5, 0.14 * p))} chance to freeze solid and ${pc(0.25 * p)} bonus cold damage.`, hit: (p) => [0.25 * p, 'bonus cold a hit'] },
  storm: { name: 'Chain Lightning', el: 'light', word: 'Thundering', desc: (p) => `${pc(Math.min(0.85, 0.32 * p))} chance on hit to arc chain lightning through ${3 + Math.round(p)} enemies for ${pc(0.6 * p)} of the hit.`, hit: (p) => [0.6 * p, 'an arc'] },
  tether: { name: 'Storm Tether', el: 'light', word: 'Storm-Bound', desc: (p) => `Lightning tethers you to the skill's projectiles and orbiting weapons, shocking enemies caught in the arcs for ${pc(0.3 * p)} of its damage 4x a second.`, hit: (p) => [0.3 * p, 'a shock, 4 a second'] },
  detonate: { name: 'Detonation', el: 'fire', word: 'Volatile', desc: (p) => `${pc(Math.min(0.7, 0.22 * p))} chance on hit to explode for ${pc(0.75 * p)} of the hit around the target.`, hit: (p) => [0.75 * p, 'an explosion'] },
  smite: { name: 'Divine Smite', el: 'holy', word: 'Hallowed', desc: (p) => `${pc(Math.min(0.6, 0.18 * p))} chance on hit to call down a pillar of holy light for ${pc(1.2 * p)} of the hit.`, hit: (p) => [1.2 * p, 'a pillar'] },
  meteor: { name: 'Starfall', el: 'fire', word: 'Starfallen', desc: (p) => `${pc(Math.min(0.4, 0.08 * p))} chance on hit to call a meteor onto the target for ${pc(2.2 * p)} of the hit.`, hit: (p) => [2.2 * p, 'a meteor'] },
  rift: { name: 'Void Rift', el: 'shadow', word: 'Hollow', desc: (p) => `${pc(Math.min(0.4, 0.1 * p))} chance on hit to tear open a void rift for 2.6s that drags enemies in and shreds those at its heart for ${pc(0.3 * p)} of the hit 3x a second (~${pc(2.7 * p)} in all).`, hit: (p) => [0.3 * p, 'a pulse, 3 a second for 2.6 s'] },
  blood: { name: 'Blood Pact', el: 'blood', word: 'Sanguine', desc: (p) => `Hits make enemies bleed for ${pc(0.25 * p)} of the hit a second for 3s, and heal you for ${(2 * p).toFixed(1)}% of the damage dealt.`, hit: (p) => [0.25 * p, 'of bleeding a second, 3 s'] },
  shatter: { name: 'Shrapnel', el: 'phys', word: 'Splintering', desc: (p) => `${pc(Math.min(0.6, 0.2 * p))} chance on hit to burst into ${4 + Math.round(p)} shards for ${pc(0.35 * p)} of the hit each.`, hit: (p) => [0.35 * p, 'a shard'] },
  multiply: { name: 'Multiplicity', el: 'arcane', word: 'Manifold', desc: (p) => `+${multN(p)} projectiles, orbiting weapons, strikes, waves or minions.` },
  colossus: { name: 'Colossus', el: 'arcane', word: 'Colossal', desc: (p) => `+${pc(0.35 * p)} area and size: bigger blasts, wider orbits, larger projectiles.` },
  haste: { name: 'Quickening', el: 'cold', word: 'Quickened', desc: (p) => `${pc(Math.min(0.6, 0.25 * p))} lower mana cost and cooldown.` },
  echo: { name: 'Echo', el: 'arcane', word: 'Echoing', desc: (p) => `${pc(Math.min(0.6, 0.2 * p))} chance to cast the skill a second time for free.` },
};
export const AUG_IDS = Object.keys(AUGMENTS);
export const multN = (p) => Math.max(1, Math.round(p * 1.2));

/** What an augment may target: one skill, a kind of skill, or every skill. */
export const SCOPE_MUL = { skill: 1.6, kind: 1.0, all: 0.6 };
/** An augment's power by the ring's power level (item level + rarity worth, data/items.js powerLevel). */
export const augPower = (pl) => 0.6 + pl * 0.008;
export const RING_NAMES = ['Copper Band', 'Iron Ring', 'Silver Ring', 'Gold Ring', 'Jeweled Ring', 'Signet', 'Runed Seal', 'Star Loop', 'Abyssal Coil', 'Crown Ring'];
export const KIND_NAMES = {
  melee: 'Melee', proj: 'Projectile', nova: 'Nova', aoe: 'Blast', beam: 'Beam', chain: 'Chain', wall: 'Wall', zone: 'Field', orbit: 'Orbit',
  cyclone: 'Cyclone', whirl: 'Whirlwind', leap: 'Leap', dash: 'Dash', summon: 'Summon', trap: 'Trap', rain: 'Rain', strike: 'Strike', fissure: 'Fissure', corpse: 'Corpse',
};

/** Skills a ring can name: anything that deals damage (heals, plain buffs and blinks have nothing to augment). */
export function augmentable(sk) {
  if (!sk) return false;
  if (sk.kind === 'heal') return false;
  if (sk.kind === 'buff') return !!sk.m.pulse;
  if (sk.kind === 'blink') return !!sk.m.nova;
  if (sk.kind === 'curse') return (sk.m.curse || []).some((c) => ['decay', 'bomb', 'doom'].includes(c));
  return true;
}

/**
 * Roll the augments of a new ring of power level pl. learned: the hero's skills {id: points} (rings favour skills in
 * use). Mythic rings split their power between two augments.
 */
export function rollAugments(rarity, pl, classId, learned = {}) {
  const n = rarity >= 5 ? 2 : 1;
  const pool = (CLASS_SKILLS[classId] || []).filter(augmentable);
  const used = new Set(), out = [];
  for (let i = 0; i < n; i++) {
    let id = pick(AUG_IDS);
    for (let g = 0; g < 6 && used.has(id); g++) id = pick(AUG_IDS);
    used.add(id);
    const r = Math.random();
    let a;
    if (r < 0.58 && pool.length) {
      const mine = pool.filter((s) => learned[s.id]);
      const sk = mine.length && chance(0.7) ? pick(mine) : pick(pool);
      a = { id, sk: sk.id };
    } else if (r < 0.88 && pool.length) {
      a = { id, kind: pick(pool).kind };
    } else a = { id, all: true };
    const scope = a.sk ? 'skill' : a.kind ? 'kind' : 'all';
    a.pow = Math.round(augPower(pl) * (n > 1 ? 0.55 : 1) * SCOPE_MUL[scope] * rand(0.9, 1.1) * 100) / 100;
    out.push(a);
  }
  return out;
}

/** Does augment a apply to skill sk? */
export const augHits = (a, sk) => a.all || (a.sk ? a.sk === sk.id : a.kind === sk.kind);
