// The town storage chest: 300 slots shared by nothing but this hero. Right-click moves items between it and the bag.
import { G } from '../state.js';
import { el, fmtInt } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI, draggable, droppable } from './ui.js';
import { itemCell, itemTooltip, rarityClass } from './itemui.js';
import { changed, renderInventory } from './inventory.js';
import { addToBag } from '../game/player.js';
import { itemName } from '../data/items.js';

export const STASH_SIZE = 300;

/** Put an item in the chest (gems stack). */
export function addToStash(c, item) {
  if (!c.stash) c.stash = Array(STASH_SIZE).fill(null);
  if (item.type === 'gem') {
    const same = c.stash.find((b) => b && b.type === 'gem' && b.gem === item.gem && b.tier === item.tier);
    if (same) { same.count = (same.count || 1) + (item.count || 1); return true; }
  }
  const i = c.stash.findIndex((b) => !b);
  if (i < 0) return false;
  c.stash[i] = item;
  return true;
}

const TYPE_ORDER = ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ring'];
/** Chest order: by type (weapons, off-hands, armor head to feet, rings, then gems by kind), or by rarity first. */
export function sortStash(c, by = 'type') {
  const kind = (it) => (it.type === 'gear' ? TYPE_ORDER.indexOf(it.slot) + 1 || 9 : it.type === 'gem' ? 10 : 11);
  const items = c.stash.filter(Boolean).sort((a, b) => {
    const k = kind(a) - kind(b), r = (b.rarity || 0) - (a.rarity || 0);
    return (by === 'rarity' ? r || k : k || r) || (a.gem || '').localeCompare(b.gem || '') || (b.tier || 0) - (a.tier || 0) || (b.ilvl || 0) - (a.ilvl || 0);
  });
  c.stash = c.stash.map((_, i) => items[i] || null);
}

export const Stash = {
  active: false,
  filter: 'all',
  query: '',
  selected: null,
  open() {
    UI.closeAll();
    this.active = true;
    sfx('ui');
    UI.openPanel('stash', 'Storage Chest', (b) => this.render(b), { onClose: () => { this.active = false; UI.closePanel('inventory'); }, cls: 'stash-panel' });
    UI.openPanel('inventory', 'Your Inventory', renderInventory);
  },
  /** Bag slot -> chest. */
  store(idx) {
    const c = G.char, it = c.bag[idx];
    if (!it) return false;
    if (!addToStash(c, it)) { UI.log('The storage chest is full.', '#ff8080'); sfx('error'); return false; }
    delete it.autoStash; // the player stored it: auto-play leaves it be (game/autoplay.js unstash)
    c.bag[idx] = null;
    sfx('pickup'); UI.selected = null; changed();
    return true;
  },
  /** Chest slot -> bag. */
  take(idx) {
    const c = G.char, it = c.stash[idx];
    if (!it) return false;
    if (!addToBag(c, it)) { UI.log('Inventory full.', '#ff8080'); sfx('error'); return false; }
    c.stash[idx] = null;
    if (this.selected === idx) this.selected = null;
    sfx('pickup'); changed();
    return true;
  },
  render(body) {
    const c = G.char;
    if (!c.stash) c.stash = Array(STASH_SIZE).fill(null);
    body.innerHTML = '';
    const used = c.stash.filter(Boolean).length;
    const head = el('div', 'row storage-toolbar', `<strong>${fmtInt(used)} / ${STASH_SIZE}</strong><span class="dim">slots used</span>`);
    for (const [by, label] of [['type', 'Sort by type'], ['rarity', 'Sort by rarity']]) {
      const b = el('button', 'btn small', label);
      b.onclick = () => { sortStash(c, by); this.selected = null; sfx('ui'); UI.selected = null; changed(); };
      head.appendChild(b);
    }
    body.appendChild(head);
    const tools = el('div', 'storage-filters');
    const kind = el('select', 'storage-select', '<option value="all">All items</option><option value="gear">Gear</option><option value="gem">Gems</option>');
    kind.value = this.filter;
    const search = el('input', 'storage-search');
    search.type = 'search'; search.placeholder = 'Search stored items'; search.value = this.query;
    tools.append(kind, search);
    body.appendChild(tools);
    const transfer = el('div', 'storage-dropzone', 'Drop a backpack item here to store it · Right-click a stored item to take it');
    droppable(transfer, (data) => data.type === 'item' && data.where === 'bag' ? this.store(data.idx) : false, (data) => data.type === 'item' && data.where === 'bag');
    body.appendChild(transfer);
    const grid = el('div', 'bag stash-grid');
    c.stash.forEach((it, i) => {
      const d = el('div', 'bslot ' + rarityClass(it));
      if (this.selected === i) d.classList.add('sel');
      if (it) d.appendChild(itemCell(it));
      d.dataset.kind = it?.type || 'empty';
      d.dataset.name = it ? itemName(it).toLowerCase() : '';
      draggable(d, { key: 'stash:' + i, data: () => (c.stash[i] ? { type: 'stash', idx: i } : null), icon: () => d.querySelector('img') && d.querySelector('img').src, onClick: () => { if (c.stash[i]) { this.selected = i; this.render(body); } }, onRight: () => this.take(i), onDouble: () => this.take(i) });
      droppable(d, (data) => (data.type === 'item' && data.where === 'bag' ? this.store(data.idx) : false), (data) => data.type === 'item' && data.where === 'bag');
      if (it) UI.tip(d, () => itemTooltip(c.stash[i], { hint: 'Right-click to take' }));
      grid.appendChild(d);
    });
    body.appendChild(grid);
    const selected = c.stash[this.selected];
    let detail;
    if (selected) {
      detail = el('div', 'storage-detail', itemTooltip(selected));
      const take = el('button', 'btn small', 'Take to backpack');
      take.onclick = () => this.take(this.selected);
      detail.appendChild(take);
      body.appendChild(detail);
    }
    const applyFilter = () => {
      const filtered = this.filter !== 'all' || !!this.query;
      for (const cell of grid.children) {
        const match = cell.dataset.kind !== 'empty' && (this.filter === 'all' || cell.dataset.kind === this.filter) && cell.dataset.name.includes(this.query);
        cell.hidden = filtered && !match;
      }
      grid.classList.toggle('filtered', filtered);
      if (detail) detail.hidden = filtered && ((this.filter !== 'all' && selected.type !== this.filter) || !itemName(selected).toLowerCase().includes(this.query));
    };
    kind.onchange = () => { this.filter = kind.value; applyFilter(); };
    search.oninput = () => { this.query = search.value.trim().toLowerCase(); applyFilter(); };
    applyFilter();
  },
};
