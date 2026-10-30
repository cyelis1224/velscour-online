// Rift Cards: every card (owned ones in colour), and a hero's sheet where gear cards build the character.
import { D, save } from '../state.js';
import { el, escapeHtml, fmt } from '../core/util.js';
import { CARDS, POOLS, TYPES, SLOTS } from '../data/cards.js';
import { KITS, RARITIES, CLASS_IDS } from '../data/kits.js';
import { ART } from '../core/assets.js';
import { unitDef, levelCap, trophyBonus } from '../meta/power.js';
import { levelUp, canLevel, levelUpCost, ascend, canAscend, ascendNeed, wearable, equip, autoEquip, canRefine, refine, refineNeed, salvage, freeCopies, wornCount } from '../meta/upgrade.js';
import { SALVAGE, TROPHY_CAP, MAX_STARS } from '../data/cards.js';
/** Five stars, awakened ones (6-10) crimson. */
export const starRow = (st) => { const aw = Math.max(0, st - 5); return `<span class="awk">${'★'.repeat(aw)}</span>${'★'.repeat(Math.min(5, st) - aw)}<span style="opacity:.25">${'★'.repeat(5 - Math.min(5, st))}</span>`; };
import { heroDot } from '../meta/badges.js';
import { show, modal, toast, refresh, refreshChrome } from './app.js';
import { cardView, tilt } from './cardview.js';
import { renderCard, ensureCardArt } from '../cards/cardart.js';
import { inspectCard } from '../cards/pack3d.js';
import { sfx } from '../core/audio.js';

const state = { type: 'hero', cls: 'all', owned: true };
export function render(root) {
  const s = D.save, tabs = el('div', 'tabs');
  const newOf = (t) => s.newCards.some((id) => CARDS[id]?.type === t);
  for (const t of Object.keys(TYPES)) {
    const b = el('button', 'tab' + (state.type === t ? ' on' : '') + (newOf(t) ? ' dot' : ''), t === 'trophy' ? 'Trophies' : TYPES[t] + 's');
    b.onclick = () => { state.type = t; refresh(); };
    tabs.appendChild(b);
  }
  const cls = el('select', 'tab'); cls.innerHTML = `<option value="all">All classes</option>` + CLASS_IDS.map((c) => `<option value="${c}" ${state.cls === c ? 'selected' : ''}>${ART.classes[c].name}</option>`).join('');
  cls.onchange = () => { state.cls = cls.value; refresh(); };
  const own = el('button', 'tab' + (state.owned ? ' on' : ''), state.owned ? 'Owned' : 'All cards'); own.onclick = () => { state.owned = !state.owned; refresh(); };
  tabs.append(cls, own);
  root.appendChild(tabs);
  const pool = POOLS[state.type].filter((c) => (state.cls === 'all' || !c.cls || c.cls === state.cls) && (!state.owned || s.cards[c.id]?.n > 0));
  pool.sort((a, b) => b.rarity - a.rarity || (a.cls || '').localeCompare(b.cls || '') || a.name.localeCompare(b.name));
  const owned = POOLS[state.type].filter((c) => s.cards[c.id]?.n > 0).length;
  root.insertAdjacentHTML('beforeend', `<div class="dim" style="margin-bottom:8px">${owned} of ${POOLS[state.type].length} ${TYPES[state.type].toLowerCase()} cards collected${state.type === 'hero' ? ' · tap a hero to level, ascend and equip' : state.type === 'trophy' ? ' · dropped by monsters in battles fought with a Rift Seal, and found in Bestiary packs' : ' · essence refines gear (up to +5); spare copies salvage into essence'}</div>`);
  if (state.type === 'trophy') { const tb = trophyBonus(s), fam = Object.entries(tb).sort((a, b) => b[1] - a[1]); root.insertAdjacentHTML('beforeend', `<div class="trophy-sum">${fam.length ? fam.map(([a, v]) => `<span class="${v >= TROPHY_CAP ? 'maxed' : ''}">${escapeHtml(a)} +${+(v * 100).toFixed(1)}%</span>`).join('') : '<span class="dim">No trophies yet: each adds damage against its monster family, up to +25%.</span>'}</div>`); }
  const grid = el('div', 'cards');
  for (const c of pool.slice(0, 400)) {
    const e = s.cards[c.id], isNew = s.newCards.includes(c.id);
    const stats = c.type === 'hero' && e ? unitDef(c.id.slice(2), s) : null;
    grid.appendChild(cardView(c, { entry: e, stats, owned: !!(e && e.n > 0), count: c.type !== 'hero' ? e?.n : 0, isNew, dot: c.type === 'hero' && e?.n > 0 && heroDot(s, c.id.slice(2)),
      onClick: () => { if (c.type === 'hero' && e?.n > 0) show('hero', { id: c.id.slice(2) }); else gearInfo(c); } }));
  }
  root.appendChild(grid);
  // what was seen is no longer new
  if (s.newCards.length) { s.newCards = s.newCards.filter((id) => CARDS[id]?.type !== state.type); save(); setTimeout(refreshChrome, 50); }
}

function gearInfo(c) {
  const s = D.save, e = s.cards[c.id], box = el('div');
  box.innerHTML = `<h2>${escapeHtml(c.name)}</h2><div class="dim">${RARITIES[c.rarity].name} ${TYPES[c.type]}${c.cls ? ' · ' + ART.classes[c.cls].name + ' only' : ' · any hero'}</div>
    <div style="display:grid;grid-template-columns:200px 1fr;gap:12px;margin-top:10px"><div data-k="card"></div><div><p>${escapeHtml(c.text)}</p><p class="dim"><i>${escapeHtml(c.flavor || '')}</i></p>
    ${c.type === 'trophy' ? (e?.n > 0 ? `<p>Your ${escapeHtml(c.arch)} trophies: <b>+${+((trophyBonus(s)[c.arch] || 0) * 100).toFixed(1)}%</b> of +${TROPHY_CAP * 100}%.</p>` : '<p class="dim">Not taken yet: it drops from this monster in battles fought with a Rift Seal, or comes in a Bestiary pack.</p>')
      : e?.n > 0 ? `<p>Copies: <b>${e.n}</b> · worn: ${wornCount(s, c.id)} · refine <b>+${e.refine || 0}</b>/5 (each +10% to its bonuses)</p>` : '<p class="dim">Not owned yet: summon gear at the Altar.</p>'}</div></div>`;
  box.querySelector('[data-k=card]').appendChild(cardView(c, { entry: e, scale: 0.5 }));
  const btns = [{ label: 'Inspect in 3D', cls: 'blue', fn: () => inspectCard(c, e) }];
  if (e?.n > 0 && c.type !== 'trophy' && (e.refine || 0) < 5) btns.push({ label: `Refine to +${(e.refine || 0) + 1} · ${fmt(refineNeed(s, c.id))}✧`, cls: canRefine(s, c.id) ? 'green' : '', keep: !canRefine(s, c.id), fn: () => { if (!refine(s, c.id)) { toast('Not enough essence'); return; } sfx('firebuff', 0.6); toast('Refined'); save(); refresh(); } });
  const spare = e?.n > 0 && c.type !== 'trophy' ? freeCopies(s, c.id) - (wornCount(s, c.id) ? 0 : 1) : 0;
  if (spare > 0) btns.push({ label: `Salvage ${spare} spare · +${spare * SALVAGE[c.rarity]}✧`, cls: 'blue', fn: () => { const got = salvage(s, c.id); sfx('chest_close', 0.6); toast(`+${got} essence`); save(); refresh(); } });
  btns.push({ label: 'Close', cls: 'ghost' });
  modal(box, btns);
}

// ------------------------------------------------------------------ a hero's sheet
export const heroScreen = {
  render(root, { id }) {
    const s = D.save, card = CARDS['h:' + id], e = s.cards['h:' + id], d = unitDef(id, s), kit = KITS[card.cls];
    root.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn ghost" data-k="back">◂ Cards</button><button class="btn ghost" data-k="squad">Squad</button></div>
      <div class="hero-detail"><div><div data-k="big"></div><button class="btn blue" style="width:100%;margin-top:8px" data-k="i3d">Inspect in 3D ✦</button></div>
      <div><h2 class="cinzel" style="margin:0;color:#ffdf9a">${escapeHtml(card.name)}</h2><div class="dim">${escapeHtml(card.title)} · ${RARITIES[card.rarity].name} ${ART.classes[card.cls].name} (${kit.role})</div>
        <div class="stars" style="font-size:20px;margin:4px 0">${starRow(e.stars)}${e.stars > 5 ? ` <small class="awk">Awakened ${e.stars - 5}</small>` : ''} <span class="dim" style="font-size:14px">Lv ${e.lvl}/${levelCap(e, id)} · Power ${fmt(d.power)}</span></div>
        <div class="statgrid"><div>ATK<b>${fmt(d.atk)}</b></div><div>Attacks/s<b>${(1 / d.rate).toFixed(2)}</b></div><div>Range<b>${d.range.toFixed(1)}</b></div>
          <div>Valor cost<b>${d.cost}</b></div><div>Hits<b>${kit.air ? 'Land + Air' : 'Land'}</b></div><div>Type<b>${kit.dmg === 'magic' ? 'Magic' : 'Physical'}</b></div></div>
        <p style="margin:8px 0 2px"><b>${escapeHtml(card.hero.trait.name)}.</b> ${escapeHtml(card.hero.trait.text)}</p>
        <p style="margin:2px 0"><b>${escapeHtml(kit.skill.name)}.</b> ${escapeHtml(kit.skill.text)} <span class="dim">(charges in ${kit.skill.charge}s of fighting, fires on its own)</span></p>
        <h3 class="cinzel" style="margin:12px 0 4px;font-size:15px">Gear cards</h3><div class="slots" data-k="slots"></div>
        <div class="row"><button class="btn" data-k="auto">Auto-equip best</button></div>
        <h3 class="cinzel" style="margin:12px 0 4px;font-size:15px">Upgrades (permanent)</h3>
        <div class="row"><button class="btn green ${canLevel(s, id) ? 'dot' : ''}" data-k="lv">Level up · ${fmt(levelUpCost(e))}◉</button><button class="btn green" data-k="lv10">+10 levels</button>
          <button class="btn ${canAscend(s, id) ? 'dot' : ''}" data-k="asc" ${canAscend(s, id) ? '' : 'disabled'}>${e.stars >= MAX_STARS ? 'Fully awakened' : `${e.stars >= 5 ? 'Awaken' : 'Ascend'} ★ · ${fmt(ascendNeed(e, id))}✧ <small class="dim">(you have ${fmt(s.essence)})</small>`}</button></div>
        <p class="dim" style="font-size:13px">Levels cost gold, up to the cap (Lv ${levelCap(e, id)} at ${e.stars}★). Essence ascends a hero to 5★, then awakens it to 10★: +15% attack and +10 to the level cap every star. Essence comes from duplicate heroes, salvaged gear, trophies, battles and the Modes. Empowering in battle is extra and lasts one battle.</p>
        <p class="dim"><i>${escapeHtml(card.flavor)}</i></p></div></div>`;
    root.querySelector('[data-k=big]').appendChild(cardView(card, { entry: { ...e, look: d.look }, stats: d, scale: 0.5 }));
    root.querySelector('[data-k=back]').onclick = () => show('collection');
    root.querySelector('[data-k=squad]').onclick = () => show('squad');
    root.querySelector('[data-k=i3d]').onclick = () => inspectCard(card, { ...e, look: d.look }, d);
    root.querySelector('[data-k=auto]').onclick = () => { const n = autoEquip(s, id); toast(n ? `Equipped ${n} better piece${n > 1 ? 's' : ''}` : 'Already wearing the best'); save(); refresh(); };
    root.querySelector('[data-k=lv]').onclick = () => { if (levelUp(s, id)) { sfx('firebuff', 0.5); save(); refresh(); } else toast(e.lvl >= levelCap(e, id) ? 'At the level cap: ascend to raise it' : 'Not enough gold'); };
    root.querySelector('[data-k=lv10]').onclick = () => { let k = 0; while (k < 10 && levelUp(s, id)) k++; if (k) { sfx('firebuff', 0.6); save(); refresh(); } else toast('Not enough gold'); };
    root.querySelector('[data-k=asc]').onclick = () => { if (ascend(s, id)) { sfx('chest_open', 0.8); toast(e.stars > 5 ? `${card.hero.short} awakens: ${e.stars}★!` : `${card.hero.short} ascends to ${e.stars}★!`); save(); refresh(); } };
    const slots = root.querySelector('[data-k=slots]');
    for (const slot of SLOTS) {
      const gid = e.equip?.[slot], g = gid && CARDS[gid], opts = wearable(s, id, slot);
      const box = el('div', 'card-slot' + (!g && opts.length ? ' dot' : ''));
      if (g) { const c = renderCard(g, s.cards[gid], 0.2); const cc = el('canvas'); cc.width = c.width; cc.height = c.height; cc.getContext('2d').drawImage(c, 0, 0); box.appendChild(cc); ensureCardArt(g).then(() => { const c2 = renderCard(g, s.cards[gid], 0.2); cc.getContext('2d').drawImage(c2, 0, 0); }); }
      else box.innerHTML = `${TYPES[slot]}<br>${opts.length ? `<small>${opts.length} to wear</small>` : '<small>none owned</small>'}`;
      box.onclick = () => pickGear(id, slot);
      slots.appendChild(box);
    }
  },
};
function pickGear(id, slot) {
  const s = D.save, list = wearable(s, id, slot), cur = s.cards['h:' + id].equip?.[slot], base = unitDef(id, s).power;
  const box = el('div');
  box.innerHTML = `<h2>${TYPES[slot]} for ${escapeHtml(CARDS['h:' + id].hero.short)}</h2><div class="dim">Power change shown on each card.</div>`;
  const grid = el('div', 'cards'); grid.style.marginTop = '10px';
  const e = s.cards['h:' + id];
  const rows = list.map((c) => { const old = e.equip[slot]; e.equip[slot] = c.id; const p = unitDef(id, s).power; if (old) e.equip[slot] = old; else delete e.equip[slot]; return [c, p - base]; }).sort((a, b) => b[1] - a[1]);
  for (const [c, dp] of rows) {
    const v = cardView(c, { entry: s.cards[c.id], selected: c.id === cur, onClick: () => { equip(s, id, slot, c.id); sfx('chest_close', 0.5); save(); m.close(); refresh(); } });
    v.insertAdjacentHTML('beforeend', `<span class="count" style="left:4px;right:auto;color:${dp >= 0 ? '#8f8' : '#f88'}">${dp >= 0 ? '+' : ''}${fmt(dp)}</span>`);
    grid.appendChild(v);
  }
  if (!rows.length) grid.innerHTML = '<p class="dim">No cards for this slot yet. Armory, Nocturne Forge and Reliquary packs at the Summoning Altar bring them.</p>';
  box.appendChild(grid);
  const m = modal(box, cur ? [{ label: 'Take off', cls: 'red', fn: () => { equip(s, id, slot, null); save(); refresh(); } }, { label: 'Close', cls: 'ghost' }] : [{ label: 'Close', cls: 'ghost' }], { wide: true });
}
