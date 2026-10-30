// Macros: up to five per hero (G.char.macros), each an ordered list of skills on a key of its own (a button on touch).
// A press casts them one after another as each cast ends; a skill on cooldown, short of mana or not learned is skipped.
// "Keep up" recasts the list's buffs as they wear off and its cooldown skills (3 s or more) as they come back, while a
// foe is in sight and auto-play is off (it keeps its own buffs). Asked for on Discord: "when manually playing I need to
// play like a pianist to use all my buffs, 4567890- every 30 seconds or so". The panel is ui/macros.js.
import { G } from '../state.js';
import { input } from '../core/input.js';
import { SKILLS, cooldown } from '../data/skills.js';
import { BeamCh } from './hazards.js';
import { Auto } from './autoplay.js';
import { MACRO_KEYS } from '../data/macros.js';

export { MACRO_N, MACRO_LEN, MACRO_KEYS, keyLabel } from '../data/macros.js';

/** Set macro i's key; a key another macro held is taken from it. */
export function setMacroKey(i, key) {
  const ms = G.char.macros;
  if (key) for (const m of ms) if (m.key === key) m.key = null;
  ms[i].key = MACRO_KEYS.includes(key) ? key : null;
}
/** The keys macros are on now (auto-play's noteInput: a press takes the controls back for a moment). */
export const macroKeys = () => (G.char && G.char.macros ? G.char.macros.map((m) => m.skills.length && m.key).filter(Boolean) : []);

export const Macros = {
  queue: [],   // skill ids waiting to be cast, in order
  keepT: 0,
  age: 0,      // seconds since the queue last moved: a queue stuck behind a channel is dropped
  /** Queue macro i's skills (those not queued already). */
  run(i) {
    const m = G.char && G.char.macros && G.char.macros[i];
    if (!m || !m.skills.length || !G.player || G.player.dead) return false;
    for (const id of m.skills) if (!this.queue.includes(id)) this.queue.push(id);
    this.age = 0;
    return true;
  },
  /** Would "Keep up" cast this skill now? A buff that has worn off (or is about to), a cooldown skill that is ready. */
  due(id) {
    const sk = SKILLS[id], p = G.player;
    if (!sk || !p.skillLevel(sk) || (p.cooldowns[id] || 0) > 0) return false;
    if (sk.kind === 'buff') return !p.buffs.some((b) => b.id === id && b.t > 1);
    return cooldown(sk) >= 3;
  },
  /** Every frame from controls.update, before its input is cleared. */
  tick(dt) {
    const c = G.char, p = G.player, w = G.world;
    if (!c || !c.macros || !p || !w) return;
    if (p.dead || w.kind === 'town') { this.queue.length = 0; return; }
    if (!G.ui || !G.ui.isOpen('macros')) {
      c.macros.forEach((m, i) => { if (m.key && input.consume(m.key)) this.run(i); });
    }
    if ((this.keepT -= dt) <= 0) {
      this.keepT = 0.25;
      const keep = c.macros.filter((m) => m.keep && m.skills.length);
      if (keep.length && !Auto.on && w.nearestHostile('player', p.x, p.y, 12, true)) {
        for (const m of keep) for (const id of m.skills) if (!this.queue.includes(id) && this.due(id)) { this.queue.push(id); this.age = 0; }
      }
    }
    if (!this.queue.length) return;
    if ((this.age += dt) > 4) { this.queue.length = 0; return; }
    if (p.castLock > 0 || (p.channel && !(p.channel instanceof BeamCh))) return; // the next one goes when this cast ends
    while (this.queue.length) {
      const sk = SKILLS[this.queue.shift()];
      if (sk && p.skillLevel(sk) && G.controls.castSkill(sk)) { this.age = 0; break; }
    }
  },
  reset() { this.queue.length = 0; this.keepT = 0; this.age = 0; },
};
