// Skill definitions built from the compact SKILLDATA specs.
import { SKILLDATA } from './skilldata.js';
import { CLASSES } from './classes.js';
import { SUMMONS } from './summons.js';
import { ELEM } from '../gfx/vfx.js';
import { NOTES, NOTE_MODS, REGISTERS, registerOf } from './notation.js';

export const ROW_LEVELS = [1, 6, 12, 20, 30];
export const MAX_SKILL_LEVEL = 20;
export const SKILLS = {};
export const CLASS_SKILLS = {};

// Skills granted for free as the hero levels up: [character level, tree, index]
export const GRANTS = [[1, 0, 0], [2, 1, 0], [4, 2, 0], [8, 0, 4], [12, 1, 4], [16, 2, 4], [22, 0, 8], [28, 1, 8], [34, 2, 8]];
const DRAGOON_GRANTS = [[1, 3, 0], [2, 3, 1], [4, 3, 2], [6, 3, 3]];

const KIND_DMG = {
  melee: 1.15, proj: 1.0, nova: 0.95, aoe: 1.35, beam: 1.2, chain: 0.95, wall: 0.32, zone: 0.3, orbit: 0.5, cyclone: 0.38,
  whirl: 0.55, leap: 1.4, dash: 1.15, blink: 0.8, summon: 0.6, buff: 0.35, curse: 0.35, heal: 0, trap: 1.7, rain: 0.55,
  strike: 1.35, fissure: 1.05, corpse: 1,
};
const KIND_MANA = {
  summon: 1.6, buff: 1.4, curse: 1.0, wall: 1.3, zone: 1.2, rain: 1.6, cyclone: 1.3, beam: 1.2, nova: 1.15, strike: 1.3,
  aoe: 1.2, trap: 1.1, leap: 1.1, dash: 0.9, blink: 1.0, orbit: 1.3, whirl: 1.2, heal: 1.3, corpse: 1.1,
};
const KIND_CD = { summon: 0.6, leap: 0.7, dash: 0.6, blink: 0.4, heal: 4, trap: 0.3 };
const KIND_USE = { melee: 0.36, proj: 0.32, buff: 0.3, summon: 0.4, curse: 0.35, blink: 0.2, dash: 0.25, leap: 0.25 };
const ATTACK_FX = new Set(['arrow', 'bullet', 'rang', 'javelin', 'blade', 'axe', 'chakram', 'rock', 'disc', 'pshield', 'bomb', 'rocket']);

function parseMods(str) {
  const m = {};
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    const eq = tok.indexOf('=');
    if (eq < 0) { m[tok] = true; continue; }
    const k = tok.slice(0, eq), v = tok.slice(eq + 1);
    if (k === 'buff' || k === 'curse') m[k] = v.split(',');
    else if (k === 'sum' || k === 'at') m[k] = v;
    else m[k] = isNaN(Number(v)) ? v : Number(v);
  }
  return m;
}

for (const [cls, trees] of Object.entries(SKILLDATA)) {
  CLASS_SKILLS[cls] = [];
  trees.forEach((tree, t) => {
    tree.forEach((line, i) => {
      const [name, kind, el, fx, mods] = line.split('|');
      const row = Math.floor(i / 4), col = i % 4;
      const sk = {
        id: `${cls}.${t}.${i}`, classId: cls, tree: t, idx: i, row, col, name, kind, el, fx, m: parseMods(mods || ''),
        reqLevel: ROW_LEVELS[row], prereq: i >= 4 ? `${cls}.${t}.${i - 4}` : null,
      };
      if (!sk.m.note && fx.startsWith('n_')) sk.m.note = fx.slice(2); // a Bard note projectile writes its own glyph
      sk.attack = ['melee', 'whirl', 'leap', 'dash'].includes(kind) || (kind === 'proj' && ATTACK_FX.has(fx)) || (kind === 'rain' && ATTACK_FX.has(fx));
      SKILLS[sk.id] = sk;
      CLASS_SKILLS[cls].push(sk);
    });
  });
}

export function grantedSkillsAt(cls, level) {
  const grants = cls === 'dragoon' ? [...GRANTS, ...DRAGOON_GRANTS] : GRANTS;
  return grants.filter((g) => g[0] <= level).map(([, t, i]) => `${cls}.${t}.${i}`);
}

/** Effective level of a skill for a player: invested + item bonuses. */
export function effLevel(player, sk) {
  const skObj = typeof sk === 'string' ? SKILLS[sk] : sk;
  const id = skObj?.id || (typeof sk === 'string' ? sk : null);
  const base = (player.char && player.char.skills && id && player.char.skills[id]) || 0;
  if (!base) return 0;
  const st = player.st || {};
  return base + Math.floor((st.skillsAll || 0) + (skObj ? (st['skillTree' + skObj.tree] || 0) : 0));
}

/** Raw (pre player-multiplier) damage per hit for a skill at level L. */
export function skillBaseDamage(sk, L) {
  const row = sk.row;
  const lv = 1 + 0.17 * (L - 1) + 0.004 * (L - 1) * (L - 1);
  let d = (6 + row * 3.2) * lv * (1 + row * 0.4) * (sk.m.dmg ?? 1) * (KIND_DMG[sk.kind] ?? 1);
  if (sk.kind === 'proj' && (sk.m.n || 1) > 1) d /= Math.pow(sk.m.n, 0.35);
  if (sk.kind === 'rain' || sk.kind === 'strike') d /= Math.pow((sk.m.n || 1) / 6, 0.25) || 1;
  if (sk.m.free) d *= 0.85;
  return d;
}

export function rageCost(sk) { return sk.classId === 'barbarian' ? (sk.m.rage || 0) : 0; }
export function manaCost(sk, L) {
  if (sk.classId === 'barbarian' && (sk.kind === 'whirl' || rageCost(sk))) return 0; // Barbarian Rage abilities do not consume mana
  if (sk.m.free) return 0;
  return Math.round((2.5 + sk.row * 2.4) * (1 + 0.07 * (L - 1)) * (sk.m.mana ?? 1) * (KIND_MANA[sk.kind] ?? 1));
}
export function cooldown(sk) { return sk.m.cd ?? KIND_CD[sk.kind] ?? 0; }
export function useTime(sk) { return sk.m.barrage ? 0 : KIND_USE[sk.kind] ?? 0.42; }
export function weaponCoef(sk) {
  if (sk.m.wc !== undefined) return sk.m.wc;
  if (sk.attack) return 0.8;
  if (['summon', 'buff', 'heal', 'curse'].includes(sk.kind)) return 0.25;
  return 0.45;
}
export function buffAmount(sk, L) { return Math.round((sk.m.amt ?? 20) * (1 + 0.05 * (L - 1))); }
export function curseAmount(sk, L) {
  const base = sk.m.amt ?? 25;
  return Math.round(base * (1 + 0.04 * (L - 1)));
}
export function skillDuration(sk, L) {
  const d = sk.m.dur;
  if (sk.kind === 'curse') return (d ?? 6) + (L - 1) * 0.15;
  if (sk.kind === 'buff') return (d ?? 20) + (L - 1) * 0.3;
  return d ?? 0;
}

/** Approximate useful range in tiles (used for auto-aim and melee approach). */
export function skillRange(sk) {
  // Spearstorm strikes around the Dragoon, not at an arbitrary distant cursor.
  if (sk.m.barrage) return 2.5;
  switch (sk.kind) {
    case 'melee': return 1.5 * (sk.m.range ?? 1) * (sk.m.r ?? 1);
    case 'whirl': return 6;
    case 'leap': case 'blink': return 6.5 * (sk.m.range ?? 1);
    case 'dash': return 5 * (sk.m.range ?? 1);
    case 'beam': return 8 * (sk.m.range ?? 1) * (sk.m.cone ? 0.5 : 1);
    case 'nova': return 3.5 * (sk.m.r ?? 1);
    case 'buff': case 'heal': case 'summon': return 99;
    case 'curse': return sk.m.at === 'self' ? 4 : 8;
    default: return 10 * (sk.m.range ?? 1) * (sk.kind === 'proj' && sk.m.ret ? 0.5 : 1); // a boomerang turns for home halfway
  }
}
/** Shared point-blank hit/visual footprint of the Dragoon's one- and three-circle spear barrages. */
export function spearBarrageAreas(sk, x, y, angle, area = 1, floor = () => true) {
  const radius = 1.6 * (sk.m.r ?? 1) * area;
  const centers = [[x, y]];
  if (sk.m.barrage === 3) {
    const offset = radius * 0.6, nx = -Math.sin(angle), ny = Math.cos(angle);
    for (const sign of [-1, 1]) {
      const cx = x + nx * offset * sign, cy = y + ny * offset * sign;
      centers.push(floor(cx, cy) ? [cx, cy] : [x, y]);
    }
  }
  return { radius, centers };
}

/** Shield Throw (`ricochet=N`): foes one throw strikes at rank L: 2 at rank 1, one more every 4 ranks, N (5) from rank 13. */
export function ricochetCount(sk, L) { return Math.min(sk.m.ricochet || 0, 2 + Math.floor((Math.max(1, L) - 1) / 4)); }
export const RICOCHET_BLAST = 1.5; // tiles, before area bonuses

export function needsTarget(sk) { return !['buff', 'heal', 'summon'].includes(sk.kind) && !(sk.kind === 'curse' && sk.m.at === 'self') && sk.kind !== 'nova'; }

const FXNAME = {
  arrow: 'arrow', bullet: 'bullet', rang: 'boomerang', javelin: 'javelin', blade: 'blade', axe: 'axe', chakram: 'chakram', rock: 'boulder',
  disc: 'shield', pshield: 'shield', bomb: 'bomb', rocket: 'rocket', bolt: 'bolt', orb: 'orb', fireball: 'fireball', hammer: 'hammer', skull: 'spirit skull',
  spear: 'spear', shard: 'shard', crow: 'crow', note: 'note', blob: 'glob', star: 'star', wave: 'wave', missile: 'missile', locust: 'locust',
  wolf: 'ghost wolf', dragon: 'drake', rune: 'rune', tooth: 'tooth', bone: 'bone shard', card: 'card', spark: 'spark', spirit: 'spirit', chain: 'chain',
  feather: 'feather', totem: 'totem', meteor: 'meteor', ice: 'ice shard', acid: 'acid drop', firework: 'firework', blood: 'blood drop',
  starmissile: 'star missile', starfall: 'falling star', stardust: 'stardust mote', moon: 'crescent moon', comet: 'comet', flare: 'solar flare',
  gravorb: 'gravity orb', darkmatter: 'dark matter orb', antimatter: 'antimatter orb', planet: 'planet', zodiac: 'zodiac sign', accretion: 'accretion shard',
};
// the Astronomer's special spells (game/astronomer.js), by their `astro=` mod
const ASTRO_TEXT = {
  meteor: (D, m) => `Call ${(m.r ?? 1) < 1.2 ? 'a falling star' : 'a meteor'} down on the target for ${D}${m.burn ? ', leaving the crater burning' : ''}.`,
  shower: (D, m) => `${m.n} meteors rain on the target area over ${m.dur}s, each dealing ${D}.`,
  sunslam: (D) => `A sun slowly falls out of the sky onto the target, scorching what stands beneath it, then crashes for ${D} and leaves the ground burning.`,
  moonfall: (D) => `The moon falls on the target, chilling what stands beneath it, then crashes for ${D}.`,
  blackhole: (D, m) => `Open a black hole for ${m.dur}s: it drags enemies in, swallows enemy missiles and deals ${D} per tick, then collapses for double damage.`,
  well: (D, m) => `Open a small gravity well for ${m.dur}s that drags enemies in for ${D} per tick, then collapses.`,
  bigbang: (D) => `Light gathers to a single point, then explodes for ${D} in a huge area, hurling enemies away.`,
  pulsar: (D, m) => `A pulsar flares at your chest for ${m.dur}s, sweeping two beams round and round for ${D} per tick. You can move and cast meanwhile.`,
  neutron: (D, m) => `Set a neutron star over the target for ${m.dur}s: it pulses around itself and fires star missiles at nearby enemies (${D}).`,
  wormhole: (D) => `Step through a wormhole to the target, bursting out for ${D}.`,
  mirror: () => 'Eight see-through Astronomers ring you: you cannot be harmed while they shine, each fires star missiles of its own, and your projectile spells leave every image too. The ring charts the Northern Crown.',
  supernova: (D) => `Collapse into a blinding supernova that blasts everything around you for ${D}.`,
  eclipse: (D) => `A moon slides over the sun above the target: enemies there take more damage and flee, and at totality the corona burns them for ${D}.`,
  align: () => 'The planets align over your head.',
  conjunction: () => 'Grants four zodiac boons at once and begins a Grand Conjunction: meteors fall on everything near you.',
  chart: (D) => `Light three stars between you and the target, each a small starfall for ${D}.`,
  ignite: (D) => `Ascend your star chart now, at 25% more power (needs two stars); with fewer, light a star at the target for ${D}.`,
  heavensmap: (D) => `Chart seven stars around the target, then ascend them as the Northern Crown at 50% more power (${D} base).`,
};
const BUFFNAME = { dmg: 'Damage', as: 'Attack & Cast Speed', armor: 'Armor', res: 'All Resistances', regen: 'Life Regen', speed: 'Move Speed', crit: 'Critical Chance', thorns: 'Thorns', leech: 'Life Steal', block: 'Block Chance', life: 'Maximum Life', cdr: 'Cooldown Reduction' };
const CURSENAME = { amp: 'take increased damage', weaken: 'deal less damage', slow: 'are slowed', fear: 'flee in terror', confuse: 'attack each other', charm: 'fight for you', decay: 'rot over time', leech: 'heal you when struck', thorns: 'hurt themselves when attacking', mark: 'are marked for death', stun: 'are stunned', freeze: 'are frozen', bomb: 'explode after a delay', doom: 'suffer a delayed doom' };

const plural = (n, s) => (n === 1 ? s : s.endsWith('s') ? s : s + 's');

/** Human readable description. dmg = [min,max] already scaled for the player. */
export function describe(sk, L, dmg) {
  const m = sk.m, el = (ELEM[sk.el] || ELEM.phys).name.toLowerCase();
  const D = dmg ? `<b>${dmg[0]}–${dmg[1]}</b> ${el} damage` : `${el} damage`;
  const n = m.n || 1;
  const fx = sk.fx.startsWith('n_') ? (NOTES[sk.fx.slice(2)] || NOTES.q).name.toLowerCase() : FXNAME[sk.fx] || sk.fx;
  const flags = [];
  if (m.pierce) flags.push('Pierces');
  if (m.home) flags.push('Homing');
  if (m.bounce) flags.push(`Bounces ${m.bounce}x off walls and between enemies`);
  if (m.wander) flags.push('Wanders erratically');
  if (m.chain) flags.push(`Chains to ${m.chain} more`);
  if (m.exp) flags.push('Explodes');
  if (m.split) flags.push('Splits on hit');
  if (m.ret) flags.push('Returns to your hand');
  if (m.burn) flags.push('Ignites');
  if (m.poison) flags.push('Poisons');
  if (m.bleed) flags.push('Causes bleeding');
  if (m.freeze) flags.push('Can freeze');
  if (m.slow) flags.push('Slows');
  if (m.stun) flags.push('Stuns');
  if (m.knock) flags.push('Knockback');
  if (m.leech) flags.push('Life steal');
  if (m.pull) flags.push('Pulls enemies');
  if (m.barrage) return m.barrage === 3
    ? `Impale nearby enemies in three tight circles surrounding you for ${D}, with spectral Dragoon lances. Instant damage, one hit per enemy (even in overlaps). Visuals last 1.65s.`
    : `Impale nearby enemies in a circle around you for ${D}, with spectral Dragoon lances. Instant damage; visuals last 1.35s.`;
  let s;
  switch (sk.kind) {
    case 'melee': s = sk.id === 'barbarian.0.0'
      ? `Bash in front of you for ${D}, then fan five short lightning bolts forward. Builds 3 Rage on cast and 15 more on the first hit.`
      : `Strike ${n > 1 ? n + ' times ' : ''}${m.arc >= 300 || sk.fx === 'spin' ? 'all around you' : 'in front of you'} for ${D}.`; break;
    case 'proj': if (m.ricochet) { // Shield Throw
        const k = ricochetCount(sk, L), more = k < m.ricochet ? ` (${k + 1} at rank ${(k - 1) * 4 + 1})` : '';
        s = `Hurl your shield at the target for ${D}. It ricochets from foe to foe, never striking one twice, up to ${k} enemies${more}, then bursts into holy light, dealing 75% of that to everything around the last.`;
        break;
      }
      s = `${m.lob ? 'Lob' : 'Launch'} ${n > 1 ? n + ' ' + plural(n, fx) : 'a ' + fx}${m.ring ? ' in every direction' : ''}, each dealing ${D}.`; break;
    case 'nova': s = `Release ${n > 1 ? n + ' waves' : 'a nova'} of ${el} energy around you for ${D}.`; break;
    case 'aoe': s = `${n > 1 ? `Erupt the ground ${n} times` : `Call down ${sk.fx === 'meteor' ? 'a meteor' : 'a blast'}`} at the target for ${D}${m.dur ? ` over ${m.dur}s` : ''}.`; break;
    case 'beam': s = `${m.dur ? `Channel a ${m.cone ? 'cone of ' + el + ' breath' : el + ' beam'} for ${m.dur}s` : `Fire a ${el} beam`}, dealing ${D}${m.dur ? ' per tick' : ''}.`; break;
    case 'chain': s = `Unleash ${el} that leaps between up to ${n + 1} enemies, dealing ${D}.`; break;
    case 'wall': s = `Raise ${m.ring ? 'a ring' : 'a wall'} of ${sk.fx} for ${m.dur || 5}s, dealing ${D} per tick${m.block ? ' and blocking enemies' : ''}.`; break;
    case 'zone': s = `${m.follow ? 'Surround yourself with' : 'Create'} a ${sk.fx} field for ${m.dur || 5}s dealing ${D} per tick${m.heal ? ' and healing allies' : ''}.`; break;
    case 'orbit': s = `${n} ${plural(n, fx)} ${m.spiral ? 'spiral outward from' : 'orbit'} you for ${m.dur || 4}s, each hit dealing ${D}.`; break;
    case 'cyclone': s = `Unleash ${n} ${plural(n, sk.fx + ' cyclone')} that rip through enemies for ${D} per tick.`; break;
    case 'whirl': s = `Spin through enemies for ${m.dur || 2}s, striking all around you for ${D} per tick.`; break;
    case 'leap': s = `Leap to the target and crash down for ${D} in an area.`; break;
    case 'dash': s = `${n > 1 ? `Dash ${n} times` : 'Dash forward'}, striking everything in your path for ${D}.`; break;
    case 'blink': s = `Teleport to the target location${m.nova ? `, releasing a burst for ${D}` : ''}.`; break;
    case 'summon': {
      const S = SUMMONS[m.sum];
      const MD = S && S.pool ? (dmg ? `<b>${dmg[0]}–${dmg[1]}</b> damage of their own element` : 'damage') : D; // a mixed band casts its own elements
      s = `Summon ${n > 1 ? n + ' ' + plural(n, S ? S.name : m.sum) : 'a ' + (S ? S.name : m.sum)}${m.dur ? ` for ${m.dur}s` : ''}${m.max ? ` (max ${m.max})` : ''}. ${S && S.desc ? S.desc : ''} Minion hits deal ${MD}.`;
      break;
    }
    case 'buff': s = `${m.party ? 'You and your allies gain' : 'Gain'} +${buffAmount(sk, L)}% ${(m.buff || ['dmg']).map((b) => BUFFNAME[b] || b).join(', ')} for ${Math.round(skillDuration(sk, L))}s.${m.pulse ? ` Pulses for ${D} around you.` : ''}${m.transform ? ' Transforms your body.' : ''}`; break;
    case 'curse': s = `${m.at === 'self' ? 'Nearby enemies' : 'Enemies in the target area'} ${(m.curse || ['amp']).map((c) => CURSENAME[c] || c).join(', ')} for ${Math.round(skillDuration(sk, L))}s.${(m.curse || []).some((c) => ['decay', 'bomb', 'doom'].includes(c)) ? ` Deals ${D}.` : ''}`; break;
    case 'heal': s = `Restore ${Math.round((m.amt || 20) * (1 + 0.04 * (L - 1)))}% of your life${m.party ? ' and your allies\' life' : ''}.`; break;
    case 'trap': s = `Place ${n > 1 ? n + ' ' + sk.fx + ' traps' : 'a ' + sk.fx + ' trap'} that ${m.pull ? 'pull and ' : ''}detonate near enemies for ${D}.`; break;
    case 'rain': s = `${n} ${plural(n, fx)} rain down on the target area, each dealing ${D}.`; break;
    case 'strike': s = `Call down ${n > 1 ? n + ' strikes' : 'a strike'} of ${el} on nearby enemies for ${D}.`; break;
    case 'fissure': s = `Tear ${n > 1 ? n + ' lines' : 'a line'} of ${sk.fx} eruptions through the ground for ${D}.`; break;
    case 'corpse': s = `Consume up to ${n} corpses near the target${m.heal ? ', healing you and' : ','} dealing ${D} plus a share of each corpse's life.`; break;
    default: s = `Deals ${D}.`;
  }
  // the Storm tree's own mechanics
  if (m.static) s = `Charge the air around you for ${D}, then tear away ${m.static}% of every enemy's current life (${Math.round(m.static * 0.4)}% on bosses). It never takes a foe below a quarter of its life (half for bosses).`;
  if (m.clap) s = `Clap thunder down at the target for ${D}, stunning and hurling enemies back. A beat later lightning strikes every stunned foe for 60% more.`;
  if (m.arcs) s = `Release ${n} expanding rings of lightning around you, each dealing ${D}. The first enemies each ring strikes throw off arcs that leap to ${m.arcs} more.`;
  if (ASTRO_TEXT[m.astro]) s = ASTRO_TEXT[m.astro](D, m) + (sk.kind === 'buff' ? ' ' + s : '');
  if (sk.classId === 'arcane_sorcerer' && !['buff', 'heal', 'summon'].includes(sk.kind) && !['chart', 'ignite', 'heavensmap'].includes(m.astro)) flags.push(m.free ? 'Every third cast charts a star' : 'Charts a star where it lands');
  for (const k in NOTE_MODS) if (m[k]) flags.push(NOTE_MODS[k]);
  const N = NOTES[m.note];
  if (N && m.free) flags.push('Fills the bar: with less than a beat left it plays a shorter note');
  const score = N ? `<br><span style="color:#ffd88a">&#9835; ${N.name} · ${N.clef ? `no beats: changes the key to ${N.clef}` : `${N.beats} beat${N.beats === 1 ? '' : 's'} of the measure${N.rest ? ' (rests restore mana and life at the Cadence)' : ` · ${REGISTERS[registerOf(sk)].name}`}`}</span>` : '';
  return s + (flags.length ? ` <i>${flags.join(' · ')}.</i>` : '') + score;
}

export function classTrees(cls) { return CLASSES[cls].trees; }
