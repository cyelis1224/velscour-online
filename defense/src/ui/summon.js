// The Summoning Altar: packs for Soul Shards (earned by playing, never bought), tickets, a free pack every day.
import { D, save } from '../state.js';
import { el, escapeHtml, fmt } from '../core/util.js';
import { RARITIES } from '../data/kits.js';
import { PACKS, canOpen, openPack, today } from '../meta/gacha.js';
import { openPack3D, packPreview } from '../cards/pack3d.js';
import { show, toast, refresh } from './app.js';
import { sfx } from '../core/audio.js';

export function render(root) {
  const s = D.save;
  root.innerHTML = `<div class="panel" style="margin-bottom:12px"><b class="cinzel" style="color:#ffdf9a">No purchases, ever.</b>
    <span class="dim">Soul Shards come from battles, the daily login, the hourly bounty, quests and achievements. Odds are shown on every pack.
    Hero pity: ${s.pity.hero}/50 summons since your last Legendary.</span></div><div class="packs" data-k="packs"></div>`;
  const grid = root.querySelector('[data-k=packs]');
  for (const p of PACKS) {
    const box = el('div', 'pack panel');
    const how = canOpen(s, p), ten = p.ten && canOpen(s, p, true);
    const credit = s.freePacks?.[p.id] || 0;
    box.innerHTML = `<div data-k="art" style="height:220px"></div><h3 class="cinzel">${escapeHtml(p.name)}</h3><div class="dim" style="font-size:13px">${escapeHtml(p.sub)}</div>
      <div class="odds">${p.odds.map((w, r) => (w ? `<span class="r${r}">${RARITIES[r].name[0]} ${w}%</span>` : '')).filter(Boolean).join(' · ')}</div>
      <div class="dim" style="font-size:12px">${escapeHtml(p.text)}</div>
      <div class="row" style="justify-content:center"></div>`;
    packPreview(p).then((c) => box.querySelector('[data-k=art]').appendChild(c));
    const row = box.querySelector('.row');
    const btn = el('button', 'btn ' + (how ? 'green dot' : ''), p.daily ? (how ? 'Open free ✦' : 'Opened today') : how === 'legend' ? 'Use Legend Ticket ★' : how === 'ticket' ? `Use Hero Ticket (${s.tickets.hero})` : how === 'credit' ? `Open free (${credit})` : `Open · ◆${p.price}`);
    btn.disabled = !how;
    btn.onclick = () => go(p, false);
    row.appendChild(btn);
    if (p.ten) { const b10 = el('button', 'btn ' + (ten ? 'blue' : ''), `×10 · ◆${fmt(p.ten)}`); b10.disabled = !ten; b10.onclick = () => go(p, true); row.appendChild(b10); }
    if (!how && !p.daily) box.querySelector('.row').insertAdjacentHTML('beforeend', `<div class="dim" style="font-size:12px;width:100%">Need ◆${p.price - s.shards} more</div>`);
    grid.appendChild(box);
  }
}
async function go(p, ten) {
  const s = D.save, res = openPack(s, p, ten);
  if (!res) { toast('Not enough Soul Shards'); sfx('sword_blocked', 0.3); return; }
  save(true);
  sfx('lock_unlock', 0.5);
  const again = () => (canOpen(s, p, ten) ? Promise.resolve(true) : Promise.resolve(false));
  const r = await openPack3D(p, res, { again: canOpen(s, p, ten) ? again : null, againLabel: ten ? 'Summon ×10 again' : 'Open another' });
  show('summon');
  if (r?.again) go(p, ten);
}
