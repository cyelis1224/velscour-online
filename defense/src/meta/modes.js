// Side modes for currency and pulls beside the campaign: four endless modes (how far can you hold?) and daily and
// weekly challenges with limited entries. Their strength follows how far the Commander has come in the campaign, so they
// are worth playing at every stage of the game, and they never need a Rift Seal except the endless runs' full payout.
import { RNG, clamp } from '../core/util.js';
import { ART } from '../core/assets.js';
import { LEVELS, REGIONS } from '../data/campaign.js';
import { CLASS_IDS } from '../data/kits.js';
import { CARDS } from '../data/cards.js';
import { ROLES, stageRoster } from '../data/waves.js';
import { buildMap } from '../battle/map.js';
import { Battle } from '../battle/sim.js';
import { unitDef, trophyBonus } from './power.js';
import { researchBonus } from './research.js';
import { spendSeal } from './seals.js';
import { grant } from './gacha.js';
import { SQUAD_MAX } from './progress.js';

const dayOf = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const week = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + Math.ceil(((t - y) / 86400000 + 1) / 7); };
const ARCHES = ['skeleton', 'zombie', 'ghoul', 'cultist', 'hound', 'spider', 'knight', 'golem', 'wraith', 'demon', 'abomination', 'worm', 'shroom', 'slime', 'gargoyle', 'scorpion'];

/**
 * kind: 'endless' (waves never stop; the run ends when the Heart breaks; one Seal for the full payout) or 'daily' /
 * 'weekly' (a fixed number of waves, limited entries, free). tier: how hard against the campaign frontier.
 */
export const MODES = [
  { id: 'siege', kind: 'endless', unlock: 6, name: 'Endless Siege', icon: '∞', tier: 0.55, grow: 0.035, roles: null,
    text: 'The horde never stops. Every wave stronger than the last. Gold, shards and essence for every wave held; a Hero Ticket for every new record of 25 waves.' },
  { id: 'tide', kind: 'endless', unlock: 16, name: 'Horde Tide', icon: '🌊', tier: 0.4, grow: 0.03, roles: ['runner', 'flyer', 'blinker'], count: 2.2,
    text: 'Runners, flyers and blinkers in swarms twice the size. Pays mostly Soul Shards.' },
  { id: 'bossrush', kind: 'endless', unlock: 31, name: 'Boss Rush', icon: '☠', tier: 0.5, grow: 0.06, giants: true,
    text: 'A painted giant every wave, with its court. Pays essence, and trophies drop three times as often.' },
  { id: 'shifting', kind: 'endless', unlock: 51, name: 'Shifting Rift', icon: '✷', tier: 0.5, grow: 0.03, mutate: true,
    text: 'Every 5 waves the rift mutates the horde (faster, armoured, warded, swarming...), and the mutations stack. Every mutation adds 15% to the payout.' },
  { id: 'vault', kind: 'daily', unlock: 11, name: 'Gilded Vault', icon: '◉', tier: 0.7, waves: 8, entries: 3,
    text: 'Eight waves of the horde carrying gold. Three runs a day.' },
  { id: 'well', kind: 'daily', unlock: 11, name: 'Essence Well', icon: '✧', tier: 0.7, waves: 8, entries: 3,
    text: 'Eight waves around a well of rift essence. Three runs a day.' },
  { id: 'storm', kind: 'daily', unlock: 21, name: 'Shard Storm', icon: '◆', tier: 0.72, waves: 8, entries: 3,
    text: 'Eight waves in a storm of Soul Shards, and a chance at a Hero Ticket. Three runs a day.' },
  { id: 'classtrial', kind: 'daily', unlock: 26, name: 'Class Trial', icon: '⚔', tier: 0.5, waves: 10, entries: 2, classes: 4,
    text: 'Only today\'s four classes may fight. Shards and a Hero Ticket for a win. Two runs a day.' },
  { id: 'hunt', kind: 'daily', unlock: 41, name: 'Trophy Hunt', icon: '🏹', tier: 0.68, waves: 10, entries: 2, hunt: true,
    text: 'Today\'s monster family only, and their trophies drop ten times as often. Two runs a day.' },
  { id: 'gauntlet', kind: 'weekly', unlock: 21, name: 'The Gauntlet', icon: '♛', tier: 0.8, waves: 15, entries: 1, gauntlet: true,
    text: 'Once a week: 15 waves near your frontier\'s strength with two fewer heroes and no Rally Standard. A Legend Ticket, 400 shards and 300 essence.' },
];
export const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m]));

function state(save, now = Date.now()) {
  const M = save.modes || (save.modes = { day: '', used: {}, best: {}, week: '', weekUsed: {}, runs: 0 });
  const d = dayOf(now), w = week(new Date(now));
  if (M.day !== d) { M.day = d; M.used = {}; }
  if (M.week !== w) { M.week = w; M.weekUsed = {}; }
  return M;
}
/** Opens when the campaign frontier passes the mode's stage. */
export const modeOpen = (save, id) => save.frontier >= MODE_BY_ID[id].unlock;
export function entriesLeft(save, id, now) {
  const m = MODE_BY_ID[id], M = state(save, now);
  if (!modeOpen(save, id)) return 0;
  if (m.kind === 'endless') return Infinity;
  return m.entries - ((m.kind === 'weekly' ? M.weekUsed : M.used)[id] || 0);
}
export const bestWave = (save, id) => state(save).best[id] || 0;
/** Today's draw: the Class Trial's classes, the Trophy Hunt's family, the battlefield (stable for the day). */
export function todays(save, now) {
  const r = new RNG('modes:' + dayOf(now));
  const classes = r.shuffle(CLASS_IDS.slice()).slice(0, 4), arch = r.pick(ARCHES), map = r.int(0, 39), region = r.int(0, Math.min(REGIONS.length, Math.ceil(save.frontier / 10)) - 1);
  return { classes, arch, map, region };
}
/** The campaign stage a mode's strength follows (its frontier, scaled by the mode's tier). */
export const refStage = (save, m) => clamp(Math.round(Math.min(300, save.frontier) * m.tier), 1, 300);

const MUTATIONS = [
  ['Swift', { speedK: 1.15 }], ['Armoured', { defK: 1.8 }], ['Warded', { res: 0.25 }], ['Swarming', { countK: 1.35 }],
  ['Hardy', { hpK: 1.25 }], ['Shielded', { shieldAll: true }], ['Restless', { blinkAll: true }], ['Burrowing', { burrowAll: true }],
];
/** Make a mode battle. Returns { b, spec } or null when no entries are left. */
export function startMode(save, id, opts = {}) {
  const m = MODE_BY_ID[id];
  if (entriesLeft(save, id, opts.now) <= 0) return null;
  // the battlefield of a stage just behind the mode's strength (a different one each day and mode), with that stage's own
  // terrain factor, so the field and the strength always match
  const M = state(save, opts.now), day = todays(save, opts.now), n = clamp(refStage(save, m) - (day.map + MODES.indexOf(m) * 3) % 10, 1, 300), L = LEVELS[n - 1];
  const map = buildMap(n);
  const roster = stageRoster(n), rng = new RNG('mode:' + id + ':' + M.day + ':' + (M.runs || 0));
  const giants = ART.monsters.filter((x) => x.lone), hunted = ART.monsters.filter((x) => !x.lone && x.arch === day.arch);
  const roles = m.roles || Object.keys(ROLES).filter((r) => ROLES[r].from <= n && !['captain', 'warlord', 'lieutenant', 'boss'].includes(r));
  const muts = [];
  const wave = (i) => {
    const g = Math.min(5000, L.wave0 + 1 + Math.floor(i * 0.6)), groups = [];
    if (m.mutate && i > 0 && i % 5 === 0) { const mu = rng.pick(MUTATIONS); muts.push(mu[0]); }
    // stacking mutations multiply: two Swift = 1.15^2
    const mk = {};
    for (const nm of muts) { const v = MUTATIONS.find((x) => x[0] === nm)[1]; for (const k in v) mk[k] = typeof v[k] === 'number' ? (k === 'res' ? (mk[k] || 0) + v[k] : (mk[k] || 1) * v[k]) : true; }
    let count = Math.round((4 + 3 * Math.log2(1 + g / 40)) * (m.count || 1) * (mk.countK || 1));
    const hpK = Math.pow(1 + (m.grow || 0), i) * (mk.hpK || 1) * (m.gauntlet ? 1.1 : 1), g0 = g;
    const kinds = clamp(1 + rng.int(0, 2), 1, roles.length);
    for (let k = 0; k < kinds && count > 0; k++) {
      const role = rng.pick(roles), c = k === kinds - 1 ? count : Math.max(2, Math.round(count / (kinds - k)));
      count -= c;
      const art = m.hunt && hunted.length ? rng.pick(hunted).id : rng.pick(roster[role]?.length ? roster[role] : roster.grunt);
      groups.push({ role, art, count: c, gap: role === 'runner' ? 0.4 : 0.75, route: rng.int(0, map.routes.length - 1), elite: clamp((g - 25) / 900, 0, 0.3), delay: k * 1.8, hpK, speedK: mk.speedK, defK: mk.defK, res: mk.res, shieldAll: mk.shieldAll, blinkAll: mk.blinkAll, burrowAll: mk.burrowAll });
    }
    if (m.giants) groups.push({ role: i % 5 === 4 ? 'boss' : 'warlord', art: rng.pick(giants).id, count: 1, gap: 1, route: 0, delay: 2, hpK: hpK * 0.5 });
    else if ((m.kind !== 'endless' && i === (m.waves || 0) - 1) || (m.kind === 'endless' && i % 10 === 9)) groups.push({ role: 'warlord', art: rng.pick(giants).id, count: 1, gap: 1, route: 0, delay: 3, hpK });
    return { g: g0, groups, big: false, muts: muts.slice() };
  };
  const first = m.kind === 'endless' ? [wave(0), wave(1)] : Array.from({ length: m.waves }, (_, i) => wave(i));
  let squadIds = save.squad.filter((id2) => save.cards['h:' + id2]?.n > 0);
  if (m.classes) { const own = Object.keys(save.cards).filter((k) => k.startsWith('h:') && save.cards[k].n > 0).map((k) => k.slice(2)); squadIds = own.filter((h) => day.classes.includes(CARDS['h:' + h].cls)).sort((a, b) => unitDef(b, save).power - unitDef(a, save).power); }
  if (!squadIds.length) return null;   // a Class Trial with none of today's classes
  if (m.kind === 'daily') M.used[id] = (M.used[id] || 0) + 1;
  if (m.kind === 'weekly') M.weekUsed[id] = (M.weekUsed[id] || 0) + 1;
  const sealed = m.kind === 'endless' ? !opts.noSeal && spendSeal(save, opts.now) : true;
  const R = { ...researchBonus(save), trophy: trophyBonus(save), drops: sealed ? (m.hunt ? 10 : m.giants ? 3 : 1) : 0 };
  const squad = squadIds.slice(0, SQUAD_MAX).map((h) => unitDef(h, save, { research: R }));
  const b = new Battle({ map, stage: { ...L, n }, waves: first, squad, ally: null, heart: m.kind === 'endless' ? 20 : 15 + Math.floor(n / 20), deployLimit: Math.max(3, Math.min(10, 3 + Math.floor(Math.sqrt(n) * 0.62)) - (m.gauntlet ? 2 : 0)),
    bonus: R, seed: 'mode:' + id + ':' + rng.int(0, 1e9), sealed, more: m.kind === 'endless' ? wave : null, noRally: !!m.gauntlet });
  M.runs = (M.runs || 0) + 1;
  return { b, m, n, day, muts };
}

/** What a finished mode run pays; applies it and records the best wave. */
export function finishMode(save, m, b) {
  const M = state(save), held = Math.max(0, b.wavesCleared ?? (b.won ? b.waves.length : b.waveI - 1)), n = clamp(Math.round(save.frontier), 1, 300);
  const prev = M.best[m.id] || 0;
  if (m.kind === 'endless') M.best[m.id] = Math.max(prev, held);
  const scale = 1 + n / 25, out = { gold: 0, shards: 0, essence: 0, tickets: 0, legend: 0, held };
  if (m.kind === 'endless') {
    const pay = b.sealed ? 1 : 0.15, mult = 1 + 0.15 * (b.mutations || 0);
    if (m.id === 'siege') { out.gold = held * 40 * scale; out.shards = held * 3; out.essence = held * 1.2; out.tickets = Math.max(0, Math.floor(held / 25) - Math.floor(prev / 25)); }   // a ticket for each new 25-wave record
    if (m.id === 'tide') { out.gold = held * 15 * scale; out.shards = held * 6; }
    if (m.id === 'bossrush') { out.gold = held * 30 * scale; out.essence = held * 4; out.shards = held; }
    if (m.id === 'shifting') { out.gold = held * 30 * scale; out.shards = held * 3.5; out.essence = held * 2; }
    for (const k of ['gold', 'shards', 'essence']) out[k] = Math.round(out[k] * pay * mult);
    if (!b.sealed) out.tickets = 0;
  } else if (b.won) {
    const st = b.stars || 1;
    if (m.id === 'vault') out.gold = Math.round((600 + 260 * n) * (0.7 + 0.15 * st));
    if (m.id === 'well') out.essence = Math.round((30 + n * 0.9) * (0.7 + 0.15 * st));
    if (m.id === 'storm') { out.shards = Math.round((50 + n * 0.6) * (0.7 + 0.15 * st)); if (new RNG('storm' + M.day + (M.runs || 0)).chance(0.1)) out.tickets = 1; }
    if (m.id === 'classtrial') { out.shards = 60 + Math.round(n * 0.5); out.tickets = 1; }
    if (m.id === 'hunt') { out.gold = Math.round(200 + 60 * n); out.essence = 20; }
    if (m.id === 'gauntlet') { out.legend = 1; out.shards = 400; out.essence = 300; save.stats.gauntlets = (save.stats.gauntlets || 0) + 1; }
  } else if (m.id === 'vault') out.gold = Math.round((600 + 260 * n) * 0.25 * (b.pct || 0));
  save.gold += out.gold; save.shards += out.shards; save.essence += out.essence; save.tickets.hero += out.tickets; save.tickets.legend += out.legend;
  out.trophies = (b.drops || []).map((id) => grant(save, CARDS['x:' + id])).filter(Boolean);
  save.stats.modeRuns = (save.stats.modeRuns || 0) + 1;
  return out;
}
