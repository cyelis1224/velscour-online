// Item cells and tooltip HTML.
import { G } from '../state.js';
import { el, escapeHtml, fmtInt, fmtDmg } from '../core/util.js';
import { shownWeapon, shownDmg, heroDmgLevel } from '../data/depth.js';
import { SKILLS, effLevel } from '../data/skills.js';
import { itemName, itemBaseLine, itemColor, itemStats, itemDmg, itemArmor, statLabel, RARITY, GEMS, gemStats, gemName, LEGENDARY, legendaryDesc, powerLevel, SLOT_NAMES, POTION_INFO, MAX_GEM_TIER, augTarget } from '../data/items.js';
import { AUGMENTS } from '../data/rings.js';
import { elem } from '../gfx/vfx.js';
import { CLASSES } from '../data/classes.js';
import { itemIconURL } from './icons.js';
import { finishOf, gearFxOf } from '../core/gearart.js';
import { readSheet, sheetTempo } from '../data/tabs.js';
import { keyName } from '../data/melodies.js';
import { RELIC_COLORS, RELIC_NAMES, SIGILS, SIGIL_MAX, sigilStats, sigilCap } from '../data/items.js';
import { HEIRLOOM_BY_ID, COVENANT_BY_ID, PIECE_BY_ID, POWERS, GLYPHWORDS, glyphOf, wornSets, powerText, lineValue, TUNE } from '../data/relics.js';

// weapon figures (an item's Damage, flat weapon damage) on the weapon scale of the hero's depth (data/depth.js); thorns
// are already on the shown scale (combat.js)
const shown = (v) => fmtDmg(shownWeapon(v, heroDmgLevel(G.char)));
const label = (s, v, trees) => statLabel(s, s === 'flatDmg' ? shown(v) : v, trees);

/** A damaging augment's damage on this hero, on the shown scale: its share of the targeted skill's hit (or of the
 *  plaque's Attack, for "all skills" and kinds), so a ring reads like a skill ("≈ 9.4K a meteor"). */
function augDamage(p, a, A) {
  if (!p || !A.hit) return '';
  const sk = a.sk && SKILLS[a.sk];
  let base = 0, on = '';
  if (sk && (p.char.skills[a.sk] || 0) > 0) { const d = p.skillDamage(sk, Math.max(1, effLevel(p, sk))); base = (d[0] + d[1]) / 2; on = `${sk.name}'s`; }
  else if (!sk && G.ui.hud && G.ui.hud.sheet) { base = G.ui.hud.sheet.atk; on = 'your Attack'; }
  if (!(base > 0)) return '';
  const [k, what] = A.hit(a.pow), L = heroDmgLevel(p.char);
  return `<div class="tt-augdmg">≈ <b>${fmtDmg(shownDmg(base * k, L))}</b> ${escapeHtml(what)} <span class="dim">(on ${escapeHtml(on)} ${fmtDmg(shownDmg(base, L))} hit)</span></div>`;
}

export function itemCell(item) {
  const d = el('div', 'itemicon');
  if (!item) return d;
  const img = new Image();
  img.src = itemIconURL(item);
  img.draggable = false;
  img.style.width = '100%'; img.style.height = '100%'; img.style.imageRendering = 'pixelated';
  d.appendChild(img);
  if (item.type === 'gem' && (item.count || 1) > 1) d.appendChild(el('span', 'stack', 'x' + item.count));
  if (item.upg) d.appendChild(el('span', 'upg', '+' + item.upg));
  if (item.type === 'gear' && item.sockets) {
    const s = el('div', 'socks');
    for (let i = 0; i < item.sockets; i++) s.appendChild(el('i', item.gems[i] ? 'f' : ''));
    d.appendChild(s);
  }
  if (item.unid) d.appendChild(el('span', 'upg', '?'));
  if (item.sealed) d.classList.add('sealed');
  if (item.locked) { const k = el('span', 'lockb', '🔒'); k.style.cssText = 'position:absolute;left:1px;top:0;font-size:10px;line-height:1;filter:drop-shadow(0 0 2px #000);pointer-events:none'; d.appendChild(k); }
  return d;
}

export function rarityClass(item) {
  if (!item) return '';
  if (item.type === 'gem') return GEMS[item.gem].sigil ? 'rsig' : GEMS[item.gem].special ? 'r4' : 'r2';
  if (item.type !== 'gear') return 'r0';
  if (item.sealed) return 'rs';
  if (item.relic) return 'r' + item.relic;
  return glyphOf(item) ? 'rglyph' : 'r' + item.rarity;
}

export function itemTooltip(item, opts = {}) {
  if (!item) return '';
  const p = G.player;
  const trees = p ? CLASSES[p.classId].trees : null;
  const col = itemColor(item);
  let h = `<div class="tt-name" style="color:${col}">${escapeHtml(item.unid ? 'Unidentified ' + SLOT_NAMES[item.slot] : itemName(item))}</div>`;
  if (item.locked) h += '<div class="tt-base" style="color:#ffd860">🔒 Locked: auto-play never equips, swaps, sells, stores or changes it, and you can\'t sell or drop it</div>';
  if (item.type === 'gem' && GEMS[item.gem].sigil) {
    const r = item.tier, S = SIGILS[r];
    h += `<div class="tt-base">Sigil Stone · Rank ${r + 1} of ${SIGIL_MAX + 1} · drops from Depth ${r * 24 || 1}${item.count > 1 ? ` · Stack of ${item.count}` : ''}</div><div class="tt-sep"></div>`;
    for (const [where, slot] of [['Weapon', 'weapon'], ['Armor, helm, shield', 'body'], ['Ring', 'ring']]) for (const [s, v] of sigilStats(r, slot)) h += `<div class="tt-gem">${where}: ${escapeHtml(label(s, v, trees))}</div>`;
    const uses = GLYPHWORDS.filter((w) => w.sig.includes(r)).map((w) => w.name);
    h += `<div class="tt-sep"></div><div class="dim">Socket it like a gem. Set Sigils in the right order in a plain (white) item with exactly that many sockets to write a Glyphword${uses.length ? ` (${uses.slice(0, 4).map(escapeHtml).join(', ')}${uses.length > 4 ? '…' : ''})` : ''}.${r < SIGIL_MAX ? ` Fuse 3 at the Gem Forge for one ${SIGILS[r + 1].name}.` : ''}</div>`;
    void S;
  } else if (item.type === 'gem') {
    const g = GEMS[item.gem];
    h += `<div class="tt-base">${g.special ? 'Rare Pattern Gem' : 'Gem'} · Grade ${item.tier + 1}/${MAX_GEM_TIER + 1}${item.count > 1 ? ` · Stack of ${item.count}` : ''}</div>`;
    for (const [s, v] of gemStats(item.gem, item.tier)) h += `<div class="tt-gem">${escapeHtml(label(s, v, trees))}</div>`;
    h += `<div class="tt-sep"></div><div class="dim">Drag onto gear with a free socket to insert.${item.tier < MAX_GEM_TIER ? ' Fuse 3 (or refine 1) at the Gem Forge (Gem Merchant) for the next grade.' : ''}</div>`;
  } else if (item.type === 'potion') {
    h += `<div class="dim">${POTION_INFO[item.kind]}</div>`;
  } else if (item.type === 'sheet') {
    const r = item.text.trim() ? readSheet(item.text) : null;
    h += `<div class="tt-base">Music Sheet · ${item.inked ? 'Locked' : r ? 'Draft' : 'Blank'}</div>`;
    if (r && r.ev) h += `<div>${fmtInt(r.ev.length)} notes · ${keyName(r.key)} · ${sheetTempo(item, r)} BPM</div>`;
    else if (r) h += `<div style="color:#ff8080">${escapeHtml(r.err)}</div>`;
    h += `<div class="tt-sep"></div><div class="dim">${item.inked ? "A Bard loads it into one of his five Tabs: every note his skills write takes the song's next note, whichever skill wrote it." : "Paste tablature or note names onto it, then lock it to keep the song. Only locked sheets go in a Bard's Tabs."}</div>`;
  } else if (item.sealed) {
    h += `<div class="tt-base">Epic or better · Item Level ${item.ilvl}</div><div style="color:${col}">What lies inside is anyone's guess until the seal is broken.</div><div class="tt-sep"></div><div class="dim">${G.touch ? 'Tap' : 'Click'} <b>Break the Seal</b>, or the SEALED button on the HUD. It can't be sold or worn sealed.</div>`;
  } else {
    if (item.unid) {
      h += `<div class="tt-base">${SLOT_NAMES[item.slot]} · Item Level ${item.ilvl}</div><div class="dim">Its true nature is revealed once purchased.</div>`;
    } else {
      const gw = glyphOf(item), kind = item.relic || (gw ? 'glyph' : null);
      if (gw) h += `<div class="tt-base" style="color:${RELIC_COLORS.glyph}">'${gw.sig.map((r) => SIGILS[r].name).join(' · ')}'</div>`;
      h += `<div class="tt-base">${escapeHtml(itemBaseLine(item))} · ${kind ? `<b style="color:${RELIC_COLORS[kind]}">${RELIC_NAMES[kind]}</b>` : RARITY[item.rarity].name} ${SLOT_NAMES[item.slot]} · iLvl ${item.ilvl} · <span title="Item level + the rarity's worth in levels: what the item's numbers are rolled at">Power ${powerLevel(item.ilvl, item.rarity)}</span></div>`;
      const fin = finishOf(item), gfx = gearFxOf(item);
      if (fin || gfx) h += `<div class="dim" style="font-style:italic">${fin ? escapeHtml(fin.name) + ' finish' : ''}${fin && gfx ? ' · ' : ''}${gfx ? 'Aura: ' + escapeHtml(gfx.name) : ''}</div>`;
      if (item.dmg) { const [a, b] = itemDmg(item); h += `<div>Damage: <b>${shown(a)}–${shown(b)}</b>${cmp(opts.compare, item, 'dmg')}</div>`; }
      if (item.armor) h += `<div>Armor: <b>${fmtInt(itemArmor(item))}</b>${cmp(opts.compare, item, 'armor')}</div>`;
      if (item.upg) h += `<div style="color:#ffd34a">Upgraded +${item.upg}</div>`;
      const req = item.req || 1;
      h += `<div style="color:${p && p.char.level < req ? '#ff5050' : '#a8977c'}">Requires Level ${req}</div>`;
      h += '<div class="tt-sep"></div>';
      for (const a of item.affixes) h += `<div class="tt-line" style="color:${a.implicit ? '#d8d0c0' : a.perk ? '#d8c078' : '#8fb4ff'}">${escapeHtml(label(a.s, a.v, trees))}</div>`;
      if (item.aug) for (const a of item.aug) {
        const A = AUGMENTS[a.id], col = elem(A.el).glow, has = !a.sk || (p && p.char.skills[a.sk]);
        h += `<div class="tt-aug" style="border-left:3px solid ${col};padding-left:6px;margin:4px 0"><b style="color:${col}">${A.name}</b> <span class="dim">· ${escapeHtml(augTarget(a))}${has ? '' : ' (not learned)'}</span><div style="color:#e8d8b8;font-size:12px">${escapeHtml(A.desc(a.pow))}</div>${augDamage(p, a, A)}</div>`;
      }
      if (item.legendary) {
        const L = LEGENDARY[item.legendary];
        h += `<div class="tt-leg"><b>${L.name}:</b> ${escapeHtml(legendaryDesc(item))}</div>`;
      }
      h += relicLines(item, trees);
      if (item.maxSockets) {
        h += `<div class="tt-sep"></div><div class="dim">Sockets: ${item.sockets}/${item.maxSockets}</div>`;
        for (let i = 0; i < item.sockets; i++) {
          const g = item.gems[i];
          if (g) h += `<div class="tt-gem">◆ ${escapeHtml(gemName(g.gem, g.tier))}: ${gemStats(g.gem, g.tier, item.slot).map(([s, v]) => escapeHtml(label(s, v, trees))).join(', ')}</div>`;
          else h += '<div class="dim">◇ Empty socket</div>';
        }
      }
    }
  }
  if (opts.price) h += `<div class="tt-price">${opts.priceLabel || 'Price'}: ${fmtInt(opts.price)} gold</div>`;
  if (opts.hint) h += `<div class="dim" style="margin-top:4px;font-size:12px">${opts.hint}</div>`;
  return h;
}

function cmp(other, item, kind) {
  if (!other || other === item) return '';
  if (kind === 'dmg' && other.dmg) {
    const a = itemDmg(item), b = itemDmg(other);
    const d = (a[0] + a[1]) / 2 - (b[0] + b[1]) / 2;
    return Math.abs(shownWeapon(d, heroDmgLevel(G.char))) >= 0.05 ? ` <span class="${d > 0 ? 'cmp-up' : 'cmp-down'}">(${d > 0 ? '+' : ''}${shown(d)})</span>` : '';
  }
  if (kind === 'armor' && other.armor !== undefined) {
    const d = itemArmor(item) - itemArmor(other);
    return d ? ` <span class="${d > 0 ? 'cmp-up' : 'cmp-down'}">(${d > 0 ? '+' : ''}${fmtInt(d)})</span>` : '';
  }
  return '';
}

export { itemStats };

/** Heirloom power and flavour, Covenant set list and bonuses, Glyphword lines and power (data/relics.js). */
function relicLines(item, trees) {
  let h = '';
  const pl = powerLevel(item.ilvl, 5);
  if (item.relic === 'heir') {
    const H = HEIRLOOM_BY_ID[item.rid];
    if (!H) return '';
    const P = POWERS[H.power];
    h += `<div class="tt-leg" style="color:${RELIC_COLORS.heir}"><b>${P.name}:</b> ${escapeHtml(powerText(P, pl))}</div>`;
    h += `<div class="dim" style="font-style:italic;margin-top:4px">"${escapeHtml(H.flavor)}"</div>`;
  } else if (item.relic === 'cov') {
    const C = COVENANT_BY_ID[item.cset];
    if (!C) return '';
    const eq = G.char ? G.char.equip : {};
    const worn = new Set(Object.values(eq).filter((x) => x && x.relic === 'cov').map((x) => x.rid));
    const w = wornSets(eq)[C.id] || { n: 0, ilvl: item.ilvl };
    const col = RELIC_COLORS.cov;
    h += `<div class="tt-sep"></div><div style="color:${col};font-family:var(--font-head)">${escapeHtml(C.name)} (${w.n}/${C.pieces.length})</div>`;
    for (const p of C.pieces) h += worn.has(p.id) ? `<div style="color:${col}">✔ ${escapeHtml(p.name)}</div>` : `<div class="dim">✗ ${escapeHtml(p.name)}</div>`;
    h += '<div class="tt-sep"></div>';
    const lvl = w.n ? w.ilvl : item.ilvl;
    C.bonus.forEach(([s, k], i) => { const on = w.n >= i + 2; h += `<div style="color:${on ? col : '#7a7060'}">(${i + 2}) ${escapeHtml(label(s, lineValue(s, lvl, k * TUNE.set), trees))}</div>`; });
    const P = POWERS[C.power];
    h += `<div style="color:${w.n >= 5 ? col : '#7a7060'}">(5) <b>${P.name}:</b> ${escapeHtml(powerText(P, powerLevel(lvl, 3)))}</div>`;
    h += '<div class="dim" style="font-size:12px">Set bonuses follow the lowest item level among the pieces you wear.</div>';
  } else {
    const gw = glyphOf(item);
    if (!gw) return '';
    const col = RELIC_COLORS.glyph;
    h += `<div class="tt-sep"></div><div style="color:${col};font-family:var(--font-head)">Glyphword: ${escapeHtml(gw.name)}</div>`;
    for (const s of gw.lines) h += `<div class="tt-line" style="color:${col}">${escapeHtml(label(s, lineValue(s, item.ilvl, gw.k * TUNE.glyph), trees))}</div>`;
    for (const [s, v] of gw.extra || []) h += `<div class="tt-line" style="color:${col}">${escapeHtml(label(s, v, trees))}</div>`;
    if (gw.power) { const P = POWERS[gw.power]; h += `<div class="tt-leg" style="color:${col}"><b>${P.name}:</b> ${escapeHtml(powerText(P, pl))}</div>`; }
  }
  return h;
}
