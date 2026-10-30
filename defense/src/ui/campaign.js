// The campaign map: five acts, 30 regions of ten stages on 40 battlefields; each stage opens when the one before it is won.
import { D } from '../state.js';
import { el, escapeHtml, makeCanvas } from '../core/util.js';
import { LEVELS, REGIONS, TOTAL_WAVES, ACTS } from '../data/campaign.js';
import { seals, SEAL_MAX } from '../meta/seals.js';
import { buildMap, K } from '../battle/map.js';
import { stageRoster, deployLimit, heartBase, ROLES } from '../data/waves.js';
import { stageUnlocked, resolveOf } from '../meta/progress.js';
import { stageAlly } from '../meta/power.js';
import { researchBonus } from '../meta/research.js';
import { MAPS, stageMapRef } from '../data/maps.js';
import { THEMES } from '../art/terrain.js';
import { loadMonsters, monsterImage } from '../art/monsterart.js';
import { modal, show } from './app.js';
import { playStage } from './battle.js';
import { portrait } from './portrait.js';
import { sfx } from '../core/audio.js';

let region = null;
export function render(root, args = {}) {
  const s = D.save;
  region = args.region ?? region ?? Math.min(REGIONS.length - 1, Math.floor((Math.min(s.frontier, LEVELS.length) - 1) / 10));
  // the acts, then the regions of the chosen act
  const act = ACTS.find((a) => region * 10 + 1 >= a.from && region * 10 + 1 <= a.to), acts = el('div', 'acts');
  for (const a of ACTS) {
    const t = el('button', 'act-tab' + (a === act ? ' on' : '') + (a.from > s.frontier ? ' locked' : ''), escapeHtml(a.name));
    t.onclick = () => { if (a.from > s.frontier) { sfx('sword_blocked', 0.3); return; } show('campaign', { region: Math.min(Math.floor((Math.min(s.frontier, a.to) - 1) / 10), (a.to - 10) / 10) }); };
    acts.appendChild(t);
  }
  const tabs = el('div', 'regions');
  REGIONS.forEach((R, i) => {
    if (i * 10 + 1 < act.from || i * 10 + 1 > act.to) return;
    const t = el('button', 'region-tab' + (i === region ? ' on' : '') + (i * 10 + 1 > s.frontier ? ' locked' : ''), `${i + 1}. ${escapeHtml(R.name)}`);
    t.onclick = () => { region = i; show('campaign', { region: i }); };
    tabs.appendChild(t);
  });
  root.append(acts, tabs);
  const R = REGIONS[region], seenMaps = new Set(LEVELS.filter((L) => L.n < s.frontier).map((L) => stageMapRef(L.n).map));
  root.insertAdjacentHTML('beforeend', `<div class="region-head"><h2>${escapeHtml(R.name)}</h2><div class="dim">${escapeHtml(R.blurb)}</div>
    <div class="dim" style="font-size:12px;margin-top:4px">Battlefields unlocked: ${Math.min(MAPS.length, seenMaps.size + (s.frontier <= LEVELS.length ? 1 : 0))} of ${MAPS.length} · best wave ${s.stats.bestWave} of ${TOTAL_WAVES}</div></div>`);
  const grid = el('div', 'stages');
  for (let k = 0; k < 10; k++) {
    const n = region * 10 + k + 1, L = LEVELS[n - 1], P = s.progress[n], open = stageUnlocked(s, n);
    const c = el('button', 'stage' + (open ? '' : ' locked') + (L.boss ? ' boss' : '') + (n === s.frontier ? ' frontier' : ''));
    c.appendChild(mapThumb(n, 320, 184));
    c.insertAdjacentHTML('beforeend', `${L.boss ? '<span class="tag">BOSS</span>' : L.lieutenant ? '<span class="tag lt">LIEUTENANT</span>' : L.warlord ? '<span class="tag lt">WARLORD</span>' : ''}${n === s.frontier && open ? '<span class="tag new">NEW</span>' : ''}
      <div class="st-body"><div class="st-n">STAGE ${n} · waves ${L.wave0 + 1}-${L.wave0 + L.waves}</div><div class="st-name">${escapeHtml(L.name)}</div>
      <div class="st-stars">${[1, 2, 3].map((i) => `<span class="${P && P.stars >= i ? '' : 'off'}">★</span>`).join('')}</div></div>`);
    c.onclick = () => { if (!open) { sfx('sword_blocked', 0.3); return; } sfx('door_open', 0.4); brief(n); };
    grid.appendChild(c);
  }
  root.appendChild(grid);
}

/** A little top-down picture of a stage's battlefield in its region's colours. */
const thumbs = new Map();
export function mapThumb(n, w, h) {
  const key = n + '|' + w;
  const c = makeCanvas(w, h);
  if (thumbs.has(key)) { c.getContext('2d').drawImage(thumbs.get(key), 0, 0); return c; }
  const m = buildMap(n), x = c.getContext('2d'), T = THEMES[REGIONS[Math.floor((n - 1) / 10)].id];
  x.fillStyle = '#05060c'; x.fillRect(0, 0, w, h);
  const s = Math.min(w / (m.w + m.h) * 2, h / (m.w + m.h) * 3.4) * 0.98, hw = s / 2, hh = s / 4, ox = w / 2 - (m.w - m.h) * hw / 2, oy = (h - (m.w + m.h) * hh) / 2 + 4;
  const G = { 0: T.cliff, 1: '#c8a878', 2: T.water, 3: '#9ab8ff', 4: T.cliff };
  for (let y = 0; y < m.h; y++) for (let xx = 0; xx < m.w; xx++) {
    const i = m.I(xx, y), k = m.kind[i], hgt = m.hgt[i], px = ox + (xx - y) * hw, py = oy + (xx + y) * hh - hgt * hh * 0.7;
    const base = k === K.GROUND || k === K.PROP ? shadeHex(T.cliff, 0.25 + hgt * 0.08) : k === K.PATH ? '#d8c09a' : k === K.POST ? '#7ab0ff' : T.water;
    x.fillStyle = base; x.beginPath(); x.moveTo(px, py - hh); x.lineTo(px + hw, py); x.lineTo(px, py + hh); x.lineTo(px - hw, py); x.fill();
    if (hgt > 0) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px - hw, py, hw * 2, hgt * hh * 0.7); }
  }
  for (const [sx, sy] of m.spawns) { const px = ox + (sx - sy) * hw, py = oy + (sx + sy) * hh; x.fillStyle = '#3a6cff'; x.beginPath(); x.arc(px, py, 3.5, 0, 7); x.fill(); }
  { const [hx, hy] = m.heart, px = ox + (hx - hy) * hw, py = oy + (hx + hy) * hh; x.fillStyle = '#ff5a4a'; x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
  thumbs.set(key, c);
  return c;
}
function shadeHex(h, f) { const n = parseInt(h.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255, t = (v) => Math.round(v + (255 - v) * f); return `rgb(${t(r)},${t(g)},${t(b)})`; }

/** The briefing: the battlefield, who comes, the limits, the Rift Ally, the rewards. */
export async function brief(n) {
  const s = D.save, L = LEVELS[n - 1], R = REGIONS[Math.floor((n - 1) / 10)], roster = stageRoster(n), P = s.progress[n], ref = stageMapRef(n);
  const box = el('div');
  box.innerHTML = `<button class="btn ghost close" data-k="x">✕</button><div class="dim cinzel">${escapeHtml(R.name)} · Stage ${n}${L.boss ? ' · BOSS' : L.lieutenant ? ' · LIEUTENANT' : L.warlord ? ' · WARLORD' : ''}</div><h2 class="cinzel">${escapeHtml(L.name)}</h2>
    <p class="dim" style="margin:4px 0 10px">${escapeHtml(L.blurb)}</p>
    <div class="brief"><div><div data-k="map"></div><div class="dim" style="font-size:12px;margin-top:4px">Battlefield: ${escapeHtml(MAPS[ref.map].name)}${ref.tf ? ' (turned)' : ''}</div></div>
    <div><div class="kv"><span>Waves</span><b>${L.waves} (${L.wave0 + 1}-${L.wave0 + L.waves} of ${TOTAL_WAVES})</b>
      <span>Deploy Limit</span><b>${deployLimit(n) + researchBonus(s).deploy}</b><span>Heart</span><b>${heartBase(n) + researchBonus(s).heart}</b>
      <span>Best</span><b>${P ? `${'★'.repeat(P.stars)}${'☆'.repeat(3 - P.stars)} · ${P.best}%` : 'not yet cleared'}</b>
      <span>First clear</span><b>${P?.clears ? '—' : `◆ ${40 + 2 * n + (L.boss ? 120 : L.lieutenant ? 40 : 0)}, gold ×2.5`}</b>
      ${resolveOf(s, n) ? `<span>Resolve</span><b style="color:#9ad0ff">+${Math.round(resolveOf(s, n) * 100)}% attack (after defeats)</b>` : ''}</div>
      <div style="margin-top:8px"><b class="cinzel" style="font-size:13px">The horde</b><div class="foes" data-k="foes"></div></div>
      <div style="margin-top:8px" data-k="ally"></div></div></div>
    <div class="seal-note" style="text-align:right">${seals(s) > 0 ? `Spends a Rift Seal (${seals(s)}/${SEAL_MAX}) for full rewards and trophy drops` : P?.clears ? 'No Rift Seals left: this battle pays a seventh of the gold, no shards or trophies' : 'No Rift Seals left, but a first clear always pays in full'}</div>
    <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn ghost" data-k="squad">Squad</button><button class="btn big green" data-k="go">Begin ▸</button></div>`;
  const m = modal(box, [], { wide: true });
  box.querySelector('[data-k=map]').appendChild(Object.assign(mapThumb(n, 420, 240), { className: 'map' }));
  box.querySelector('[data-k=x]').onclick = m.close;
  box.querySelector('[data-k=squad]').onclick = () => { m.close(); show('squad'); };
  box.querySelector('[data-k=go]').onclick = () => { m.close(); playStage(n); };
  const ally = stageAlly(n, s), a = box.querySelector('[data-k=ally]');
  a.innerHTML = `<b class="cinzel" style="font-size:13px">Rift Ally</b><div class="row" style="align-items:center"></div><div class="dim" style="font-size:12px">A guest hero for this stage, outside your Deploy Limit (Fantasica's Call Ally).</div>`;
  a.querySelector('.row').append(portrait(ally.look, 42, 56, { bust: true }), el('span', '', `${escapeHtml(ally.full)} · Lv ${ally.lvl}`));
  // monster previews
  const ids = Object.entries(roster).filter(([role]) => ROLES[role].from <= n || role === 'grunt').map(([role, list]) => [role, list[0]]);
  await loadMonsters(ids.map((x) => x[1])).catch(() => {});
  const foes = box.querySelector('[data-k=foes]');
  for (const [role, id] of ids) {
    if ((role === 'boss' && !L.boss) || (role === 'lieutenant' && !L.lieutenant) || !id) continue;
    const f = el('div', 'foe'), img = monsterImage(id, 'base', 120);
    if (img) { const i = new Image(); i.src = img.toDataURL(); f.appendChild(i); }
    f.insertAdjacentHTML('beforeend', `<span>${ROLES[role].name}${ROLES[role].air ? ' ✈' : ''}</span>`);
    foes.appendChild(f);
  }
}
