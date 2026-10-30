// A stage, start to finish: the opening dialogs, the battle (HUD, deploy tray, posts, Empower/Retreat, Bastion works,
// speed and AUTO), the closing dialogs and the result. Fantasica's flow: tap a hero, tap a post, confirm.
import { D, save } from '../state.js';
import { el, escapeHtml, clamp, fmt } from '../core/util.js';
import { LEVELS, REGIONS, TOTAL_WAVES } from '../data/campaign.js';
import { CARDS } from '../data/cards.js';
import { startStage, finishStage, regionOf, resolveOf } from '../meta/progress.js';
import { STEP, BASTION } from '../battle/sim.js';
import { autoBattle } from '../battle/autoplay.js';
import { BattleView } from '../battle/render.js';
import { loadHeroArt } from '../art/heroart.js';
import { loadMonsters } from '../art/monsterart.js';
import { stageRoster } from '../data/waves.js';
import { portrait } from './portrait.js';
import { playStageDialogs } from './dialog.js';
import { show, toast, modal } from './app.js';
import { sfx, preloadSfx, preloadPiano, playAmbience, playMusic } from '../core/audio.js';
import { ART } from '../core/assets.js';
import { startMode, finishMode, bestWave } from '../meta/modes.js';
import { seals } from '../meta/seals.js';

const SKILL_NAMES = {};
let ctl = null;
export const battleActive = () => !!ctl;

/** Begin stage n: load its art, play the opening scene, then fight. */
export async function playStage(n, opts = {}) {
  const s = D.save, L = LEVELS[n - 1], R = regionOf(n);
  const ui = document.getElementById('ui');
  ui.innerHTML = `<div class="screen full" style="display:grid;place-items:center;background:radial-gradient(#0c1638,#05060c 70%)"><div style="text-align:center"><div class="cinzel" style="font-size:14px;color:#8aa0d0">${escapeHtml(R.name)} · Stage ${n}</div><h1 class="cinzel" style="color:#ffdf9a;margin:6px 0">${escapeHtml(L.name)}</h1><div class="dim">Opening the rift…</div></div></div>`;
  const b = startStage(s, n);
  await enter(b, { n, L, R, arts: Object.values(stageRoster(n)).flat(), auto: opts.auto });
  await playStageDialogs(n, 'begin', { title: `Stage ${n} · ${L.name}` });
  if (!ctl) return;
  begin('QUEST START');
}
/** Begin a side mode (modes.js): no dialogs; endless runs load each new wave's monsters as it is made. */
export async function playMode(id) {
  const s = D.save, r = startMode(s, id);
  if (!r) { toast('No runs left today'); return false; }
  const { b, m, n } = r, R = REGIONS[Math.floor((n - 1) / 10)], ui = document.getElementById('ui');
  ui.innerHTML = `<div class="screen full" style="display:grid;place-items:center;background:radial-gradient(#0c1638,#05060c 70%)"><div style="text-align:center"><div class="cinzel" style="font-size:14px;color:#8aa0d0">${escapeHtml(R.name)} · ${m.kind === 'endless' ? 'Endless' : 'Challenge'}</div><h1 class="cinzel" style="color:#ffdf9a;margin:6px 0">${m.icon} ${escapeHtml(m.name)}</h1><div class="dim">${b.sealed ? 'Opening the rift…' : 'No Rift Seal: a training run, small rewards'}</div></div></div>`;
  if (b.more) { const more = b.more; b.more = (i) => { const w = more(i); loadMonsters(w.groups.map((g) => g.art)).catch(() => {}); return w; }; }
  const L = { ...LEVELS[n - 1], name: m.name, wave0: 0 };
  await enter(b, { n, L, R, m, arts: b.waves.flatMap((w) => w.groups.map((g) => g.art)) });
  begin(m.kind === 'endless' ? 'HOLD THE LINE' : 'CHALLENGE');
  return true;
}
async function enter(b, { n, L, R, m = null, arts, auto }) {
  const s = D.save;
  await Promise.all([
    ...[...new Set(b.squad.map((d) => d.cls))].map((c) => loadHeroArt(c).catch(() => {})),
    loadMonsters(arts).catch(() => {}),
  ]);
  preloadSfx();
  if (b.squad.some((d) => d.cls === 'bard')) preloadPiano();
  const view = new BattleView(document.getElementById('bf'));
  await view.setup(b, R.id);
  playMusic(null); playAmbience(view.theme.amb, 0.55);
  ctl = { n, b, view, L, R, mode: m, sel: null, slot: null, preview: null, speed: s.settings.speed || 1, paused: true, acc: 0, done: false, auto: !!auto || s.settings.autoBattle };
  document.getElementById('ui').innerHTML = '';
  view.fit();
}
function begin(banner) {
  buildHud();
  ctl.paused = false;
  ctl.view.banner(banner, '#ffdf9a');
  sfx('portcullis_gate', 0.6);
}

// ------------------------------------------------------------------ per frame (called by main.js)
export function battleFrame(dt) {
  if (!ctl) return;
  const { b, view } = ctl;
  if (!ctl.paused && !b.done) {
    ctl.acc += dt * ctl.speed;
    let n = 0;
    while (ctl.acc >= STEP && n++ < 12) { if (ctl.auto) autoBattle(b, STEP); b.step(STEP); ctl.acc -= STEP; }
    if (n >= 12) ctl.acc = 0;
  }
  view.update(ctl.paused ? 0 : dt * Math.min(ctl.speed, 2));
  view.draw();
  if (D.frame % 6 === 0) updateHud();
  if (b.done && !ctl.done) { ctl.done = true; setTimeout(() => endBattle(), 1400); }
}

// ------------------------------------------------------------------ HUD
function buildHud() {
  const ui = document.getElementById('ui'), { b, L, n } = ctl;
  ui.innerHTML = '';
  const top = el('div', 'bhud-top');
  top.innerHTML = `<div class="bh-box bh-stage"><span class="n">${ctl.mode ? ctl.mode.icon : n + '.'} ${escapeHtml(L.name)}</span><span class="w" data-k="wave"></span></div>
    <div class="bh-box bh-heart" data-k="heart"></div>
    <div class="bh-box bh-valor"><div class="lbl"><span>VALOR</span><b data-k="valor"></b></div><div class="bar"><i data-k="vbar"></i></div></div>
    <div class="bh-box" data-k="foes" title="Monsters left"></div>
    <div class="bh-sp"><button class="bh-btn" data-sp="1">1×</button><button class="bh-btn" data-sp="2">2×</button><button class="bh-btn" data-sp="3">3×</button>
      <button class="bh-btn auto" data-k="auto">AUTO</button><button class="bh-btn" data-k="pause">❚❚</button></div>`;
  ui.appendChild(top);
  top.querySelectorAll('[data-sp]').forEach((x) => x.onclick = () => { ctl.speed = +x.dataset.sp; D.save.settings.speed = ctl.speed; save(); updateHud(true); });
  top.querySelector('[data-k=auto]').onclick = () => { ctl.auto = !ctl.auto; D.save.settings.autoBattle = ctl.auto; save(); toast(ctl.auto ? 'Auto-battle: deploying, empowering and building on its own' : 'Auto-battle off'); updateHud(true); };
  top.querySelector('[data-k=pause]').onclick = pauseMenu;
  const boss = el('div', 'bossbar hidden'); boss.innerHTML = '<div class="nm"></div><div class="bar"><i></i></div>'; ui.appendChild(boss);
  const call = el('button', 'btn blue callwave hidden', 'Call next wave'); call.onclick = () => { const v = b.callWave(); if (v) toast(`+${v} Valor for calling the wave early`); }; ui.appendChild(call);
  const bot = el('div', 'bhud-bot');
  const works = el('div', 'works');
  for (const [k, w] of Object.entries(BASTION)) { const x = el('button', 'work'); x.dataset.w = k; x.onclick = () => { if (b.buyBastion(k)) { toast(`${w.name} raised`); sfx('firebuff', 0.6); } else sfx('sword_blocked', 0.3); updateHud(true); }; works.appendChild(x); }
  bot.appendChild(works);
  const tray = el('div', 'tray');
  b.squad.forEach((d, i) => {
    const c = el('div', 'tcard' + (d.ally ? ' ally' : ''));
    c.dataset.slot = i;
    c.appendChild(portrait(d.look, 70, 98, { bust: true }));
    c.insertAdjacentHTML('beforeend', `<div class="cost">${d.cost}</div><div class="nm">${escapeHtml(d.name)}</div><div class="cd hidden"></div>`);
    c.onclick = () => pickSlot(i);
    tray.appendChild(c);
  });
  bot.appendChild(tray);
  ui.appendChild(bot);
  const panel = el('div', 'unit-panel panel hidden'); ui.appendChild(panel);
  ctl.hud = { top, boss, call, works, tray, panel };
  // canvas input: a tap acts, a drag pans, two fingers pinch, the wheel zooms, a double tap/click fits the field again
  const cv = document.getElementById('bf'), pts = new Map();
  let drag = null, pinch = null, lastTap = 0;
  const two = () => { const [a, c] = [...pts.values()]; return { d: Math.hypot(a[0] - c[0], a[1] - c[1]) || 1, mx: (a[0] + c[0]) / 2, my: (a[1] + c[1]) / 2 }; };
  cv.onpointerdown = (e) => {
    cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { pinch = two(); drag = null; } else if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false };
  };
  cv.onpointermove = (e) => {
    const prev = pts.get(e.pointerId);
    if (prev) {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size >= 2) { const p = two(); ctl.view.zoomBy(p.d / pinch.d, p.mx, p.my); ctl.view.panBy(p.mx - pinch.mx, p.my - pinch.my); pinch = p; return; }
      if (drag && !drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true;
      if (drag?.moved) { ctl.view.panBy(e.clientX - prev[0], e.clientY - prev[1]); return; }
    }
    if (e.pointerType !== 'mouse' || ctl.slot === null) return;
    const p = ctl.view.postAt(e.clientX, e.clientY); setPreview(p && b.postFree(p.id) ? p : null);
  };
  const up = (e) => {
    const had = pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) pinch = null; drag = null; return; }
    if (had && drag && !drag.moved && e.type === 'pointerup') {
      if (performance.now() - lastTap < 300 && !ctl.slot && !ctl.view.postAt(e.clientX, e.clientY)) ctl.view.resetView();
      else onTap(e.clientX, e.clientY, e.pointerType);
      lastTap = performance.now();
    }
    drag = null;
  };
  cv.onpointerup = cv.onpointercancel = up;
  cv.onwheel = (e) => { e.preventDefault(); ctl.view.zoomBy(Math.exp(-clamp(e.deltaY, -120, 120) * 0.0018), e.clientX, e.clientY); };
  updateHud(true);
}
function pickSlot(i) {
  const { b } = ctl, u = b.deployed(i);
  if (u) { selectUnit(u); return; }
  const why = b.canDeploy(i);
  if (why && why !== 'not enough Valor') { toast(why[0].toUpperCase() + why.slice(1)); sfx('sword_blocked', 0.3); return; }
  ctl.slot = ctl.slot === i ? null : i; ctl.sel = null; ctl.view.sel = null;
  ctl.view.highlight = ctl.slot !== null ? true : null;
  setPreview(null);
  sfx('lock_unlock', 0.3);
  updateHud(true);
}
function setPreview(p) {
  ctl.preview = p;
  ctl.view.deployPreview = p && ctl.slot !== null ? { post: p, def: ctl.b.squad[ctl.slot] } : null;
  ctl.view.highlight = ctl.slot !== null ? (p || true) : null;
}
function onTap(x, y, type) {
  const { b, view } = ctl;
  const p = view.postAt(x, y);
  if (ctl.slot !== null) {
    if (p && b.postFree(p.id)) {
      if (type === 'mouse' || ctl.preview === p) return deployAt(p); // touch: first tap previews, second confirms
      setPreview(p); updateHud(true); return;
    }
    ctl.slot = null; setPreview(null); updateHud(true); return;
  }
  const u = view.unitAt(x, y) || (p && b.units.find((q) => q.post === p));
  if (u) return selectUnit(u);
  if (p && b.postFree(p.id)) return postPicker(p);
  ctl.sel = null; view.sel = null; updateHud(true);
}
function deployAt(p) {
  const { b } = ctl, slot = ctl.slot, why = b.canDeploy(slot, p.id);
  if (why) { toast(why[0].toUpperCase() + why.slice(1)); sfx('sword_blocked', 0.3); return; }
  b.deploy(slot, p.id);
  ctl.slot = null; setPreview(null); updateHud(true);
}
/** Fantasica's "Deploy Unit": tap an empty post, pick from the heroes you can afford. */
function postPicker(p) {
  const { b } = ctl, box = el('div');
  box.innerHTML = `<h2>Deploy a hero</h2><div class="dim">Post ${p.raised ? '(raised: +range)' : ''} · Valor ${Math.floor(b.valor)}</div>`;
  const row = el('div', 'row'); row.style.marginTop = '10px';
  b.squad.forEach((d, i) => {
    if (b.deployed(i)) return;
    const why = b.canDeploy(i, p.id), c = el('div', 'tcard' + (why ? ' poor' : ''));
    c.appendChild(portrait(d.look, 70, 98, { bust: true }));
    c.insertAdjacentHTML('beforeend', `<div class="cost">${d.cost}</div><div class="nm">${escapeHtml(d.name)}</div>`);
    c.onclick = () => { if (why) { toast(why); return; } m.close(); ctl.slot = i; deployAt(p); };
    row.appendChild(c);
  });
  box.appendChild(row);
  const m = modal(box, [{ label: 'Cancel', cls: 'ghost' }]);
}
function selectUnit(u) { ctl.sel = u; ctl.view.sel = u; ctl.slot = null; setPreview(null); updateHud(true); }

function updateHud(force) {
  if (!ctl?.hud) return;
  const { b, hud, L } = ctl;
  const q = (k) => hud.top.querySelector(`[data-k=${k}]`);
  const wave = Math.max(1, Math.min(b.waveI, b.waves.length)), M = ctl.mode;
  q('wave').textContent = !M ? `Wave ${wave}/${b.waves.length} · ${L.wave0 + wave} of ${TOTAL_WAVES}` : M.kind === 'endless' ? `Wave ${wave} · best ${bestWave(D.save, M.id)}${b.mutations ? ` · ${b.mutations} mutation${b.mutations > 1 ? 's' : ''}` : ''}` : `Wave ${wave}/${b.waves.length}`;
  q('heart').innerHTML = `❤ ${b.heart}/${b.heartMax}`;
  q('valor').textContent = `${Math.floor(b.valor)} / ${b.valorCap}`;
  q('vbar').style.width = (b.valor / b.valorCap * 100).toFixed(1) + '%';
  q('foes').textContent = `☠ ${b.monsters.length + b.queue.length} · ${b.kills} slain`;
  hud.top.querySelectorAll('[data-sp]').forEach((x) => x.classList.toggle('on', +x.dataset.sp === ctl.speed));
  q('auto').classList.toggle('on', ctl.auto);
  const boss = b.monsters.find((m) => m.boss || m.lt);
  hud.boss.classList.toggle('hidden', !boss);
  if (boss) { const nm = ART.byId[boss.art]?.name || ''; hud.boss.querySelector('.nm').textContent = boss.boss ? (!ctl.mode && ctl.R.bossTitle) || nm : (boss.role === 'warlord' ? 'Warlord · ' : 'Lieutenant · ') + nm; hud.boss.querySelector('i').style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + '%'; }
  hud.call.classList.toggle('hidden', !(b.waveDone && b.waveI < b.waves.length && b.nextWaveAt - b.t > 1.5));
  if (!hud.call.classList.contains('hidden')) hud.call.textContent = `Call next wave (+${Math.round(b.nextWaveAt - b.t)} Valor)`;
  for (const x of hud.works.children) {
    const k = x.dataset.w, w = BASTION[k], c = b.bastionCost(k), lv = b.works[k];
    x.innerHTML = `${w.name} ${'●'.repeat(lv)}${'○'.repeat(w.costs.length - lv)}<span class="c">${c === Infinity ? 'MAX' : c}</span><small>${w.text}</small>`;
    x.disabled = c === Infinity || b.valor < c; x.style.opacity = x.disabled ? 0.55 : 1;
  }
  for (const c of hud.tray.children) {
    const i = +c.dataset.slot, d = b.squad[i], u = b.deployed(i), cd = b.cooldown[i];
    c.classList.toggle('out', !!u); c.classList.toggle('sel', ctl.slot === i || (ctl.sel && ctl.sel.slot === i));
    c.classList.toggle('poor', !u && (b.valor < d.cost || (!d.ally && b.units.filter((x) => !x.def.ally).length >= b.deployLimit)));
    const cdd = c.querySelector('.cd'); cdd.classList.toggle('hidden', !(cd > 0)); if (cd > 0) cdd.textContent = Math.ceil(cd);
  }
  // the selected hero's panel
  const u = ctl.sel && b.units.includes(ctl.sel) ? ctl.sel : null, P = hud.panel;
  if (!u && ctl.sel) { ctl.sel = null; ctl.view.sel = null; }
  if (ctl.slot !== null && ctl.preview) {
    const d = b.squad[ctl.slot];
    P.classList.remove('hidden');
    P.innerHTML = `<b>${escapeHtml(d.full)}</b><div class="dim">Deploy here for ${d.cost} Valor?</div><div class="row" style="margin-top:6px"><button class="btn green" data-k="ok">Deploy ✓</button><button class="btn ghost" data-k="no">✕</button></div>`;
    P.querySelector('[data-k=ok]').onclick = () => deployAt(ctl.preview);
    P.querySelector('[data-k=no]').onclick = () => { ctl.slot = null; setPreview(null); updateHud(true); };
  } else if (u) {
    const ec = b.empowerCost(u);
    if (force || P.dataset.u !== String(u.id) || D.frame % 30 === 0) {
      P.dataset.u = u.id; P.classList.remove('hidden');
      P.innerHTML = `<div class="up-h"></div><div class="statgrid" style="margin:6px 0"><div>ATK<b>${fmt(b.atkOf(u))}</b></div><div>SPD<b>${(1 / b.rateOf(u)).toFixed(2)}/s</b></div><div>RNG<b>${b.rangeOf(u).toFixed(1)}</b></div></div>
        <div class="dim" style="font-size:12px">${escapeHtml(u.def.skill.name)}: ${Math.min(100, Math.round(u.charge / u.def.skill.charge * 100))}% · ${u.kills} kills</div>
        <div class="row" style="margin-top:6px"><button class="btn" data-k="emp" ${ec === Infinity || b.valor < ec ? 'disabled' : ''}>${ec === Infinity ? 'MAX' : `Empower ${ec}`}</button><button class="btn red" data-k="ret">Retreat +${Math.floor(u.def.cost / 2)}</button></div>`;
      const h = P.querySelector('.up-h');
      h.appendChild(portrait(u.def.look, 54, 72, { bust: true }));
      h.insertAdjacentHTML('beforeend', `<div><b>${escapeHtml(u.def.full)}</b><div class="stars">Battle Lv ${u.lvl}/5</div><div class="dim" style="font-size:11px">Empowering lasts this battle only</div></div>`);
      P.querySelector('[data-k=emp]').onclick = () => { if (b.empower(u)) sfx('firebuff', 0.5); updateHud(true); };
      P.querySelector('[data-k=ret]').onclick = () => { b.retreat(u); ctl.sel = null; ctl.view.sel = null; updateHud(true); };
    }
  } else P.classList.add('hidden');
}

function pauseMenu() {
  ctl.paused = true;
  const endless = ctl.mode?.kind === 'endless';
  modal(`<h2>Paused</h2><p class="dim">${ctl.mode ? escapeHtml(ctl.mode.name) : `Stage ${ctl.n} · ${escapeHtml(ctl.L.name)}`}</p>${endless ? '<p class="dim">Ending the run pays for every wave held.</p>' : ''}`, [
    { label: endless ? 'End the run' : 'Retreat from battle', cls: 'red', fn: () => { ctl.b.heart = 0; ctl.b.finish(false); ctl.paused = false; } },
    { label: 'Resume', cls: 'green', fn: () => { ctl.paused = false; } },
  ], { onClose: () => { ctl && (ctl.paused = false); }, sticky: false });
}

// ------------------------------------------------------------------ the end
async function endBattle() {
  const { b, n, L, mode } = ctl, s = D.save;
  const res = mode ? finishMode(s, mode, b) : finishStage(s, n, b);
  save(true);
  document.getElementById('ui').innerHTML = '';
  const endless = mode?.kind === 'endless';
  ctl.view.banner(endless ? `${res.held} WAVES HELD` : b.won ? (b.stars === 3 ? 'COMPLETE VICTORY!' : 'QUEST CLEAR') : 'THE HEART BREAKS', b.won || endless ? '#ffdf9a' : '#ff5040');
  sfx(b.won || (endless && res.held) ? 'chest_open' : 'sword_blocked', 0.8);
  await new Promise((r) => setTimeout(r, 1600));
  if (b.won && !mode) await playStageDialogs(n, 'end', { title: `Stage ${n} · ${L.name}` });
  if (!ctl) return;
  resultScreen(res);
}
const lootRow = (res) => `<div class="loot"><div class="cur gold"><i>◉</i>+${fmt(res.gold)}</div><div class="cur shard"><i>◆</i>+${fmt(res.shards)}</div><div class="cur essence"><i>✧</i>+${fmt(res.essence)}</div>
  ${res.tickets ? `<div class="cur ticket"><i>🎟</i>+${res.tickets}</div>` : ''}${res.legend ? `<div class="cur ticket legend"><i>🎟</i>+${res.legend} Legend</div>` : ''}${res.first ? '<div class="cur"><b style="color:#9ad0ff">FIRST CLEAR</b></div>' : ''}</div>
  ${res.trophies?.length ? `<div class="trophy-drops">${res.trophies.map((t) => `<span class="${t.dup ? 'dim' : ''}">🏆 ${escapeHtml(t.card.name)}${t.dup ? ' (dupe: essence)' : ' <b>NEW</b>'}</span>`).join('')}</div>` : ''}`;
function resultScreen(res) {
  const { b, n, L, mode } = ctl, s = D.save, ui = document.getElementById('ui');
  const pct = Math.round((b.pct || 0) * 100), endless = mode?.kind === 'endless';
  const title = endless ? `${res.held} waves held` : b.won ? (b.stars === 3 ? 'Complete Victory!' : 'Quest Clear') : 'Defeat';
  const seal = res.sealed === false || b.sealed === false ? `<div class="seal-note">No Rift Seal: ${mode ? 'a training run paid a fraction' : 'only a seventh of the gold'}. Seals refill one every 30 minutes (${seals(s)} now).</div>` : '';
  const box = el('div', 'modal-bg');
  box.innerHTML = `<div class="modal result">
    <div class="dim cinzel">${mode ? `${mode.icon} ${escapeHtml(mode.name)}` : `Stage ${n} · ${escapeHtml(L.name)}`}</div>
    <h1 class="cinzel" style="color:${b.won || endless ? '#ffdf9a' : '#ff6a50'}">${title}</h1>
    ${endless ? `<div class="dim">Best: ${bestWave(s, mode.id)} waves${b.mutations ? ` · ${b.mutations} mutations (+${b.mutations * 15}% pay)` : ''}</div>` : `<div class="big-stars">${[1, 2, 3].map((k) => `<span class="${k <= b.stars ? '' : 'off'}">★</span>`).join('')}</div>`}
    <div class="dim">Enemy ${pct}% destroyed · ${b.kills} slain · ${b.leaked} reached the Heart${mode ? '' : ` · waves ${L.wave0 + 1}-${L.wave0 + L.waves} of ${TOTAL_WAVES}`}</div>
    ${lootRow(res)}${seal}
    ${res.recruit ? `<div class="panel" style="margin:8px auto;max-width:420px"><b style="color:#ffdf9a">${escapeHtml(res.recruit.name)}</b> joins the Bastion! <div class="dim">Their Rift Card is in your collection and squad.</div></div>` : ''}
    ${!b.won && !mode ? `<div class="dim" style="margin:8px 0">Bastion's Resolve: your heroes strike ${Math.round(resolveOf(s, n) * 100)}% harder here until you win. Level heroes, ascend them with essence, equip gear, or play the Modes for more.</div>` : ''}
    <div class="row" style="justify-content:center;margin-top:12px" data-k="btns"></div></div>`;
  ui.appendChild(box);
  const btns = box.querySelector('[data-k=btns]');
  const go = (fn) => { leaveBattle(); fn(); };
  const add = (label, cls, fn) => { const x = el('button', 'btn ' + cls, label); x.onclick = () => go(fn); btns.appendChild(x); };
  if (mode) {
    add('Again', 'big green', async () => { if (!(await playMode(mode.id))) show('modes'); });
    add('Modes', 'ghost', () => show('modes'));
  } else {
    if (b.won && n < LEVELS.length) add(`Next: Stage ${n + 1} ▸`, 'big green', () => playStage(n + 1));
    add('Retry', 'blue', () => playStage(n));
    add('Campaign', 'ghost', () => show('campaign', { region: Math.floor((n - 1) / 10) }));
  }
  add('Bastion', 'ghost', () => show('hub'));
}
export function leaveBattle() {
  if (!ctl) return;
  const cv = document.getElementById('bf');
  cv.onpointermove = cv.onpointerdown = cv.onpointerup = cv.onpointercancel = cv.onwheel = null;
  ctl = null;
  playAmbience(null);
}
export const battleCtl = () => ctl;
