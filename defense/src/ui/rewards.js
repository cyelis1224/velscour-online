// Rewards: the 7-day login calendar, the hourly bounty, today's quests and the achievements.
import { D, save } from '../state.js';
import { el, escapeHtml, fmt, timeLeft } from '../core/util.js';
import { LOGIN, loginReady, claimLogin, hourlyReady, claimHourly, HOURLY_CAP, hourlyRate, quests, claimQuest, ACHIEVEMENTS, claimAchievement } from '../meta/rewards.js';
import { toast, refresh } from './app.js';
import { sfx } from '../core/audio.js';

export function render(root) {
  const s = D.save, day = s.daily.day % 7, ready = loginReady(s), h = hourlyReady(s), rate = hourlyRate(s);
  root.innerHTML = `<div class="panel"><b class="cinzel" style="color:#ffdf9a">Daily login</b> <span class="dim">· day ${s.daily.day + (ready ? 1 : 0)} · the calendar never resets for a missed day</span>
      <div class="calendar" style="margin-top:8px">${LOGIN.map((r, i) => `<div class="day ${i < day ? 'claimed' : ''} ${i === day && ready ? 'today' : ''}"><div class="d">Day ${i + 1}</div><div class="rw">${r.icon}</div>${escapeHtml(r.label)}</div>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="btn green ${ready ? 'dot' : ''}" data-k="login" ${ready ? '' : 'disabled'}>${ready ? 'Claim today' : 'Come back tomorrow'}</button></div></div>
    <div class="panel" style="margin-top:10px"><b class="cinzel" style="color:#ffdf9a">Hourly bounty</b> <span class="dim">· ${fmt(rate.gold)} gold and ${rate.shards} shards an hour, up to ${HOURLY_CAP} hours</span>
      <div class="quest"><div class="prog">${fmt(h.gold)}◉ · ${h.shards}◆ waiting<div class="pbar"><i style="width:${Math.min(100, h.hours / HOURLY_CAP * 100)}%"></i></div></div>
      <button class="btn green ${h.hours >= 1 ? 'dot' : ''}" data-k="hourly" ${h.hours >= 1 / 6 ? '' : 'disabled'}>Collect</button></div>
      <div class="dim" style="font-size:12px">${h.hours >= HOURLY_CAP ? 'Full: collect it so it keeps filling' : `Full in ${timeLeft((HOURLY_CAP - h.hours) * 3600000)}`}</div></div>
    <div class="panel" style="margin-top:10px"><b class="cinzel" style="color:#ffdf9a">Today's quests</b><div data-k="q" style="margin-top:6px"></div></div>
    <div class="panel" style="margin-top:10px"><b class="cinzel" style="color:#ffdf9a">Achievements</b><div data-k="a" style="margin-top:6px"></div></div>`;
  root.querySelector('[data-k=login]').onclick = () => { const r = claimLogin(s); if (r) { sfx('chest_open', 0.8); toast(r.label); save(); refresh(); } };
  root.querySelector('[data-k=hourly]').onclick = () => { const r = claimHourly(s); if (r) { sfx('chest_open', 0.6); toast(`+${fmt(r.gold)} gold, +${r.shards} shards`); save(); refresh(); } };
  const qb = root.querySelector('[data-k=q]');
  for (const q of quests(s)) {
    const row = el('div', 'quest');
    row.innerHTML = `<div class="prog"><b>${escapeHtml(q.text)}</b> <span class="dim">${q.prog}/${q.n} · ◆${q.shards} ◉${fmt(q.gold)}</span><div class="pbar"><i style="width:${q.prog / q.n * 100}%"></i></div></div>`;
    const b = el('button', 'btn ' + (q.done && !q.claimed ? 'green dot' : ''), q.claimed ? 'Claimed' : q.done ? 'Claim' : '…');
    b.disabled = !q.done || q.claimed;
    b.onclick = () => { if (claimQuest(s, q.id)) { sfx('chest_open', 0.6); save(); refresh(); } };
    row.appendChild(b); qb.appendChild(row);
  }
  const ab = root.querySelector('[data-k=a]');
  const list = ACHIEVEMENTS.map((a) => ({ a, done: a.test(s), got: !!s.achieved[a.id] })).sort((x, y) => (y.done && !y.got) - (x.done && !x.got) || x.got - y.got);
  for (const { a, done, got } of list) {
    const row = el('div', 'quest');
    row.innerHTML = `<div class="prog"><b>${escapeHtml(a.text)}</b> <span class="dim">◆${a.shards}${a.tickets ? ' + ' + Object.entries(a.tickets).map(([k, v]) => `${v} ${k === 'legend' ? 'Legend' : 'Hero'} Ticket${v > 1 ? 's' : ''}`).join(', ') : ''}</span></div>`;
    const b = el('button', 'btn ' + (done && !got ? 'green dot' : ''), got ? '✓' : done ? 'Claim' : 'Locked');
    b.disabled = !done || got;
    b.onclick = () => { if (claimAchievement(s, a.id)) { sfx('chest_open', 0.7); toast(a.text); save(); refresh(); } };
    row.appendChild(b); ab.appendChild(row);
  }
}
