// The menu frame: currencies on top, navigation below (with red dots where something waits), screens between,
// toasts and modals. Screens are modules with render(root, args); app.show(name, args) switches.
import { D, save } from '../state.js';
import { el, fmt, escapeHtml } from '../core/util.js';
import { badges } from '../meta/badges.js';
import { seals, SEAL_MAX } from '../meta/seals.js';
import { initAudio, sfx } from '../core/audio.js';

const screens = {};
export const app = { cur: null, args: null };
export function registerScreen(name, mod) { screens[name] = mod; }

const NAV = [
  ['hub', 'Bastion', '🏰'], ['campaign', 'Campaign', '⚔'], ['squad', 'Squad', '🛡'], ['summon', 'Summon', '✦'],
  ['collection', 'Cards', '🂠'], ['modes', 'Modes', '∞'], ['rewards', 'Rewards', '🎁'],
];
const TITLES = { hub: 'The Bastion', campaign: 'Campaign', squad: 'Squad', summon: 'Summoning Altar', collection: 'Rift Cards', works: 'Bastion Works', modes: 'Modes', rewards: 'Rewards', settings: 'Settings', hero: 'Hero' };

export function show(name, args = {}) {
  const ui = document.getElementById('ui');
  if (screens[app.cur]?.leave) screens[app.cur].leave();
  app.cur = name; app.args = args;
  ui.innerHTML = '';
  const mod = screens[name];
  if (!mod.full) { ui.appendChild(topbar(TITLES[name] || '')); ui.appendChild(navbar(name)); }
  const root = el('div', 'screen' + (mod.full ? ' full' : ''));
  ui.appendChild(root);
  mod.render(root, args);
  save();
}
export function refresh() { if (app.cur) { const sc = document.querySelector('#ui .screen'), top = sc?.scrollTop; show(app.cur, app.args); const n = document.querySelector('#ui .screen'); if (n && top) n.scrollTop = top; } }
export function refreshChrome() {
  const ui = document.getElementById('ui'), t = ui.querySelector('.topbar'), n = ui.querySelector('.navbar');
  if (t) t.replaceWith(topbar(TITLES[app.cur] || ''));
  if (n) n.replaceWith(navbar(app.cur));
}

function topbar(title) {
  const s = D.save, b = el('div', 'topbar');
  b.innerHTML = `<div class="title">${escapeHtml(title)}</div>
    <div class="cur gold" title="Gold"><i>◉</i>${fmt(s.gold)}</div>
    <div class="cur shard" title="Soul Shards: earned in battle and from rewards, spent at the Summoning Altar"><i>◆</i>${fmt(s.shards)}</div>
    <div class="cur essence" title="Essence: from duplicates, salvage, battles and the Modes; ascends heroes and refines gear"><i>✧</i>${fmt(s.essence)}</div>
    <div class="cur ticket" title="Summon tickets"><i>🎟</i>${s.tickets.hero + s.tickets.legend}</div>
    <div class="cur seal" title="Rift Seals: a battle with one pays in full; one refills every 30 minutes"><i>⛬</i>${seals(s)}/${SEAL_MAX}</div>
    <button class="btn ghost" data-k="settings" style="padding:5px 9px">⚙</button>`;
  b.querySelector('[data-k=settings]').onclick = () => { sfx('door_open', 0.4); show('settings'); };
  return b;
}
function navbar(cur) {
  const n = el('div', 'navbar'), dots = badges(D.save);
  for (const [k, label, ico] of NAV) {
    const btn = el('button', (k === cur ? 'on' : '') + (dots[k] ? ' dot' : ''), `<span class="ico">${ico}</span>${label}`);
    btn.onclick = () => { sfx('door_open', 0.35); show(k); };
    n.appendChild(btn);
  }
  return n;
}

export function toast(msg, ms) {
  const t = el('div', 'toast', msg), box = document.getElementById('toasts');
  box.appendChild(t);
  setTimeout(() => t.remove(), ms || 2700);
}
/** A modal: content is an element or html; buttons [{label, cls, fn, keep}]. Returns { close, box }. */
export function modal(content, buttons = [], opts = {}) {
  const bg = el('div', 'modal-bg'), box = el('div', 'modal');
  if (opts.wide) box.style.width = 'min(980px, 100%)';
  if (typeof content === 'string') box.innerHTML = content; else box.appendChild(content);
  const close = () => { bg.remove(); opts.onClose?.(); };
  if (buttons.length) {
    const row = el('div', 'row'); row.style.justifyContent = 'flex-end'; row.style.marginTop = '12px';
    for (const b of buttons) { const e = el('button', 'btn ' + (b.cls || ''), b.label); e.onclick = () => { if (!b.keep) close(); b.fn?.(); }; row.appendChild(e); }
    box.appendChild(row);
  }
  if (!opts.sticky) bg.onclick = (e) => { if (e.target === bg) close(); };
  bg.appendChild(box);
  document.getElementById('ui').appendChild(bg);
  return { close, box };
}
export function switchEl(on, fn) {
  const s = el('div', 'switch' + (on ? ' on' : ''));
  s.onclick = () => { s.classList.toggle('on'); fn(s.classList.contains('on')); sfx('lock_unlock', 0.3); };
  return s;
}
// the first touch anywhere wakes the audio (browsers keep it asleep until then)
addEventListener('pointerdown', () => initAudio(), { once: false, passive: true });
