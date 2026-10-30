// The Bard's music, free of game state so tools can use it (tools/songbook.html):
//  - fitScore / bestMelody: which of the bar's candidate melodies the written rhythm matches best. Every cast re-fits
//    the bar, so notes written earlier can change pitch (and rest) to suit what came after them.
//  - realize: pitch the written glyphs from the melody's spell bar (heads on the tune's own onsets take its notes,
//    extra heads pass by step, notes the tune breathes inside are drawn as a shorter note and a rest).
//  - arrangement: the two-handed performance: the written bar in the right hand over the style's left hand, then the
//    finishing bar (runs, a second voice, a trill, the tonic arrival) from a compatible melody.
//  - pickFinish: a finishing bar that has never been heard after this spell bar.
//  - songArrangement: a bar written from a Music Sheet (data/tabs.js): its notes as written, landing on the song's next.
import { NOTES, MEASURE, REGISTERS, artFor, NOTE_OF_TICKS, REST_OF_TICKS } from '../data/notation.js';
import { melodies, finishes, TPB, degNote, altOf, chordAt, chordPcs, inChord } from '../data/melodies.js';

const T = (b) => Math.round(b * TPB);
const onsets = (M) => M._on || (M._on = new Map(M.A.rh.map((e) => [e.t, e])));
const eventAt = (rh, tick) => { let i = -1; for (let k = 0; k < rh.length && rh[k].t <= tick; k++) i = k; return i; };
/** Tick positions of a written glyph's heads. */
const headTicks = (n) => { const N = NOTES[n.g], k = N.heads || 1, s = T(n.at), len = T(N.beats); return Array.from({ length: k }, (_, i) => s + Math.round((i * len) / k)); };

/** How well written notes (plus an optional extra one) match a melody's spell-bar rhythm: higher is closer. */
export function fitScore(M, notes, extra = null) {
  const rh = M.A.rh, on = onsets(M), heads = new Set();
  let s = 0, span = 0;
  for (const n of extra ? [...notes, extra] : notes) {
    const N = NOTES[n.g];
    if (!N || N.clef) continue;
    span = Math.max(span, T(n.at + N.beats));
    if (N.rest) { // the tune rests or holds there: a natural breath
      const s0 = T(n.at), e = rh[eventAt(rh, s0)];
      let hits = 0; for (const t of on.keys()) if (t >= s0 && t < s0 + T(N.beats) && !on.get(t).r) hits++;
      s += e && e.r ? 1.5 : hits === 0 ? 0.8 : -0.5 * hits;
      continue;
    }
    for (const h of headTicks(n)) {
      heads.add(h);
      const e = on.get(h);
      if (e) s += e.r ? -1 : 2;
      else { const c = rh[eventAt(rh, h)]; s += c && !c.r ? 0.25 : -0.8; }
    }
  }
  for (const e of rh) if (e.t < span && !e.r && !heads.has(e.t)) s -= 0.35;   // tune notes the Bard skipped
  return s;
}
/** The best-fitting candidate (rand() adds a little chance, `cur` is preferred unless another fits clearly better). */
export function bestMelody(cands, notes, cur, rand = Math.random) {
  const M = melodies();
  let best = cur, bs = -Infinity;
  for (const id of cands) {
    const s = fitScore(M[id], notes) + (id === cur ? 0.8 : 0) + rand() * 0.6;
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}

/**
 * Pitch the written notes from melody M's spell bar, in place: n.heads = [{ at, L, acc, midi, d }] (L = diatonic
 * staff index, bass clef an octave lower) and n.disp = the drawn glyphs when the tune breathes inside a written note
 * ([{ g, at, heads }], a shorter note then a rest). n.sound = ticks each head sounds.
 */
export function realize(M, notes, clef = 'treble') {
  const key = M.key, rh = M.A.rh, oct = clef === 'bass' ? -12 : 0, Loff = clef === 'bass' ? 21 : 28;
  let prevE = -1, prevD = null;
  const nextNote = (i) => { for (let k = i + 1; k < rh.length; k++) if (!rh[k].r) return rh[k]; return null; };
  const prevNote = (i) => { for (let k = i; k >= 0; k--) if (!rh[k].r) return rh[k]; return null; };
  for (const n of notes) {
    const N = NOTES[n.g];
    n.disp = null;
    if (!N || N.rest || N.clef) { n.heads = []; continue; }
    const ticks = headTicks(n), each = Math.round(T(N.beats) / ticks.length), heads = [];
    for (const h of ticks) {
      const i = eventAt(rh, h), e = rh[i];
      let d;
      if (e && !e.r && e.t === h) d = e.d;
      else if (!e || e.r) { const nx = nextNote(Math.max(-1, i)); d = nx ? nx.d : (prevNote(i) || rh[0]).d; }   // an anticipation
      else if (i === prevE && prevD !== null) { // more notes than the tune inside one of its notes: pass by step
        const nx = nextNote(i), to = nx ? nx.d : e.d;
        d = to > prevD ? prevD + 1 : to < prevD ? prevD - 1 : prevD === e.d ? e.d + 1 : e.d;
      } else d = e.d;
      const ch = chordAt(M.A, h);
      let alt = altOf(key, ch, d);
      if (prevD !== null && Math.abs(d - prevD) === 1) { // never an augmented second
        const st = Math.abs(degNote(key, d, alt).m - degNote(key, prevD, heads.length ? heads[heads.length - 1].alt : 0).m);
        if (st === 3 && e && !e.r) { d = e.d; alt = altOf(key, ch, d); }
      }
      const nt = degNote(key, d, alt);
      heads.push({ at: h / TPB, L: nt.L + Loff, acc: nt.acc, midi: 60 + nt.m + oct, d, alt });
      prevE = i; prevD = d;
    }
    n.heads = heads; n.sound = each;
    // the tune breathes inside a written note: draw (and play) a shorter note, then the rest
    const s0 = ticks[0], len = T(N.beats);
    if (heads.length === 1 && len >= 24) {
      const r = rh.find((x) => x.r && x.t > s0 && x.t < s0 + len), a = r && r.t - s0, b = r && s0 + len - r.t;
      if (r && !rh.some((x) => !x.r && x.t > s0 && x.t < r.t) && NOTE_OF_TICKS[a] && REST_OF_TICKS[b]) {
        n.disp = [{ g: NOTE_OF_TICKS[a], at: n.at, heads }, { g: REST_OF_TICKS[b], at: r.t / TPB, heads: [] }];
        n.sound = a;
      }
    } else if (n.g === 'e2' && on2rest(rh, s0 + 12)) {
      n.heads = heads.slice(0, 1); n.sound = 12;
      n.disp = [{ g: 'e', at: n.at, heads: n.heads }, { g: 're', at: n.at + 0.5, heads: [] }];
    }
  }
  return notes;
}
const on2rest = (rh, t) => { const e = rh.find((x) => x.t === t); return !!(e && e.r); };
/** The glyphs to engrave for written notes (their realised rhythm). */
export const drawn = (notes) => notes.flatMap((n) => (n.disp ? n.disp.map((x) => ({ ...x, tier: n.tier, sk: n.sk })) : [n]));

// ---------------------------------------------------------------- the left hand
const pcOf = (m) => ((m % 12) + 12) % 12;
const above = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;   // the lowest midi >= lo with pitch class pc
/**
 * The style's accompaniment over a bar's chords, ticks [0, until): events { tick, ticks, midi, vel, art }.
 * top = the highest the left hand may reach (under the right hand), bl = the bass's lowest key.
 */
export function leftHand(key, chords, pat, tempo, until, top, bl = 40) {
  const ev = [], add = (tick, ticks, midi, vel, art) => { if (tick < until && midi >= 36 && midi <= top) ev.push({ tick, ticks: Math.min(ticks, until - tick), midi, vel, art }); };
  const bassOf = (ch) => above(pcOf(chordPcs(key, ch)[ch.bass === ch.root ? 0 : 2]), bl);
  const tones = (ch, lo) => chordPcs(key, ch).map((pc) => above(pc, lo)).sort((a, b) => a - b);
  const ch = (t) => chords[Math.min(3, Math.floor(t / TPB))];
  const changes = []; for (let b = 0; b < 4; b++) if (!b || chords[b] !== chords[b - 1]) changes.push(b * TPB);
  const spanOf = (t) => (changes.find((c) => c > t) ?? 96) - t;
  if (pat === 'broken') {
    for (let h = 0; h < 96; h += 48) { const c = ch(h), b = bassOf(c), pcs = chordPcs(key, c), f = above(pcs[2], b + 1), th = above(pcs[1], b + 12);
      [b, f, b + 12, th].forEach((m, i) => add(h + i * 12, 48 - i * 12, m, i ? 0.42 : 0.55, 'normal_held')); }
  } else if (pat === 'arp') {
    for (let h = 0; h < 96; h += 48) { const c = ch(h), b = bassOf(c); add(h, 48, b, 0.55, 'normal_held'); tones(c, b + 7).forEach((m, i) => add(h + 24 + i * 3, 24 - i * 3, m, 0.38, 'normal_held')); }
  } else if (pat === 'alberti') {
    const step = tempo <= 118 ? 6 : 12;
    for (let t = 0; t < 96; t += step * 4) { const c = ch(t), tt = tones(c, Math.max(47, bassOf(c))), [r, th, f] = [tt[0], tt[1], tt[2]];
      [r, f, th, f].forEach((m, i) => add(t + i * step, step, m, i ? 0.4 : 0.5, 'normal_short')); }
  } else if (pat === 'walking') {
    for (let b = 0; b < 4; b++) { const c = chords[b], m = bassOf(c), nx = b < 3 ? bassOf(chords[b + 1]) : bassOf(chords[0]);
      add(b * 24, 12, m, 0.55, 'normal_short');
      const dir = nx > m ? 1 : nx < m ? -1 : 0, pass = dir ? m + dir * (Math.abs(nx - m) <= 2 ? 1 : 2) : m + 12;
      add(b * 24 + 12, 12, dir && !inChord(c, 0) && Math.abs(nx - m) > 4 ? m + 7 : pass, 0.45, 'normal_short'); }
  } else if (pat === 'counter') {
    for (let b = 0; b < 4; b++) { const tt = tones(chords[b], 50); add(b * 24, 12, tt[2], 0.45, 'normal_short'); add(b * 24 + 12, 12, b % 2 ? tt[0] : tt[1], 0.4, 'normal_short'); }
    for (const t of changes) add(t, spanOf(t), bassOf(ch(t)), 0.45, 'normal_held');
  } else if (pat === 'oompah') {
    for (let b = 0; b < 4; b++) { const c = chords[b], m = bassOf(c);
      if (b % 2 === 0) add(b * 24, 18, b === 2 && c === chords[0] ? above(chordPcs(key, c)[2], bl - 5) : m, 0.6, 'marcato_short');
      else tones(c, Math.max(52, m + 8)).slice(0, 3).forEach((x) => add(b * 24, 12, x, 0.34, 'staccato_short')); }
  } else if (pat === 'march') {
    for (let b = 0; b < 4; b++) { const m = bassOf(chords[b]); add(b * 24, 18, [m, m + 7, m + 12, m + 7][b], 0.5, 'marcato_short'); }
  } else if (pat === 'drone') {
    for (const t of changes) { const m = bassOf(ch(t)); add(t, spanOf(t), m, 0.5, 'normal_held'); add(t, spanOf(t), m + 7, 0.36, 'normal_held'); }
    for (let t = 0; t < 96; t += 12) { const m = bassOf(ch(t)) + 12; add(t, 6, m, t % 24 ? 0.3 : 0.38, 'staccato_short'); }
  } else if (pat === 'ostinato') {
    add(0, 96, bassOf(chords[0]), 0.36, 'normal_held');
    for (let t = 0; t < 96; t += 12) { const m = bassOf(ch(t)); add(t, 12, t === 84 ? m + 1 : [m, m + 7, m + 12, m + 7][(t / 12) % 4], 0.46, 'normal_short'); }
  } else if (pat === 'lament') {
    let prev = null;
    for (let b = 0; b < 4; b++) { const c = chords[b], pcs = chordPcs(key, c);
      let m = bassOf(c);
      if (prev !== null) { let best = m; for (const pc of pcs) { const x = above(pc, prev - 3); if (x < prev && x >= 38) best = x; } m = best; }
      add(b * 24, 24, m, 0.52, 'normal_held'); prev = m; }
    for (const t of changes) tones(ch(t), 53).slice(0, 2).forEach((x) => add(t, spanOf(t), x, 0.3, 'normal_held'));
  } else if (pat === 'block') {
    for (const t of changes) { const c = ch(t), m = bassOf(c); add(t, spanOf(t), m, 0.52, 'normal_held'); add(t, spanOf(t), m - 12 >= 36 ? m - 12 : m + 12, 0.32, 'normal_held');
      tones(c, m + 5).forEach((x) => add(t, spanOf(t), x, 0.32, 'normal_held')); }
  } else if (pat === 'pedal') {
    for (let t = 0; t < 96; t += 12) { const m = bassOf(ch(t)); add(t, 12, t % 24 ? m + 12 : m, t % 24 ? 0.4 : 0.56, t % 24 ? 'staccato_short' : 'marcato_short'); }
    for (let b = 1; b < 4; b += 2) tones(chords[b], 52).slice(1, 3).forEach((x) => add(b * 24 + 12, 6, x, 0.32, 'staccato_short'));
  }
  return ev;
}

// ---------------------------------------------------------------- the performance
/** How long the performance of a written bar of `land` beats lasts: that bar, then the finishing bar. */
export const performBeats = (land = MEASURE) => land + MEASURE;
/**
 * The two-handed performance as sequencer events ({ midi, beat, beats, vel, art, legato, tag: { hand, part } }):
 * the written notes in the right hand over melody M's left hand for `land` beats, then melody F's finishing bar
 * (same key) with its own left hand, ending on the tonic. clef 'bass' plays the right hand an octave lower.
 */
export function arrangement(M, notes, F, { clef = 'treble', land = MEASURE } = {}) {
  const ev = [], key = M.key, low = clef === 'bass', oct = low ? -12 : 0, tpb = 1 / TPB;
  const add = (hand, part, midi, beat, beats, vel, art, legato = 0.96) => ev.push({ midi, beat, beats, vel, art, legato, tag: { hand, part } });
  // bar A, right hand: every written head at its beat in its skill's touch
  let rhLow = 99;
  for (const n of notes) {
    if (!n.heads || !n.heads.length) continue;
    const sound = (n.sound || T(NOTES[n.g].beats)) * tpb, art = artFor(n.reg, sound);
    for (const h of n.heads) {
      add('rh', 'A', h.midi, h.at, sound, 0.82, art);
      const dbl = REGISTERS[n.reg] && REGISTERS[n.reg].double && h.midi - 12 >= (low ? 47 : 57);
      if (dbl) add('rh', 'A', h.midi - 12, h.at, sound, 0.42, art);
      rhLow = Math.min(rhLow, dbl ? h.midi - 12 : h.midi);
    }
  }
  const lhTop = (lo) => Math.min(low ? 55 : 64, lo - 3), bl = low ? 36 : 40;
  for (const e of leftHand(key, M.A.chords, M.A.lh, M.tempo, T(land), lhTop(rhLow === 99 ? 67 : rhLow), bl)) add('lh', 'A', e.midi, e.tick * tpb, e.ticks * tpb, e.vel, e.art);
  // bar B: the finishing bar
  const B = F.B, b0 = land, rh = B.rh, notesB = rh.filter((e) => !e.r), arrive = B.arrive;
  const second = (e) => { // a second voice a third or sixth below, in the chord, kept clear of the left hand
    if (!F.voice2 || (e.dur < 24 && e.t !== arrive)) return null;
    const ch = chordAt(B, e.t), d2 = [e.d - 2, e.d - 5].find((d) => inChord(ch, d)), m = d2 === undefined ? 0 : 60 + degNote(key, d2, altOf(key, ch, d2)).m + oct;
    return m >= (low ? 50 : 57) ? m : null;
  };
  const lowB = Math.min(...notesB.flatMap((e) => [60 + degNote(key, e.d, e.alt).m + oct, second(e) || 99]));
  const big = F.style === 'fantasy' || F.style === 'toccata' || F.style === 'tavern';
  rh.forEach((e, i) => {
    if (e.r) return;
    const midi = 60 + degNote(key, e.d, e.alt).m + oct, at = b0 + e.t * tpb, isArr = e.t === arrive;
    const len = isArr ? (96 - e.t) * tpb : e.dur * tpb, art = isArr ? (big ? 'marcato_held' : 'normal_held') : e.dur <= 12 ? 'normal_short' : 'normal_held';
    const nx = rh[i + 1];
    if (F.orn && nx && nx.t === arrive && e.dur >= 12) { // a trill into the arrival: upper neighbour and note in 32nds, then the note
      const up = 60 + degNote(key, e.d + 1, altOf(key, chordAt(B, e.t), e.d + 1)).m + oct, n32 = Math.floor((e.dur * 2) / 3 / 3);
      for (let k = 0; k < n32; k++) add('rh', 'B', k % 2 ? midi : up, at + k * 3 * tpb, 3 * tpb, 0.7, 'normal_short');
      add('rh', 'B', midi, at + n32 * 3 * tpb, e.dur * tpb - n32 * 3 * tpb, 0.8, 'normal_short');
    } else add('rh', 'B', midi, at, len, isArr ? 0.92 : 0.8, art);
    const m2 = second(e);
    if (m2) add('rh', 'B', m2, at, len, 0.48, 'normal_held');
  });
  for (const e of leftHand(key, B.chords, B.lh, M.tempo, arrive, lhTop(lowB), bl)) add('lh', 'B', e.midi, b0 + e.tick * tpb, e.ticks * tpb, e.vel, e.art);
  // the tonic arrival in the left hand: a low octave and a rolled triad, rung to the end of the bar
  const ton = chordPcs(key, B.chords[3]), r0 = above(ton[0], bl), root = r0 > lhTop(lowB) && r0 - 12 >= 36 ? r0 - 12 : r0, ring = (96 - arrive) * tpb, ta = b0 + arrive * tpb;
  add('lh', 'B', root, ta, ring, 0.62, big ? 'marcato_held' : 'normal_held', 0.97);
  if (root + 12 <= lhTop(lowB)) add('lh', 'B', root + 12, ta, ring, 0.45, 'normal_held', 0.97);
  ton.map((pc) => above(pc, root + 7)).filter((m) => m <= lhTop(lowB)).forEach((m, i) => add('lh', 'B', m, ta + (i + 1) * 0.06, ring - (i + 1) * 0.06, 0.36, 'normal_held', 0.97));
  return ev;
}

/**
 * A finishing bar for spell bar `a`: one never heard after it (`heard` has 'a:b' keys) and not used lately
 * (`recent` ids), else one not used lately, else any that fits.
 */
export function pickFinish(a, heard, recent = [], rand = Math.random) {
  const all = finishes(a), fresh = all.filter((b) => !heard.has(`${a}:${b}`) && !recent.includes(b));
  const pool = fresh.length ? fresh : all.filter((b) => !recent.includes(b)).length ? all.filter((b) => !recent.includes(b)) : all;
  return pool[Math.floor(rand() * pool.length)];
}

// ---------------------------------------------------------------- Music Sheets
/** How long a sheet's landing note rings, in beats (the performance ends with it). */
export const SONG_LAND = 1.5;
/**
 * A bar written from a Music Sheet as sequencer events: every head as the song has it in its skill's touch (the chord
 * under it in the left hand), then the song's next note lands on beat `land` with its octave below (louder in the bass
 * clef, where the whole bar sits an octave lower). No melody harmony or finishing bar is added: the song goes on.
 */
export function songArrangement(notes, clef = 'treble', land = MEASURE, landEv = null) {
  const ev = [], oct = clef === 'bass' ? -12 : 0, add = (hand, midi, beat, beats, vel, art, legato = 0.96) => ev.push({ midi, beat, beats, vel, art, legato, tag: { hand, part: 'A' } });
  for (const n of notes) {
    if (!n.heads || !n.heads.length) continue;
    const sound = (n.sound || T(NOTES[n.g].beats)) / TPB, art = artFor(n.reg, sound);
    for (const h of n.heads) {
      add('rh', h.midi, h.at, sound, 0.82, art);
      for (const m of h.ch || []) add('lh', m, h.at, sound, 0.4, art);
    }
  }
  if (landEv && landEv.length) {
    landEv.forEach((m, i) => add(i ? 'lh' : 'rh', m + oct, land, SONG_LAND, i ? 0.42 : 0.9, 'normal_held', 1));
    add('lh', landEv[landEv.length - 1] + oct - 12, land, SONG_LAND, oct ? 0.8 : 0.5, 'normal_held', 1);
  }
  return ev;
}
