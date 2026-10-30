// LocalStorage persistence for heroes.
import { CLASSES } from '../data/classes.js';
import { rollItem, HOLLOW } from '../data/items.js';
import { drawBiome } from '../data/biomes.js';
import { migrateBar, BAR_SIZE } from '../data/bar.js';
import { TAB_SLOTS } from '../data/tabs.js';
import { newMacros, migrateMacros } from '../data/macros.js';
import { stashRaw, listRaw } from './herobackup.js';

const KEY = 'velscour_saves_v1';
const ASIDE = KEY + '_unreadable_';   // + time: save data that couldn't be read, set aside before anything replaced it
const watchers = [];
/** fn(classId, deletedIds) after a hero of that class is saved, or deleted by the player (game/cloud.js syncs it). */
export function onSaveChange(fn) { watchers.push(fn); }
const changed = (classId, deleted) => { for (const fn of watchers) try { fn(classId, deleted); } catch (e) { console.warn(e); } };

let unreadable = false;   // the saves are there but don't parse: cloud sync must not touch them
function readAll() {
  let list;
  const raw = localStorage.getItem(KEY);
  try { list = JSON.parse(raw || '[]'); } catch (e) { unreadable = true; return []; }
  unreadable = !Array.isArray(list);
  return unreadable ? [] : list;
}
/** False when this device's saves exist but can't be read (cloud.js then changes nothing). */
export function savesReadable() { readAll(); return !unreadable; }
function writeAll(list) {   // callers have just run readAll(), so `unreadable` is current
  if (unreadable && !setAside()) return false;   // never write over saves that couldn't be read until they're copied
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) {
    console.warn('Save failed', e);
    if (unreadable && asideKey) moveAside();   // the copy took the room: move it to IndexedDB, the next save fits
    return false;
  }
}
// Unreadable saves are copied aside (localStorage, or IndexedDB when that's full) before the first write replaces
// them; until a copy exists every write is refused. Settings > Hero backups lists them for download.
let asideDone = null, asidePending = null, asideKey = null;
function setAside() {
  const raw = localStorage.getItem(KEY);
  if (raw === null || raw === asideDone) return true;
  try { const k = ASIDE + Date.now(); localStorage.setItem(k, raw); asideDone = raw; asideKey = k; return true; } catch (e) { /* no room: IndexedDB */ }
  if (!asidePending) asidePending = stashRaw(raw).then(() => { asideDone = raw; }, (e) => { console.warn('Could not set the unreadable saves aside', e); saveBlocked(); }).finally(() => { asidePending = null; });
  saveBlocked();
  return false;
}
function moveAside() {
  const k = asideKey, raw = k && localStorage.getItem(k);
  asideKey = null;
  if (raw !== null && raw !== undefined) stashRaw(raw).then(() => localStorage.removeItem(k), (e) => console.warn(e));   // removed only once IndexedDB holds it
}
let blockedOnce = false;
function saveBlocked() {
  if (blockedOnce || typeof dispatchEvent !== 'function') return;
  blockedOnce = true;
  dispatchEvent(new CustomEvent('velscour-save-blocked'));
}
/** Unreadable save data that was set aside: [{ at, text }], newest first. */
export async function unreadableSaves() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(ASIDE)) out.push({ at: Number(k.slice(ASIDE.length)) || 0, text: localStorage.getItem(k) });
  }
  try { out.push(...(await listRaw()).map((r) => ({ at: r.at, text: r.text }))); } catch (e) { /* no IndexedDB */ }
  return out.sort((a, b) => b.at - a.at);
}

export function listSaves() {
  return readAll().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
}
// The autosave (every 30 s) used to parse and re-encode every hero on the device to change one: with full stashes on
// all classes that was 1.5 MB of JSON and a 100-200 ms freeze on a phone. What this tab last wrote is kept as one JSON
// text per hero; while the stored data is still exactly that, only the hero being saved is encoded again.
let memo = null;   // { raw, parts: Map(id -> JSON) }
export function writeSave(char) {
  char.lastPlayed = Date.now();
  const raw = localStorage.getItem(KEY);
  let ok;
  if (memo && raw === memo.raw) {
    const parts = new Map(memo.parts);
    parts.delete(char.id); parts.set(char.id, JSON.stringify(char));   // (to the end, as filter + push did)
    const out = '[' + [...parts.values()].join(',') + ']';
    try { localStorage.setItem(KEY, out); ok = true; memo = { raw: out, parts }; } catch (e) { console.warn('Save failed', e); ok = false; memo = null; }
  } else {
    const list = readAll().filter((c) => c.id !== char.id);
    list.push(char);
    ok = writeAll(list);
    memo = ok && !unreadable ? remember(list) : null;
  }
  changed(char.classId);
  return ok;
}
function remember(list) {
  const parts = new Map(list.map((c) => [c.id, JSON.stringify(c)]));
  const raw = '[' + [...parts.values()].join(',') + ']';
  return raw === localStorage.getItem(KEY) ? { raw, parts } : null;
}
export function deleteSave(id) {
  const list = readAll(), gone = list.find((c) => c.id === id);
  writeAll(list.filter((c) => c.id !== id));
  if (gone) changed(gone.classId, [id]);
}
/** One hero per class: classId -> that class's most recently played hero. (Older saves may hold several heroes of a
 * class; the newest one is the class's hero, and deleting it deletes them all.) */
export function heroesByClass() {
  const out = {};
  for (const c of listSaves()) if (!out[c.classId]) out[c.classId] = c;
  return out;
}
export function deleteClassSaves(classId) {
  const list = readAll();
  writeAll(list.filter((c) => c.classId !== classId));
  changed(classId, list.filter((c) => c.classId === classId).map((c) => c.id));
}
/** Every save of a class (old saves may hold several). */
export function classSaves(classId) { return readAll().filter((c) => c.classId === classId); }
/** A class's hero from the cloud (or null): replaces every local save of that class, keeping its lastPlayed.
 * cloud.js backs the old ones up first (game/herobackup.js). Refuses when the saves can't be read. */
export function replaceClassHero(classId, char) {
  const all = readAll();
  if (unreadable) return false;
  const list = all.filter((c) => c.classId !== classId);
  if (char) list.push(char);
  return writeAll(list);
}

export function newCharData(classId, name) {
  const C = CLASSES[classId];
  const c = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    version: 1, name, classId, level: 1, xp: 0,
    attrs: { ...C.base }, statPoints: 0, skillPoints: 1,
    skills: {}, granted: {}, bar: Array(BAR_SIZE).fill(null),
    equip: { weapon: null, offhand: null, head: null, body: null, hands: null, legs: null, feet: null, ring1: null, ring2: null, ring3: null, ring4: null },
    vanity: { head: null, body: null }, hideHelm: false,
    macros: newMacros(), // game/macros.js
    mastery: {}, rage: 0, townSeed: (Math.random() * 1e9) | 0,
    bag: Array(60).fill(null),
    stash: Array(300).fill(null),
    tabs: Array(TAB_SLOTS).fill(null), tabAt: 0, // the Bard's Tabs: locked Music Sheets he plays (data/tabs.js)
    gold: 150, potions: { hp: 6, mp: 4, rejuv: 1, fury: 1 },
    depth: 1, deepest: 0, nextBiome: null, biomeBag: [], cleared: {}, overworldMisses: 0, overworldLastVisit: null, seaOfSandRuns: {}, darkForestRuns: {}, breach: { best: 0, cleared: {} },
    heresy: { on: [] }, rifts: { open: 1, best: 0, cleared: {}, bestTime: {}, runs: 0, fails: 0, deaths: 0 }, keys: 0, unbound: { wins: 0, best: 0 }, // the Endgame (docs/ENDGAME.md)
    kills: 0, deaths: 0, created: Date.now(), lastPlayed: Date.now(), tips: {},
  };
  c.equip.weapon = rollItem(1, { slot: 'weapon', base: C.weapon, rarity: 0 });
  c.equip.weapon.affixes = c.equip.weapon.affixes.filter((a) => a.implicit);
  if (C.offhand) { c.equip.offhand = rollItem(1, { slot: 'offhand', base: C.offhand, rarity: 0 }); }
  c.equip.body = rollItem(1, { slot: 'body', rarity: 0 });
  c.equip.body.affixes = [];
  c.equip.weapon.sockets = 1;
  c.nextBiome = drawBiome(c, 1); // the first descent is a random biome too
  return c;
}

/** Fill in fields added by later versions. */
export function migrate(c) {
  c.potions = Object.assign({ hp: 0, mp: 0, rejuv: 0, fury: 0 }, c.potions);
  c.cleared = c.cleared || {};
  c.seaOfSandRuns = c.seaOfSandRuns || {};
  c.darkForestRuns = c.darkForestRuns || {};
  c.breach = Object.assign({ best: 0, cleared: {} }, c.breach); // THE ETERNAL BREACH: best floor beaten, clears per floor
  // the Endgame (docs/ENDGAME.md): Heresies on, Abyssal Rifts, Abyssal Keys, Velscour Unbound
  c.heresy = Object.assign({ on: [] }, c.heresy); if (!Array.isArray(c.heresy.on)) c.heresy.on = [];
  c.rifts = Object.assign({ open: 1, best: 0, cleared: {}, bestTime: {}, runs: 0, fails: 0, deaths: 0 }, c.rifts); c.rifts.open = Math.max(1, c.rifts.open | 0);
  c.keys = Math.max(0, c.keys | 0);
  c.unbound = Object.assign({ wins: 0, best: 0 }, c.unbound);
  c.granted = c.granted || {};
  c.tips = c.tips || {};
  if (c.classId === 'barbarian') c.rage = Math.max(0, Math.min(100, Number(c.rage) || 0));
  c.homunculus = c.homunculus || { talks: 0, chapter: 0, told: [], recap: [] }; // the blacksmith's axe story (game/homunculus.js)
  c.mastery = c.mastery || {}; // skill mastery: {skillId: [level 1-1000, xp]}
  c.comm = c.comm || { open: [], done: [] }; // Town Commissions (game/commissions.js)
  // plain (Common) gear takes more sockets now, as Glyphword bases (data/items.js HOLLOW)
  for (const it of [...Object.values(c.equip || {}), ...(c.bag || []), ...(c.stash || [])]) if (it && it.type === 'gear' && it.rarity === 0 && !it.relic && HOLLOW[it.slot] > (it.maxSockets || 0)) it.maxSockets = HOLLOW[it.slot];
  // Sky Battle cut scenes watched ('<story or base>:<scene>'): seen ones play at 20x. A hero who fought one before this
  // was kept has seen the weathers' scenes.
  if (!c.skySeen) c.skySeen = c.lastSkyVariant ? Object.fromEntries(['intro', 'mid', 'parley', 'hooks', 'victory'].map((n) => [`base:${n}`, 1])) : {};
  for (const s of ['ring1', 'ring2', 'ring3', 'ring4']) if (!(s in c.equip)) c.equip[s] = null;
  c.vanity = Object.assign({ head: null, body: null }, c.vanity); // looks only: worn over the real gear, no stats
  c.hideHelm = !!c.hideHelm;
  c.macros = migrateMacros(c.macros);
  if (c.townSeed === undefined) c.townSeed = (Math.random() * 1e9) | 0;
  if (!Array.isArray(c.biomeBag)) c.biomeBag = [];
  if (!Number.isInteger(c.overworldMisses)) c.overworldMisses = 0;
  c.overworldMisses = Math.max(0, Math.min(3, c.overworldMisses));
  if (!('overworldLastVisit' in c)) c.overworldLastVisit = c.lastBiome ? String(c.depth) + ':' + c.lastBiome : null;
  // heroes made before the shuffle bag always started in the catacombs: give an unexplored hero a random start
  if (c.nextBiome === 'catacombs' && !c.deepest && !c.lastBiome) c.nextBiome = drawBiome(c, c.depth || 1);
  c.bar = migrateBar(c.bar); // 10 slots (LMB, 1-8, RMB) -> 15 (LMB, ` 1-9 0 - =, RMB)
  while (c.bag.length < 60) c.bag.push(null);
  if (!Array.isArray(c.stash)) c.stash = [];
  while (c.stash.length < 300) c.stash.push(null);
  if (!Array.isArray(c.tabs)) c.tabs = [];
  while (c.tabs.length < TAB_SLOTS) c.tabs.push(null);
  if (!Number.isInteger(c.tabAt) || c.tabAt < 0 || c.tabAt >= TAB_SLOTS) c.tabAt = 0;
  // body armor and helmets of the first Paladin art pack: their look now comes from the gear art
  for (const it of [...Object.values(c.equip), ...c.bag]) if (it && it.art && (it.slot === 'body' || it.slot === 'head')) { delete it.art; delete it.artCls; }
  // the generated biome natives (bn_) are gone: a nemesis wearing one takes a look from its next level
  if (c.nemesis && typeof c.nemesis.art === 'string' && c.nemesis.art.startsWith('bn_')) { c.nemesis.art = null; c.nemesis.swap = null; }
  return c;
}
