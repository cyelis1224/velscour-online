// The Bastion Works: permanent upgrades to every battle, bought with gold (the Commander's own choice: auto-play only
// upgrades heroes).
import { D, save } from '../state.js';
import { el, fmt } from '../core/util.js';
import { RESEARCH, researchCost, buyResearch } from '../meta/research.js';
import { toast, refresh } from './app.js';
import { sfx } from '../core/audio.js';

export function render(root) {
  const s = D.save;
  root.innerHTML = `<div class="dim" style="margin-bottom:10px">Permanent. In battle, Valor buys Empowers and the War Drums, Heart Ward and Rally Standard, and those end with the battle.</div><div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))" data-k="g"></div>`;
  const g = root.querySelector('[data-k=g]');
  for (const [k, r] of Object.entries(RESEARCH)) {
    const lvl = s.research[k] || 0, c = researchCost(k, lvl), max = lvl >= r.max, can = !max && s.gold >= c;
    const box = el('div', 'panel');
    box.innerHTML = `<div class="row" style="justify-content:space-between"><b class="cinzel" style="color:#ffdf9a">${r.icon} ${r.name}</b><span class="dim">${lvl}/${r.max}</span></div>
      <div class="dim" style="margin:4px 0">${r.text} per level</div><div class="quest" style="margin:0;padding:0;border:0;background:none"><div class="prog"><div class="pbar"><i style="width:${lvl / r.max * 100}%"></i></div></div></div>`;
    const b = el('button', 'btn ' + (can ? 'green dot' : ''), max ? 'Complete' : `Build · ${fmt(c)}◉`);
    b.style.marginTop = '8px'; b.disabled = !can;
    b.onclick = () => { if (buyResearch(s, k)) { sfx('rock_wall', 0.5); toast(`${r.name} ${lvl + 1}`); save(); refresh(); } };
    box.appendChild(b);
    g.appendChild(box);
  }
}
