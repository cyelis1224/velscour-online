// Music Sheets (src/data/tabs.js, src/ui/sheets.js, the song path in src/game/bard.js):
//  1. the tab reader: guitar/bass/ukulele/drop-D tab, note names, chords, tempo lines, junk
//  2. Fortunato sells blank sheets to a Bard; a blank one opens with Ode to Joy on it; the editor takes a pasted tab,
//     locks it; it loads into a Tab
//  3. in a dungeon every written head and every landing takes the song's next note in order, whatever the skill;
//     a song that ends hands over to the next loaded Tab; "Play next" restarts a Tab; empty Tabs go back to the melodies
//  4. saves keep the Tabs (and old saves get five empty ones); auto-play never sells a sheet; a short auto-play soak
//  Shots: sheet_shop.png, sheet_starter.png, sheet_editor.png, sheet_tabs.png, sheet_bar.png (+ _mobile with the mobile arg)
//   node tools/tests/musicsheet.js [autoplay minutes, default 2] [mobile]
const { openGame, report, OUT_DIR } = require('./harness');
const minutes = +(process.argv[2] || 2);
const MOBILE = process.argv.includes('mobile'), SUF = MOBILE ? '_mobile' : '';
let bad = 0;
const fail = (m) => { console.log('FAIL ' + m); bad++; };

const ODE = `Ode to Joy
Tempo: 120
e|-0-0-1-3-3-1-0-------0-0---|-0-0-1-3-3-1-0-------0-----|
B|---------------3-1-1-----3-|---------------3-1-1---3-1-|
G|---------------------------|---------------------------|
D|---------------------------|---------------------------|
A|---------------------------|---------------------------|
E|---------------------------|---------------------------|`;

(async () => {
  const { browser, page, errors } = await openGame(MOBILE ? { width: 844, height: 390, mobile: true } : {});
  // ------------------------------------------------------------ 1. the reader
  const rd = await page.evaluate(async () => {
    const { parseTab } = await import('/src/data/tabs.js');
    const ev = (t) => { const r = parseTab(t); return r.err ? 'ERR' : r.ev.map((e) => e.join('+')).join(' '); };
    return {
      guitar: ev('e|-0-1-3-|\nB|-------|\nG|-------|\nD|-------|\nA|-------|\nE|-------|'),
      chord: ev('e|-0-|\nB|-1-|\nG|-0-|\nD|-2-|\nA|-3-|\nE|---|'),
      twoDigit: ev('e|-10-12-|\nB|-------|\nG|-------|\nD|-------|\nA|-------|\nE|-------|'),
      dropD: ev('e|----|\nB|----|\nG|----|\nD|----|\nA|----|\nD|-0--|'),
      bass: ev('G|-0-2-|\nD|-----|\nA|-----|\nE|-----|'),
      uke: ev('A|-0-|\nE|---|\nC|---|\nG|---|'),
      names: ev('C4 D4 E4 F4 G4 C4+E4+G4'),
      repeat: ev('e|-0-| x4\nB|---|\nG|---|\nD|---|\nA|---|\nE|---|'),
      junk: ev('just some words\nabout a song'),
      tempo: parseTab('Tempo: 96\nC D E F G').bpm,
      key: parseTab('G A B C D E F# G').key.id,
    };
  });
  const want = { guitar: '64 65 67', chord: '64+60+55+52', twoDigit: '62 64', dropD: '62', bass: '67 69', uke: '69', names: '60 62 64 65 67 67+64+60', repeat: '64', junk: 'ERR', tempo: 96, key: 'G' };
  for (const k in want) if (rd[k] !== want[k]) fail(`reader ${k}: got ${rd[k]}, want ${want[k]}`);
  console.log('reader: ' + JSON.stringify(rd));

  // ------------------------------------------------------------ 2. buy, write, lock, load
  const ui = await page.evaluate(async (ODE) => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('bard', 'Tabby');
    document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0;
    G.char.gold = 1000;
    const { Vendor } = await import('/src/ui/vendor.js');
    Vendor.restock(); Vendor.open('gamble');
    await new Promise((r) => setTimeout(r, 200));
    const buy = [...document.querySelectorAll('.panel .btn')].find((b) => b.textContent.startsWith('Buy 5'));
    if (!buy) return { err: 'no sheet row at Fortunato' };
    buy.click();
    return { gold: G.char.gold, sheets: G.char.bag.filter((b) => b && b.type === 'sheet').length };
  }, ODE);
  if (ui.err) fail(ui.err);
  if (ui.sheets !== 5 || ui.gold !== 900) fail(`buying 5 sheets: ${JSON.stringify(ui)}`);
  await page.screenshot({ path: `${OUT_DIR}/sheet_shop${SUF}.png` });
  const ed = await page.evaluate(async (ODE) => {
    const { G } = window.VELSCOUR;
    const { UI } = await import('/src/ui/ui.js'); UI.closeAll();
    const { useSheet } = await import('/src/ui/sheets.js');
    const idx = G.char.bag.findIndex((b) => b && b.type === 'sheet');
    useSheet(idx);
    await new Promise((r) => setTimeout(r, 100));
    const ta = document.querySelector('.sh-text');
    if (!ta) return { err: 'no editor' };
    // a blank sheet opens with the whole of Ode to Joy written on it, ready to edit
    const { STARTER } = await import('/src/ui/sheets.js');
    const starter = { same: ta.value === STARTER, status: document.querySelector('.sh-status').innerText, lock: !document.querySelector('.dialog-box .btn.red').disabled };
    return { starter, idx };
  }, ODE);
  if (ed.err) fail(ed.err);
  else {
    if (!ed.starter.same) fail('a blank sheet did not open with Ode to Joy on it');
    if (!/62 notes/.test(ed.starter.status) || !ed.starter.lock) fail('the starter tune does not read as 62 lockable notes: ' + ed.starter.status);
  }
  await page.screenshot({ path: `${OUT_DIR}/sheet_starter${SUF}.png` });
  const ed2 = await page.evaluate(async (ODE) => { // paste over it
    const ta = document.querySelector('.sh-text');
    ta.value = ODE; ta.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('.sh-status').innerText;
  }, ODE);
  if (!/26 notes/.test(ed2)) fail('editor status: ' + ed2);
  await page.screenshot({ path: `${OUT_DIR}/sheet_editor${SUF}.png` });
  const locked = await page.evaluate(async (idx) => {
    const { G } = window.VELSCOUR;
    const btn = (t) => [...document.querySelectorAll('.dialog-box .btn')].reverse().find((b) => b.textContent === t);
    btn('Lock').click(); await new Promise((r) => setTimeout(r, 100));
    btn('Lock').click(); await new Promise((r) => setTimeout(r, 100)); // the confirmation
    const it = G.char.bag[idx], dialogs = document.querySelectorAll('.dialog-box').length;
    // a second sheet: three notes in note names, locked straight away
    const j = G.char.bag.findIndex((b) => b && b.type === 'sheet' && !b.text);
    Object.assign(G.char.bag[j], { text: 'C5 D5 B4', title: 'Little Tune', inked: true });
    const { useSheet } = await import('/src/ui/sheets.js');
    const { toggleInventory } = await import('/src/ui/inventory.js');
    useSheet(idx); useSheet(j);
    toggleInventory();
    await new Promise((r) => setTimeout(r, 200));
    return { locked: it.inked, title: it.title, dialogs, tabs: G.char.tabs.map((t) => t && t.title), slots: document.querySelectorAll('.tslot').length, playing: document.querySelectorAll('.tslot.playing').length };
  }, ed.idx);
  if (!locked.locked || locked.title !== 'Ode to Joy' || locked.dialogs) fail('locking: ' + JSON.stringify(locked));
  if (locked.tabs[0] !== 'Ode to Joy' || locked.tabs[1] !== 'Little Tune' || locked.slots !== 5) fail('loading Tabs: ' + JSON.stringify(locked));
  await page.screenshot({ path: `${OUT_DIR}/sheet_tabs${SUF}.png` });

  // ------------------------------------------------------------ 3. the song as he fights
  const song = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    const { UI } = await import('/src/ui/ui.js'); UI.closeAll();
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    const { CLASS_SKILLS } = await import('/src/data/skills.js');
    const { readSheet } = await import('/src/data/tabs.js');
    const { playTabNext } = await import('/src/ui/sheets.js');
    G.godMode = true;
    game.buildDungeon(3, BIOME_BY_ID.catacombs);
    await new Promise((r) => setTimeout(r, 400));
    const p = G.player;
    for (const sk of CLASS_SKILLS.bard) G.char.skills[sk.id] = 1;
    G.char.level = 40; p.recompute();
    const settle = () => { if (p.score && p.score.play && !p.score.play.done) { p.score.play.flush(); G.world.hazards = G.world.hazards.filter((h) => h !== p.score.play); } };
    // every note-writing skill with beats, in a fixed shuffle: quarters, eighths, beamed groups, triplets, halves
    const pool = CLASS_SKILLS.bard.filter((s) => s.m && s.m.note && !['bass', 'treble'].includes(s.m.note) && !s.m.dacapo && !s.m.rubato);
    const out = { heard: [], tabsSeen: new Set() };
    let lastPlay = null;
    const seen = new Set();
    const take = () => { // every note as it is written (a Discord drops its bar, so read them here), then a new performance's landing
      const pl = p.score.play, fresh = pl && pl !== lastPlay;
      for (const n of [...(fresh ? pl.notes : []), ...p.score.notes]) if (!seen.has(n)) { seen.add(n); for (const h of n.heads) out.heard.push([h.midi, ...(h.ch || [])].join('+')); }
      if (fresh) { lastPlay = pl; if (pl.landEv) out.heard.push(pl.landEv.join('+')); }
    };
    for (let i = 0; i < 160; i++) {
      settle(); p.castLock = 0; p.cooldowns = {}; p.channel = null; p.mana = 99999; p.buffs = [];
      if (p.score.song) out.tabsSeen.add(p.score.song.name);
      p.tryUseSkill(pool[(i * 7) % pool.length], p.x + 3, p.y + 1);
      take();
    }
    // the order written: Ode (26 notes) then Little Tune (3), round and round
    const seq = [...readSheet(G.char.tabs[0].text).ev, ...readSheet(G.char.tabs[1].text).ev].map((e) => e.join('+'));
    const at = seq.indexOf(out.heard[0]);
    let inOrder = 0, k = 0;
    // songs hand over at bar ends, so a song may run a few notes round its own start first: count the longest run in order
    for (let i = 0; i < out.heard.length; i++) { if (out.heard[i] === seq[(at + k) % seq.length]) { inOrder++; k++; } else break; }
    const ode0 = readSheet(G.char.tabs[0].text).ev[0].join('+');
    // "Play next" on Tab 1 starts it from its first note
    settle(); p.score.notes.length = 0; p.score.beats = 0;
    playTabNext(0);
    p.castLock = 0; p.cooldowns = {}; p.mana = 99999;
    p.tryUseSkill(CLASS_SKILLS.bard.find((s) => s.name === 'Plucked Note'), p.x + 3, p.y);
    const restarted = p.score.notes[0] && p.score.notes[0].heads[0].midi + '' === ode0;
    // empty Tabs: back to the melodies at the next bar
    const tabs = G.char.tabs.slice();
    G.char.tabs.fill(null);
    settle(); p.score.notes.length = 0; p.score.beats = 0;
    const { bardRetune } = await import('/src/game/bard.js');
    bardRetune(p);
    const melodies = !p.score.song;
    G.char.tabs.splice(0, 5, ...tabs);
    bardRetune(p);
    return { heard: out.heard.length, inOrder, first: out.heard.slice(0, 12).join(' '), tabsSeen: [...out.tabsSeen], restarted, melodies, cad: p.score.cadences, dis: p.score.discords };
  });
  console.log('song: ' + JSON.stringify(song));
  if (song.heard < 60) fail('too few performed notes: ' + song.heard);
  if (song.inOrder < 26) fail(`the performed notes left the song's order after ${song.inOrder} notes`);
  if (!song.tabsSeen.includes('Ode to Joy') || !song.tabsSeen.includes('Little Tune')) fail('the song never handed over to the next Tab: ' + song.tabsSeen);
  if (!song.restarted) fail('"Play next" did not restart the Tab from its first note');
  if (!song.melodies) fail('empty Tabs did not go back to the melodies');
  // a performed bar from a sheet, with the song's name over it
  await page.evaluate(async () => {
    const { G } = window.VELSCOUR;
    const { CLASS_SKILLS } = await import('/src/data/skills.js');
    const p = G.player, pn = CLASS_SKILLS.bard.find((s) => s.name === 'Plucked Note');
    if (p.score.play && !p.score.play.done) p.score.play.flush();
    p.score.notes.length = 0; p.score.beats = 0; p.score.key = 'treble';
    for (let i = 0; i < 3; i++) { p.castLock = 0; p.cooldowns = {}; p.mana = 99999; p.tryUseSkill(pn, p.x + 3, p.y); }
    G.world.hazards = G.world.hazards.filter((h) => h !== p.score.play);
    p.castLock = 0; p.cooldowns = {}; p.tryUseSkill(pn, p.x + 3, p.y);
    for (let i = 0; i < 18; i++) window.VELSCOUR.game.update(1 / 60);
    await new Promise((r) => setTimeout(r, 150));
  });
  await page.screenshot({ path: `${OUT_DIR}/sheet_bar${SUF}.png` });

  // ------------------------------------------------------------ 4. saves, auto-play
  const sv = await page.evaluate(async (minutes) => {
    const { G, game } = window.VELSCOUR;
    const { migrate } = await import('/src/game/save.js');
    const copy = JSON.parse(JSON.stringify(G.char));
    const old = JSON.parse(JSON.stringify(G.char)); delete old.tabs; delete old.tabAt; migrate(old);
    migrate(copy);
    const { Auto } = await import('/src/game/autoplay.js');
    Auto.sellJunk();
    const kept = G.char.bag.filter((b) => b && b.type === 'sheet').length;
    Auto.toggle(true);
    let sim = 0;
    while (sim < minutes * 60) {
      for (let i = 0; i < 15; i++) { if (G.mode !== 'game' || !G.world) break; G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); sim += 1 / 30; }
      await new Promise((r) => setTimeout(r, 0));
    }
    Auto.toggle(false);
    return { saved: copy.tabs.map((t) => t && t.title), tabAt: copy.tabAt, oldTabs: old.tabs.length, oldAt: old.tabAt, kept, after: G.char.bag.filter((b) => b && b.type === 'sheet').length + G.char.tabs.filter(Boolean).length, cad: G.player.score && G.player.score.cadences, song: G.player.score && G.player.score.song && G.player.score.song.name };
  }, minutes);
  console.log('saves/auto-play: ' + JSON.stringify(sv));
  if (sv.saved[0] !== 'Ode to Joy' || sv.saved[1] !== 'Little Tune') fail('the save lost the Tabs');
  if (sv.oldTabs !== 5 || sv.oldAt !== 0) fail('an old save did not get five empty Tabs');
  if (sv.kept !== 3) fail(`auto-play sold sheets: ${sv.kept} of 3 left`);
  if (sv.after !== 5) fail(`sheets went missing during auto-play: ${sv.after} of 5`);
  if (!sv.song) fail('auto-play was not playing a sheet');

  report(errors);
  console.log(bad ? `${bad} FAILURES` : 'MUSIC SHEETS OK');
  if (bad) process.exitCode = 1;
  await browser.close();
})();
