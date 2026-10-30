// Modes: the side battles beside the campaign (meta/modes.js). Four endless runs, five daily challenges and the weekly
// Gauntlet, each at the strength of the campaign frontier, paying gold, shards, essence, tickets and trophies.
import { D } from '../state.js';
import { el, escapeHtml, timeLeft } from '../core/util.js';
import { MODES, entriesLeft, bestWave, todays, refStage, modeOpen } from '../meta/modes.js';
import { seals } from '../meta/seals.js';
import { ART } from '../core/assets.js';
import { REGIONS } from '../data/campaign.js';
import { toast } from './app.js';
import { playMode } from './battle.js';
import { initAudio, sfx } from '../core/audio.js';

const untilMidnight = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime(); };
const ARCH_NAME = (a) => a[0].toUpperCase() + a.slice(1) + (a.endsWith('s') ? 'es' : a.endsWith('y') ? '' : 's');

export function render(root) {
  const s = D.save, day = todays(s), sl = seals(s);
  root.innerHTML = `<div class="dim" style="margin-bottom:8px">Side battles at the strength of your campaign frontier (stage ${Math.min(300, s.frontier)}). Challenges refresh at midnight UTC (in ${timeLeft(untilMidnight())}); the Gauntlet weekly.</div>
    <h3 class="cinzel mode-h">Endless</h3><div class="modes" data-k="endless"></div>
    <h3 class="cinzel mode-h">Challenges</h3><div class="modes" data-k="daily"></div>`;
  for (const m of MODES) {
    const open = modeOpen(s, m.id), left = entriesLeft(s, m.id), endless = m.kind === 'endless';
    const c = el('div', 'panel mode' + (open ? '' : ' locked') + (!endless && open && left > 0 ? ' ready' : ''));
    let extra = '';
    if (m.classes) extra = `Today: ${day.classes.map((k) => escapeHtml(ART.classes[k]?.name || k)).join(', ')}`;
    if (m.hunt) extra = `Today: ${ARCH_NAME(day.arch)}`;
    const meta = !open ? `Opens at stage ${m.unlock}` : endless ? `Best: ${bestWave(s, m.id)} waves · strength of stage ${refStage(s, m)}` : `${left} of ${m.entries} left ${m.kind === 'weekly' ? 'this week' : 'today'} · ${m.waves} waves at stage ${refStage(s, m)}`;
    c.innerHTML = `<div class="mode-top"><span class="mode-ico">${m.icon}</span><div><b class="cinzel">${escapeHtml(m.name)}</b><div class="dim mode-meta">${meta}</div></div></div>
      <div class="mode-text">${escapeHtml(m.text)}</div>${extra ? `<div class="mode-extra">${extra}</div>` : ''}`;
    const b = el('button', 'btn ' + (open && (endless || left > 0) ? 'green' : ''), !open ? 'Locked' : endless ? (sl > 0 ? 'Begin · 1 Seal' : 'Begin (training)') : left > 0 ? 'Begin' : 'Done');
    b.disabled = !open || (!endless && left <= 0);
    b.onclick = async () => { initAudio(); sfx('gate_open', 0.6); if (!(await playMode(m.id))) toast('Nothing left today'); };
    c.appendChild(b);
    root.querySelector(`[data-k=${endless ? 'endless' : 'daily'}]`).appendChild(c);
  }
}
