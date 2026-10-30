// Town vendors and their services.
import { G } from '../state.js';
import { el, fmtInt, escapeHtml, randi, pick, chance } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI, draggable, droppable } from './ui.js';
import { itemCell, itemTooltip, rarityClass } from './itemui.js';
import { getItem, changed, renderInventory, openDropGoldDialog } from './inventory.js';
import { addToBag } from '../game/player.js';
import {
  rollItem, rollGem, makeGem, itemValue, itemName, itemColor, upgradeCost, socketCost, enchantCost, unsocketCost,
  rerollAffixes, addAffix, RARITY, rarityAt, POTION_PRICE, POTION_INFO, GEMS, gemName, SLOT_NAMES, WEAPONS, MAX_GEM_TIER, gemFuseCost, gemRefineCost, slotFor, gemMaxTier, sigilFuseCost,
} from '../data/items.js';
import { CLASSES } from '../data/classes.js';
import { potionIcon } from '../core/assets.js';
import { VENDORS } from '../world/town.js';
import { depthLevel } from '../data/depth.js';

const VBY = Object.fromEntries(VENDORS.map((v) => [v.id, v]));

export const Vendor = {
  active: null,
  stock: {},
  shopSel: null,

  restock() {
    const c = G.char;
    // stock for the hero's own level (items need their level to wear); rarely better than Rare
    const lvl = Math.max(1, c.level);
    const cls = CLASSES[c.classId];
    const shopRarity = () => (chance(0.012) ? 3 : chance(0.08) ? 2 : chance(0.4) ? 1 : 0);
    const weapons = [];
    for (let i = 0; i < 16; i++) {
      const slot = i < 12 ? 'weapon' : 'offhand';
      const base = slot === 'weapon' && i < 4 ? cls.weapon : slot === 'offhand' && i === 12 && cls.offhand ? cls.offhand : undefined;
      weapons.push(rollItem(Math.max(1, lvl + randi(-2, 0)), { slot, rarity: rarityAt(lvl, shopRarity()), base: base && (slot === 'weapon' ? WEAPONS[base] && base : base) }));
    }
    const armor = [];
    for (let i = 0; i < 18; i++) armor.push(rollItem(Math.max(1, lvl + randi(-2, 0)), { slot: ['head', 'body', 'hands', 'legs', 'feet', 'offhand'][i % 6], rarity: rarityAt(lvl, shopRarity()), base: i % 6 === 5 ? 'shield' : undefined }));
    const gems = [];
    for (let i = 0; i < 14; i++) gems.push(rollGem(Math.max(1, Math.max(c.level, depthLevel(c.depth || 1)) - 5)));
    const rings = [];
    for (let i = 0; i < 10; i++) rings.push(rollItem(Math.max(1, lvl + randi(-2, 0)), { slot: 'ring', rarity: rarityAt(lvl, Math.max(1, shopRarity())) }));
    this.stock = { weapons, armor, gems, rings };
  },

  open(vid) {
    UI.closeAll();
    this.active = vid;
    this.shopSel = null;
    const v = VBY[vid];
    sfx('ui');
    UI.openPanel('vendor', `${v.name} — ${v.title}`, (b) => this.render(b), { onClose: () => { this.active = null; UI.closePanel('inventory'); }, cls: 'vendor-panel' });
    UI.openPanel('inventory', 'Your Inventory', renderInventory);
  },

  render(body) {
    const v = VBY[this.active];
    const c = G.char;
    body.innerHTML = '';
    body.appendChild(el('div', 'vendor-greet', `“${escapeHtml(v.greet)}”`));
    const goldRow = el('div', 'row');
    const goldSpan = el('span', 'gold-text gold-clickable', `◉ ${fmtInt(c.gold)} gold`);
    goldSpan.title = 'Click to drop gold on the floor';
    goldSpan.onclick = () => { sfx('ui'); openDropGoldDialog(); };
    goldRow.appendChild(goldSpan);
    body.appendChild(goldRow);
    const sellZone = el('div', 'shop-sellzone', 'Drop a backpack item here to sell · Right-click an item to sell it');
    droppable(sellZone, (data) => (data.type === 'item' ? this.sell(data) : false), (data) => data.type === 'item');
    body.appendChild(sellZone);
    switch (this.active) {
      case 'weapons': this.shopGrid(body, this.stock.weapons); break;
      case 'armor': this.shopGrid(body, this.stock.armor); break;
      case 'gems': this.shopGrid(body, this.stock.gems); this.combineBox(body); break;
      case 'alchemist': this.potionBox(body); break;
      case 'upgrade': this.serviceBox(body, 'upgrade'); break;
      case 'enchant': this.serviceBox(body, 'enchant'); break;
      case 'socket': this.serviceBox(body, 'socket'); body.appendChild(el('div', 'vendor-sub', '<b>Rings</b> <span class="dim">· each ring augments your skills</span>')); this.shopGrid(body, this.stock.rings || []); break;
      case 'gamble': this.gambleBox(body); break;
    }
  },

  shopGrid(body, list) {
    body.appendChild(el('div', 'inv-section-title', `Stock <span>${list.filter(Boolean).length} available</span>`));
    const grid = el('div', 'shop-grid');
    list.forEach((it, i) => {
      const d = el('div', 'bslot ' + rarityClass(it));
      if (this.shopSel === i) d.classList.add('sel');
      if (it) {
        d.appendChild(itemCell(it));
        d.appendChild(el('span', 'shop-price', `${fmtInt(itemValue(it))}g`));
      }
      if (it) {
        draggable(d, {
          key: 'shop:' + i,
          data: () => (list[i] ? { type: 'shop', list, i } : null),
          icon: () => d.querySelector('img') && d.querySelector('img').src,
          onClick: () => { this.shopSel = i; sfx('ui'); UI.refresh(); },
          onDouble: () => this.buy({ type: 'shop', list, i }),
          onRight: () => this.buy({ type: 'shop', list, i }),
        });
        UI.tip(d, () => itemTooltip(list[i], { price: itemValue(list[i]), compare: list[i].slot ? G.char.equip[slotFor(G.char.equip, list[i])] : null, hint: 'Right-click or double-click to buy' }));
      }
      grid.appendChild(d);
    });
    body.appendChild(grid);
    const sel = this.shopSel !== null ? list[this.shopSel] : null;
    if (sel) {
      const box = el('div', 'item-detail');
      box.style.width = 'auto';
      box.style.marginTop = '8px';
      box.innerHTML = itemTooltip(sel, { price: itemValue(sel), compare: sel.slot ? G.char.equip[slotFor(G.char.equip, sel)] : null });
      const b = el('button', 'btn small', `Buy for ${fmtInt(itemValue(sel))}g`);
      b.disabled = G.char.gold < itemValue(sel);
      b.onclick = () => this.buy({ type: 'shop', list, i: this.shopSel });
      box.appendChild(b);
      body.appendChild(box);
    }
  },

  buy(data, toIdx) {
    const c = G.char;
    const it = data.list[data.i];
    if (!it) return false;
    const price = itemValue(it);
    if (c.gold < price) { UI.log('Not enough gold.', '#ff8080'); sfx('error'); return false; }
    let ok;
    if (toIdx !== undefined && !c.bag[toIdx] && it.type !== 'gem') { c.bag[toIdx] = it; ok = true; } else ok = addToBag(c, { ...it });
    if (!ok) { UI.log('Inventory full.', '#ff8080'); sfx('error'); return false; }
    c.gold -= price;
    data.list[data.i] = it.type === 'gem' ? rollGem(Math.max(1, Math.max(c.level, depthLevel(c.depth || 1)) - 4)) : null;
    if (this.shopSel === data.i) this.shopSel = null;
    sfx('gold');
    UI.log(`Bought <span style="color:${itemColor(it)}">${escapeHtml(itemName(it))}</span> for ${fmtInt(price)} gold.`);
    changed();
    return true;
  },

  sell(ref) {
    const c = G.char;
    const it = getItem(ref);
    if (!it) return false;
    if (ref.where === 'equip') { UI.log('Unequip it first.', '#ff8080'); return false; }
    if (it.locked) { UI.log('That item is locked. Unlock it first (its panel in the inventory).', '#ffd860'); sfx('error'); return false; }
    if (it.sealed) { UI.log('Break the seal first: nobody buys a sealed treasure.', '#ffdf8a'); sfx('error'); return false; }
    const n = it.type === 'gem' ? 1 : 1;
    const price = Math.max(1, Math.floor(itemValue(it) / 4)) * n;
    const sellIt = () => {
      if (it.type === 'gem' && (it.count || 1) > 1) it.count--; else c.bag[ref.idx] = null;
      c.gold += price;
      sfx('gold');
      UI.log(`Sold ${escapeHtml(itemName(it))} for ${fmtInt(price)} gold.`, '#ffd34a');
      if (UI.selected && UI.selected.where === 'bag' && UI.selected.idx === ref.idx && !c.bag[ref.idx]) UI.selected = null;
      changed();
    };
    if (it.type === 'gear' && it.rarity >= 3) UI.confirm('Sell item?', `Sell <span style="color:${itemColor(it)}">${escapeHtml(itemName(it))}</span> for ${fmtInt(price)} gold?`, sellIt, 'Sell');
    else sellIt();
    return true;
  },

  /** Sell every piece of gear in the bag after one confirmation (gems and sealed treasures stay). */
  sellAll() {
    const c = G.char;
    const sold = c.bag.map((it, i) => ({ it, i })).filter(({ it }) => it && it.type === 'gear' && !it.sealed && !it.locked);
    if (!sold.length) { UI.log('No gear in your bag to sell.', '#ff8080'); sfx('error'); return false; }
    const price = (it) => Math.max(1, Math.floor(itemValue(it) / 4));
    const total = sold.reduce((a, { it }) => a + price(it), 0);
    const gems = sold.reduce((a, { it }) => a + it.gems.length, 0), sealed = c.bag.filter((b) => b && b.sealed).length;
    const kinds = RARITY.map((r) => ({ r, n: sold.filter(({ it }) => it.rarity === r.id).length })).filter((k) => k.n).reverse()
      .map((k) => `<span style="color:${k.r.color}">${k.n} ${k.r.name}</span>`).join(' · ');
    UI.confirm('Sell all gear?', `Sell <b>${sold.length}</b> piece${sold.length > 1 ? 's' : ''} of gear for <span class="gold-text">${fmtInt(total)} gold</span>?<br>${kinds}` +
      `<br><span class="dim">Gems in your bag are kept${gems ? `; ${gems} socketed gem${gems > 1 ? 's go' : ' goes'} with ${gems > 1 ? 'their' : 'its'} gear` : ''}. Equipped gear, locked items${sealed ? ' and sealed treasures are' : ' are'} not sold.</span>`, () => {
      let n = 0, gold = 0;
      for (const { it, i } of sold) if (c.bag[i] === it) { c.bag[i] = null; gold += price(it); n++; } // still where it was
      c.gold += gold;
      if (UI.selected && UI.selected.where === 'bag' && !c.bag[UI.selected.idx]) UI.selected = null;
      sfx('gold');
      UI.log(`Sold ${n} item${n > 1 ? 's' : ''} for ${fmtInt(gold)} gold.`, '#ffd34a');
      changed();
    }, 'Sell all');
    return true;
  },

  potionBox(body) {
    const c = G.char;
    for (const k of ['hp', 'mp', 'rejuv', 'fury']) {
      const row = el('div', 'service-box row');
      const ic = potionIcon({ hp: 'red', mp: 'blue', rejuv: 'purple', fury: 'orange' }[k], 40);
      row.appendChild(ic);
      row.appendChild(el('div', '', `<b>${{ hp: 'Healing Potion', mp: 'Mana Potion', rejuv: 'Rejuvenation Potion', fury: 'Elixir of Fury' }[k]}</b> <span class="dim">(you have ${c.potions[k]})</span><div class="dim" style="font-size:12px">${POTION_INFO[k]}</div>`));
      const price = Math.round(POTION_PRICE[k] * (1 + c.level * 0.08));
      for (const n of [1, 5]) {
        const b = el('button', 'btn small', `Buy ${n} (${fmtInt(price * n)}g)`);
        b.disabled = c.gold < price * n || c.potions[k] + n > 30;
        b.onclick = () => { c.gold -= price * n; c.potions[k] += n; sfx('potion'); changed(); };
        row.appendChild(b);
      }
      body.appendChild(row);
    }
  },

  /** The Gem Forge: fuse three gems of a kind into the next grade, fuse everything at once, or refine one gem. */
  combineBox(body) {
    const c = G.char;
    const box = el('div', 'service-box');
    box.innerHTML = `<b>Gem Forge</b><div class="dim" style="font-size:12px">Fuse three identical gems into one of the next grade, or pay to refine a single gem. Grades: Chipped → Flawed → Gem → Flawless → Perfect → Royal → Imperial → Celestial → Abyssal → Eternal. Three Sigil Stones of a rank fuse into one of the next rank (Sigils can't be refined).</div>`;
    const gems = c.bag.map((b, i) => ({ b, i })).filter(({ b }) => b && b.type === 'gem' && b.tier < gemMaxTier(b.gem));
    const fusable = gems.filter(({ b }) => (b.count || 1) >= 3);
    if (fusable.length) {
      const all = el('button', 'btn small', 'Fuse all');
      all.style.margin = '6px 0'; all.title = 'Fuse every stack of three, lowest grades first, repeating while you can pay';
      all.onclick = () => { const n = fuseAll(c); if (n) { sfx('levelup'); UI.log(`The forge fused <b>${n}</b> gem${n > 1 ? 's' : ''} into finer stones.`, '#c8f0ff'); changed(); } else sfx('error'); };
      box.appendChild(all);
    }
    if (!gems.length) box.appendChild(el('div', 'dim', 'You carry no gems the forge can work.'));
    for (const { b, i } of gems) {
      const row = el('div', 'row forge-row');
      row.appendChild(el('span', '', `<span style="color:${GEMS[b.gem].color}">◆</span> ${escapeHtml(gemName(b.gem, b.tier))}${(b.count || 1) > 1 ? ` <span class="dim">x${b.count}</span>` : ''}`));
      const sig = GEMS[b.gem].sigil, fuse = fuseCost(b), refine = gemRefineCost(b.tier, GEMS[b.gem].special);
      const f = el('button', 'btn small', `Fuse 3 → ${escapeHtml(gemName(b.gem, b.tier + 1))} (${fmtInt(fuse)}g)`);
      f.disabled = (b.count || 1) < 3 || c.gold < fuse;
      f.onclick = () => { if (fuseGem(c, i)) { sfx('levelup'); UI.log(`Forged <span style="color:#c8f0ff">${escapeHtml(gemName(b.gem, b.tier + 1))}</span>!`); changed(); } };
      const u = el('button', 'btn small', `Refine 1 (${fmtInt(refine)}g)`);
      u.disabled = c.gold < refine;
      u.onclick = () => {
        c.gold -= refine;
        if ((b.count || 1) > 1) b.count--; else c.bag[i] = null;
        addToBag(c, makeGem(b.gem, b.tier + 1));
        sfx('arcane');
        UI.log(`Refined into <span style="color:#c8f0ff">${escapeHtml(gemName(b.gem, b.tier + 1))}</span>.`);
        changed();
      };
      row.appendChild(f); if (!sig) row.appendChild(u);
      box.appendChild(row);
    }
    body.appendChild(box);
  },

  serviceBox(body, kind) {
    const c = G.char;
    const box = el('div', 'service-box');
    const it = getItem(UI.selected);
    const slot = el('div', 'bslot ' + rarityClass(it));
    slot.style.width = '56px'; slot.style.height = '56px'; slot.style.display = 'inline-block'; slot.style.verticalAlign = 'middle';
    if (it) slot.appendChild(itemCell(it));
    droppable(slot, (data) => { if (data.type !== 'item') return false; UI.selected = data.where === 'bag' ? { where: 'bag', idx: data.idx } : { where: 'equip', slot: data.slot }; UI.refresh(); return true; }, (data) => data.type === 'item');
    const head = el('div', 'row');
    head.appendChild(slot);
    head.appendChild(el('div', '', it && it.type === 'gear' ? `<b style="color:${itemColor(it)}">${escapeHtml(itemName(it))}</b><div class="dim">${RARITY[it.rarity].name} · iLvl ${it.ilvl}${it.upg ? ` · +${it.upg}` : ''} · Sockets ${it.sockets}/${it.maxSockets}</div>` : '<span class="dim">Select or drag an item (bag or equipped) here.</span>'));
    box.appendChild(head);
    const btn = (label, cost, can, fn) => {
      const b = el('button', 'btn', `${label} — ${fmtInt(cost)}g`);
      b.style.margin = '6px 6px 0 0';
      b.disabled = !can || c.gold < cost;
      b.onclick = () => { c.gold -= cost; fn(); changed(); };
      box.appendChild(b);
    };
    if (it && it.type === 'gear') {
      if (kind === 'upgrade') {
        if ((it.upg || 0) >= 10) box.appendChild(el('div', 'dim', 'This item is fully upgraded (+10).'));
        else btn(`Upgrade to +${(it.upg || 0) + 1}`, upgradeCost(it), true, () => { it.upg = (it.upg || 0) + 1; sfx('thud'); UI.log(`${escapeHtml(itemName(it))} upgraded!`, '#ffd34a'); });
        box.appendChild(el('div', 'dim', 'Each upgrade: +10% base damage/armor and +4% to affix values.'));
      } else if (kind === 'enchant') {
        btn('Reroll all affixes', enchantCost(it, false), it.affixes.some((a) => !a.implicit), () => { rerollAffixes(it); sfx('arcane'); });
        const n = it.affixes.filter((a) => !a.implicit).length;
        btn('Add an affix', enchantCost(it, true), n < RARITY[it.rarity].affixes[1] + 1, () => { if (addAffix(it)) sfx('arcane'); });
        box.appendChild(el('div', 'dim', `Max affixes for ${RARITY[it.rarity].name}: ${RARITY[it.rarity].affixes[1] + 1}.`));
      } else if (kind === 'socket') {
        btn(`Add socket (${it.sockets}/${it.maxSockets})`, socketCost(it), it.sockets < it.maxSockets, () => { it.sockets++; sfx('thud'); });
        btn('Remove all gems', unsocketCost(it), it.gems.length > 0, () => {
          for (const g of it.gems) addToBag(c, makeGem(g.gem, g.tier));
          it.gems = [];
          sfx('gold');
        });
        box.appendChild(el('div', 'dim', `Sockets by rarity: ${RARITY.map((r) => `${r.name} ${r.sockets}`).join(', ')}. Plain (Common) items take up to 6 (weapons, body armor), 4 (helms, off-hands, legs) or 3 (hands, feet): bases for Glyphwords.`));
      }
    }
    body.appendChild(box);
  },

  gambleBox(body) {
    const c = G.char;
    const lvl = Math.max(c.level, depthLevel(c.depth || 1));
    const price = Math.round(180 * Math.pow(1.065, lvl));
    body.appendChild(el('div', 'dim', 'Buy an unidentified item of your level. Gambled items are far more likely to be Rare or better.'));
    const grid = el('div', 'row');
    grid.style.marginTop = '8px';
    for (const slot of ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ring', 'gem']) {
      const b = el('button', 'btn small', `${slot === 'gem' ? 'Mystery Gem' : SLOT_NAMES[slot]}<br><span class="gold-text">${fmtInt(slot === 'gem' ? Math.round(price * 0.6) : price)}g</span>`);
      const cost = slot === 'gem' ? Math.round(price * 0.6) : price;
      b.disabled = c.gold < cost;
      b.onclick = () => {
        const it = slot === 'gem' ? rollGem(lvl + 8) : rollItem(c.level, { slot, mf: G.player.st.magicFind + 120, bonus: 0.5 });
        if (!addToBag(c, it)) { UI.log('Inventory full.', '#ff8080'); sfx('error'); return; }
        c.gold -= cost;
        sfx(it.rarity >= 3 ? 'levelup' : 'gold');
        UI.log(`The gamble reveals: <span style="color:${itemColor(it)}">${escapeHtml(itemName(it))}</span>!`);
        changed();
      };
      grid.appendChild(b);
    }
    body.appendChild(grid);
  },
};

/** What fusing three of a gem stack costs (Sigils follow the gold curve of their depth). */
export const fuseCost = (b) => (GEMS[b.gem].sigil ? sigilFuseCost(b.tier) : gemFuseCost(b.tier));
/** Fuse three gems of the stack at bag index i into one of the next grade. */
export function fuseGem(c, i) {
  const b = c.bag[i];
  if (!b || b.type !== 'gem' || (b.count || 1) < 3 || b.tier >= gemMaxTier(b.gem)) return false;
  const cost = fuseCost(b);
  if (c.gold < cost) return false;
  c.gold -= cost;
  b.count = (b.count || 1) - 3;
  if (b.count <= 0) c.bag[i] = null;
  addToBag(c, makeGem(b.gem, b.tier + 1));
  return true;
}
/** Fuse every stack of three, lowest grades first, until nothing more fuses (or gold runs out). Returns fusions. */
export function fuseAll(c, budget = Infinity, keepSigils = false) {
  let n = 0;
  for (let guard = 0; guard < 200; guard++) {
    let best = -1;
    c.bag.forEach((b, i) => { if (b && b.type === 'gem' && !b.locked && !(keepSigils && GEMS[b.gem].sigil) && (b.count || 1) >= 3 && b.tier < gemMaxTier(b.gem) && fuseCost(b) <= Math.min(c.gold, budget) && (best < 0 || b.tier < c.bag[best].tier)) best = i; });
    if (best < 0) break;
    budget -= fuseCost(c.bag[best]);
    fuseGem(c, best); n++;
  }
  return n;
}

export { pick, GEMS };
