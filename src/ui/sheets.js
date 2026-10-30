// Music Sheets: the editor a sheet opens (paste tablature or note names, listen, lock it), and the Bard's five Tabs
// in the inventory, where locked sheets are loaded for him to play (data/tabs.js, game/bard.js).
import { G } from '../state.js';
import { el, escapeHtml, fmtInt } from '../core/util.js';
import { sfx, audioCtx } from '../core/audio.js';
import { loadInstruments, playNote, audioNow, stopVoices } from '../core/sampler.js';
import { UI, draggable, droppable } from './ui.js';
import { itemCell, itemTooltip } from './itemui.js';
import { changed } from './inventory.js';
import { itemName, itemColor } from '../data/items.js';
import { keyName } from '../data/melodies.js';
import { readSheet, sheetTempo, TAB_SLOTS, SHEET_MAX, BPM_RANGE, DEFAULT_BPM } from '../data/tabs.js';
import { bardRetune, bardNowPlaying } from '../game/bard.js';

const isBard = () => G.char && G.char.classId === 'bard';
const tabsOf = (c) => c.tabs || (c.tabs = Array(TAB_SLOTS).fill(null));
const isSheet = (it) => !!it && it.type === 'sheet';

/** Bag -> a Tab (the first empty one, or `slot`, swapping what was there into the bag). */
export function loadTab(idx, slot) {
  const c = G.char, it = c.bag[idx], tabs = tabsOf(c);
  if (!isSheet(it)) return false;
  if (!isBard()) { UI.log('Only a Bard can play a music sheet.', '#ff8080'); sfx('error'); return false; }
  if (!it.inked) { UI.log('Lock the sheet first: only locked sheets go in your Tabs.', '#ff8080'); sfx('error'); return false; }
  if (!readSheet(it.text).ev) { UI.log('There is no tune on that sheet.', '#ff8080'); sfx('error'); return false; }
  const to = slot ?? tabs.findIndex((t) => !t);
  if (to < 0) { UI.log('All five Tabs are full. Take a sheet out first.', '#ff8080'); sfx('error'); return false; }
  c.bag[idx] = tabs[to] || null;
  tabs[to] = it;
  UI.selected = { where: 'tab', idx: to };
  sfx('pickup');
  UI.log(`Loaded <span style="color:${itemColor(it)}">${escapeHtml(itemName(it))}</span> into Tab ${to + 1}.`);
  bardRetune(G.player);
  changed();
  return true;
}
/** A Tab -> the bag (the first free slot, or `toIdx`, swapping a locked sheet from there into the Tab). */
export function unloadTab(slot, toIdx) {
  const c = G.char, tabs = tabsOf(c), it = tabs[slot];
  if (!it) return false;
  if (toIdx !== undefined && c.bag[toIdx]) {
    const other = c.bag[toIdx];
    if (isSheet(other) && other.inked) return loadTab(toIdx, slot);
    toIdx = undefined;
  }
  const i = toIdx ?? c.bag.findIndex((b) => !b);
  if (i < 0) { UI.log('Inventory full.', '#ff8080'); sfx('error'); return false; }
  c.bag[i] = it; tabs[slot] = null;
  UI.selected = { where: 'bag', idx: i };
  bardRetune(G.player);
  changed();
  return true;
}
/** Play this Tab next, from its first note. */
export function playTabNext(slot) {
  const c = G.char;
  if (!tabsOf(c)[slot]) return;
  c.tabAt = slot;
  bardRetune(G.player, true);
  UI.log(`Tab ${slot + 1} plays next: <span style="color:#ffd88a">${escapeHtml(itemName(c.tabs[slot]))}</span>.`);
  changed();
}

/** The Bard's Tabs, under the paper doll. */
export function tabRow() {
  const c = G.char, tabs = tabsOf(c), now = bardNowPlaying(G.player);
  const box = el('div', 'tab-row');
  box.appendChild(el('div', 'tab-row-lbl', `<b>Tabs</b> <span class="dim">· locked Music Sheets you play${now ? ` · ♪ ${escapeHtml(now.name)}` : ''}</span>`));
  const row = el('div', 'tab-slots');
  for (let i = 0; i < TAB_SLOTS; i++) {
    const it = tabs[i], d = el('div', 'eslot tslot' + (it ? ' r0' : ''));
    if (now && now.slot === i) d.classList.add('playing');
    const sel = UI.selected;
    if (sel && sel.where === 'tab' && sel.idx === i) d.classList.add('sel');
    if (it) d.appendChild(itemCell(it)); else d.appendChild(el('span', 'lbl', `Tab ${i + 1}`));
    draggable(d, {
      key: 'tab:' + i,
      data: () => (tabs[i] ? { type: 'item', where: 'tab', idx: i } : null),
      icon: () => d.querySelector('img') && d.querySelector('img').src,
      onClick: () => { UI.selected = tabs[i] ? { where: 'tab', idx: i } : null; sfx('ui'); UI.refresh(); },
      onDouble: () => unloadTab(i),
      onRight: () => unloadTab(i),
    });
    droppable(d, (data) => data.where === 'bag' && loadTab(data.idx, i), (data) => data.type === 'item' && data.where === 'bag' && isSheet(c.bag[data.idx]) && c.bag[data.idx].inked);
    if (it) UI.tip(d, () => itemTooltip(tabs[i], { hint: `Tab ${i + 1}${now && now.slot === i ? ` · now playing (note ${fmtInt(now.at + 1)} of ${fmtInt(now.of)})` : ''} · right-click to take it out` }));
    row.appendChild(d);
  }
  box.appendChild(row);
  return box;
}

/** Detail-box buttons for a sheet (in the bag or a Tab). */
export function sheetButtons(btn, sel, it) {
  if (sel.where === 'tab') {
    btn('Play next', () => playTabNext(sel.idx));
    btn('Read', () => sheetEditor(it));
    btn('Take out', () => unloadTab(sel.idx));
    return;
  }
  if (!it.inked) btn(it.text.trim() ? 'Edit' : 'Write', () => sheetEditor(it));
  else {
    if (isBard()) btn('Load into a Tab', () => loadTab(sel.idx));
    btn('Read', () => sheetEditor(it));
  }
}
/** Right-click on a sheet in the bag: a locked one goes in a Tab (a Bard's), any other opens. */
export function useSheet(idx) {
  const it = G.char.bag[idx];
  if (it.inked && isBard()) loadTab(idx); else sheetEditor(it);
}

// A blank sheet opens with this already written on it (all four phrases, standard tuning), to edit or paste over
export const STARTER = `Ode to Joy
Tempo: 120
e|-0-0-1-3-3-1-0---------0-0-----|-0-0-1-3-3-1-0---------0-------|
B|---------------3-1-1-3-----3-3-|---------------3-1-1-3---3-1-1-|
G|-------------------------------|-------------------------------|
D|-------------------------------|-------------------------------|
A|-------------------------------|-------------------------------|
E|-------------------------------|-------------------------------|

e|-----0-----0-1-0-----0-1-0---------|-0-0-1-3-3-1-0---------0-------|
B|-3-3---1-3-------1-3-------3-1-3---|---------------3-1-1-3---3-1-1-|
G|---------------------------------0-|-------------------------------|
D|-----------------------------------|-------------------------------|
A|-----------------------------------|-------------------------------|
E|-----------------------------------|-------------------------------|`;
const HELP = `<b>Guitar, bass or ukulele tab</b>: one line per string, highest on top (<code>e|--0--3--</code>); any tuning in the
string names (<code>D|</code> for drop D), or none for standard. Columns are read left to right; numbers in one column
sound together (the top note is the melody). Bends, slides and hammer-ons are read as plain notes.<br>
<b>Note names</b> also work: <code>E4 E4 F4 G4</code> or <code>C D E</code> (octave 4), chords as <code>C4+E4+G4</code>.<br>
A line like <code>Tempo: 120</code> sets the speed. Every note a Bard's skill writes takes the next note of the song,
whichever skill wrote it; the rhythm is his. Locked sheets can't be changed again.`;

let preview = null;
function stopPreview() { if (preview) { clearInterval(preview.timer); stopVoices(preview.voices, 0.1); preview = null; } }
/** Play a sheet's first notes in its rhythm (scheduled a little ahead, so the sampler's voice cap never cuts it). */
function listen(text, bpm, onEnd) {
  stopPreview();
  const r = readSheet(text);
  if (!r.ev || !audioCtx()) return false;
  const spb = 60 / Math.max(BPM_RANGE[0], Math.min(BPM_RANGE[1], bpm || r.bpm || DEFAULT_BPM)), n = Math.min(r.ev.length, 64), t0 = audioNow() + 0.15, at = [];
  let b = 0;
  for (let i = 0; i < n; i++) { at.push(b); b += r.gaps[i] * 0.5; }
  const p = preview = { voices: [], i: 0 };
  loadInstruments().then(() => {
    if (preview !== p) return;
    p.timer = setInterval(() => {
      const now = audioNow();
      while (p.i < n && t0 + at[p.i] * spb < now + 0.4) {
        const e = r.ev[p.i], t = t0 + at[p.i] * spb, d = Math.max(0.15, r.gaps[p.i] * 0.5 * spb);
        e.forEach((m, k) => p.voices.push(playNote('harpsichord', m, { at: t, dur: d, vel: k ? 0.38 : 0.75, art: d > 0.4 ? 'normal_held' : 'normal_short' })));
        if (p.voices.length > 24) p.voices.splice(0, p.voices.length - 24);
        p.i++;
      }
      if (p.i >= n && now > t0 + b * spb + 0.3) { stopPreview(); onEnd && onEnd(); }
    }, 80);
  });
  return true;
}

/** The sheet's own dialog: write on it (title, tempo, the tab), listen, save, lock; a locked sheet only reads. */
export function sheetEditor(it) {
  if (!isSheet(it)) return;
  const ro = it.inked ? 'readonly' : '';
  const html = `<div class="sheet-ed">
    <div class="sheet-fields"><label>Title <input class="sh-title" maxlength="40" ${ro} value="${escapeHtml(it.title || '')}" placeholder="Untitled Song"></label>
    <label>BPM <input class="sh-bpm" type="number" min="${BPM_RANGE[0]}" max="${BPM_RANGE[1]}" ${ro} value="${it.bpm || ''}" placeholder="${DEFAULT_BPM}"></label></div>
    <textarea class="sh-text" spellcheck="false" wrap="off" maxlength="${SHEET_MAX}" ${ro} placeholder="Paste tablature or note names here.">${escapeHtml(it.text || (it.inked ? '' : STARTER))}</textarea>
    <div class="sh-status"></div>
    ${it.inked ? '' : `<details class="sh-help"><summary>How to write a sheet</summary><div>${HELP}</div></details>`}
  </div>`;
  const done = (close) => { stopPreview(); close(); };
  const buttons = [
    { label: 'Listen', keepOpen: true, fn: () => toggleListen() },
    ...(it.inked ? [] : [
      { label: 'Save', keepOpen: true, fn: (close) => { save(); done(close); UI.log(`Saved <span style="color:#e8dcc0">${escapeHtml(itemName(it))}</span>.`); } },
      { label: 'Lock', cls: 'red', keepOpen: true, fn: (close) => lock(close) },
    ]),
    { label: 'Close', keepOpen: true, fn: done },
  ];
  const d = UI.dialog({ title: it.inked ? escapeHtml(itemName(it)) : 'Music Sheet', html, buttons, closable: false, cls: 'sheet-dialog' });
  const $ = (s) => d.box.querySelector(s), ta = $('.sh-text'), title = $('.sh-title'), bpm = $('.sh-bpm'), status = $('.sh-status');
  const listenBtn = [...d.box.querySelectorAll('.row .btn')][0];
  const lockBtn = [...d.box.querySelectorAll('.row .btn')].find((b) => b.textContent === 'Lock');
  const fields = () => ({ text: ta.value.slice(0, SHEET_MAX), title: title.value.trim().slice(0, 40), bpm: Math.round(+bpm.value) || 0 });
  function show() {
    const f = fields(), r = f.text.trim() ? readSheet(f.text) : null;
    if (!r) status.innerHTML = '<span class="dim">An empty sheet. Paste a song onto it.</span>';
    else if (r.err) status.innerHTML = `<span style="color:#ff8080">${escapeHtml(r.err)}</span>`;
    else {
      const what = r.mode === 'names' ? 'note names' : `${r.blocks} tab block${r.blocks > 1 ? 's' : ''} (${[...new Set(r.strings)].join('/')} strings)`;
      status.innerHTML = `<span style="color:#9fe09f">♪ ${fmtInt(r.ev.length)} notes</span> <span class="dim">· ${what} · ${keyName(r.key)} · ${sheetTempo(f, r)} BPM${r.warn.length ? ' · ' + escapeHtml(r.warn.join(', ')) : ''}</span>`;
      if (!f.title && r.title && !it.inked) title.placeholder = r.title;
      bpm.placeholder = r.bpm || DEFAULT_BPM;
    }
    if (lockBtn) lockBtn.disabled = !r || !!r.err;
    listenBtn.disabled = !r || !!r.err;
  }
  function save() {
    const f = fields();
    it.text = f.text; it.bpm = f.bpm ? Math.max(BPM_RANGE[0], Math.min(BPM_RANGE[1], f.bpm)) : 0;
    it.title = f.title || (f.text.trim() && readSheet(f.text).title) || '';
    changed();
  }
  function lock(close) {
    save();
    UI.confirm('Lock the sheet?', `Lock <b style="color:#ffd88a">${escapeHtml(it.title || 'Untitled Song')}</b>? The song is kept as it is and can't be changed again.${isBard() ? ' A locked sheet goes in one of your Tabs.' : ''}`, () => {
      it.inked = true; it.title = it.title || 'Untitled Song';
      done(close); sfx('levelup');
      UI.log(`Locked <span style="color:#ffd88a">${escapeHtml(itemName(it))}</span>.${isBard() ? ' Load it into a Tab to play it.' : ''}`);
      changed();
    }, 'Lock');
  }
  function toggleListen() {
    if (preview) { stopPreview(); listenBtn.textContent = 'Listen'; return; }
    const f = fields();
    if (!listen(f.text, f.bpm, () => { listenBtn.textContent = 'Listen'; })) { status.innerHTML += ' <span style="color:#ff8080">(no sound yet: click in the game first)</span>'; return; }
    listenBtn.textContent = 'Stop';
  }
  let t = 0;
  ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(show, 150); });
  bpm.addEventListener('input', show);
  show();
  if (!it.inked) setTimeout(() => ta.focus(), 30);
  return d;
}
