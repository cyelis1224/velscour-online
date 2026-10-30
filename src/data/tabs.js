// Music Sheets: tablature (guitar, bass, ukulele, any tuning) or note names the player pastes onto a sheet of paper,
// read into a tune. A Bard loads locked sheets into his five Tabs (G.char.tabs) and every note his skills write takes
// the song's next note instead of a melody's (game/bard.js, bardmusic.js). Free of game state, so tests can use it.
//   parseTab(text)   -> { ev: [[midi, ...]] (melody first), gaps, key, bpm, title, blocks, strings, mode, warn }
//   sheetSong(item)  -> the tune a Bard plays from a sheet: { tab, uid, name, key, tempo, ev, gaps, i, loops } or null
import { KEYS, NATURAL } from './melodies.js';

export const TAB_SLOTS = 5;          // the Bard's Tabs
export const SHEET_PRICE = 20;       // Fortunato sells blank sheets for this
export const SHEET_MAX = 24000;      // characters a sheet holds
export const BPM_RANGE = [100, 180]; // the tempo a performed bar may take (it times the Cadence's gameplay)
export const DEFAULT_BPM = 132;
const MAX_EV = 4000, CHORD = 4;      // notes kept per sheet, notes kept per chord (melody first)
const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC = { '#': 1, '♯': 1, b: -1, '♭': -1 };
const pcOf = (s) => (((PCS[s[0].toUpperCase()] + (ACC[s[1]] || 0)) % 12) + 12) % 12;
// standard tunings by string count, bottom string first (6 = guitar, 4 = bass, 7 = seven-string, ...)
const TUNINGS = { 2: [59, 64], 3: [55, 59, 64], 4: [28, 33, 38, 43], 5: [23, 28, 33, 38, 43], 6: [40, 45, 50, 55, 59, 64], 7: [35, 40, 45, 50, 55, 59, 64], 8: [30, 35, 40, 45, 50, 55, 59, 64], 9: [25, 30, 35, 40, 45, 50, 55, 59, 64] };
const TAB_CH = "-0-9|:hpbrsx~/\\\\().<>^*=tvPHBRSXo'";
const TABLINE = new RegExp(`^\\s*([A-Ga-g][#♯b♭]?)?\\s*([|:]?)\\s*([${TAB_CH}]+)`);
const TEMPO = /(?:tempo|bpm)\s*[:=]?\s*(\d{2,3})|(\d{2,3})\s*bpm/i;

/** A line of tablature: { label, body } or null. Needs dashes (one will do after a string name and a bar line), and a
 *  string name, a bar line or a fret number. */
function tabLine(line) {
  const m = TABLINE.exec(line);
  if (!m) return null;
  const body = m[3].replace(/[xX]\d+$/, ''), dashes = (body.match(/-/g) || []).length;
  if (!(dashes >= 3 || (m[1] && m[2] && dashes)) || !(m[1] || m[2] || /\d/.test(body))) return null;
  return { label: m[1] || null, body };
}

/** The pitch of every string, top line first (tab writes the highest string on top). */
function tuning(labels) {
  const n = labels.length;
  if (labels.every(Boolean)) {
    const pcs = labels.map(pcOf).reverse();
    if (n === 4 && pcs.join() === '7,0,4,9') return [69, 64, 60, 67];   // ukulele, high G
    const out = [40 + ((((pcs[0] - 40) % 12) + 18) % 12) - 6];          // bottom string nearest E2
    for (let i = 1; i < n; i++) out.push(out[i - 1] + ((((pcs[i] - out[i - 1]) % 12) + 12) % 12 || 12));
    return out.reverse();
  }
  return (TUNINGS[n] || Array.from({ length: n }, (_, i) => 28 + 5 * i)).slice().reverse();
}

/** The notes of one block of tab lines, column by column: [{ col, m: [midi...] }]. */
function readBlock(lines) {
  const tune = tuning(lines.map((l) => l.label)), cols = new Map();
  lines.forEach((l, s) => {
    const b = l.body;
    for (let x = 0; x < b.length; x++) {
      if (b[x] < '0' || b[x] > '9') continue;
      let num = b[x], j = x + 1;
      if (b[j] >= '0' && b[j] <= '9' && +(num + b[j]) <= 24) num += b[j++];
      (cols.get(x) || cols.set(x, []).get(x)).push(tune[s] + +num);
      x = j - 1;
    }
  });
  return [...cols.entries()].sort((a, b) => a[0] - b[0]).map(([col, m]) => ({ col, m }));
}

/** Note names instead of tab: "E4 D4 C4 D4 E4 E4 E4", "C D E", chords as "C4+E4+G4" (octave 4 by default). */
function readNames(text) {
  const toks = text.split(/[\s,;|\-]+/).filter(Boolean), ev = [];
  let hits = 0;
  for (const t of toks) {
    const parts = t.split('+'), m = [];
    for (const p of parts) {
      const r = /^([A-Ga-g])([#♯b♭]?)(\d)?$/.exec(p);
      if (r) m.push(12 * (+(r[3] ?? 4) + 1) + ((PCS[r[1].toUpperCase()] + (ACC[r[2]] || 0) + 12) % 12) + (r[1].toUpperCase() === 'B' && ACC[r[2]] === 1 ? 12 : 0) - (r[1].toUpperCase() === 'C' && ACC[r[2]] === -1 ? 12 : 0));
    }
    if (m.length === parts.length) { hits++; ev.push({ col: ev.length * 2, m }); }
  }
  return hits && hits >= toks.length * 0.75 ? ev : [];   // mostly note names, so prose isn't read as a tune
}

/** The major key whose scale holds the most of the notes (fewest sharps or flats on a tie). */
function guessKey(ev) {
  let best = KEYS[0], bv = Infinity;
  for (const k of KEYS) {
    if (k.minor) continue;
    const scale = new Set([0, 2, 4, 5, 7, 9, 11].map((s) => (k.pc + s) % 12));
    let out = 0;
    for (const e of ev) for (const m of e) if (!scale.has(((m % 12) + 12) % 12)) out++;
    const v = out + Math.abs(k.sig) * 0.01;
    if (v < bv) { bv = v; best = k; }
  }
  return best;
}

/** Spell a MIDI note in a key for the staff: { L (diatonic step, C4 = 28), acc } (sharps, or flats in flat keys). */
export function spellNote(key, midi) {
  const pc = ((midi % 12) + 12) % 12, oct = Math.floor(midi / 12) - 1;
  let L = NATURAL.indexOf(pc);
  if (L < 0) L = key.sig < 0 ? NATURAL.indexOf(pc + 1) : NATURAL.indexOf(pc - 1);
  return { L: L + 7 * oct, acc: pc - NATURAL[L] };
}

/**
 * Read a sheet. Tab blocks (runs of 2+ string lines) are read column by column, left to right, block after block;
 * every column with fret numbers is one event (a chord keeps its top four notes, highest first: the melody).
 * Without tab, note names are tried. The tune is moved by octaves so its melody sits round E4 (the sampler's middle).
 */
export function parseTab(text) {
  text = String(text || '').slice(0, SHEET_MAX);
  const lines = text.split(/\r?\n/), blocks = [], warn = [];
  let cur = [], title = '';
  const flush = () => { if (cur.length >= 2 && (cur.length >= 4 || cur.every((l) => l.label))) blocks.push(cur); else if (cur.length) warn.push(`skipped ${cur.length} stray tab line${cur.length > 1 ? 's' : ''}`); cur = []; };
  for (const ln of lines) {
    const t = tabLine(ln);
    if (t) { cur.push(t); continue; }
    flush();
    const s = ln.trim();
    if (!title && s && !TEMPO.test(s) && !/^(tuning|capo|key|chords?|intro|verse|chorus|bridge|outro|riff)\b/i.test(s) && s.length <= 48) title = s.replace(/[[\]{}<>]/g, '').trim();
  }
  flush();
  let ev = [], gaps = [], mode = 'tab';
  const strings = blocks.map((b) => b.length);
  for (const b of blocks) {
    const notes = readBlock(b);
    notes.forEach((n, i) => { ev.push(n.m); gaps.push(i + 1 < notes.length ? notes[i + 1].col - n.col : 0); });
  }
  if (!ev.length) {
    const names = readNames(lines.filter((l) => !TEMPO.test(l)).join('\n'));
    if (names.length) { mode = 'names'; title = ''; ev = names.map((n) => n.m); gaps = ev.map(() => 2); }
  }
  if (!ev.length) return { err: blocks.length ? 'The tab has no fret numbers.' : 'No tablature or note names found.', warn };
  if (ev.length > MAX_EV) { warn.push(`only the first ${MAX_EV} notes are kept`); ev.length = MAX_EV; gaps.length = MAX_EV; }
  // the usual step between notes is an eighth; a 0 (end of a block) takes it too
  const g = gaps.filter((x) => x > 0).sort((a, b) => a - b), unit = g.length ? g[g.length >> 1] : 2;
  gaps = gaps.map((x) => Math.max(0.25, Math.min(4, (x || unit) / unit)));
  const mel = ev.map((m) => Math.max(...m)).sort((a, b) => a - b), shift = 12 * Math.round((64 - mel[mel.length >> 1]) / 12);
  ev = ev.map((m) => [...new Set(m.map((x) => { x += shift; while (x < 40) x += 12; while (x > 88) x -= 12; return x; }))].sort((a, b) => b - a).slice(0, CHORD));
  const tm = TEMPO.exec(text), bpm = tm ? +(tm[1] || tm[2]) : null;
  return { ev, gaps, key: guessKey(ev), bpm, title, blocks: blocks.length, strings, mode, warn };
}

const cache = new Map();
/** parseTab, remembered per text. */
export function readSheet(text) {
  let r = cache.get(text);
  if (!r) { r = parseTab(text); if (cache.size > 64) cache.clear(); cache.set(text, r); }
  return r;
}
export const sheetTempo = (item, r = readSheet(item.text)) => Math.max(BPM_RANGE[0], Math.min(BPM_RANGE[1], item.bpm || r.bpm || DEFAULT_BPM));
/** The tune a Bard plays from a locked sheet (a fresh cursor at its first note), or null. */
export function sheetSong(item) {
  if (!item || item.type !== 'sheet' || !item.inked) return null;
  const r = readSheet(item.text);
  if (!r.ev || !r.ev.length) return null;
  return { tab: true, uid: item.uid, name: item.title || r.title || 'Untitled Song', key: r.key, tempo: sheetTempo(item, r), ev: r.ev, gaps: r.gaps, i: 0, loops: 0 };
}
/** The next event of a song (wrapping round to its start; `loops` counts the times it ended). */
export function songNext(song) {
  const e = song.ev[song.i];
  if (++song.i >= song.ev.length) { song.i = 0; song.loops++; }
  return e;
}

/** Sanitize an array of Bard sheet tabs for lightweight network serialization. */
export function sanitizeBardTabs(tabs, tabAt = 0) {
  if (!tabs || !Array.isArray(tabs)) return { tabs: [], tabAt: 0 };
  const sanitized = tabs.map((t) => {
    if (!t || !t.text) return null;
    return {
      uid: t.uid || ('tab_' + Math.random().toString(36).slice(2, 8)),
      title: String(t.title || 'Untitled Song').slice(0, 60),
      text: String(t.text).slice(0, SHEET_MAX),
      bpm: typeof t.bpm === 'number' ? t.bpm : null,
      inked: !!t.inked,
    };
  });
  return { tabs: sanitized, tabAt: Number(tabAt) || 0 };
}

