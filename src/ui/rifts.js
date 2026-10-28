// The Abyssal Rift gate's dialogs (docs/ENDGAME.md): the tier to enter, the results of a closed rift, and the honour
// board (game/leaderboard.js).
import { G } from '../state.js';
import { escapeHtml } from '../core/util.js';
import { UI } from './ui.js';
import { CLASSES } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { RARITY, SLOTS, SLOT_NAMES } from '../data/items.js';
import { RIFT_QUOTA, riftDepth, riftLevel, fmtTime } from '../data/rifts.js';
import { riftOpen, riftTime } from '../game/rifts.js';
import { endgame } from '../game/endgame.js';
import { Board, barred } from '../game/leaderboard.js';
import { Cloud } from '../game/cloud.js';

const num = (v) => (Number.isFinite(+v) ? +v : 0);
/** A board entry's build (untrusted: everything is escaped, rarities clamped). */
function buildHtml(e) {
  const b = e.build && typeof e.build === 'object' ? e.build : {}, gear = b.gear && typeof b.gear === 'object' ? b.gear : {};
  const skills = (Array.isArray(b.bar) ? b.bar : []).slice(0, 15).map((id) => `<span>${escapeHtml(SKILLS[id] ? SKILLS[id].name : String(id))}</span>`).join('');
  const rows = [...SLOTS, ...Object.keys(gear).filter((s) => !SLOTS.includes(s))].filter((s) => gear[s] && typeof gear[s] === 'object').map((s) => {
    const g = gear[s], R = RARITY[Math.max(0, Math.min(RARITY.length - 1, num(g.rarity) | 0))];
    return `<div><span class="dim">${escapeHtml(SLOT_NAMES[s] || s)}</span><b style="color:${R.color}">${escapeHtml(String(g.name || '?'))}${num(g.upg) > 0 ? ` +${num(g.upg) | 0}` : ''}</b><i class="dim">${R.name} · ilvl ${num(g.ilvl) | 0}</i></div>`;
  }).join('');
  const at = num(e.at) ? new Date(num(e.at)).toLocaleDateString() : '';
  return `<div class="rb-bhead">Level ${num(e.level) | 0} · ${num(e.marks) | 0} Infernal Mark${(num(e.marks) | 0) === 1 ? '' : 's'}${at ? ` · ${at}` : ''}</div>
    <div class="rb-skills">${skills || '<span class="dim">no skills recorded</span>'}</div><div class="rb-gear">${rows || '<div class="dim">no gear recorded</div>'}</div>`;
}

export const Rifts = {
  /** The gate: pick a tier (1 .. the tier the hero's wins opened) and step in. */
  open(tier) {
    const c = G.char, top = riftOpen(c), pick = Math.min(top, Math.max(1, tier || top)), r = c.rifts;
    const opt = (n) => {
      const L = riftLevel(n), best = r.bestTime[n];
      return `<option value="${n}"${n === pick ? ' selected' : ''}>Tier ${n} — as deadly as Depth ${riftDepth(n)} (monster level ${L})${best ? ` · best ${fmtTime(best)}` : n === top ? ' · new' : ''}</option>`;
    };
    const tiers = [];
    for (let n = top; n >= 1; n--) tiers.push(opt(n));
    const acc = endgame().bests[c.classId];
    const d = UI.dialog({
      title: 'ABYSSAL RIFT', cls: 'rift-dialog',
      html: `<p>The gate opens on <b style="color:#20e0ff">a rift torn in the abyss</b>: a short dungeon and its arena, against the clock.</p>
        <p class="dim">Slay ${Math.round(RIFT_QUOTA * 100)}% of the rift's monsters (a champion counts four, a unique eight) to wake the Guardian, then slay it before <b>${fmtTime(riftTime())}</b> runs out. Finish in half the time and the win opens three tiers; in 80%, two; else one. Falling here costs no Defiance and leaves your descent where it is.</p>
        <label class="velscour-message-label" for="rift-pick">Tier</label><select id="rift-pick" class="velscour-biome-select">${tiers.join('')}</select>
        <p class="breach-warn" id="rift-warn"></p>${barred(c) ? '<p class="breach-warn">This hero took Velscour\'s gift: its runs are never listed on the Honour Board.</p>' : ''}
        <p class="rb-stats dim">Best: ${r.best ? `Tier ${r.best}` : 'none yet'}${acc ? ` · your ${escapeHtml(CLASSES[c.classId]?.name || c.classId)}s' best Tier ${acc.tier} in ${fmtTime(acc.time)}` : ''} · ${r.runs | 0} run${r.runs === 1 ? '' : 's'}, ${Object.values(r.cleared).reduce((a, n) => a + n, 0)} closed, ${r.fails | 0} collapsed, ${r.deaths | 0} fallen</p>`,
      buttons: [{ label: 'Not yet' }, { label: 'Honour Board', keepOpen: true, fn: () => this.board() }, { label: 'Enter the Rift', cls: 'red', fn: () => G.game.enterRift(+d.box.querySelector('#rift-pick').value) }],
    });
    const sel = d.box.querySelector('#rift-pick'), warn = d.box.querySelector('#rift-warn');
    const upd = () => { const L = riftLevel(+sel.value); warn.innerHTML = L > c.level + 4 ? `<b style="color:#ff6050">Monsters there are level ${L}; you are level ${c.level}. Expect to die.</b>` : ''; };
    sel.addEventListener('change', upd); upd();
    return d;
  },
  /** A closed rift: what it paid, and on to the next tier or home. */
  results(R, o) {
    const r = R.result || {}, time = r.time ?? R.t, jump = r.jump || 1, marks = r.marks || 0;
    const board = { posted: 'posted to the Honour Board', kept: 'the Honour Board keeps your better run', signedout: 'sign in with Google in Settings to post it to the Honour Board', offline: 'the Honour Board could not be reached' }[r.board];
    return UI.dialog({
      title: `Rift Tier ${R.tier} Closed`, cls: 'rift-dialog rift-results',
      html: `<div class="rr-time"><b>${fmtTime(time)}</b><span>of ${fmtTime(R.limit)} · ${Math.round((time / R.limit) * 100)}% of the clock</span></div>
        <ul class="rr-list"><li>+${jump} tier${jump > 1 ? 's' : ''} opened: <b>Tier ${o.next}</b> next</li><li>+${marks} Infernal Mark${marks === 1 ? '' : 's'}</li>${r.rarity !== undefined ? `<li>The Guardian's hoard: ${/^[AEIOU]/.test(RARITY[r.rarity].name) ? 'an' : 'a'} <b style="color:${RARITY[r.rarity].color}">${RARITY[r.rarity].name}</b> prize${r.first ? ' (first clear of the tier)' : ''}</li>` : ''}${r.best ? '<li><b style="color:#ffd860">A new best</b> for your class on this account' + (board ? `: ${board}` : '') + '</li>' : r.personal ? '<li>A new best time for this tier</li>' : ''}${r.board === 'barred' ? '<li class="dim">This hero took Velscour\'s gift: it is never listed on the Honour Board</li>' : ''}</ul>`,
      buttons: [{ label: 'Return to Town', fn: o.onTown }, { label: `On to Tier ${o.next}`, cls: 'red', fn: o.onNext }],
    });
  },
  /** The honour board: the best rift per class, read from Firestore (signed out too), and this browser's own best. */
  board(cls = G.char ? G.char.classId : 'paladin') {
    const d = UI.dialog({
      title: 'HONOUR BOARD', cls: 'rift-dialog rift-board',
      html: `<p class="dim rb-note">Every hero's best Abyssal Rift: the highest tier, then the fastest. Saves live on each player's device, so it is a board of honour; every run is posted with its build.</p>
        <div class="rb-head"><select class="velscour-biome-select" id="rb-cls">${Object.entries(CLASSES).map(([id, C]) => `<option value="${id}"${id === cls ? ' selected' : ''}>${escapeHtml(C.name)}</option>`).join('')}</select></div>
        <div class="rb-you"></div><div class="rb-list"></div>`,
      buttons: [{ label: 'Close' }],
    });
    const list = d.box.querySelector('.rb-list'), you = d.box.querySelector('.rb-you'), sel = d.box.querySelector('#rb-cls');
    let seq = 0;
    const row = (e, i, own) => `<div class="rb-row${own ? ' rb-mine' : ''}" data-i="${i}" tabindex="0"><span class="rb-rank">${i + 1}</span><span class="rb-name">${escapeHtml(String(e.name || 'Hero'))}</span><b>Tier ${num(e.tier) | 0}</b><span class="rb-time">${fmtTime(num(e.time))}</span><i class="dim">lvl ${num(e.level) | 0}</i></div><div class="rb-build hidden">${buildHtml(e)}</div>`;
    const fill = async () => {
      const id = sel.value, n = ++seq, mine = endgame().bests[id];
      you.innerHTML = `<span>Your best on this browser</span><b>${mine ? `Tier ${mine.tier} · ${fmtTime(mine.time)}` : 'no rift closed yet'}</b>${G.char && G.char.classId === id && barred(G.char) ? '<p class="dim">This hero took Velscour\'s gift: it is never listed.</p>' : Cloud.signedIn ? '' : '<p class="dim">Sign in with Google in Settings to be listed.</p>'}`;
      list.innerHTML = '<div class="rb-msg dim">Loading…</div>';
      let rows = null;
      try { rows = await Board.top(id, 1000); } catch (e) { console.warn('Honour board:', e); }
      if (n !== seq || !list.isConnected) return; // another class was picked meanwhile, or the dialog closed
      if (!rows) { list.innerHTML = '<div class="rb-msg">Could not reach the board. Try again when you are online.</div>'; return; }
      if (!rows.length) { list.innerHTML = '<div class="rb-msg dim">Nobody listed yet.</div>'; return; }
      const own = Cloud.uid ? rows.findIndex((e) => e.uid === Cloud.uid) : -1;
      list.innerHTML = '<div class="rb-row rb-top"><span>#</span><span>Hero</span><b>Tier</b><span>Time</span><i>Level</i></div>'
        + rows.slice(0, 50).map((e, i) => row(e, i, i === own)).join('') + (own >= 50 ? '<div class="rb-gap">…</div>' + row(rows[own], own, true) : '');
      list.querySelectorAll('.rb-row[data-i]').forEach((el) => {
        const open = () => { el.classList.toggle('open'); el.nextElementSibling.classList.toggle('hidden'); };
        el.addEventListener('click', open);
        el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
      });
    };
    sel.addEventListener('change', fill);
    d.ready = fill();
    return d;
  },
};
