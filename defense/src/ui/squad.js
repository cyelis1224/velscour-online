// The squad: up to 10 heroes you can deploy in battle (in tray order). Auto-pick builds a balanced, strong one.
import { D, save } from '../state.js';
import { el, escapeHtml, fmt } from '../core/util.js';
import { CARDS } from '../data/cards.js';
import { KITS } from '../data/kits.js';
import { unitDef, ownedHeroes } from '../meta/power.js';
import { heroDot } from '../meta/badges.js';
import { SQUAD_MAX } from '../meta/progress.js';
import { pickSquad, upgradeCharacters } from '../meta/autopilot.js';
import { show, toast, refresh } from './app.js';
import { cardView } from './cardview.js';
import { sfx } from '../core/audio.js';

export function render(root) {
  const s = D.save;
  root.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:8px"><div><b class="cinzel" style="color:#ffdf9a;font-size:18px">Squad ${s.squad.length}/${SQUAD_MAX}</b>
    <div class="dim" style="font-size:13px">Tap to add or remove. The tray in battle follows this order. Heroes are towers: short-range fighters hit hard beside the road, the rest reach far.</div></div>
    <div class="row"><button class="btn" data-k="auto">Auto-pick</button><button class="btn green" data-k="up">Auto-upgrade squad</button></div></div>
    <div class="cards" data-k="sq"></div><h3 class="cinzel" style="margin:14px 0 6px">Bench</h3><div class="cards" data-k="bench"></div>`;
  const sq = root.querySelector('[data-k=sq]'), bench = root.querySelector('[data-k=bench]');
  const tile = (id, inSquad) => {
    const d = unitDef(id, s), c = CARDS['h:' + id];
    const v = cardView(c, { entry: { ...s.cards['h:' + id], look: d.look }, stats: d, dot: heroDot(s, id), onClick: () => {
      if (inSquad) s.squad = s.squad.filter((x) => x !== id);
      else if (s.squad.length < SQUAD_MAX) s.squad.push(id); else { toast('The squad is full (10)'); return; }
      sfx('lock_unlock', 0.4); save(); refresh();
    } });
    v.insertAdjacentHTML('beforeend', `<span class="count" style="left:4px;right:auto">⚔${fmt(d.power)} · ${KITS[c.cls].range > 2 ? 'reach' : 'melee'}</span>`);
    const info = el('button', 'btn ghost', 'ⓘ'); info.style.cssText = 'position:absolute;top:4px;right:4px;padding:2px 7px;font-size:12px';
    info.onclick = (e) => { e.stopPropagation(); show('hero', { id }); };
    v.appendChild(info);
    return v;
  };
  for (const id of s.squad) if (s.cards['h:' + id]?.n > 0) sq.appendChild(tile(id, true));
  const rest = ownedHeroes(s).filter((id) => !s.squad.includes(id)).sort((a, b) => unitDef(b, s).power - unitDef(a, s).power);
  for (const id of rest) bench.appendChild(tile(id, false));
  if (!rest.length) bench.innerHTML = '<p class="dim">Every hero you own is in the squad. More come from the story and from Rift Summons.</p>';
  root.querySelector('[data-k=auto]').onclick = () => { pickSquad(s); save(); toast('Squad picked'); refresh(); };
  root.querySelector('[data-k=up]').onclick = () => { const log = upgradeCharacters(s); save(); toast(log.length ? log.slice(0, 4).join(', ') : 'Nothing to upgrade right now'); refresh(); };
}
