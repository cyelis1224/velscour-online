// Sound for VELSCOUR DEFENSE: Velscour's samples (assets/audio/sfx), its music and ambience beds, and the harpsichord
// (assets/audio/inst/harpsichord) for the Bard's Crescendo, the one moment music plays in battle. Its own AudioContext.
import { assetURL, ART } from './assets.js';
import { D } from '../state.js';

let ac = null, master = null, sfxBus = null, musicBus = null;
const bufs = new Map(), loading = new Map(), last = new Map();
export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  sfxBus = ac.createGain(); const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
  sfxBus.connect(comp); comp.connect(master);
  musicBus = ac.createGain(); musicBus.connect(master);
  applyVolumes();
  return ac;
}
export function applyVolumes() {
  if (!ac) return;
  const s = D.save?.settings || {};
  sfxBus.gain.value = s.sfx ?? 0.7; musicBus.gain.value = s.music ?? 0.4;
}
function buf(path) {
  if (bufs.has(path)) return bufs.get(path);
  if (!ac || loading.has(path)) return null;
  loading.set(path, fetch(assetURL(path)).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((d) => bufs.set(path, d)).catch(() => {}));
  return null;
}
const VARIANTS = { bow_attack: 2, fireball: 3, sword_attack: 3, sword_impact_hit: 3, sword_blocked: 3, sword_parry: 3, spell_impact: 3, ice_throw: 2, ice_freeze: 2,
  ice_barrage: 2, wave_attack: 2, waterspray: 2, firespray: 2, firebuff: 2, rock_meteor_swarm: 2, rock_meteor_throw: 2, rock_wall: 2, torch_attack_strike: 2,
  chest_open: 2, door_open: 2, torch_impact: 2, stone_walk: 5, chest_close: 2 };
/** Play a sample by its base name (variants _1.._n picked at random). Throttled per name. */
export function sfx(name, vol = 1) {
  if (!ac || !name) return;
  const now = ac.currentTime;
  if ((last.get(name) || 0) > now - 0.05) return;
  last.set(name, now);
  const n = VARIANTS[name], path = `assets/audio/sfx/${n ? name + '_' + (1 + Math.floor(Math.random() * n)) : name}.mp3`, b = buf(path);
  if (!b) return;
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = b; src.playbackRate.value = 0.94 + Math.random() * 0.12; g.gain.value = vol;
  src.connect(g); g.connect(sfxBus); src.start();
}
/** Warm the samples a battle uses so the first shots are not silent. */
export function preloadSfx() {
  if (!ac) return;
  for (const [name, n] of Object.entries(VARIANTS)) for (let i = 1; i <= n; i++) buf(`assets/audio/sfx/${name}_${i}.mp3`);
  for (const s of ['gate_open', 'portcullis_gate', 'lock_unlock']) buf(`assets/audio/sfx/${s}.mp3`);
}

// music and ambience: one looping <audio> each, routed through the music bus
const decks = {};
function deck(kind) {
  if (decks[kind]) return decks[kind];
  const a = new Audio(); a.loop = true; a.crossOrigin = 'anonymous';
  const d = { a, src: null, g: null, cur: null };
  if (ac) { d.src = ac.createMediaElementSource(a); d.g = ac.createGain(); d.src.connect(d.g); d.g.connect(musicBus); }
  decks[kind] = d;
  return d;
}
export function playMusic(file, vol = 1) { play('music', file ? `assets/audio/music/${file}.mp3` : null, vol); }
export function playAmbience(file, vol = 0.8) { play('amb', file ? `assets/audio/amb/${file}.mp3` : null, vol); }
function play(kind, path, vol) {
  if (!ac) return;
  const d = deck(kind);
  if (d.cur === path) return;
  d.cur = path;
  if (!path) { d.a.pause(); return; }
  d.a.src = assetURL(path); if (d.g) d.g.gain.value = vol;
  d.a.play().catch(() => {});
}

// the harpsichord (assets/audio/inst/harpsichord/held, keys 36-96): only the Bard's Crescendo plays it, the one time
// music sounds in battle. Each melody's keys load ahead of the Crescendo that plays it.
const harp = {}, wanted = new Set();
function loadKeys(keys) {
  if (!ac) return;
  for (const k of keys) {
    if (harp[k] || wanted.has(k) || k < 36 || k > 96) continue;
    wanted.add(k);
    fetch(assetURL(`assets/audio/inst/harpsichord/held/${k}.mp3`)).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((d) => { harp[k] = d; }).catch(() => wanted.delete(k));
  }
}
function note(midi, at, dur, vel) {
  let k = midi; while (k > 96) k -= 12; while (k < 36) k += 12;
  const b = harp[k];
  if (!b) return;
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = b;
  g.gain.setValueAtTime(vel * vel * 0.9, at); g.gain.setValueAtTime(vel * vel * 0.9, at + dur); g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.25);
  src.connect(g); g.connect(sfxBus); src.start(at); src.stop(at + dur + 0.3);
}
let jingleI = Math.floor(Math.random() * 400);
const melodyKeys = (j) => [...j.mel.map((n) => n[2]), ...j.bass];
const nextMelody = () => ART.jingles?.[jingleI % ART.jingles.length];
/** One of the Bard's melodies from VELSCOUR: two bars on the harpsichord, a bass note under every chord. */
export function playJingle() {
  if (!ac || !ART.jingles) return;
  const j = nextMelody(); jingleI++;
  loadKeys(melodyKeys(j));
  const beat = 60 / j.tempo, tick = beat / 24, t0 = ac.currentTime + 0.05;
  for (const [t, dur, m] of j.mel) note(m, t0 + t * tick, dur * tick * 0.95, 0.8);
  j.bass.forEach((m, i) => note(m, t0 + i * beat, beat * 0.9, 0.55));
  const nx = nextMelody(); if (nx) loadKeys(melodyKeys(nx));   // the next Crescendo's keys
}
/** A battle with a Bard in it: load the first melody's keys. */
export const preloadPiano = () => { const j = nextMelody(); if (j) loadKeys(melodyKeys(j)); };
