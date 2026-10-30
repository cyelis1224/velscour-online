// The Macros panel (game/macros.js): five lists of skills, each on a key of its own, with "Keep up". Opened from the
// skill tree's head, the pause menu and the skull's "macros".
import { G } from '../state.js';
import { el, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI } from './ui.js';
import { skillIconURL } from './icons.js';
import { SKILLS, CLASS_SKILLS } from '../data/skills.js';
import { SLOT_LABELS } from '../data/bar.js';
import { Macros, MACRO_KEYS, MACRO_LEN, keyLabel, setMacroKey } from '../game/macros.js';

/** The skills a macro can hold: every learned skill of the class, then any other on the bar. */
function castable(c) {
  const out = (CLASS_SKILLS[c.classId] || []).filter((s) => (c.skills[s.id] || 0) > 0);
  for (const id of c.bar) if (id && SKILLS[id] && !out.includes(SKILLS[id])) out.push(SKILLS[id]);
  return out;
}
const barKey = (c, id) => { const i = c.bar.indexOf(id); return i < 0 ? '' : SLOT_LABELS[i]; };
const changed = () => { if (G.touchUI && G.touchUI.layout) G.touchUI.layout(); UI.refresh(); };

export const MacrosUI = {
  open() {
    UI.closeAll();
    sfx('ui');
    UI.openPanel('macros', 'Macros', (b) => this.render(b), { cls: 'macros-panel', width: 'min(680px, 96vw)' });
  },
  toggle() { if (UI.isOpen('macros')) UI.closePanel('macros'); else this.open(); },
  render(body) {
    const c = G.char;
    if (!c) return;
    const a = document.activeElement;
    if (a && body.contains(a) && a.tagName === 'INPUT' && a.type === 'text') return; // don't re-render under a name being typed
    body.innerHTML = '';
    body.appendChild(el('div', 'dim mc-why', `A macro casts its skills one after another with one key${G.touch ? ' (or its button by the skills)' : ''}: a skill on cooldown or short of mana is skipped. <b>Keep up</b> recasts its buffs as they wear off and its cooldown skills as they come back, while a foe is near (not with auto-play on).`));
    const all = castable(c);
    c.macros.forEach((m, i) => {
      const row = el('div', 'mc-row');
      row.dataset.macro = i;
      const head = el('div', 'mc-head');
      const name = el('input', 'name-input mc-name');
      name.type = 'text'; name.maxLength = 24; name.value = m.name;
      name.onchange = () => { m.name = name.value.trim().slice(0, 24) || `Macro ${i + 1}`; changed(); };
      const key = el('select', 'mc-key');
      key.title = 'Its key';
      key.innerHTML = [null, ...MACRO_KEYS].map((k) => `<option value="${k || ''}"${m.key === k ? ' selected' : ''}>${k ? 'Key ' + keyLabel(k) : 'No key'}</option>`).join('');
      key.onchange = () => { setMacroKey(i, key.value || null); sfx('ui'); changed(); };
      const keep = el('label', 'mc-keep', `<input type="checkbox"${m.keep ? ' checked' : ''}> Keep up`);
      keep.title = 'Recast its buffs as they wear off and its cooldown skills as they come back, while a foe is near';
      keep.querySelector('input').onchange = (e) => { m.keep = e.target.checked; sfx('ui'); changed(); };
      const run = el('button', 'btn small', 'Cast');
      run.disabled = !m.skills.length;
      run.onclick = () => { UI.closePanel('macros'); Macros.run(i); };
      head.append(name, key, keep, run);
      row.appendChild(head);
      const list = el('div', 'mc-skills');
      m.skills.forEach((id, k) => {
        const sk = SKILLS[id];
        const chip = el('div', 'mc-chip' + (sk && (c.skills[id] || 0) > 0 ? '' : ' gone'), `<span class="mc-n">${k + 1}</span>${sk ? `<img src="${skillIconURL(sk)}" alt="">` : ''}<span class="mc-x">&times;</span>`);
        chip.title = `${sk ? sk.name : 'An unknown skill'}${sk && barKey(c, id) ? ` (bar ${barKey(c, id)})` : ''}: click to take it out`;
        chip.onclick = () => { m.skills.splice(k, 1); sfx('ui'); changed(); };
        list.appendChild(chip);
      });
      if (m.skills.length < MACRO_LEN) {
        const add = el('select', 'mc-add');
        const left = all.filter((s) => !m.skills.includes(s.id));
        add.innerHTML = `<option value="">+ Add a skill</option>` + left.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}${barKey(c, s.id) ? ` [${barKey(c, s.id)}]` : ''}${s.kind === 'buff' ? ' · buff' : ''}</option>`).join('');
        add.disabled = !left.length;
        add.onchange = () => { if (add.value) { m.skills.push(add.value); sfx('ui'); changed(); } };
        list.appendChild(add);
      }
      if (!m.skills.length) {
        const buffs = c.bar.filter((id) => id && SKILLS[id] && SKILLS[id].kind === 'buff');
        if (buffs.length) {
          const fill = el('button', 'btn small', `Add the bar's buffs (${buffs.length})`);
          fill.onclick = () => { m.skills = buffs.slice(0, MACRO_LEN); sfx('ui'); changed(); };
          list.appendChild(fill);
        }
      } else {
        const clr = el('button', 'btn small', 'Clear');
        clr.onclick = () => { m.skills = []; m.keep = false; sfx('ui'); changed(); };
        list.appendChild(clr);
      }
      row.appendChild(list);
      body.appendChild(row);
    });
  },
};
