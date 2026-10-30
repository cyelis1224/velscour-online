// VELSCOUR DEFENSE state: its own save (localStorage 'velscour_defense_v1'), never the main game's
// velscour_saves_v1 / velscour_settings_v1. D is the page singleton (window.VDEF = { D } in the console).
import { STARTERS } from './data/heroes.js';

export const SAVE_KEY = 'velscour_defense_v1';
export const D = { save: null, screen: null, battle: null, time: 0, touch: false, W: 0, H: 0, dpr: 1 };

export function freshSave() {
  const s = {
    v: 2, created: Date.now(), gold: 400, shards: 300, tickets: { hero: 2, legend: 0 }, essence: 0, seals: { n: 40, t: Date.now() },
    cards: {}, squad: STARTERS.slice(), progress: {}, frontier: 1, research: {}, pity: { hero: 0 },
    daily: { last: '', day: 0, freePack: '' }, hourly: { last: Date.now() }, quests: { date: '', list: [] }, achieved: {},
    stats: { battles: 0, wins: 0, kills: 0, packs: 0, cards: 0, bestWave: 0, deploys: 0, skills: 0 },
    settings: { speed: 1, autoBattle: false, sfx: 0.7, music: 0.4, skipDialogs: false },
    seen: {}, newCards: [], log: [],
  };
  for (const id of STARTERS) s.cards['h:' + id] = { n: 1, lvl: 1, stars: 1, equip: {} };
  return s;
}

export function migrate(s) {
  const f = freshSave();
  for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
  for (const k of Object.keys(f.settings)) if (s.settings[k] === undefined) s.settings[k] = f.settings[k];
  for (const k of Object.keys(f.stats)) if (s.stats[k] === undefined) s.stats[k] = f.stats[k];
  // v1 -> v2: duplicate counters became essence (60 each, the old Rare rate)
  for (const e of Object.values(s.cards)) if (e.dupes) { s.essence += e.dupes * 60; delete e.dupes; }
  delete s.settings.autoCampaign;   // auto-campaign is gone: auto-battle plays a battle, the Commander picks the next
  s.v = 2;
  return s;
}

export function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { s = null; }
  D.save = s ? migrate(s) : freshSave();
  return D.save;
}
let saveT = 0;
export function save(now = false) {
  if (!D.save) return;
  clearTimeout(saveT);
  const w = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(D.save)); } catch { /* full or blocked: the run keeps going */ } };
  if (now) w(); else saveT = setTimeout(w, 400);
}
export function resetSave() { D.save = freshSave(); save(true); }
