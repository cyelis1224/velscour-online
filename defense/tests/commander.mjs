// A simulated Commander living through real days: Rift Seals refill with the clock, each morning brings the login,
// the bounty, the free pack and the quests, and the day's battles take their real time (auto-play at 3x). Used by
// calibrate.mjs (to fit the curve to a calendar) and balance.mjs (to check the calendar with real battles).
import './node_env.mjs';
import { freshSave } from '../src/state.js';
import { startStage, finishStage } from '../src/meta/progress.js';
import { pickSquad, upgradeCharacters, nextStage } from '../src/meta/autopilot.js';
import { PACKS, PACK_BY_ID, openPack, canOpen } from '../src/meta/gacha.js';
import { LOGIN, claimHourly, give } from '../src/meta/rewards.js';
import { RESEARCH, researchCost, buyResearch } from '../src/meta/research.js';
import { seals } from '../src/meta/seals.js';
import { STEP } from '../src/battle/sim.js';
import { autoBattle } from '../src/battle/autoplay.js';
import { stageWaves } from '../src/data/waves.js';
import { LEVELS } from '../src/data/campaign.js';
import { RNG } from '../src/core/util.js';
import { MODES, startMode, finishMode, entriesLeft, modeOpen } from '../src/meta/modes.js';

export const PROFILES = {
  casual: { perDay: 20, label: 'casual (20 battles a day)' },
  dedicated: { perDay: 60, label: 'dedicated (60 a day)' },
  grinder: { perDay: 200, label: 'grinder (200 a day, auto-play all day)' },
};
const DAY = 86400000, T0 = Date.UTC(2026, 0, 1, 8);
export const SIEGE_HELD = 30;

export class Commander {
  constructor(profile = 'dedicated', seed = 'cmd') {
    this.P = PROFILES[profile]; this.rng = new RNG(seed);
    this.now = T0; this.day = 0; this.save = freshSave(); this.save.seals.t = this.now; this.save.hourly.last = this.now;
    this.battles = 0; this.today = 0; this.fails = 0; this.log = [];
  }
  /** A new morning: the login calendar, the bounty, the free pack, then what the player spends. */
  morning() {
    this.day++; this.today = 0;
    this.now = Math.max(this.now, T0 + (this.day - 1) * DAY);
    const s = this.save;
    if (this.day > 1) {
      give(s, LOGIN[(this.day - 2) % 7]);
      claimHourly(s, this.now); claimHourly(s, this.now);              // morning and evening, the cap is 12 h
      s.shards += 150; s.gold += 2600; s.essence += 60;                // yesterday's four quests
    }
    openPack(s, PACK_BY_ID.daily, false, this.rng);
    if (this.modes !== false) this.sideModes();
    this.spend();
  }
  /** Like a player: hero summons first (ten at a time), gear and bestiary packs with what is left; a third of the gold on the Works. */
  spend() {
    const s = this.save, hero = PACK_BY_ID.heroes, others = ['armory', 'forge', 'reliquary', 'bestiary'].map((k) => PACK_BY_ID[k]);
    for (let g = 0; g < 60; g++) {
      let ok = false;
      if (canOpen(s, hero, true)) ok = !!openPack(s, hero, true, this.rng);
      else if (canOpen(s, hero) && (s.tickets.hero || s.tickets.legend)) ok = !!openPack(s, hero, false, this.rng);
      else if (s.shards >= 600) ok = !!openPack(s, others[g % others.length], false, this.rng);
      else for (const p of others) if ((s.freePacks?.[p.id] || 0) > 0) { ok = !!openPack(s, p, false, this.rng); break; }
      if (!ok) break;
    }
    let budget = s.gold * 0.3;
    for (let g = 0; g < 60; g++) {
      const k = Object.keys(RESEARCH).filter((k) => (s.research[k] || 0) < RESEARCH[k].max).sort((a, b) => researchCost(a, s.research[a] || 0) - researchCost(b, s.research[b] || 0))[0];
      if (!k || researchCost(k, s.research[k] || 0) > budget) break;
      budget -= researchCost(k, s.research[k] || 0); buyResearch(s, k);
    }
    pickSquad(s); upgradeCharacters(s);
  }
  get seals() { return seals(this.save, this.now); }
  /**
   * The side modes, taken as played: every challenge entry won at 2 stars (the Gauntlet once a week) and one Endless
   * Siege a day held for SIEGE_HELD waves with a Seal. Their real difficulty follows the frontier, so winning them is
   * what a player who keeps up gets; this is the income the calendar assumes on top of the campaign.
   */
  sideModes() {
    const s = this.save, now = this.now;
    for (const m of MODES) {
      if (!modeOpen(s, m.id)) continue;
      const runs = m.kind === 'endless' ? (m.id === 'siege' && this.seals > 0 ? 1 : 0) : entriesLeft(s, m.id, now);
      for (let k = 0; k < runs; k++) {
        const r = startMode(s, m.id, { now });
        if (!r) break;
        const held = m.kind === 'endless' ? SIEGE_HELD : r.b.waves.length;
        finishMode(s, m, { won: m.kind !== 'endless', stars: 2, pct: 1, sealed: r.b.sealed, drops: [], wavesCleared: held, mutations: 0 });
        this.after(held * 22);
      }
    }
  }
  /** A real battle at stage n on auto; returns the battle. */
  fight(n, opts = {}) {
    const s = this.save, b = startStage(s, n, { now: this.now, noSeal: opts.noSeal });
    let steps = 0;
    while (!b.done && steps < 60 * 60 * 40) { autoBattle(b, STEP * 2); b.step(STEP * 2); b.events.length = 0; steps++; }
    const res = finishStage(s, n, b);
    this.after(b.t);
    return { b, res };
  }
  /** A battle taken as won (for calibration): its rewards at 3 stars, kill gold as the sim pays it. */
  fakeWin(n) {
    const s = this.save, sealed = seals(s, this.now) > 0;
    if (sealed) s.seals.n--;
    const W = stageWaves(n, 1);
    let gold = 0, kills = 0, t = 8;
    for (const w of W) for (const g of w.groups) { kills += g.count; t += g.count * g.gap + 3; gold += g.count * Math.round((g.role === 'boss' ? 80 : g.role === 'lieutenant' ? 30 : 2) * (1 + w.g / 40)); }
    const drops = [];
    finishStage(s, n, { won: true, stars: 3, pct: 1, gold, kills, total: kills, splits: 0, units: [], waveI: LEVELS[n - 1].waves, waves: W, sealed, drops });
    this.after(t);
  }
  after(gameSeconds) { this.battles++; this.today++; this.now += (gameSeconds / 3 + 20) * 1000; }
  dayOver() { return this.today >= this.P.perDay || this.now >= T0 + this.day * DAY - 3600000; }
  /** Auto-campaign for a day: push the frontier; after two defeats, farm what it can with Seals; out of Seals and stuck, stop. */
  playDay() {
    const s = this.save, out = [];
    while (!this.dayOver() && s.frontier <= LEVELS.length) {
      const f = s.frontier, n = nextStage(s, this.fails);
      if (n !== f && this.seals <= 0) break;            // nothing left to farm with today
      if (n === f && this.fails >= 8 && this.seals <= 0) break;
      const { b } = this.fight(n);
      if (n === f) { if (b.won) this.fails = 0; else this.fails++; out.push({ n, won: b.won, stars: b.stars, day: this.day }); }
      else if (this.fails >= 2) this.fails = 1;          // after a farm, try the frontier again
      upgradeCharacters(s);
    }
    return out;
  }
}
export { LEVELS };
