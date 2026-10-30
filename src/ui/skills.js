// Skill tree (spend points) and Skill Book (equip skills to the bar).
import { G } from '../state.js';
import { el, escapeHtml, fmtDmg } from '../core/util.js';
import { shownDmg, heroDmgLevel } from '../data/depth.js';
import { sfx } from '../core/audio.js';
import { UI, draggable } from './ui.js';
import { skillIcon, skillIconURL } from './icons.js';
import { CLASS_SKILLS, SKILLS, MAX_SKILL_LEVEL, describe, manaCost, rageCost, cooldown, ROW_LEVELS, effLevel } from '../data/skills.js';
import { CLASSES } from '../data/classes.js';
import { elem } from '../gfx/vfx.js';
import { SLOT_LABELS, freeSlot } from '../data/bar.js';
import { MAX_MASTERY, masteryNeed, masteryMul, masteryTier, TIER_NAMES } from '../game/augments.js';
import { AUGMENTS } from '../data/rings.js';
import { skillUp } from './skillup.js';

/** A skill's damage range on the shown scale of the hero's depth (data/depth.js). */
const skillDmg = (sk, L) => G.player.skillDamage(sk, L).map((v) => fmtDmg(shownDmg(v, heroDmgLevel(G.char))));

/** A skill's mastery: level, tier, an XP bar, its damage multiplier, and the ring augments on it. */
function masteryHtml(sk, compact) {
  const c = G.char, p = G.player, m = (c.mastery && c.mastery[sk.id]) || [1, 0];
  const M = m[0], pct = M >= MAX_MASTERY ? 100 : Math.min(100, (m[1] / masteryNeed(M)) * 100);
  const col = elem(sk.el).glow;
  let h = `<div class="mastery"><span>Mastery <b style="color:${col}">${M}</b>/${MAX_MASTERY} · ${TIER_NAMES[masteryTier(M)]}${compact ? '' : ` · x${masteryMul(M).toFixed(2)} damage`}</span><div class="mbar"><div style="width:${pct.toFixed(1)}%;background:${col}"></div></div></div>`;
  if (!compact) {
    h += '<div class="dim" style="font-size:12px">Skills gain mastery when cast and (more) when their hits kill. Each level adds power; at 25, 100, 250, 500, 750 and 1000 the effects grow bigger and wilder.</div>';
    const aug = p.augFor(sk);
    if (aug) h += `<div style="margin-top:4px;font-size:12px">Ring augments: ${Object.entries(aug).map(([id, pw]) => `<b style="color:${elem(AUGMENTS[id].el).glow}">${AUGMENTS[id].name}</b> <span class="dim">(${pw.toFixed(2)})</span>`).join(', ')}</div>`;
  }
  return h;
}

export { SLOT_LABELS };
let curTree = 0;
let selected = null;

export function canLearn(sk) {
  const c = G.char;
  const cur = c.skills[sk.id] || 0;
  if (c.skillPoints <= 0) return 'No skill points';
  if (cur >= MAX_SKILL_LEVEL) return 'Maxed';
  if (c.level < sk.reqLevel) return `Requires level ${sk.reqLevel}`;
  if (sk.prereq && !(c.skills[sk.prereq] > 0)) return `Requires ${SKILLS[sk.prereq].name}`;
  return null;
}

/** Points a click spends: Shift +5, Ctrl / Cmd / Alt as many as it takes (max level or no points left). */
export const clickPoints = (e) => (e && (e.ctrlKey || e.metaKey || e.altKey) ? Infinity : e && e.shiftKey ? 5 : 1);

/** Put up to `n` points into a skill (stops at its max level or when the points run out). */
export function learn(sk, n = 1) {
  const why = canLearn(sk);
  if (why) { UI.log(why, '#ff8080'); sfx('error'); return; }
  const c = G.char;
  const first = !c.skills[sk.id];
  for (let k = 0; k < n && !canLearn(sk); k++) { c.skills[sk.id] = (c.skills[sk.id] || 0) + 1; c.skillPoints--; }
  sfx('buff');
  skillUp(sk, c.skills[sk.id]);
  if (first) {
    const free = freeSlot(c.bar);
    if (free >= 0) { c.bar[free] = sk.id; UI.log(`<b>${escapeHtml(sk.name)}</b> assigned to slot ${SLOT_LABELS[free]}.`, '#ffd860'); }
  }
  G.player.recompute();
  UI.refresh();
  G.game.autosave();
}

export const respecCost = (lv) => 50 * lv * 2;

/** Refund every skill point (granted skills keep their free rank) for 100 gold x level. Mastery stays. */
export function respec() {
  const c = G.char, cost = respecCost(c.level);
  let refund = 0;
  for (const [id, lv] of Object.entries(c.skills)) {
    const keep = c.granted && c.granted[id] ? Math.min(1, lv) : 0;
    refund += lv - keep;
    if (keep) c.skills[id] = keep; else delete c.skills[id];
  }
  c.skillPoints += refund;
  c.gold -= cost;
  c.bar = c.bar.map((id) => (id && c.skills[id] > 0 ? id : null));
  if (!c.bar[0]) c.bar[0] = `${c.classId}.0.0`;
  sfx('buff');
  UI.log(`Skills reset: <b>${refund}</b> skill points refunded for ${cost.toLocaleString()} gold.`, '#ffd860');
  G.player.recompute();
  UI.refresh();
  G.game.autosave();
}

function respecDialog() {
  const c = G.char, cost = respecCost(c.level);
  const spent = Object.entries(c.skills).reduce((a, [id, lv]) => a + lv - (c.granted && c.granted[id] ? Math.min(1, lv) : 0), 0);
  if (!spent) { UI.log('No skill points to refund.', '#ff8080'); sfx('error'); return; }
  if (c.gold < cost) { UI.log(`Respec costs ${cost.toLocaleString()} gold.`, '#ff8080'); sfx('error'); return; }
  UI.confirm('Respec Skills', `Refund all <b>${spent}</b> spent skill points for <b class="gold-text">${cost.toLocaleString()} gold</b> (100 x level)? Skill mastery is kept.`, respec, 'Respec');
}

export function assign(slotIdx, skillId) {
  const c = G.char;
  const prev = c.bar.indexOf(skillId);
  if (prev >= 0 && prev !== slotIdx) c.bar[prev] = c.bar[slotIdx] || null;
  c.bar[slotIdx] = skillId;
  sfx('ui');
  UI.refresh();
  G.game.autosave();
}

export function skillDetail(sk) {
  const p = G.player, c = G.char;
  const box = el('div', 'skill-detail');
  if (!sk) { box.innerHTML = '<div class="dim">Select a skill to see what it does. Drag learned skills onto your skill bar, or use the buttons to assign them.</div>'; return box; }
  const base = c.skills[sk.id] || 0;
  const L = effLevel(p, sk);
  const E = elem(sk.el);
  const showL = Math.max(1, L);
  const dmg = skillDmg(sk, showL);
  const tags = [sk.kind, E.name, CLASSES[sk.classId].trees[sk.tree]].map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  let h = `<h3>${escapeHtml(sk.name)}</h3><div>${tags}</div>`;
  h += `<div class="dim" style="margin:4px 0">Level ${base}${L > base ? ` <span style="color:#8fb4ff">(+${L - base})</span>` : ''} / ${MAX_SKILL_LEVEL} · Requires character level ${sk.reqLevel}${sk.prereq ? ` · Requires ${escapeHtml(SKILLS[sk.prereq].name)}` : ''}</div>`;
  h += `<p style="margin:6px 0">${describe(sk, showL, dmg)}</p>`;
  const mc = manaCost(sk, showL), rc = rageCost(sk), cd = cooldown(sk);
  h += `<div class="dim">${rc ? 'Rage' : 'Mana'}: <b style="color:${rc ? '#ff9933' : '#8fb4ff'}">${rc || mc || (sk.classId === 'barbarian' && sk.kind === 'whirl' ? '10 to start · 10/s' : 'Free')}</b>${cd ? ` · Cooldown: <b>${(cd * (1 - p.st.cdr / 100)).toFixed(1)}s</b>` : ''}</div>`;
  if (base < MAX_SKILL_LEVEL) {
    const nd = skillDmg(sk, Math.max(1, L + 1));
    h += `<div class="dim" style="margin-top:4px;font-size:12px">Next level: ${nd[0]}–${nd[1]} damage, ${rageCost(sk) ? rageCost(sk) + ' Rage' : manaCost(sk, L + 1) + ' mana'}</div>`;
  }
  if (base) h += masteryHtml(sk);
  h += `<div class="dim" style="font-size:12px;margin-top:2px">Synergy: +3% damage per point in other ${escapeHtml(CLASSES[sk.classId].trees[sk.tree])} skills (now x${p.synergy(sk).toFixed(2)})</div>`;
  box.innerHTML = h;
  const row = el('div', 'row');
  row.style.marginTop = '8px';
  const why = canLearn(sk);
  const lb = el('button', 'btn small', base ? 'Upgrade (+1)' : 'Learn');
  lb.disabled = !!why;
  lb.title = why || 'Shift-click: +5 · Ctrl-click: as many as it takes';
  lb.onclick = (e) => learn(sk, clickPoints(e));
  row.appendChild(lb);
  // more at once: +5, and up to its max level (or as far as the points go)
  if (!why && c.skillPoints > 1) {
    const room = Math.min(c.skillPoints, MAX_SKILL_LEVEL - base);
    if (room >= 5) { const b5 = el('button', 'btn small', '+5'); b5.onclick = () => learn(sk, 5); row.appendChild(b5); }
    if (room > 1) { const bm = el('button', 'btn small', `Max (+${room})`); bm.title = 'As many points as it takes to max this skill, or all you have'; bm.onclick = () => learn(sk, room); row.appendChild(bm); }
  }
  if (why && why !== 'No skill points') row.appendChild(el('span', 'dim', why));
  box.appendChild(row);
  if (L > 0) {
    box.appendChild(el('div', 'dim', 'Assign to slot:'));
    const ar = el('div', 'assign-row');
    SLOT_LABELS.forEach((lab, i) => {
      const b = el('button', 'btn small' + (c.bar[i] === sk.id ? ' red' : ''), lab);
      b.onclick = () => assign(i, sk.id);
      ar.appendChild(b);
    });
    box.appendChild(ar);
  }
  return box;
}

function makeDrag(node, sk) {
  draggable(node, {
    key: 'skill:' + sk.id,
    data: () => ((G.char.skills[sk.id] || 0) > 0 ? { type: 'skill', id: sk.id } : null),
    icon: () => skillIconURL(sk),
    onClick: () => { selected = sk.id; sfx('ui'); UI.refresh(); },
    onDouble: (e) => learn(sk, clickPoints(e)),
    onRight: (e) => learn(sk, clickPoints(e)),
  });
}

export function renderTree(body) {
  const c = G.char;
  body.innerHTML = '';
  const C = CLASSES[c.classId];
  const head = el('div', 'row');
  head.style.justifyContent = 'space-between';
  head.innerHTML = `<span>Skill Points: <b class="gold-text" style="font-size:18px">${c.skillPoints}</b></span><span class="dim" style="font-size:12px">Click to inspect · double/right-click to learn (Shift +5, Ctrl max) · drag to the skill bar</span>`;
  const rb = el('button', 'btn small respec-btn', `Respec (${respecCost(c.level).toLocaleString()} gold)`);
  rb.title = 'Refund all spent skill points: 100 gold x level';
  if (c.gold < respecCost(c.level)) rb.style.opacity = '.45';
  rb.onclick = () => { sfx('ui'); respecDialog(); };
  head.appendChild(rb);
  body.appendChild(head);
  const tabs = el('div', 'tabs');
  C.trees.forEach((t, i) => {
    const pts = CLASS_SKILLS[c.classId].filter((s) => s.tree === i).reduce((a, s) => a + (c.skills[s.id] || 0), 0);
    const tb = el('div', 'tab' + (i === curTree ? ' active' : ''), `${escapeHtml(t)} <span class="dim">(${pts})</span>`);
    tb.onclick = () => { curTree = i; sfx('ui'); UI.refresh(); };
    tabs.appendChild(tb);
  });
  body.appendChild(tabs);
  const wrap = el('div', 'inv-wrap');
  const grid = el('div', 'tree');
  const skills = CLASS_SKILLS[c.classId].filter((s) => s.tree === curTree);
  for (const sk of skills) {
    const lv = c.skills[sk.id] || 0;
    const node = el('div', 'snode');
    node.style.gridColumn = sk.col + 1; node.style.gridRow = sk.row + 1;
    const icon = skillIcon(sk, 64);
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    cv.getContext('2d').drawImage(icon, 0, 0);
    node.appendChild(cv);
    const why = canLearn(sk);
    if (!lv && why && why !== 'No skill points') node.classList.add('locked');
    if (!why) node.classList.add('avail');
    if (lv) node.classList.add('has');
    if (selected === sk.id) node.classList.add('sel');
    if (sk.row > 0) node.appendChild(el('div', 'link'));
    node.appendChild(el('span', 'lvl', String(lv)));
    const M = lv && c.mastery && c.mastery[sk.id] ? c.mastery[sk.id][0] : 0;
    if (M > 1) node.appendChild(el('span', 'mlvl', String(M)));
    node.title = sk.name;
    makeDrag(node, sk);
    UI.tip(node, () => `<b style="color:#ffe2a0">${escapeHtml(sk.name)}</b><div class="dim">Level ${lv}/${MAX_SKILL_LEVEL} · Req. lvl ${sk.reqLevel}</div><div style="max-width:260px">${describe(sk, Math.max(1, effLevel(G.player, sk)), skillDmg(sk, Math.max(1, effLevel(G.player, sk))))}</div>`);
    grid.appendChild(node);
  }
  ROW_LEVELS.forEach((lv, r) => {
    const lab = el('div', 'tree-row-lbl', `Lv ${lv}`);
    lab.style.gridColumn = 1; lab.style.gridRow = r + 1;
    lab.style.position = 'relative'; lab.style.left = '-40px'; lab.style.alignSelf = 'center'; lab.style.pointerEvents = 'none';
    lab.style.width = '0'; lab.style.whiteSpace = 'nowrap';
    grid.appendChild(lab);
  });
  wrap.appendChild(grid);
  wrap.appendChild(skillDetail(selected && SKILLS[selected] && SKILLS[selected].tree === curTree ? SKILLS[selected] : selected ? SKILLS[selected] : null));
  body.appendChild(wrap);
}

export function renderBook(body) {
  const c = G.char, p = G.player;
  body.innerHTML = '';
  body.appendChild(el('div', 'dim', 'Your learned abilities. Drag one onto a skill bar slot (LMB, `, 1–9, 0, -, =, RMB) or tap it and choose a slot.'));
  const wrap = el('div', 'inv-wrap');
  const list = el('div', 'book-list');
  list.style.minWidth = 'min(420px, 90vw)';
  const learned = CLASS_SKILLS[c.classId].filter((s) => (c.skills[s.id] || 0) > 0);
  if (!learned.length) list.appendChild(el('div', 'dim', 'No skills learned yet.'));
  for (const sk of learned) {
    const L = effLevel(p, sk);
    const it = el('div', 'book-item');
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    cv.getContext('2d').drawImage(skillIcon(sk, 64), 0, 0);
    it.appendChild(cv);
    const slot = c.bar.indexOf(sk.id);
    const meta = el('div', 'meta', `<b>${escapeHtml(sk.name)}</b> <span class="dim">Lv ${L}${slot >= 0 ? ` · [${SLOT_LABELS[slot]}]` : ''}</span>${masteryHtml(sk, true)}<p>${describe(sk, L, skillDmg(sk, L))}</p>`);
    it.appendChild(meta);
    if (selected === sk.id) it.style.borderColor = '#ffe2a0';
    makeDrag(it, sk);
    list.appendChild(it);
  }
  wrap.appendChild(list);
  wrap.appendChild(skillDetail(selected ? SKILLS[selected] : null));
  body.appendChild(wrap);
}

export function toggleTree() {
  if (UI.isOpen('tree')) UI.closePanel('tree');
  else UI.openPanel('tree', 'Skill Tree', renderTree);
}
export function toggleBook() {
  if (UI.isOpen('book')) UI.closePanel('book');
  else UI.openPanel('book', 'Skill Book', renderBook);
}
