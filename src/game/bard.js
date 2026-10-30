// The Bard composes. Every Bard skill writes its glyph (data/notation.js) into the 4/4 measure over his head.
// Exactly four beats plays a Cadence: in the treble key every written note flies off the staff again as a homing
// note, in the bass key the measure lands as one ground-shaking chord; rests breathe mana and life back.
// A perfect cadence builds Harmony (+6% Bard damage each, up to 5, 12 s); overfilling the bar is a Discord that
// scatters the notes and breaks Harmony. Clefs (0 beats) change the key. Also the note projectiles' special
// behaviours (vibrato, staccato, fermata, crescendo, glissando, scatter, triplets, rests) and the cosmetic note
// flights of skills that are not projectiles.
// The music (data/melodies.js, bardmusic.js): each bar picks a key and its candidate melodies (2,000 two-bar
// harpsichord pieces); every cast re-fits the written rhythm to the candidate it matches best, so earlier notes can
// change pitch or breathe a rest. A Cadence performs the bar with both hands, then a finishing bar from a compatible
// melody that has never followed this one, so no song is heard twice. Casts write nothing while the written bar is
// performed; during the finishing bar they write the next bar silently, and a bar completed then waits for its downbeat.
// Music Sheets: with locked sheets in his Tabs (G.char.tabs, data/tabs.js) every bar is written from the song in the
// current Tab instead: each notehead takes the song's next note, whatever skill wrote it, so the song plays on as he
// fights; a Cadence lands on the song's next note (no finishing bar), and when the song ends the next loaded Tab plays.
import { G } from '../state.js';
import { rand, chance, TAU, angleTo, dist } from '../core/util.js';
import { sfx, audioCtx } from '../core/audio.js';
import { loadInstruments, instReady, playNote, playSequence, audioNow, stopVoices } from '../core/sampler.js';
import { isoX, isoY, HW, HH, camera } from '../core/view.js';
import { addEffect, Ring, floatText, effects } from '../gfx/vfx.js';
import { NOTES, MEASURE, SINGLE, noteOf, noteTier, REGISTERS, registerOf, artFor } from '../data/notation.js';
import { melodies, inKey, KEYS, TPB, chordAt, chordPcs } from '../data/melodies.js';
import { realize, bestMelody, fitScore, arrangement, pickFinish, performBeats, drawn, songArrangement, SONG_LAND } from './bardmusic.js';
import { sheetSong, songNext, spellNote, TAB_SLOTS } from '../data/tabs.js';
export { realize, arrangement };
import { SKILLS } from '../data/skills.js';
import { ScoreFx, scoreWorld, cadenceFx, flyNote, noteParticles, noteBurst, drawStaff, drawNoteShape, TIERS } from '../gfx/notation.js';
import { hit, aoe } from './combat.js';
import { Projectile } from './hazards.js';
import { GroundItem } from './loot.js';

class Wait {
  constructor(t, fn) { this.t = t; this.fn = fn; }
  update(dt) { this.t -= dt; if (this.t <= 0) { this.fn(); return false; } return true; }
  draw() {}
}
const later = (w, t, fn) => w.addHazard(new Wait(t, fn));
const roll = (d) => rand(d[0], d[1]);
const EPS = 1e-6;

// ---------------------------------------------------------------- songs heard (never the same song twice)
const HEARD_KEY = 'velscour_bard_heard', HEARD_MAX = 6000, RECENT = 48;
let heard = null;
function heardSet() {
  if (heard) return heard;
  heard = new Set();
  try { const a = JSON.parse(localStorage.getItem(HEARD_KEY) || '[]'); if (Array.isArray(a)) for (const k of a) heard.add(k); } catch (e) { /* private mode */ }
  return heard;
}
function remember(song) {
  const h = heardSet();
  h.add(song);
  if (h.size > HEARD_MAX) h.delete(h.values().next().value);
  try { localStorage.setItem(HEARD_KEY, JSON.stringify([...h])); } catch (e) { /* full or blocked */ }
}

export function bardScore(p) {
  if (!p.score) { p.score = { notes: [], beats: 0, key: 'treble', harmony: 0, harmonyT: 0, idle: 0, flash: 0, discord: 0, cadences: 0, discords: 0, mel: -1, keyId: null, cands: [], recentA: [], recentB: [], play: null, pending: null, song: null }; nextBar(p.score, p); }
  return p.score;
}
const pcOfKey = (k) => k.pc + (k.minor ? 3 : 0);   // a minor key's relative major
/**
 * A new bar: a key (often the same or a neighbour of the last, so the songs flow), its candidate melodies (none
 * played lately), and one of them to start from; its key signature shows on the empty staff at once.
 */
function nextBar(sc, p) {
  sc.song = p ? tabSong(p.char, sc.fresh ? null : sc.song) : null;
  sc.fresh = false;
  if (sc.song) { sc.keyId = sc.song.key.id; sc.bar = (sc.bar || 0) + 1; return; }   // a Music Sheet: the song's key
  const last = KEYS.find((k) => k.id === sc.keyId), x = Math.random();
  let key;
  if (last && x < 0.35) key = last;
  else if (last && x < 0.7) { // a neighbour: the relative key, the dominant or the subdominant side
    const pc = pcOfKey(last), near = KEYS.filter((k) => k !== last && [0, 5, 7].includes(((pcOfKey(k) - pc) % 12 + 12) % 12));
    key = near[Math.floor(Math.random() * near.length)] || last;
  } else key = KEYS[Math.floor(Math.random() * KEYS.length)];
  sc.keyId = key.id;
  const all = inKey(key.id);
  sc.cands = all.filter((id) => !sc.recentA.includes(id));
  if (!sc.cands.length) sc.cands = all;
  sc.mel = sc.cands[Math.floor(Math.random() * sc.cands.length)];
  sc.bar = (sc.bar || 0) + 1;
}
/** The song to write from: the current one goes on until it ends, then the next loaded Tab's (c.tabAt moves on). */
function tabSong(c, cur) {
  const tabs = (c && c.tabs) || [];
  if (!tabs.some((it) => sheetSong(it))) return null;
  const at = c.tabAt || 0, here = tabs[at];
  if (cur && here && cur.uid === here.uid && !cur.loops) return cur;
  if (cur && here && cur.uid === here.uid) { // it ended: the next loaded Tab, or this one again from where it wrapped
    for (let k = 1; k <= TAB_SLOTS; k++) { const i = (at + k) % TAB_SLOTS, s = sheetSong(tabs[i]); if (s) { if (i === at) { cur.loops = 0; return cur; } c.tabAt = i; return s; } }
  }
  for (let k = 0; k < TAB_SLOTS; k++) { const i = (at + k) % TAB_SLOTS, s = sheetSong(tabs[i]); if (s) { c.tabAt = i; return s; } }
  return null;
}
/** The Tabs changed (or a Tab was chosen to play next): an empty bar takes the new song at once, a written one at its end. */
export function bardRetune(p, restart = false) {
  const sc = p && p.score;
  if (!sc) return;
  if (restart) sc.fresh = true; // the chosen Tab starts from its first note
  if (!sc.notes.length && !sc.pending) nextBar(sc, p);
}
/** What the Bard is playing from his Tabs: { name, slot, at, of } or null. */
export function bardNowPlaying(p) {
  const s = p && p.score && p.score.song;
  return s ? { name: s.name, slot: p.char.tabAt, at: s.i, of: s.ev.length } : null;
}
/** The melody the bar is written from. */
export const bardMelody = (sc) => melodies()[sc && sc.mel >= 0 ? sc.mel : 0];
/** Re-fit the written bar to its best candidate and pitch every note again. */
function refit(sc) {
  if (sc.song) { songHeads(sc); return; }
  sc.mel = bestMelody(sc.cands, sc.notes, sc.mel);
  realize(bardMelody(sc), sc.notes, sc.key);
}
/** A sheet's bar: each new head takes the song's next note as written (its chord rides along); a note keeps its pitch. */
function songHeads(sc) {
  const S = sc.song, oct = sc.key === 'bass' ? -12 : 0;
  for (const n of sc.notes) {
    if (n.songed) continue;
    n.songed = true; n.disp = null;
    const N = NOTES[n.g];
    if (!N || N.rest || N.clef) { n.heads = []; continue; }
    const k = N.heads || 1, len = Math.round(N.beats * TPB);
    n.sound = Math.round(len / k);
    n.heads = Array.from({ length: k }, (_, i) => {
      const e = songNext(S), sp = spellNote(S.key, e[0] + oct);
      return { at: n.at + (i * N.beats) / k, L: sp.L, acc: sp.acc, midi: e[0] + oct, ch: e.slice(1).map((m) => m + oct) };
    });
  }
}
/**
 * Auto-play: how much better (+) or worse (-) the bar's best melody fits if glyph g is written next, about -1..1.
 * Rhythms that are some tune's own get pitched as that tune; this lets auto-play lean into them.
 */
export function bardFitGain(p, g) {
  const sc = p.score;
  if (!sc || sc.song || !NOTES[g] || NOTES[g].clef || bardPerforming(p)) return 0;   // a sheet's song fits any rhythm
  const M = melodies(), extra = { g, at: sc.beats }, ids = sc.cands.length > 60 ? sc.cands.filter((_, i) => i % 2 === sc.bar % 2) : sc.cands;
  let now = -Infinity, then = -Infinity;
  for (const id of ids) { now = Math.max(now, fitScore(M[id], sc.notes)); then = Math.max(then, fitScore(M[id], sc.notes, extra)); }
  const heads = NOTES[g].rest ? 1 : NOTES[g].heads || 1;
  return Math.max(-1, Math.min(1, (then - now) / (2 * heads) - 0.15));
}
const avgOf = (d) => (d[0] + d[1]) / 2;
/** What one written note is worth in a cadence: the skill's hit, never less than the basic attack's. */
function noteDmg(p, sk, L) {
  const basic = SKILLS['bard.0.0'];
  return Math.max(avgOf(p.skillDamage(sk, L)), avgOf(p.skillDamage(basic, Math.max(1, p.skillLevel(basic)))));
}
const rubato = (p) => p.buffs.some((b) => b.t > 0 && SKILLS[b.id] && SKILLS[b.id].m.rubato);

/**
 * The glyph a cast writes. The free basic notes fill the bar: with less than a beat left they play the longest
 * note that still fits (eighth, sixteenth, or a thirty-second rest), so the basic attack never causes a Discord.
 */
export function bardNoteFor(p, sk) {
  const g = noteOf(sk);
  if (!g || !sk.m.free || !p.score) return g;
  const rem = MEASURE - p.score.beats;
  if (NOTES[g].beats <= rem + EPS) return g;
  return ['e', 's', 'rt'].find((k) => NOTES[k].beats <= rem + EPS) || g;
}

const playing = (sc) => !!sc.play && !sc.play.done && sc.play.w.hazards.includes(sc.play);
/**
 * A note sounds as it is written (a beamed group or triplet plays its figure at the tune's tempo), with the chord's
 * root under it in the left hand when the harmony changes. The writing is one voice: a new note cuts the one before
 * it. Nothing sings while a song is being performed (its finishing bar is playing).
 */
function sing(sc, note) {
  if (!note.heads.length || playing(sc)) return;
  stopVoices(sc.wv || [], 0.05);
  const M = sc.song || bardMelody(sc), spb = 60 / M.tempo, t = audioNow(), N = NOTES[note.g], each = (N.beats / (N.heads || 1)) * spb, tag = { kind: 'write', bar: sc.bar };
  const art = artFor(note.reg, (note.sound || N.beats * TPB) / TPB), dbl = REGISTERS[note.reg] && REGISTERS[note.reg].double;
  sc.wv = note.heads.flatMap((h) => {
    const at = t + (h.at - note.at) * spb, v = [playNote('harpsichord', h.midi, { at, dur: Math.max(0.12, each), vel: 0.62, art, tag })];
    if (dbl && h.midi >= 67) v.push(playNote('harpsichord', h.midi - 12, { at, dur: Math.max(0.12, each), vel: 0.32, art, tag }));
    for (const m of h.ch || []) v.push(playNote('harpsichord', m, { at, dur: Math.max(0.12, each), vel: 0.3, art, tag }));
    return v;
  });
  if (sc.song) return;   // a sheet's chords are its own
  const ch = chordAt(M.A, Math.round(note.at * TPB));
  if (ch !== sc.wch) { // the bass of a new chord
    sc.wch = ch;
    const lo = sc.key === 'bass' ? 36 : 40, pc = chordPcs(M.key, ch)[0], bass = lo + ((pc - lo) % 12 + 12) % 12;
    sc.wv.push(playNote('harpsichord', bass, { at: t, dur: Math.min(1.2, 2 * spb), vel: 0.4, art: 'normal_held', tag }));
  }
}

/** Is the written bar being performed, or is a finished bar waiting for its downbeat? Nothing is written then. */
export function bardPerforming(p) {
  const sc = p.score;
  if (!sc) return false;
  if (sc.pending) return true;
  return playing(sc) && sc.play.w === p.world && sc.play.t < sc.play.lock;
}

/**
 * A Bard skill was cast: write its note into the measure (called by Player.tryUseSkill). While a bar is performed
 * the skill still works but writes nothing (a clef still changes the key of the next bar).
 */
export function bardCompose(p, sk, L) {
  const g = bardNoteFor(p, sk);
  if (!g || !p.world || p.world.kind === 'town') return;
  const sc = bardScore(p), N = NOTES[g], tier = noteTier(L);
  sc.idle = 0;
  if (N.clef) {
    if (sc.key !== N.clef) { sc.key = N.clef; floatText(p.x, p.y, 92, N.clef === 'bass' ? 'Bass Clef' : 'Treble Clef', TIERS[tier].staff, 11); if (sc.notes.length && !sc.song) realize(bardMelody(sc), sc.notes, sc.key); }
    sc.flash = Math.max(sc.flash, 0.5);
    if (instReady() && !playing(sc) && !sc.pending) { // a rolled tonic chord in the clef's octave
      const M = sc.song || bardMelody(sc), base = N.clef === 'bass' ? 48 : 60, t = audioNow();
      stopVoices(sc.wv || [], 0.05);
      sc.wv = (sc.song ? [0, 4, 7].map((x) => (M.key.pc + x) % 12) : chordPcs(M.key, M.B.chords[3])).map((pc, i) => playNote('harpsichord', base + pc, { at: t + i * 0.045, dur: 0.6, vel: 0.5, art: 'normal_held', tag: { kind: 'clef', bar: sc.bar } }));
    }
    return;
  }
  if (bardPerforming(p)) return;
  // Da Capo and Rubato perform the bar at once; the cast that did it is the performance, so its note is not written
  if (sk.m.dacapo && sc.notes.length) { cadence(p, sc, 1.5, false, 'Da Capo!'); return; }
  if (sc.beats + N.beats > MEASURE + EPS) {
    if (rubato(p)) { cadence(p, sc, 1, true, 'Rubato!'); return; }
    discord(p, sc);
  }
  const note = { g, at: sc.beats, tier, dmg: noteDmg(p, sk, L), el: sk.el, sk: sk.id, reg: registerOf(sk), heads: [] };
  sc.notes.push(note);
  sc.beats += N.beats;
  refit(sc);
  if (Math.abs(sc.beats - MEASURE) < EPS) cadence(p, sc, 1, true);   // the performance plays this note in its place
  else sing(sc, note);
}

function discord(p, sc) {
  for (const n of sc.notes) { const [x, y, z] = scoreWorld(p, n.at); noteBurst(x, y, z, 0, 1, [n.g]); }
  sc.notes.length = 0; sc.beats = 0; sc.harmony = 0; sc.discord = 1; sc.discords++;
  nextBar(sc, p);
  if (G.bardStats) G.bardStats.dis++;
  floatText(p.x, p.y, 92, 'Discord', '#ff6060', 12);
  stopVoices(sc.wv || [], 0.05);
  if (instReady() && !playing(sc)) { const t = audioNow(), tag = { kind: 'discord', bar: sc.bar }; [48, 49, 54, 55, 61].forEach((m, i) => playNote('harpsichord', m, { at: t + i * 0.012, dur: 0.45, vel: 0.6, art: 'marcato_short', tag })); }
  else if (!instReady()) sfx('error', 0.5);
}

/**
 * The bar is performed: a playhead reads the measure in the melody's tempo while both hands play it, then the
 * finishing bar lands on the tonic. Gameplay rides the written bar: in the treble key each written note leaves the
 * staff as a homing note the moment it plays; in the bass key the whole measure lands as one chord on the finishing
 * bar's downbeat.
 */
// One bar at a time means about a third as many Cadences as when bars could overlap, so each one hits that much
// harder (tools/tests/bard_dps.js: Bard damage on dummies back to where it was).
const CADENCE_POWER = 6;
class Performance {
  constructor(p, sc, notes, mul, perfect, at = 0, landEv = null) {
    const S = sc.song, M = S || bardMelody(sc), end = notes.reduce((m, n) => Math.max(m, n.at + NOTES[n.g].beats), 0);
    const F = S ? null : melodies()[pickFinish(M.id, heardSet(), sc.recentB)];   // a sheet's song has no finishing bar
    Object.assign(this, { p, w: p.world, M, F, landEv, notes, drawn: drawn(notes), clef: sc.key, spb: 60 / M.tempo, t: 0, i: 0, ev: [], voices: [], bar: sc.bar });
    this.land = perfect ? MEASURE : Math.max(1, Math.ceil(end - EPS));
    this.lock = this.land * this.spb;                        // the written bar: nothing new is written meanwhile
    this.end = (S ? this.land + SONG_LAND : performBeats(this.land)) * this.spb;   // then the finishing bar (a sheet: its landing note)
    this.mul = mul * CADENCE_POWER; this.H = 1 + 0.1 * sc.harmony;
    this.tier = Math.max(...notes.map((n) => n.tier));
    if (!S) {
      this.song = `${M.id}:${F.id}`;
      remember(this.song);
      for (const [k, id] of [['recentA', M.id], ['recentB', F.id]]) { sc[k].push(id); if (sc[k].length > RECENT) sc[k].shift(); }
      if (G.bardStats) (G.bardStats.songs || (G.bardStats.songs = [])).push(this.song);
    }
    this.score(at);
  }
  at(beat, fn) { this.ev.push({ t: beat * this.spb, fn }); }
  /** Schedule the audio on the Web Audio clock (exact timing) and the gameplay on game time. */
  score(at) {
    const { p, w, notes } = this;
    const seq = playSequence(this.F ? arrangement(this.M, notes, this.F, { clef: this.clef, land: this.land }) : songArrangement(notes, this.clef, this.land, this.landEv), { at: Math.max(at, audioNow() + 0.05), bpm: this.M.tempo, tag: { kind: 'perf', bar: this.bar } });
    this.voices = seq.voices; this.start = seq.start;
    if (!instReady()) sfx('note', 1);
    // gameplay
    if (this.clef === 'bass') {
      this.at(this.land, () => {
        if (p.dead || p.world !== w) return;
        const total = notes.reduce((s, n) => s + n.dmg, 0) * 0.42 * this.mul * this.H, r = 3.2, tier = this.tier, lastN = notes[notes.length - 1];
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU;
          flyNote({ x0: p.x, y0: p.y, z0: 30, x1: p.x + Math.cos(a) * r, y1: p.y + Math.sin(a) * r, z1: 6, dur: 0.32, glyph: i % 2 ? 'bass' : notes[i % notes.length].g, tier, burst: 2, s: 1.1 });
        }
        for (let i = 0; i < 3; i++) addEffect(new Ring(p.x, p.y, 0.1, r * (0.6 + i * 0.25), 0.35 + i * 0.12, TIERS[tier].glow, 4));
        aoe(w, p, p.x, p.y, r, total, lastN.el, { sk: lastN.sk, knock: 1.4, stun: true, bardT: tier });
        camera.shake(7);
      });
    } else {
      const shots = notes.slice(0, 16), over = notes.length > 16 ? notes.length / 16 : 1;
      shots.forEach((n, i) => this.at(n.at, () => {
        if (p.dead || p.world !== w) return;
        let [x, y, z] = scoreWorld(p, n.at);
        if (!w.map.isFloor(x, y)) { x = p.x; y = p.y; }
        const foes = w.hostiles(p.team, p.x, p.y, 9).sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
        const t = foes.length ? foes[i % foes.length] : null;
        const ang = t && !t.dead ? angleTo(x, y, t.x, t.y) : rand(TAU), d = n.dmg * 0.5 * this.mul * this.H * over;
        w.addHazard(new Projectile({ world: w, src: p, x, y, z, ang, speed: 10, range: 9, fx: 'n_' + n.g, el: n.el, dmg: [d * 0.9, d * 1.1], o: { sk: n.sk, bardT: n.tier }, home: 1.6, tier: n.tier, light: true, cadence: true }));
      }));
      this.at(this.land, () => { if (!p.dead && p.world === w) cadenceFx(p, this.tier, notes.map((n) => n.g)); });
    }
    this.at(this.land + (this.F ? this.F.B.arrive / TPB : 0), () => { if (!p.dead && p.world === w) noteBurst(p.x, p.y, 70, this.tier, 4, ['q', 'e2', 'h']); });
    this.ev.sort((a, b) => a.t - b.t);
  }
  update(dt) {
    if (this.done) return false;
    this.t += dt;
    while (this.i < this.ev.length && this.ev[this.i].t <= this.t) this.ev[this.i++].fn();
    if (this.t >= this.end) { this.done = true; return false; }   // the last chord's own damper ends it; the next song may begin
    return true;
  }
  /** Cut short (tests, leaving the level): what was still to come happens now, the music fades. */
  flush() {
    while (this.i < this.ev.length) this.ev[this.i++].fn();
    this.done = true; this.cut = true; stopVoices(this.voices, 0.12);
  }
  draw() {}
}

function cadence(p, sc, mul, perfect, label) {
  const notes = sc.notes.splice(0);
  sc.beats = 0;
  if (!notes.length) return;
  if (perfect) { sc.harmony = Math.min(5, sc.harmony + 1); sc.harmonyT = 12; }
  sc.flash = 1; sc.cadences++;
  if (G.bardStats) G.bardStats.cad++; // tests count them across heroes and levels
  const rests = notes.filter((n) => NOTES[n.g].rest).length;
  if (rests) { p.mana = Math.min(p.maxMana, p.mana + p.maxMana * 0.04 * rests); p.heal(p.maxHp * 0.015 * rests, true); }
  floatText(p.x, p.y, 96, label || (sc.harmony > 1 ? `Cadence! Harmony ${sc.harmony}` : 'Cadence!'), TIERS[Math.min(4, sc.harmony)].staff, 13);
  stopVoices(sc.wv || [], 0.05); // the note that completed the bar gives way to its performance
  const q = { notes, mul, perfect, mel: sc.mel, song: sc.song, landEv: sc.song ? songNext(sc.song) : null, clef: sc.key, bar: sc.bar };   // a sheet lands on its own next note
  sc.rhythm = notes.map((n) => n.g).join();   // auto-play writes a different one next
  if (playing(sc)) sc.pending = q;   // it begins on the downbeat after the last song's finishing bar
  else perform(p, sc, q, 0);
  nextBar(sc, p);
}
/** Start the performance of a finished bar q (its melody, clef and bar number), at audio time `at` (0 = now). */
function perform(p, sc, q, at) {
  const keep = { mel: sc.mel, key: sc.key, bar: sc.bar, song: sc.song };
  Object.assign(sc, { mel: q.mel, key: q.clef, bar: q.bar, song: q.song });
  const perf = new Performance(p, sc, q.notes, q.mul, q.perfect, at, q.landEv);
  Object.assign(sc, keep);
  sc.play = perf; sc.wch = null;
  p.world.addHazard(perf);
}

let instAsked = false;
/** Per-frame upkeep (called by Player.update): Harmony decay, a forgotten tune, a waiting song, the staff over the head. */
export function bardUpdate(p, dt) {
  const sc = bardScore(p);
  if (!instAsked && audioCtx()) { instAsked = true; loadInstruments(); }
  if (!p._scoreFx || !effects.includes(p._scoreFx)) addEffect(p._scoreFx = new ScoreFx(p));
  sc.flash = Math.max(0, sc.flash - dt * 2); sc.discord = Math.max(0, sc.discord - dt * 2.5);
  if (sc.harmony && (sc.harmonyT -= dt) <= 0) sc.harmony = 0;
  if (sc.pending && !playing(sc) && p.world) { // the finished bar begins on the last song's final downbeat
    // on the beat when the audio clock agrees with the game's (a hitch or a background tab can part them: then now)
    const prev = sc.play, beat = prev && prev.w === p.world && prev.done && !prev.cut ? prev.start + prev.end : 0, now = audioNow();
    const at = beat > now && beat < now + 0.12 ? beat : 0, q = sc.pending;
    sc.pending = null;
    perform(p, sc, q, at);
  }
  if (sc.notes.length && !sc.pending && (sc.idle += dt) > 6) { sc.notes.length = 0; sc.beats = 0; nextBar(sc, p); }
}
/** Bard skill damage multiplier from Harmony. */
export const harmonyMul = (p) => (p.score && p.score.harmony ? 1 + 0.06 * p.score.harmony : 1);

// ===================================================================== note projectiles
const turn = (pr, a) => { const c = Math.cos(a), s = Math.sin(a), vx = pr.vx; pr.vx = vx * c - pr.vy * s; pr.vy = vx * s + pr.vy * c; };

/** Called by the Projectile constructor for any 'n_*' fx. */
export function bardProjInit(pr) {
  pr.note = pr.note || pr.fx.slice(2);
  pr.tier = pr.tier || 0; pr.hist = []; pr.seed = rand(TAU); pr.bm = pr.bm || {};
  pr.baseSp = pr.speed; pr.baseDmg = pr.dmg; pr.baseSize = pr.size; pr.head = pr.ang;
  if (pr.bm.ferm) pr.pierce = Math.max(pr.pierce, 99);
  if (pr.bm.stac) pr.pierce = Math.max(pr.pierce, 2);
}

/** Behaviour + particles each frame, before the projectile moves. */
export function bardProjUpdate(pr, dt) {
  const m = pr.bm, w = pr.world;
  if (pr.cadence && pr.z > 26) pr.z = Math.max(26, pr.z - dt * 150);
  if (!pr.lob && !pr.returning) {
    let sp = pr.baseSp;
    if (m.wavy) turn(pr, 0.6 * 11 * Math.cos(pr.t * 11 + pr.seed) * dt);
    if (m.gliss) sp *= 1 + Math.min(1.6, pr.t * 2.2);
    if (m.stac) {
      const go = (pr.t % 0.3) < 0.17;
      sp *= go ? 1.9 : 0.05;
      if (!go && pr.stacOn) { // each hop ends in a little pulse
        aoe(w, pr.src, pr.x, pr.y, 0.9 * pr.size, roll(pr.dmg) * 0.35, pr.el, { ...pr.o });
        addEffect(new Ring(pr.x, pr.y, 0.1, 0.9 * pr.size, 0.25, TIERS[pr.tier].glow, 2));
      }
      pr.stacOn = go;
    }
    if (m.ferm) {
      if (!pr.fermDone && !(pr.held > 0)) {
        const want = pr.tx != null ? Math.min(pr.range * 0.75, Math.max(1.5, dist(pr.sx, pr.sy, pr.tx, pr.ty))) : pr.range * 0.5;
        if (dist(pr.sx, pr.sy, pr.x, pr.y) >= want) { pr.held = m.hold || 2; pr.life = pr.t + pr.held + 0.4; pr.pulseT = 0; }
      }
      if (pr.held > 0) {
        sp = 0; pr.held -= dt; pr.pulseT -= dt;
        if (pr.pulseT <= 0) {
          pr.pulseT = 0.4;
          aoe(w, pr.src, pr.x, pr.y, 1.4 * pr.size, roll(pr.dmg) * 0.45, pr.el, { ...pr.o });
          addEffect(new Ring(pr.x, pr.y, 0.15, 1.4 * pr.size, 0.4, TIERS[pr.tier].glow, 3));
          addEffect(new Ring(pr.x, pr.y, 0.1, 1.0 * pr.size, 0.3, TIERS[pr.tier].staff, 1));
        }
        if (pr.held <= 0) pr.fermDone = true;
      }
    }
    const cur = Math.hypot(pr.vx, pr.vy);
    if (cur > 0.001) pr.head = Math.atan2(pr.vy, pr.vx);
    pr.vx = Math.cos(pr.head) * sp; pr.vy = Math.sin(pr.head) * sp;
  }
  if (m.cresc) {
    const k = Math.min(1, pr.t / 0.9);
    pr.size = pr.baseSize * (1 + 0.8 * k); pr.dmg = pr.baseDmg.map((v) => v * (1 + 0.9 * k));
  }
  const h = pr.hist, last = h[0];
  if (!last || Math.hypot(pr.x - last[0], pr.y - last[1]) + Math.abs(pr.z - last[2]) / 40 > 0.1) { h.unshift([pr.x, pr.y, pr.z]); if (h.length > 16) h.pop(); }
  noteParticles(pr.x, pr.y, pr.z, pr.tier, dt, Math.min(1.6, pr.size));
}

/** On-hit extras of a note projectile (d = the hit it just dealt). */
export function bardProjHit(pr, c, d) {
  const m = pr.bm, w = pr.world, src = pr.src;
  if (m.trip) for (let i = 1; i <= 2; i++) later(w, i * 0.09, () => { if (!c.dead) { hit(src, c, d * 0.5, pr.el, { ...pr.o }); noteBurst(c.x, c.y, 30, pr.tier, 1, [pr.note]); } });
  if (m.hush && src && src.isPlayer) src.mana = Math.min(src.maxMana, src.mana + src.maxMana * 0.012);
  if (m.gold && chance(0.3)) w.addLoot(new GroundItem(c.x, c.y, 'gold', { amount: Math.round((2 + c.level * 2) * (1 + ((src && src.st && src.st.goldFind) || 0) / 100)) }));
  if (m.scatter && !pr.child && (NOTES[pr.note].heads || 1) > 1) {
    const n = NOTES[pr.note].heads, base = pr.head, one = SINGLE[pr.note] || 'q';
    for (let i = 0; i < n; i++) {
      w.addHazard(new Projectile({ world: w, src, team: pr.team, x: c.x, y: c.y, ang: base + (i / (n - 1) - 0.5) * 1.3, speed: pr.baseSp * 1.1, range: 4.5, fx: 'n_' + one, el: pr.el, dmg: pr.baseDmg.map((v) => v * 0.5), o: pr.o, size: 0.8, child: true, tier: pr.tier, light: true }));
    }
    pr.bm = { ...m, scatter: false };
  }
  if (chance(G.touch ? 0.3 : 0.6)) noteBurst(c.x, c.y, pr.z, pr.tier, 2, [pr.note]);
}

/** Draw a note projectile: its particle staff, then the glyph. */
export function bardProjDraw(ctx, pr, px, py) {
  const pts = pr.hist.map(([x, y, z]) => [isoX(x, y), isoY(x, y) - z]);
  if (pts.length) pts[0] = [px, py];
  drawStaff(ctx, pts, pr.tier, pr.t, Math.min(1.5, 1.1 * pr.size), 1, pr.seed);
  ctx.save(); ctx.translate(px, py); drawNoteShape(ctx, pr.note, pr.size, pr.t, pr.tier); ctx.restore();
}

/** Orbiting notes ride a ring-shaped staff. */
export function bardOrbitDraw(ctx, orb) {
  const s = orb.src, cx = isoX(s.x, s.y), cy = isoY(s.x, s.y) - 24, r = orb.rad || orb.radius, tier = (orb.o && orb.o.bardT) || 0;
  const pts = [];
  for (let i = 0; i <= 32; i++) { const a = (i / 32) * TAU + orb.t * 0.8; pts.push([cx + (Math.cos(a) - Math.sin(a)) * r * HW, cy + (Math.cos(a) + Math.sin(a)) * r * HH]); }
  drawStaff(ctx, pts, tier, orb.t, 0.9, 0.55, 0, false);
}

/** Falling notes trail a short vertical staff. */
export function bardRainDraw(ctx, rain, f, x, y) {
  const px = isoX(x, y), py = isoY(x, y) - f.z, tier = (rain.o && rain.o.bardT) || 0;
  const pts = [];
  for (let i = 0; i < 7; i++) pts.push([px + i * 1.2, py - i * 9]);
  drawStaff(ctx, pts, tier, rain.t, 0.9, 0.9, f.ox * 3);
}

/** The Harmonic Beam: a straight five-line staff from the lute with notes streaming along it. */
export function bardBeamDraw(ctx, beam, ax, ay, bx, by) {
  const tier = (beam.o && beam.o.bardT) || 0, n = 18, pts = [];
  for (let i = 0; i <= n; i++) pts.push([ax + (bx - ax) * (i / n), ay + (by - ay) * (i / n)]);
  drawStaff(ctx, pts, tier, beam.t * 1.6, 1.5, 1, 0, false);
  const T = TIERS[tier], len = Math.hypot(bx - ax, by - ay) || 1;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25; ctx.strokeStyle = T.glow; ctx.lineWidth = 16;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const glyphs = ['q', 'e', 's2', 'e2', 't8', 's'];
  for (let i = 0; i < 6; i++) {
    const k = ((beam.t * 1.4 + i / 6) % 1), x = ax + (bx - ax) * k, y = ay + (by - ay) * k + Math.sin(k * 12 + i) * 3;
    ctx.save(); ctx.translate(x, y); drawNoteShape(ctx, glyphs[i], 0.8 + 0.2 * Math.sin(k * Math.PI), beam.t + i, tier); ctx.restore();
  }
  ctx.save(); ctx.translate(ax + (bx - ax) * 6 / len, ay + (by - ay) * 6 / len); drawNoteShape(ctx, beam.fx.slice(2), 1.1, beam.t, tier); ctx.restore();
}

// ===================================================================== cast flights for non-projectile skills
/** Every Bard skill shoots its glyph: buffs float it up, novas fling a ring of it, area spells drop it from above... */
export function bardCastFx(p, sk, L, tx, ty) {
  const g = noteOf(sk), k = sk.kind, m = sk.m;
  if (!g || k === 'proj' || k === 'orbit' || k === 'rain' || k === 'beam') return;
  const tier = noteTier(L), s = 1 + tier * 0.06;
  if (k === 'buff' || k === 'heal' || k === 'summon') {
    for (let i = 0; i < 3; i++) {
      const a = rand(TAU);
      flyNote({ x0: p.x + Math.cos(a) * 0.4, y0: p.y + Math.sin(a) * 0.4, z0: 18, x1: p.x + Math.cos(a + 2) * 0.9, y1: p.y + Math.sin(a + 2) * 0.9, z1: 86, dur: 0.75, glyph: g, tier, delay: i * 0.09, s, ease: true });
    }
  } else if (k === 'nova' || k === 'whirl' || (k === 'curse' && m.at === 'self')) {
    const r = (k === 'curse' ? 2.2 : k === 'whirl' ? 1.4 : 3) * (m.r ?? 1), n = G.touch ? 6 : 10, b = rand(TAU);
    for (let i = 0; i < n; i++) {
      const a = b + (i / n) * TAU;
      flyNote({ x0: p.x, y0: p.y, z0: 30, x1: p.x + Math.cos(a) * r, y1: p.y + Math.sin(a) * r, z1: 14, dur: 0.38, glyph: g, tier, burst: 1, s, ease: true });
    }
  } else if (k === 'aoe') {
    flyNote({ x0: tx - 1.6, y0: ty - 1.6, z0: 230, x1: tx, y1: ty, z1: 8, dur: 0.42, glyph: g, tier, s: s * 1.5, burst: 8 });
  } else if (k === 'leap' || k === 'dash' || k === 'blink') {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      flyNote({ x0: tx, y0: ty, z0: 20, x1: tx + Math.cos(a) * 1.6, y1: ty + Math.sin(a) * 1.6, z1: 10, dur: 0.35, glyph: g, tier, delay: 0.22, burst: 1, s });
    }
  } else { // curses, zones, walls, chains, fissures, melee: shot to the target
    const a = angleTo(p.x, p.y, tx, ty), d = Math.min(9, dist(p.x, p.y, tx, ty));
    flyNote({ x0: p.x + Math.cos(a) * 0.3, y0: p.y + Math.sin(a) * 0.3, z0: 30, x1: p.x + Math.cos(a) * d, y1: p.y + Math.sin(a) * d, z1: 14, dur: 0.12 + d / 18, arc: 18, glyph: g, tier, s, burst: 5 });
  }
}
