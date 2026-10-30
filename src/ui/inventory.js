// Inventory + character sheet.
import { G } from '../state.js';
import { net } from '../net/network.js';
import { el, fmtInt, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI, draggable, droppable } from './ui.js';
import { itemCell, itemTooltip, rarityClass } from './itemui.js';
import { SLOTS, SLOT_NAMES, itemName, itemColor, GEMS, gemName, itemValue, fitsSlot, slotFor, unsocketCost, makeGem } from '../data/items.js';
import { CLASSES, ATTRS } from '../data/classes.js';
import { xpToNext } from '../game/player.js';
import { addToBag } from '../game/player.js';
import { GroundItem } from '../game/loot.js';
import { classSprite } from '../core/assets.js';
import { heroPortrait, heroLook } from '../core/gearart.js';
import { heldPortraitArgs } from '../gfx/heldart.js';
import { openSeal } from './sealed.js';
import { glyphOf } from '../data/relics.js';
import { noteFind } from '../game/reliquary.js';
import { marksTotal, marksFree, capXp } from '../game/marks.js';
import { heresyRankOf } from '../game/heresies.js';
import { endgameUnlocked } from '../game/endgame.js';
import { sparkle, floatText } from '../gfx/vfx.js';

const DOLL = { head: [2, 1], weapon: [1, 2], body: [2, 2], offhand: [3, 2], hands: [1, 3], legs: [2, 3], feet: [2, 4], ring1: [4, 1], ring2: [4, 2], ring3: [4, 3], ring4: [4, 4] };

export function getItem(ref) {
  const c = G.char;
  if (!ref) return null;
  if (ref.where === 'bag') return c.bag[ref.idx];
  if (ref.where === 'equip') return c.equip[ref.slot];
  return null;
}

export function changed() {
  G.player.recompute();
  UI.refresh();
  G.game && G.game.autosave();
}

export function equipFromBag(idx, slot) {
  const c = G.char, it = c.bag[idx];
  if (!it || it.type !== 'gear') return false;
  if (it.unid) { UI.log('Identify it first (buy it from the Gambler).', '#ff8080'); return false; }
  if (it.sealed) { UI.log('Break the seal first.', '#ffdf8a'); return false; }
  if ((it.req || 1) > c.level) { UI.log(`Requires level ${it.req}.`, '#ff8080'); sfx('error'); return false; }
  const to = slot && fitsSlot(it, slot, c.classId) ? slot : slotFor(c.equip, it, c.classId);
  const old = c.equip[to];
  c.equip[to] = it;
  c.bag[idx] = old || null;
  sfx('pickup');
  UI.selected = { where: 'equip', slot: to };
  changed();
  return true;
}
export function unequip(slot, toIdx) {
  const c = G.char, it = c.equip[slot];
  if (!it) return false;
  let i = toIdx ?? c.bag.findIndex((b) => !b);
  if (i < 0 || (toIdx !== undefined && c.bag[toIdx])) {
    const other = toIdx !== undefined ? c.bag[toIdx] : null;
    if (fitsSlot(other, slot, c.classId) && (other.req || 1) <= c.level) { c.bag[toIdx] = it; c.equip[slot] = other; changed(); return true; }
    if (i < 0) { UI.log('Inventory full.', '#ff8080'); sfx('error'); return false; }
    i = c.bag.findIndex((b) => !b);
  }
  c.bag[i] = it;
  c.equip[slot] = null;
  UI.selected = { where: 'bag', idx: i };
  changed();
  return true;
}
export function socketGem(gemIdx, target) {
  const c = G.char, gem = c.bag[gemIdx], it = getItem(target);
  if (!gem || gem.type !== 'gem' || !it || it.type !== 'gear') return false;
  if (it.gems.length >= it.sockets) { UI.log(it.sockets ? 'No free sockets. Visit the Jeweler to add more.' : 'This item has no sockets. The Jeweler can add some.', '#ff8080'); sfx('error'); return false; }
  const was = glyphOf(it);
  it.gems.push({ gem: gem.gem, tier: gem.tier });
  if ((gem.count || 1) > 1) gem.count--; else c.bag[gemIdx] = null;
  UI.log(`Socketed <span style="color:${itemColor(gem)}">${gemName(gem.gem, gem.tier)}</span> into ${escapeHtml(itemName(it))}.`);
  const gw = glyphOf(it);
  if (gw && !was) {
    UI.log(`The Sigils flare: <b style="color:${itemColor(it)}">${escapeHtml(gw.name)}</b> is written!`, '#f2e2b0');
    if (G.player) { sparkle(G.player.x, G.player.y, 40, '#f2e2b0', 18, 0.6); G.player.recompute(); }
    noteFind(it);
    sfx('levelup');
  } else sfx('gold');
  changed();
  return true;
}
export function dropFromBag(idx) {
  const c = G.char, it = c.bag[idx], p = G.player;
  if (!it || !G.world) return false;
  if (it.locked) { UI.log('That item is locked. Unlock it first (its panel in the inventory).', '#ffd860'); sfx('error'); return false; }
  if (it.type === 'gear' && it.sealed === undefined) it.sealed = false; // already opened: it doesn't seal again on the floor
  c.bag[idx] = null;
  const lootId = `drop_${net.myId || 'p'}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  it._lootId = lootId;
  const g = new GroundItem(p.x, p.y, it.type === 'potion' ? 'potion' : 'item', {
    item: it,
    lootId,
    droppedBy: c.name,
  });
  g.t = -1.5;
  g.dropped = true; // not picked straight back up (auto-pickup leaves it alone: a click still takes it)
  g.vx = 0; g.vy = 0; g.vz = 50;
  G.world.addLoot(g);
  if (G.room) {
    net.sendLootSpawn({
      lootId,
      x: p.x,
      y: p.y,
      kind: g.kind,
      item: it,
      droppedBy: c.name,
      worldKind: G.world.kind,
      depth: G.world.depth || 0,
    });
  }
  UI.selected = null;
  changed();
  return true;
}

export function dropGold(amount) {
  const c = G.char, p = G.player;
  if (!c || !p || !G.world) return false;
  const parsed = parseInt(amount, 10);
  if (isNaN(parsed) || parsed <= 0) return false;
  const amt = Math.min(parsed, c.gold);
  if (amt <= 0) return false;

  c.gold -= amt;
  const lootId = `drop_gold_${net.myId || 'p'}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const g = new GroundItem(p.x, p.y, 'gold', {
    amount: amt,
    lootId,
    droppedBy: c.name,
  });
  g.t = -1.5; // Cooldown so dropper doesn't instantly vacuum it right back up
  g.vx = 0; g.vy = 0; g.vz = 50;
  G.world.addLoot(g);

  sfx('gold');
  floatText(p.x, p.y, 46, `-${amt} gold`, '#ffd34a', 12);
  UI.log(`Dropped <span class="gold-text">${fmtInt(amt)} gold</span> on the floor.`, '#ffd860');

  if (G.room) {
    net.sendLootSpawn({
      lootId,
      x: p.x,
      y: p.y,
      kind: 'gold',
      amount: amt,
      droppedBy: c.name,
      worldKind: G.world.kind,
      depth: G.world.depth || 0,
    });
  }

  changed();
  return true;
}

export function openDropGoldDialog() {
  const c = G.char;
  if (!c || c.gold <= 0) {
    UI.log('You have no gold to drop.', '#ffd860');
    sfx('error');
    return;
  }

  const html = `
    <div style="min-width:280px;max-width:360px;text-align:center;padding:4px 0 10px;">
      <p style="color:#dfd3c3;font-size:14px;margin-bottom:12px;">How much gold do you want to drop?</p>
      
      <div style="background:rgba(16,12,8,0.7);padding:8px 12px;border:1px solid rgba(160,120,60,0.3);border-radius:4px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;color:#a8977c;">Available Gold:</span>
        <span class="gold-text" style="font-family:var(--font-head);font-size:14px;font-weight:700;">◉ ${fmtInt(c.gold)}</span>
      </div>

      <div style="margin-bottom:14px;">
        <input type="number" id="drop-gold-input" min="1" max="${c.gold}" value="${c.gold}" 
          style="width:100%;box-sizing:border-box;padding:8px 12px;font-size:16px;font-family:var(--font-head);background:rgba(8,6,4,0.9);border:1px solid #c89e38;color:#ffd860;border-radius:4px;text-align:center;" />
      </div>

      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:8px;">
        <button class="btn small" data-pct="10" style="padding:4px 8px;font-size:11px;">10%</button>
        <button class="btn small" data-pct="25" style="padding:4px 8px;font-size:11px;">25%</button>
        <button class="btn small" data-pct="50" style="padding:4px 8px;font-size:11px;">50%</button>
        <button class="btn small" data-pct="100" style="padding:4px 8px;font-size:11px;">All</button>
      </div>
    </div>
  `;

  const d = UI.dialog({
    title: 'Drop Gold',
    html,
    buttons: [
      { label: 'Cancel' },
      {
        label: 'Drop',
        cls: 'btn big',
        fn: () => {
          const inp = d.box.querySelector('#drop-gold-input');
          const val = parseInt(inp ? inp.value : '0', 10);
          if (isNaN(val) || val <= 0) {
            UI.log('Enter a valid amount of gold.', '#ff8080');
            sfx('error');
            return;
          }
          dropGold(val);
        }
      }
    ]
  });

  const inp = d.box.querySelector('#drop-gold-input');
  if (inp) {
    inp.focus();
    inp.select();
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const val = parseInt(inp.value, 10);
        if (!isNaN(val) && val > 0) {
          dropGold(val);
          d.box.remove();
        }
      }
    };
  }

  d.box.querySelectorAll('[data-pct]').forEach((btn) => {
    btn.onclick = () => {
      sfx('ui');
      const pct = parseInt(btn.dataset.pct, 10);
      const target = Math.max(1, Math.floor((c.gold * pct) / 100));
      if (inp) {
        inp.value = String(target);
        inp.focus();
        inp.select();
      }
    };
  });
}

function handleDropOnBag(idx, data) {
  const c = G.char;
  if (data.type === 'shop') return G.ui.vendor && G.ui.vendor.buy(data, idx);
  if (data.type === 'stash') return G.ui.stash && G.ui.stash.take(data.idx);
  if (data.type === 'vault') return G.ui.reliquary && G.ui.reliquary.take(data.idx, data.tab);
  if (data.type !== 'item') return false;
  if (data.where === 'bag') {
    if (data.idx === idx) return false;
    const a = c.bag[data.idx], b = c.bag[idx];
    if (a && a.type === 'gem' && b && b.type === 'gear') return socketGem(data.idx, { where: 'bag', idx });
    if (a && b && a.type === 'gem' && b.type === 'gem' && a.gem === b.gem && a.tier === b.tier) { b.count = (b.count || 1) + (a.count || 1); c.bag[data.idx] = null; changed(); return true; }
    c.bag[data.idx] = b; c.bag[idx] = a;
    UI.selected = { where: 'bag', idx };
    changed();
    return true;
  }
  if (data.where === 'equip') return unequip(data.slot, idx);
  return false;
}
function handleDropOnEquip(slot, data) {
  const c = G.char;
  if (data.type !== 'item' || data.where !== 'bag') return false;
  const it = c.bag[data.idx];
  if (!it) return false;
  if (it.type === 'gem') return c.equip[slot] ? socketGem(data.idx, { where: 'equip', slot }) : false;
  if (!fitsSlot(it, slot, c.classId)) { sfx('error'); return false; }
  return equipFromBag(data.idx, slot);
}

function bagSlot(idx) {
  const c = G.char, it = c.bag[idx];
  const d = el('div', 'bslot ' + rarityClass(it));
  const sel = UI.selected;
  if (sel && sel.where === 'bag' && sel.idx === idx) d.classList.add('sel');
  if (it) d.appendChild(itemCell(it));
  draggable(d, {
    key: 'bag:' + idx,
    data: () => (c.bag[idx] ? { type: 'item', where: 'bag', idx } : null),
    icon: () => d.querySelector('img') && d.querySelector('img').src,
    onClick: () => { UI.selected = c.bag[idx] ? { where: 'bag', idx } : null; sfx('ui'); UI.refresh(); },
    onDouble: () => quickUse(idx),
    onRight: () => quickUse(idx),
    onDropWorld: (data) => (data.where === 'bag' ? dropFromBag(data.idx) : false),
  });
  droppable(d, (data) => handleDropOnBag(idx, data), (data) => data.type === 'item' || data.type === 'shop' || data.type === 'stash' || data.type === 'vault');
  if (it) UI.tip(d, () => itemTooltip(c.bag[idx], { compare: c.bag[idx] && c.bag[idx].slot ? c.equip[slotFor(c.equip, c.bag[idx])] : null, price: G.ui.vendor && G.ui.vendor.active ? Math.max(1, Math.floor(itemValue(c.bag[idx]) / 4)) : 0, priceLabel: 'Sells for', hint: G.ui.vendor && G.ui.vendor.active ? 'Right-click to sell' : G.ui.stash && G.ui.stash.active ? 'Right-click to store' : it.sealed ? 'Right-click / double-click to break the seal' : it.type === 'gear' ? 'Right-click / double-click to equip' : it.type === 'gem' ? 'Drag onto gear to socket' : '' }));
  return d;
}

function quickUse(idx) {
  const c = G.char, it = c.bag[idx];
  if (!it) return;
  if (it.sealed && !(G.ui.stash && G.ui.stash.active)) { openSeal(idx); return; }
  if (G.ui.vendor && G.ui.vendor.active) { G.ui.vendor.sell({ where: 'bag', idx }); return; }
  if (G.ui.stash && G.ui.stash.active) { G.ui.stash.store(idx); return; }
  if (it.type === 'gear') equipFromBag(idx);
  else if (it.type === 'gem') { UI.selected = { where: 'bag', idx }; UI.log('Drag the gem onto a socketed item to insert it.'); UI.refresh(); }
}

function equipSlot(slot) {
  const c = G.char, it = c.equip[slot];
  const d = el('div', 'eslot ' + rarityClass(it));
  const [cx, cy] = DOLL[slot];
  d.style.gridColumn = cx; d.style.gridRow = cy;
  const sel = UI.selected;
  if (sel && sel.where === 'equip' && sel.slot === slot) d.classList.add('sel');
  if (it) d.appendChild(itemCell(it)); else d.appendChild(el('span', 'lbl', SLOT_NAMES[slot]));
  draggable(d, {
    key: 'equip:' + slot,
    data: () => (c.equip[slot] ? { type: 'item', where: 'equip', slot } : null),
    icon: () => d.querySelector('img') && d.querySelector('img').src,
    onClick: () => { UI.selected = c.equip[slot] ? { where: 'equip', slot } : null; sfx('ui'); UI.refresh(); },
    onDouble: () => unequip(slot),
    onRight: () => (G.ui.vendor && G.ui.vendor.active ? (UI.selected = { where: 'equip', slot }, UI.refresh()) : unequip(slot)),
  });
  droppable(d, (data) => handleDropOnEquip(slot, data), (data) => data.type === 'item' && data.where === 'bag' && G.char.bag[data.idx] && (fitsSlot(G.char.bag[data.idx], slot) || G.char.bag[data.idx].type === 'gem'));
  if (it) UI.tip(d, () => itemTooltip(c.equip[slot], { hint: 'Right-click to unequip' }));
  return d;
}

function detailBox() {
  const box = el('div', 'item-detail');
  const sel = UI.selected;
  const it = getItem(sel);
  if (!it) { box.innerHTML = '<div class="dim">Tap or click an item to inspect it. Drag items to equip, move, socket gems or sell. Drag out of the window to drop.</div>'; return box; }
  box.innerHTML = itemTooltip(it, { compare: sel.where === 'bag' && it.slot ? G.char.equip[slotFor(G.char.equip, it)] : null });
  const row = el('div', 'row');
  row.style.marginTop = '8px';
  const btn = (label, fn, cls = 'small') => { const b = el('button', 'btn ' + cls, label); b.onclick = () => { sfx('ui'); fn(); }; row.appendChild(b); };
  if (sel.where === 'bag') {
    if (it.sealed) btn('Break the Seal', () => openSeal(sel.idx), 'small red');
    else if (it.type === 'gear') btn('Equip', () => equipFromBag(sel.idx));
    if (it.type === 'gem') {
      const targets = [...SLOTS.map((s) => ({ where: 'equip', slot: s })), ...G.char.bag.map((b, i) => ({ where: 'bag', idx: i }))].filter((r) => { const x = getItem(r); return x && x.type === 'gear' && x.gems.length < x.sockets; });
      if (targets.length) btn(`Socket (${targets.length} items)`, () => pickSocketTarget(sel.idx, targets));
    }
    if (G.ui.vendor && G.ui.vendor.active && !it.sealed) btn(`Sell (${fmtInt(Math.max(1, Math.floor(itemValue(it) / 4)))}g)`, () => G.ui.vendor.sell(sel));
    btn('Drop', () => dropFromBag(sel.idx), 'small red');
  } else {
    btn('Unequip', () => unequip(sel.slot));
  }
  // a lock: auto-play leaves the item alone (worn: never swapped out; in the bag or chest: never equipped, sold or moved)
  if (it.type === 'gear') btn(it.locked ? '🔓 Unlock' : '🔒 Lock', () => { if (it.locked) delete it.locked; else it.locked = true; UI.log(it.locked ? `<b>${escapeHtml(itemName(it))}</b> locked: auto-play won't touch it${sel.where === 'equip' ? ' or swap it out' : ''}.` : `<b>${escapeHtml(itemName(it))}</b> unlocked.`, '#ffd860'); changed(); });
  if (it.type === 'gear' && it.gems.length) {
    const cost = unsocketCost(it);
    const needed = new Set(it.gems.filter((g) => !G.char.bag.some((b) => b && b.type === 'gem' && b.gem === g.gem && b.tier === g.tier)).map((g) => `${g.gem}:${g.tier}`)).size;
    const free = G.char.bag.filter((b) => !b).length;
    const remove = el('button', 'btn small', `Remove gems (${fmtInt(cost)}g)`);
    remove.disabled = G.char.gold < cost || free < needed;
    remove.title = free < needed ? 'Make room in your inventory first.' : '';
    remove.onclick = () => {
      if (G.char.gold < cost || free < needed) return;
      G.char.gold -= cost;
      for (const gem of it.gems) addToBag(G.char, makeGem(gem.gem, gem.tier));
      it.gems = [];
      sfx('gold');
      changed();
    };
    row.appendChild(remove);
  }
  box.appendChild(row);
  return box;
}

function pickSocketTarget(gemIdx, targets) {
  const html = targets.map((r, i) => { const x = getItem(r); return `<button class="btn small" data-i="${i}" style="display:block;width:100%;margin:3px 0;color:${itemColor(x)}">${escapeHtml(itemName(x))} (${x.gems.length}/${x.sockets})</button>`; }).join('');
  const d = UI.dialog({ title: 'Socket into…', html: `<div style="max-height:50vh;overflow:auto">${html}</div>`, buttons: [{ label: 'Cancel' }] });
  d.box.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { d.close(); socketGem(gemIdx, targets[+b.dataset.i]); }; });
}

function statsBlock() {
  const p = G.player, c = G.char, st = p.st, C = CLASSES[c.classId];
  const box = el('div', 'col');
  box.style.minWidth = '210px';
  const need = xpToNext(c.level), mk = capXp(c);   // at the cap: XP towards the next Infernal Mark
  box.appendChild(el('div', '', `<b style="font-family:Cinzel;color:#ffe2a0;font-size:16px">${escapeHtml(c.name)}</b><div class="dim">Level ${c.level} ${C.name}</div><div class="dim" style="font-size:12px">${mk ? `Next Infernal Mark ${fmtInt(mk.xp)} / ${fmtInt(mk.need)} XP` : `XP ${fmtInt(c.xp)} / ${fmtInt(need)}`}</div>`));
  const attrs = el('div', '');
  for (const k of ['str', 'dex', 'vit', 'int']) {
    const row = el('div', 'attr-row');
    row.innerHTML = `<span title="${ATTRS[k].desc}">${ATTRS[k].name}${C.primary === k ? ' <span style="color:#ffd34a" title="Primary: +1% damage per point">★</span>' : ''}</span><b>${Math.round(st[k])}</b>`;
    if (c.statPoints > 0) {
      const plus = el('button', 'plus', '+');
      plus.title = 'Shift-click: +5 · Ctrl-click: every point';
      plus.onclick = (e) => { const n = Math.min(c.statPoints, e.ctrlKey || e.metaKey || e.altKey ? Infinity : e.shiftKey ? 5 : 1); c.attrs[k] += n; c.statPoints -= n; sfx('ui'); changed(); };
      row.appendChild(plus);
    }
    attrs.appendChild(row);
  }
  box.appendChild(attrs);
  if (c.statPoints > 0) {
    const r = el('div', 'row');
    r.appendChild(el('span', 'gold-text', `${c.statPoints} points`));
    const auto = el('button', 'btn small', 'Auto');
    auto.onclick = () => { autoAllocate(); sfx('ui'); };
    r.appendChild(auto);
    box.appendChild(r);
  }
  const spent = attrsSpent();
  if (spent > 0) {
    const rb = el('button', 'btn small', `Respec attributes (${fmtInt(attrRespecCost(c.level))} gold)`);
    rb.title = 'Refund every attribute point you (or auto-play) spent: 25 gold x level squared';
    if (c.gold < attrRespecCost(c.level)) rb.style.opacity = '.45';
    rb.onclick = () => { sfx('ui'); attrRespecDialog(); };
    box.appendChild(rb);
  }
  const g = el('div', 'stats-grid');
  const rows = [
    ['Life', `${Math.round(p.hp)} / ${p.maxHp}`], ['Mana', `${Math.round(p.mana)} / ${p.maxMana}`],
    ['Weapon Dmg', `${st.weapon[0]}–${st.weapon[1]}`], ['Damage Bonus', `+${Math.round(st.dmgPct + st.primary)}%`],
    ['Armor', st.armor], ['Crit', `${st.critChance.toFixed(1)}% / +${Math.round(st.critDmg)}%`],
    ['Attack Speed', `+${Math.round(st.atkSpeed)}%`], ['Cast Speed', `+${Math.round(st.castSpeed)}%`],
    ['Move Speed', `+${Math.round(st.moveSpeed)}%`], ['Fire Res', `${Math.min(75, st.res.fire)}%`],
    ['Cold Res', `${Math.min(75, st.res.cold)}%`], ['Lightning Res', `${Math.min(75, st.res.light)}%`],
    ['Poison Res', `${Math.min(75, st.res.poison)}%`], ['Life Steal', `${st.lifeSteal.toFixed(1)}%`],
    ['Block', `${Math.round(st.block)}%`], ['Life Regen', `${st.lifeRegen.toFixed(1)}/s`],
    ['Magic Find', `+${Math.round(st.magicFind)}%`], ['Gold Find', `+${Math.round(st.goldFind)}%`],
  ];
  if (st.reduce) rows.push(['Damage Reduction', `${Math.round(st.reduce)}%`]);
  if (st.fortitude > 1) rows.push(['Fortitude', `+${Math.round((st.fortitude - 1) * 100)}% Life`]);
  if (st.extraProj) rows.push(['Extra Projectiles', '+' + Math.floor(st.extraProj)]);
  if (st.skillsAll) rows.push(['All Skills', '+' + Math.floor(st.skillsAll)]);
  if (marksTotal()) rows.push(['Infernal Marks', `${marksTotal()} (${marksFree()} free)`]);
  if (heresyRankOf(c)) rows.push(['Heresy rank', String(heresyRankOf(c))]);
  if (c.keys) rows.push(['Abyssal Keys', `${c.keys}`]);
  for (const [k, v] of rows) g.innerHTML += `<span class="dim">${k}</span><span class="v">${v}</span>`;
  box.appendChild(g);
  box.appendChild(el('div', 'dim', `Kills ${fmtInt(c.kills || 0)} · Deaths ${c.deaths || 0} · Deepest ${c.deepest || 0}`));
  if (endgameUnlocked(c)) { const mb = el('button', 'btn small', 'Infernal Marks'); mb.onclick = () => { sfx('ui'); G.ui.marks.open(); }; box.appendChild(mb); }
  return box;
}

/** Attribute points spent so far (everything over the class's starting attributes). */
const attrsSpent = () => { const c = G.char, B = CLASSES[c.classId].base; return ['str', 'dex', 'vit', 'int'].reduce((a, k) => a + Math.max(0, c.attrs[k] - B[k]), 0); };
export const attrRespecCost = (lv) => 25 * lv * lv;
/** Refund every spent attribute point (back to the class's starting attributes) for 25 gold x level squared. */
export function attrRespec() {
  const c = G.char, cost = attrRespecCost(c.level), n = attrsSpent();
  if (!n || c.gold < cost) return false;
  c.attrs = { ...c.attrs, ...CLASSES[c.classId].base };
  c.statPoints += n; c.gold -= cost;
  sfx('buff');
  UI.log(`Attributes reset: <b>${n}</b> attribute points refunded for ${fmtInt(cost)} gold.`, '#ffd860');
  changed();
  return true;
}
function attrRespecDialog() {
  const c = G.char, cost = attrRespecCost(c.level), n = attrsSpent();
  if (c.gold < cost) { UI.log(`Respeccing attributes costs ${fmtInt(cost)} gold.`, '#ff8080'); sfx('error'); return; }
  const auto = G.settings.autoStatPoints !== false;
  UI.confirm('Respec Attributes', `Refund all <b>${n}</b> spent attribute points for <b class="gold-text">${fmtInt(cost)} gold</b> (25 x level&sup2;)?${auto ? '<br><span class="dim">Auto-play spends attribute points on its own: turn off "Auto attribute point assignment" in Settings to place them yourself.</span>' : ''}`, attrRespec, 'Respec');
}

export function autoAllocate() {
  const c = G.char, C = CLASSES[c.classId];
  while (c.statPoints > 0) {
    const r = Math.random();
    const k = r < 0.55 ? C.primary : r < 0.85 ? 'vit' : C.primary === 'int' ? 'dex' : 'int';
    c.attrs[k === 'vit' && C.primary === 'vit' ? 'str' : k]++;
    c.statPoints--;
  }
  changed();
}

export function renderInventory(body) {
  const c = G.char;
  body.innerHTML = '';
  const wrap = el('div', 'inv-wrap');
  const left = el('div', 'col');
  const doll = el('div', 'paperdoll');
  const portrait = el('div', 'portrait');
  const img = new Image();
  const held = heldPortraitArgs(heroLook(c.classId, c.equip.body, c.equip.head), c.classId, c.equip); // with his weapon and off-hand
  img.src = (heroPortrait(c.classId, c.equip.body, c.equip.head, 130, 260, ...held) || classSprite(c.classId, 260)).toDataURL();
  portrait.appendChild(img);
  portrait.style.gridColumn = 3; portrait.style.gridRow = '3 / span 2';
  doll.appendChild(portrait);
  for (const s of SLOTS) doll.appendChild(equipSlot(s));
  left.appendChild(doll);
  left.appendChild(detailBox());
  wrap.appendChild(left);
  const mid = el('div', 'col');
  const bag = el('div', 'bag');
  for (let i = 0; i < c.bag.length; i++) bag.appendChild(bagSlot(i));
  mid.appendChild(bag);
  const info = el('div', 'row');
  const goldSpan = el('span', 'gold-text gold-clickable', `◉ ${fmtInt(c.gold)} gold`);
  goldSpan.id = 'inv-gold-display';
  goldSpan.title = 'Click to drop gold on the floor';
  goldSpan.setAttribute('role', 'button');
  goldSpan.setAttribute('tabindex', '0');
  goldSpan.onclick = () => {
    sfx('ui');
    openDropGoldDialog();
  };
  goldSpan.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sfx('ui');
      openDropGoldDialog();
    }
  };
  info.appendChild(goldSpan);
  const potionsSpan = el('span', 'dim');
  potionsSpan.innerHTML = `· Potions: <span style="color:#ff6060">${c.potions.hp}</span> / <span style="color:#6a8aff">${c.potions.mp}</span> / <span style="color:#c060ff">${c.potions.rejuv}</span> / <span style="color:#ffa020">${c.potions.fury}</span>`;
  info.appendChild(potionsSpan);
  const sortBtn = el('button', 'btn small', 'Sort');
  sortBtn.onclick = () => { sortBag(); sfx('ui'); };
  info.appendChild(sortBtn);
  if (G.ui.vendor && G.ui.vendor.active) {
    const sellAll = el('button', 'btn small', 'Sell all');
    sellAll.title = 'Sell every piece of gear in your bag (gems and sealed treasures are kept). Asks once.';
    sellAll.disabled = !c.bag.some((b) => b && b.type === 'gear' && !b.sealed);
    sellAll.onclick = () => { sfx('ui'); G.ui.vendor.sellAll(); };
    info.appendChild(sellAll);
  }
  mid.appendChild(info);
  wrap.appendChild(mid);
  wrap.appendChild(statsBlock());
  body.appendChild(wrap);
}

function sortBag() {
  const c = G.char;
  const items = c.bag.filter(Boolean);
  const rank = (it) => (it.type === 'gear' ? 0 : it.type === 'gem' ? 1 : 2);
  items.sort((a, b) => rank(a) - rank(b) || (b.rarity || 0) - (a.rarity || 0) || (a.slot || '').localeCompare(b.slot || '') || (b.ilvl || 0) - (a.ilvl || 0));
  c.bag = c.bag.map((_, i) => items[i] || null);
  UI.selected = null;
  changed();
}

export function toggleInventory() {
  if (UI.isOpen('inventory')) UI.closePanel('inventory');
  else UI.openPanel('inventory', 'Inventory & Character', renderInventory, { order: G.ui.vendor && G.ui.vendor.active ? 'last' : 'first' });
}

export { addToBag, GEMS };
