// The Infernal Marks panel (docs/ENDGAME.md, game/marks.js): the points every hero shares, spent on four categories.
import { G } from '../state.js';
import { el, escapeHtml, fmtInt } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI } from './ui.js';
import { CATS, marksTotal, marksFree, marksIn, bonusAt, alsoAt, worthNext, spendMark, resetMarks, autoSpend, markXp } from '../game/marks.js';
import { endgame, MARK_CATS } from '../game/endgame.js';
import { MAX_LEVEL } from '../game/player.js';

const num = (v) => (Math.round(v * 10) / 10).toString();
const nextTxt = (v) => (v >= 0.01 ? v.toFixed(2) : v.toPrecision(2));
export const Marks = {
  active: false,
  open() {
    UI.closeAll();
    this.active = true;
    sfx('ui');
    UI.openPanel('marks', 'Infernal Marks', (b) => this.render(b), { onClose: () => { this.active = false; }, cls: 'marks-panel', width: 'min(620px, 96vw)' });
  },
  render(body) {
    const free = marksFree(), xp = endgame().marks.xp, need = markXp(), pct = Math.min(100, (xp / need) * 100);
    body.innerHTML = '';
    body.appendChild(el('div', 'mk-head', `<div class="mk-tot"><b>${fmtInt(marksTotal())}</b> Marks<span class="mk-free${free ? ' on' : ''}"><b>${fmtInt(free)}</b> to spend</span></div>` +
      `<div class="mk-xp" title="${fmtInt(xp)} / ${fmtInt(need)} XP"><i style="width:${pct.toFixed(1)}%"></i><span>Next Mark from XP: ${Math.floor(pct)}%${G.char && G.char.level >= MAX_LEVEL ? '' : ` (from level ${MAX_LEVEL})`}</span></div>` +
      `<div class="dim mk-why">XP past level ${MAX_LEVEL}, Abyssal Rift clears and Heresy rank 20 earn Marks. Every hero on this browser shares them. Each point adds a little less than the one before.</div>`));
    const list = el('div', 'mk-list');
    for (const k of MARK_CATS) {
      const C = CATS[k], n = marksIn(k), now = bonusAt(k, n), next = bonusAt(k, n + 1);
      const row = el('div', 'mk-row', `<div class="mk-name"><b>${escapeHtml(C.name)}</b><span class="mk-pts">${fmtInt(n)}</span></div>` +
        `<div class="mk-val"><b>+${num(now)}</b>${escapeHtml(C.unit)}${C.also ? ` · <b>+${num(alsoAt(k, n))}</b>${escapeHtml(C.also.unit)}` : ''}</div>` +
        `<div class="mk-bar" title="The next point adds ${Math.round(worthNext(n) * 100)}% of what the first one did"><i style="width:${(100 - worthNext(n) * 100).toFixed(1)}%"></i></div>` +
        `<div class="dim mk-next">${escapeHtml(C.desc)} Next point +${nextTxt(next - now)}${C.also ? ` / +${nextTxt(alsoAt(k, n + 1) - alsoAt(k, n))}` : ''} · ${Math.round(worthNext(n) * 100)}% of the first</div>`);
      row.style.setProperty('--mk', C.color);
      row.dataset.cat = k;
      const btns = el('div', 'mk-btns');
      for (const s of [1, 5, 25]) {
        const b = el('button', 'btn small', '+' + s); b.disabled = free < s;
        b.onclick = () => { spendMark(k, s); sfx('ui'); UI.refresh(); };
        btns.appendChild(b);
      }
      row.appendChild(btns);
      list.appendChild(row);
    }
    body.appendChild(list);
    const foot = el('div', 'mk-foot');
    const all = el('button', 'btn small', 'Spend all (balanced)'); all.disabled = !free; all.onclick = () => { autoSpend(); sfx('levelup', 0.4); UI.refresh(); };
    const reset = el('button', 'btn small', 'Reset (free)'); reset.disabled = !(marksTotal() - free); reset.onclick = () => { resetMarks(); sfx('ui'); UI.refresh(); };
    foot.append(all, reset);
    body.appendChild(foot);
  },
};
