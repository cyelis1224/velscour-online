// Town Commissions: quest lines from the people of Herrington Hollow. Up to three are open at once; a new one is
// offered on arriving in town once the hero has gone deep enough. Each chapter names where it happens: when a depth's
// portal opens on that biome (the three-portal choice favours it), its objective joins the Quest Log for that depth.
// kinds: relic (find and use n objects placed in the level), elite (slay n champions, uniques or bosses there),
// raid (defeat a BOSS ROOM's lord), clear (clear a depth of that biome: towers, airships, overworlds).
// Rewards: gold, Sigil Stones and often a Covenant piece per chapter; a Heirloom and progress toward the Reliquary's
// vaults (game/reliquary.js) for a finished line. State: G.char.comm = {open: [{id, ch, n}], done: [ids]}.
import { G } from '../state.js';
import { rand, chance, pick, escapeHtml, fmtInt } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { addEffect, Ring, glowSprite, sparkle, floatText } from '../gfx/vfx.js';
import { isoX, isoY } from '../core/view.js';
import { goldPile, rollSigil, itemName, itemColor } from '../data/items.js';
import { makeHeirloom, makeCovenant } from '../data/relics.js';
import { depthLevel, FINAL_DEPTH } from '../data/depth.js';
import { BIOME_BY_ID } from '../data/biomes.js';
import { addToBag } from './player.js';
import { noteLineDone } from './reliquary.js';
import { GroundItem } from './loot.js';

export const LINES = [
  { id: 'bells', name: 'The Hollow Bells', giver: 'Brother Anselm', min: 0, pitch: 'The chapel bells went silent the night the portal opened. Bring their voices home.', chapters: [
    { kind: 'relic', biome: 'cathedral', n: 3, obj: 'Silent Bell', text: 'ring the three silent bells' },
    { kind: 'elite', n: 5, text: 'silence the bell-thieves: slay 5 champions, uniques or guardians' },
    { kind: 'relic', biome: 'necropolis', n: 3, obj: 'Bell Rope', text: 'cut down the three bell ropes hung from the tombs' },
    { kind: 'relic', biome: 'library', n: 1, obj: "Bellmaker's Ledger", text: "recover the bellmaker's ledger" },
  ] },
  { id: 'skythieves', name: "Sky-Thieves' Ledger", giver: 'Quartermaster Ilse', min: 15, pitch: 'Pirates lifted my ledger and half my stock. Bring me the captain\'s book and I\'ll make it worth your while.', chapters: [
    { kind: 'clear', biome: 'sea_of_sand', text: 'recover the stolen crates: complete a Sea of Sand route' },
    { kind: 'clear', biome: 'serpentine_tower', text: 'take the ledger from the pirate captain on the Tower roof' },
    { kind: 'clear', biome: 'skyship', text: "end the pirates' raid on the heroes' airship" },
  ] },
  { id: 'hoard', name: "The Lapidary's Lost Hoard", giver: 'Zafir the Lapidary', min: 40, pitch: 'My grandmother\'s hoard was scattered across the deep places. I will pay in stones for every piece.', chapters: [
    { kind: 'relic', biome: 'crystal', n: 3, obj: 'Raw Geode', text: 'pry three raw geodes from the walls' },
    { kind: 'relic', biome: 'gilded', n: 2, obj: 'Gem Coffer', text: 'open two of her gem coffers' },
    { kind: 'elite', n: 8, text: 'the thieves who split the hoard: slay 8 champions, uniques or guardians' },
    { kind: 'clear', biome: 'depths_edge', text: 'find her sunken chest at the foot of the falls: clear the Caverns' },
    { kind: 'relic', biome: 'forge', n: 3, obj: 'Cutting Wheel', text: 'bring back her three cutting wheels' },
  ] },
  { id: 'choir', name: 'The Drowned Choir', giver: 'Widow Marrow', min: 80, pitch: 'They sang as the water rose. I would hear the hymn once more before I go.', chapters: [
    { kind: 'relic', biome: 'sunken', n: 3, obj: 'Hymnal Page', text: 'gather three pages of the drowned hymnal' },
    { kind: 'relic', biome: 'serpent', n: 3, obj: 'Drowned Psalter', text: 'free three psalters from the serpent shrines' },
    { kind: 'elite', n: 10, text: 'quiet the drowned: slay 10 champions, uniques or guardians' },
    { kind: 'relic', biome: 'abyss', n: 1, obj: 'The Last Hymn', text: 'find the last verse at the bottom of the rift' },
  ] },
  { id: 'oldguard', name: 'The Old Guard', giver: 'Captain Roderick Vane', min: 150, pitch: 'My regiment fell holding the keep. Their colours are still down there. So is my pride.', chapters: [
    { kind: 'relic', biome: 'castle_keep', n: 3, obj: 'Regimental Banner', text: 'raise three regimental banners in the keep' },
    { kind: 'clear', biome: 'castle', text: 'retake the Castle' },
    { kind: 'elite', n: 12, text: 'avenge the regiment: slay 12 champions, uniques or guardians' },
    { kind: 'relic', biome: 'shattered', n: 3, obj: 'Fallen Shield', text: 'recover three fallen shields from the citadel' },
  ] },
  { id: 'seventh', name: 'The Seventh Seal', giver: 'Scholar Thessaly', min: 250, pitch: 'Velscour was bound by seven seals. Six broke. Help me understand why the seventh still holds.', chapters: [
    { kind: 'relic', biome: 'library', n: 3, obj: 'Forbidden Folio', text: 'steal three forbidden folios' },
    { kind: 'relic', biome: 'void', n: 3, obj: 'Seal Fragment', text: 'gather three seal fragments from the void' },
    { kind: 'relic', biome: 'obsidian', n: 3, obj: 'Seal Fragment', text: 'gather three seal fragments from the obsidian vault' },
    { kind: 'raid', n: 1, text: 'defeat the lord of a BOSS ROOM and take its sigil' },
    { kind: 'relic', biome: 'ashen', n: 1, obj: 'The Seventh Seal', text: 'find the seventh seal in the ashen wastes' },
  ] },
];
export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
export const MAX_OPEN = 3;

export function commState(c = G.char) {
  if (!c.comm) c.comm = { open: [], done: [] };
  return c.comm;
}
const chapterOf = (e) => LINE_BY_ID[e.id] && LINE_BY_ID[e.id].chapters[e.ch];
/** Does chapter ch happen in world w (its biome, or anywhere for chapters without one)? */
const here = (ch, w) => !!ch && !!w && w.kind === 'dungeon' && !w.breach && !w.rift && !w.unbound && (!ch.biome || (w.biome && w.biome.id === ch.biome)) && (ch.kind !== 'raid' || !!w.raid);
/** The biomes open chapters are waiting for (the portal choice favours them). */
export function wantedBiomes(c = G.char) {
  return commState(c).open.map(chapterOf).filter((ch) => ch && ch.biome).map((ch) => ch.biome);
}

/** In town: offer the next lines the hero has earned, up to MAX_OPEN open. */
export function offerCommissions(c = G.char) {
  const s = commState(c), deep = c.deepest || 0;
  for (const L of LINES) {
    if (s.open.length >= MAX_OPEN) break;
    if (deep < L.min || s.done.includes(L.id) || s.open.some((e) => e.id === L.id)) continue;
    s.open.push({ id: L.id, ch: 0, n: 0 });
    G.ui.log(`<b style="color:#8fe0ff">${escapeHtml(L.giver)}</b> has a commission for you: <b style="color:#8fe0ff">${escapeHtml(L.name)}</b>. <span class="dim">"${escapeHtml(L.pitch)}"</span> (Quest Log, Q)`, '#c8e8ff');
  }
}

/** A new dungeon level: place this depth's commission objects and say what's asked here. */
export function setupCommissions(world, start) {
  const c = G.char;
  if (!c || world.kind !== 'dungeon' || world.breach) return;
  for (const e of commState(c).open) {
    const ch = chapterOf(e);
    if (!here(ch, world)) continue;
    const L = LINE_BY_ID[e.id];
    G.ui.log(`<b style="color:#8fe0ff">Commission — ${escapeHtml(L.name)}:</b> ${escapeHtml(ch.text)}${ch.n > 1 && ch.kind !== 'relic' ? ` (${e.n}/${ch.n})` : ''}.`, '#c8e8ff');
    if (ch.kind === 'relic') placeObjects(world, start, e, ch);
  }
}

function placeObjects(world, start, e, ch) {
  const m = world.map, rooms = (world.rooms || []).slice().sort(() => Math.random() - 0.5);
  const spots = [];
  const far = (x, y) => !start || Math.hypot(x - start[0], y - start[1]) > 10;
  for (const r of rooms) {
    if (spots.length >= ch.n) break;
    for (let tries = 0; tries < 12; tries++) {
      const x = r.x + 1 + Math.floor(rand(0, Math.max(1, r.w - 2))) + 0.5, y = r.y + 1 + Math.floor(rand(0, Math.max(1, r.h - 2))) + 0.5;
      if (m.walkable(x, y) && far(x, y) && spots.every(([a, b]) => Math.hypot(a - x, b - y) > 8)) { spots.push([x, y]); break; }
    }
  }
  // too few rooms: anywhere on the floor a fair walk from the start
  for (let tries = 0; spots.length < ch.n && tries < 400; tries++) {
    const x = Math.floor(rand(1, m.w - 1)) + 0.5, y = Math.floor(rand(1, m.h - 1)) + 0.5;
    if (m.walkable(x, y) && far(x, y) && (!start || m.reachable === undefined || m.reachable(start[0], start[1], x, y))) spots.push([x, y]);
  }
  for (const [x, y] of spots) {
    world.chests.push({
      commission: e.id, x, y, reach: 1.4, far: 70, label: ch.obj, dot: '#8fe0ff', opened: false,
      use() {
        if (this.opened) return;
        this.opened = true;
        sfx('chest'); sparkle(this.x, this.y, 30, '#8fe0ff', 18, 0.6);
        addEffect(new Ring(this.x, this.y, 0.2, 1.6, 0.6, '#8fe0ff', 3));
        progress(e, 1, `${ch.obj}`);
      },
      draw(ctx, sx, sy) {
        if (this.opened) return;
        const t = G.time, b = Math.sin(t * 3 + this.x) * 3;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 + Math.sin(t * 4) * 0.15;
        ctx.drawImage(glowSprite('#8fe0ff'), sx - 26, sy - 44 + b, 52, 52);
        ctx.restore();
        ctx.save(); ctx.translate(sx, sy - 22 + b);
        ctx.fillStyle = '#10202a'; ctx.strokeStyle = '#8fe0ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(9, 0); ctx.lineTo(0, 12); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8f4ff'; ctx.font = '700 12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 1);
        ctx.restore();
      },
    });
  }
}

/** Kills: champions, uniques and guardians count for elite chapters; a BOSS ROOM's lord for raid chapters. */
export function commissionKill(world, m) {
  const c = G.char;
  if (!c || !c.comm || !c.comm.open.length || m.team !== 'enemy') return;
  const elite = m.rank === 'champion' || m.rank === 'unique' || m.rank === 'boss' || m.isRaid;
  if (!elite) return;
  for (const e of c.comm.open.slice()) {
    const ch = chapterOf(e);
    if (!here(ch, world)) continue;
    if (ch.kind === 'elite' || (ch.kind === 'raid' && m.isRaid)) progress(e, 1, m.name);
  }
}
/** A depth cleared (game.brokeThrough): clear chapters of its biome. */
export function commissionClear(world) {
  const c = G.char;
  if (!c || !c.comm) return;
  for (const e of c.comm.open.slice()) { const ch = chapterOf(e); if (ch && ch.kind === 'clear' && here(ch, world)) progress(e, 1); }
}

function progress(e, k, what) {
  const c = G.char, L = LINE_BY_ID[e.id], ch = chapterOf(e);
  if (!ch) return;
  e.n += k;
  const need = ch.n || 1;
  if (e.n < need) {
    G.ui.log(`<b style="color:#8fe0ff">${escapeHtml(L.name)}:</b> ${what ? escapeHtml(what) + ' — ' : ''}${e.n}/${need}.`, '#c8e8ff');
    if (G.player) floatText(G.player.x, G.player.y, 80, `${e.n}/${need}`, '#8fe0ff', 14, { life: 1.4 });
    return;
  }
  // chapter done
  const depth = (G.world && G.world.depth) || c.depth || 1, lvl = depthLevel(Math.min(depth, FINAL_DEPTH));
  const gold = Math.round(goldPile(lvl) * 25);
  c.gold += gold;
  const gifts = [rollSigil(depth, 1), rollSigil(depth, 1)];
  if (chance(0.4) || e.ch === L.chapters.length - 1) { const cov = makeCovenant(lvl + 1); if (cov) gifts.push(cov); }
  e.ch++; e.n = 0;
  const last = e.ch >= L.chapters.length;
  if (last) {
    const h = makeHeirloom(lvl + 2) || makeCovenant(lvl + 2);
    if (h) gifts.push(h);
    const s = commState(c);
    s.open = s.open.filter((x) => x !== e);
    s.done.push(e.id);
    noteLineDone();
  }
  for (const it of gifts) if (!addToBag(c, it) && G.world && G.player) G.world.addLoot(new GroundItem(G.player.x, G.player.y, 'item', { item: it }));
  sfx('levelup');
  G.ui.centerMsg(last ? 'COMMISSION COMPLETE' : 'CHAPTER COMPLETE', `${L.name}${last ? '' : ` · chapter ${e.ch} of ${L.chapters.length}`}`, 3);
  G.ui.log(`<b style="color:#8fe0ff">${escapeHtml(L.name)}</b> — ${last ? 'the commission is complete' : `chapter ${e.ch} complete`}. ${escapeHtml(L.giver)} sends <span class="gold-text">${fmtInt(gold)} gold</span> and ${gifts.map((it) => `<span style="color:${itemColor(it)}">${escapeHtml(itemName(it))}</span>`).join(', ')}.`, '#c8e8ff');
  if (!last) { const nx = chapterOf(e); if (nx) G.ui.log(`Next: ${nx.biome ? `when the portal opens on <b>${escapeHtml(BIOME_BY_ID[nx.biome] ? BIOME_BY_ID[nx.biome].name : nx.biome)}</b>, ` : ''}${escapeHtml(nx.text)}.`, '#c8e8ff'); }
  G.ui.refresh && G.ui.refresh();
}

/** Quest Log section (ui/quest.js). */
export function commissionsHtml(c, w, step) {
  const s = commState(c);
  let h = '<div class="q-sec"><h3>Town Commissions</h3>';
  if (!s.open.length) {
    const next = LINES.find((L) => !s.done.includes(L.id) && (c.deepest || 0) < L.min);
    h += `<div class="dim q-note">${s.done.length >= LINES.length ? 'Every commission is done. Herrington Hollow owes you more than it can say.' : next ? `None open. More work comes once you have cleared Depth ${next.min}.` : 'None open. Visit town for new work.'}</div></div>`;
    return h;
  }
  for (const e of s.open) {
    const L = LINE_BY_ID[e.id], ch = chapterOf(e);
    if (!ch) continue;
    h += `<div class="q-title" style="color:#8fe0ff">${escapeHtml(L.name)} <span class="dim" style="font:400 13px var(--font-body)">· ${escapeHtml(L.giver)} · Chapter ${e.ch + 1} of ${L.chapters.length}</span></div>`;
    for (let i = 0; i < e.ch; i++) { const d = L.chapters[i]; h += step(true, `${d.biome ? escapeHtml(BIOME_BY_ID[d.biome] ? BIOME_BY_ID[d.biome].name : d.biome) + ': ' : ''}${escapeHtml(d.text)}.`); }
    const on = here(ch, w), where = ch.biome ? (BIOME_BY_ID[ch.biome] ? BIOME_BY_ID[ch.biome].name : ch.biome) : null;
    const count = (ch.n || 1) > 1 || ch.kind === 'relic' ? ` (${e.n}/${ch.n || 1})` : '';
    h += step(false, on ? `<b style="color:#8fe0ff">This depth:</b> ${escapeHtml(ch.text)}${count}.` : where ? `Waiting for <b>${escapeHtml(where)}</b>: ${escapeHtml(ch.text)}${count}. Added to your log when a portal opens there.` : `At any depth: ${escapeHtml(ch.text)}${count}.`);
  }
  h += `<div class="dim q-note">${s.open.length} of ${LINES.length} lines open · ${s.done.length} finished. Chapters pay gold, Sigil Stones and Covenant pieces; a finished line pays a Heirloom.</div></div>`;
  return h;
}
export { pick };
