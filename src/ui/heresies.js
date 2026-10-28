// The Altar of Heresy panel (docs/ENDGAME.md): the Heresies to switch on, the rank and what it pays, the milestones,
// and the Endgame's other doors (the Abyssal Rift gate, Velscour Unbound, the Infernal Marks). Every row is one big
// toggle (one column on a phone); before the Endgame opens the list is shown greyed and nothing can be switched.
import { G } from '../state.js';
import { el, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI } from './ui.js';
import { HERESIES, HERESY_MILESTONES, HERESY_MAX_RANK, heresyMods } from '../data/heresies.js';
import { heresiesOf, heresyRankOf, setHeresy, worldRank } from '../game/heresies.js';
import { endgameUnlocked } from '../game/endgame.js';
import { keysOf, UNBOUND_KEYS, unboundReady } from '../game/unbound.js';
import { marksTotal, marksFree } from '../game/marks.js';
import { riftOpen } from '../game/rifts.js';

/** The rank's rewards as chips: drops, magic find, gold, XP, Sigils, relics. */
function rewardChips(rank) {
  const M = heresyMods(rank);
  return [['Drops', `x${M.loot.toFixed(2)}`], ['Magic find', `+${M.mf}%`], ['Gold', `x${M.gold.toFixed(2)}`], ['XP', `+${Math.round((M.xp - 1) * 100)}%`], ['Sigils', `x${M.sigil.toFixed(2)}`], ['Relics', `x${M.relic.toFixed(2)}`]]
    .map(([k, v]) => `<span class="hx-chip"><i>${k}</i><b>${v}</b></span>`).join('');
}

export const Heresies = {
  active: false,
  open() {
    UI.closeAll();
    this.active = true;
    sfx('ui');
    UI.openPanel('heresies', 'Altar of Heresy', (b) => this.render(b), { onClose: () => { this.active = false; }, cls: 'heresy-panel', width: 'min(680px, 96vw)' });
  },
  close() { UI.closePanel('heresies'); },
  render(body) {
    const c = G.char, on = heresiesOf(c), rank = heresyRankOf(c), open = endgameUnlocked(c), w = G.world;
    const scroll = body.scrollTop;
    body.innerHTML = '';
    if (!open) body.appendChild(el('div', 'hx-locked', '<b>Velscour still sits his throne.</b> Slay him at Depth 500 and the Heresies open for every hero on this browser.'));
    // the rank, its bar and what it pays
    const head = el('div', 'hx-head');
    head.innerHTML = `<div class="hx-rank">Heresy rank <b>${rank}</b><span class="dim"> / ${HERESY_MAX_RANK}</span></div>
      <div class="hx-bar"><div style="width:${(100 * rank) / HERESY_MAX_RANK}%"></div>${HERESY_MILESTONES.map((m) => `<span class="hx-tick${rank >= m.rank ? ' done' : ''}" style="left:${(100 * m.rank) / HERESY_MAX_RANK}%"></span>`).join('')}</div>
      <div class="hx-chips${rank ? '' : ' dim'}">${rewardChips(rank)}</div>`;
    body.appendChild(head);
    // when they take hold (a level already built keeps the set it was built with)
    const here = w && w.kind === 'dungeon' && !w.rift && !w.unbound ? worldRank(w) : null;
    const built = here !== null && (w.heresy ? w.heresy.ids : []).join() !== on.join();
    body.appendChild(el('div', 'hx-note', `They take hold from the <b>next level</b> you enter (every depth, the Endless Torment and the Eternal Breach), never in Abyssal Rifts or Velscour Unbound.${built ? ` <span class="hx-warn">This level was built at Heresy ${here}: your changes wait for the next one.</span>` : ''}`));
    // one row per Heresy: the whole row is the toggle
    const list = el('div', 'hx-list');
    for (const H of HERESIES) {
      const isOn = on.includes(H.id);
      const row = el('label', 'hx-row' + (isOn ? ' on' : '') + (open ? '' : ' locked'));
      row.style.setProperty('--hc', H.color);
      row.dataset.id = H.id;
      row.innerHTML = `<input type="checkbox" ${isOn ? 'checked' : ''} ${open ? '' : 'disabled'}><span class="hx-sw"></span><span class="hx-text"><span class="hx-name"><b>${escapeHtml(H.name)}</b><span class="hx-pips" title="Rank ${H.rank}">${'<i></i>'.repeat(H.rank)}</span></span><span class="hx-desc">${escapeHtml(H.desc)}</span></span>`;
      row.querySelector('input').addEventListener('change', (e) => {
        if (!setHeresy(H.id, e.target.checked)) { e.target.checked = heresiesOf(c).includes(H.id); sfx('error'); return; }
        sfx(e.target.checked ? 'boss' : 'ui', 0.6);
        if (G.game && G.game.autosave) G.game.autosave();
        UI.refresh();
      });
      list.appendChild(row);
    }
    body.appendChild(list);
    const foot = el('div', 'hx-foot');
    foot.appendChild(el('div', 'hx-miles', HERESY_MILESTONES.map((m) => `<div class="hx-mile${rank >= m.rank ? ' done' : ''}"><b>Rank ${m.rank}</b> ${escapeHtml(m.text)}</div>`).join('')));
    if (open && rank) {
      const off = el('button', 'btn small hx-clear', 'Renounce all');
      off.onclick = () => { for (const id of heresiesOf(c)) setHeresy(id, false); sfx('ui'); if (G.game && G.game.autosave) G.game.autosave(); UI.refresh(); };
      foot.appendChild(off);
    }
    body.appendChild(foot);
    // the Endgame's other doors
    const doors = el('div', 'hx-doors');
    const btn = (cls, label, sub, fn, dis) => { const b = el('button', 'btn hx-door ' + cls, `<b>${label}</b><span>${sub}</span>`); b.disabled = !!dis; b.onclick = () => { sfx('ui'); this.close(); fn(); }; return b; };
    doors.appendChild(btn('hx-rift', 'Abyssal Rift', open ? `Tier ${riftOpen(c)} open` : 'sealed', () => G.game.confirmRift(), !open));
    doors.appendChild(btn('hx-unbound', 'Velscour Unbound', `${Math.min(UNBOUND_KEYS, keysOf(c))}/${UNBOUND_KEYS} Abyssal Keys`, () => G.game.enterUnbound(), !unboundReady(c)));
    doors.appendChild(btn('hx-marks', 'Infernal Marks', `${marksTotal()} (${marksFree()} free)`, () => G.ui.marks.open(), false));
    body.appendChild(doors);
    body.scrollTop = scroll;
  },
};
