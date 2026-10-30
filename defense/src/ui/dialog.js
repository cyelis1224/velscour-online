// The story scenes at the beginning and end of each stage: two heroes face each other, lines type out, tap to go on.
import { el, escapeHtml } from '../core/util.js';
import { CAST_BY_ID } from '../data/cast.js';
import { HERO_BY_ID } from '../data/heroes.js';
import { portrait } from './portrait.js';
import { heroBaseLook } from '../data/heroes.js';
import { sfx } from '../core/audio.js';
import { DIALOGS } from '../data/dialogs/index.js';
import { D } from '../state.js';

/** Play the stage's dialogs for 'begin' or 'end'. Resolves when done (or skipped). auto: advance on its own. */
export function playStageDialogs(n, at, opts = {}) {
  const list = DIALOGS.filter((d) => d.level === n && d.at === at);
  if (!list.length || (D.save.settings.skipDialogs && !opts.force)) return Promise.resolve();
  return new Promise((resolve) => {
    const root = el('div', 'dlg');
    root.innerHTML = `<div class="stage-line">${escapeHtml(opts.title || '')}</div><div class="actors"></div>
      <div class="box"><div class="who"></div><div class="text"></div><div class="ctl"><button class="btn ghost" data-k="auto">Auto ▸</button><button class="btn ghost" data-k="skip">Skip ⏭</button></div><div class="next-ind">▼</div></div>`;
    document.getElementById('ui').appendChild(root);
    const actors = root.querySelector('.actors'), who = root.querySelector('.who'), text = root.querySelector('.text');
    let di = 0, li = 0, typing = null, shown = '', full = '', auto = !!opts.auto, autoT = null, left = null, right = null;
    const autoBtn = root.querySelector('[data-k=auto]');
    const setAuto = (v) => { auto = v; autoBtn.textContent = auto ? 'Auto ■' : 'Auto ▸'; if (auto && !typing) schedule(); };
    const actor = (id, side) => {
      const h = HERO_BY_ID[id], a = el('div', 'actor ' + side), H = Math.min(window.innerHeight * 0.5, 420);
      a.appendChild(portrait(heroBaseLook(h), Math.round(H * 0.62), Math.round(H), {}));
      a.dataset.id = id; a.style.setProperty('--glow', CAST_BY_ID[id]?.color || '#4a7aff');
      actors.appendChild(a);
      return a;
    };
    const setup = () => {
      const d = list[di];
      actors.innerHTML = '';
      const ids = [...new Set(d.lines.map((l) => l[0]))];
      left = actor(ids[0], 'left'); right = ids[1] ? actor(ids[1], 'right') : null;
      d._third = ids[2] || null;
      li = 0; line();
    };
    const line = () => {
      const d = list[di], [id, t, mood] = d.lines[li], c = CAST_BY_ID[id];
      if (d._third === id && right && right.dataset.id !== id) { right.remove(); right = actor(id, 'right'); }
      for (const a of actors.children) { a.classList.toggle('speaking', a.dataset.id === id); a.classList.toggle('idle', a.dataset.id !== id); }
      const sp = [...actors.children].find((a) => a.dataset.id === id);
      if (sp && (mood === 'angry' || mood === 'shout' || mood === 'fear')) { sp.classList.remove('shake'); void sp.offsetWidth; sp.classList.add('shake'); }
      who.style.color = c.color; who.innerHTML = `${escapeHtml(c.short)}<small>${escapeHtml(c.title)}</small>`;
      full = t; shown = ''; text.textContent = '';
      clearInterval(typing); clearTimeout(autoT);
      let i = 0;
      typing = setInterval(() => {
        i += 2; text.textContent = full.slice(0, i);
        if (i % 6 === 0) sfx('stone_walk', 0.05);
        if (i >= full.length) { clearInterval(typing); typing = null; if (auto) schedule(); }
      }, 22);
    };
    const schedule = () => { clearTimeout(autoT); autoT = setTimeout(next, 900 + full.length * 28); };
    const next = () => {
      if (typing) { clearInterval(typing); typing = null; text.textContent = full; if (auto) schedule(); return; }
      li++;
      if (li >= list[di].lines.length) { di++; if (di >= list.length) return done(); setup(); }
      else line();
    };
    const done = () => { clearInterval(typing); clearTimeout(autoT); root.remove(); D.save.seen[list[0].id] = true; resolve(); };
    root.onclick = (e) => { if (e.target.closest('button')) return; next(); };
    root.querySelector('[data-k=skip]').onclick = done;
    autoBtn.onclick = () => setAuto(!auto);
    setup();
    autoBtn.textContent = auto ? 'Auto ■' : 'Auto ▸';
  });
}
