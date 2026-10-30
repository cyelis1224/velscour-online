// The Bastion (Fantasica's "My Page"): the squad before the Riftgate, the next stage, Rift Seals, auto-battle, the Works
// and quick rewards.
import { D, save } from '../state.js';
import { el, escapeHtml, fmt, timeLeft } from '../core/util.js';
import { LEVELS, TOTAL_WAVES } from '../data/campaign.js';
import { regionOf } from '../meta/progress.js';
import { show, toast, refresh, switchEl, modal } from './app.js';
import { portrait } from './portrait.js';
import { unitDef } from '../meta/power.js';
import { playStage } from './battle.js';
import { seals, nextSeal, SEAL_MAX } from '../meta/seals.js';
import { actOf } from '../data/campaign.js';
import { loginReady, claimLogin, hourlyReady, claimHourly, HOURLY_CAP, LOGIN } from '../meta/rewards.js';
import { sfx, playMusic } from '../core/audio.js';
import { initAudio } from '../core/audio.js';
import { badges } from '../meta/badges.js';

export function render(root) {
  const s = D.save, n = Math.min(s.frontier, LEVELS.length), L = LEVELS[n - 1], R = regionOf(n), done = s.frontier > LEVELS.length;
  playMusic('hymn_of_the_abyss', 0.5);
  root.innerHTML = `<div class="hub">
    <div class="hub-stage"><div class="hub-logo"><img src="../assets/ui/logo.webp" alt="VELSCOUR"><div class="logo-sub">DEFENSE</div></div><div class="hub-heroes"></div></div>
    <div class="hub-side">
      <div class="panel next-card">
        <div class="dim cinzel" style="font-size:12px">${done ? 'The campaign is won' : escapeHtml(actOf(n).name) + ' · ' + escapeHtml(R.name) + ' · Stage ' + n}</div>
        <div class="stage-name">${escapeHtml(done ? 'Hold the Riftgate' : L.name)}</div>
        <div class="waves">${done ? 'Replay any stage for more stars' : `Waves ${L.wave0 + 1}-${L.wave0 + L.waves} of ${TOTAL_WAVES}`} · best wave ${s.stats.bestWave}</div>
        <button class="btn big green" data-k="go">${done ? 'Campaign' : 'Begin ▸'}</button>
      </div>
      <div class="panel">
        <div class="toggle"><span>Auto-battle<br><small class="dim">deploys, empowers, builds</small></span><span data-k="ab"></span></div>
        <div class="toggle"><span>Rift Seals <b data-k="seals"></b><br><small class="dim" data-k="sealnext"></small></span></div>
      </div>
      <div class="mini-rewards">
        <button class="btn" data-k="modes">∞ Modes<small>endless &amp; challenges</small></button>
        <button class="btn ${badges(s).works ? 'dot' : ''}" data-k="works">⚒ Works<small>permanent upgrades</small></button>
      </div>
      <div class="mini-rewards">
        <button class="btn ${loginReady(s) ? 'dot' : ''}" data-k="login">🎁 Daily<small>${loginReady(s) ? LOGIN[s.daily.day % 7].label : 'claimed today'}</small></button>
        <button class="btn ${hourlyReady(s).hours >= 1 ? 'dot' : ''}" data-k="hourly">⏳ Bounty<small data-k="hb"></small></button>
      </div>
      <button class="btn ghost" data-k="home">⟲ Return to Herrington Hollow</button>
    </div></div>`;
  // the squad, in their gear, before the rift
  const heroes = root.querySelector('.hub-heroes'), H = Math.min(260, Math.max(110, innerHeight * 0.34));
  s.squad.slice(0, 7).forEach((id, i) => { const d = unitDef(id, s), c = portrait(d.look, Math.round(H * 0.55), Math.round(H), { flip: i % 2 === 1 }); heroes.appendChild(c); });
  const hb = root.querySelector('[data-k=hb]'), upd = () => { const h = hourlyReady(s); hb.textContent = h.hours >= HOURLY_CAP ? 'full!' : `${fmt(h.gold)}◉ ${h.shards}◆`; };
  upd();
  root.querySelector('[data-k=go]').onclick = () => { initAudio(); sfx('gate_open', 0.6); if (done) show('campaign'); else playStage(n); };
  root.querySelector('[data-k=ab]').appendChild(switchEl(s.settings.autoBattle, (v) => { s.settings.autoBattle = v; save(); }));
  const sl = () => { const k = seals(s); root.querySelector('[data-k=seals]').textContent = `${k}/${SEAL_MAX}`; root.querySelector('[data-k=sealnext]').textContent = k >= SEAL_MAX ? 'full: every battle pays in full' : `next in ${timeLeft(nextSeal(s))} · a battle without one pays a seventh`; };
  sl(); const st = setInterval(() => root.isConnected ? sl() : clearInterval(st), 1000);
  root.querySelector('[data-k=modes]').onclick = () => { sfx('door_open', 0.4); show('modes'); };
  root.querySelector('[data-k=works]').onclick = () => { sfx('door_open', 0.4); show('works'); };
  root.querySelector('[data-k=login]').onclick = () => { const r = claimLogin(s); if (r) { sfx('chest_open', 0.7); toast(`Day ${s.daily.day}: ${r.label}`); save(); refresh(); } else show('rewards'); };
  root.querySelector('[data-k=hourly]').onclick = () => { const r = claimHourly(s); if (r) { sfx('chest_open', 0.6); toast(`Bounty: +${fmt(r.gold)} gold, +${r.shards} shards`); save(); refresh(); } else toast('The bounty is still gathering'); };
  root.querySelector('[data-k=home]').onclick = () => modal('<h2>Return to Herrington Hollow?</h2><p class="dim">Step back through the Riftgate into VELSCOUR. Your Defense progress is saved.</p>',
    [{ label: 'Stay', cls: 'ghost' }, { label: 'Return', cls: 'blue', fn: () => { save(true); location.href = '../index.html'; } }]);
}
